import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { AgentConfig, ModelProvider } from '@/types';

const AGENTS_DIR = path.join(process.cwd(), 'agents');

const DEFAULT_COLORS = ['purple', 'blue', 'green', 'orange', 'red', 'pink', 'teal'];
const DEFAULT_MODEL_VERSION: Record<ModelProvider, string> = {
  claude: process.env.CLAUDE_MODEL || 'claude-opus-4-7',
  mistral: process.env.MISTRAL_MODEL || 'mistral-large-latest',
};

export function loadAgents(): AgentConfig[] {
  if (!fs.existsSync(AGENTS_DIR)) return [];

  return fs
    .readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map((file, i) => {
      const raw = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf-8');
      const { data, content } = matter(raw);
      const model: ModelProvider = data.model === 'mistral' ? 'mistral' : 'claude';
      return {
        id: file.replace(/\.md$/, ''),
        name: data.name || file.replace(/\.md$/, ''),
        model,
        modelVersion: data.modelVersion || DEFAULT_MODEL_VERSION[model],
        systemPrompt: content.trim(),
        color: data.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      };
    });
}

export function loadAgent(id: string): AgentConfig | undefined {
  return loadAgents().find(a => a.id === id);
}
