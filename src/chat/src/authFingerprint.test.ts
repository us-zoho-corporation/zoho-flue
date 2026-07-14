import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAuthFingerprint, saveAuthFingerprint } from './authFingerprint.ts';

/**
 * Stubs `localStorage` with a real in-memory `Map`-backed implementation for a single test.
 */
function stubLocalStorage(): void {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('loadAuthFingerprint / saveAuthFingerprint', () => {
  it('returns null before anything is saved', () => {
    stubLocalStorage();
    expect(loadAuthFingerprint()).toBeNull();
  });

  it('round-trips a saved fingerprint', () => {
    stubLocalStorage();
    saveAuthFingerprint('a@example.com');
    expect(loadAuthFingerprint()).toBe('a@example.com');
  });

  it('overwrites a previously saved fingerprint', () => {
    stubLocalStorage();
    saveAuthFingerprint('a@example.com');
    saveAuthFingerprint('b@example.com');
    expect(loadAuthFingerprint()).toBe('b@example.com');
  });

  it('clears the stored fingerprint when saving null (signed out)', () => {
    stubLocalStorage();
    saveAuthFingerprint('a@example.com');
    saveAuthFingerprint(null);
    expect(loadAuthFingerprint()).toBeNull();
  });

  it('returns null if localStorage throws on read', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(loadAuthFingerprint()).toBeNull();
  });

  it('does not throw if localStorage throws on write', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    expect(() => saveAuthFingerprint('a@example.com')).not.toThrow();
    expect(() => saveAuthFingerprint(null)).not.toThrow();
  });
});
