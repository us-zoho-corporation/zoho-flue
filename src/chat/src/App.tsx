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

export type AgentEntry = {
  name: string;
  description?: string;
  transports: { http?: true };
  defined: boolean;
};

export type UserProfile = {
  displayName: string;
  email: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
};

export interface Session {
  id: string;
  agentName: string;
  title: string;
  createdAt: number;
}

const STORE_KEY = 'flue:sessions:v2';

function loadSessions(): Session[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]'); } catch { return []; }
}

function saveSessions(sessions: Session[]) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(sessions)); } catch {}
}

function makeSession(agentName: string): Session {
  return { id: crypto.randomUUID(), agentName, title: 'New conversation', createdAt: Date.now() };
}

export function App() {
  const initRef = useRef<{ sessions: Session[]; activeId: string } | null>(null);
  if (!initRef.current) {
    const saved = loadSessions();
    const sessions = saved.length
      ? saved
      : (() => { const s = [makeSession('main')]; saveSessions(s); return s; })();
    initRef.current = { sessions, activeId: sessions[sessions.length - 1].id };
  }

  const [sessions, setSessions] = useState<Session[]>(initRef.current.sessions);
  const [activeId, setActiveId] = useState<string>(initRef.current.activeId);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'chat' | 'settings' | 'workflows' | 'skills' | 'agents' | 'runs'>('chat');

  useEffect(() => { saveSessions(sessions); }, [sessions]);

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json() as Promise<AgentEntry[]>)
      .then((data) => setAgents(data.filter((a) => a.transports.http && a.defined)))
      .catch(() => {})
      .finally(() => setAgentsLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.ok ? r.json() as Promise<UserProfile> : null)
      .then((data) => data && setProfile(data))
      .catch(() => {});
  }, []);

  const activeSession = sessions.find((s) => s.id === activeId) ?? sessions[sessions.length - 1];

  const handleNewSession = useCallback(
    (agentName?: string) => {
      const s = makeSession(agentName ?? activeSession?.agentName ?? 'main');
      setSessions((prev) => [...prev, s]);
      setActiveId(s.id);
    },
    [activeSession],
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (next.length === 0) {
          const s = makeSession(activeSession?.agentName ?? 'main');
          saveSessions([s]);
          setActiveId(s.id);
          return [s];
        }
        if (id === activeId) setActiveId(next[next.length - 1].id);
        return next;
      });
    },
    [activeId, activeSession],
  );

  const handleAgentChange = useCallback((agentName: string) => {
    const s = makeSession(agentName);
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
  }, []);

  const handleFirstMessage = useCallback((text: string) => {
    const title = text.trim().slice(0, 40) + (text.trim().length > 40 ? '…' : '');
    setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, title } : s));
  }, [activeId]);

  return (
    <SidebarProvider collapsible="offcanvas" defaultOpen className="h-screen overflow-hidden">
      <FlueAssistantBridge
        key={activeId}
        agentName={activeSession?.agentName ?? 'main'}
        conversationId={activeId}
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
              agents={agents}
              agentsLoading={agentsLoading}
              agentName={activeSession?.agentName ?? 'main'}
              onAgentChange={handleAgentChange}
              profile={profile}
            />
        }
      </FlueAssistantBridge>
    </SidebarProvider>
  );
}
