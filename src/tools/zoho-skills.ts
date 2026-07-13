import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

const SKILLS_DIR = resolve('src/skills');

// Allowlist of Zoho CRM/Desk implementation skills this tool may serve, all
// living under `src/skills/`. This project's own dev-workflow skills
// (add-agent, run-agent, etc., under `.agents/skills/`) are for engineers
// working on this repo via Claude Code, not for the deployed chat agent, and
// are never served by this tool.
const ALLOWED_SKILLS = [
	'zoho-crm-records',
	'zoho-crm-modules-and-fields',
	'zoho-crm-query',
	'zoho-crm-bulk-operations',
	'zoho-crm-record-actions',
	'zoho-crm-related-records',
	'zoho-crm-attachments',
	'zoho-crm-emails',
	'zoho-crm-users-and-org',
	'zoho-crm-workflow-automation',
	'zoho-desk-tickets',
	'zoho-desk-accounts',
	'zoho-desk-contacts',
	'zoho-desk-agents-and-departments',
	'zoho-desk-organizations',
] as const;

// Single cap on tool output, matching the KB tool's budget, so one skill doc
// can't crowd out the rest of the model's context.
const MAX_RESULT_CHARS = 12_000;

/**
 * Reads a skill doc file, truncating it if it exceeds the shared result budget.
 * @param path - Absolute path of the file to read.
 * @returns The file's text content, truncated with a marker if too long.
 * @throws {Error} If the file cannot be read (e.g. does not exist).
 */
async function readSkillDoc(path: string): Promise<string> {
	const text = await readFile(path, 'utf8');
	return text.length <= MAX_RESULT_CHARS ? text : `${text.slice(0, MAX_RESULT_CHARS)}\n[truncated]`;
}

/**
 * Returns a tool that serves the vendored Zoho CRM/Desk implementation skill
 * docs (`src/skills/zoho-{crm,desk}-*`) to the running agent on demand, so
 * the operation catalog stays out of the always-loaded system prompt.
 * @returns A Flue tool named `zoho_skill_get` that reads a skill's `SKILL.md`
 * body, or one of its `references/*.md` detail files.
 */
export function defineZohoSkillTool() {
	return defineTool({
		name: 'zoho_skill_get',
		description:
			'Fetch the full instructions for a Zoho CRM or Desk implementation skill — exact '
			+ 'endpoints, parameters, scopes, and gotchas. Call with just `skill` for the operation '
			+ 'overview and table of operations; add `reference` (the filename from that table\'s '
			+ 'links, with or without `.md`) to fetch one operation\'s full detail doc before making '
			+ 'the corresponding zoho_api call.',
		input: v.object({
			skill: v.picklist(ALLOWED_SKILLS),
			reference: v.optional(
				v.pipe(v.string(), v.description('Reference filename from the skill\'s operations table, e.g. "create-record"')),
			),
		}),
		output: v.string(),
		/**
		 * Reads the requested skill doc from disk.
		 * @param input - The skill name, and optionally a reference filename within its `references/` directory.
		 * @returns The requested doc's text content.
		 * @throws {Error} If `reference` is given but does not match a file in that skill's `references/` directory.
		 */
		async run({ input }) {
			const skillDir = join(SKILLS_DIR, input.skill);
			if (!input.reference) {
				return readSkillDoc(join(skillDir, 'SKILL.md'));
			}

			const refDir = join(skillDir, 'references');
			const available = await readdir(refDir).catch(() => [] as string[]);
			const filename = input.reference.endsWith('.md') ? input.reference : `${input.reference}.md`;
			if (!available.includes(filename)) {
				throw new Error(
					`Unknown reference '${input.reference}' for skill '${input.skill}'. `
					+ `Available: ${available.length ? available.join(', ') : 'none'}.`,
				);
			}
			return readSkillDoc(join(refDir, filename));
		},
	});
}

export const zohoSkillTools = [defineZohoSkillTool()];
