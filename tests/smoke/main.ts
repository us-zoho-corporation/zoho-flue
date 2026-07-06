import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';

describe('main agent', () => {
	it('responds to a simple prompt', () => {
		const { stdout, status } = spawnSync(
			'pnpm',
			['exec', 'flue', 'run', 'assistant', '--input', '{"message":"reply with just the word pong"}'],
			{ encoding: 'utf8' },
		);
		expect(status).toBe(0);
		expect(stdout.toLowerCase()).toContain('pong');
	});
});
