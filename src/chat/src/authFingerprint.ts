// Tracks whose identity's data is currently cached in this browser's
// localStorage (chat sessions list, Auto mode). Compared against the resolved
// /api/me identity on every load (see App.tsx) so a different Zoho account —
// or no account — signing in on a shared browser never inherits another
// user's chat list or "Auto mode" setting, even when the previous session
// simply expired instead of the user clicking Sign out.
const STORAGE_KEY = 'flue:auth-fingerprint:v1';

/**
 * Reads the fingerprint (email) of whichever identity's data this browser
 * currently has cached, if any.
 * @returns The cached fingerprint, or `null` if none is stored.
 */
export function loadAuthFingerprint(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

/**
 * Persists the fingerprint of the currently-resolved identity (or clears it for a guest).
 * @param fingerprint - The signed-in user's email, or `null` if signed out.
 */
export function saveAuthFingerprint(fingerprint: string | null): void {
  try {
    if (fingerprint) localStorage.setItem(STORAGE_KEY, fingerprint);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
