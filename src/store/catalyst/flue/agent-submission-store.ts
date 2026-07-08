import {
	createDispatchAgentSubmissionInput,
	createSessionStorageKey,
	parseAcceptedAt,
	DURABILITY_DEFAULT_MAX_ATTEMPTS,
	DURABILITY_DEFAULT_TIMEOUT_MS,
	LEASE_DURATION_MS,
	SUBMISSION_HARNESS_NAME,
	SUBMISSION_SESSION_NAME,
	type AgentAttemptMarker,
	type AgentDispatchAdmission,
	type AgentExecutionStore,
	type AgentSubmission,
	type AgentSubmissionStore,
	type DirectAgentSubmissionInput,
	type DispatchInput,
	type SubmissionAttemptRef,
	type SubmissionClaimRef,
	type SubmissionDurability,
	type SubmissionSettledRecord,
	type SubmissionSettlementObligation,
} from '@flue/runtime/adapter';
import type { CatalystNoSqlClient, Item, NoSqlCondition } from '../nosql-client';

/** NoSQL table backing submissions, attempt markers, and the sequence counter. */
export const SUBMISSIONS_TABLE = 'FlueSubmissions';
const SUB = 'sub';
const MARKER = 'marker';
const SEQ = 'seq';

/**
 * Builds an `equals` condition on a submission attribute.
 * @param attr - Attribute name.
 * @param value - Expected value.
 * @returns The condition.
 */
function eq(attr: string, value: unknown): NoSqlCondition {
	return { attribute: [attr], operator: 'equals', value };
}

/**
 * Combines conditions with logical AND.
 * @param conds - Conditions to combine.
 * @returns The grouped condition.
 */
function and(...conds: NoSqlCondition[]): NoSqlCondition {
	return { group_operator: 'and', group: conds };
}

/**
 * Whether a numeric "set-once" attribute holds a real (positive) value.
 * @param v - The decoded attribute value.
 * @returns `true` if it's a positive number.
 */
function numSet(v: Item[string] | undefined): boolean {
	return typeof v === 'number' && v > 0;
}

/**
 * Reconstructs an {@link AgentSubmission} from a stored submission item. Cleared
 * fields (empty string / 0) are omitted so the shape matches the interface.
 * @param item - The decoded NoSQL item.
 * @returns The submission.
 */
function toSubmission(item: Item): AgentSubmission {
	return {
		sequence: Number(item.Sequence),
		submissionId: String(item.Id),
		sessionKey: String(item.SessionKey),
		kind: item.Kind as 'dispatch' | 'direct',
		input: JSON.parse(String(item.Input)),
		status: item.Status as AgentSubmission['status'],
		acceptedAt: Number(item.AcceptedAt),
		canonicalReadyAt: typeof item.CanonicalReadyAt === 'number' ? item.CanonicalReadyAt : null,
		attemptCount: Number(item.AttemptCount ?? 0),
		maxRetry: Number(item.MaxRetry ?? 0),
		timeoutAt: Number(item.TimeoutAt ?? 0),
		leaseExpiresAt: Number(item.LeaseExpiresAt ?? 0),
		...(item.AttemptId ? { attemptId: String(item.AttemptId) } : {}),
		...(item.OwnerId ? { ownerId: String(item.OwnerId) } : {}),
		...(numSet(item.InputAppliedAt) ? { inputAppliedAt: Number(item.InputAppliedAt) } : {}),
		...(numSet(item.RecoveryRequestedAt) ? { recoveryRequestedAt: Number(item.RecoveryRequestedAt) } : {}),
		...(numSet(item.AbortRequestedAt) ? { abortRequestedAt: Number(item.AbortRequestedAt) } : {}),
		...(numSet(item.StartedAt) ? { startedAt: Number(item.StartedAt) } : {}),
		...(item.Error ? { error: String(item.Error) } : {}),
	};
}

/**
 * Flue {@link AgentSubmissionStore} backed by NoSQL. All submissions live under
 * one partition (`Scope="sub"`) so cross-session listings scan them and filter
 * in memory; state transitions use NoSQL conditional updates as compare-and-set
 * so a replaced coordinator can't win a stale transition. Attempt markers and a
 * monotonic sequence counter share the table under distinct scopes.
 */
export class CatalystAgentSubmissionStore implements AgentSubmissionStore {
	/**
	 * Creates a store over the given NoSQL client.
	 * @param client - NoSQL REST client to read/write through.
	 */
	constructor(private readonly client: CatalystNoSqlClient) {}

	/**
	 * Reads a raw submission item.
	 * @param submissionId - Submission id.
	 * @returns The item, or `null` if unknown.
	 */
	private read(submissionId: string): Promise<Item | null> {
		return this.client.getItem(SUBMISSIONS_TABLE, { partition: SUB, sort: submissionId }, 'Id');
	}

	/**
	 * Reads all submission items (across sessions).
	 * @returns Every submission item.
	 */
	private all(): Promise<Item[]> {
		return this.client.queryPartition(SUBMISSIONS_TABLE, SUB);
	}

	/**
	 * Allocates the next monotonic admission sequence via a CAS-guarded counter.
	 * @returns The allocated sequence number.
	 * @throws {Error} If the counter read/update fails.
	 */
	private async nextSequence(): Promise<number> {
		for (;;) {
			const c = await this.client.getItem(SUBMISSIONS_TABLE, { partition: SEQ, sort: SEQ }, 'Id');
			if (!c) {
				await this.client.insertItem(SUBMISSIONS_TABLE, { Scope: SEQ, Id: SEQ, Next: 1 });
				return 0;
			}
			const n = Number(c.Next);
			const won = await this.client.updateItem(
				SUBMISSIONS_TABLE, { partition: SEQ, sort: SEQ }, { Next: n + 1 }, { condition: eq('Next', n) });
			if (won) return n;
		}
	}

	/**
	 * Updates a submission guarded by a compare-and-set condition.
	 * @param submissionId - Submission id.
	 * @param changes - Attributes to write.
	 * @param condition - CAS guard that must hold.
	 * @returns Whether the update was applied.
	 */
	private guardedUpdate(submissionId: string, changes: Item, condition: NoSqlCondition): Promise<boolean> {
		return this.client.updateItem(SUBMISSIONS_TABLE, { partition: SUB, sort: submissionId }, changes, { condition });
	}

	/**
	 * Returns a submission by id.
	 * @param submissionId - Submission id.
	 * @returns The submission, or `null` if the id is unknown.
	 * @throws {Error} If the underlying read fails.
	 */
	async getSubmission(submissionId: string): Promise<AgentSubmission | null> {
		const item = await this.read(submissionId);
		return item ? toSubmission(item) : null;
	}

	/**
	 * Reports whether any submission is still queued or running.
	 * @returns `true` while any submission is unsettled.
	 * @throws {Error} If the underlying query fails.
	 */
	async hasUnsettledSubmissions(): Promise<boolean> {
		return (await this.all()).some((i) => i.Status !== 'settled');
	}

	/**
	 * Idempotently admits a dispatch as a queued submission (keyed by dispatch id).
	 * An exact replay returns the existing admission; a reused id with a different
	 * payload returns a conflict.
	 * @param input - The dispatch input.
	 * @returns The admission — an existing/new submission, or a conflict.
	 * @throws {Error} If a store read/write fails.
	 */
	async admitDispatch(input: DispatchInput): Promise<AgentDispatchAdmission> {
		const submissionInput = createDispatchAgentSubmissionInput(input);
		const id = submissionInput.submissionId;
		const inputJson = JSON.stringify(submissionInput);
		const existing = await this.read(id);
		if (existing) {
			return String(existing.Input) === inputJson
				? { kind: 'submission', submission: toSubmission(existing) }
				: { kind: 'conflict' };
		}
		const sequence = await this.nextSequence();
		const row = this.newRow(id, sequence, input.id, 'dispatch', inputJson, parseAcceptedAt(input.acceptedAt, 'acceptedAt'));
		await this.client.insertItem(SUBMISSIONS_TABLE, row);
		return { kind: 'submission', submission: toSubmission(row) };
	}

	/**
	 * Admits a direct prompt as a queued submission. Idempotent for an exact replay
	 * of the same submission id and payload.
	 * @param input - The direct submission input.
	 * @returns The admitted (or already-existing) submission.
	 * @throws {Error} If the id is replayed with a different payload, or a store read/write fails.
	 */
	async admitDirect(input: DirectAgentSubmissionInput): Promise<AgentSubmission> {
		const inputJson = JSON.stringify(input);
		const existing = await this.read(input.submissionId);
		if (existing) {
			if (String(existing.Input) === inputJson) return toSubmission(existing);
			throw new Error(`admitDirect replay produced an unexpected result for ${input.submissionId}`);
		}
		const sequence = await this.nextSequence();
		const row = this.newRow(
			input.submissionId, sequence, input.id, 'direct', inputJson, parseAcceptedAt(input.acceptedAt, 'acceptedAt'));
		await this.client.insertItem(SUBMISSIONS_TABLE, row);
		return toSubmission(row);
	}

	/**
	 * Builds a fresh queued submission row.
	 * @param id - Submission id.
	 * @param sequence - Admission sequence.
	 * @param instanceId - Agent instance id (used to derive the session key).
	 * @param kind - `'dispatch'` or `'direct'`.
	 * @param inputJson - JSON-serialized submission input.
	 * @param acceptedAt - Admission timestamp (epoch ms).
	 * @returns The row payload.
	 */
	private newRow(id: string, sequence: number, instanceId: string, kind: 'dispatch' | 'direct', inputJson: string, acceptedAt: number): Item {
		return {
			Scope: SUB,
			Id: id,
			Sequence: sequence,
			SessionKey: createSessionStorageKey(instanceId, SUBMISSION_HARNESS_NAME, SUBMISSION_SESSION_NAME),
			Kind: kind,
			Input: inputJson,
			Status: 'queued',
			AcceptedAt: acceptedAt,
			CanonicalReadyAt: null,
			AttemptCount: 0,
			MaxRetry: DURABILITY_DEFAULT_MAX_ATTEMPTS,
			TimeoutAt: 0,
			LeaseExpiresAt: 0,
		};
	}

	/**
	 * Marks a queued submission's canonical conversation as materialized (once).
	 * @param submissionId - Submission id.
	 * @returns The updated submission, or `null` if it's missing or no longer queued.
	 * @throws {Error} If a store read/write fails.
	 */
	async markSubmissionCanonicalReady(submissionId: string): Promise<AgentSubmission | null> {
		const item = await this.read(submissionId);
		if (!item || item.Status !== 'queued') return null;
		if (numSet(item.CanonicalReadyAt)) return toSubmission(item);
		const readyAt = Date.now();
		await this.guardedUpdate(submissionId, { CanonicalReadyAt: readyAt }, eq('Status', 'queued'));
		return toSubmission({ ...item, CanonicalReadyAt: readyAt });
	}

	/**
	 * Groups submissions by session and returns each session's unsettled members
	 * sorted by admission sequence.
	 * @param all - All submission items.
	 * @returns Map of sessionKey -> unsettled submissions (sequence-ascending).
	 */
	private unsettledBySession(all: Item[]): Map<string, Item[]> {
		const bySession = new Map<string, Item[]>();
		for (const it of all) {
			if (it.Status === 'settled') continue;
			const key = String(it.SessionKey);
			let list = bySession.get(key);
			if (!list) { list = []; bySession.set(key, list); }
			list.push(it);
		}
		for (const list of bySession.values()) list.sort((a, b) => Number(a.Sequence) - Number(b.Sequence));
		return bySession;
	}

	/**
	 * Lists each session's oldest unsettled submission when that head is queued and
	 * canonically ready, in admission order.
	 * @returns The runnable session heads.
	 * @throws {Error} If the underlying query fails.
	 */
	async listRunnableSubmissions(): Promise<AgentSubmission[]> {
		const heads: Item[] = [];
		for (const list of this.unsettledBySession(await this.all()).values()) {
			const head = list[0];
			if (head && head.Status === 'queued' && numSet(head.CanonicalReadyAt)) heads.push(head);
		}
		return heads.sort((a, b) => Number(a.Sequence) - Number(b.Sequence)).map(toSubmission);
	}

	/**
	 * Lists all queued submissions without canonical readiness, in admission order.
	 * @returns The unready queued submissions.
	 * @throws {Error} If the underlying query fails.
	 */
	async listUnreadySubmissions(): Promise<AgentSubmission[]> {
		return (await this.all())
			.filter((i) => i.Status === 'queued' && !numSet(i.CanonicalReadyAt))
			.sort((a, b) => Number(a.Sequence) - Number(b.Sequence))
			.map(toSubmission);
	}

	/**
	 * Lists all running submissions, in admission order.
	 * @returns The running submissions.
	 * @throws {Error} If the underlying query fails.
	 */
	async listRunningSubmissions(): Promise<AgentSubmission[]> {
		return (await this.all())
			.filter((i) => i.Status === 'running')
			.sort((a, b) => Number(a.Sequence) - Number(b.Sequence))
			.map(toSubmission);
	}

	/**
	 * Lists reserved-but-not-yet-finalized direct settlement obligations, in admission order.
	 * @returns The pending settlement obligations.
	 * @throws {Error} If the underlying query fails.
	 */
	async listPendingSubmissionSettlements(): Promise<SubmissionSettlementObligation[]> {
		return (await this.all())
			.filter((i) => i.Status === 'terminalizing' && i.SettlementRecordId)
			.sort((a, b) => Number(a.Sequence) - Number(b.Sequence))
			.map((i) => this.toObligation(i));
	}

	/**
	 * Builds a settlement obligation from a terminalizing submission item.
	 * @param item - The submission item.
	 * @returns The obligation.
	 */
	private toObligation(item: Item): SubmissionSettlementObligation {
		return {
			submissionId: String(item.Id),
			sessionKey: String(item.SessionKey),
			attemptId: String(item.AttemptId),
			recordId: String(item.SettlementRecordId),
			record: JSON.parse(String(item.SettlementRecord)) as SubmissionSettledRecord,
		};
	}

	/**
	 * Atomically transitions a submission from queued to running, but only when it
	 * is the canonically-ready runnable head of its session — recording the attempt,
	 * owner, lease, and start time, incrementing the attempt count, and initializing
	 * the timeout when unset. Two concurrent claims never both succeed.
	 * @param claim - The submission id, attempt id, owner, and lease expiry.
	 * @returns The claimed submission, or `null` if any condition fails.
	 * @throws {Error} If a store read/write fails.
	 */
	async claimSubmission(claim: SubmissionClaimRef): Promise<AgentSubmission | null> {
		const all = await this.all();
		const item = all.find((i) => String(i.Id) === claim.submissionId);
		if (!item || item.Status !== 'queued' || !numSet(item.CanonicalReadyAt)) return null;
		const head = this.unsettledBySession(all).get(String(item.SessionKey))?.[0];
		if (!head || String(head.Id) !== claim.submissionId) return null; // not the session's runnable head

		const timeoutAt = numSet(item.TimeoutAt) ? Number(item.TimeoutAt) : Date.now() + DURABILITY_DEFAULT_TIMEOUT_MS;
		const changes: Item = {
			Status: 'running',
			AttemptId: claim.attemptId,
			OwnerId: claim.ownerId,
			LeaseExpiresAt: claim.leaseExpiresAt,
			StartedAt: Date.now(),
			AttemptCount: Number(item.AttemptCount ?? 0) + 1,
			MaxRetry: DURABILITY_DEFAULT_MAX_ATTEMPTS,
			TimeoutAt: timeoutAt,
		};
		const won = await this.guardedUpdate(claim.submissionId, changes, eq('Status', 'queued'));
		return won ? toSubmission({ ...item, ...changes }) : null;
	}

	/**
	 * Records once that the submission's input was canonically applied, installing
	 * the supplied durability (or defaults) on first application. Gated on a running
	 * submission owned by `attempt`.
	 * @param attempt - The owning attempt.
	 * @param durability - Optional max-retry/timeout to install on first application.
	 * @returns `true` if recorded; `false` if the attempt is stale or not running.
	 * @throws {Error} If a store read/write fails.
	 */
	async markSubmissionInputApplied(attempt: SubmissionAttemptRef, durability?: SubmissionDurability): Promise<boolean> {
		const item = await this.read(attempt.submissionId);
		if (!item || item.Status !== 'running' || String(item.AttemptId) !== attempt.attemptId) return false;
		const changes: Item = { InputAppliedAt: numSet(item.InputAppliedAt) ? Number(item.InputAppliedAt) : Date.now() };
		if (durability && !numSet(item.InputAppliedAt)) {
			changes.MaxRetry = durability.maxRetry;
			changes.TimeoutAt = durability.timeoutAt;
		}
		return this.guardedUpdate(attempt.submissionId, changes, and(eq('Status', 'running'), eq('AttemptId', attempt.attemptId)));
	}

	/**
	 * Stamps `recoveryRequestedAt` once. Gated on a running submission owned by `attempt`.
	 * @param attempt - The owning attempt.
	 * @returns `true` if stamped (or already stamped); `false` if stale or not running.
	 * @throws {Error} If a store read/write fails.
	 */
	async requestSubmissionRecovery(attempt: SubmissionAttemptRef): Promise<boolean> {
		const item = await this.read(attempt.submissionId);
		if (!item || item.Status !== 'running' || String(item.AttemptId) !== attempt.attemptId) return false;
		if (numSet(item.RecoveryRequestedAt)) return true;
		return this.guardedUpdate(
			attempt.submissionId, { RecoveryRequestedAt: Date.now() },
			and(eq('Status', 'running'), eq('AttemptId', attempt.attemptId)));
	}

	/**
	 * Stamps `abortRequestedAt` (first request wins) on every queued or running
	 * submission in the session, without changing status, and returns their ids.
	 * @param sessionKey - The session whose unsettled submissions to flag.
	 * @returns The ids of the flagged submissions (empty if none are unsettled).
	 * @throws {Error} If a store read/write fails.
	 */
	async requestSessionAbort(sessionKey: string): Promise<string[]> {
		const now = Date.now();
		const affected: string[] = [];
		for (const item of await this.all()) {
			if (String(item.SessionKey) !== sessionKey) continue;
			if (item.Status !== 'queued' && item.Status !== 'running') continue;
			affected.push(String(item.Id));
			if (!numSet(item.AbortRequestedAt)) {
				await this.client.updateItem(SUBMISSIONS_TABLE, { partition: SUB, sort: String(item.Id) }, { AbortRequestedAt: now });
			}
		}
		return affected;
	}

	/**
	 * Returns a running submission to queued — clearing its attempt, owner, and
	 * lease — only while input has not been applied and `attempt` owns it.
	 * @param attempt - The owning attempt.
	 * @returns `true` if requeued; `false` otherwise.
	 * @throws {Error} If a store read/write fails.
	 */
	async requeueSubmissionBeforeInputApplied(attempt: SubmissionAttemptRef): Promise<boolean> {
		const item = await this.read(attempt.submissionId);
		if (!item || item.Status !== 'running' || String(item.AttemptId) !== attempt.attemptId || numSet(item.InputAppliedAt)) {
			return false;
		}
		return this.guardedUpdate(
			attempt.submissionId,
			{ Status: 'queued', AttemptId: '', OwnerId: '', LeaseExpiresAt: 0 },
			and(eq('Status', 'running'), eq('AttemptId', attempt.attemptId)));
	}

	/**
	 * Atomically reserves the exact canonical settlement for an owning direct
	 * attempt, transitioning it from running to terminalizing. Exact retries return
	 * the existing obligation; a conflicting record id/payload returns `null`.
	 * @param attempt - The owning attempt.
	 * @param settlement - The settlement record id and record to reserve.
	 * @returns The reserved obligation, or `null` when not eligible/conflicting.
	 * @throws {Error} If a store read/write fails.
	 */
	async reserveSubmissionSettlement(
		attempt: SubmissionAttemptRef,
		settlement: { recordId: string; record: SubmissionSettledRecord },
	): Promise<SubmissionSettlementObligation | null> {
		const item = await this.read(attempt.submissionId);
		if (!item || item.Kind !== 'direct' || String(item.AttemptId) !== attempt.attemptId) return null;
		const recordJson = JSON.stringify(settlement.record);
		if (item.Status === 'terminalizing') {
			return String(item.SettlementRecordId) === settlement.recordId && String(item.SettlementRecord) === recordJson
				? this.toObligation(item)
				: null;
		}
		if (item.Status !== 'running') return null;
		const changes: Item = { Status: 'terminalizing', SettlementRecordId: settlement.recordId, SettlementRecord: recordJson };
		const won = await this.guardedUpdate(
			attempt.submissionId, changes, and(eq('Status', 'running'), eq('AttemptId', attempt.attemptId)));
		return won ? this.toObligation({ ...item, ...changes }) : null;
	}

	/**
	 * Finalizes an owned terminalizing submission (to settled) after its canonical
	 * record exists.
	 * @param attempt - The owning attempt.
	 * @param recordId - The reserved settlement record id.
	 * @returns `true` if finalized; `false` if stale or not terminalizing.
	 * @throws {Error} If a store read/write fails.
	 */
	async finalizeSubmissionSettlement(attempt: SubmissionAttemptRef, recordId: string): Promise<boolean> {
		const item = await this.read(attempt.submissionId);
		if (!item || item.Status !== 'terminalizing' || String(item.AttemptId) !== attempt.attemptId || String(item.SettlementRecordId) !== recordId) {
			return false;
		}
		return this.guardedUpdate(
			attempt.submissionId, { Status: 'settled' },
			and(eq('Status', 'terminalizing'), eq('AttemptId', attempt.attemptId)));
	}

	/**
	 * Settles a running submission owned by `attempt` successfully (first terminal wins).
	 * @param attempt - The owning attempt.
	 * @returns `true` if settled; `false` if stale or already settled.
	 * @throws {Error} If a store read/write fails.
	 */
	async completeSubmission(attempt: SubmissionAttemptRef): Promise<boolean> {
		return this.settle(attempt, {});
	}

	/**
	 * Settles a running submission owned by `attempt` with an error (first terminal wins).
	 * @param attempt - The owning attempt.
	 * @param error - The failure cause; its message is stored.
	 * @returns `true` if settled; `false` if stale or already settled.
	 * @throws {Error} If a store read/write fails.
	 */
	async failSubmission(attempt: SubmissionAttemptRef, error: unknown): Promise<boolean> {
		const message = error instanceof Error ? error.message : String(error);
		return this.settle(attempt, { Error: message });
	}

	/**
	 * Settles a running submission owned by `attempt` (first terminal state wins).
	 * @param attempt - The owning attempt.
	 * @param extra - Extra attributes to write (e.g. an error message).
	 * @returns Whether the settlement was applied.
	 */
	private async settle(attempt: SubmissionAttemptRef, extra: Item): Promise<boolean> {
		const item = await this.read(attempt.submissionId);
		if (!item || item.Status !== 'running' || String(item.AttemptId) !== attempt.attemptId) return false;
		return this.guardedUpdate(
			attempt.submissionId, { Status: 'settled', ...extra },
			and(eq('Status', 'running'), eq('AttemptId', attempt.attemptId)));
	}

	/**
	 * Recovery handoff: atomically moves a running submission from `attempt` to
	 * `nextAttemptId`, increments the attempt count, clears any recovery request,
	 * and installs the new lease when given.
	 * @param attempt - The currently-owning attempt.
	 * @param nextAttemptId - The replacement attempt id.
	 * @param lease - Optional new owner + lease expiry to install.
	 * @returns The updated submission, or `null` (without writing) if not running under `attempt`.
	 * @throws {Error} If a store read/write fails.
	 */
	async replaceSubmissionAttempt(
		attempt: SubmissionAttemptRef,
		nextAttemptId: string,
		lease?: { ownerId: string; leaseExpiresAt: number },
	): Promise<AgentSubmission | null> {
		const item = await this.read(attempt.submissionId);
		if (!item || item.Status !== 'running' || String(item.AttemptId) !== attempt.attemptId) return null;
		const changes: Item = {
			AttemptId: nextAttemptId,
			AttemptCount: Number(item.AttemptCount ?? 0) + 1,
			RecoveryRequestedAt: 0,
		};
		if (lease) { changes.OwnerId = lease.ownerId; changes.LeaseExpiresAt = lease.leaseExpiresAt; }
		const won = await this.guardedUpdate(
			attempt.submissionId, changes, and(eq('Status', 'running'), eq('AttemptId', attempt.attemptId)));
		return won ? toSubmission({ ...item, ...changes }) : null;
	}

	/**
	 * Durably records that an attempt started. Idempotent — re-inserting the same
	 * (submission, attempt) keeps the original `createdAt`.
	 * @param attempt - The attempt to mark.
	 * @throws {Error} If a store read/write fails.
	 */
	async insertAttemptMarker(attempt: SubmissionAttemptRef): Promise<void> {
		const id = `${attempt.submissionId} ${attempt.attemptId}`;
		const existing = await this.client.getItem(SUBMISSIONS_TABLE, { partition: MARKER, sort: id }, 'Id');
		if (existing) return;
		await this.client.insertItem(SUBMISSIONS_TABLE, {
			Scope: MARKER, Id: id, SubmissionId: attempt.submissionId, AttemptId: attempt.attemptId, CreatedAt: Date.now(),
		});
	}

	/**
	 * Deletes the marker matching both ids exactly. A no-op when absent.
	 * @param attempt - The attempt whose marker to delete.
	 * @throws {Error} If the delete fails.
	 */
	async deleteAttemptMarker(attempt: SubmissionAttemptRef): Promise<void> {
		await this.client.deleteItem(SUBMISSIONS_TABLE, { partition: MARKER, sort: `${attempt.submissionId} ${attempt.attemptId}` });
	}

	/**
	 * Lists all attempt markers.
	 * @returns Every attempt marker with its creation timestamp.
	 * @throws {Error} If the underlying query fails.
	 */
	async listAttemptMarkers(): Promise<AgentAttemptMarker[]> {
		return (await this.client.queryPartition(SUBMISSIONS_TABLE, MARKER)).map((i) => ({
			submissionId: String(i.SubmissionId),
			attemptId: String(i.AttemptId),
			createdAt: Number(i.CreatedAt),
		}));
	}

	/**
	 * Extends the lease expiry for each listed submission that is running and owned
	 * by `ownerId`; others are silently skipped.
	 * @param ownerId - The coordinator that must own the submissions.
	 * @param submissionIds - The submissions to renew.
	 * @throws {Error} If a store read/write fails.
	 */
	async renewLeases(ownerId: string, submissionIds: string[]): Promise<void> {
		await Promise.all(submissionIds.map(async (id) => {
			const item = await this.read(id);
			if (item && item.Status === 'running' && String(item.OwnerId) === ownerId) {
				await this.guardedUpdate(
					id, { LeaseExpiresAt: Date.now() + LEASE_DURATION_MS },
					and(eq('Status', 'running'), eq('OwnerId', ownerId)));
			}
		}));
	}

	/**
	 * Lists running submissions whose lease has expired (a positive expiry in the past).
	 * @returns The expired running submissions, in admission order.
	 * @throws {Error} If the underlying query fails.
	 */
	async listExpiredSubmissions(): Promise<AgentSubmission[]> {
		const now = Date.now();
		return (await this.all())
			.filter((i) => i.Status === 'running' && numSet(i.LeaseExpiresAt) && Number(i.LeaseExpiresAt) < now)
			.sort((a, b) => Number(a.Sequence) - Number(b.Sequence))
			.map(toSubmission);
	}
}

/**
 * Flue {@link AgentExecutionStore} exposing the submission store.
 */
export class CatalystAgentExecutionStore implements AgentExecutionStore {
	readonly submissions: CatalystAgentSubmissionStore;

	/**
	 * Creates the execution store over the given NoSQL client.
	 * @param client - NoSQL REST client to read/write through.
	 */
	constructor(client: CatalystNoSqlClient) {
		this.submissions = new CatalystAgentSubmissionStore(client);
	}
}
