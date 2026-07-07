import { ArrowLeft, CheckCircle, Circle, TreeStructure, WarningCircle, XCircle } from '@phosphor-icons/react';
import { Button, LayerCard } from '@cloudflare/kumo';
import { useEffect, useState } from 'react';

interface RunPointer {
  runId: string;
  workflowName: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  endedAt?: number;
}

interface WorkflowsData {
  workflows: string[];
  runs: RunPointer[];
}

interface WorkflowsProps {
  onBack: () => void;
}

/**
 * Picks the icon representing a workflow run's status.
 * @param status - The run's current status.
 * @returns A filled check circle for completed runs, an X circle for failed runs, a warning circle for cancelled runs, or a pulsing outline circle for active runs.
 */
function statusIcon(status: RunPointer['status']) {
  switch (status) {
    case 'completed': return <CheckCircle size={13} className="text-green-600 shrink-0" />;
    case 'failed':    return <XCircle size={13} className="text-red-600 shrink-0" />;
    case 'cancelled': return <WarningCircle size={13} className="text-kumo-subtle shrink-0" />;
    default:          return <Circle size={13} className="text-kumo-inactive shrink-0 animate-pulse" />;
  }
}

/**
 * Formats the elapsed time of a workflow run as a compact duration string.
 * @param start - The run's start timestamp (epoch milliseconds).
 * @param end - The run's end timestamp (epoch milliseconds), or `undefined` if it's still active (elapsed time is measured against now).
 * @returns The duration formatted as milliseconds, seconds, or minutes and seconds.
 */
function duration(start: number, end?: number): string {
  const ms = (end ?? Date.now()) - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Displays the workflows defined under `src/workflows/` and their recent
 * runs, fetched from `/api/workflows`, grouping runs by workflow name and
 * showing each run's status and duration.
 * @param onBack - Called when the "Back" button is clicked.
 * @returns The workflows page, showing a loading state, an empty state, or the list of workflow cards with their runs.
 */
export function Workflows({ onBack }: WorkflowsProps) {
  const [data, setData] = useState<WorkflowsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/workflows')
      .then(r => r.json() as Promise<WorkflowsData>)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const workflows = data?.workflows ?? [];
  const runs = data?.runs ?? [];

  const runsByWorkflow = runs.reduce<Record<string, RunPointer[]>>((acc, r) => {
    (acc[r.workflowName] ??= []).push(r);
    return acc;
  }, {});

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
          <h1 className="text-lg font-semibold text-kumo-default mb-1">Workflows</h1>
          <p className="text-sm text-kumo-subtle mb-6">Finite agent-backed operations defined in <code className="text-xs">src/workflows/</code>.</p>

          {loading ? (
            <p className="text-sm text-kumo-subtle">Loading…</p>
          ) : workflows.length === 0 ? (
            <LayerCard className="px-5 py-8 flex flex-col items-center gap-2 text-center">
              <TreeStructure size={24} className="text-kumo-inactive" />
              <p className="text-sm text-kumo-subtle">No workflows defined yet.</p>
              <p className="text-xs text-kumo-inactive">Add a file to <code>src/workflows/</code> to get started.</p>
            </LayerCard>
          ) : (
            <div className="flex flex-col gap-4">
              {workflows.map(name => {
                const wfRuns = runsByWorkflow[name] ?? [];
                return (
                  <LayerCard key={name} className="px-5 py-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-7 h-7 rounded-md bg-kumo-elevated border border-kumo-line flex items-center justify-center shrink-0">
                        <TreeStructure size={13} className="text-kumo-subtle" />
                      </div>
                      <p className="text-sm font-medium text-kumo-default">{name}</p>
                      <span className="ml-auto text-xs text-kumo-inactive">{wfRuns.length} run{wfRuns.length !== 1 ? 's' : ''}</span>
                    </div>
                    {wfRuns.length > 0 && (
                      <div className="flex flex-col gap-1.5 pl-10">
                        {wfRuns.slice(0, 5).map(run => (
                          <div key={run.runId} className="flex items-center gap-2">
                            {statusIcon(run.status)}
                            <span className="text-xs text-kumo-subtle font-mono truncate flex-1">{run.runId.slice(0, 8)}…</span>
                            <span className="text-xs text-kumo-inactive">{duration(run.startedAt, run.endedAt)}</span>
                          </div>
                        ))}
                        {wfRuns.length > 5 && (
                          <p className="text-xs text-kumo-inactive pl-5">+{wfRuns.length - 5} more</p>
                        )}
                      </div>
                    )}
                  </LayerCard>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
