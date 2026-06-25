import {
  ArrowUp,
  Copy,
  StopCircle,
} from '@phosphor-icons/react';
import { Button, LayerCard, Popover, Select, SidebarTrigger, useSidebar } from '@cloudflare/kumo';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import type { AgentEntry, UserProfile } from './App.tsx';
import { type ToolCallInfo, type ChatMessage, isAssistantMessage, useFlueActivity, useFlueChat } from './FlueRuntime.tsx';
import type { UIMessage } from '@flue/react';

interface ThreadProps {
  agents: AgentEntry[];
  agentsLoading: boolean;
  agentName: string;
  onAgentChange: (name: string) => void;
  profile: UserProfile | null;
}

export function Thread({ agents, agentsLoading, agentName, onAgentChange, profile }: ThreadProps) {
  const { messages, timestamps, isRunning, historyReady, sendMessage } = useFlueChat();
  const { open: sidebarOpen } = useSidebar();
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, isRunning]);

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
            <div className="history-loading">Loading…</div>
          )}
          {historyReady && messages.length === 0 && (
            <EmptyState agentName={agentName} />
          )}
          {messages.map((msg) => (
            msg.role === 'user'
              ? <UserMessage key={msg.id} message={msg} ts={timestamps.get(msg.id)} />
              : <AssistantMessage key={msg.id} message={msg as ChatMessage} ts={timestamps.get(msg.id)} />
          ))}
          <ToolActivity />
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer-inner">
          <Composer
            agents={agents}
            agentsLoading={agentsLoading}
            agentName={agentName}
            onAgentChange={onAgentChange}
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

function EmptyState({ agentName }: { agentName: string }) {
  return (
    <div className="empty-state">
      <div className="empty-logo-wrap">
        <div className="empty-logo-glow" />
        <div className="empty-logo-mark">Z</div>
      </div>
      <div>
        <p className="empty-title">What can I help with?</p>
        <p className="empty-subtitle">
          Ask about {agentName} — Zoho products, APIs, and workflows.
        </p>
      </div>
    </div>
  );
}

// ─── User message ──────────────────────────────────────────────────────────────

function UserMessage({ message, ts }: { message: UIMessage; ts?: number }) {
  const [copied, setCopied] = useState(false);
  const text = message.parts.filter((p) => p.type === 'text').map((p) => 'text' in p ? p.text : '').join('');

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

// ─── Assistant message ─────────────────────────────────────────────────────────

function AssistantMessage({ message, ts }: { message: ChatMessage; ts?: number }) {
  const [copied, setCopied] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const textParts = message.parts.filter((p) => p.type === 'text' && 'text' in p && p.text);
  const fullText = textParts.map((p) => 'text' in p ? p.text : '').join('');
  const toolSteps = isAssistantMessage(message) ? message.toolSteps : [];

  const copy = useCallback(() => {
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [fullText]);

  return (
    <div className="msg-assistant msg-assistant-appear group">
      <div className="msg-avatar">Z</div>
      <div className="msg-assistant-content">
        <LayerCard className="px-4 py-3 rounded-tl-sm">
          <div className="message-content">
            {textParts.map((part, i) => (
              <Markdown key={i}>{'text' in part ? part.text : ''}</Markdown>
            ))}
          </div>
        </LayerCard>

        <div className="msg-action-bar">
          <div className="flex items-center gap-1">
            {toolSteps.length > 0 && (
              <button
                onClick={() => setStepsOpen((o) => !o)}
                className="flex items-center gap-1 text-[11px] text-kumo-inactive hover:text-kumo-subtle transition-colors px-1 py-0.5 rounded"
              >
                <span className={`transition-transform duration-150 inline-block ${stepsOpen ? 'rotate-90' : ''}`}>▶</span>
                {toolSteps.length} {toolSteps.length === 1 ? 'step' : 'steps'}
              </button>
            )}
            <Button variant="ghost" shape="square" size="xs" aria-label="Copy" onClick={copy} title={copied ? 'Copied!' : 'Copy'} className="opacity-100">
              <Copy size={11} weight="fill" />
            </Button>
          </div>
          <span className="text-[11px] text-kumo-inactive">{ts ? formatTs(ts) : ''}</span>
        </div>

        {stepsOpen && toolSteps.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1.5 pl-1">
            {toolSteps.map((tc, i) => <ToolCallRow key={tc.toolCallId} {...tc} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

interface ComposerProps {
  agents: AgentEntry[];
  agentsLoading: boolean;
  agentName: string;
  onAgentChange: (name: string) => void;
  isRunning: boolean;
  onSend: (text: string) => Promise<void>;
}

function Composer({ agents, agentsLoading, agentName, onAgentChange, isRunning, onSend }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasChoice = agents.length > 1;

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
        {!agentsLoading && hasChoice && (
          <Select
            hideLabel
            size="xs"
            value={agentName}
            onValueChange={(v) => onAgentChange(v as string)}
            className="composer-agent-select"
          >
            {agents.map((a) => (
              <Select.Option key={a.name} value={a.name}>{a.name}</Select.Option>
            ))}
          </Select>
        )}
        {!agentsLoading && !hasChoice && (
          <span className="text-xs text-kumo-inactive px-1">{agentName}</span>
        )}

        <div className="ml-auto">
          {isRunning ? (
            <Button variant="secondary" shape="square" size="sm" aria-label="Stop" onClick={() => {}}>
              <StopCircle size={15} />
            </Button>
          ) : (
            <Button variant="primary" shape="square" size="sm" aria-label="Send" onClick={handleSend} disabled={!value.trim()}>
              <ArrowUp size={15} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tool activity ─────────────────────────────────────────────────────────────


function inputSummary(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  // Prefer explicit query/search/keyword fields
  const query = obj['query'] ?? obj['search'] ?? obj['keyword'] ?? obj['q'];
  if (typeof query === 'string' && query.trim()) return `"${query.trim()}"`;
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

function ToolCallRow({ toolName, state, input, index }: ToolCallInfo & { index: number }) {
  const running = state === 'input-available';
  const errored = state === 'output-error';

  return (
    <div className="tool-row-enter flex items-center gap-2" style={{ animationDelay: `${index * 65}ms` }}>
      {running
        ? <div className="thinking-dots shrink-0"><span/><span/><span/></div>
        : errored
          ? <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
          : <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />}

      <span className={`text-xs ${running ? 'text-kumo-default' : 'text-kumo-subtle'}`}>
        {friendlyLabel(toolName, state, input)}
      </span>
    </div>
  );
}


function ToolActivity() {
  const { toolCalls, isRunning } = useFlueActivity();
  const lastCalls = useRef<ToolCallInfo[]>([]);
  if (toolCalls.length > 0) lastCalls.current = toolCalls;

  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (isRunning) {
      setMounted(true);
      setExiting(false);
    } else if (mounted) {
      setExiting(true);
      const t = setTimeout(() => { setMounted(false); setExiting(false); }, 300);
      return () => clearTimeout(t);
    }
  }, [isRunning]);

  if (!mounted) return null;

  const hasCalls = lastCalls.current.length > 0;

  return (
    <div className={`msg-assistant mb-4${exiting ? ' tool-activity-exit' : ''}`}>
      <div className="msg-avatar">Z</div>
      <LayerCard className="flex-1 min-w-0 px-3.5 py-3 rounded-tl-sm">
        {!hasCalls ? (
          <div className="flex items-center gap-2">
            <div className="thinking-dots"><span/><span/><span/></div>
            <p className="text-sm text-kumo-default">Thinking</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {lastCalls.current.map((tc, i) => <ToolCallRow key={tc.toolCallId} {...tc} index={i} />)}
          </div>
        )}
      </LayerCard>
    </div>
  );
}
