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

// Used by the Agents admin view (the deployed-agent manifest), not the chat picker.
export type AgentEntry = {
  name: string;
  description?: string;
  transports: { http?: true };
  defined: boolean;
};

// A selectable provider-model (from /api/models). The chat runs one `assistant`
// agent; the chosen model is carried per conversation in the instance id.
export type ModelOption = { key: string; label: string };

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

// The single assistant agent. Its behavior is fixed; only the model varies, chosen
// per conversation and carried in the instance id (`<modelKey>__<id>`).
const ASSISTANT_AGENT = 'assistant';

// Used before /api/models resolves, and if it fails. Matches config.defaultChatModelKey.
const FALLBACK_MODEL: ModelOption = { key: 'claude', label: 'Claude Sonnet 5' };

function loadSessions(): Session[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]'); } catch { return []; }
}

function saveSessions(sessions: Session[]) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(sessions)); } catch {}
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'chat' | 'settings' | 'workflows' | 'skills' | 'agents' | 'runs'>('chat');

  useEffect(() => { saveSessions(sessions); }, [sessions]);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json() as Promise<{ models: ModelOption[]; defaultKey: string }>)
      .then((data) => {
        if (data.models?.length) setModels(data.models);
        if (data.defaultKey) setDefaultKey(data.defaultKey);
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
    const s = makeSession(modelOf(activeSession?.modelKey ?? defaultModel.key));
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
  }, [activeSession, defaultModel, models]);

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

  // Selecting a different model starts a fresh conversation — a thread stays on one
  // model, so history never mixes voices.
  const handleModelChange = useCallback((key: string) => {
    const s = makeSession(modelOf(key));
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
  }, [models, defaultModel]);

  const handleFirstMessage = useCallback((text: string) => {
    const title = text.trim().slice(0, 40) + (text.trim().length > 40 ? '…' : '');
    setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, title } : s));
  }, [activeId]);

  const active = activeSession ?? makeSession(defaultModel);

  return (
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
          ? <Settings profile={profile} onBack={() => setView('chat')} />
          : view === 'workflows'
          ? <Workflows onBack={() => setView('chat')} />
          : view === 'skills'
          ? <Skills onBack={() => setView('chat')} />
          : view === 'agents'
          ? <Agents onBack={() => setView('chat')} />
          : view === 'runs'
          ? <Runs onBack={() => setView('chat')} />
          : <Thread
              models={models}
              modelsLoading={modelsLoading}
              modelKey={active.modelKey}
              onModelChange={handleModelChange}
              profile={profile}
            />
        }
      </FlueAssistantBridge>
    </SidebarProvider>
  );
}
