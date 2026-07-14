import './styles.css';
import { FlueProvider } from '@flue/react';
import { createFlueClient } from '@flue/sdk';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ConversationsProvider } from './conversations.tsx';
import { isAutoModeEnabled } from './autoMode.ts';

// `headers` is a function so it's re-evaluated on every request (send, history
// fetch, SSE reconnect) — the currently selected "Auto mode" setting is always
// attached fresh, not fixed at client-construction time.
const client = createFlueClient({
  baseUrl: '',
  headers: () => ({ 'x-hitl-auto-approve': String(isAutoModeEnabled()) }),
});

createRoot(document.getElementById('root')!).render(
  <FlueProvider client={client}>
    <ConversationsProvider agentName="assistant">
      <App />
    </ConversationsProvider>
  </FlueProvider>,
);
