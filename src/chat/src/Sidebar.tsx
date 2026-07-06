import { ChatCircle, ClockCounterClockwise, GearSix, Lightning, Robot, TreeStructure, Trash } from '@phosphor-icons/react';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRoot,
  SidebarTrigger,
} from '@cloudflare/kumo';
import type { Session } from './App.tsx';

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
}

export function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, onSettings, onWorkflows, onSkills, onAgents, onRuns }: SidebarProps) {
  return (
    <SidebarRoot>
      <SidebarHeader className="flex flex-row items-center gap-2 px-3 py-3 pr-2">
        <div className="w-6 h-6 rounded-md bg-red-600 flex items-center justify-center text-white text-xs font-black tracking-tighter shrink-0">Z</div>
        <span className="text-sm font-semibold text-kumo-subtle tracking-tight">Zoho Assistant</span>
        <SidebarTrigger className="ml-auto" />
      </SidebarHeader>

      <SidebarContent className="flex flex-col overflow-hidden flex-1 min-h-0">
        <SidebarGroup className="shrink-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onNew}>
                <ChatCircle size={14} className="shrink-0 text-kumo-subtle" />
                <span className="text-sm">New conversation</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <div className="flex-1 min-h-0 overflow-y-auto sidebar-recents">
          <SidebarGroup>
            <SidebarGroupLabel>Recents</SidebarGroupLabel>
            <SidebarMenu>
              {[...sessions].reverse().map((session) => (
                <SidebarMenuItem key={session.id}>
                  <SidebarMenuButton
                    active={session.id === activeId}
                    onClick={() => onSelect(session.id)}
                  >
                    <span className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="text-sm truncate">{session.title}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs text-kumo-subtle">{session.modelLabel}</span>
                        <span className="text-xs text-kumo-subtle opacity-50">·</span>
                        <span className="text-xs text-kumo-subtle opacity-50">{timeAgo(session.createdAt)}</span>
                      </span>
                    </span>
                    <button
                      className="shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover/menu-item:opacity-60 hover:!opacity-100 hover:bg-red-500/15 hover:text-red-400 transition-all text-kumo-inactive"
                      onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                      title="Delete conversation"
                    >
                      <Trash size={11} />
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </div>
      </SidebarContent>

      <div className="shrink-0 border-t border-kumo-line">
        <button
          onClick={onAgents}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-kumo-subtle hover:text-kumo-default hover:bg-black/5 transition-colors cursor-pointer"
        >
          <Robot size={14} className="shrink-0" />
          Agents
        </button>
        <button
          onClick={onRuns}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-kumo-subtle hover:text-kumo-default hover:bg-black/5 transition-colors cursor-pointer"
        >
          <ClockCounterClockwise size={14} className="shrink-0" />
          Runs
        </button>
        <button
          onClick={onSkills}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-kumo-subtle hover:text-kumo-default hover:bg-black/5 transition-colors cursor-pointer"
        >
          <Lightning size={14} className="shrink-0" />
          Skills
        </button>
        <button
          onClick={onWorkflows}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-kumo-subtle hover:text-kumo-default hover:bg-black/5 transition-colors cursor-pointer"
        >
          <TreeStructure size={14} className="shrink-0" />
          Workflows
        </button>
        <button
          onClick={onSettings}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-kumo-subtle hover:text-kumo-default hover:bg-black/5 transition-colors cursor-pointer"
        >
          <GearSix size={14} className="shrink-0" />
          Settings
        </button>
      </div>
    </SidebarRoot>
  );
}
