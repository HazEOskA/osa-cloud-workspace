import { NextResponse } from 'next/server';
import { requireAdminIdentity } from '@/lib/admin-auth';
import { queryCloudAgent } from '@/lib/agent-client';
import type { AgentQueryRequest } from '@/lib/agent-contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireAdminIdentity(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as Partial<AgentQueryRequest>;
    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json({ error: 'Wymagane pole message.' }, { status: 400 });
    }

    const result = await queryCloudAgent({
      message: body.message,
      userId: body.userId ?? auth.email,
      sessionId: body.sessionId,
    });

    return NextResponse.json({ ...result, actor: auth.email });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nieznany błąd OSA Cloud Agent.' },
      { status: 503 },
    );
  }
}
