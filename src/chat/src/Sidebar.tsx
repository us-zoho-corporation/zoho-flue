import {
  CaretDown,
  ClockCounterClockwise,
  GearSix,
  Lightning,
  MagnifyingGlass,
  Plugs,
  Plus,
  Robot,
  SignOut,
  Trash,
  TreeStructure,
  User,
} from '@phosphor-icons/react';
import { useSidebar } from '@cloudflare/kumo';
import { useState } from 'react';
import type { Session, UserProfile } from './App.tsx';
import { useRunningIds } from './conversations.tsx';
import { ZohoLogo } from './ZohoLogo.tsx';

function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : `${d}d ago`;
}

function initialsOf(profile: UserProfile): string {
  const fromNames = [profile.firstName[0], profile.lastName[0]].filter(Boolean).join('');
  return (fromNames || profile.displayName[0] || '?').toUpperCase();
}

interface SidebarProps {
  sessions: Session[];
  activeId: string;
  profile: UserProfile | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
  onWorkflows: () => void;
  onSkills: () => void;
  onAgents: () => void;
  onRuns: () => void;
  onMcp: () => void;
}

const WORKSPACE: { key: string; label: string; icon: typeof Robot }[] = [
  { key: 'agents', label: 'Agents', icon: Robot },
  { key: 'skills', label: 'Skills', icon: Lightning },
  { key: 'workflows', label: 'Workflows', icon: TreeStructure },
  { key: 'mcp', label: 'MCP servers', icon: Plugs },
  { key: 'runs', label: 'Runs', icon: ClockCounterClockwise },
  { key: 'settings', label: 'Settings', icon: GearSix },
];

export function Sidebar({ sessions, activeId, profile, onSignIn, onSignOut, onSelect, onNew, onDelete, onSettings, onWorkflows, onSkills, onAgents, onRuns, onMcp }: SidebarProps) {
  const { open } = useSidebar();
  const [search, setSearch] = useState('');
  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  const handlers: Record<string, () => void> = {
    agents: onAgents, skills: onSkills, workflows: onWorkflows, mcp: onMcp, runs: onRuns, settings: onSettings,
  };

  const running = useRunningIds();
  const q = search.trim().toLowerCase();
  const recents = [...sessions].reverse().filter((s) => !q || s.title.toLowerCase().includes(q));

  return (
    <aside className="sb-aside" style={{ width: open ? 308 : 0 }}>
      <div className="sb-body">
        <div className="sb-header" style={{ padding: '2px 6px 14px' }}>
          <span style={{ color: 'var(--txt1)', display: 'flex' }}><ZohoLogo height={22} /></span>
          <span style={{ flex: 1 }} />
          <span className="sb-badge">AI preview</span>
        </div>

        <button className="sb-newchat" onClick={onNew}>
          <Plus size={16} weight="bold" />
          New chat
        </button>

        <div className="sb-search" style={{ margin: '12px 0 6px' }}>
          <MagnifyingGlass size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
        </div>

        <div className="sb-label">Recent</div>

        <div className="sidebar-recents" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {recents.map((session) => (
            <div
              key={session.id}
              className="sb-item group"
              data-active={session.id === activeId}
              onClick={() => onSelect(session.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="sb-item-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {running.has(`${session.modelKey}__${session.id}`) && <span className="sb-running-dot" title="Responding…" />}
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title}</span>
                </span>
                <span className="sb-item-sub" style={{ display: 'block' }}>{session.modelLabel} · {timeAgo(session.createdAt)}</span>
              </span>
              <button
                className="sb-del"
                onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                title="Delete conversation"
                aria-label="Delete conversation"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', padding: 2 }}
              >
                <Trash size={13} />
              </button>
            </div>
          ))}
          {recents.length === 0 && (
            <div className="sb-item-sub" style={{ padding: '8px 10px' }}>{q ? 'No matching chats' : 'No chats yet'}</div>
          )}
        </div>

        <div className="sb-ws-toggle" onClick={() => setWorkspaceOpen((v) => !v)}>
          <span style={{ flex: 1, font: '600 11px var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--txt3)' }}>Workspace</span>
          <CaretDown size={13} style={{ color: 'var(--txt3)', transform: workspaceOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 180ms var(--ease-out)' }} />
        </div>

        {workspaceOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {WORKSPACE.map(({ key, label, icon: Icon }) => (
              <div key={key} className="sb-nav" onClick={handlers[key]}>
                <Icon size={16} />
                <span style={{ flex: 1 }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {profile ? (
          <div className="sb-user">
            <div className="sb-avatar">
              {profile.photoUrl
                ? <img src={profile.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span>{initialsOf(profile)}</span>}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="sb-user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.displayName}</div>
              <div className="sb-user-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.email}</div>
            </div>
            <button className="icon-btn sb-signout" onClick={onSignOut} title="Sign out" aria-label="Sign out">
              <SignOut size={16} />
            </button>
          </div>
        ) : (
          <button className="sb-user sb-signin" onClick={onSignIn}>
            <div className="sb-avatar" data-guest="true"><User size={16} weight="regular" /></div>
            <div style={{ minWidth: 0, textAlign: 'left' }}>
              <div className="sb-user-name">Sign in</div>
              <div className="sb-user-sub">Continue with Zoho to sync</div>
            </div>
          </button>
        )}
      </div>
    </aside>
  );
}
