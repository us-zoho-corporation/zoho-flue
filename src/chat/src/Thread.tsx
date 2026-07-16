import {
  ArrowClockwise,
  ArrowUp,
  Buildings,
  CaretRight,
  ChartBar,
  Check,
  Cloud,
  Copy,
  EnvelopeSimple,
  Headset,
  Info,
  Lightning,
  Paperclip,
  Plug,
  ShieldCheck,
  SignOut,
  Sparkle,
  Square,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { Badge, Banner, Button, Collapsible, Loader, Popover, SidebarTrigger } from '@cloudflare/kumo';
import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { type ToolCallInfo, type ChatMessage, type ChatAttachment, isAssistantMessage, useFlueChat } from './FlueRuntime.tsx';
import { A2uiPart } from './a2ui/index.ts';
import type { UserProfile } from './App.tsx';
import { connectZohoScopes, parseConnectionRequired } from './connectionRequired.ts';
import { parseFormRequest, matchFormSubmission, type FormRequestSpec } from './formRequest.ts';
import { A2uiRecordCard } from './a2ui/A2uiRecordCard.tsx';
import type { RecordCardSpec } from './a2ui/spec.ts';
import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';

interface ThreadProps {
  modelLabel: string;
  requiresAuth: boolean;
  isSignedIn: boolean;
  onSignIn: () => void;
  profile: UserProfile;
  onSignOut: () => void;
  /** Called when the user clicks "Manage connection" on an MCP reconnect card, to open the MCP servers view. */
  onConnectMcp: () => void;
  /** Whether "Auto mode" (HITL confirmation bypass) is currently on, shown next to the model label under the composer. */
  autoMode: boolean;
  /** MIME types the active model accepts as image attachments; empty disables the composer's attachment button. */
  attachmentMimeTypes: string[];
}

/**
 * Derives the avatar initials shown for the signed-in user's top-bar profile chip.
 * @param profile - The signed-in user's profile.
 * @returns The uppercased first-and-last-name initials, falling back to the first character of the display name or `?` if none are available.
 */
function initialsOf(profile: UserProfile): string {
  const fromNames = [profile.firstName[0], profile.lastName[0]].filter(Boolean).join('');
  return (fromNames || profile.displayName[0] || '?').toUpperCase();
}

/**
 * Renders a signed-in user's avatar (photo or initials), reused by both the
 * top-bar profile button and its popover card header.
 * @param profile - The signed-in user's profile.
 * @returns The avatar element.
 */
function Avatar({ profile }: { profile: UserProfile }) {
  return (
    <div className="sb-avatar">
      {profile.photoUrl
        ? <img src={profile.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span>{initialsOf(profile)}</span>}
    </div>
  );
}

/**
 * Renders the top-bar account control: a circular avatar button that opens a
 * popover card with the signed-in user's full name, email, Zoho CRM
 * organization name + environment (once resolved), and a sign-out button.
 * @param profile - The signed-in user's profile.
 * @param onSignOut - Called when the popover's "Sign out" button is clicked.
 * @returns The avatar button plus its popover.
 */
function ProfileMenu({ profile, onSignOut }: { profile: UserProfile; onSignOut: () => void }) {
  // Best-effort: only resolves if the user has connected Zoho CRM. Absent
  // (never fetched, not connected, or the call failed) just hides the row.
  const [org, setOrg] = useState<{ orgName: string | null; environment: string | null }>({ orgName: null, environment: null });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/org', { credentials: 'include' })
      .then((r) => r.ok ? r.json() as Promise<{ orgName: string | null; environment: string | null }> : null)
      .then((data) => { if (!cancelled && data) setOrg(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <Popover>
      <Popover.Trigger render={<button className="hdr-profile" aria-label="Account" title="Account" />}>
        <Avatar profile={profile} />
      </Popover.Trigger>
      <Popover.Content align="end" sideOffset={10} className="hdr-profile-card">
        <div className="hdr-profile-card-header">
          <Avatar profile={profile} />
          <div style={{ minWidth: 0 }}>
            <div className="sb-user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.displayName}</div>
            <div className="sb-user-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.email}</div>
            {org.orgName && (
              <div className="hdr-profile-org">
                <Buildings size={11} weight="fill" style={{ flexShrink: 0 }} />
                <span className="hdr-profile-org-name">{org.orgName}</span>
                {org.environment && <span className="hdr-profile-env">{org.environment}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="hdr-profile-card-sep" />
        <Popover.Close render={<button className="hdr-profile-signout" onClick={onSignOut} />}>
          <SignOut size={15} />
          Sign out
        </Popover.Close>
      </Popover.Content>
    </Popover>
  );
}

/**
 * Concatenates all text parts of a conversation message into a single string.
 * @param message - The conversation message to extract text from.
 * @returns The joined text content of the message, or an empty string if it has none.
 */
function textOf(message: FlueConversationMessage): string {
  return message.parts.filter((p) => p.type === 'text').map((p) => ('text' in p ? p.text : '')).join('');
}

/**
 * Reconstructs a submitted `request_input` form's filled-in fields as a
 * record-card spec, if `userMsg` immediately follows an assistant turn that
 * asked for one — so the chat shows the card the user actually filled in,
 * not the plain-text reply that was really sent to the model. Returns `null`
 * (the normal text bubble applies) when `prev` isn't such a turn, or the
 * message's text doesn't cleanly match the form it's supposedly answering
 * (e.g. the user typed a free-text reply instead of using the form).
 * @param prev - The message immediately before `userMsg` in the conversation, if any.
 * @param userMsg - The user message to check.
 * @returns The reconstructed record-card spec, or `null`.
 */
function formSubmissionCardFor(prev: FlueConversationMessage | undefined, userMsg: FlueConversationMessage): RecordCardSpec | null {
  if (!prev || prev.role !== 'assistant' || !isAssistantMessage(prev)) return null;
  const step = [...prev.toolSteps].reverse().find((s) => s.toolName === 'request_input' && s.state === 'output-available');
  if (!step) return null;
  const spec = parseFormRequest(step.input);
  if (!spec) return null;
  const fields = matchFormSubmission(spec, textOf(userMsg));
  if (!fields || fields.length === 0) return null;
  return { title: spec.prompt, status: 'neutral', fields };
}

/**
 * Renders the main chat pane: the top bar, the message viewport (welcome
 * screen, message list with pending/no-reply states), and the composer or a
 * sign-in prompt when the active model requires authentication.
 * @param modelLabel - The display name of the active model, shown in the composer and sign-in prompt.
 * @param requiresAuth - Whether the active model requires the user to be signed in to run.
 * @param isSignedIn - Whether the user is currently signed in.
 * @param onSignIn - Called to start the sign-in flow, from the welcome screen or the sign-in prompt.
 * @param profile - The signed-in user's profile, shown behind the top bar's account avatar/popover.
 * @param onSignOut - Called when the account popover's "Sign out" button is clicked.
 * @param autoMode - Whether "Auto mode" is currently on, shown as a top-bar indicator.
 * @param attachmentMimeTypes - MIME types the active model accepts as image attachments.
 * @returns The chat area, including top bar, message viewport, and composer.
 */
export function Thread({ modelLabel, requiresAuth, isSignedIn, onSignIn, profile, onSignOut, onConnectMcp, autoMode, attachmentMimeTypes }: ThreadProps) {
  const { messages, isRunning, historyReady, error, sendMessage, stop } = useFlueChat();
  // This conversation's model runs as the logged-in user, but nobody is signed in.
  const authGate = requiresAuth && !isSignedIn;
  const viewportRef = useRef<HTMLDivElement>(null);
  const composerWrapRef = useRef<HTMLDivElement>(null);
  // The floating composer-wrap (composer, plus the mutation card when one is
  // pending) needs the scrolling viewport below to reserve exactly its own
  // height, or there's either a gap (reserved more than needed) or an overlap
  // (reserved less) — the mutation card's height varies with how many fields
  // it lists, so a fixed guess can't fit every case. Measured live instead.
  const [reservedBottom, setReservedBottom] = useState(0);
  const VIEWPORT_GAP = 24; // matches .chat-messages' between-message gap

  // Maps a failed (connection-required) assistant turn's id to the original
  // user message that triggered it, once the user clicks Retry — so the
  // resent duplicate (the message immediately after that turn) can be
  // suppressed in favor of a "Retried" indicator on the original, instead of
  // showing the same request twice in history. Session-local: there's no
  // server-side concept of "this message was a resend," so this doesn't
  // survive a reload (the resend would show as an ordinary second message).
  const [retriedTurnLinks, setRetriedTurnLinks] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const el = composerWrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setReservedBottom(Math.ceil(entry.contentRect.height) + VIEWPORT_GAP);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const last = messages[messages.length - 1];
  // The agent is working but hasn't produced its assistant turn yet — show a
  // pending "Thinking" turn so the thread never sits silent.
  const showPending = isRunning && (!last || last.role === 'user');

  const lastAssistantEmpty = !!last && last.role === 'assistant'
    && !last.parts.some((p) => p.type === 'text' && p.text)
    && (!isAssistantMessage(last) || last.uiParts.length === 0);
  const noReply = historyReady && !isRunning && (last?.role === 'user' || lastAssistantEmpty);
  const lastUserText = [...messages].reverse().find((m) => m.role === 'user');

  // A propose_mutation call is only actionable while it's the very last thing
  // in the conversation — once the user responds (a click sends an ordinary
  // message), that response becomes `last` and this naturally goes away, so no
  // separate "resolved" tracking is needed. Gated on `!isRunning` so the button
  // click can't race the turn that produced it.
  const pendingMutation = !isRunning && !!last && isAssistantMessage(last)
    ? [...last.toolSteps].reverse()
        .find((s) => s.toolName === 'propose_mutation' && s.state === 'output-available')
        ?.input as { action?: string; fields?: { label: string; value: string }[] } | undefined
    : undefined;

  // Same as `pendingMutation`, but for a `propose_mutation_batch` ask — a
  // single approval that gates a whole ordered sequence of actions instead of
  // one. Mutually exclusive with `pendingMutation`: the model calls one or the
  // other per turn, never both.
  const pendingMutationBatch = !isRunning && !pendingMutation && !!last && isAssistantMessage(last)
    ? [...last.toolSteps].reverse()
        .find((s) => s.toolName === 'propose_mutation_batch' && s.state === 'output-available')
        ?.input as { actions?: { action?: string; fields?: { label: string; value: string }[] }[] } | undefined
    : undefined;
  const pendingMutationBatchActions = pendingMutationBatch?.actions?.filter(
    (a): a is { action: string; fields: { label: string; value: string }[] } => !!a.action,
  );

  // A tool call that needed a connection the user doesn't have (or has
  // outdated scopes for) throws a structured error instead of failing plainly
  // — surfaced the same way as a pending mutation: only while it's the last
  // thing in the conversation, so a fresh message naturally clears it.
  const pendingConnectionRequired = !isRunning && !pendingMutation && !pendingMutationBatchActions?.length && !!last && isAssistantMessage(last)
    ? [...last.toolSteps].reverse()
        .map((s) => (s.state === 'output-error' ? parseConnectionRequired(s.errorText) : null))
        .find((p) => p != null)
    : undefined;

  // A request_input call needs the user's answers before the model can
  // usefully continue — surfaced the same way as the other two: only while
  // it's the last thing in the conversation.
  const pendingFormRequest = !isRunning && !pendingMutation && !pendingMutationBatchActions?.length && !pendingConnectionRequired && !!last && isAssistantMessage(last)
    ? [...last.toolSteps].reverse()
        .map((s) => (s.toolName === 'request_input' && s.state === 'output-available' ? parseFormRequest(s.input) : null))
        .find((p) => p != null)
    : undefined;

  // Layout effect (not a plain effect): runs synchronously after the DOM updates
  // but before the browser paints, so when the mutation approval card mounts —
  // growing the fixed composer-wrap overlay — the last message never flashes
  // covered for a frame before this catches up. Also re-runs once
  // `reservedBottom` itself changes: the ResizeObserver callback that updates
  // it fires slightly after this effect on the same render (post-layout, its
  // own microtask), so without this dependency the viewport could settle one
  // beat before the reserved space caught up to the card's real height.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isRunning, pendingMutation?.action, pendingMutationBatchActions?.length, pendingConnectionRequired, pendingFormRequest, reservedBottom]);

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
        <ProfileMenu profile={profile} onSignOut={onSignOut} />
      </div>

      <div
        ref={viewportRef}
        className={[
          'chat-viewport',
          empty && 'chat-viewport-empty',
          (pendingMutation?.action || !!pendingMutationBatchActions?.length || pendingConnectionRequired || pendingFormRequest) && 'chat-viewport-pull-bottom',
        ].filter(Boolean).join(' ')}
        style={{ paddingBottom: empty ? undefined : (reservedBottom || undefined) }}
      >
        {empty ? (
          <WelcomeState onPrompt={authGate ? () => onSignIn() : sendMessage} />
        ) : (
          <div className="chat-messages">
            {!historyReady && <div className="history-loading"><Loader size="sm" /></div>}
            {messages.map((msg, idx) => {
              if (msg.role === 'user') {
                // The message right after a retried turn is the resent
                // duplicate — suppress it; the original shows a "Retried"
                // indicator instead of the same request appearing twice.
                const prev = messages[idx - 1];
                if (prev && retriedTurnLinks.has(prev.id)) return null;
                const wasRetried = [...retriedTurnLinks.values()].includes(msg.id);
                return (
                  <UserMessage
                    key={msg.id}
                    message={msg}
                    formCard={formSubmissionCardFor(messages[idx - 1], msg)}
                    retried={wasRetried}
                  />
                );
              }
              return (
                <AssistantTurn
                  key={msg.id}
                  message={msg as ChatMessage}
                  running={isRunning && idx === messages.length - 1}
                />
              );
            })}
            {showPending && <PendingTurn />}
            {noReply && (
              <NoReplyNotice error={error} onRetry={() => lastUserText && sendMessage(textOf(lastUserText))} />
            )}
          </div>
        )}
      </div>

      <div className="composer-wrap" ref={composerWrapRef}>
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
            <>
              {pendingMutation?.action && (
                <MutationApprovalCard onChoose={sendMessage} />
              )}
              {!!pendingMutationBatchActions?.length && (
                <MutationApprovalCard onChoose={sendMessage} batchCount={pendingMutationBatchActions.length} />
              )}
              {pendingConnectionRequired && (
                <ConnectionRequiredCard
                  payload={pendingConnectionRequired}
                  onConnectMcp={onConnectMcp}
                  retryText={lastUserText && textOf(lastUserText)}
                  onRetry={async (text) => {
                    if (last && lastUserText) {
                      setRetriedTurnLinks((m) => new Map(m).set(last.id, lastUserText.id));
                    }
                    await sendMessage(text);
                  }}
                />
              )}
              {pendingFormRequest && (
                <FormRequestCard spec={pendingFormRequest} onSubmit={sendMessage} />
              )}
              <Composer
                modelLabel={modelLabel}
                isRunning={isRunning}
                onSend={sendMessage}
                onStop={stop}
                autoMode={autoMode}
                attachmentMimeTypes={attachmentMimeTypes}
              />
            </>
          )}
        </div>
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

/**
 * Renders the empty-thread welcome screen with a headline and a grid of
 * suggested prompts.
 * @param onPrompt - Called with a suggestion's prompt text when its card is clicked.
 * @returns The welcome screen markup.
 */
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

/**
 * Renders a single user-authored chat bubble.
 * @param message - The user's conversation message to display.
 * @returns The rendered user message bubble.
 */
/**
 * Renders one user turn: the plain text bubble, or — when this message is a
 * submitted `request_input` form's reply — the record card the user actually
 * filled in instead (see `formSubmissionCardFor`). When this message was
 * later resent via a Retry click, shows a small "Retried" indicator instead
 * of the resend appearing as its own duplicate bubble (see `retriedTurnLinks`).
 * @param message - The user message to render.
 * @param formCard - The reconstructed form-submission card for this message, if any.
 * @param retried - Whether this message was resent via a Retry click.
 * @returns The rendered user turn.
 */
function UserMessage({ message, formCard, retried }: { message: FlueConversationMessage; formCard: RecordCardSpec | null; retried: boolean }) {
  const files = message.parts.filter((p): p is Extract<FlueConversationPart, { type: 'file' }> => p.type === 'file');
  const text = textOf(message);
  return (
    <div className="msg-user msg-assistant-appear">
      <div className="msg-user-inner">
        {files.length > 0 && (
          <div className="msg-attachments">
            {files.map((f, i) => (
              f.mediaType.startsWith('image/') && f.url
                ? <img key={i} src={f.url} alt={f.filename ?? 'Attached image'} className="msg-attachment-img" />
                : (
                  <span key={i} className="msg-attachment-missing">
                    <Paperclip size={12} /> {f.filename ?? 'Attachment'} — not available
                  </span>
                )
            ))}
          </div>
        )}
        {formCard
          ? <A2uiRecordCard spec={formCard} />
          : text && <div className="msg-user-bubble">{text}</div>}
        {retried && (
          <span className="msg-user-retried">
            <ArrowClockwise size={11} weight="bold" /> Retried
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Assistant turn ──────────────────────────────────────────────────────────

/**
 * Renders one assistant turn: its tool-call trace (live or collapsed), a
 * "Thinking" indicator while waiting for the first content, the answer text
 * (rendered as Markdown), any generative-UI parts, and a copy-answer action
 * bar once the turn has finished.
 * @param message - The assistant message/turn to render.
 * @param running - Whether this turn is the currently streaming/in-flight turn.
 * @returns The rendered assistant turn.
 */
export function AssistantTurn({ message, running }: { message: ChatMessage; running: boolean }) {
  const [copied, setCopied] = useState(false);
  const textParts = message.parts.filter((p) => p.type === 'text' && 'text' in p && p.text);
  const fullText = textParts.map((p) => ('text' in p ? p.text : '')).join('');
  const steps = isAssistantMessage(message) ? message.toolSteps : [];
  const uiParts = isAssistantMessage(message) ? message.uiParts : [];

  // A proposed mutation's fields are exactly a record-card spec ({label,
  // value} pairs plus a title) — render them through the real a2ui
  // render_record_card component (a synthesized part, not a genuine model
  // tool call) instead of a plain label/value list, and let them persist in
  // history like any other visualization once the turn moves on. The separate
  // approve/deny control (rendered above the composer, not here) stays
  // actionable only for the current turn — this card is just the record
  // preview, not the control.
  const mutationCards = steps
    .filter((s) => s.toolName === 'propose_mutation' && s.state === 'output-available')
    .map((s) => s.input as { action?: string; fields?: { label: string; value: string }[] })
    .filter((input): input is { action: string; fields: { label: string; value: string }[] } => !!input.action && !!input.fields?.length);

  // Same idea as `mutationCards`, but for a `propose_mutation_batch` ask — one
  // ordered sequence of actions rendered as a single ordered-steps card
  // (`MutationSequenceCard`) rather than a flat stack of record cards, so the
  // "these will run in this order" framing is explicit, not just an accident
  // of top-to-bottom layout.
  const mutationBatchCards = steps
    .filter((s) => s.toolName === 'propose_mutation_batch' && s.state === 'output-available')
    .map((s) => s.input as { actions?: { action?: string; fields?: { label: string; value: string }[] }[] })
    .map((input) => (input.actions ?? []).filter(
      (a): a is { action: string; fields: { label: string; value: string }[] } => !!a.action && !!a.fields?.length,
    ))
    .filter((actions) => actions.length > 0);

  /**
   * Copies the assistant turn's full answer text to the clipboard and
   * briefly flips the copy button into a "Copied!" state.
   */
  const copy = useCallback(() => {
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [fullText]);

  const hasContent = textParts.length > 0 || uiParts.length > 0 || mutationCards.length > 0 || mutationBatchCards.length > 0;
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

        {mutationCards.length > 0 && (
          <div className="a2ui-parts flex flex-col">
            {mutationCards.map((m, i) => (
              <A2uiPart
                key={i}
                part={{
                  toolCallId: `propose_mutation-preview-${i}`,
                  toolName: 'render_record_card',
                  state: 'output-available',
                  input: { title: m.action, fields: m.fields.map((f) => ({ label: f.label, value: f.value })) },
                }}
              />
            ))}
          </div>
        )}

        {mutationBatchCards.length > 0 && (
          <div className="a2ui-parts flex flex-col">
            {mutationBatchCards.map((steps, i) => <MutationSequenceCard key={i} steps={steps} />)}
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

/**
 * Renders the tool-call activity for an assistant turn: while running, each
 * step is shown live as its own row; once finished, the steps collapse into
 * an expandable Kumo Badge (flagged as an "issue" if any step errored).
 * @param steps - The tool-call steps taken so far in this turn.
 * @param running - Whether the turn is still in progress.
 * @returns The live step rows, or a collapsible summary chip once finished.
 */
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

/**
 * Renders the three-dot "thinking" indicator shown while the assistant has
 * no content to display yet.
 * @returns The animated thinking-dots element.
 */
function ThinkingRow() {
  return (
    <div className="thinking-dots"><span /><span /><span /></div>
  );
}

/**
 * Renders a placeholder assistant turn (avatar plus thinking indicator) shown
 * while the agent is working but hasn't produced its own turn yet.
 * @returns The pending assistant turn markup.
 */
function PendingTurn() {
  return (
    <div className="msg-assistant msg-assistant-appear">
      <div className="msg-avatar"><Sparkle size={15} weight="fill" /></div>
      <div className="msg-assistant-content"><ThinkingRow /></div>
    </div>
  );
}

// Present/past tense verb per known tool name, shown before the detail (e.g.
// "Fetching GET /api/v1/tickets" while running, "Fetched ..." once done).
const TOOL_VERBS: Record<string, [string, string]> = {
  search_docs:             ['Searching', 'Searched'],
  zoho_kb_search:          ['Searching', 'Searched'],
  zoho_kb_get_page:        ['Reading',   'Read'],
  zoho_kb_list_products:   ['Listing',   'Listed'],
  zoho_skill_get:          ['Loading',   'Loaded'],
  zoho_api:                ['Fetching',  'Fetched'],
  render_chart:            ['Building',  'Built'],
  render_comparison_table: ['Building',  'Built'],
  render_stat_cards:       ['Building',  'Built'],
  render_record_card:      ['Building',  'Built'],
};

/**
 * Title-cases a snake_case tool name for display, e.g. "list_widgets" →
 * "List Widgets" — the fallback label for tools with no {@link TOOL_VERBS} entry.
 * @param name - The raw tool name.
 * @returns The title-cased name with underscores replaced by spaces.
 */
function titleCaseToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Humanizes a skill directory name for display, e.g. "zoho-desk-organizations"
 * → "Desk Organizations".
 * @param skill - The skill's directory name (hyphen-separated, `zoho-` prefixed).
 * @returns The humanized skill name.
 */
function humanizeSkillName(skill: string): string {
  return skill.replace(/^zoho-/, '').split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Extracts a short human-readable detail from a tool call's input — the
 * specific endpoint/query/skill it acted on — so steps read as e.g. "Fetching
 * GET /api/v1/tickets" rather than a bare verb like "Listing".
 * @param name - The tool's name, used to pick a tool-specific extraction (e.g. `zoho_api`'s method + path).
 * @param input - The raw tool-call input to summarize.
 * @returns A short detail string, or an empty string if nothing usable was found.
 */
function toolDetail(name: string, input: unknown): string {
  const obj = (input && typeof input === 'object') ? input as Record<string, unknown> : {};

  if (name === 'zoho_api' && typeof obj['url'] === 'string') {
    const method = typeof obj['method'] === 'string' ? `${obj['method']} ` : '';
    try { return `${method}${new URL(obj['url']).pathname}`; } catch { return `${method}${obj['url']}`; }
  }
  if (name === 'zoho_skill_get' && typeof obj['skill'] === 'string') {
    const reference = typeof obj['reference'] === 'string' ? obj['reference'] : '';
    const skill = humanizeSkillName(obj['skill']);
    return reference ? `${skill} · ${reference}` : skill;
  }
  // No variable input to describe (zoho_kb_list_products takes none) — a fixed
  // detail beats a bare, uninformative verb like "Listing".
  if (name === 'zoho_kb_list_products') return 'Zoho documentation products';

  const query = obj['query'] ?? obj['search'] ?? obj['keyword'] ?? obj['q'] ?? obj['title'];
  if (typeof query === 'string' && query.trim()) return `“${query.trim()}”`;
  const url = obj['url'] ?? obj['path'] ?? obj['endpoint'];
  if (typeof url === 'string') {
    try { return new URL(url).pathname; } catch { return url; }
  }
  return '';
}

/**
 * Builds the human-readable label for a tool-call row, e.g. "Fetching GET
 * /api/v1/tickets" while running or "Fetched GET /api/v1/tickets" once done,
 * falling back to a title-cased tool name for unrecognized tools (e.g. a
 * user-connected MCP server's).
 * @param name - The tool's name (e.g. `search_docs`, `zoho_api`).
 * @param state - The tool call's current state, used to pick present vs. past tense.
 * @param input - The tool call's input, used to derive a detail suffix via {@link toolDetail}.
 * @returns The friendly label to display for the tool call.
 */
function friendlyLabel(name: string, state: ToolCallInfo['state'], input: unknown): string {
  const running = state === 'input-available';
  const titled = titleCaseToolName(name);
  const [present, past] = TOOL_VERBS[name] ?? [titled, titled];
  const verb = running ? present : past;
  const detail = toolDetail(name, input);
  return detail ? `${verb} ${detail}` : verb;
}

/**
 * Renders a single tool-call row with its icon, friendly label, and a
 * trailing spinner, error icon, or checkmark depending on the call's state.
 * @param toolName - The tool's name, used to derive its friendly label.
 * @param state - The tool call's current state (in-flight, succeeded, or errored).
 * @param input - The tool call's input, used to derive a detail suffix for the label.
 * @param index - The row's position among the turn's steps, used to stagger its entrance animation.
 * @returns The rendered tool-call row.
 */
export function ToolCallRow({ toolName, state, input, index }: ToolCallInfo & { index: number }) {
  const running = state === 'input-available';
  const errored = state === 'output-error';

  return (
    <div className="tool-row tool-row-enter" style={{ animationDelay: `${index * 55}ms` }}>
      <span className="tool-row-icon"><Sparkle size={12} weight="fill" /></span>
      <span className={`tool-row-label${running ? ' is-running' : ''}`} style={{ flex: 1, minWidth: 0 }}>
        {friendlyLabel(toolName, state, input)}
      </span>
      {running && <div className="tool-spinner" />}
      {!running && errored && <WarningCircle size={14} weight="fill" style={{ color: 'var(--danger)', flexShrink: 0 }} />}
      {!running && !errored && <span className="tool-row-dot"><Check size={9} weight="bold" /></span>}
    </div>
  );
}

// ─── No-reply / error fallback ───────────────────────────────────────────────

/**
 * Renders a fallback banner shown when a turn finished without producing a
 * reply: an error banner with the failure message if the run errored, or a
 * neutral "couldn't find an answer" banner otherwise. Both offer a retry action.
 * @param error - The error that caused the run to fail, if any.
 * @param onRetry - Called when the "Ask again" button is clicked.
 * @returns The rendered fallback banner.
 */
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

// ─── Mutation approval ────────────────────────────────────────────────────────

/**
 * Renders a compact Approve/Deny badge for a pending `propose_mutation` (or
 * `propose_mutation_batch`) ask, anchored above the composer so it stays
 * reachable with a single click. Just the control — the proposed record's
 * fields render separately, inline in the turn itself, as a real a2ui
 * record card or a `MutationSequenceCard` for a batch (see `AssistantTurn`'s
 * `mutationCards`/`mutationBatchCards`), so this doesn't restate them in a
 * second, heavier card. Disables itself immediately after a choice to guard
 * against a double-click before the optimistic echo re-renders it away.
 * @param onChoose - Called with the user's plain-text response ("Approve" or "Deny").
 * @param batchCount - When approving a batch, the number of actions in it —
 * shown in the label so it's clear one click confirms all of them together.
 * @returns The rendered approval badge.
 */
function MutationApprovalCard({ onChoose, batchCount }: { onChoose: (text: string) => Promise<void>; batchCount?: number }) {
  const [choosing, setChoosing] = useState(false);

  /**
   * Sends the chosen response as the user's next message. No-ops if a choice
   * is already in flight.
   * @param text - The response text to send ("Approve" or "Deny").
   */
  const choose = useCallback((text: string) => {
    if (choosing) return;
    setChoosing(true);
    onChoose(text);
  }, [choosing, onChoose]);

  return (
    <div className="action-badge">
      <span className="action-badge-icon"><ShieldCheck size={13} weight="fill" /></span>
      <span className="action-badge-label">{batchCount ? `Confirm these ${batchCount} actions` : 'Confirm this action'}</span>
      <button className="action-badge-btn action-badge-approve" disabled={choosing} onClick={() => choose('Approve')}>
        <Check size={13} weight="bold" /> Approve
      </button>
      <button className="action-badge-btn action-badge-deny" disabled={choosing} onClick={() => choose('Deny')}>
        <X size={13} weight="bold" /> Deny
      </button>
    </div>
  );
}

/**
 * Renders a `propose_mutation_batch` ask's ordered sequence of actions as a
 * single numbered-steps card — each step showing its own action line and
 * field rows — so the plan reads as one coherent, ordered operation rather
 * than a stack of unrelated record cards. Purely a preview, like
 * `mutationCards`' `render_record_card` usage; the actual Approve/Deny
 * control renders separately, above the composer.
 * @param steps - The batch's actions, in the exact order they'll be performed.
 * @returns The rendered ordered-sequence card.
 */
function MutationSequenceCard({ steps }: { steps: { action: string; fields: { label: string; value: string }[] }[] }) {
  return (
    <div className="mutation-sequence-card">
      {steps.map((s, i) => (
        <div className="mutation-sequence-step" key={i}>
          <span className="mutation-sequence-step-num">{i + 1}</span>
          <div className="mutation-sequence-step-body">
            <p className="mutation-sequence-step-title">{s.action}</p>
            {s.fields.length > 0 && (
              <div className="mutation-sequence-step-fields">
                {s.fields.map((f, j) => (
                  <div className="mutation-sequence-step-field" key={j}>
                    <span className="mutation-sequence-step-label">{f.label}</span>
                    <span className="mutation-sequence-step-value">{f.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Connection required ──────────────────────────────────────────────────────

/**
 * Renders a Connect/Reconnect prompt for a tool call that needed a connection
 * the user doesn't have (or has outdated scopes for), anchored above the
 * composer like the mutation approval card. Zoho products redirect straight
 * to the OAuth consent screen for the missing scopes; an MCP server can't be
 * fixed with a single click (it may need a new URL or token), so its button
 * instead opens the MCP servers settings view.
 * @param payload - The parsed connection-required details from the failing tool step.
 * @param onConnectMcp - Called when the button is clicked for an MCP-kind payload, to open the MCP servers view.
 * @param retryText - The original message that triggered this connection requirement, if known, so it can be resent once connected without the user retyping it.
 * @param onRetry - Called with `retryText` once the user chooses to resend it.
 * @returns The rendered connection-required card.
 */
function ConnectionRequiredCard({ payload, onConnectMcp, retryText, onRetry }: {
  payload: NonNullable<ReturnType<typeof parseConnectionRequired>>;
  onConnectMcp: () => void;
  retryText?: string;
  onRetry: (text: string) => Promise<void>;
}) {
  // The card is derived from a *historical* tool step, which never updates
  // itself — so after the user actually connects (a full-page OAuth redirect
  // and back) and lands on the same still-last turn, it would otherwise keep
  // showing an active "Connect" button as if nothing happened. For the Zoho
  // case there's a cheap live source of truth to check against — on mount,
  // AND whenever the tab regains focus/visibility, since the OAuth consent
  // screen is a real cross-origin navigation and a reload's exact timing
  // relative to this component's mount isn't something to rely on: checking
  // again the moment the user's attention returns to the tab means a missed
  // or premature mount-time check self-corrects without needing a message.
  // MCP has no equivalent single endpoint to re-verify without re-probing
  // the server, so its card has no analogous "confirmed" state.
  const [nowConnected, setNowConnected] = useState(false);
  const nowConnectedRef = useRef(false);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (payload.kind !== 'zoho' || !payload.product) return;
    let cancelled = false;

    /** Re-checks this product's connection status and flips the card once granted. */
    const check = () => {
      if (nowConnectedRef.current) return;
      fetch('/api/auth/connections', { credentials: 'include' })
        .then((res) => res.json())
        .then((data: { connections?: { key: string; connected: boolean }[] }) => {
          if (cancelled) return;
          const match = data.connections?.find((c) => c.key === payload.product);
          if (match?.connected) { nowConnectedRef.current = true; setNowConnected(true); }
        })
        .catch(() => { /* leave the card actionable — a failed check isn't proof of anything */ });
    };

    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [payload.kind, payload.product]);

  /**
   * Resends the original message that hit this connection requirement, now
   * that the connection is confirmed. No-ops if already retrying or the
   * original message text isn't available.
   */
  const retry = useCallback(() => {
    if (retrying || !retryText) return;
    setRetrying(true);
    onRetry(retryText);
  }, [retrying, retryText, onRetry]);

  const isReconnect = payload.mode === 'reconnect';
  const verb = isReconnect ? 'Reconnect' : 'Connect';

  return (
    <div className="action-badge">
      <span className="action-badge-icon"><Plug size={13} weight="fill" /></span>
      <span className="action-badge-label">{nowConnected ? `${payload.label} connected` : `${payload.label} needed`}</span>
      {nowConnected && retryText ? (
        <button className="action-badge-btn action-badge-approve" disabled={retrying} onClick={retry}>
          <ArrowClockwise size={13} weight="bold" /> Retry
        </button>
      ) : (
        <button
          className={`action-badge-btn ${nowConnected ? 'action-badge-connected' : 'action-badge-approve'}`}
          disabled={nowConnected}
          onClick={() => (payload.kind === 'zoho' ? connectZohoScopes(payload.scopes ?? [], '/') : onConnectMcp())}
        >
          {nowConnected
            ? <><Check size={13} weight="bold" /> Connected</>
            : <><Plug size={13} weight="bold" /> {verb}</>}
        </button>
      )}
    </div>
  );
}

// ─── Form request ─────────────────────────────────────────────────────────────

/**
 * Renders a fillable form for a pending `request_input` ask: the model's short
 * context line plus one labeled input per field (a textarea for `multiline`
 * ones), anchored above the composer like the other action cards. Submitting
 * composes the filled-in values into a single plain-text reply (`Label:
 * value` per line) and sends it as the user's next message — the backend
 * never needs to know a form was involved, it just sees an ordinary,
 * unambiguous answer instead of free text the model would have had to parse.
 * @param spec - The normalized field list and context line to render.
 * @param onSubmit - Called with the composed reply text once the user submits.
 * @returns The rendered form card.
 */
function FormRequestCard({ spec, onSubmit }: { spec: FormRequestSpec; onSubmit: (text: string) => Promise<void> }) {
  const [values, setValues] = useState<string[]>(() => spec.fields.map((f) => f.defaultValue));
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !submitting && spec.fields.every((f, i) => !f.required || values[i].trim());

  /**
   * Composes the filled-in fields into a single plain-text reply and sends
   * it. No-ops if a required field is still empty or a submit is in flight.
   */
  const submit = useCallback(() => {
    if (!canSubmit) return;
    setSubmitting(true);
    const lines = spec.fields
      .map((f, i) => [f.label, values[i].trim()] as const)
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`);
    onSubmit(lines.join('\n'));
  }, [canSubmit, spec.fields, values, onSubmit]);

  return (
    <div className="form-card">
      <p className="form-card-prompt">{spec.prompt}</p>
      <div className="form-card-fields">
        {spec.fields.map((f, i) => {
          const onChange = (e: { target: { value: string } }) =>
            setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)));
          return (
            <label className="form-card-field" key={i}>
              <span className="form-card-label">{f.label}{f.required && <span className="form-card-required">*</span>}</span>
              {f.type === 'textarea' ? (
                <textarea
                  className="form-card-input form-card-textarea"
                  placeholder={f.placeholder || undefined}
                  value={values[i]}
                  disabled={submitting}
                  onChange={onChange}
                />
              ) : f.type === 'select' ? (
                <select className="form-card-input" value={values[i]} disabled={submitting} onChange={onChange}>
                  <option value="" disabled={f.required}>{f.placeholder || 'Choose…'}</option>
                  {f.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input
                  type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                  className="form-card-input"
                  placeholder={f.placeholder || undefined}
                  value={values[i]}
                  disabled={submitting}
                  onChange={onChange}
                />
              )}
            </label>
          );
        })}
      </div>
      <button className="form-card-submit" disabled={!canSubmit} onClick={submit}>
        <Check size={13} weight="bold" /> Submit
      </button>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

interface ComposerProps {
  modelLabel: string;
  isRunning: boolean;
  onSend: (text: string, images?: ChatAttachment[]) => Promise<void>;
  onStop: () => void;
  /** Whether "Auto mode" (HITL confirmation bypass) is currently on, shown right next to the model label. */
  autoMode: boolean;
  /** MIME types the active model accepts as image attachments; empty disables the attachment button. */
  attachmentMimeTypes: string[];
}

// The SDK caps base64 image data at 14 MiB of characters per image (see
// @flue/sdk's AgentPromptImage docs) — checked client-side so an oversized
// file is rejected immediately instead of failing after a round trip.
const MAX_ATTACHMENT_BASE64_CHARS = 14 * 1024 * 1024;

/** One image attachment staged in the composer before sending. */
interface PendingAttachment {
  /** Full `data:<mime>;base64,<data>` URL — used directly as an `<img>` preview source. */
  dataUrl: string;
  mimeType: string;
  filename: string;
}

/**
 * Reads a `File` into a `PendingAttachment`, rejecting it if it isn't one of
 * `allowedMimeTypes` or its base64 payload would exceed the SDK's per-image cap.
 * @param file - The selected file to read.
 * @param allowedMimeTypes - MIME types the active model accepts.
 * @returns The staged attachment, or an error message if it was rejected.
 */
async function readAttachment(file: File, allowedMimeTypes: string[]): Promise<{ attachment: PendingAttachment } | { error: string }> {
  if (!allowedMimeTypes.includes(file.type)) {
    return { error: `${file.name}: unsupported file type (${file.type || 'unknown'})` };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  if (base64.length > MAX_ATTACHMENT_BASE64_CHARS) {
    return { error: `${file.name}: too large to attach` };
  }
  return { attachment: { dataUrl, mimeType: file.type, filename: file.name } };
}

/**
 * Renders the message input row: an auto-growing textarea plus a send/stop
 * button that toggles based on whether a turn is currently running, the
 * active model's label alongside the current confirmation mode, and an
 * attachment button (disabled with an explanatory popover when the active
 * model accepts no image attachments).
 * @param modelLabel - The display name of the active model, shown below the input row.
 * @param isRunning - Whether a turn is currently in flight; toggles the button between send and stop.
 * @param onSend - Called with the trimmed message text (and any staged image attachments) when the user sends it.
 * @param onStop - Called when the stop button is clicked to cancel the in-flight turn.
 * @param autoMode - Whether "Auto mode" is currently on, shown next to the model label.
 * @param attachmentMimeTypes - MIME types the active model accepts as image attachments.
 * @returns The rendered composer.
 */
function Composer({ modelLabel, isRunning, onSend, onStop, autoMode, attachmentMimeTypes }: ComposerProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsSupported = attachmentMimeTypes.length > 0;

  /**
   * Reads and stages every file the user picked, skipping (with an error
   * note) any that fail the type/size check, then resets the file input so
   * selecting the same file again re-triggers `onChange`.
   * @param e - The file input's change event.
   */
  const handleFileChange = useCallback(async (e: { target: HTMLInputElement }) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const results = await Promise.all(files.map((f) => readAttachment(f, attachmentMimeTypes)));
    const staged = results.filter((r): r is { attachment: PendingAttachment } => 'attachment' in r).map((r) => r.attachment);
    const errors = results.filter((r): r is { error: string } => 'error' in r).map((r) => r.error);
    if (staged.length > 0) setAttachments((prev) => [...prev, ...staged]);
    setAttachmentError(errors[0] ?? null);
  }, [attachmentMimeTypes]);

  /**
   * Trims and sends the current composer text plus any staged attachments,
   * then clears both. No-ops if there's neither text nor an attachment, or a
   * turn is already running — an attachment alone is a valid, sendable message.
   */
  const handleSend = useCallback(() => {
    const text = value.trim();
    if ((!text && attachments.length === 0) || isRunning) return;
    setValue('');
    setAttachments([]);
    setAttachmentError(null);
    const images: ChatAttachment[] = attachments.map((a) => ({
      data: a.dataUrl.slice(a.dataUrl.indexOf(',') + 1),
      mimeType: a.mimeType,
      filename: a.filename,
    }));
    onSend(text, images.length ? images : undefined);
  }, [value, attachments, isRunning, onSend]);

  /** Removes one staged attachment by index. */
  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Sends the message when Enter is pressed without Shift, preventing the
   * default newline insertion.
   * @param e - The textarea keydown event.
   */
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
      {attachments.length > 0 && (
        <div className="composer-attachments">
          {attachments.map((a, i) => (
            <div className="composer-attachment" key={i}>
              <img src={a.dataUrl} alt={a.filename} />
              <button
                className="composer-attachment-remove"
                aria-label={`Remove ${a.filename}`}
                title={`Remove ${a.filename}`}
                onClick={() => removeAttachment(i)}
              >
                <X size={11} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}
      {attachmentError && <p className="composer-attachment-error">{attachmentError}</p>}
      <div className="composer-row">
        <input
          ref={fileInputRef}
          type="file"
          accept={attachmentMimeTypes.join(',')}
          multiple
          hidden
          onChange={handleFileChange}
        />
        {attachmentsSupported ? (
          <button
            className="composer-attach"
            aria-label="Attach image"
            title="Attach image"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={17} />
          </button>
        ) : (
          <Popover>
            <Popover.Trigger render={<button className="composer-attach composer-attach-disabled" aria-label="Attach image (unsupported)" />}>
              <Paperclip size={17} />
            </Popover.Trigger>
            <Popover.Content align="start" sideOffset={8} className="composer-attach-popover">
              {modelLabel} doesn’t support file attachments. Switch models in Settings to attach a file.
            </Popover.Content>
          </Popover>
        )}
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
          <button className="composer-send" aria-label="Send" onClick={handleSend} disabled={!value.trim() && attachments.length === 0}>
            <ArrowUp size={17} weight="bold" />
          </button>
        )}
      </div>
      <div className="composer-meta">
        <span className="composer-model" title="Change the model for new conversations in Settings">{modelLabel}</span>
        <span className={`mode-indicator${autoMode ? ' mode-indicator-auto' : ''}`} title="Change in Settings">
          {autoMode ? <Lightning size={11} weight="fill" /> : <ShieldCheck size={11} weight="fill" />}
          <span className="mode-indicator-label">{autoMode ? 'Auto mode' : 'Manual'}</span>
        </span>
      </div>
    </div>
  );
}
