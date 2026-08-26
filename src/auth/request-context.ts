/**
 * Per-turn context `Assistant`'s render needs: the user's connected MCP
 * tools, whether HITL confirmation is bypassed ("Auto mode"), and a fresh id
 * the mutation confirmation gate (`src/tools/mutation-gate.ts`) uses to detect
 * same-turn propose-then-execute attempts.
 */
export interface TurnContext {
	/** The logged-in user's id, so per-turn tools (e.g. `zoho_api`) can check their own connection/scopes. */
	userId?: string;
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
	 * A fresh id minted once per HTTP request by `assistantMiddleware`. Used by
	 * the mutation confirmation gate to detect same-turn propose-then-execute
	 * attempts.
	 */
	requestId?: string;
}

/**
 * Latest per-conversation turn context, keyed by conversation id instead of
 * AsyncLocalStorage.
 *
 * Why not ALS for these: Flue's agent function re-renders before every model
 * turn, and in practice a render can be invoked more than once per turn,
 * including from a lingering async continuation of an EARLIER, already-
 * completed request. That was observed directly: an "Approve" turn's render
 * reading the PREVIOUS turn's `requestId` via AsyncLocalStorage, because that
 * stale invocation's async continuation was still causally rooted in the
 * earlier request's `storage.run()` scope. Since the mutation id had been
 * minted under that same (now-stale-but-matching) requestId, the gate's
 * same-turn check always rejected it — permanently, no matter how many times
 * the user re-approved.
 *
 * A conversation-keyed map sidesteps this rather than chasing exactly which
 * Flue-internal continuation causes the extra invocation: whichever code path
 * reads it, a plain `Map.get(conversationId)` always returns the latest value
 * `assistantMiddleware` synchronously recorded for that specific conversation —
 * never a leftover value from a different, completed request — because the
 * middleware runs synchronously for every new prompt-submission request
 * before Flue starts any turn processing (correct or stray) for it.
 */
const turnContextByConversation = new Map<string, TurnContext>();

/**
 * Records this turn's context for a conversation, overwriting any previous
 * turn's snapshot. Called synchronously by `assistantMiddleware` before
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
