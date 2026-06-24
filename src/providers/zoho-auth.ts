export type OAuthCredentials = {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
};

/** Exchanges a refresh token for a short-lived Zoho access token. */
export async function getZohoAccessToken(opts: OAuthCredentials): Promise<string> {
	const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: opts.clientId,
			client_secret: opts.clientSecret,
			refresh_token: opts.refreshToken,
		}),
	});
	if (!res.ok) throw new Error(`Zoho token refresh failed: ${res.status} ${await res.text()}`);

	const data = await res.json() as { access_token?: string; error?: string };
	if (data.error || !data.access_token) throw new Error(`Zoho token refresh error: ${data.error}`);

	return data.access_token;
}
