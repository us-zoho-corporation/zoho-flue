import './styles.css';
import { FlueProvider } from '@flue/react';
import { createFlueClient } from '@flue/sdk';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ConversationsProvider } from './conversations.tsx';

const client = createFlueClient({ baseUrl: '' });

createRoot(document.getElementById('root')!).render(
  <FlueProvider client={client}>
    <ConversationsProvider agentName="assistant">
      <App />
    </ConversationsProvider>
  </FlueProvider>,
);
