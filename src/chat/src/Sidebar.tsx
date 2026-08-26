import {
  CaretDown,
  ChatText,
  GearSix,
  Lightning,
  MagnifyingGlass,
  Plugs,
  Plus,
  Trash,
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
  onSkills: () => void;
  onMcp: () => void;
}

const WORKSPACE: { key: string; label: string; icon: typeof Lightning }[] = [
  { key: 'skills', label: 'Skills', icon: Lightning },
  { key: 'mcp', label: 'MCP servers', icon: Plugs },
  { key: 'settings', label: 'Settings', icon: GearSix },
];

/**
 * Renders the app sidebar: the Zoho logo header, new-chat button, chat search,
 * the searchable recent-conversations list (right-click a row for a delete
 * menu), and the collapsible Workspace nav.
 * @param sessions - All chat sessions to list under "Recent".
 * @param activeId - The id of the currently selected session, used to highlight its row.
 * @param onSelect - Called with a session id when its row (or its "Open chat" context-menu entry) is clicked.
 * @param onNew - Called when "New chat" is clicked.
 * @param onDelete - Called with a session id once its delete animation finishes and it should be removed.
 * @param onSettings - Called when the "Settings" workspace item is clicked.
 * @param onSkills - Called when the "Skills" workspace item is clicked.
 * @param onMcp - Called when the "MCP servers" workspace item is clicked.
 * @returns The sidebar `<aside>` plus a portal-rendered context menu overlay when one is open.
 */
export function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, onSettings, onSkills, onMcp }: SidebarProps) {
  const { open, isMobile, openMobile, setOpenMobile } = useSidebar();
  const visible = isMobile ? openMobile : open;
  const [search, setSearch] = useState('');
  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  // On narrow viewports the sidebar is an overlay drawer, not a push-layout
  // column — tapping a destination should close it, same as any mobile app
  // shell, so the chosen view is actually visible underneath.
  const closeOnMobile = useCallback(() => { if (isMobile) setOpenMobile(false); }, [isMobile, setOpenMobile]);
  const handlers: Record<string, () => void> = {
    skills: onSkills, mcp: onMcp, settings: onSettings,
  };

  const running = useRunningIds();
  const q = search.trim().toLowerCase();
  const recents = [...sessions].reverse().filter((s) => !q || s.title.toLowerCase().includes(q));

  // Chat deletion: right-click a chat for a context menu, or click its
  // delete button. Either way the row fades out before it's removed.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const deletingRef = useRef<string | null>(null);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  /**
   * Plays the fade-out animation for a session row, then removes the
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
    {isMobile && visible && <div className="sb-backdrop" onClick={() => setOpenMobile(false)} />}
    <aside
      className={`sb-aside${isMobile ? ' sb-aside-mobile' : ''}`}
      data-open={visible}
      style={isMobile ? undefined : { width: open ? 308 : 0 }}
    >
      <div className="sb-body">
        <div className="sb-header" style={{ padding: '2px 6px 14px' }}>
          <span style={{ color: 'var(--txt1)', display: 'flex' }}><ZohoLogo height={22} /></span>
          <span style={{ flex: 1 }} />
          <span className="sb-badge">AI preview</span>
        </div>

        <button className="sb-newchat" onClick={() => { onNew(); closeOnMobile(); }}>
          <Plus size={16} weight="bold" />
          New chat
        </button>

        <div className="sb-search" style={{ margin: '12px 0 6px' }}>
          <MagnifyingGlass size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
        </div>

        <div className="sb-label">Recent</div>

        <div className="sidebar-recents" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {recents.map((session) => {
            const isDeleting = deletingId === session.id;
            return (
              <div key={session.id} className="sb-recent" style={{ opacity: isDeleting ? 0 : 1 }}>
                <div
                  className="sb-item"
                  data-active={session.id === activeId}
                  onClick={() => { onSelect(session.id); closeOnMobile(); }}
                  onContextMenu={(e) => { e.preventDefault(); setCtx({ id: session.id, x: e.clientX, y: e.clientY }); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
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
              <div key={key} className="sb-nav" onClick={() => { handlers[key](); closeOnMobile(); }}>
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
