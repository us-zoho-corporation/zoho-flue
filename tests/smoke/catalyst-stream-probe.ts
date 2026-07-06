import { describe, it, expect } from 'vitest';

// Probe: does Catalyst's /glm/chat actually support server-side streaming, and
// in what wire format? Run with `pnpm test:smoke`. Credentials come from
// global-setup (.env + ZOHO_ACCESS_TOKEN). This only logs findings — it does
// not ship streaming; it tells us whether true streaming is even possible.
describe('catalyst streaming probe', () => {
	it('reports whether /glm/chat supports stream:true and its wire format', async () => {
		const endpoint = process.env.CATALYST_ENDPOINT;
		const orgId = process.env.CATALYST_ORG_ID;
		const token = process.env.ZOHO_ACCESS_TOKEN;
		expect(Boolean(endpoint && orgId && token)).toBe(true);

		const call = (stream: boolean) => fetch(endpoint!, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'CATALYST-ORG': orgId!,
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				model: 'crm-di-glm47b_30b_it',
				messages: [{ role: 'user', content: 'Count from 1 to 20, one number per line.' }],
				max_tokens: 256,
				stream,
			}),
		});

		// A/B control: identical request, stream:false, to prove the 500 is caused
		// specifically by stream:true and not a transient/unrelated error.
		const control = await call(false);
		const controlBody = await control.text();
		console.log('[probe] stream:false status =', control.status, '| has "response":', controlBody.includes('"response"'));

		const res = await call(true);

		console.log('[probe] status            =', res.status);
		console.log('[probe] content-type      =', res.headers.get('content-type'));
		console.log('[probe] transfer-encoding =', res.headers.get('transfer-encoding'));

		const reader = res.body?.getReader();
		if (!reader) {
			console.log('[probe] no readable body');
			return;
		}
		const decoder = new TextDecoder();
		const t0 = Date.now();
		const chunks: { t: number; len: number; text: string }[] = [];
		for (let i = 0; i < 80; i++) {
			const { value, done } = await reader.read();
			if (done) break;
			chunks.push({ t: Date.now() - t0, len: value?.length ?? 0, text: decoder.decode(value, { stream: true }) });
		}

		console.log('[probe] chunk count       =', chunks.length);
		console.log('[probe] arrival spread ms =', chunks.at(-1)?.t ?? 0, '(distinct times:', new Set(chunks.map(c => c.t)).size, ')');
		for (const c of chunks.slice(0, 10)) {
			console.log(`[probe] +${c.t}ms ${c.len}B: ${JSON.stringify(c.text.slice(0, 220))}`);
		}
		// Verdict: many chunks spread over time => real streaming; one big chunk => not.
		const streamed = chunks.length > 2 && (chunks.at(-1)?.t ?? 0) > 50;
		console.log('[probe] VERDICT           =', streamed ? 'STREAMS (incremental)' : 'NO STREAM (single payload)');

		// Tripwire. Verified 2026-06-25: non-streaming works (200), but stream:true
		// returns 500 INTERNAL_SERVER_ERROR — Catalyst /glm/chat has no streaming
		// support, so the provider sends stream:false and emits one text block.
		// If Catalyst later supports streaming, stream:true stops 500ing and this
		// assertion fails — that is the signal to implement incremental streaming
		// in src/providers/catalyst-glm.ts.
		expect(control.status).toBe(200);
		expect(res.status).not.toBe(200);
	});
});
