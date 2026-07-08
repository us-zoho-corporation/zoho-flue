import {
	clampLimit,
	DEFAULT_LIST_LIMIT,
	MAX_LIST_LIMIT,
	decodeRunCursor,
	encodeRunCursor,
	type CreateRunInput,
	type EndRunInput,
	type ListRunsOpts,
	type ListRunsResponse,
	type RunRecord,
	type RunStore,
} from '@flue/runtime/adapter';
import type { CatalystNoSqlClient, Item } from '../nosql-client';

/** NoSQL table backing workflow-run records. */
export const RUNS_TABLE = 'FlueRuns';
/** All run items share one partition so listings can scan them; volume is low. */
const SCOPE = 'run';

/**
 * Serializes an arbitrary JSON value for storage as a NoSQL string attribute.
 * @param v - The value to serialize (may be undefined).
 * @returns The JSON string, or `undefined` when `v` is undefined (attribute omitted).
 */
function enc(v: unknown): string | undefined {
	return v === undefined ? undefined : JSON.stringify(v);
}

/**
 * Parses a stored JSON string attribute back to its value.
 * @param v - The stored attribute (string) or undefined.
 * @returns The parsed value, or `undefined` when absent/unparseable.
 */
function dec(v: Item[string] | undefined): unknown {
	if (typeof v !== 'string') return undefined;
	try { return JSON.parse(v); } catch { return undefined; }
}

/**
 * Maps a stored `FlueRuns` item to a full {@link RunRecord}.
 * @param item - The decoded NoSQL item.
 * @returns The reconstructed run record.
 */
function toRecord(item: Item): RunRecord {
	const rec: RunRecord = {
		runId: String(item.RunId),
		workflowName: String(item.WorkflowName),
		status: item.Status as RunRecord['status'],
		startedAt: String(item.StartedAt),
	};
	if (item.Input !== undefined) rec.input = dec(item.Input);
	if (item.TraceCarrier !== undefined) rec.traceCarrier = dec(item.TraceCarrier) as RunRecord['traceCarrier'];
	if (item.EndedAt !== undefined) rec.endedAt = String(item.EndedAt);
	if (item.IsError !== undefined) rec.isError = Boolean(item.IsError);
	if (item.DurationMs !== undefined) rec.durationMs = Number(item.DurationMs);
	if (item.Result !== undefined) rec.result = dec(item.Result);
	if (item.Error !== undefined) rec.error = dec(item.Error);
	return rec;
}

/**
 * Projects a run record to the listing pointer shape.
 * @param r - The run record.
 * @returns The `RunPointer` (omits the large input/result/error payloads).
 */
function toPointer(r: RunRecord): ListRunsResponse['runs'][number] {
	const p: ListRunsResponse['runs'][number] = {
		runId: r.runId,
		workflowName: r.workflowName,
		status: r.status,
		startedAt: r.startedAt,
	};
	if (r.endedAt !== undefined) p.endedAt = r.endedAt;
	if (r.durationMs !== undefined) p.durationMs = r.durationMs;
	if (r.isError !== undefined) p.isError = r.isError;
	return p;
}

/**
 * Flue {@link RunStore} backed by a single-partition NoSQL table. `createRun`
 * is idempotent first-writer-wins (a fetch-then-insert, safe under Flue's
 * single-owner model); `listRuns` scans the partition and sorts/filters/paginates
 * in memory (newest-first, opaque cursor).
 */
export class CatalystRunStore implements RunStore {
	/**
	 * Creates a store over the given NoSQL client.
	 * @param client - NoSQL REST client to read/write through.
	 */
	constructor(private readonly client: CatalystNoSqlClient) {}

	/**
	 * Persists a new `active` run record; a no-op if one already exists for `runId`.
	 * @param input - The run's identity, workflow, start time, and input payload.
	 * @throws {Error} If the read or insert fails.
	 */
	async createRun(input: CreateRunInput): Promise<void> {
		const existing = await this.client.getItem(RUNS_TABLE, { partition: SCOPE, sort: input.runId }, 'RunId');
		if (existing) return;
		await this.client.insertItem(RUNS_TABLE, {
			Scope: SCOPE,
			RunId: input.runId,
			WorkflowName: input.workflowName,
			Status: 'active',
			StartedAt: input.startedAt,
			Input: enc(input.input),
			TraceCarrier: enc(input.traceCarrier),
		});
	}

	/**
	 * Finalizes a run record with its terminal status. A no-op when no record exists.
	 * @param input - The run id, end time, error flag, duration, and result/error.
	 * @throws {Error} If the update fails.
	 */
	async endRun(input: EndRunInput): Promise<void> {
		await this.client.updateItem(RUNS_TABLE, { partition: SCOPE, sort: input.runId }, {
			Status: input.isError ? 'errored' : 'completed',
			EndedAt: input.endedAt,
			IsError: input.isError,
			DurationMs: input.durationMs,
			Result: enc(input.result),
			Error: enc(input.error),
		});
	}

	/**
	 * Fetches a full run record.
	 * @param runId - The run id.
	 * @returns The record, or `null` if unknown.
	 * @throws {Error} If the read fails.
	 */
	async getRun(runId: string): Promise<RunRecord | null> {
		const item = await this.client.getItem(RUNS_TABLE, { partition: SCOPE, sort: runId }, 'RunId');
		return item ? toRecord(item) : null;
	}

	/**
	 * Fetches the minimal ownership pointer for authorizing a run route.
	 * @param runId - The run id.
	 * @returns `{ runId, workflowName }`, or `null` if unknown.
	 * @throws {Error} If the read fails.
	 */
	async lookupRun(runId: string): Promise<{ runId: string; workflowName: string } | null> {
		const item = await this.client.getItem(RUNS_TABLE, { partition: SCOPE, sort: runId }, 'RunId');
		return item ? { runId: String(item.RunId), workflowName: String(item.WorkflowName) } : null;
	}

	/**
	 * Lists run pointers newest-first (`startedAt` desc, then `runId` desc),
	 * filtered by status/workflow and paginated by opaque cursor.
	 * @param opts - Optional status/workflow filters, limit, and cursor.
	 * @returns The page of pointers plus a `nextCursor` when more remain.
	 * @throws {Error} If the underlying query fails.
	 */
	async listRuns(opts: ListRunsOpts = {}): Promise<ListRunsResponse> {
		const all = (await this.client.queryPartition(RUNS_TABLE, SCOPE)).map(toRecord);
		let matched = all;
		if (opts.status) matched = matched.filter((r) => r.status === opts.status);
		if (opts.workflowName) matched = matched.filter((r) => r.workflowName === opts.workflowName);
		matched.sort((a, b) =>
			a.startedAt !== b.startedAt ? (a.startedAt < b.startedAt ? 1 : -1) : (a.runId < b.runId ? 1 : -1));

		const cursor = decodeRunCursor(opts.cursor);
		if (cursor) {
			matched = matched.filter((r) =>
				r.startedAt < cursor.startedAt || (r.startedAt === cursor.startedAt && r.runId < cursor.runId));
		}

		const limit = clampLimit(opts.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
		const page = matched.slice(0, limit);
		const response: ListRunsResponse = { runs: page.map(toPointer) };
		if (matched.length > limit && page.length > 0) {
			const last = page[page.length - 1];
			response.nextCursor = encodeRunCursor({ startedAt: last.startedAt, runId: last.runId });
		}
		return response;
	}
}
