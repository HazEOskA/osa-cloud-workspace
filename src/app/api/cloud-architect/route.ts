import { NextResponse } from 'next/server';
import { requireAdminIdentity } from '@/lib/admin-auth';
import { askCloudArchitect, getCloudArchitectStatus } from '@/lib/cloud-assist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getCloudArchitectStatus());
}

export async function POST(request: Request) {
  const auth = await requireAdminIdentity(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      userQuery?: string;
      contextId?: string | null;
    };

    if (typeof body.userQuery !== 'string' || !body.userQuery.trim()) {
      return NextResponse.json({ error: 'Wymagane: userQuery.' }, { status: 400 });
    }
    if (body.contextId != null && typeof body.contextId !== 'string') {
      return NextResponse.json({ error: 'contextId musi być stringiem albo null.' }, { status: 400 });
    }

    const result = await askCloudArchitect({
      userQuery: body.userQuery,
      contextId: body.contextId,
    });

    return NextResponse.json({
      ...result,
      actor: auth.email,
      mode: 'READ_PLAN_ONLY',
      executionEnabled: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nieznany błąd Gemini Cloud Assist bridge.';
    const previewBlocked = /403|permission|allowlist|preview/i.test(message);
    return NextResponse.json(
      {
        error: message,
        code: previewBlocked ? 'CLOUD_ASSIST_ACCESS_BLOCKED' : 'CLOUD_ASSIST_CALL_FAILED',
        executionEnabled: false,
      },
      { status: previewBlocked ? 403 : 503 },
    );
  }
}
