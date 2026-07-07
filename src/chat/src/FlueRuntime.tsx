import { createContext, useContext } from 'react';
import { isAssistantMessage } from './flue-model.ts';
import type { ChatMessage } from './flue-model.ts';

export { isAssistantMessage };
export type { ChatMessage, ToolCallInfo, AssistantMessage } from './flue-model.ts';

// ─── Chat context ──────────────────────────────────────────────────────────────
//
// The live view of one conversation, provided by `ActiveConversation` (see
// conversations.tsx) and consumed by `Thread`. Conversation subscriptions live in
// the app-level `ConversationsStore`, decoupled from component/view lifetime.

export interface FlueChat {
  messages: ChatMessage[];
  isRunning: boolean;
  historyReady: boolean;
  error: Error | undefined;
  sendMessage: (text: string) => Promise<void>;
  stop: () => Promise<void>;
}

export const FlueChatContext = createContext<FlueChat>({
  messages: [],
  isRunning: false,
  historyReady: false,
  error: undefined,
  sendMessage: async () => {},
  stop: async () => {},
});

export const useFlueChat = () => useContext(FlueChatContext);
