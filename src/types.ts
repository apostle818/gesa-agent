export type ModelProvider = 'claude' | 'mistral';

export interface AgentConfig {
  id: string;
  name: string;
  model: ModelProvider;
  modelVersion: string;
  systemPrompt: string;
  color: string;
}

export interface ConversationMessage {
  id: string;
  agentId: string;
  agentName: string;
  model: ModelProvider | 'user';
  content: string;
  timestamp: string;
}
