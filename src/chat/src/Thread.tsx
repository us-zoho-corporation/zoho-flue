import {
  ArrowClockwise,
  ArrowUp,
  CaretRight,
  ChartBar,
  Check,
  Cloud,
  Copy,
  EnvelopeSimple,
  Headset,
  Info,
  Moon,
  Sparkle,
  Square,
  Sun,
  WarningCircle,
} from '@phosphor-icons/react';
import { Badge, Banner, Button, Collapsible, Loader, SidebarTrigger } from '@cloudflare/kumo';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { type ToolCallInfo, type ChatMessage, isAssistantMessage, useFlueChat } from './FlueRuntime.tsx';
import { A2uiPart } from './a2ui/index.ts';
import type { Theme } from './theme.ts';
import type { FlueConversationMessage } from '@flue/react';

interface ThreadProps {
  modelLabel: string;
  requiresAuth: boolean;
  isSignedIn: boolean;
  onSignIn: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

function textOf(message: FlueConversationMessage): string {
  return message.parts.filter((p) => p.type === 'text').map((p) => ('text' in p ? p.text : '')).join('');
}

export function Thread({ modelLabel, requiresAuth, isSignedIn, onSignIn, theme, onToggleTheme }: ThreadProps) {
  const { messages, isRunning, historyReady, error, sendMessage, stop } = useFlueChat();
  // This conversation's model runs as the logged-in user, but nobody is signed in.
  const authGate = requiresAuth && !isSignedIn;
  const viewportRef = useRef<HTMLDivElement>(null);

  const last = messages[messages.length - 1];
  // The agent is working but hasn't produced its assistant turn yet — show a
  // pending "Thinking" turn so the thread never sits silent.
  const showPending = isRunning && (!last || last.role === 'user');

  const lastAssistantEmpty = !!last && last.role === 'assistant'
    && !last.parts.some((p) => p.type === 'text' && p.text)
    && (!isAssistantMessage(last) || last.uiParts.length === 0);
  const noReply = historyReady && !isRunning && (last?.role === 'user' || lastAssistantEmpty);
  const lastUserText = [...messages].reverse().find((m) => m.role === 'user');

  useEffect(() => {
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isRunning]);

  const empty = historyReady && messages.length === 0 && !showPending;

  return (
    <div className="chat-area flex-1 min-w-0">
      <div className="chat-topbar">
        <div className="hdr-left">
          <SidebarTrigger className="icon-btn" />
          <div className="hdr-divider" />
          <div className="hdr-spark"><Sparkle size={14} weight="fill" /></div>
          <span className="hdr-title">Zoho AI</span>
          <span className="hdr-sub">Across your Zoho One apps</span>
        </div>
        <button className="icon-btn" onClick={onToggleTheme} title="Switch theme" aria-label="Switch theme">
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>

      <div ref={viewportRef} className="chat-viewport">
        {empty ? (
          <WelcomeState onPrompt={authGate ? () => onSignIn() : sendMessage} />
        ) : (
          <div className="chat-messages">
            {!historyReady && <div className="history-loading"><Loader size="sm" /></div>}
            {messages.map((msg, idx) => (
              msg.role === 'user'
                ? <UserMessage key={msg.id} message={msg} />
                : <AssistantTurn
                    key={msg.id}
                    message={msg as ChatMessage}
                    running={isRunning && idx === messages.length - 1}
                  />
            ))}
            {showPending && <PendingTurn />}
            {noReply && (
              <NoReplyNotice error={error} onRetry={() => lastUserText && sendMessage(textOf(lastUserText))} />
            )}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <div className="composer-inner">
          {authGate ? (
            <div className="composer-signin">
              <span className="composer-signin-msg">
                <Sparkle size={16} weight="fill" />
                Sign in with Zoho to use {modelLabel}
              </span>
              <button className="composer-signin-btn" onClick={onSignIn}>Sign in</button>
            </div>
          ) : (
            <Composer modelLabel={modelLabel} isRunning={isRunning} onSend={sendMessage} onStop={stop} />
          )}
        </div>
        <p className="composer-disclaimer">Responses can contain mistakes — verify anything important.</p>
      </div>
    </div>
  );
}

// ─── Welcome / suggestions ───────────────────────────────────────────────────

const SUGGESTIONS: { icon: typeof ChartBar; title: string; sub: string; prompt: string }[] = [
  { icon: ChartBar, title: 'Zoho CRM workflows', sub: 'How do I automate a workflow rule?', prompt: 'How do I create a workflow rule in Zoho CRM?' },
  { icon: EnvelopeSimple, title: 'Zoho Mail setup', sub: 'Filters, signatures, and forwarding', prompt: 'How do I set up email filters in Zoho Mail?' },
  { icon: Headset, title: 'Zoho Desk tickets', sub: 'SLAs and ticket automation', prompt: 'How do I configure SLAs in Zoho Desk?' },
  { icon: Cloud, title: 'Build on Catalyst', sub: 'Data Store, functions, and auth', prompt: 'What is the Zoho Catalyst Data Store and when should I use it?' },
];

function WelcomeState({ onPrompt }: { onPrompt: (text: string) => void }) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-mark"><Sparkle size={32} weight="regular" /></div>
        <h1>What can I help with?</h1>
        <p>Ask across your Zoho apps — summarize, draft, look things up in the docs, and take the next step.</p>
        <div className="welcome-grid">
          {SUGGESTIONS.map(({ icon: Icon, title, sub, prompt }) => (
            <button key={title} className="welcome-card" onClick={() => onPrompt(prompt)}>
              <span className="welcome-card-title"><Icon size={18} weight="fill" />{title}</span>
              <span className="welcome-card-sub">{sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── User message ────────────────────────────────────────────────────────────

function UserMessage({ message }: { message: FlueConversationMessage }) {
  return (
    <div className="msg-user msg-assistant-appear">
      <div className="msg-user-inner">
        <div className="msg-user-bubble">{textOf(message)}</div>
      </div>
    </div>
  );
}

// ─── Assistant turn ──────────────────────────────────────────────────────────

export function AssistantTurn({ message, running }: { message: ChatMessage; running: boolean }) {
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
    <div className="msg-assistant msg-assistant-appear">
      <div className="msg-avatar"><Sparkle size={15} weight="fill" /></div>
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
            <button className="icon-btn" aria-label="Copy answer" onClick={copy} title={copied ? 'Copied!' : 'Copy'}>
              <Copy size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool trace (the process) ────────────────────────────────────────────────

function ToolTrace({ steps, running }: { steps: ToolCallInfo[]; running: boolean }) {
  const [open, setOpen] = useState(false);

  // While running, the steps are the live focus — glass cards in place.
  if (running) {
    return (
      <div className="tool-trace-live">
        {steps.map((tc, i) => <ToolCallRow key={tc.toolCallId} {...tc} index={i} />)}
      </div>
    );
  }

  // Finished: collapse to a compact Kumo Badge, expandable.
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
    <div className="thinking-dots"><span /><span /><span /></div>
  );
}

function PendingTurn() {
  return (
    <div className="msg-assistant msg-assistant-appear">
      <div className="msg-avatar"><Sparkle size={15} weight="fill" /></div>
      <div className="msg-assistant-content"><ThinkingRow /></div>
    </div>
  );
}

function inputSummary(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  const query = obj['query'] ?? obj['search'] ?? obj['keyword'] ?? obj['q'];
  if (typeof query === 'string' && query.trim()) return `“${query.trim()}”`;
  const url = obj['url'] ?? obj['path'] ?? obj['endpoint'];
  if (typeof url === 'string') {
    try { return new URL(url).pathname; } catch { return url; }
  }
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
  const detail = inputSummary(input);
  return detail ? `${verb} ${detail}` : verb;
}

export function ToolCallRow({ toolName, state, input, index }: ToolCallInfo & { index: number }) {
  const running = state === 'input-available';
  const errored = state === 'output-error';

  return (
    <div className="tool-row tool-row-enter" style={{ animationDelay: `${index * 55}ms` }}>
      <span className="tool-row-icon"><Sparkle size={15} weight="fill" /></span>
      <span className={`tool-row-label${running ? ' is-running' : ''}`} style={{ flex: 1, minWidth: 0 }}>
        {friendlyLabel(toolName, state, input)}
      </span>
      {running && <div className="tool-spinner" />}
      {!running && errored && <WarningCircle size={18} weight="fill" style={{ color: 'var(--danger)', flexShrink: 0 }} />}
      {!running && !errored && <span className="tool-row-dot"><Check size={12} weight="bold" /></span>}
    </div>
  );
}

// ─── No-reply / error fallback ───────────────────────────────────────────────

export function NoReplyNotice({ error, onRetry }: { error?: Error; onRetry: () => void }) {
  return (
    <div className="msg-assistant msg-assistant-appear">
      <div className="msg-avatar"><Sparkle size={15} weight="fill" /></div>
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
  modelLabel: string;
  isRunning: boolean;
  onSend: (text: string) => Promise<void>;
  onStop: () => void;
}

function Composer({ modelLabel, isRunning, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      <div className="composer-row">
        <textarea
          ref={textareaRef}
          autoFocus
          placeholder="Ask anything about your Zoho workspace"
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {isRunning ? (
          <button className="composer-send" aria-label="Stop" title="Stop" onClick={onStop}>
            <Square size={15} weight="fill" />
          </button>
        ) : (
          <button className="composer-send" aria-label="Send" onClick={handleSend} disabled={!value.trim()}>
            <ArrowUp size={17} weight="bold" />
          </button>
        )}
      </div>
      <span className="composer-model" title="Change the model for new conversations in Settings">{modelLabel}</span>
    </div>
  );
}
