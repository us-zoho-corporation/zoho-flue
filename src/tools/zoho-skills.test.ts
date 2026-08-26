import { describe, it, expect } from 'vitest';
import { defineZohoSkillTool } from './zoho-skills';

// Minimal stub context fields every tool's `run()` now requires (toolCallId, log).
const noopLog = { info() {}, warn() {}, error() {} };

/**
 * Normalizes a tool result envelope down to its text — `run()`'s declared
 * return type is the full `string | { output?: string }` envelope even
 * though this tool always returns a bare string.
 * @param result - The value resolved by `tool().run(...)`.
 * @returns The tool's text output.
 */
function text(result: string | { output?: string }): string {
    return typeof result === 'string' ? result : (result.output ?? '');
}

/**
 * Builds a fresh `zoho_skill_get` tool instance under test.
 * @returns The `zoho_skill_get` Flue tool under test.
 */
function tool() {
    return defineZohoSkillTool();
}

describe('zoho_skill_get', () => {
    it('reads a CRM skill\'s SKILL.md body', async () => {
        const result = await tool().run({ data: { skill: 'zoho-crm-records' } , toolCallId: 'test-call', log: noopLog});
        expect(text(result)).toContain('zoho-crm-records');
        expect(text(result)).toContain('## Operations');
    });

    it('reads a Desk skill\'s SKILL.md body', async () => {
        const result = await tool().run({ data: { skill: 'zoho-desk-tickets' } , toolCallId: 'test-call', log: noopLog});
        expect(text(result)).toContain('Zoho Desk support tickets');
    });

    it('reads a reference file within a skill', async () => {
        const result = await tool().run({ data: { skill: 'zoho-crm-records', reference: 'create-record' } , toolCallId: 'test-call', log: noopLog});
        expect(text(result).length).toBeGreaterThan(0);
    });

    it('accepts a reference filename with an explicit .md extension', async () => {
        const result = await tool().run({ data: { skill: 'zoho-crm-records', reference: 'create-record.md' } , toolCallId: 'test-call', log: noopLog});
        expect(text(result).length).toBeGreaterThan(0);
    });

    it('rejects an unknown reference for a valid skill', async () => {
        await expect(tool().run({ data: { skill: 'zoho-crm-records', reference: 'does-not-exist' } , toolCallId: 'test-call', log: noopLog}))
            .rejects.toThrow(/Unknown reference/);
    });

    it('rejects a reference for a skill with no references/ directory', async () => {
        await expect(tool().run({ data: { skill: 'zoho-crm-query', reference: 'anything' } , toolCallId: 'test-call', log: noopLog}))
            .rejects.toThrow(/Unknown reference/);
    });

    it('rejects path traversal attempts in the reference filename', async () => {
        await expect(tool().run({ data: { skill: 'zoho-crm-records', reference: '../../../etc/passwd' } , toolCallId: 'test-call', log: noopLog}))
            .rejects.toThrow(/Unknown reference/);
    });
});
