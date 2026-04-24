import { NextRequest, NextResponse } from 'next/server';
import { cloneAgent, createAgent, loadAgents } from '@/lib/agents';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(loadAgents());
  } catch {
    return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body?.cloneFrom && typeof body.cloneFrom === 'string') {
      const agent = cloneAgent(body.cloneFrom, {
        name: body.name,
        model: body.model,
        modelVersion: body.modelVersion,
        color: body.color,
        systemPrompt: body.systemPrompt,
      });
      return NextResponse.json(agent, { status: 201 });
    }

    const agent = createAgent({
      name: body.name,
      model: body.model,
      modelVersion: body.modelVersion,
      color: body.color,
      systemPrompt: body.systemPrompt,
    });
    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create agent';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
