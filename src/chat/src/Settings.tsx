import { ArrowLeft, Briefcase, CheckCircle, Headset, type Icon } from '@phosphor-icons/react';
import { Button, Loader, Select, Switch } from '@cloudflare/kumo';
import { useCallback, useEffect, useState } from 'react';
import type { ModelOption, UserProfile } from './App.tsx';
import type { Theme } from './theme.ts';
import { connectZohoScopes } from './connectionRequired.ts';

interface SettingsProps {
  profile: UserProfile | null;
  models: ModelOption[];
  modelsLoading: boolean;
  modelKey: string;
  onModelChange: (key: string) => void;
  theme: Theme;
  onToggleTheme: () => void;
  autoMode: boolean;
  onAutoModeChange: (enabled: boolean) => void;
  onSignOut: () => void;
  onBack: () => void;
}

/** A Zoho product's connection status, as reported by `GET /api/auth/connections`. */
interface Connection {
  key: string;
  label: string;
  description: string;
  scopes: string[];
  connected: boolean;
}

const PRODUCT_ICONS: Record<string, Icon> = { crm: Briefcase, desk: Headset };

/**
 * Sends the user to the Zoho consent screen requesting a product's full scope
 * bundle, unioned server-side with whatever scopes they already hold. Zoho
 * redirects back to `/?view=settings` on success, landing back on this page.
 * @param scopes - The OAuth scopes to request for the product being connected.
 */
function connectProduct(scopes: string[]) {
  connectZohoScopes(scopes, '/?view=settings');
}

/**
 * Renders the settings panel showing the signed-in account and the default model picker.
 * @param profile - The signed-in user's profile, or `null` if not signed in (shows a "Not signed in" message).
 * @param models - The list of selectable model options shown in the default model dropdown.
 * @param modelsLoading - When `true`, shows a loading spinner in place of the model selector.
 * @param modelKey - The key of the currently selected default model.
 * @param onModelChange - Called with the new model key when the user picks a different default model.
 * @param theme - The current color theme, reflected by the Appearance section's dark-mode switch.
 * @param onToggleTheme - Called when the dark-mode switch is toggled.
 * @param autoMode - Whether "Auto mode" (HITL confirmation bypass) is currently enabled.
 * @param onAutoModeChange - Called with the new state when the Auto mode switch is toggled.
 * @param onSignOut - Called when the user clicks "Sign out".
 * @param onBack - Called when the user clicks the "Back" button to leave the settings panel.
 * @returns The rendered settings panel.
 */
export function Settings({ profile, models, modelsLoading, modelKey, onModelChange, theme, onToggleTheme, autoMode, onAutoModeChange, onSignOut, onBack }: SettingsProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  // The product key with an in-flight disconnect request, so only its button spins.
  const [disconnectingKey, setDisconnectingKey] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setConnectionsLoading(true);
    try {
      const res = await fetch('/api/auth/connections', { credentials: 'include' });
      const data = await res.json() as { connections: Connection[] };
      setConnections(data.connections ?? []);
    } catch { /* ignore */ } finally { setConnectionsLoading(false); }
  }, []);

  useEffect(() => { void loadConnections(); }, [loadConnections]);

  /**
   * Drops a product's granted scopes from the user's stored token, then reloads
   * the connection list so its row flips back to "Connect".
   * @param key - The product key to disconnect (matches `Connection.key`).
   */
  const disconnectProduct = useCallback(async (key: string) => {
    setDisconnectingKey(key);
    try {
      await fetch(`/api/auth/connections/${key}/disconnect`, { method: 'POST', credentials: 'include' });
      await loadConnections();
    } finally { setDisconnectingKey(null); }
  }, [loadConnections]);

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="chat-topbar">
        <Button variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-1.5">
          <ArrowLeft size={14} />
          Back
        </Button>
      </div>

      <div className="settings-scroll flex-1 overflow-y-auto px-8 py-8">
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

          <div className="settings-panel">
            <section className="settings-section">
              <h2 className="text-xs font-semibold tracking-widest uppercase text-kumo-subtle mb-3">Account</h2>
              {profile ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0" style={{ background: 'var(--accent)' }}>
                      {[profile.firstName[0], profile.lastName[0]].filter(Boolean).join('').toUpperCase() || profile.displayName[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-kumo-default">{profile.displayName}</p>
                      <p className="text-xs text-kumo-subtle">{profile.email}</p>
                    </div>
                  </div>
                  <Button variant="destructive" size="sm" onClick={onSignOut}>Sign out</Button>
                </div>
              ) : (
                <p className="text-sm text-kumo-subtle">Not signed in</p>
              )}
            </section>

            <div className="settings-sep" />

            <section className="settings-section">
              <h2 className="text-xs font-semibold tracking-widest uppercase text-kumo-subtle mb-3">Appearance</h2>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-kumo-default">Dark mode</p>
                  <p className="text-xs text-kumo-subtle mt-0.5">Switch between light and dark interface themes.</p>
                </div>
                <Switch checked={theme === 'dark'} onCheckedChange={onToggleTheme} aria-label="Dark mode" />
              </div>
            </section>

            <div className="settings-sep" />

            <section className="settings-section">
              <h2 className="text-xs font-semibold tracking-widest uppercase text-kumo-subtle mb-3">Automation</h2>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-kumo-default">Auto mode</p>
                  <p className="text-xs text-kumo-subtle mt-0.5">
                    Skip confirmation prompts — the assistant creates, updates, or deletes records
                    automatically instead of asking first.
                  </p>
                </div>
                <Switch checked={autoMode} onCheckedChange={onAutoModeChange} aria-label="Auto mode" />
              </div>
            </section>

            <div className="settings-sep" />

            <section className="settings-section">
              <h2 className="text-xs font-semibold tracking-widest uppercase text-kumo-subtle mb-3">Connections</h2>
              <p className="text-xs text-kumo-subtle mb-3">
                Connect each Zoho product the assistant should be able to use. Connecting grants that product's full set of scopes in one step.
              </p>
              {connectionsLoading ? (
                <Loader size="sm" />
              ) : (
                <div className="flex flex-col gap-2">
                  {connections.map((c) => {
                    const ProductIcon = PRODUCT_ICONS[c.key] ?? Briefcase;
                    return (
                      <div
                        key={c.key}
                        className="settings-connection-row flex items-center justify-between gap-4 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: c.connected ? 'var(--ok)' : 'var(--glass)', color: c.connected ? '#fff' : 'var(--txt2)' }}
                          >
                            <ProductIcon size={18} weight={c.connected ? 'fill' : 'regular'} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-kumo-default">{c.label}</p>
                              {c.connected && (
                                <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--ok)' }}>
                                  <CheckCircle size={13} weight="fill" /> Connected
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-kumo-subtle mt-0.5">{c.description}</p>
                          </div>
                        </div>
                        <Button
                          variant={c.connected ? 'secondary-destructive' : 'primary'}
                          size="sm"
                          className="shrink-0"
                          loading={disconnectingKey === c.key}
                          onClick={() => (c.connected ? disconnectProduct(c.key) : connectProduct(c.scopes))}
                        >
                          {c.connected ? 'Disconnect' : 'Connect'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="settings-sep" />

            <section className="settings-section">
              <h2 className="text-xs font-semibold tracking-widest uppercase text-kumo-subtle mb-3">Model</h2>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-kumo-default">Default model</p>
                  <p className="text-xs text-kumo-subtle mt-0.5">Used for new conversations. Existing threads keep the model they started on.</p>
                </div>
                {modelsLoading ? (
                  <Loader size="sm" />
                ) : (
                  <Select
                    size="sm"
                    aria-label="Default model"
                    value={modelKey}
                    onValueChange={(v) => onModelChange(v as string)}
                    renderValue={(v) => models.find((m) => m.key === v)?.label ?? String(v)}
                    className="shrink-0"
                  >
                    {models.map((m) => (
                      <Select.Option key={m.key} value={m.key}>{m.label}</Select.Option>
                    ))}
                  </Select>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
