// Client-side counterpart of src/tools/connection-required.ts. Duplicated
// rather than imported — that module lives outside the chat app's Vite root
// (src/chat/) and is a handful of lines, so a small parsing shim here is
// simpler than wiring a cross-boundary import. Keep the two in sync: the
// sentinel prefix and payload shape must match exactly.

export interface ConnectionRequiredPayload {
  kind: 'zoho' | 'mcp' | 'docs';
  mode: 'connect' | 'reconnect';
  label: string;
  product?: 'crm' | 'desk';
  scopes?: string[];
  serverId?: string;
}

const SENTINEL = '__connection_required__:';

/**
 * Parses a tool step's `errorText` into a `ConnectionRequiredPayload`, if the
 * failing tool (`zoho_api` or an MCP tool) threw one.
 * @param message - The tool step's `errorText`, if any.
 * @returns The decoded payload, or `null` if `message` isn't one of these.
 */
export function parseConnectionRequired(message: string | undefined): ConnectionRequiredPayload | null {
  if (!message || !message.startsWith(SENTINEL)) return null;
  try {
    return JSON.parse(message.slice(SENTINEL.length)) as ConnectionRequiredPayload;
  } catch {
    return null;
  }
}

/**
 * Redirects to Zoho's OAuth consent screen requesting `scopes`, unioned
 * server-side with whatever the user already has, then back to `returnTo`.
 * @param scopes - The OAuth scopes to request.
 * @param returnTo - The same-origin path to return to after consent.
 */
export function connectZohoScopes(scopes: string[], returnTo: string): void {
  const encodedReturnTo = encodeURIComponent(returnTo);
  window.location.assign(`/api/auth/login?scopes=${encodeURIComponent(scopes.join(','))}&returnTo=${encodedReturnTo}`);
}
