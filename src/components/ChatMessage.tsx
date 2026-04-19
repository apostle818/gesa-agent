import { ConversationMessage } from '@/types';

const AVATAR_BG: Record<string, string> = {
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
  claude: 'bg-amber-100 text-amber-800',
  mistral: 'bg-sky-100 text-sky-800',
};

interface Props {
  message: ConversationMessage;
  color: string;
}

export default function ChatMessage({ message, color }: Props) {
  const isUser = message.agentId === 'user';
  const avatarBg = isUser ? 'bg-gray-400' : (AVATAR_BG[color] ?? 'bg-gray-500');
  const initials = message.agentName
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? 'opacity-80' : ''}`}>
      <div
        className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarBg}`}
      >
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm text-gray-900">{message.agentName}</span>
          {!isUser && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODEL_BADGE[message.model] ?? ''}`}>
              {message.model}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {message.content || (
            <span className="text-gray-300 animate-pulse">▋</span>
          )}
        </div>
      </div>
    </div>
  );
}
