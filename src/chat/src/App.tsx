import { SidebarProvider } from '@cloudflare/kumo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActiveConversation, useConversationsStore } from './conversations.tsx';
import { Settings } from './Settings.tsx';
import { McpServers } from './McpServers.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Skills } from './Skills.tsx';
import { Thread } from './Thread.tsx';
import { Welcome } from './Welcome.tsx';
import { applyTheme, loadTheme, saveTheme, type Theme } from './theme.ts';
import { isAutoModeEnabled, setAutoModeEnabled } from './autoMode.ts';
import { loadAuthFingerprint, saveAuthFingerprint } from './authFingerprint.ts';

// A selectable provider-model (from /api/models). The chat runs one `assistant`
// agent; the chosen model is carried per conversation in the instance id.
// `requiresAuth` models run as the logged-in user, so the chat prompts sign-in.
// `attachmentMimeTypes` gates the composer's attachment button — empty/absent
// means the model accepts no attachments.
export type ModelOption = { key: string; label: string; requiresAuth?: boolean; attachmentMimeTypes?: string[] };

export type UserProfile = {
  displayName: string;
  email: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
};

export interface Session {
  id: string;
  modelKey: string;
  modelLabel: string;
  title: string;
  createdAt: number;
}

const STORE_KEY = 'flue:sessions:v3';
// The model new conversations start on — chosen in Settings, persisted here.
const MODEL_KEY = 'flue:model:v1';
// Which session was active, so a full-page reload (e.g. returning from a Zoho
// OAuth redirect) lands back on the conversation the user was actually in,
// not just whichever session happens to be last in the list.
const ACTIVE_KEY = 'flue:active-session:v1';

// The assistant agent name is provided to ConversationsProvider in main.tsx. Its
// behavior is fixed; only the model varies, carried in the instance id
// (`<modelKey>__<uuid>`) that the ConversationsStore observes.

// Used before /api/models resolves, and if it fails. Matches config.defaultChatModelKey.
const FALLBACK_MODEL: ModelOption = { key: 'claude', label: 'Claude Sonnet 5', requiresAuth: false };

type View = 'chat' | 'settings' | 'skills' | 'mcp';
const VIEWS: readonly View[] = ['chat', 'settings', 'skills', 'mcp'];

/**
 * Resolves the view to land on at startup from a `?view=` query param (set by
 * `returnTo` on OAuth redirects — e.g. `/api/auth/login` — so a full-page round
 * trip, like connecting a product from Settings, returns to the same admin view
 * instead of always landing on chat), then strips it from the URL.
 * @returns The requested view if valid, otherwise `'chat'`.
 */
function resolveInitialView(): View {
  let requested: string | null = null;
  try {
    const url = new URL(window.location.href);
    requested = url.searchParams.get('view');
    if (requested) {
      url.searchParams.delete('view');
      window.history.replaceState(null, '', url.pathname + (url.search || ''));
    }
  } catch { /* ignore */ }
  return (VIEWS as readonly string[]).includes(requested ?? '') ? (requested as View) : 'chat';
}

/**
 * Reads the persisted chat sessions list from localStorage.
 * @returns The stored sessions, or an empty array if none are stored or parsing fails.
 */
function loadSessions(): Session[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]'); } catch { return []; }
}

/**
 * Persists the given sessions list to localStorage.
 * @param sessions - The sessions to persist.
 */
function saveSessions(sessions: Session[]) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(sessions)); } catch {}
}

/**
 * Reads the user's previously chosen default model key from localStorage.
 * @returns The persisted model key, or `null` if none is stored.
 */
function loadPreferredModel(): string | null {
  try { return localStorage.getItem(MODEL_KEY); } catch { return null; }
}

/**
 * Reads the id of the session that was active before the last reload.
 * @returns The persisted session id, or `null` if none is stored.
 */
function loadActiveSessionId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

/**
 * Persists which session is active, so a full-page reload restores it.
 * @param id - The id of the now-active session.
 */
function saveActiveSessionId(id: string) {
  try { localStorage.setItem(ACTIVE_KEY, id); } catch {}
}

/**
 * Builds a new chat session seeded with a fresh id and the given model.
 * @param model - The model the new conversation should start on.
 * @returns The newly created session.
 */
function makeSession(model: ModelOption): Session {
  return { id: crypto.randomUUID(), modelKey: model.key, modelLabel: model.label, title: 'New conversation', createdAt: Date.now() };
}

/**
 * Top-level chat application component. Owns session/model state (persisted to
 * localStorage), tracks auth status and profile, drives theme, and routes between
 * the chat thread and the settings/skills/mcp admin views.
 * @returns A loading screen while the auth check is pending; the Welcome sign-in
 * screen if the user isn't authenticated; otherwise the sidebar plus the active
 * view (chat thread or one of the admin panels).
 */
export function App() {
  const initRef = useRef<{ sessions: Session[]; activeId: string } | null>(null);
  if (!initRef.current) {
    const saved = loadSessions();
    const sessions = saved.length
      ? saved
      : (() => { const s = [makeSession(FALLBACK_MODEL)]; saveSessions(s); return s; })();
    const restoredId = loadActiveSessionId();
    const activeId = (restoredId && sessions.some((s) => s.id === restoredId))
      ? restoredId
      : sessions[sessions.length - 1].id;
    initRef.current = { sessions, activeId };
  }

  const [sessions, setSessions] = useState<Session[]>(initRef.current.sessions);
  const [activeId, setActiveId] = useState<string>(initRef.current.activeId);
  const [models, setModels] = useState<ModelOption[]>([FALLBACK_MODEL]);
  const [defaultKey, setDefaultKey] = useState<string>(FALLBACK_MODEL.key);
  const [modelsLoading, setModelsLoading] = useState(true);
  // The model new conversations start on. Seeded from localStorage; if the user
  // has never chosen one, we adopt the server default once /api/models resolves.
  const storedPrefRef = useRef<string | null>(loadPreferredModel());
  const [preferredModelKey, setPreferredModelKey] = useState<string>(storedPrefRef.current ?? FALLBACK_MODEL.key);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Whether the initial /api/me check has resolved — until then we don't know if
  // the user is signed in, so we hold rendering to avoid flashing the login screen.
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<View>(resolveInitialView);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  // "Auto mode" (HITL confirmation bypass) — a live, global setting (see
  // autoMode.ts), not tied to any one conversation, sent as a request header.
  const [autoMode, setAutoMode] = useState<boolean>(isAutoModeEnabled);
  // App-level conversation store: durable observations live here, decoupled from
  // the view, so a response keeps streaming in its own thread across view switches.
  const store = useConversationsStore();

  useEffect(() => { applyTheme(theme); saveTheme(theme); }, [theme]);
  /** Flips the app theme between `'light'` and `'dark'`. */
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  /**
   * Updates the live "Auto mode" setting sent on every subsequent request —
   * takes effect immediately, including in the currently active conversation.
   * @param enabled - The new "Auto mode" state selected in Settings.
   */
  const handleAutoModeChange = useCallback((enabled: boolean) => {
    setAutoModeEnabled(enabled);
    setAutoMode(enabled);
  }, []);

  useEffect(() => { saveSessions(sessions); }, [sessions]);
  useEffect(() => { saveActiveSessionId(activeId); }, [activeId]);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json() as Promise<{ models: ModelOption[]; defaultKey: string }>)
      .then((data) => {
        if (data.models?.length) setModels(data.models);
        if (data.defaultKey) {
          setDefaultKey(data.defaultKey);
          if (!storedPrefRef.current) setPreferredModelKey(data.defaultKey);
        }
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.ok ? r.json() as Promise<UserProfile> : null)
      .then((data) => {
        // A different identity (or no identity) than whichever this browser
        // last saw — including a session that simply expired rather than an
        // explicit Sign out. Never let another identity's chat list or Auto
        // mode setting carry over.
        const fingerprint = data?.email ?? null;
        if (fingerprint !== loadAuthFingerprint()) {
          saveAuthFingerprint(fingerprint);
          try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(ACTIVE_KEY); } catch {}
          setAutoModeEnabled(false);
          setAutoMode(false);
          store.reset();
          const fresh = makeSession(FALLBACK_MODEL);
          setSessions([fresh]);
          setActiveId(fresh.id);
        }
        if (data) setProfile(data);
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, [store]);

  const defaultModel = models.find((m) => m.key === defaultKey) ?? models[0] ?? FALLBACK_MODEL;
  const activeSession = sessions.find((s) => s.id === activeId) ?? sessions[sessions.length - 1];
  /**
   * Looks up a model option by key.
   * @param key - The model key to resolve.
   * @returns The matching model option, or the default model if no model has that key.
   */
  const modelOf = (key: string): ModelOption => models.find((m) => m.key === key) ?? defaultModel;

  /** Creates a new session on the preferred model and makes it the active session. */
  const handleNewSession = useCallback(() => {
    const s = makeSession(modelOf(preferredModelKey));
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
  }, [preferredModelKey, defaultModel, models]);

  /**
   * Removes a session from the list. If it was the last remaining session, a
   * fresh one on the default model is created and persisted immediately so the
   * app never ends up with zero sessions. If the deleted session was active,
   * the new last session becomes active.
   * @param id - The id of the session to delete.
   */
  const handleDeleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (next.length === 0) {
          const s = makeSession(defaultModel);
          saveSessions([s]);
          setActiveId(s.id);
          return [s];
        }
        if (id === activeId) setActiveId(next[next.length - 1].id);
        return next;
      });
    },
    [activeId, defaultModel],
  );

  /**
   * Updates the preferred model new conversations start on, and persists it to
   * localStorage. A thread stays on the model it was created with, so history
   * never mixes voices — this only affects the next "New conversation".
   * @param key - The model key selected in Settings.
   */
  const handleModelChange = useCallback((key: string) => {
    storedPrefRef.current = key;
    setPreferredModelKey(key);
    try { localStorage.setItem(MODEL_KEY, key); } catch {}
  }, []);

  /**
   * Sets the active session's title from the conversation's first message,
   * truncated to 40 characters with an ellipsis if longer.
   * @param text - The text of the first message sent in the conversation.
   */
  const handleFirstMessage = useCallback((text: string) => {
    const title = text.trim().slice(0, 40) + (text.trim().length > 40 ? '…' : '');
    setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, title } : s));
  }, [activeId]);

  /** Navigates to the server-side Zoho OAuth login flow, which returns here after consent. */
  const handleSignIn = useCallback(() => {
    window.location.assign('/api/auth/login?returnTo=/');
  }, []);

  /**
   * Signs the user out: calls the logout endpoint, clears the persisted session
   * list and resets the conversations store so nothing carries over to the next
   * signed-in user on a shared device, then seeds a fresh session.
   */
  const handleSignOut = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    // Don't leave conversations behind on a shared device: drop the local chat
    // list, close the store's observations, and start from a clean slate.
    try { localStorage.removeItem(STORE_KEY); } catch {}
    store.reset();
    const fresh = makeSession(FALLBACK_MODEL);
    setSessions([fresh]);
    setActiveId(fresh.id);
    setProfile(null);
  }, [store]);

  // The conversation instance id the assistant addresses (`<modelKey>__<uuid>`).
  const activeConvId = activeSession ? `${activeSession.modelKey}__${activeSession.id}` : '';

  // Tell the store which conversation is active; it keeps that one (and any
  // still-running ones) observed, releasing idle connections on its own.
  useEffect(() => {
    if (activeConvId) store.setActive(activeConvId);
  }, [activeConvId, store]);

  // Login is required: hold until the auth check resolves, then show the Welcome
  // login screen (wired to the Zoho OAuth flow) unless the user is signed in.
  if (!authChecked) {
    return (
      <>
        <div className="ambient" />
        <div className="login-screen"><div className="tool-spinner" /></div>
      </>
    );
  }
  if (!profile) {
    return (
      <>
        <div className="ambient" />
        <Welcome onSignIn={handleSignIn} />
      </>
    );
  }

  return (
    <>
      <div className="ambient" />
    <SidebarProvider collapsible="offcanvas" defaultOpen className="h-screen overflow-hidden">
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={(id) => { setView('chat'); setActiveId(id); }}
        onNew={() => { setView('chat'); handleNewSession(); }}
        onDelete={handleDeleteSession}
        onSettings={() => setView('settings')}
        onSkills={() => setView('skills')}
        onMcp={() => setView('mcp')}
      />

      {view === 'settings'
        ? <Settings
            profile={profile}
            models={models}
            modelsLoading={modelsLoading}
            modelKey={preferredModelKey}
            onModelChange={handleModelChange}
            theme={theme}
            onToggleTheme={toggleTheme}
            autoMode={autoMode}
            onAutoModeChange={handleAutoModeChange}
            onSignOut={handleSignOut}
            onBack={() => setView('chat')}
          />
        : view === 'skills'
        ? <Skills onBack={() => setView('chat')} />
        : view === 'mcp'
        ? <McpServers onBack={() => setView('chat')} onSignIn={handleSignIn} />
        : null}

      {/* The store keeps the active + any running conversations observed; the
          active conversation's live view is fed to Thread here. Switching views
          or chats never tears down a running conversation. */}
      {view === 'chat' && activeSession && (
        <ActiveConversation convId={activeConvId} onFirstMessage={handleFirstMessage}>
          <Thread
            modelLabel={activeSession.modelLabel}
            requiresAuth={models.find((m) => m.key === activeSession.modelKey)?.requiresAuth ?? false}
            attachmentMimeTypes={models.find((m) => m.key === activeSession.modelKey)?.attachmentMimeTypes ?? []}
            isSignedIn={!!profile}
            onSignIn={handleSignIn}
            profile={profile}
            onSignOut={handleSignOut}
            onConnectMcp={() => setView('mcp')}
            autoMode={autoMode}
          />
        </ActiveConversation>
      )}
    </SidebarProvider>
    </>
  );
}
