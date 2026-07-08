import {
	clampLimit,
	DEFAULT_READ_LIMIT,
	MAX_READ_LIMIT,
	formatOffset,
	parseOffset,
	StreamListenerRegistry,
	type EventStreamMeta,
	type EventStreamReadResult,
	type EventStreamStore,
} from '@flue/runtime/adapter';
import type { CatalystNoSqlClient, Item } from '../nosql-client';

/** NoSQL table holding one meta item per event stream (partition = Path). */
export const EVENT_STREAMS_TABLE = 'FlueEventStreams';
/** NoSQL table holding event items (partition = Path, sort = Seq). */
export const EVENTS_TABLE = 'FlueEvents';

interface StreamMeta {
	nextSeq: number;
	closed: boolean;
	onceKeys: Record<string, { offset: string; payload: string }>;
}

/**
 * Reads and normalizes a stream's meta item.
 * @param client - NoSQL client.
 * @param path - Stream path.
 * @returns The parsed meta, or `null` if the stream doesn't exist.
 */
async function readMeta(client: CatalystNoSqlClient, path: string): Promise<StreamMeta | null> {
	const item = await client.getItem(EVENT_STREAMS_TABLE, { partition: path });
	if (!item) return null;
	const once = item.OnceKeys;
	return {
		nextSeq: Number(item.NextSeq ?? 0),
		closed: Boolean(item.Closed),
		onceKeys: once && typeof once === 'object' ? (once as StreamMeta['onceKeys']) : {},
	};
}

/**
 * Flue {@link EventStreamStore} on NoSQL. Sequence numbers are allocated with an
 * optimistic compare-and-set on the stream's `NextSeq`, so concurrent appends
 * (including `appendEventOnce`) get distinct offsets; idempotency keys live in a
 * small map on the meta item. Offsets use Flue's `formatOffset` wire format.
 */
export class CatalystEventStreamStore implements EventStreamStore {
	private readonly listeners = new StreamListenerRegistry();

	/**
	 * Creates a store over the given NoSQL client.
	 * @param client - NoSQL REST client to read/write through.
	 */
	constructor(private readonly client: CatalystNoSqlClient) {}

	/**
	 * Creates a stream. Idempotent — preserves an existing stream's events/meta.
	 * @param path - Stream path.
	 * @throws {Error} If the read or insert fails.
	 */
	async createStream(path: string): Promise<void> {
		if (await readMeta(this.client, path)) return;
		await this.client.insertItem(EVENT_STREAMS_TABLE, { Path: path, NextSeq: 0, Closed: false, OnceKeys: {} });
	}

	/**
	 * Atomically allocates the next sequence number, writing extra meta attributes
	 * in the same compare-and-set. Retries until the CAS on `NextSeq` wins.
	 * @param path - Stream path.
	 * @param extra - Extra meta attributes to write alongside the increment.
	 * @returns The allocated sequence, or a missing/closed error.
	 * @throws {Error} If the underlying read/update fails.
	 */
	private async allocSeq(path: string, extra: (meta: StreamMeta) => Item = () => ({})): Promise<
		{ seq: number } | { error: 'missing' | 'closed' }
	> {
		for (;;) {
			const meta = await readMeta(this.client, path);
			if (!meta) return { error: 'missing' };
			if (meta.closed) return { error: 'closed' };
			const seq = meta.nextSeq;
			const won = await this.client.updateItem(
				EVENT_STREAMS_TABLE,
				{ partition: path },
				{ NextSeq: seq + 1, ...extra(meta) },
				{ condition: { attribute: ['NextSeq'], operator: 'equals', value: seq } },
			);
			if (won) return { seq };
		}
	}

	/**
	 * Appends a JSON event, returning its offset.
	 * @param path - Stream path.
	 * @param event - The JSON event payload.
	 * @returns The new offset.
	 * @throws {Error} If the stream does not exist or is closed.
	 */
	async appendEvent(path: string, event: unknown): Promise<string> {
		const res = await this.allocSeq(path);
		if ('error' in res) throw new Error(res.error === 'missing' ? `stream does not exist: ${path}` : `stream closed: ${path}`);
		await this.client.insertItem(EVENTS_TABLE, { Path: path, Seq: res.seq, Data: JSON.stringify(event) });
		this.listeners.notify(path);
		return formatOffset(res.seq);
	}

	/**
	 * Appends one event under an idempotency key. An exact retry returns the
	 * original offset; reusing the key with another payload rejects. The key is
	 * recorded in the meta item under the same CAS that allocates the sequence.
	 * @param path - Stream path.
	 * @param key - Idempotency key.
	 * @param event - The JSON event payload.
	 * @returns The offset (existing on retry, new otherwise).
	 * @throws {Error} If the stream does not exist, is closed, or the key was used
	 * with a conflicting payload.
	 */
	async appendEventOnce(path: string, key: string, event: unknown): Promise<string> {
		const payload = JSON.stringify(event);
		for (;;) {
			const meta = await readMeta(this.client, path);
			if (!meta) throw new Error(`stream does not exist: ${path}`);
			const prior = meta.onceKeys[key];
			if (prior) {
				if (prior.payload === payload) return prior.offset;
				throw new Error(`appendEventOnce conflicting payload for key ${key}`);
			}
			if (meta.closed) throw new Error(`stream closed: ${path}`);
			const seq = meta.nextSeq;
			const offset = formatOffset(seq);
			const won = await this.client.updateItem(
				EVENT_STREAMS_TABLE,
				{ partition: path },
				{ NextSeq: seq + 1, OnceKeys: { ...meta.onceKeys, [key]: { offset, payload } } },
				{ condition: { attribute: ['NextSeq'], operator: 'equals', value: seq } },
			);
			if (!won) continue;
			await this.client.insertItem(EVENTS_TABLE, { Path: path, Seq: seq, Data: payload });
			this.listeners.notify(path);
			return offset;
		}
	}

	/**
	 * Reads events strictly after `offset` (`"-1"` = start, `"now"` = tail).
	 * @param path - Stream path.
	 * @param opts - Optional `offset` and `limit`.
	 * @returns The page of events, resume cursor, tail/closed status.
	 * @throws {Error} If the underlying query fails.
	 */
	async readEvents(path: string, opts: { offset?: string; limit?: number } = {}): Promise<EventStreamReadResult> {
		const meta = await readMeta(this.client, path);
		if (!meta) return { events: [], nextOffset: '-1', upToDate: true, closed: false };

		const offset = opts.offset ?? '-1';
		if (offset === 'now') {
			const tail = meta.nextSeq === 0 ? '-1' : formatOffset(meta.nextSeq - 1);
			return { events: [], nextOffset: tail, upToDate: true, closed: meta.closed };
		}

		const limit = clampLimit(opts.limit, DEFAULT_READ_LIMIT, MAX_READ_LIMIT);
		const startSeq = offset === '-1' ? -1 : parseOffset(offset);
		const after = (await this.client.queryPartition(EVENTS_TABLE, path))
			.map((it) => ({ seq: Number(it.Seq), data: JSON.parse(String(it.Data)) as unknown }))
			.filter((e) => e.seq > startSeq)
			.sort((a, b) => a.seq - b.seq);
		const page = after.slice(0, limit);
		const events = page.map((e) => ({ data: e.data, offset: formatOffset(e.seq) }));
		const nextOffset = page.length > 0 ? formatOffset(page[page.length - 1].seq) : offset;
		return { events, nextOffset, upToDate: after.length <= limit, closed: meta.closed };
	}

	/**
	 * Closes a stream (no further appends). Idempotent.
	 * @param path - Stream path.
	 * @throws {Error} If the update fails.
	 */
	async closeStream(path: string): Promise<void> {
		await this.client.updateItem(EVENT_STREAMS_TABLE, { partition: path }, { Closed: true });
		this.listeners.notify(path);
	}

	/**
	 * Returns a stream's metadata, or `null` if it doesn't exist.
	 * @param path - Stream path.
	 * @returns The resume cursor and closed flag.
	 * @throws {Error} If the read fails.
	 */
	async getStreamMeta(path: string): Promise<EventStreamMeta | null> {
		const meta = await readMeta(this.client, path);
		if (!meta) return null;
		return { nextOffset: meta.nextSeq === 0 ? '-1' : formatOffset(meta.nextSeq - 1), closed: meta.closed };
	}

	/**
	 * Registers an in-process listener for appends/closes on a stream.
	 * @param path - Stream path.
	 * @param listener - Callback invoked on change.
	 * @returns An unsubscribe function.
	 */
	subscribe(path: string, listener: () => void): () => void {
		return this.listeners.subscribe(path, listener);
	}
}
