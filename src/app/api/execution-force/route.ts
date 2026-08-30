import { NextResponse } from 'next/server';
import { requireAdminIdentity } from '@/lib/admin-auth';
import {
  ExecutionForceError,
  getExecutionForceBridgeStatus,
  getExecutionMission,
  probeExecutionForce,
  resolveExecutionSkill,
  resumeExecutionMission,
  runExecutionMission,
} from '@/lib/execution-force';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;
type BridgeAction = 'resolve' | 'run' | 'get' | 'resume';

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function bridgeError(error: unknown) {
  if (error instanceof ExecutionForceError) {
    return NextResponse.json(
      { error: error.message, code: 'EXECUTION_FORCE_BRIDGE_ERROR', upstreamStatus: error.status, detail: error.detail },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Unknown Execution Force bridge error.', code: 'EXECUTION_FORCE_BRIDGE_FAILED' },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const auth = await requireAdminIdentity(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const config = getExecutionForceBridgeStatus();
  if (!config.configured) {
    return NextResponse.json(
      { bridge: 'WORKSPACE_EXECUTION_FORCE_V1', actor: auth.email, ...config, upstream: null },
      { status: 503 },
    );
  }

  try {
    const upstream = await probeExecutionForce();
    return NextResponse.json({ bridge: 'WORKSPACE_EXECUTION_FORCE_V1', actor: auth.email, ...config, upstream });
  } catch (error) {
    return bridgeError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminIdentity(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = asRecord(await request.json());
    if (!body) return NextResponse.json({ error: 'JSON object required.' }, { status: 400 });

    const action = body.action;
    if (!['resolve', 'run', 'get', 'resume'].includes(String(action))) {
      return NextResponse.json({ error: 'action must be one of: resolve, run, get, resume.' }, { status: 400 });
    }

    const typedAction = action as BridgeAction;
    const payload = asRecord(body.payload);
    const missionId = typeof body.missionId === 'string' && body.missionId.trim() ? body.missionId.trim() : null;
    let result: unknown;

    if (typedAction === 'resolve') {
      if (!payload) return NextResponse.json({ error: 'resolve requires payload.' }, { status: 400 });
      result = await resolveExecutionSkill(payload);
    } else if (typedAction === 'run') {
      if (!payload) return NextResponse.json({ error: 'run requires payload.' }, { status: 400 });
      result = await runExecutionMission(payload);
    } else if (typedAction === 'get') {
      if (!missionId) return NextResponse.json({ error: 'get requires missionId.' }, { status: 400 });
      result = await getExecutionMission(missionId);
    } else {
      if (!missionId || !payload) return NextResponse.json({ error: 'resume requires missionId and payload.' }, { status: 400 });
      result = await resumeExecutionMission(missionId, payload);
    }

    return NextResponse.json({ bridge: 'WORKSPACE_EXECUTION_FORCE_V1', actor: auth.email, action: typedAction, result });
  } catch (error) {
    return bridgeError(error);
  }
}
