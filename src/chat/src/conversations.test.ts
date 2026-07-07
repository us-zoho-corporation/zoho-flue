import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationsStore } from './conversations.tsx';

// ─── Fakes for the Flue client + observation ────────────────────────────────────

type Snap = { conversation: unknown; offset: string | undefined; phase: string; error: Error | undefined };

class FakeObservation {
  snap: Snap = { conversation: undefined, offset: undefined, phase: 'loading', error: undefined };
  listeners = new Set<() => void>();
  closed = false;
  getSnapshot() { return this.snap; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  refresh() {}
  close() { this.closed = true; }
  /** test helper: update snapshot + notify subscribers */
  set(snap: Partial<Snap>) { this.snap = { ...this.snap, ...snap }; for (const fn of [...this.listeners]) fn(); }
}

function makeClient() {
  const observations = new Map<string, FakeObservation>();
  const sends: { id: string; message: string }[] = [];
  const client = {
    agents: {
      observe: (_name: string, id: string) => {
        const o = new FakeObservation();
        observations.set(id, o);
        return o;
      },
      send: async (_name: string, id: string, opts: { message: string }) => { sends.push({ id, message: opts.message }); },
    },
  };
  return { client: client as never, observations, sends };
}

// Minimal materialized conversation.
const userMsg = (text: string, submissionId?: string) => ({ id: `u-${text}-${submissionId ?? 'x'}`, role: 'user', submissionId, parts: [{ type: 'text', text, state: 'done' }] });
const asstMsg = (text: string, submissionId?: string) => ({ id: `a-${text}`, role: 'assistant', submissionId, parts: [{ type: 'text', text, state: 'done' }] });
const conv = (messages: unknown[], settlements: { submissionId: string; outcome: string }[] = []) => ({ conversationId: 'c', messages, settlements });

let ctx: ReturnType<typeof makeClient>;
let store: ConversationsStore;
beforeEach(() => { ctx = makeClient(); store = new ConversationsStore(ctx.client, 'assistant'); });
afterEach(() => vi.useRealTimers());

describe('ConversationsStore', () => {
  it('opens an observation for the active conversation', () => {
    store.setActive('A');
    expect(ctx.observations.has('A')).toBe(true);
    expect(ctx.observations.get('A')!.closed).toBe(false);
  });

  it('derives historyReady from phase and isRunning from unsettled submissions', () => {
    store.setActive('A');
    const obs = ctx.observations.get('A')!;
    expect(store.getView('A').historyReady).toBe(false); // phase 'loading'

    obs.set({ phase: 'live', conversation: conv([userMsg('hi', 's1'), asstMsg('...', 's1')]) });
    let v = store.getView('A');
    expect(v.historyReady).toBe(true);
    expect(v.isRunning).toBe(true);           // s1 not settled
    expect(v.messages.length).toBeGreaterThan(0);

    obs.set({ conversation: conv([userMsg('hi', 's1'), asstMsg('done', 's1')], [{ submissionId: 's1', outcome: 'completed' }]) });
    expect(store.getView('A').isRunning).toBe(false); // s1 settled
  });

  it('shows an optimistic echo on send, then clears it when the durable copy arrives', async () => {
    store.setActive('A');
    const obs = ctx.observations.get('A')!;
    obs.set({ phase: 'live', conversation: conv([]) });

    await store.send('A', 'hello');
    expect(ctx.sends).toEqual([{ id: 'A', message: 'hello' }]);
    let v = store.getView('A');
    expect(v.isRunning).toBe(true);                              // optimistic → running
    expect(v.messages.some((m) => m.parts.some((p) => 'text' in p && p.text === 'hello'))).toBe(true);

    // Durable copy arrives (with a submissionId): overlay clears, no duplicate.
    obs.set({ conversation: conv([userMsg('hello', 's1')]) });
    v = store.getView('A');
    const helloCount = v.messages.filter((m) => m.parts.some((p) => 'text' in p && p.text === 'hello')).length;
    expect(helloCount).toBe(1);
  });

  it('releases an idle, non-active conversation after the grace period but keeps a running one', () => {
    vi.useFakeTimers();
    store.setActive('A');
    store.setActive('B'); // B active, A idle → A scheduled to close
    const a = ctx.observations.get('A')!;
    const b = ctx.observations.get('B')!;

    vi.advanceTimersByTime(3000);
    expect(a.closed).toBe(true);   // idle, non-active → released
    expect(b.closed).toBe(false);  // active → kept

    // A running B stays open even when it stops being active.
    b.set({ phase: 'live', conversation: conv([userMsg('q', 's9'), asstMsg('', 's9')]) });
    store.setActive('A');          // re-opens A; B now not active but running
    vi.advanceTimersByTime(3000);
    expect(ctx.observations.get('B')!.closed).toBe(false); // running → kept

    // When B settles and remains non-active, it's released.
    ctx.observations.get('B')!.set({ conversation: conv([userMsg('q', 's9'), asstMsg('a', 's9')], [{ submissionId: 's9', outcome: 'completed' }]) });
    vi.advanceTimersByTime(3000);
    expect(ctx.observations.get('B')!.closed).toBe(true);
  });

  it('notifies subscribers and reports running ids', () => {
    const fn = vi.fn();
    store.subscribe(fn);
    store.setActive('A');
    expect(fn).toHaveBeenCalled();
    ctx.observations.get('A')!.set({ phase: 'live', conversation: conv([userMsg('x', 's1'), asstMsg('', 's1')]) });
    expect(store.runningIds().has('A')).toBe(true);
  });
});
