import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTheme } from './theme.ts';

/**
 * Stubs `localStorage` and `window.matchMedia` for a single test.
 * @param stored - The value `localStorage.getItem` should return, or `null` for nothing stored.
 * @param prefersDark - Whether `matchMedia('(prefers-color-scheme: dark)')` should report a match.
 */
function stubEnvironment(stored: string | null, prefersDark: boolean): void {
	vi.stubGlobal('localStorage', { getItem: () => stored });
	vi.stubGlobal('window', { matchMedia: () => ({ matches: prefersDark }) });
}

afterEach(() => vi.unstubAllGlobals());

describe('loadTheme', () => {
	it('returns the stored theme when one is saved', () => {
		stubEnvironment('dark', false);
		expect(loadTheme()).toBe('dark');
	});

	it('falls back to the OS/browser dark preference when nothing is stored', () => {
		stubEnvironment(null, true);
		expect(loadTheme()).toBe('dark');
	});

	it('falls back to light when nothing is stored and the system prefers light', () => {
		stubEnvironment(null, false);
		expect(loadTheme()).toBe('light');
	});

	it('falls back to light if localStorage throws', () => {
		vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
		expect(loadTheme()).toBe('light');
	});

	it('falls back to light if matchMedia throws', () => {
		vi.stubGlobal('localStorage', { getItem: () => null });
		vi.stubGlobal('window', { matchMedia: () => { throw new Error('blocked'); } });
		expect(loadTheme()).toBe('light');
	});
});
