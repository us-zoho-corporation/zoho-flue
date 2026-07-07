import { useFlueClient } from '@flue/react';
import type { AgentConversationObservation, FlueClient, FlueConversationMessage, FlueConversationState } from '@flue/sdk';
import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { collapseTurns } from './flue-model.ts';
import { FlueChatContext, type FlueChat } from './FlueRuntime.tsx';

// A conversation whose response has finished and is no longer visible is kept
// observed for this grace period, then its connection is released.
const CLOSE_GRACE_MS = 3000;

/**
 * Concatenates the text parts of a conversation message.
 * @param msg - The message to extract text from.
 * @returns The joined text content, or an empty string if the message has none.
 */
function textOf(msg: FlueConversationMessage): string {
  return msg.parts.filter((p) => p.type === 'text').map((p) => ('text' in p ? p.text : '')).join('');
}

/**
 * A response is in flight when a tracked submission has no settlement yet.
 * @param conv - The conversation state to inspect, if the conversation has loaded.
 * @returns Whether the conversation has a message with a submission that hasn't settled.
 */
function computeRunning(conv: FlueConversationState | undefined): boolean {
  if (!conv) return false;
  const settled = new Set(conv.settlements.map((s) => s.submissionId));
  return conv.messages.some((m) => m.submissionId && !settled.has(m.submissionId));
}

interface Entry {
  observation: AgentConversationObservation;
  unsub: () => void;
  overlay?: FlueConversationMessage; // optimistic user echo until the durable copy arrives
  closeTimer?: ReturnType<typeof setTimeout>;
}

/**
 * App-level store over `client.agents.observe()`. Each conversation's durable
 * observation lives here — decoupled from React component/view lifetime — so a
 * response keeps streaming in its own thread regardless of what's on screen. Only
 * the active conversation plus any still-running ones hold a live connection.
 */
export class ConversationsStore {
  private entries = new Map<string, Entry>();
  private views = new Map<string, FlueChat>();
  private senders = new Map<string, (text: string) => Promise<void>>();
  private stoppers = new Map<string, () => Promise<void>>();
  private listeners = new Set<() => void>();
  private activeId?: string;
  private running: Set<string> = new Set(); // stable ref; replaced only when membership changes

  /**
   * Creates a store bound to a single agent, backed by the given Flue client.
   * @param client - The Flue client used to observe/send/abort agent conversations.
   * @param agentName - The name of the agent whose conversations this store manages.
   */
  constructor(private readonly client: FlueClient, private readonly agentName: string) {}

  /**
   * Registers a listener to be notified whenever the store's state changes.
   * @param fn - The listener to invoke on each change.
   * @returns A function that unsubscribes `fn` when called.
   */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  /** Notifies all subscribed listeners that the store's state has changed. */
  private emit() { for (const fn of this.listeners) fn(); }

  /**
   * Returns the memoized `sendMessage` function for a conversation, creating it
   * on first use so identity stays stable across renders.
   * @param convId - The conversation id to get a sender for.
   * @returns A function that sends a text message to the conversation.
   */
  private senderFor(convId: string): (text: string) => Promise<void> {
    let s = this.senders.get(convId);
    if (!s) { s = (text: string) => this.send(convId, text); this.senders.set(convId, s); }
    return s;
  }
  /**
   * Returns the memoized `stop` function for a conversation, creating it on
   * first use so identity stays stable across renders.
   * @param convId - The conversation id to get a stopper for.
   * @returns A function that aborts the conversation's in-flight response.
   */
  private stopperFor(convId: string): () => Promise<void> {
    let s = this.stoppers.get(convId);
    if (!s) { s = () => this.abort(convId); this.stoppers.set(convId, s); }
    return s;
  }

  /**
   * Updates the running-conversation set, replacing it (rather than mutating
   * in place) only when membership actually changes, to keep the exposed ref stable.
   * @param convId - The conversation id whose running state changed.
   * @param isRunning - Whether the conversation now has an in-flight response.
   */
  private setRunning(convId: string, isRunning: boolean) {
    if (this.running.has(convId) === isRunning) return;
    const next = new Set(this.running);
    if (isRunning) next.add(convId); else next.delete(convId);
    this.running = next;
  }

  /**
   * Stable set of conversation ids with an in-flight response.
   * @returns The current set of running conversation ids.
   */
  runningIds(): Set<string> { return this.running; }

  /**
   * Aborts the in-flight response for a conversation. Errors from the abort
   * call are swallowed since the caller has no useful recovery action.
   * @param convId - The conversation id to abort.
   */
  async abort(convId: string): Promise<void> {
    try { await this.client.agents.abort(this.agentName, convId); } catch { /* ignore */ }
  }

  /** Closes every observation and clears all state (e.g. on logout). */
  reset() {
    for (const convId of [...this.entries.keys()]) this.close(convId);
    this.activeId = undefined;
    this.views.clear();
    this.senders.clear();
    this.stoppers.clear();
    this.running = new Set();
    this.emit();
  }

  /**
   * Returns the entry for a conversation, opening a live observation and
   * subscribing to it if one doesn't already exist.
   * @param convId - The conversation id to open.
   * @returns The (possibly newly created) entry for the conversation.
   */
  private ensureOpen(convId: string): Entry {
    const existing = this.entries.get(convId);
    if (existing) return existing;
    const observation = this.client.agents.observe(this.agentName, convId, { live: 'sse' });
    const entry: Entry = { observation, unsub: () => {} };
    this.entries.set(convId, entry);
    entry.unsub = observation.subscribe(() => this.recompute(convId));
    this.recompute(convId);
    return entry;
  }

  /**
   * Tears down and releases a conversation's observation and view, marking it
   * no longer running. No-op if the conversation has no open entry.
   * @param convId - The conversation id to close.
   */
  private close(convId: string) {
    const entry = this.entries.get(convId);
    if (!entry) return;
    if (entry.closeTimer) clearTimeout(entry.closeTimer);
    try { entry.unsub(); } catch { /* ignore */ }
    try { entry.observation.close(); } catch { /* ignore */ }
    this.entries.delete(convId);
    this.views.delete(convId);
    this.setRunning(convId, false);
    this.emit();
  }

  /**
   * Open (and keep) the active conversation; release the previous one if idle.
   * @param convId - The conversation id to make active.
   */
  setActive(convId: string) {
    if (this.activeId === convId && this.entries.has(convId)) return;
    const prev = this.activeId;
    this.activeId = convId;
    this.ensureOpen(convId);
    this.reevaluateGc(convId);
    if (prev && prev !== convId) this.reevaluateGc(prev);
    this.emit();
  }

  /**
   * Schedules (or cancels) the close-on-idle timer for a conversation: active,
   * running, or overlay-pending conversations are kept open indefinitely;
   * others are closed after `CLOSE_GRACE_MS`. No-op if the conversation has no
   * open entry.
   * @param convId - The conversation id to re-evaluate.
   */
  private reevaluateGc(convId: string) {
    const entry = this.entries.get(convId);
    if (!entry) return;
    const view = this.views.get(convId);
    const keep = convId === this.activeId || !!view?.isRunning || !!entry.overlay;
    if (keep) {
      if (entry.closeTimer) { clearTimeout(entry.closeTimer); entry.closeTimer = undefined; }
    } else if (!entry.closeTimer) {
      entry.closeTimer = setTimeout(() => this.close(convId), CLOSE_GRACE_MS);
    }
  }

  /**
   * Rebuilds the derived `FlueChat` view for a conversation from its latest
   * observation snapshot (merging in any optimistic overlay message), updates
   * the running set, re-evaluates its GC timer, and notifies subscribers.
   * No-op if the conversation has no open entry.
   * @param convId - The conversation id to recompute.
   */
  private recompute(convId: string) {
    const entry = this.entries.get(convId);
    if (!entry) return;
    const snap = entry.observation.getSnapshot();
    const conv = snap.conversation;

    // Drop the optimistic echo once its durable copy is recorded.
    if (entry.overlay && conv?.messages.some((m) => m.role === 'user' && !!m.submissionId && textOf(m) === textOf(entry.overlay!))) {
      entry.overlay = undefined;
    }

    const running = computeRunning(conv) || !!entry.overlay;
    const merged = entry.overlay ? [...(conv?.messages ?? []), entry.overlay] : (conv?.messages ?? []);
    this.views.set(convId, {
      messages: collapseTurns(merged),
      isRunning: running,
      historyReady: snap.phase !== 'loading',
      error: snap.error,
      sendMessage: this.senderFor(convId),
      stop: this.stopperFor(convId),
    });
    this.setRunning(convId, running);
    this.reevaluateGc(convId);
    this.emit();
  }

  /**
   * Sends a user message to a conversation, showing an optimistic echo of it
   * immediately and rolling the echo back if the send fails.
   * @param convId - The conversation id to send to.
   * @param text - The message text to send.
   * @throws {Error} If `client.agents.send` rejects (e.g. network failure); rethrown after the optimistic echo is rolled back.
   */
  async send(convId: string, text: string): Promise<void> {
    const entry = this.ensureOpen(convId);
    entry.overlay = {
      id: `optimistic-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text, state: 'done' }],
      metadata: { timestamp: new Date().toISOString() },
    } as FlueConversationMessage;
    this.recompute(convId); // reflect the echo immediately
    try {
      await this.client.agents.send(this.agentName, convId, { message: text });
      // The instance may have been `absent` when we started observing (a brand-new
      // conversation). `send` just created it, so refresh the observation to catch
      // up and begin following the streamed response. (No-op if already live.)
      entry.observation.refresh();
    } catch (err) {
      entry.overlay = undefined; // roll back the echo on failure
      this.recompute(convId);
      throw err;
    }
  }

  /**
   * Returns a conversation's current view, creating an empty placeholder view
   * (without opening an observation) if none exists yet.
   * @param convId - The conversation id to get the view for.
   * @returns The conversation's current `FlueChat` view.
   */
  getView(convId: string): FlueChat {
    let v = this.views.get(convId);
    if (!v) {
      v = { messages: [], isRunning: false, historyReady: false, error: undefined, sendMessage: this.senderFor(convId), stop: this.stopperFor(convId) };
      this.views.set(convId, v);
    }
    return v;
  }
}

// ─── React glue ──────────────────────────────────────────────────────────────

const StoreContext = createContext<ConversationsStore | null>(null);

/**
 * Creates (and memoizes) a `ConversationsStore` for the given agent and makes
 * it available to descendants via context.
 * @param agentName - The name of the agent whose conversations are managed.
 * @param children - The subtree that can access the store via {@link useConversationsStore}.
 * @returns The context provider element wrapping `children`.
 */
export function ConversationsProvider({ agentName, children }: { agentName: string; children: ReactNode }) {
  const client = useFlueClient();
  const store = useMemo(() => new ConversationsStore(client, agentName), [client, agentName]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/**
 * Reads the `ConversationsStore` from context.
 * @returns The current `ConversationsStore`.
 * @throws {Error} If called outside a `ConversationsProvider`.
 */
export function useConversationsStore(): ConversationsStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useConversationsStore must be used within a ConversationsProvider');
  return store;
}

/**
 * Selects one conversation's live view from the store.
 * @param convId - The conversation id to subscribe to.
 * @returns The conversation's current `FlueChat` view, kept in sync with the store.
 */
export function useConversation(convId: string): FlueChat {
  const store = useConversationsStore();
  return useSyncExternalStore(store.subscribe, () => store.getView(convId));
}

/**
 * The set of conversation ids with an in-flight response (stable ref).
 * @returns The current set of running conversation ids, kept in sync with the store.
 */
export function useRunningIds(): Set<string> {
  const store = useConversationsStore();
  return useSyncExternalStore(store.subscribe, () => store.runningIds());
}

/**
 * Provides the active conversation's view to the existing FlueChatContext so
 * `Thread` reads it unchanged. `onFirstMessage` fires when the first user message
 * is sent in an empty conversation.
 * @param convId - The conversation id whose view is provided.
 * @param onFirstMessage - Optional callback fired with the message text when the first user message is sent in an empty conversation.
 * @param children - The subtree that reads the conversation via `FlueChatContext`.
 * @returns The `FlueChatContext` provider element wrapping `children`.
 */
export function ActiveConversation({ convId, onFirstMessage, children }: { convId: string; onFirstMessage?: (text: string) => void; children: ReactNode }) {
  const view = useConversation(convId);
  const chat = useMemo<FlueChat>(() => ({
    ...view,
    /**
     * Sends a message on the active conversation, invoking `onFirstMessage`
     * first if this is the conversation's first user message.
     * @param text - The message text to send.
     * @returns A promise that resolves once the underlying send completes.
     */
    sendMessage: (text: string) => {
      if (onFirstMessage && !view.messages.some((m) => m.role === 'user')) onFirstMessage(text);
      return view.sendMessage(text);
    },
  }), [view, onFirstMessage]);
  return <FlueChatContext.Provider value={chat}>{children}</FlueChatContext.Provider>;
}
