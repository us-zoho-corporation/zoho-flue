import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The logged-in user's Zoho access token, propagated from the agent `route`
 * handler (which has the HTTP request + session cookie) down into the
 * provider stream (which does not receive a conversation id it could key a
 * lookup by — see `TurnContext` below for why the other per-turn values do
 * NOT use this same mechanism).
 */
interface UserTokenContext {
	userToken?: string;
}

const storage = new AsyncLocalStorage<UserTokenContext>();

/**
 * Runs `fn` with `ctx` active for all async continuations created within it.
 * @param ctx - The context to expose to `fn` and its async continuations.
 * @param fn - The function to run with `ctx` active.
 * @returns Whatever `fn` returns.
 */
export function runWithRequestContext<T>(ctx: UserTokenContext, fn: () => T): T {
	return storage.run(ctx, fn);
}

/**
 * The current request's logged-in user token, if any.
 * @returns The active `userToken`, or `undefined` outside a request context or when absent.
 */
export function currentUserToken(): string | undefined {
	return storage.getStore()?.userToken;
}

/**
 * Per-turn context `defineAgent`'s initializer needs: the user's connected MCP
 * tools, whether HITL confirmation is bypassed ("Auto mode"), and a fresh id
 * the mutation confirmation gate (`src/tools/mutation-gate.ts`) uses to detect
 * same-turn propose-then-execute attempts.
 */
export interface TurnContext {
	/** The logged-in user's connected MCP server tools, injected into the turn. */
	mcpTools?: unknown[];
	/**
	 * Whether HITL (human-in-the-loop) confirmation should be bypassed for this
	 * request (the chat's Settings "Auto mode" toggle, sent as the
	 * `x-hitl-auto-approve` header). Defaults to `false` (confirmation required)
	 * when absent.
	 */
	hitlAutoApprove?: boolean;
	/**
	 * A fresh id minted once per HTTP request by the agent `route` handler.
	 * Used by the mutation confirmation gate to detect same-turn propose-then-
	 * execute attempts.
	 */
	requestId?: string;
}

/**
 * Latest per-conversation turn context, keyed by conversation id instead of
 * AsyncLocalStorage.
 *
 * Why not ALS for these (unlike `userToken` above): Flue's own docs warn
 * `defineAgent`'s initializer "runs whenever a runner initializes a root
 * harness" and must not be assumed a one-time construct — in practice it can
 * be invoked more than once per turn, including from a lingering async
 * continuation of an EARLIER, already-completed request. That was observed
 * directly: an "Approve" turn's `defineAgent` invocation reading the
 * PREVIOUS turn's `requestId` via AsyncLocalStorage, because that stale
 * invocation's async continuation was still causally rooted in the earlier
 * request's `storage.run()` scope. Since the mutation id had been minted
 * under that same (now-stale-but-matching) requestId, the gate's same-turn
 * check always rejected it — permanently, no matter how many times the user
 * re-approved.
 *
 * A conversation-keyed map sidesteps this rather than chasing exactly which
 * Flue-internal continuation causes the extra invocation: whichever code path
 * reads it, a plain `Map.get(conversationId)` always returns the latest value
 * `route` synchronously recorded for that specific conversation — never a
 * leftover value from a different, completed request — because `route` runs
 * synchronously for every new prompt-submission request before Flue starts
 * any turn processing (correct or stray) for it.
 */
const turnContextByConversation = new Map<string, TurnContext>();

/**
 * Records this turn's context for a conversation, overwriting any previous
 * turn's snapshot. Called synchronously by the agent `route` handler before
 * `next()`, so it is guaranteed current by the time any turn-processing code
 * for this conversation runs afterward, regardless of which async
 * continuation that code happens to run in.
 * @param conversationId - The conversation this turn belongs to.
 * @param ctx - This turn's context.
 */
export function setTurnContext(conversationId: string, ctx: TurnContext): void {
	turnContextByConversation.set(conversationId, ctx);
}

/**
 * The latest recorded turn context for a conversation.
 * @param conversationId - The conversation to look up.
 * @returns The most recently recorded context, or `undefined` if none has been recorded yet
 * (e.g. a guest, or an invocation outside a real request such as `flue run` from the CLI).
 */
export function currentTurnContext(conversationId: string): TurnContext | undefined {
	return turnContextByConversation.get(conversationId);
}
