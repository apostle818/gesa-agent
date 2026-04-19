import { NextResponse } from 'next/server';
import { loadAgents } from '@/lib/agents';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(loadAgents());
  } catch {
    return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 });
  }
}
