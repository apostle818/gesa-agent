import { AgentConfig } from '@/types';

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

const MODEL_BADGE: Record<string, string> = {
  claude: 'bg-amber-100 text-amber-700',
  mistral: 'bg-sky-100 text-sky-700',
};

interface Props {
  agents: AgentConfig[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export default function AgentPanel({ agents, selectedIds, onToggle }: Props) {
  return (
    <div className="w-64 border-r bg-gray-50 flex flex-col shrink-0">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-gray-900">Agents</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Select agents — order = turn order
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {agents.map(agent => {
          const pos = selectedIds.indexOf(agent.id);
          const selected = pos !== -1;
          return (
            <button
              key={agent.id}
              onClick={() => onToggle(agent.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selected
                  ? 'border-blue-400 bg-blue-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT_COLOR[agent.color] ?? 'bg-gray-400'}`}
                />
                <span className="font-medium text-sm text-gray-900 truncate flex-1">
                  {agent.name}
                </span>
                {selected && (
                  <span className="text-xs text-blue-600 font-bold shrink-0">
                    #{pos + 1}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 mt-1.5 ml-[18px]">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${MODEL_BADGE[agent.model] ?? ''}`}>
                  {agent.model}
                </span>
                <span className="text-xs text-gray-400 truncate">{agent.modelVersion}</span>
              </div>
            </button>
          );
        })}

        {agents.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">
            No agents found. Add <code className="bg-gray-100 px-1 rounded">.md</code> files
            to the <code className="bg-gray-100 px-1 rounded">agents/</code> directory.
          </p>
        )}
      </div>

      <div className="p-3 border-t">
        <p className="text-xs text-gray-400 leading-relaxed">
          Edit or add personas in{' '}
          <code className="bg-gray-100 px-1 rounded">agents/*.md</code>
        </p>
      </div>
    </div>
  );
}
