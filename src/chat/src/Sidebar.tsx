import {
  CaretDown,
  ChatText,
  ClockCounterClockwise,
  GearSix,
  Lightning,
  MagnifyingGlass,
  Plugs,
  Plus,
  Robot,
  Trash,
  TreeStructure,
} from '@phosphor-icons/react';
import { useSidebar } from '@cloudflare/kumo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Session } from './App.tsx';
import { useRunningIds } from './conversations.tsx';
import { ZohoLogo } from './ZohoLogo.tsx';

/**
 * Formats a timestamp as a short relative-time label for sidebar rows.
 * @param ts - The timestamp (epoch milliseconds) to compare against now.
 * @returns A human-readable relative time such as "Just now", "5m ago", "3h ago", "Yesterday", or "4d ago".
 */
function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : `${d}d ago`;
}

interface SidebarProps {
  sessions: Session[];
  activeId: string;
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

/**
 * Renders the app sidebar: the Zoho logo header, new-chat button, chat search,
 * the searchable recent-conversations list (with right-click delete menu and
 * two-finger swipe-to-delete), and the collapsible Workspace nav.
 * @param sessions - All chat sessions to list under "Recent".
 * @param activeId - The id of the currently selected session, used to highlight its row.
 * @param onSelect - Called with a session id when its row (or its "Open chat" context-menu entry) is clicked.
 * @param onNew - Called when "New chat" is clicked.
 * @param onDelete - Called with a session id once its delete animation finishes and it should be removed.
 * @param onSettings - Called when the "Settings" workspace item is clicked.
 * @param onWorkflows - Called when the "Workflows" workspace item is clicked.
 * @param onSkills - Called when the "Skills" workspace item is clicked.
 * @param onAgents - Called when the "Agents" workspace item is clicked.
 * @param onRuns - Called when the "Runs" workspace item is clicked.
 * @param onMcp - Called when the "MCP servers" workspace item is clicked.
 * @returns The sidebar `<aside>` plus a portal-rendered context menu overlay when one is open.
 */
export function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, onSettings, onWorkflows, onSkills, onAgents, onRuns, onMcp }: SidebarProps) {
  const { open } = useSidebar();
  const [search, setSearch] = useState('');
  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  const handlers: Record<string, () => void> = {
    agents: onAgents, skills: onSkills, workflows: onWorkflows, mcp: onMcp, runs: onRuns, settings: onSettings,
  };

  const running = useRunningIds();
  const q = search.trim().toLowerCase();
  const recents = [...sessions].reverse().filter((s) => !q || s.title.toLowerCase().includes(q));

  // Chat deletion: right-click a chat for a context menu, or two-finger swipe it
  // left past a threshold. Either way the row slides out before it's removed.
  const recentsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; live: boolean } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; x: number } | null>(null);
  const deletingRef = useRef<string | null>(null);
  const dragMoved = useRef(false);
  const wheelTimer = useRef<number | undefined>(undefined);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  /**
   * Plays the slide-out animation for a session row, then removes the
   * session once the animation finishes. Ignores the call if a delete is
   * already in progress.
   * @param id - The id of the session to delete.
   */
  const animateDelete = useCallback((id: string) => {
    if (deletingRef.current) return;
    deletingRef.current = id;
    setDeletingId(id);
    window.setTimeout(() => {
      onDeleteRef.current(id);
      deletingRef.current = null;
      setDeletingId(null);
    }, 260);
  }, []);

  // Two-finger trackpad swipe. Wheel listeners are passive by default (so
  // preventDefault is a no-op), hence a manual non-passive listener here.
  useEffect(() => {
    const el = recentsRef.current;
    if (!el) return;
    /**
     * Handles a trackpad wheel event over the recents list, translating a
     * horizontal two-finger swipe into a live drag offset for the row under
     * the cursor, and scheduling a delete once the gesture settles past the
     * -72px threshold.
     * @param e - The wheel event dispatched on the recents container.
     */
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical scroll — leave it
      if (deletingRef.current) return;
      const row = (e.target as HTMLElement).closest('[data-conv-id]');
      const id = row?.getAttribute('data-conv-id');
      if (!id) return;
      e.preventDefault();
      setCtx(null);
      const base = dragRef.current?.id === id ? dragRef.current.x : 0;
      const x = Math.min(0, base - e.deltaX);
      dragRef.current = { id, x };
      dragMoved.current = true;
      setDrag({ id, x, live: true });
      if (wheelTimer.current) window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => {
        const d = dragRef.current;
        dragMoved.current = false;
        dragRef.current = null;
        setDrag(null);
        if (d && d.id === id && d.x < -72) animateDelete(id);
      }, 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [animateDelete]);

  // Dismiss the context menu on Escape.
  useEffect(() => {
    if (!ctx) return;
    /**
     * Closes the open context menu when the user presses Escape.
     * @param e - The keydown event dispatched on the window.
     */
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtx(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx]);

  return (
    <>
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

        <div ref={recentsRef} className="sidebar-recents" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {recents.map((session) => {
            const isDeleting = deletingId === session.id;
            const isDragging = drag?.id === session.id;
            const slideX = isDeleting ? '-100%' : isDragging ? `${Math.min(0, drag.x)}px` : '0px';
            const revealW = isDeleting ? '100%' : isDragging ? `${Math.max(0, -drag.x)}px` : '0px';
            return (
              <div key={session.id} className="sb-recent" style={{ opacity: isDeleting ? 0 : 1 }}>
                <div className="sb-recent-reveal" style={{ width: revealW }}><span>Delete</span></div>
                <div
                  className="sb-item"
                  data-conv-id={session.id}
                  data-active={session.id === activeId}
                  onClick={() => { if (dragMoved.current) { dragMoved.current = false; return; } onSelect(session.id); }}
                  onContextMenu={(e) => { e.preventDefault(); setCtx({ id: session.id, x: e.clientX, y: e.clientY }); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    transform: `translateX(${slideX})`,
                    transition: `background 140ms var(--ease-out), transform ${isDragging && drag.live ? '0ms' : '240ms var(--ease-out)'}`,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="sb-item-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {running.has(`${session.modelKey}__${session.id}`) && <span className="sb-running-dot" title="Responding…" />}
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title}</span>
                    </span>
                    <span className="sb-item-sub" style={{ display: 'block' }}>{session.modelLabel} · {timeAgo(session.createdAt)}</span>
                  </span>
                </div>
              </div>
            );
          })}
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
      </div>
    </aside>

    {ctx && createPortal(
      <>
        <div className="sb-ctx-overlay" onClick={() => setCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCtx(null); }} />
        <div className="sb-ctx" style={{ left: ctx.x, top: ctx.y }}>
          <button className="sb-ctx-item" onClick={() => { onSelect(ctx.id); setCtx(null); }}>
            <ChatText size={14} />
            Open chat
          </button>
          <div className="sb-ctx-sep" />
          <button className="sb-ctx-item sb-ctx-danger" onClick={() => { const id = ctx.id; setCtx(null); animateDelete(id); }}>
            <Trash size={14} />
            Delete chat
          </button>
        </div>
      </>,
      document.body,
    )}
    </>
  );
}
