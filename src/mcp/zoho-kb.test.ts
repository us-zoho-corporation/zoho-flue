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

    it('formats search_docs\' real shape: hits wrapped in a `results` array with a confidence preamble', () => {
        // The live search_docs response wraps hits in `results` (each with `title`/`url`/
        // `chunk_text`, not the flat `title`/`url`/`content` the old code assumed) — that
        // mismatch made every formatted hit an empty string, so the model saw no results
        // even when the KB had strong matches. This locks in the fix.
        const content = [{
            type: 'text',
            text: JSON.stringify({
                confidence: 'high',
                top_score: 0.9998,
                quality_hint: 'Results are strong. Cite [title](deep_link) for every factual claim.',
                results: [
                    {
                        score: 0.9998,
                        title: 'Configuring Workflow Rules',
                        url: 'https://help.zoho.com/portal/en/kb/crm/.../configuring-workflow-rules',
                        deep_link: 'https://help.zoho.com/portal/en/kb/crm/.../configuring-workflow-rules#configuring-workflow-rules',
                        chunk_text: 'Workflow Rules in Zoho CRM are a set of actions...',
                    },
                ],
            }),
        }];
        const result = extractText(content);
        expect(result).toContain('Confidence: high');
        expect(result).toContain('Results are strong');
        expect(result).toContain('Title: Configuring Workflow Rules');
        // Prefers the more specific deep_link over the plain url for citation.
        expect(result).toContain('URL: https://help.zoho.com/portal/en/kb/crm/.../configuring-workflow-rules#configuring-workflow-rules');
        expect(result).toContain('Workflow Rules in Zoho CRM are a set of actions');
    });

    it('falls back to raw JSON for a result with no recognized field (e.g. list_products)', () => {
        const content = [{ type: 'text', text: JSON.stringify({ name: 'crm', article_count: 1234 }) }];
        expect(extractText(content)).toBe('{"name":"crm","article_count":1234}');
    });
});
