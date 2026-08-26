import { ArrowLeft, Lightning, Tag, Wrench } from '@phosphor-icons/react';
import { Button, LayerCard } from '@cloudflare/kumo';
import { useEffect, useState } from 'react';

interface Skill {
  name: string;
  description: string;
  allowedTools: string[];
  compatibility: string;
}

interface SkillsProps {
  onBack: () => void;
}

/**
 * Displays the list of reusable skills discovered under `.claude/skills/`,
 * fetched from `/api/skills`, including each skill's description, allowed
 * tools, and compatibility tag.
 * @param onBack - Called when the "Back" button is clicked.
 * @returns The skills page, showing a loading state, an empty state, or the list of skill cards.
 */
export function Skills({ onBack }: SkillsProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/skills')
      .then(r => r.json() as Promise<Skill[]>)
      .then(setSkills)
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
          <h1 className="text-lg font-semibold text-kumo-default mb-1">Skills</h1>
          <p className="text-sm text-kumo-subtle mb-6">Reusable instruction sets available to agents in this workspace.</p>

          {loading ? (
            <p className="text-sm text-kumo-subtle">Loading…</p>
          ) : skills.length === 0 ? (
            <p className="text-sm text-kumo-subtle">No skills found in <code className="text-xs">.claude/skills/</code>.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {skills.map(skill => (
                <LayerCard key={skill.name} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-md bg-kumo-elevated border border-kumo-line flex items-center justify-center shrink-0 mt-0.5">
                      <Lightning size={13} className="text-kumo-subtle" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-kumo-default mb-0.5">{skill.name}</p>
                      <p className="text-xs text-kumo-subtle leading-relaxed mb-2">{skill.description}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {skill.allowedTools.map(tool => (
                          <span key={tool} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-kumo-inactive bg-kumo-elevated border border-kumo-line">
                            <Wrench size={9} />
                            {tool}
                          </span>
                        ))}
                        {skill.compatibility && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-kumo-inactive bg-kumo-elevated border border-kumo-line">
                            <Tag size={9} />
                            {skill.compatibility}
                          </span>
                        )}
                      </div>
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
