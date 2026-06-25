import { useFlueAgent, type UIMessage } from '@flue/react';
import { createContext, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

// ─── Tool activity context ─────────────────────────────────────────────────────

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  state: 'input-available' | 'output-available' | 'output-error';
  input: unknown;
}

export interface FlueActivity {
  toolCalls: ToolCallInfo[];
  isRunning: boolean;
}

export const FlueActivityContext = createContext<FlueActivity>({ toolCalls: [], isRunning: false });
export const useFlueActivity = () => useContext(FlueActivityContext);

// ─── Chat context ──────────────────────────────────────────────────────────────

export interface AssistantMessage extends UIMessage {
  toolSteps: ToolCallInfo[];
}

export type ChatMessage = UIMessage | AssistantMessage;

export function isAssistantMessage(m: ChatMessage): m is AssistantMessage {
  return m.role === 'assistant';
}

export interface FlueChat {
  messages: ChatMessage[];
  timestamps: Map<string, number>;
  isRunning: boolean;
  historyReady: boolean;
  sendMessage: (text: string) => Promise<void>;
}

const FlueChatContext = createContext<FlueChat>({
  messages: [],
  timestamps: new Map(),
  isRunning: false,
  historyReady: false,
  sendMessage: async () => {},
});

function collectToolStepsBefore(msgs: UIMessage[], idx: number): ToolCallInfo[] {
  const calls: ToolCallInfo[] = [];
  for (let i = idx - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'user') break;
    for (const part of [...m.parts].reverse()) {
      if (part.type === 'dynamic-tool') {
        calls.unshift({ toolCallId: part.toolCallId, toolName: part.toolName, state: part.state, input: part.input });
      }
    }
  }
  return calls;
}

export const useFlueChat = () => useContext(FlueChatContext);

// ─── Bridge component ─────────────────────────────────────────────────────────

interface FlueAssistantBridgeProps {
  agentName: string;
  conversationId: string;
  onFirstMessage?: (text: string) => void;
  children: ReactNode;
}

export function FlueAssistantBridge({ agentName, conversationId, onFirstMessage, children }: FlueAssistantBridgeProps) {
  const agent = useFlueAgent({ name: agentName, id: conversationId });
  const timestamps = useRef<Map<string, number>>(new Map());

  const isRunning = agent.status === 'submitted' || agent.status === 'streaming';

  // Filter out tool-call-only messages and mid-turn preamble text from visible chat.
  // Suppressed cases:
  //   1. Message has no text (tool-call-only).
  //   2. Message contains tool calls alongside text (mixed — text is a preamble for those calls).
  //   3. Message has only text but is followed by a tool-call message before the next user turn.
  // Only the final text-only assistant message after all tool calls is shown.
  const messages = useMemo((): ChatMessage[] => {
    const msgs = agent.messages;
    const result: ChatMessage[] = [];
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (msg.role !== 'assistant') { result.push(msg); continue; }
      const hasText = msg.parts.some((p) => p.type === 'text' && p.text);
      if (!hasText) continue; // tool-call-only
      const hasTools = msg.parts.some((p) => p.type === 'dynamic-tool');
      if (hasTools) continue; // mixed text+tools — preamble
      // Pure text: suppress if followed by tool calls in the same turn
      let suppress = false;
      for (let j = i + 1; j < msgs.length; j++) {
        if (msgs[j].role === 'user') break;
        if (msgs[j].parts.some((p) => p.type === 'dynamic-tool')) { suppress = true; break; }
      }
      if (suppress) continue;
      const toolSteps = collectToolStepsBefore(msgs, i);
      result.push({ ...msg, toolSteps });
    }
    return result;
  }, [agent.messages]);

  // Tool calls from current run: assistant turns after last user msg with no text yet
  const currentToolCalls = useMemo((): ToolCallInfo[] => {
    const msgs = agent.messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return [];

    const calls: ToolCallInfo[] = [];
    for (let i = lastUserIdx + 1; i < msgs.length; i++) {
      const msg = msgs[i];
      if (msg.role !== 'assistant') continue;
      if (msg.parts.some((p) => p.type === 'text' && p.text)) break;
      for (const part of msg.parts) {
        if (part.type === 'dynamic-tool') {
          calls.push({ toolCallId: part.toolCallId, toolName: part.toolName, state: part.state, input: part.input });
        }
      }
    }
    return calls;
  }, [agent.messages]);

  const activity = useMemo<FlueActivity>(
    () => ({ toolCalls: currentToolCalls, isRunning }),
    [currentToolCalls, isRunning],
  );

  // Stamp new message IDs as they appear
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
      sendMessage: (text: string) => {
        if (onFirstMessage && agent.messages.filter((m) => m.role === 'user').length === 0) {
          onFirstMessage(text);
        }
        return agent.sendMessage(text);
      },
    }),
    [messages, isRunning, agent.historyReady, agent.sendMessage],
  );

  return (
    <FlueActivityContext.Provider value={activity}>
      <FlueChatContext.Provider value={chat}>
        {children}
      </FlueChatContext.Provider>
    </FlueActivityContext.Provider>
  );
}
