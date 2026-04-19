import Anthropic from '@anthropic-ai/sdk';
import { AgentConfig, ConversationMessage } from '@/types';

const anthropic = new Anthropic();

type LLMMessage = { role: 'user' | 'assistant'; content: string };

function formatHistory(history: ConversationMessage[], agentId: string): LLMMessage[] {
  const result: LLMMessage[] = [];

  for (const msg of history) {
    let role: 'user' | 'assistant';
    let content: string;

    if (msg.agentId === agentId) {
      role = 'assistant';
      content = msg.content;
    } else if (msg.agentId === 'user') {
      role = 'user';
      content = msg.content;
    } else {
      role = 'user';
      content = `[${msg.agentName}]: ${msg.content}`;
    }

    const last = result[result.length - 1];
    if (last && last.role === role) {
      last.content += '\n\n' + content;
    } else {
      result.push({ role, content });
    }
  }

  if (result.length === 0) {
    result.push({ role: 'user', content: 'Introduce yourself briefly and begin the conversation.' });
  } else if (result[0].role === 'assistant') {
    result.unshift({ role: 'user', content: 'Begin the conversation.' });
  }

  return result;
}

export async function* streamClaude(
  agent: AgentConfig,
  history: ConversationMessage[]
): AsyncGenerator<string> {
  const messages = formatHistory(history, agent.id);

  const stream = anthropic.messages.stream({
    model: agent.modelVersion,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: agent.systemPrompt,
        // Cache the system prompt — same agent speaks multiple times per conversation
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }
}

export async function* streamMistral(
  agent: AgentConfig,
  history: ConversationMessage[]
): AsyncGenerator<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY is not set');

  const messages = formatHistory(history, agent.id);

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: agent.modelVersion,
      messages: [{ role: 'system', content: agent.systemPrompt }, ...messages],
      stream: true,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    throw new Error(`Mistral API error ${response.status}: ${await response.text()}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }
}
