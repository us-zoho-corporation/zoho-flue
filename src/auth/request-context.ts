import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context propagated from the agent `route` handler (which has the
 * HTTP request + session cookie) down into the provider stream (which does not).
 * The stream signature carries no request info, so we thread the logged-in user's
 * token through AsyncLocalStorage instead.
 */
export interface RequestContext {
	/** The logged-in user's Zoho access token, for per-user provider calls. */
	userToken?: string;
	/** The logged-in user's connected MCP server tools, injected into the turn. */
	mcpTools?: unknown[];
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Runs `fn` with `ctx` active for all async continuations created within it.
 * @param ctx - The request context to expose to `fn` and its async continuations.
 * @param fn - The function to run with `ctx` active.
 * @returns Whatever `fn` returns.
 */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
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
 * The current request's user-connected MCP tools, if any.
 * @returns The active `mcpTools`, or `undefined` outside a request context or when absent.
 */
export function currentMcpTools(): unknown[] | undefined {
	return storage.getStore()?.mcpTools;
}
