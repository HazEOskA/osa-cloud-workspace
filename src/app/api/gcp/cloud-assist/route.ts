import { NextResponse } from 'next/server';
import { requireAdminIdentity } from '@/lib/admin-auth';
import { callCloudAssist, isCloudAssistTool, type CloudAssistTool } from '@/lib/cloud-assist';
import { resolveProjectId } from '@/lib/gcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestBody = {
  userQuery?: unknown;
  contextId?: unknown;
  tool?: unknown;
};

function statusForError(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (/403|permission|forbidden|mcp\.tools\.call|geminicloudassist/i.test(message)) return 403;
  if (/401|unauthorized|credential/i.test(message)) return 401;
  if (/nie może być puste|zbyt długie|niedozwolone/i.test(message)) return 400;
  return 503;
}

export async function POST(request: Request) {
  const admin = await requireAdminIdentity(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const userQuery = typeof body.userQuery === 'string' ? body.userQuery : '';
    const contextId = typeof body.contextId === 'string' ? body.contextId : null;
    const tool: CloudAssistTool = isCloudAssistTool(body.tool) ? body.tool : 'ask_cloud_assist';
    const projectId = await resolveProjectId();

    const result = await callCloudAssist({
      projectId,
      userQuery,
      contextId,
      tool,
    });

    return NextResponse.json({
      ...result,
      projectId,
      actor: admin.email,
      execution: 'LOCKED',
      policy: 'READ_ONLY',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nieznany błąd Gemini Cloud Assist.';
    return NextResponse.json(
      {
        error: message,
        execution: 'LOCKED',
        policy: 'READ_ONLY',
      },
      { status: statusForError(error) },
    );
  }
}
