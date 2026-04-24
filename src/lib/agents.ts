import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { AgentConfig, ModelProvider } from '@/types';
import {
  AGENTS_DIR,
  commitAndPush,
  ensureRepo,
  isGitBacked,
  withLock,
} from '@/lib/gitRepo';

export const SUPPORTED_COLORS = [
  'purple', 'blue', 'green', 'orange', 'red', 'pink', 'teal', 'yellow',
] as const;
export const SUPPORTED_MODELS: ModelProvider[] = ['claude', 'mistral'];

const DEFAULT_MODEL_VERSION: Record<ModelProvider, string> = {
  claude: process.env.CLAUDE_MODEL || 'claude-opus-4-7',
  mistral: process.env.MISTRAL_MODEL || 'mistral-large-latest',
};

export function defaultModelVersion(model: ModelProvider): string {
  return DEFAULT_MODEL_VERSION[model];
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function agentPath(id: string): string {
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`Invalid agent id: ${id}`);
  }
  const resolved = path.resolve(AGENTS_DIR, `${id}.md`);
  if (path.dirname(resolved) !== path.resolve(AGENTS_DIR)) {
    throw new Error('Resolved agent path escapes agents directory');
  }
  return resolved;
}

function ensureAgentsDir(): void {
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
  }
}

function colorFromIndex(i: number): string {
  return SUPPORTED_COLORS[i % SUPPORTED_COLORS.length];
}

function readAgentsFromDisk(): AgentConfig[] {
  if (!fs.existsSync(AGENTS_DIR)) return [];

  return fs
    .readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
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
        color: data.color || colorFromIndex(i),
      };
    });
}

export async function loadAgents(): Promise<AgentConfig[]> {
  if (isGitBacked()) {
    try {
      await ensureRepo();
    } catch (err) {
      // Surface via console but still return whatever we have on disk so the
      // UI doesn't wedge on a network blip.
      console.error('[agents] ensureRepo failed:', err);
    }
  }
  return readAgentsFromDisk();
}

export async function loadAgent(id: string): Promise<AgentConfig | undefined> {
  return (await loadAgents()).find(a => a.id === id);
}

export interface AgentInput {
  name: string;
  model: ModelProvider;
  modelVersion?: string;
  color?: string;
  systemPrompt: string;
}

function validate(input: AgentInput): string | null {
  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    return 'name is required';
  }
  if (!SUPPORTED_MODELS.includes(input.model)) {
    return `model must be one of: ${SUPPORTED_MODELS.join(', ')}`;
  }
  if (!input.systemPrompt || typeof input.systemPrompt !== 'string' || !input.systemPrompt.trim()) {
    return 'systemPrompt is required';
  }
  if (input.color && !SUPPORTED_COLORS.includes(input.color as typeof SUPPORTED_COLORS[number])) {
    return `color must be one of: ${SUPPORTED_COLORS.join(', ')}`;
  }
  return null;
}

function uniqueId(base: string): string {
  const existing = new Set(
    fs.existsSync(AGENTS_DIR)
      ? fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
      : []
  );
  if (!existing.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error('Could not allocate unique agent id');
}

function writeAgentFile(id: string, input: AgentInput): AgentConfig {
  ensureAgentsDir();
  const frontmatter: Record<string, string> = {
    name: input.name.trim(),
    model: input.model,
  };
  if (input.modelVersion && input.modelVersion.trim()) {
    frontmatter.modelVersion = input.modelVersion.trim();
  }
  if (input.color) {
    frontmatter.color = input.color;
  }

  const fileBody = matter.stringify(`\n${input.systemPrompt.trim()}\n`, frontmatter);
  fs.writeFileSync(agentPath(id), fileBody, 'utf-8');

  return {
    id,
    name: frontmatter.name,
    model: input.model,
    modelVersion: frontmatter.modelVersion || DEFAULT_MODEL_VERSION[input.model],
    systemPrompt: input.systemPrompt.trim(),
    color: input.color || colorFromIndex(readAgentsFromDisk().findIndex(a => a.id === id)),
  };
}

async function persistChange(message: string, relPath: string): Promise<void> {
  if (!isGitBacked()) return;
  await commitAndPush({ message, paths: [relPath] });
}

export async function createAgent(input: AgentInput): Promise<AgentConfig> {
  const err = validate(input);
  if (err) throw new Error(err);

  const base = slugify(input.name);
  if (!base) throw new Error('name must contain alphanumeric characters');

  if (isGitBacked()) await ensureRepo();

  return withLock(async () => {
    const id = uniqueId(base);
    const agent = writeAgentFile(id, input);
    try {
      await persistChange(`gui: create ${id}`, `${id}.md`);
    } catch (e) {
      // commitAndPush already rolled the working tree back; drop any stray file.
      try { fs.unlinkSync(agentPath(id)); } catch { /* already gone */ }
      throw e;
    }
    return agent;
  });
}

export async function updateAgent(id: string, input: AgentInput): Promise<AgentConfig> {
  const err = validate(input);
  if (err) throw new Error(err);

  if (isGitBacked()) await ensureRepo();

  if (!fs.existsSync(agentPath(id))) {
    throw new Error('Agent not found');
  }

  return withLock(async () => {
    const agent = writeAgentFile(id, input);
    await persistChange(`gui: update ${id}`, `${id}.md`);
    return agent;
  });
}

export async function deleteAgent(id: string): Promise<void> {
  if (isGitBacked()) await ensureRepo();

  const p = agentPath(id);
  if (!fs.existsSync(p)) throw new Error('Agent not found');

  await withLock(async () => {
    fs.unlinkSync(p);
    await persistChange(`gui: delete ${id}`, `${id}.md`);
  });
}

export async function cloneAgent(
  sourceId: string,
  overrides?: Partial<AgentInput>
): Promise<AgentConfig> {
  const src = await loadAgent(sourceId);
  if (!src) throw new Error('Source agent not found');

  const name = overrides?.name?.trim() || `${src.name} (copy)`;
  return createAgent({
    name,
    model: overrides?.model ?? src.model,
    modelVersion: overrides?.modelVersion ?? src.modelVersion,
    color: overrides?.color ?? src.color,
    systemPrompt: overrides?.systemPrompt ?? src.systemPrompt,
  });
}
