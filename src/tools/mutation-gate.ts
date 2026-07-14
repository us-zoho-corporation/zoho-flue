// Deterministic gate for mutating Zoho API calls (POST/PUT/PATCH/DELETE).
//
// Prompt instructions alone are not enough: a model can (and does) skip
// asking for confirmation, especially when it judges prior conversation
// context as implicit approval. This module makes confirmation a property of
// the CODE, not the model's compliance — `zoho_api` (see zoho-api.ts) refuses
// any mutating call without a `mutationId` that was minted by `propose_mutation`
// in an EARLIER turn (HTTP request). A model cannot propose-and-execute within
// one turn no matter what it decides, because the id it receives back is not
// yet valid — it only becomes valid once a new request (the user's next
// message) has actually arrived.
//
// In-memory, single-process — mirrors the service-account token cache
// (src/auth/zoho-auth.ts); doesn't need to survive a restart.

interface PendingMutation {
	id: string;
	summary: string;
	mintedInRequestId: string;
}

const pending = new Map<string, PendingMutation[]>();

/** HTTP methods that mutate data and must go through the confirmation gate. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Whether an HTTP method is a mutating one (POST, PUT, PATCH, or DELETE) and
 * therefore subject to the confirmation gate.
 * @param method - The HTTP method to check.
 * @returns `true` if `method` mutates data.
 */
export function isMutatingMethod(method: string): boolean {
	return MUTATING_METHODS.has(method);
}

/**
 * Registers a proposed mutation for a conversation, returning the id the model
 * must echo back (via `zoho_api`'s `mutationId` input) to actually perform it.
 * The id is not usable until a later request — see {@link consumeMutation}.
 * @param conversationId - The conversation this mutation was proposed in.
 * @param summary - Human-readable description of what will be created/changed/deleted.
 * @param requestId - The current request's id (from the request context), recorded
 * so a same-turn consume attempt can be rejected.
 * @returns The newly minted mutation id.
 */
export function proposeMutation(conversationId: string, summary: string, requestId: string): string {
	const id = crypto.randomUUID();
	const list = pending.get(conversationId) ?? [];
	list.push({ id, summary, mintedInRequestId: requestId });
	pending.set(conversationId, list);
	return id;
}

/**
 * Attempts to consume a pending mutation id, which only succeeds if it was
 * proposed in a request other than the current one — i.e. at least one full
 * turn (a real new user message triggering a new request) has passed since it
 * was proposed. One-time use: a consumed id is removed regardless of outcome
 * reuse attempts.
 * @param conversationId - The conversation the mutation id was proposed in.
 * @param mutationId - The id to consume, as supplied by the model.
 * @param requestId - The current request's id (from the request context).
 * @returns `true` if the id was valid and has now been consumed; `false` if it
 * is unknown or was proposed in this same request (in which case it is left
 * pending, so a later, legitimate attempt with the same id can still succeed).
 */
export function consumeMutation(conversationId: string, mutationId: string, requestId: string): boolean {
	const list = pending.get(conversationId);
	if (!list) return false;
	const idx = list.findIndex((m) => m.id === mutationId);
	if (idx === -1) return false;
	if (list[idx].mintedInRequestId === requestId) return false; // same turn — reject, but keep it pending
	list.splice(idx, 1); // different (later) turn — valid, one-time use
	return true;
}
