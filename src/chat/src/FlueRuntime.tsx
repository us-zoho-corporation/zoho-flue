import { useFlueAgent } from '@flue/react';
import { createContext, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { collapseTurns, isAssistantMessage } from './flue-model.ts';
import type { ChatMessage } from './flue-model.ts';

export { isAssistantMessage };
export type { ChatMessage, ToolCallInfo, AssistantMessage } from './flue-model.ts';

// ─── Chat context ──────────────────────────────────────────────────────────────

export interface FlueChat {
  messages: ChatMessage[];
  timestamps: Map<string, number>;
  isRunning: boolean;
  historyReady: boolean;
  error: Error | undefined;
  sendMessage: (text: string) => Promise<void>;
}

const FlueChatContext = createContext<FlueChat>({
  messages: [],
  timestamps: new Map(),
  isRunning: false,
  historyReady: false,
  error: undefined,
  sendMessage: async () => {},
});

export const useFlueChat = () => useContext(FlueChatContext);

// ─── Bridge component ─────────────────────────────────────────────────────────

interface FlueAssistantBridgeProps {
  agentName: string;
  conversationId: string;
  onFirstMessage?: (text: string) => void;
  children: ReactNode;
}

export function FlueAssistantBridge({ agentName, conversationId, onFirstMessage, children }: FlueAssistantBridgeProps) {
  // Follow live events over a single SSE connection rather than the default
  // long-poll cycle — lower per-event latency, so tool-activity progress and the
  // final answer surface as soon as the server emits them.
  const agent = useFlueAgent({ name: agentName, id: conversationId, live: 'sse' });
  const timestamps = useRef<Map<string, number>>(new Map());

  const isRunning = agent.status === 'submitted' || agent.status === 'streaming';

  // Collapse the flat message list into one entry per assistant turn. The
  // trailing in-flight turn is included the same way as completed turns, so its
  // tool steps render inline and in place — no separate floating activity view.
  const messages = useMemo(() => collapseTurns(agent.messages), [agent.messages]);

  // Stamp new message IDs as they appear.
  useMemo(() => {
    const now = Date.now();
    for (const msg of agent.messages) {
      if (!timestamps.current.has(msg.id)) timestamps.current.set(msg.id, now);
    }
  }, [agent.messages]);

  const chat = useMemo<FlueChat>(
    () => ({
      messages,
      timestamps: timestamps.current,
      isRunning,
      historyReady: agent.historyReady,
      error: agent.error,
      sendMessage: (text: string) => {
        if (onFirstMessage && agent.messages.filter((m) => m.role === 'user').length === 0) {
          onFirstMessage(text);
        }
        return agent.sendMessage(text);
      },
    }),
    [messages, isRunning, agent.historyReady, agent.error, agent.sendMessage],
  );

  return (
    <FlueChatContext.Provider value={chat}>
      {children}
    </FlueChatContext.Provider>
  );
}
