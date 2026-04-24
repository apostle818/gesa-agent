import { NextRequest, NextResponse } from 'next/server';
import { deleteAgent, updateAgent } from '@/lib/agents';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const agent = await updateAgent(params.id, {
      name: body.name,
      model: body.model,
      modelVersion: body.modelVersion,
      color: body.color,
      systemPrompt: body.systemPrompt,
    });
    return NextResponse.json(agent);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update agent';
    const status = message === 'Agent not found' ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await deleteAgent(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete agent';
    const status = message === 'Agent not found' ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
