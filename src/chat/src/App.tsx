import { SidebarProvider } from '@cloudflare/kumo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Agents } from './Agents.tsx';
import { FlueAssistantBridge } from './FlueRuntime.tsx';
import { Runs } from './Runs.tsx';
import { Settings } from './Settings.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Skills } from './Skills.tsx';
import { Thread } from './Thread.tsx';
import { Workflows } from './Workflows.tsx';
import { applyTheme, loadTheme, saveTheme, type Theme } from './theme.ts';

// Used by the Agents admin view (the deployed-agent manifest), not the chat picker.
export type AgentEntry = {
  name: string;
  description?: string;
  transports: { http?: true };
  defined: boolean;
};

// A selectable provider-model (from /api/models). The chat runs one `assistant`
// agent; the chosen model is carried per conversation in the instance id.
// `requiresAuth` models run as the logged-in user, so the chat prompts sign-in.
export type ModelOption = { key: string; label: string; requiresAuth?: boolean };

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

// The single assistant agent. Its behavior is fixed; only the model varies, chosen
// per conversation and carried in the instance id (`<modelKey>__<id>`).
const ASSISTANT_AGENT = 'assistant';

// Used before /api/models resolves, and if it fails. Matches config.defaultChatModelKey.
const FALLBACK_MODEL: ModelOption = { key: 'claude', label: 'Claude Sonnet 5', requiresAuth: false };

function loadSessions(): Session[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]'); } catch { return []; }
}

function saveSessions(sessions: Session[]) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(sessions)); } catch {}
}

function loadPreferredModel(): string | null {
  try { return localStorage.getItem(MODEL_KEY); } catch { return null; }
}

function makeSession(model: ModelOption): Session {
  return { id: crypto.randomUUID(), modelKey: model.key, modelLabel: model.label, title: 'New conversation', createdAt: Date.now() };
}

export function App() {
  const initRef = useRef<{ sessions: Session[]; activeId: string } | null>(null);
  if (!initRef.current) {
    const saved = loadSessions();
    const sessions = saved.length
      ? saved
      : (() => { const s = [makeSession(FALLBACK_MODEL)]; saveSessions(s); return s; })();
    initRef.current = { sessions, activeId: sessions[sessions.length - 1].id };
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
  const [view, setView] = useState<'chat' | 'settings' | 'workflows' | 'skills' | 'agents' | 'runs'>('chat');
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => { applyTheme(theme); saveTheme(theme); }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  useEffect(() => { saveSessions(sessions); }, [sessions]);

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
      .then((data) => data && setProfile(data))
      .catch(() => {});
  }, []);

  const defaultModel = models.find((m) => m.key === defaultKey) ?? models[0] ?? FALLBACK_MODEL;
  const activeSession = sessions.find((s) => s.id === activeId) ?? sessions[sessions.length - 1];
  const modelOf = (key: string): ModelOption => models.find((m) => m.key === key) ?? defaultModel;

  const handleNewSession = useCallback(() => {
    const s = makeSession(modelOf(preferredModelKey));
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
  }, [preferredModelKey, defaultModel, models]);

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

  // Chosen in Settings: the model new conversations start on. A thread stays on the
  // model it was created with, so history never mixes voices — changing this only
  // affects the next "New conversation".
  const handleModelChange = useCallback((key: string) => {
    storedPrefRef.current = key;
    setPreferredModelKey(key);
    try { localStorage.setItem(MODEL_KEY, key); } catch {}
  }, []);

  const handleFirstMessage = useCallback((text: string) => {
    const title = text.trim().slice(0, 40) + (text.trim().length > 40 ? '…' : '');
    setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, title } : s));
  }, [activeId]);

  // Redirect to the server-side Zoho OAuth flow; it returns here after consent.
  const handleSignIn = useCallback(() => {
    window.location.assign('/api/auth/login?returnTo=/');
  }, []);

  const handleSignOut = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    setProfile(null);
  }, []);

  const active = activeSession ?? makeSession(defaultModel);

  return (
    <>
      <div className="ambient" />
    <SidebarProvider collapsible="offcanvas" defaultOpen className="h-screen overflow-hidden">
      <FlueAssistantBridge
        key={active.id}
        agentName={ASSISTANT_AGENT}
        conversationId={`${active.modelKey}__${active.id}`}
        onFirstMessage={handleFirstMessage}
      >
        <Sidebar
          sessions={sessions}
          activeId={activeId}
          profile={profile}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onSelect={(id) => { setView('chat'); setActiveId(id); }}
          onNew={() => { setView('chat'); handleNewSession(); }}
          onDelete={handleDeleteSession}
          onSettings={() => setView('settings')}
          onWorkflows={() => setView('workflows')}
          onSkills={() => setView('skills')}
          onAgents={() => setView('agents')}
          onRuns={() => setView('runs')}
        />
        {view === 'settings'
          ? <Settings
              profile={profile}
              models={models}
              modelsLoading={modelsLoading}
              modelKey={preferredModelKey}
              onModelChange={handleModelChange}
              onBack={() => setView('chat')}
            />
          : view === 'workflows'
          ? <Workflows onBack={() => setView('chat')} />
          : view === 'skills'
          ? <Skills onBack={() => setView('chat')} />
          : view === 'agents'
          ? <Agents onBack={() => setView('chat')} />
          : view === 'runs'
          ? <Runs onBack={() => setView('chat')} />
          : <Thread
              modelLabel={active.modelLabel}
              requiresAuth={models.find((m) => m.key === active.modelKey)?.requiresAuth ?? false}
              isSignedIn={!!profile}
              onSignIn={handleSignIn}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
        }
      </FlueAssistantBridge>
    </SidebarProvider>
    </>
  );
}
