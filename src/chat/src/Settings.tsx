import { ArrowLeft } from '@phosphor-icons/react';
import { Button, LayerCard, Loader, Select } from '@cloudflare/kumo';
import type { ModelOption, UserProfile } from './App.tsx';

interface SettingsProps {
  profile: UserProfile | null;
  models: ModelOption[];
  modelsLoading: boolean;
  modelKey: string;
  onModelChange: (key: string) => void;
  onBack: () => void;
}

export function Settings({ profile, models, modelsLoading, modelKey, onModelChange, onBack }: SettingsProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="chat-topbar">
        <Button variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-1.5">
          <ArrowLeft size={14} />
          Back
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

          <div className="flex flex-col gap-4">
            <LayerCard className="px-5 py-4">
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
                  <Button variant="destructive" size="sm" onClick={() => {}}>Sign out</Button>
                </div>
              ) : (
                <p className="text-sm text-kumo-subtle">Not signed in</p>
              )}
            </LayerCard>

            <LayerCard className="px-5 py-4">
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
            </LayerCard>
          </div>
        </div>
      </div>
    </div>
  );
}
