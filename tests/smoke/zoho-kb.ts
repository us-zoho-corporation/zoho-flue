import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';

describe('zoho-kb MCP', () => {
    it('searches the knowledge base and returns relevant results', () => {
        const { stdout, stderr, status } = spawnSync(
            'pnpm',
            ['exec', 'flue', 'run', 'assistant', '--input', '{"message":"use zoho_kb_search to find documentation about Zoho CRM leads module and summarise what you find"}'],
            { encoding: 'utf8', timeout: 30000 },
        );
        expect(status, stderr).toBe(0);
        expect(stdout.toLowerCase()).toMatch(/lead/);
    });

    it('fetches product list via zoho_kb_list_products', () => {
        const { stdout, stderr, status } = spawnSync(
            'pnpm',
            ['exec', 'flue', 'run', 'assistant', '--input', '{"message":"call zoho_kb_list_products and list the first three product names you see"}'],
            { encoding: 'utf8', timeout: 30000 },
        );
        expect(status, stderr).toBe(0);
        expect(stdout.trim().length).toBeGreaterThan(0);
    });
});
