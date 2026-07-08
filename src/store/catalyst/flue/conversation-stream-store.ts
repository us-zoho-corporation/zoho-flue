import { randomUUID } from 'node:crypto';
import {
	formatOffset,
	parseOffset,
	StreamListenerRegistry,
	type AgentSubmissionStore,
	type ConversationProducerClaim,
	type ConversationRecord,
	type ConversationStreamIdentity,
	type ConversationStreamMeta,
	type ConversationStreamReadResult,
	type ConversationStreamStore,
} from '@flue/runtime/adapter';
import type { CatalystNoSqlClient, NoSqlCondition } from '../nosql-client';

/** NoSQL table holding one meta item per conversation stream (partition = Path). */
export const CONV_STREAMS_TABLE = 'FlueConvStreams';
/** NoSQL table holding canonical batches (partition = Path, sort = Seq). */
export const CONV_BATCHES_TABLE = 'FlueConvBatches';

/** Condition asserting the meta item does not yet exist (atomic create-if-absent). */
const IF_ABSENT: NoSqlCondition = { function: { function_name: 'attribute_not_exists', args: [{ attribute_path: ['Path'] }] } };

interface ConvMeta {
	agentName: string;
	instanceId: string;
	incarnation: string;
	producerId: string;
	producerEpoch: number;
	nextProducerSequence: number;
	nextOffsetSeq: number;
}

/**
 * Flue {@link ConversationStreamStore} on NoSQL. The per-instance canonical
 * stream is fenced by a producer epoch (bumped on `acquireProducer` via CAS on
 * the meta item); each `append` writes an entire record batch as one indivisible
 * item under one offset. Submission-owned appends are authorized against the
 * {@link AgentSubmissionStore} (running attempt, or the exact reserved settlement
 * while terminalizing).
 */
export class CatalystConversationStreamStore implements ConversationStreamStore {
	private readonly listeners = new StreamListenerRegistry();

	/**
	 * Creates a store over the given NoSQL client + submission store.
	 * @param client - NoSQL REST client to read/write through.
	 * @param submissions - Submission store consulted for append authorization.
	 */
	constructor(private readonly client: CatalystNoSqlClient, private readonly submissions: AgentSubmissionStore) {}

	/**
	 * Reads and normalizes a stream's meta item.
	 * @param path - Stream path.
	 * @returns The parsed meta, or `null` if the stream doesn't exist.
	 */
	private async readMeta(path: string): Promise<ConvMeta | null> {
		const item = await this.client.getItem(CONV_STREAMS_TABLE, { partition: path });
		if (!item) return null;
		return {
			agentName: String(item.AgentName),
			instanceId: String(item.InstanceId),
			incarnation: String(item.Incarnation),
			producerId: String(item.ProducerId ?? ''),
			producerEpoch: Number(item.ProducerEpoch ?? 0),
			nextProducerSequence: Number(item.NextProducerSequence ?? 0),
			nextOffsetSeq: Number(item.NextOffsetSeq ?? 0),
		};
	}

	/**
	 * Creates a stream. Idempotent for an identical identity; rejects a conflicting
	 * identity for the same path.
	 * @param path - Stream path.
	 * @param identity - Agent name + instance id bound to the stream.
	 * @throws {Error} If a different identity already owns the path.
	 */
	async createStream(path: string, identity: ConversationStreamIdentity): Promise<void> {
		const existing = await this.readMeta(path);
		if (existing) {
			if (existing.agentName === identity.agentName && existing.instanceId === identity.instanceId) return;
			throw new Error(`conversation stream ${path} already exists with a different identity`);
		}
		const inserted = await this.client.insertItem(CONV_STREAMS_TABLE, {
			Path: path,
			AgentName: identity.agentName,
			InstanceId: identity.instanceId,
			Incarnation: randomUUID(),
			ProducerId: '',
			ProducerEpoch: 0,
			NextProducerSequence: 0,
			NextOffsetSeq: 0,
		}, { condition: IF_ABSENT });
		if (inserted) return;
		// Lost a create race — the winner's identity decides success.
		const now = await this.readMeta(path);
		if (now && now.agentName === identity.agentName && now.instanceId === identity.instanceId) return;
		throw new Error(`conversation stream ${path} already exists with a different identity`);
	}

	/**
	 * Acquires (and fences) production rights, bumping the producer epoch via CAS.
	 * @param path - Stream path.
	 * @param producerId - The acquiring producer's id.
	 * @returns The producer claim (epoch, incarnation, next sequence, tail offset).
	 * @throws {Error} If the stream doesn't exist.
	 */
	async acquireProducer(path: string, producerId: string): Promise<ConversationProducerClaim> {
		for (;;) {
			const meta = await this.readMeta(path);
			if (!meta) throw new Error(`conversation stream ${path} does not exist`);
			const producerEpoch = meta.producerEpoch + 1;
			const won = await this.client.updateItem(
				CONV_STREAMS_TABLE, { partition: path }, { ProducerId: producerId, ProducerEpoch: producerEpoch },
				{ condition: { attribute: ['ProducerEpoch'], operator: 'equals', value: meta.producerEpoch } });
			if (!won) continue;
			return {
				producerId,
				producerEpoch,
				incarnation: meta.incarnation,
				nextProducerSequence: meta.nextProducerSequence,
				offset: meta.nextOffsetSeq === 0 ? '-1' : formatOffset(meta.nextOffsetSeq - 1),
			};
		}
	}

	/**
	 * Authorizes a submission-owned append against the submission store.
	 * @param submission - The `{ submissionId, attemptId }` claimed by the batch.
	 * @param records - The records being appended.
	 * @throws {Error} If the submission is unknown, the attempt is stale, or a
	 * terminalizing attempt appends anything but its exact reserved settlement.
	 */
	private async authorize(submission: { submissionId: string; attemptId: string }, records: readonly ConversationRecord[]): Promise<void> {
		const sub = await this.submissions.getSubmission(submission.submissionId);
		if (!sub) throw new Error(`append references unknown submission ${submission.submissionId}`);
		if (sub.attemptId !== submission.attemptId) throw new Error(`append from stale attempt for ${submission.submissionId}`);
		if (sub.status === 'running') return;
		if (sub.status === 'terminalizing') {
			const ob = (await this.submissions.listPendingSubmissionSettlements())
				.find((o) => o.submissionId === submission.submissionId);
			if (!ob) throw new Error(`no reserved settlement for terminalizing ${submission.submissionId}`);
			if (records.length !== 1 || JSON.stringify(records[0]) !== JSON.stringify(ob.record)) {
				throw new Error(`terminalizing append must be exactly the reserved settlement for ${submission.submissionId}`);
			}
			return;
		}
		throw new Error(`submission ${submission.submissionId} is not accepting appends (status ${sub.status})`);
	}

	/**
	 * Appends one indivisible batch of canonical records under a single offset.
	 * @param input - Producer claim fields, producer sequence, optional submission, and records.
	 * @returns The batch's offset.
	 * @throws {Error} On a stale producer, a producer-sequence gap, a conflicting
	 * retry, or a failed submission authorization.
	 */
	async append(input: {
		path: string;
		producerId: string;
		producerEpoch: number;
		incarnation: string;
		producerSequence: number;
		submission?: { submissionId: string; attemptId: string };
		records: readonly ConversationRecord[];
	}): Promise<{ offset: string }> {
		if (input.submission) await this.authorize(input.submission, input.records);
		const recordsJson = JSON.stringify(input.records);
		for (;;) {
			const meta = await this.readMeta(input.path);
			if (!meta) throw new Error(`conversation stream ${input.path} does not exist`);
			if (meta.producerId !== input.producerId || meta.producerEpoch !== input.producerEpoch || meta.incarnation !== input.incarnation) {
				throw new Error(`stale producer for ${input.path}`);
			}
			if (input.producerSequence < meta.nextProducerSequence) {
				const prior = (await this.client.queryPartition(CONV_BATCHES_TABLE, input.path))
					.find((b) => Number(b.ProducerSequence) === input.producerSequence);
				if (prior && String(prior.Records) === recordsJson) return { offset: formatOffset(Number(prior.Seq)) };
				throw new Error(`conflicting producer retry at sequence ${input.producerSequence}`);
			}
			if (input.producerSequence > meta.nextProducerSequence) throw new Error(`producer sequence gap for ${input.path}`);

			const seq = meta.nextOffsetSeq;
			const won = await this.client.updateItem(
				CONV_STREAMS_TABLE, { partition: input.path },
				{ NextProducerSequence: meta.nextProducerSequence + 1, NextOffsetSeq: seq + 1 },
				{ condition: { group_operator: 'and', group: [
					{ attribute: ['ProducerEpoch'], operator: 'equals', value: input.producerEpoch },
					{ attribute: ['NextProducerSequence'], operator: 'equals', value: input.producerSequence },
				] } });
			if (!won) continue;
			await this.client.insertItem(CONV_BATCHES_TABLE, {
				Path: input.path,
				Seq: seq,
				Records: recordsJson,
				ProducerSequence: input.producerSequence,
				...(input.submission ? { SubmissionId: input.submission.submissionId, AttemptId: input.submission.attemptId } : {}),
			});
			this.listeners.notify(input.path);
			return { offset: formatOffset(seq) };
		}
	}

	/**
	 * Reads batches strictly after `offset` (undefined/`"-1"` = from the beginning).
	 * @param path - Stream path.
	 * @param options - Optional `offset` and `limit`.
	 * @returns The batches, resume cursor, and whether the tail was reached.
	 * @throws {Error} If the underlying query fails.
	 */
	async read(path: string, options: { offset?: string; limit?: number } = {}): Promise<ConversationStreamReadResult> {
		const offset = options.offset ?? '-1';
		const startSeq = offset === '-1' ? -1 : parseOffset(offset);
		const limit = options.limit && options.limit > 0 ? options.limit : Number.MAX_SAFE_INTEGER;
		const after = (await this.client.queryPartition(CONV_BATCHES_TABLE, path))
			.map((b) => ({ seq: Number(b.Seq), records: JSON.parse(String(b.Records)) as ConversationRecord[] }))
			.filter((b) => b.seq > startSeq)
			.sort((a, b) => a.seq - b.seq);
		const page = after.slice(0, limit);
		const batches = page.map((b) => ({ offset: formatOffset(b.seq), records: b.records }));
		const nextOffset = page.length > 0 ? formatOffset(page[page.length - 1].seq) : offset;
		return { batches, nextOffset, upToDate: after.length <= limit };
	}

	/**
	 * Returns a stream's metadata, or `null` if it doesn't exist.
	 * @param path - Stream path.
	 * @returns The identity, incarnation, resume offset, and producer state.
	 * @throws {Error} If the read fails.
	 */
	async getMeta(path: string): Promise<ConversationStreamMeta | null> {
		const meta = await this.readMeta(path);
		if (!meta) return null;
		return {
			identity: { agentName: meta.agentName, instanceId: meta.instanceId },
			incarnation: meta.incarnation,
			nextOffset: meta.nextOffsetSeq === 0 ? '-1' : formatOffset(meta.nextOffsetSeq - 1),
			producerId: meta.producerId || null,
			producerEpoch: meta.producerEpoch,
			nextProducerSequence: meta.nextProducerSequence,
		};
	}

	/**
	 * Deletes a stream and all its batches (low-level whole-instance primitive).
	 * @param path - Stream path.
	 * @throws {Error} If a delete fails.
	 */
	async delete(path: string): Promise<void> {
		const batches = await this.client.queryPartition(CONV_BATCHES_TABLE, path);
		await Promise.all(batches.map((b) => this.client.deleteItem(CONV_BATCHES_TABLE, { partition: path, sort: Number(b.Seq) })));
		await this.client.deleteItem(CONV_STREAMS_TABLE, { partition: path });
	}

	/**
	 * Registers an in-process listener for appends on a stream.
	 * @param path - Stream path.
	 * @param listener - Callback invoked on change.
	 * @returns An unsubscribe function.
	 */
	subscribe(path: string, listener: () => void): () => void {
		return this.listeners.subscribe(path, listener);
	}
}
