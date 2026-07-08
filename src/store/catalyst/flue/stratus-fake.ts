/**
 * In-memory fake of the Catalyst Stratus REST surface for tests: object PUT/GET
 * on the `*.zohostratus.com` object host, and batch delete on the `baas/v1`
 * management host. Models only what {@link CatalystStratusClient} calls.
 */

/** Mutable fake Stratus state: object key -> stored bytes. */
export interface StratusState {
	objects: Map<string, Uint8Array>;
}

/**
 * Creates empty fake Stratus state.
 * @returns Fresh state ready for {@link handleStratus}.
 */
export function createStratusState(): StratusState {
	return { objects: new Map() };
}

/** A minimal `Response`-like object the Stratus client reads. */
interface FakeResponse {
	ok: boolean;
	status: number;
	text: () => Promise<string>;
	arrayBuffer: () => Promise<ArrayBuffer>;
}

/**
 * Builds a fake response with an optional byte body.
 * @param status - HTTP status.
 * @param bytes - Optional body bytes for `arrayBuffer()`.
 * @returns A `Response`-like object.
 */
function res(status: number, bytes?: Uint8Array): FakeResponse {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => '',
		arrayBuffer: async () => (bytes ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) : new ArrayBuffer(0)),
	};
}

/**
 * Decodes an object key from an object-host URL pathname.
 * @param pathname - The URL pathname (leading slash, percent-encoded segments).
 * @returns The decoded object key.
 */
function keyFromPath(pathname: string): string {
	return pathname.replace(/^\//, '').split('/').map(decodeURIComponent).join('/');
}

/**
 * Routes a Stratus REST request against the fake state.
 * @param url - The requested URL.
 * @param init - The `fetch` init (method + body).
 * @param state - The fake Stratus state.
 * @returns A `Response`-like object, or `null` if the URL isn't a Stratus path.
 */
export function handleStratus(url: string, init: RequestInit, state: StratusState): FakeResponse | null {
	const u = new URL(url);
	const method = init.method ?? 'GET';

	if (u.hostname.includes('zohostratus.com')) {
		const key = keyFromPath(u.pathname);
		if (method === 'PUT') {
			const body = init.body as Uint8Array;
			state.objects.set(key, Uint8Array.from(body));
			return res(200);
		}
		if (method === 'GET') {
			const bytes = state.objects.get(key);
			return bytes ? res(200, bytes) : res(404);
		}
		return res(405);
	}

	if (u.pathname.endsWith('/bucket/object') && method === 'PUT') {
		const body = init.body ? JSON.parse(init.body as string) : { objects: [] };
		for (const { key } of body.objects as { key: string }[]) state.objects.delete(key);
		return res(200);
	}
	return null;
}
