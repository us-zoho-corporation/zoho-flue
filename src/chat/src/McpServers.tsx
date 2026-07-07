import { ArrowLeft, CheckCircle, PencilSimple, Plugs, Plus, Trash, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@cloudflare/kumo';
import { useCallback, useEffect, useState } from 'react';

interface McpServerView {
  id: string;
  name: string;
  url: string;
  transport: 'http' | 'sse';
  enabled: boolean;
  hasAuth: boolean;
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

type TestState = { status: 'idle' | 'testing' | 'ok' | 'error'; tools?: number; error?: string };
type FormState = { id?: string; name: string; url: string; transport: 'http' | 'sse'; authToken: string; enabled: boolean };
const EMPTY_FORM: FormState = { name: '', url: '', transport: 'http', authToken: '', enabled: true };

interface McpServersProps {
  onBack: () => void;
  onSignIn: () => void;
}

export function McpServers({ onBack, onSignIn }: McpServersProps) {
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState('');
  const [formTest, setFormTest] = useState<TestState>({ status: 'idle' });
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mcp-servers', { credentials: 'include' });
      if (res.status === 401) { setNeedsAuth(true); return; }
      setNeedsAuth(false);
      const data = await res.json() as { servers: McpServerView[] };
      setServers(data.servers ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (!form) return;
    setFormError('');
    const body: Record<string, unknown> = { name: form.name, url: form.url, transport: form.transport, enabled: form.enabled };
    // Only send a token when the user typed one (blank = keep existing on edit).
    if (form.authToken) body.authToken = form.authToken;
    const res = await fetch(form.id ? `/api/mcp-servers/${form.id}` : '/api/mcp-servers', {
      method: form.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      setFormError(err.error ?? 'Could not save the server.');
      return;
    }
    setForm(null);
    setFormTest({ status: 'idle' });
    await load();
  }, [form, load]);

  const remove = useCallback(async (id: string) => {
    await fetch(`/api/mcp-servers/${id}`, { method: 'DELETE', credentials: 'include' });
    setConfirmDelete(null);
    await load();
  }, [load]);

  const toggle = useCallback(async (s: McpServerView) => {
    await fetch(`/api/mcp-servers/${s.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    await load();
  }, [load]);

  const test = useCallback(async (id: string) => {
    setTests((t) => ({ ...t, [id]: { status: 'testing' } }));
    try {
      const res = await fetch(`/api/mcp-servers/${id}/test`, { method: 'POST', credentials: 'include' });
      const data = await res.json() as { ok: boolean; tools?: unknown[]; error?: string };
      setTests((t) => ({ ...t, [id]: data.ok ? { status: 'ok', tools: data.tools?.length ?? 0 } : { status: 'error', error: data.error } }));
    } catch { setTests((t) => ({ ...t, [id]: { status: 'error', error: 'Request failed' } })); }
  }, []);

  const testForm = useCallback(async () => {
    if (!form) return;
    setFormTest({ status: 'testing' });
    try {
      const res = await fetch('/api/mcp-servers/test', {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ url: form.url, transport: form.transport, authToken: form.authToken || undefined }),
      });
      const data = await res.json() as { ok: boolean; tools?: unknown[]; error?: string };
      setFormTest(data.ok ? { status: 'ok', tools: data.tools?.length ?? 0 } : { status: 'error', error: data.error });
    } catch { setFormTest({ status: 'error', error: 'Request failed' }); }
  }, [form]);

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="chat-topbar">
        <Button variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-1.5">
          <ArrowLeft size={14} /> Back
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div className="mcp-head">
            <div>
              <h1 style={{ font: '600 20px var(--font-sans)', color: 'var(--txt1)', margin: 0 }}>MCP servers</h1>
              <p style={{ font: '400 13px/1.5 var(--font-sans)', color: 'var(--txt2)', margin: '4px 0 0' }}>Connect external Model Context Protocol servers to this workspace.</p>
            </div>
            {!needsAuth && (
              <button className="sb-newchat" style={{ width: 'auto' }} onClick={() => { setForm({ ...EMPTY_FORM }); setFormError(''); setFormTest({ status: 'idle' }); }}>
                <Plus size={16} weight="bold" /> Add server
              </button>
            )}
          </div>

          {needsAuth ? (
            <div className="mcp-card" style={{ textAlign: 'center', padding: '28px 16px' }}>
              <Plugs size={26} style={{ color: 'var(--accent-fg)' }} />
              <p style={{ font: '500 14px var(--font-sans)', color: 'var(--txt1)', margin: '10px 0 4px' }}>Sign in to manage MCP servers</p>
              <p style={{ font: '400 13px var(--font-sans)', color: 'var(--txt3)', margin: '0 0 14px' }}>Your connections are private to your account.</p>
              <button className="composer-signin-btn" onClick={onSignIn}>Sign in with Zoho</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              {form && (
                <McpForm
                  form={form} setForm={setForm} onSave={save} onCancel={() => { setForm(null); setFormTest({ status: 'idle' }); }}
                  onTest={testForm} test={formTest} error={formError}
                />
              )}

              {loading ? (
                <p style={{ font: '400 13px var(--font-sans)', color: 'var(--txt3)' }}>Loading…</p>
              ) : servers.length === 0 && !form ? (
                <div className="mcp-card" style={{ textAlign: 'center', padding: '28px 16px' }}>
                  <p style={{ font: '400 13.5px var(--font-sans)', color: 'var(--txt3)', margin: 0 }}>No MCP servers connected yet.</p>
                </div>
              ) : (
                servers.map((s) => {
                  const t = tests[s.id] ?? { status: 'idle' as const };
                  return (
                    <div key={s.id} className="mcp-card mcp-row">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ font: '600 14px var(--font-sans)', color: 'var(--txt1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                          {s.builtin && <span className="mcp-badge">Built-in</span>}
                          <span className="mcp-badge">{s.transport === 'sse' ? 'SSE' : 'HTTP'}</span>
                          {s.hasAuth && <span className="mcp-badge">auth</span>}
                        </div>
                        <div style={{ font: '400 12px var(--font-sans)', color: 'var(--txt3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{s.url}</div>
                        {t.status === 'ok' && <div className="mcp-test-ok"><CheckCircle size={12} weight="fill" /> {t.tools} tool{t.tools === 1 ? '' : 's'}</div>}
                        {t.status === 'error' && <div className="mcp-test-err"><WarningCircle size={12} weight="fill" /> {t.error}</div>}
                      </div>
                      {s.builtin ? (
                        <span style={{ font: '500 12px var(--font-sans)', color: 'var(--txt3)', flexShrink: 0 }}>Read-only</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <button className="icon-btn" style={{ width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 600 }} onClick={() => test(s.id)} disabled={t.status === 'testing'}>
                            {t.status === 'testing' ? 'Testing…' : 'Test'}
                          </button>
                          <button className="mcp-toggle" data-on={s.enabled} onClick={() => toggle(s)} title={s.enabled ? 'Enabled' : 'Disabled'} aria-label="Toggle enabled"><span /></button>
                          <button className="icon-btn" onClick={() => { setForm({ id: s.id, name: s.name, url: s.url, transport: s.transport, authToken: '', enabled: s.enabled }); setFormError(''); setFormTest({ status: 'idle' }); }} title="Edit" aria-label="Edit"><PencilSimple size={15} /></button>
                          {confirmDelete === s.id ? (
                            <>
                              <button className="icon-btn" style={{ width: 'auto', padding: '0 8px', color: 'var(--danger)', fontSize: 12, fontWeight: 600 }} onClick={() => remove(s.id)}>Delete</button>
                              <button className="icon-btn" style={{ width: 'auto', padding: '0 8px', fontSize: 12 }} onClick={() => setConfirmDelete(null)}>Cancel</button>
                            </>
                          ) : (
                            <button className="icon-btn mcp-del" onClick={() => setConfirmDelete(s.id)} title="Delete" aria-label="Delete"><Trash size={15} /></button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function McpForm({ form, setForm, onSave, onCancel, onTest, test, error }: {
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  onTest: () => void;
  test: TestState;
  error: string;
}) {
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  return (
    <div className="mcp-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ font: '600 14px var(--font-sans)', color: 'var(--txt1)' }}>{form.id ? 'Edit server' : 'Add MCP server'}</div>
      <label className="mcp-field"><span>Name</span><input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="My MCP server" /></label>
      <label className="mcp-field"><span>Server URL</span><input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://example.com/mcp" /></label>
      <div style={{ display: 'flex', gap: 12 }}>
        <label className="mcp-field" style={{ flex: 1 }}><span>Transport</span>
          <select value={form.transport} onChange={(e) => set({ transport: e.target.value as 'http' | 'sse' })}>
            <option value="http">Streamable HTTP</option>
            <option value="sse">SSE</option>
          </select>
        </label>
        <label className="mcp-field" style={{ flex: 1 }}><span>Auth token {form.id && <em style={{ color: 'var(--txt3)', fontStyle: 'normal' }}>(blank = keep)</em>}</span>
          <input type="password" value={form.authToken} onChange={(e) => set({ authToken: e.target.value })} placeholder="Bearer token (optional)" />
        </label>
      </div>
      <p className="mcp-hint">
        {form.transport === 'sse'
          ? 'SSE — the older transport (an event stream plus a POST-back channel). Choose this only if your server doesn’t support Streamable HTTP.'
          : 'Streamable HTTP — the current MCP transport (a single endpoint). Recommended for most servers.'}
      </p>
      {error && <div className="mcp-test-err"><WarningCircle size={12} weight="fill" /> {error}</div>}
      {test.status === 'ok' && <div className="mcp-test-ok"><CheckCircle size={12} weight="fill" /> Connected — {test.tools} tool{test.tools === 1 ? '' : 's'}</div>}
      {test.status === 'error' && <div className="mcp-test-err"><WarningCircle size={12} weight="fill" /> {test.error}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="composer-signin-btn" onClick={onSave} disabled={!form.name.trim() || !form.url.trim()}>{form.id ? 'Save' : 'Add server'}</button>
        <button className="icon-btn" style={{ width: 'auto', padding: '0 12px', fontSize: 13, fontWeight: 600 }} onClick={onTest} disabled={!form.url.trim() || test.status === 'testing'}>{test.status === 'testing' ? 'Testing…' : 'Test connection'}</button>
        <button className="icon-btn" style={{ width: 'auto', padding: '0 12px', fontSize: 13, marginLeft: 'auto' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
