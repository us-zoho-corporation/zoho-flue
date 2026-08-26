import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ConversationsProvider } from './conversations.tsx';
import { isAutoModeEnabled } from './autoMode.ts';

// The agent's HTTP mount path (see `src/app.ts`'s `app.route('/agents/assistant',
// createAgentRouter(...))`) — `ConversationsStore` appends each conversation id to
// this to build that conversation's own client URL.
const AGENT_MOUNT_URL = '/agents/assistant';

// A function so it's re-evaluated on every request (send, history fetch, SSE
// reconnect) — the currently selected "Auto mode" setting is always attached
// fresh, not fixed at client-construction time.
const headers = () => ({ 'x-hitl-auto-approve': String(isAutoModeEnabled()) });

createRoot(document.getElementById('root')!).render(
  <ConversationsProvider mountUrl={AGENT_MOUNT_URL} headers={headers}>
    <App />
  </ConversationsProvider>,
);
