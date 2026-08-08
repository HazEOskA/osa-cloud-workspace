import { NextResponse } from 'next/server';
import { getConnectionStatus } from '@/lib/gcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await getConnectionStatus();
  return NextResponse.json(status, { status: status.connected ? 200 : 503 });
}
