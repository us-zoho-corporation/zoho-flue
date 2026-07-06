import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getZohoAccessToken } from '../../src/auth/zoho-auth.js';

function loadDotenv(): void {
    try {
        const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n');
        for (const line of lines) {
            const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
            if (match) process.env[match[1]] ??= match[2].replace(/^"(.*)"$|^'(.*)'$/, '$1$2');
        }
    } catch { /* .env absent — env vars must be set externally */ }
}

/** Loads .env and pre-fetches a Zoho access token so smoke test processes share one OAuth call. */
export async function setup(): Promise<void> {
    loadDotenv();
    const { ZOHO_OAUTH_CLIENT_ID, ZOHO_OAUTH_CLIENT_SECRET, ZOHO_OAUTH_REFRESH_TOKEN } = process.env;
    if (!ZOHO_OAUTH_CLIENT_ID || !ZOHO_OAUTH_CLIENT_SECRET || !ZOHO_OAUTH_REFRESH_TOKEN) return;
    process.env.ZOHO_ACCESS_TOKEN = await getZohoAccessToken({
        clientId: ZOHO_OAUTH_CLIENT_ID,
        clientSecret: ZOHO_OAUTH_CLIENT_SECRET,
        refreshToken: ZOHO_OAUTH_REFRESH_TOKEN,
    });
}
