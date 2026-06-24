import type { AssistantMessageEventStream as _AES } from '@earendil-works/pi-ai';

// pi-ai incorrectly re-exports AssistantMessageEventStream as `export type` in index.d.ts,
// but it is a real class exported as a value in index.js via `export *`.
declare module '@earendil-works/pi-ai' {
	const AssistantMessageEventStream: new () => _AES;
}
