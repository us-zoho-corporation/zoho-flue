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
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `ctx` active for all async continuations created within it. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
	return storage.run(ctx, fn);
}

/** The current request's logged-in user token, if any. */
export function currentUserToken(): string | undefined {
	return storage.getStore()?.userToken;
}
