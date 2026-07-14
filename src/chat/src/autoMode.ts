// Live "Auto mode" setting, read synchronously by the FlueClient's `headers`
// function (see main.tsx) on every request — send, history fetch, and SSE
// reconnect alike. This is what makes toggling it in Settings take effect on
// the very next message, even inside an already-open conversation: there's no
// conversation-id encoding or React re-render involved, just a plain
// module-level value read at request time.
const STORAGE_KEY = 'flue:hitl-auto-approve:v1';

let current: boolean = (() => {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
})();

/**
 * Reads whether "Auto mode" (HITL confirmation bypass) is currently enabled.
 * @returns `true` if enabled.
 */
export function isAutoModeEnabled(): boolean {
  return current;
}

/**
 * Sets whether "Auto mode" is enabled and persists it, so every subsequent
 * request (in this tab, and future page loads) carries it.
 * @param enabled - The new "Auto mode" state.
 */
export function setAutoModeEnabled(enabled: boolean): void {
  current = enabled;
  try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* ignore */ }
}
