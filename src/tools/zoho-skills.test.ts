import { describe, it, expect } from 'vitest';
import { defineZohoSkillTool } from './zoho-skills';

/**
 * Builds a fresh `zoho_skill_get` tool instance under test.
 * @returns The `zoho_skill_get` Flue tool under test.
 */
function tool() {
    return defineZohoSkillTool();
}

describe('zoho_skill_get', () => {
    it('reads a CRM skill\'s SKILL.md body', async () => {
        const result = await tool().run({ input: { skill: 'zoho-crm-records' } });
        expect(result).toContain('zoho-crm-records');
        expect(result).toContain('## Operations');
    });

    it('reads a Desk skill\'s SKILL.md body', async () => {
        const result = await tool().run({ input: { skill: 'zoho-desk-tickets' } });
        expect(result).toContain('Zoho Desk support tickets');
    });

    it('reads a reference file within a skill', async () => {
        const result = await tool().run({ input: { skill: 'zoho-crm-records', reference: 'create-record' } });
        expect(result.length).toBeGreaterThan(0);
    });

    it('accepts a reference filename with an explicit .md extension', async () => {
        const result = await tool().run({ input: { skill: 'zoho-crm-records', reference: 'create-record.md' } });
        expect(result.length).toBeGreaterThan(0);
    });

    it('rejects an unknown reference for a valid skill', async () => {
        await expect(tool().run({ input: { skill: 'zoho-crm-records', reference: 'does-not-exist' } }))
            .rejects.toThrow(/Unknown reference/);
    });

    it('rejects a reference for a skill with no references/ directory', async () => {
        await expect(tool().run({ input: { skill: 'zoho-crm-query', reference: 'anything' } }))
            .rejects.toThrow(/Unknown reference/);
    });

    it('rejects path traversal attempts in the reference filename', async () => {
        await expect(tool().run({ input: { skill: 'zoho-crm-records', reference: '../../../etc/passwd' } }))
            .rejects.toThrow(/Unknown reference/);
    });
});
