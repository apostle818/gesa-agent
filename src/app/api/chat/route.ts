import { NextRequest } from 'next/server';
import { loadAgent } from '@/lib/agents';
import { streamClaude, streamMistral } from '@/lib/llm';
import { ConversationMessage } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { agentId, history }: { agentId: string; history: ConversationMessage[] } =
    await request.json();

  const agent = loadAgent(agentId);
  if (!agent) return new Response('Agent not found', { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = agent.model === 'claude'
          ? streamClaude(agent, history)
          : streamMistral(agent, history);

        for await (const chunk of gen) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
