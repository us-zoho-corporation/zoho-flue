import { describe, it, expect, vi } from 'vitest';

vi.mock('../config', () => ({ config: { zohoDocsBearerToken: '' } }));

import { extractText } from './zoho-kb';

describe('extractText', () => {
    it('formats a JSON search result as readable lines', () => {
        const content = [{
            type: 'text',
            text: JSON.stringify({
                title: 'Payment methods',
                url: 'https://help.zoho.com/billing/payment-methods',
                content: 'You can retrieve payment methods via the API.',
            }),
        }];
        expect(extractText(content)).toBe(
            'Title: Payment methods\n'
            + 'URL: https://help.zoho.com/billing/payment-methods\n'
            + 'You can retrieve payment methods via the API.',
        );
    });

    it('uses excerpt when content is absent', () => {
        const content = [{ type: 'text', text: JSON.stringify({ title: 'T', excerpt: 'short' }) }];
        expect(extractText(content)).toBe('Title: T\nshort');
    });

    it('joins multiple results with a separator', () => {
        const content = [
            { type: 'text', text: JSON.stringify({ title: 'A' }) },
            { type: 'text', text: JSON.stringify({ title: 'B' }) },
        ];
        expect(extractText(content)).toBe('Title: A\n\n---\n\nTitle: B');
    });

    it('passes through non-JSON text unchanged', () => {
        const content = [{ type: 'text', text: 'plain text result' }];
        expect(extractText(content)).toBe('plain text result');
    });

    it('does not strip markdown from result content', () => {
        const content = [{ type: 'text', text: JSON.stringify({ title: '**Bold title**' }) }];
        expect(extractText(content)).toBe('Title: **Bold title**');
    });

    it('truncates output beyond the overall cap', () => {
        const big = 'x'.repeat(20_000);
        const content = [{ type: 'text', text: big }];
        const result = extractText(content);
        expect(result.endsWith('\n[truncated]')).toBe(true);
        expect(result.length).toBeLessThan(big.length);
    });

    it('handles non-array content', () => {
        expect(extractText('raw string')).toBe('raw string');
    });
});
