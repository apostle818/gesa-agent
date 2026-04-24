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
  onCreate: () => void;
  onClone: (agent: AgentConfig) => void;
  onEdit: (agent: AgentConfig) => void;
  onDelete: (agent: AgentConfig) => void;
}

export default function AgentPanel({
  agents,
  selectedIds,
  onToggle,
  onCreate,
  onClone,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div className="w-64 border-r bg-gray-50 flex flex-col shrink-0">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Agents</h2>
          <button
            onClick={onCreate}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            + New
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Select agents — order = turn order
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {agents.map(agent => {
          const pos = selectedIds.indexOf(agent.id);
          const selected = pos !== -1;
          return (
            <div
              key={agent.id}
              className={`group relative w-full text-left p-3 rounded-lg border transition-all ${
                selected
                  ? 'border-blue-400 bg-blue-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <button
                onClick={() => onToggle(agent.id)}
                className="w-full text-left"
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

              <div className="mt-2 ml-[18px] flex items-center gap-3 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(agent)}
                  className="text-gray-500 hover:text-blue-600"
                  aria-label={`Edit ${agent.name}`}
                >
                  Edit
                </button>
                <button
                  onClick={() => onClone(agent)}
                  className="text-gray-500 hover:text-blue-600"
                  aria-label={`Clone ${agent.name}`}
                >
                  Clone
                </button>
                <button
                  onClick={() => onDelete(agent)}
                  className="text-gray-500 hover:text-red-600"
                  aria-label={`Delete ${agent.name}`}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        {agents.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">
            No agents yet. Click <strong className="text-gray-600">+ New</strong> to create one.
          </p>
        )}
      </div>

      <div className="p-3 border-t">
        <p className="text-xs text-gray-400 leading-relaxed">
          Agents are stored as <code className="bg-gray-100 px-1 rounded">.md</code> files in{' '}
          <code className="bg-gray-100 px-1 rounded">agents/</code>.
        </p>
      </div>
    </div>
  );
}
