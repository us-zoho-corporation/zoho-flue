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
	constructor(private readonly opts: CatalystClientOptions) {}

	private projectUrl(path: string): string {
		return `${this.opts.baseUrl}/project/${this.opts.projectId}${path}`;
	}

	/** Issues a request with auth/org/env headers; on 401, refreshes the token once and retries. */
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

	/** Parses Catalyst's `{ status, data }` envelope, throwing on non-2xx. */
	private async unwrap<T>(res: Response, context: string): Promise<T> {
		if (!res.ok) {
			const errBody = await res.text().catch(() => res.statusText);
			throw new Error(`Catalyst ${context} failed (${res.status}): ${errBody}`);
		}
		const json = (await res.json()) as { data?: T };
		return json.data as T;
	}

	/** POST rows to a table. Body is the row array; returns the inserted rows (with ROWID). */
	async insertRows(table: string, rows: Row[]): Promise<Row[]> {
		const res = await this.request('POST', this.projectUrl(`/table/${table}/row`), rows);
		return (await this.unwrap<Row[]>(res, `insert into ${table}`)) ?? [];
	}

	/** GET a single row by ROWID; returns null on 404. */
	async getRow(table: string, rowId: string): Promise<Row | null> {
		const res = await this.request('GET', this.projectUrl(`/table/${table}/row/${rowId}`));
		if (res.status === 404) return null;
		return this.unwrap<Row>(res, `get row ${rowId} from ${table}`);
	}

	/** PUT rows (each must include ROWID); returns the updated rows. */
	async updateRows(table: string, rows: (Row & { ROWID: string })[]): Promise<Row[]> {
		const res = await this.request('PUT', this.projectUrl(`/table/${table}/row`), rows);
		return (await this.unwrap<Row[]>(res, `update ${table}`)) ?? [];
	}

	/** DELETE a row by ROWID. */
	async deleteRow(table: string, rowId: string): Promise<void> {
		const res = await this.request('DELETE', this.projectUrl(`/table/${table}/row/${rowId}`));
		if (!res.ok && res.status !== 404) {
			const errBody = await res.text().catch(() => res.statusText);
			throw new Error(`Catalyst delete row ${rowId} from ${table} failed (${res.status}): ${errBody}`);
		}
	}

	/** Executes a ZCQL query; returns the raw wrapped rows (`[{ Table: {...} }]`). */
	async query(zcql: string): Promise<unknown[]> {
		const res = await this.request('POST', this.projectUrl('/zcql'), { query: zcql });
		return (await this.unwrap<unknown[]>(res, 'zcql query')) ?? [];
	}
}
