import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

// Keep the agent server on its long-standing :3583 (Vite's own default is
// 5173, which collides with the chat sub-app's dev server — src/chat/vite.config.ts
// proxies /api and /agents to :3583, so this port is a contract, not a preference).
export default defineConfig({
	plugins: [flue()],
	server: { port: 3583 },
});
