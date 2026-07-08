import { evictZohoToken, getZohoAccessToken, type OAuthCredentials } from '../../../auth/zoho-auth';

/**
 * Thin REST client over Catalyst Stratus object storage, authenticated with the
 * service-account admin token. Object read/write go directly to the
 * bucket-specific `*.zohostratus.com` host; batch delete goes through the
 * `baas/v1` management host. Used for immutable attachment payloads.
 */
export interface CatalystStratusOptions {
	/** Bucket object host, e.g. https://mybucket-development.zohostratus.com */
	objectBaseUrl: string;
	/** Management host, e.g. https://api.catalyst.zoho.com/baas/v1 */
	apiBaseUrl: string;
	projectId: string;
	orgId: string;
	environment: string;
	bucketName: string;
	oauth: OAuthCredentials;
}

export class CatalystStratusClient {
	/**
	 * Creates a client scoped to a single bucket.
	 * @param opts - Object/management hosts, bucket, project/org ids, and OAuth creds.
	 */
	constructor(private readonly opts: CatalystStratusOptions) {}

	/**
	 * Issues a request with the service-account token; on 401, refreshes once and retries.
	 * @param method - HTTP method.
	 * @param url - Absolute URL.
	 * @param init - Extra fetch init (headers/body).
	 * @returns The raw `Response`.
	 * @throws {Error} If the token can't be refreshed.
	 */
	private async request(method: string, url: string, init: { headers?: Record<string, string>; body?: BodyInit | Uint8Array } = {}): Promise<Response> {
		const send = async () => {
			const token = await getZohoAccessToken(this.opts.oauth);
			return fetch(url, { method, headers: { Authorization: `Zoho-oauthtoken ${token}`, ...init.headers }, body: init.body as BodyInit });
		};
		let res = await send();
		if (res.status === 401) { evictZohoToken(this.opts.oauth); res = await send(); }
		return res;
	}

	/**
	 * Encodes an object key's path segments for the object-host URL.
	 * @param key - The object key (may contain `/` path separators).
	 * @returns The key with each segment percent-encoded, slashes preserved.
	 */
	private encodeKey(key: string): string {
		return key.split('/').map(encodeURIComponent).join('/');
	}

	/**
	 * Uploads (overwriting) an object.
	 * @param key - Object key.
	 * @param bytes - Object bytes.
	 * @param contentType - MIME type.
	 * @throws {Error} If Stratus returns a non-2xx response.
	 */
	async putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
		const res = await this.request('PUT', `${this.opts.objectBaseUrl}/${this.encodeKey(key)}`, {
			headers: { 'content-type': contentType, overwrite: 'true' },
			body: bytes,
		});
		if (!res.ok) throw new Error(`Stratus put ${key} failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);
	}

	/**
	 * Downloads an object.
	 * @param key - Object key.
	 * @returns The bytes, or `null` if the object doesn't exist (404).
	 * @throws {Error} If Stratus returns a non-2xx, non-404 response.
	 */
	async getObject(key: string): Promise<Uint8Array | null> {
		const res = await this.request('GET', `${this.opts.objectBaseUrl}/${this.encodeKey(key)}`);
		if (res.status === 404) return null;
		if (!res.ok) throw new Error(`Stratus get ${key} failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);
		return new Uint8Array(await res.arrayBuffer());
	}

	/**
	 * Deletes objects by key (batch). A no-op for keys that don't exist.
	 * @param keys - Object keys to delete.
	 * @throws {Error} If Stratus returns a non-2xx response.
	 */
	async deleteObjects(keys: string[]): Promise<void> {
		if (keys.length === 0) return;
		const url = `${this.opts.apiBaseUrl}/project/${this.opts.projectId}/bucket/object?bucket_name=${encodeURIComponent(this.opts.bucketName)}`;
		const res = await this.request('PUT', url, {
			headers: { 'Content-Type': 'application/json', 'CATALYST-ORG': this.opts.orgId, Environment: this.opts.environment },
			body: JSON.stringify({ objects: keys.map((key) => ({ key })) }),
		});
		if (!res.ok) throw new Error(`Stratus delete failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);
	}
}
