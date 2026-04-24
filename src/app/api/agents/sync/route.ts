import { NextResponse } from 'next/server';
import { loadAgents } from '@/lib/agents';
import { isGitBacked, pull } from '@/lib/gitRepo';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ gitBacked: isGitBacked() });
}

export async function POST() {
  if (!isGitBacked()) {
    return NextResponse.json(
      { error: 'Git-backed persistence is not configured (set GESA_AGENTS_REPO_URL).' },
      { status: 400 }
    );
  }

  try {
    await pull();
    const agents = await loadAgents();
    return NextResponse.json({ ok: true, agents });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
