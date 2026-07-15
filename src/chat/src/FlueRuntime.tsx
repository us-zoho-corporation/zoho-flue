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

/** One image attachment to send with a message — mirrors Flue's `AgentPromptImage`. */
export interface ChatAttachment {
  /** Base64-encoded image bytes (no `data:` prefix). */
  data: string;
  mimeType: string;
  filename?: string;
}

export interface FlueChat {
  messages: ChatMessage[];
  isRunning: boolean;
  historyReady: boolean;
  error: Error | undefined;
  sendMessage: (text: string, images?: ChatAttachment[]) => Promise<void>;
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

/**
 * Reads the live view of the active conversation from `FlueChatContext`.
 * @returns The current `FlueChat` value (messages, running/history-ready flags, error, and the `sendMessage`/`stop` actions) for the nearest `FlueChatContext.Provider`, or the inert default context value if none is present.
 */
export const useFlueChat = () => useContext(FlueChatContext);
