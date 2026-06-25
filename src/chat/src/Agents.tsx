import { ArrowLeft, Robot } from '@phosphor-icons/react';
import { Button, LayerCard } from '@cloudflare/kumo';
import { useEffect, useState } from 'react';
import type { AgentEntry } from './App.tsx';

interface AgentsProps {
  onBack: () => void;
}

export function Agents({ onBack }: AgentsProps) {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json() as Promise<AgentEntry[]>)
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="chat-topbar">
        <Button variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-1.5">
          <ArrowLeft size={14} />
          Back
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h1 className="text-lg font-semibold text-kumo-default mb-1">Agents</h1>
          <p className="text-sm text-kumo-subtle mb-6">Deployed agents registered in the Flue runtime manifest.</p>

          {loading ? (
            <p className="text-sm text-kumo-subtle">Loading…</p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-kumo-subtle">No agents found.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {agents.map(agent => (
                <LayerCard key={agent.name} className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-md bg-kumo-elevated border border-kumo-line flex items-center justify-center shrink-0">
                      <Robot size={13} className="text-kumo-subtle" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-kumo-default">{agent.name}</p>
                      {agent.description && (
                        <p className="text-xs text-kumo-subtle mt-0.5 leading-relaxed">{agent.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {agent.transports.http && (
                        <span className="px-1.5 py-0.5 rounded text-[11px] text-kumo-inactive bg-kumo-elevated border border-kumo-line">HTTP</span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded text-[11px] border ${agent.defined ? 'text-green-400 bg-green-400/10 border-green-400/20' : 'text-kumo-inactive bg-kumo-elevated border-kumo-line'}`}>
                        {agent.defined ? 'defined' : 'undefined'}
                      </span>
                    </div>
                  </div>
                </LayerCard>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
