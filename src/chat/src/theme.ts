// Light/dark theme for the Zoho AI chat. We drive our own tokens via
// `html[data-theme]` and keep Kumo's tokens in sync via `data-mode` +
// `color-scheme`. Persisted in localStorage; a first-time visitor (nothing
// stored yet) gets the OS/browser's `prefers-color-scheme`, falling back to
// light if that can't be read either.

export type Theme = 'light' | 'dark';

const STORE_KEY = 'flue:theme';

/**
 * Reads the persisted theme preference from localStorage, falling back to
 * the OS/browser's `prefers-color-scheme` when nothing is stored yet.
 * @returns The stored theme if it is a valid `Theme` value; otherwise the
 * system preference; otherwise `'light'` (also the fallback if either read throws, e.g. in private browsing).
 */
export function loadTheme(): Theme {
	try {
		const v = localStorage.getItem(STORE_KEY);
		if (v === 'light' || v === 'dark') return v;
	} catch {}
	try {
		if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
	} catch {}
	return 'light';
}

/**
 * Applies the theme to <html> so both our CSS vars and Kumo's tokens flip.
 * @param theme - The theme to apply.
 */
export function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	root.dataset.theme = theme;
	if (theme === 'dark') root.dataset.mode = 'dark';
	else delete root.dataset.mode;
	root.style.colorScheme = theme;
}

/**
 * Persists the given theme preference to localStorage.
 * @param theme - The theme to persist.
 */
export function saveTheme(theme: Theme): void {
	try { localStorage.setItem(STORE_KEY, theme); } catch {}
}
