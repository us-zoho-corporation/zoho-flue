import { describe, it, expect, vi } from 'vitest';

vi.mock('../config', () => ({ config: { zohoDocsToken: '' } }));

import { isTokenExpired } from './zoho-kb';

function makeJwt(payload: object): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `header.${encoded}.signature`;
}

describe('isTokenExpired', () => {
    it('returns false for a token with a future exp', () => {
        const jwt = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
        expect(isTokenExpired(jwt)).toBe(false);
    });

    it('returns true for a token with a past exp', () => {
        const jwt = makeJwt({ exp: Math.floor(Date.now() / 1000) - 1 });
        expect(isTokenExpired(jwt)).toBe(true);
    });

    it('returns false for a token with no exp claim', () => {
        const jwt = makeJwt({ sub: 'user', iss: 'test' });
        expect(isTokenExpired(jwt)).toBe(false);
    });

    it('returns false for a malformed JWT', () => {
        expect(isTokenExpired('not.a.jwt')).toBe(false);
        expect(isTokenExpired('')).toBe(false);
        expect(isTokenExpired('onlyone')).toBe(false);
    });
});
