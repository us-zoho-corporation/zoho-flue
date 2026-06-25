import { describe, test, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { ToolCallRow } from './Thread.tsx';

// Browser-mode test: renders a real chat component in headless Chromium and
// asserts the live tool-activity UI (the rows shown while the agent searches).
// Run via `pnpm test:browser` — excluded from the default `pnpm test`.
describe('ToolCallRow (browser)', () => {
	test('renders a running KB search with its query, present tense', async () => {
		const screen = await render(
			<ToolCallRow
				toolName="zoho_kb_search"
				toolCallId="c1"
				state="input-available"
				input={{ query: 'payment methods' }}
				index={0}
			/>,
		);
		await expect.element(screen.getByText('Searching "payment methods"')).toBeInTheDocument();
	});

	test('renders a completed API call with its path, past tense', async () => {
		const screen = await render(
			<ToolCallRow
				toolName="zoho_api"
				toolCallId="c2"
				state="output-available"
				input={{ url: 'https://www.zohoapis.com/crm/v2/leads' }}
				index={0}
			/>,
		);
		await expect.element(screen.getByText('Fetched /crm/v2/leads')).toBeInTheDocument();
	});
});
