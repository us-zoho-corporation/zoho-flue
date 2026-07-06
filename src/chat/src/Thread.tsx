import {
  ArrowClockwise,
  ArrowUp,
  CaretRight,
  Copy,
  Info,
  WarningCircle,
} from '@phosphor-icons/react';
import { Badge, Banner, Button, Collapsible, Empty, Loader, Popover, Select, SidebarTrigger, useSidebar } from '@cloudflare/kumo';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import type { ModelOption, UserProfile } from './App.tsx';
import { type ToolCallInfo, type ChatMessage, isAssistantMessage, useFlueChat } from './FlueRuntime.tsx';
import { A2uiPart } from './a2ui/index.ts';
import type { FlueConversationMessage } from '@flue/react';

interface ThreadProps {
  models: ModelOption[];
  modelsLoading: boolean;
  modelKey: string;
  onModelChange: (key: string) => void;
  profile: UserProfile | null;
}

function textOf(message: FlueConversationMessage): string {
  return message.parts.filter((p) => p.type === 'text').map((p) => ('text' in p ? p.text : '')).join('');
}

export function Thread({ models, modelsLoading, modelKey, onModelChange, profile }: ThreadProps) {
  const { messages, timestamps, isRunning, historyReady, error, sendMessage } = useFlueChat();
  const { open: sidebarOpen } = useSidebar();
  const viewportRef = useRef<HTMLDivElement>(null);

  const last = messages[messages.length - 1];
  // The agent is working but hasn't produced its assistant turn yet (just
  // submitted) — show a pending "Thinking" turn so the thread never sits silent.
  const showPending = isRunning && (!last || last.role === 'user');

  // A finished run whose final entry carries no answer (last visible entry is the
  // user's message, or an assistant turn with steps but no text/visualization)
  // means nothing was written back. Never leave the user with silence.
  const lastAssistantEmpty = !!last && last.role === 'assistant'
    && !last.parts.some((p) => p.type === 'text' && p.text)
    && (!isAssistantMessage(last) || last.uiParts.length === 0);
  const noReply = historyReady && !isRunning && (last?.role === 'user' || lastAssistantEmpty);
  const lastUserText = [...messages].reverse().find((m) => m.role === 'user');

  useEffect(() => {
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isRunning]);

  return (
    <div className="chat-area flex-1 min-w-0">
      <div className="chat-topbar">
        {!sidebarOpen && <SidebarTrigger />}
        <div className="ml-auto">
          {profile && <ProfileAvatar profile={profile} />}
        </div>
      </div>
      <div ref={viewportRef} className="chat-viewport">
        <div className="chat-messages">
          {!historyReady && (
            <div className="history-loading"><Loader size="sm" /></div>
          )}
          {historyReady && messages.length === 0 && !showPending && (
            <EmptyState />
          )}
          {messages.map((msg, idx) => (
            msg.role === 'user'
              ? <UserMessage key={msg.id} message={msg} ts={timestamps.get(msg.id)} />
              : <AssistantTurn
                  key={msg.id}
                  message={msg as ChatMessage}
                  ts={timestamps.get(msg.id)}
                  running={isRunning && idx === messages.length - 1}
                />
          ))}
          {showPending && <PendingTurn />}
          {noReply && (
            <NoReplyNotice error={error} onRetry={() => lastUserText && sendMessage(textOf(lastUserText))} />
          )}
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer-inner">
          <Composer
            models={models}
            modelsLoading={modelsLoading}
            modelKey={modelKey}
            onModelChange={onModelChange}
            isRunning={isRunning}
            onSend={sendMessage}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Profile avatar + popover ──────────────────────────────────────────────────

function ProfileAvatar({ profile }: { profile: UserProfile }) {
  const nameParts = profile.displayName.trim().split(/\s+/);
  const initials = (
    profile.firstName && profile.lastName
      ? profile.firstName[0] + profile.lastName[0]
      : nameParts.length >= 2
        ? nameParts[0][0] + nameParts[nameParts.length - 1][0]
        : nameParts[0]?.[0] ?? '?'
  ).toUpperCase();

  const avatarContent = profile.photoUrl ? (
    <img src={profile.photoUrl} alt={profile.displayName} className="w-full h-full object-cover" />
  ) : (
    <span>{initials}</span>
  );

  const largeAvatar = profile.photoUrl ? (
    <img src={profile.photoUrl} alt={profile.displayName} className="w-full h-full object-cover" />
  ) : (
    <span className="text-xl font-semibold text-red-300">{initials}</span>
  );

  return (
    <Popover>
      <Popover.Trigger
        className="w-7 h-7 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center text-xs font-semibold text-red-300 cursor-pointer select-none shrink-0 overflow-hidden hover:border-red-400/50 transition-colors"
        aria-label="Profile"
      >
        {avatarContent}
      </Popover.Trigger>
      <Popover.Content side="bottom" align="end" sideOffset={8} className="w-64 p-0 overflow-hidden">
        <div className="p-4 flex flex-col items-center gap-3 border-b border-kumo-line">
          <div className="w-16 h-16 rounded-full bg-red-600/20 border-2 border-red-500/30 flex items-center justify-center overflow-hidden">
            {largeAvatar}
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-kumo-default">{profile.displayName}</p>
            <p className="text-xs text-kumo-subtle mt-0.5">{profile.email}</p>
          </div>
        </div>
        <div className="p-2">
          <button
            className="w-full text-left px-3 py-2 rounded-md text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={() => { /* sign-out placeholder */ }}
          >
            Sign out
          </button>
        </div>
      </Popover.Content>
    </Popover>
  );
}

function formatTs(ts: number | undefined): string {
  if (!ts) return '';
  return Temporal.Instant.fromEpochMilliseconds(ts)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="empty-state">
      <Empty
        icon={<div className="empty-logo"><span className="empty-logo-glow" />Z</div>}
        title="What can I help with?"
        description="Ask about Zoho products, APIs, and workflows. Answers are grounded in the documentation, with sources."
      />
    </div>
  );
}

// ─── User message ──────────────────────────────────────────────────────────────

function UserMessage({ message, ts }: { message: FlueConversationMessage; ts?: number }) {
  const [copied, setCopied] = useState(false);
  const text = textOf(message);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <div className="msg-user group">
      <div className="msg-user-inner">
        <div className="msg-user-bubble">{text}</div>
        <div className="msg-action-bar justify-end">
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" shape="square" size="xs" aria-label="Copy" onClick={copy} title={copied ? 'Copied!' : 'Copy'}>
              <Copy size={11} weight="fill" />
            </Button>
          </div>
          <span className="text-[11px] text-kumo-inactive">{ts ? formatTs(ts) : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Assistant turn ──────────────────────────────────────────────────────────
//
// One continuous turn, answer-first. The tool trace (the process) sits quietly on
// top — a live panel while running, a collapsed Kumo Badge/Collapsible once done.
// The written answer is the hero: borderless prose, not a boxed card. Any
// visualizations render below it in framed surfaces. Nothing teleports between the
// running and finished states.

export function AssistantTurn({ message, ts, running }: { message: ChatMessage; ts?: number; running: boolean }) {
  const [copied, setCopied] = useState(false);
  const textParts = message.parts.filter((p) => p.type === 'text' && 'text' in p && p.text);
  const fullText = textParts.map((p) => ('text' in p ? p.text : '')).join('');
  const steps = isAssistantMessage(message) ? message.toolSteps : [];
  const uiParts = isAssistantMessage(message) ? message.uiParts : [];

  const copy = useCallback(() => {
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [fullText]);

  const hasContent = textParts.length > 0 || uiParts.length > 0;
  const thinking = running && steps.length === 0 && !hasContent;

  return (
    <div className="msg-assistant msg-assistant-appear group">
      <div className="msg-avatar">Z</div>
      <div className="msg-assistant-content">
        {steps.length > 0 && <ToolTrace steps={steps} running={running} />}

        {thinking && <ThinkingRow />}

        {textParts.length > 0 && (
          <div className="answer message-content">
            {textParts.map((part, i) => (
              <Markdown key={i}>{'text' in part ? part.text : ''}</Markdown>
            ))}
          </div>
        )}

        {uiParts.length > 0 && (
          <div className="a2ui-parts flex flex-col">
            {uiParts.map((part) => <A2uiPart key={part.toolCallId} part={part} />)}
          </div>
        )}

        {!running && hasContent && (
          <div className="msg-action-bar">
            <Button variant="ghost" shape="square" size="xs" aria-label="Copy answer" onClick={copy} title={copied ? 'Copied!' : 'Copy'} className="opacity-100">
              <Copy size={11} weight="fill" />
            </Button>
            <span className="text-[11px] text-kumo-inactive">{ts ? formatTs(ts) : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool trace (the process) ────────────────────────────────────────────────

function ToolTrace({ steps, running }: { steps: ToolCallInfo[]; running: boolean }) {
  const [open, setOpen] = useState(false);

  // While running, the steps are the live focus — a quiet panel that sits in the
  // exact place the collapsed summary will occupy once the turn settles.
  if (running) {
    return (
      <div className="tool-trace-live">
        {steps.map((tc, i) => <ToolCallRow key={tc.toolCallId} {...tc} index={i} />)}
      </div>
    );
  }

  // Finished: collapse in place to a compact Kumo Badge, expandable.
  const errored = steps.some((s) => s.state === 'output-error');
  const label = `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`;
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="tool-trace">
      <Collapsible.Trigger className="tool-trace-trigger">
        <CaretRight size={11} weight="bold" className={`tool-trace-caret${open ? ' is-open' : ''}`} />
        <Badge variant={errored ? 'warning' : 'secondary'}>{errored ? `${label} · issue` : label}</Badge>
      </Collapsible.Trigger>
      <Collapsible.Panel className="tool-trace-panel">
        {steps.map((tc, i) => <ToolCallRow key={tc.toolCallId} {...tc} index={i} />)}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function ThinkingRow() {
  return (
    <div className="assistant-status">
      <Loader size="sm" />
      <span>Thinking…</span>
    </div>
  );
}

function PendingTurn() {
  return (
    <div className="msg-assistant msg-assistant-appear">
      <div className="msg-avatar">Z</div>
      <div className="msg-assistant-content">
        <ThinkingRow />
      </div>
    </div>
  );
}

function inputSummary(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  // Prefer explicit query/search/keyword fields
  const query = obj['query'] ?? obj['search'] ?? obj['keyword'] ?? obj['q'];
  if (typeof query === 'string' && query.trim()) return `“${query.trim()}”`;
  // For URL-based tools show the path
  const url = obj['url'] ?? obj['path'] ?? obj['endpoint'];
  if (typeof url === 'string') {
    try { return new URL(url).pathname; } catch { return url; }
  }
  void name;
  return '';
}

function friendlyLabel(name: string, state: ToolCallInfo['state'], input: unknown): string {
  const running = state === 'input-available';
  const map: Record<string, [string, string]> = {
    search_docs:           ['Searching',  'Searched'],
    zoho_kb_search:        ['Searching',  'Searched'],
    get_page:              ['Reading',    'Read'],
    list_products:         ['Listing',    'Listed'],
    zoho_kb_list_products: ['Listing',    'Listed'],
    zoho_api:              ['Fetching',   'Fetched'],
  };
  const snake = name.replace(/_/g, ' ');
  const [present, past] = map[name] ?? [snake, snake];
  const verb = running ? present : past;
  const detail = inputSummary(name, input);
  return detail ? `${verb} ${detail}` : verb;
}

export function ToolCallRow({ toolName, state, input, index }: ToolCallInfo & { index: number }) {
  const running = state === 'input-available';
  const errored = state === 'output-error';

  return (
    <div className="tool-row tool-row-enter" style={{ animationDelay: `${index * 55}ms` }}>
      <span className="tool-row-icon">
        {running
          ? <Loader size={13} />
          : errored
            ? <WarningCircle size={13} weight="fill" className="text-kumo-danger" />
            : <span className="tool-row-dot" />}
      </span>
      <span className={`tool-row-label${running ? ' is-running' : ''}`}>
        {friendlyLabel(toolName, state, input)}
      </span>
    </div>
  );
}

// ─── No-reply / error fallback ───────────────────────────────────────────────

export function NoReplyNotice({ error, onRetry }: { error?: Error; onRetry: () => void }) {
  return (
    <div className="msg-assistant msg-assistant-appear">
      <div className="msg-avatar">Z</div>
      <div className="msg-assistant-content">
        <Banner
          variant={error ? 'error' : 'secondary'}
          icon={error ? <WarningCircle size={18} weight="fill" /> : <Info size={18} weight="fill" />}
          title={error ? 'Something went wrong while answering.' : 'I couldn’t find an answer to that.'}
          description={error
            ? error.message
            : 'This can happen when the documentation doesn’t cover your question. Try rephrasing, or ask again.'}
          action={
            <Button variant="secondary" size="xs" onClick={onRetry}>
              <ArrowClockwise size={12} /> Ask again
            </Button>
          }
        />
      </div>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

interface ComposerProps {
  models: ModelOption[];
  modelsLoading: boolean;
  modelKey: string;
  onModelChange: (key: string) => void;
  isRunning: boolean;
  onSend: (text: string) => Promise<void>;
}

function Composer({ models, modelsLoading, modelKey, onModelChange, isRunning, onSend }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasChoice = models.length > 1;

  const handleSend = useCallback(() => {
    const text = value.trim();
    if (!text || isRunning) return;
    setValue('');
    onSend(text);
  }, [value, isRunning, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  return (
    <div className="composer-root">
      <textarea
        ref={textareaRef}
        autoFocus
        placeholder="Ask anything…"
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      <div className="composer-footer">
        {!modelsLoading && hasChoice && (
          <Select
            size="xs"
            aria-label="Model"
            value={modelKey}
            onValueChange={(v) => onModelChange(v as string)}
            renderValue={(v) => models.find((m) => m.key === v)?.label ?? String(v)}
            className="composer-agent-select"
          >
            {models.map((m) => (
              <Select.Option key={m.key} value={m.key}>{m.label}</Select.Option>
            ))}
          </Select>
        )}
        {!modelsLoading && !hasChoice && (
          <span className="text-xs text-kumo-inactive px-1">{models.find((m) => m.key === modelKey)?.label ?? modelKey}</span>
        )}

        <div className="ml-auto">
          {/* No cancel affordance: useFlueAgent exposes no abort. Send is disabled while a run is in flight. */}
          <Button variant="primary" shape="square" size="sm" aria-label="Send" onClick={handleSend} disabled={!value.trim() || isRunning}>
            <ArrowUp size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}
