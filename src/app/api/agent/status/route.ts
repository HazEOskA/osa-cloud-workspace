import { NextResponse } from 'next/server';
import { getAgentRuntimeStatus } from '@/lib/agent-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await getAgentRuntimeStatus();
  return NextResponse.json(status);
}
