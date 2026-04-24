'use client';

import { useEffect, useState } from 'react';
import { AgentConfig, ModelProvider } from '@/types';

const COLORS = ['purple', 'blue', 'green', 'orange', 'red', 'pink', 'teal', 'yellow'] as const;
const MODELS: ModelProvider[] = ['claude', 'mistral'];

const DOT_COLOR: Record<string, string> = {
  purple: 'bg-purple-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
  yellow: 'bg-yellow-500',
};

export type EditorMode =
  | { kind: 'create' }
  | { kind: 'clone'; source: AgentConfig }
  | { kind: 'edit'; source: AgentConfig };

interface Props {
  mode: EditorMode;
  onClose: () => void;
  onSaved: (agent: AgentConfig) => void;
}

export default function AgentEditor({ mode, onClose, onSaved }: Props) {
  const initial = mode.kind === 'create' ? null : mode.source;

  const [name, setName] = useState(() => {
    if (mode.kind === 'clone') return `${mode.source.name} (copy)`;
    return initial?.name ?? '';
  });
  const [model, setModel] = useState<ModelProvider>(initial?.model ?? 'claude');
  const [modelVersion, setModelVersion] = useState(initial?.modelVersion ?? '');
  const [color, setColor] = useState<string>(initial?.color ?? 'blue');
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        model,
        modelVersion: modelVersion.trim() || undefined,
        color,
        systemPrompt: systemPrompt.trim(),
        ...(mode.kind === 'clone' ? { cloneFrom: mode.source.id } : {}),
      };

      const url = mode.kind === 'edit' ? `/api/agents/${mode.source.id}` : '/api/agents';
      const method = mode.kind === 'edit' ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');

      onSaved(data as AgentConfig);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode.kind === 'create'
      ? 'New agent'
      : mode.kind === 'clone'
      ? `Clone ${mode.source.name}`
      : `Edit ${mode.source.name}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="agent-name">
              Name
            </label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. The Economist"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="agent-model">
                Model provider
              </label>
              <select
                id="agent-model"
                value={model}
                onChange={e => setModel(e.target.value as ModelProvider)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {MODELS.map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="agent-model-version">
                Model version (optional)
              </label>
              <input
                id="agent-model-version"
                type="text"
                value={modelVersion}
                onChange={e => setModelVersion(e.target.value)}
                placeholder={model === 'claude' ? 'claude-opus-4-7' : 'mistral-large-latest'}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full ${DOT_COLOR[c]} transition-all ${
                    color === c ? 'ring-2 ring-offset-2 ring-gray-800' : 'opacity-70 hover:opacity-100'
                  }`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="agent-prompt">
              System prompt
            </label>
            <textarea
              id="agent-prompt"
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={8}
              placeholder="Describe the persona, tone, and behavior for this agent…"
              className="w-full border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim() || !systemPrompt.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : mode.kind === 'edit' ? 'Save changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
