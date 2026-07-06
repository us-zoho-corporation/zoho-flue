// Light/dark theme for the Zoho AI chat. We drive our own tokens via
// `html[data-theme]` and keep Kumo's tokens in sync via `data-mode` +
// `color-scheme`. Persisted in localStorage; defaults to light.

export type Theme = 'light' | 'dark';

const STORE_KEY = 'flue:theme';

export function loadTheme(): Theme {
	try {
		const v = localStorage.getItem(STORE_KEY);
		if (v === 'light' || v === 'dark') return v;
	} catch {}
	return 'light';
}

/** Applies the theme to <html> so both our CSS vars and Kumo's tokens flip. */
export function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	root.dataset.theme = theme;
	if (theme === 'dark') root.dataset.mode = 'dark';
	else delete root.dataset.mode;
	root.style.colorScheme = theme;
}

export function saveTheme(theme: Theme): void {
	try { localStorage.setItem(STORE_KEY, theme); } catch {}
}
