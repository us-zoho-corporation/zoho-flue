import { evictZohoToken, getZohoAccessToken, type OAuthCredentials } from '../../auth/zoho-auth';
import type { Row } from './zcql';

export interface CatalystClientOptions {
	/** e.g. https://api.catalyst.zoho.com/baas/v1 */
	baseUrl: string;
	projectId: string;
	orgId: string;
	/** Value for the `Environment` header, e.g. 'Development'. */
	environment: string;
	/** Service-account credentials — the admin token used for all Data Store calls. */
	oauth: OAuthCredentials;
}

/**
 * Thin REST client over the Catalyst Data Store, authenticated with the
 * service-account admin token. Centralizes header injection and the
 * evict-and-retry-once-on-401 behavior so repositories stay declarative.
 * Mirrors the token-refresh pattern in `src/providers/catalyst-glm.ts`.
 */
export class CatalystDataStoreClient {
	/**
	 * Creates a client scoped to a single Catalyst project/environment.
	 * @param opts - Base URL, project/org ids, environment, and service-account OAuth credentials.
	 */
	constructor(private readonly opts: CatalystClientOptions) {}

	/**
	 * Builds the absolute URL for a project-scoped Data Store path.
	 * @param path - Path segment appended after the project id (e.g. `/table/Users/row`).
	 * @returns The absolute Catalyst Data Store URL.
	 */
	private projectUrl(path: string): string {
		return `${this.opts.baseUrl}/project/${this.opts.projectId}${path}`;
	}

	/**
	 * Issues a request with auth/org/env headers; on 401, refreshes the token once and retries.
	 * @param method - HTTP method to send.
	 * @param url - Absolute URL to request (see {@link projectUrl}).
	 * @param body - Optional JSON-serializable request body; when present, sends `Content-Type: application/json`.
	 * @returns The raw `Response` from the (possibly retried) request.
	 * @throws {Error} If the Zoho access token cannot be refreshed (see `getZohoAccessToken`).
	 */
	private async request(method: string, url: string, body?: unknown): Promise<Response> {
		const send = async () => {
			const token = await getZohoAccessToken(this.opts.oauth);
			return fetch(url, {
				method,
				headers: {
					Authorization: `Zoho-oauthtoken ${token}`,
					'CATALYST-ORG': this.opts.orgId,
					Environment: this.opts.environment,
					...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
				},
				...(body !== undefined ? { body: JSON.stringify(body) } : {}),
			});
		};

		let res = await send();
		if (res.status === 401) {
			evictZohoToken(this.opts.oauth);
			res = await send();
		}
		return res;
	}

	/**
	 * Parses Catalyst's `{ status, data }` envelope, throwing on non-2xx.
	 * @param res - The `Response` returned by {@link request}.
	 * @param context - Short description of the operation, used in the thrown error message.
	 * @returns The `data` field of the parsed JSON envelope.
	 * @throws {Error} If `res` is not a 2xx response.
	 */
	private async unwrap<T>(res: Response, context: string): Promise<T> {
		if (!res.ok) {
			const errBody = await res.text().catch(() => res.statusText);
			throw new Error(`Catalyst ${context} failed (${res.status}): ${errBody}`);
		}
		const json = (await res.json()) as { data?: T };
		return json.data as T;
	}

	/**
	 * POST rows to a table. Body is the row array; returns the inserted rows (with ROWID).
	 * @param table - Case-sensitive Data Store table name.
	 * @param rows - Rows to insert (without ROWID).
	 * @returns The inserted rows, each including its assigned ROWID.
	 * @throws {Error} If the token refresh fails, or Catalyst returns a non-2xx response.
	 */
	async insertRows(table: string, rows: Row[]): Promise<Row[]> {
		const res = await this.request('POST', this.projectUrl(`/table/${table}/row`), rows);
		return (await this.unwrap<Row[]>(res, `insert into ${table}`)) ?? [];
	}

	/**
	 * GET a single row by ROWID; returns null on 404.
	 * @param table - Case-sensitive Data Store table name.
	 * @param rowId - ROWID of the row to fetch.
	 * @returns The row, or `null` if no row exists with that ROWID.
	 * @throws {Error} If the token refresh fails, or Catalyst returns a non-2xx, non-404 response.
	 */
	async getRow(table: string, rowId: string): Promise<Row | null> {
		const res = await this.request('GET', this.projectUrl(`/table/${table}/row/${rowId}`));
		if (res.status === 404) return null;
		return this.unwrap<Row>(res, `get row ${rowId} from ${table}`);
	}

	/**
	 * PUT rows (each must include ROWID); returns the updated rows.
	 * @param table - Case-sensitive Data Store table name.
	 * @param rows - Rows to update, each including its ROWID.
	 * @returns The updated rows.
	 * @throws {Error} If the token refresh fails, or Catalyst returns a non-2xx response.
	 */
	async updateRows(table: string, rows: (Row & { ROWID: string })[]): Promise<Row[]> {
		const res = await this.request('PUT', this.projectUrl(`/table/${table}/row`), rows);
		return (await this.unwrap<Row[]>(res, `update ${table}`)) ?? [];
	}

	/**
	 * DELETE a row by ROWID.
	 * @param table - Case-sensitive Data Store table name.
	 * @param rowId - ROWID of the row to delete.
	 * @throws {Error} If the token refresh fails, or Catalyst returns a non-2xx, non-404 response.
	 */
	async deleteRow(table: string, rowId: string): Promise<void> {
		const res = await this.request('DELETE', this.projectUrl(`/table/${table}/row/${rowId}`));
		if (!res.ok && res.status !== 404) {
			const errBody = await res.text().catch(() => res.statusText);
			throw new Error(`Catalyst delete row ${rowId} from ${table} failed (${res.status}): ${errBody}`);
		}
	}

	/**
	 * Executes a ZCQL query; returns the raw wrapped rows (`[{ Table: {...} }]`).
	 * @param zcql - The ZCQL query string to execute.
	 * @returns The raw, per-table-wrapped rows returned by Catalyst.
	 * @throws {Error} If the token refresh fails, or Catalyst returns a non-2xx response.
	 */
	async query(zcql: string): Promise<unknown[]> {
		const res = await this.request('POST', this.projectUrl('/zcql'), { query: zcql });
		return (await this.unwrap<unknown[]>(res, 'zcql query')) ?? [];
	}
}
