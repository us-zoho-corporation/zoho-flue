import { ArrowLeft, CheckCircle, Circle, ClockCounterClockwise, XCircle, WarningCircle } from '@phosphor-icons/react';
import { Button, LayerCard } from '@cloudflare/kumo';
import { useEffect, useState } from 'react';

interface RunPointer {
  runId: string;
  workflowName: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  endedAt?: number;
}

interface RunsProps {
  onBack: () => void;
}

/**
 * Picks the icon representing a workflow run's current status.
 * @param status - The run's status.
 * @returns The status icon element (a pulsing circle for an active/unknown status).
 */
function statusIcon(status: RunPointer['status']) {
  switch (status) {
    case 'completed': return <CheckCircle size={14} className="text-green-600 shrink-0" />;
    case 'failed':    return <XCircle size={14} className="text-red-600 shrink-0" />;
    case 'cancelled': return <WarningCircle size={14} className="text-kumo-subtle shrink-0" />;
    default:          return <Circle size={14} className="text-kumo-inactive shrink-0 animate-pulse" />;
  }
}

/**
 * Formats an epoch-millisecond timestamp as a short, locale-aware date/time string in the viewer's local time zone.
 * @param ts - Epoch milliseconds to format.
 * @returns A string like "Jan 5, 3:45 PM".
 * @throws {RangeError} If `ts` is outside the range representable by `Temporal.Instant`.
 */
function formatTime(ts: number): string {
  return Temporal.Instant.fromEpochMilliseconds(ts)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Formats the elapsed time between a run's start and end (or now, if still running) as a compact human-readable string.
 * @param start - Epoch milliseconds when the run started.
 * @param end - Epoch milliseconds when the run ended; if omitted, the duration is computed against the current time.
 * @returns A string like "420ms", "1.2s", or "2m 5s".
 */
function duration(start: number, end?: number): string {
  const ms = (end ?? Date.now()) - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Full-page view listing recent Flue workflow runs, fetched from the run store on mount.
 * @param onBack - Called when the user clicks the back button to leave this view.
 * @returns The rendered runs list page, showing a loading state, an empty state, or the list of run cards.
 */
export function Runs({ onBack }: RunsProps) {
  const [runs, setRuns] = useState<RunPointer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/runs')
      .then(r => r.json() as Promise<RunPointer[]>)
      .then(setRuns)
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
          <h1 className="text-lg font-semibold text-kumo-default mb-1">Runs</h1>
          <p className="text-sm text-kumo-subtle mb-6">Recent workflow run history from the Flue run store.</p>

          {loading ? (
            <p className="text-sm text-kumo-subtle">Loading…</p>
          ) : runs.length === 0 ? (
            <LayerCard className="px-5 py-8 flex flex-col items-center gap-2 text-center">
              <ClockCounterClockwise size={24} className="text-kumo-inactive" />
              <p className="text-sm text-kumo-subtle">No runs recorded yet.</p>
              <p className="text-xs text-kumo-inactive">Workflow runs will appear here once invoked.</p>
            </LayerCard>
          ) : (
            <div className="flex flex-col gap-2">
              {runs.map(run => (
                <LayerCard key={run.runId} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {statusIcon(run.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-kumo-default">{run.workflowName}</p>
                        <span className="text-xs text-kumo-inactive font-mono">{run.runId.slice(0, 8)}…</span>
                      </div>
                      <p className="text-xs text-kumo-subtle mt-0.5">{formatTime(run.startedAt)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-kumo-inactive">{duration(run.startedAt, run.endedAt)}</p>
                      <p className="text-[11px] text-kumo-inactive capitalize mt-0.5">{run.status}</p>
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
