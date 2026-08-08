import { NextResponse } from 'next/server';
import { listVms } from '@/lib/gcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const vms = await listVms();
    return NextResponse.json({ vms });
  } catch (error) {
    return NextResponse.json(
      { vms: [], error: error instanceof Error ? error.message : 'Nieznany błąd Compute Engine API.' },
      { status: 503 },
    );
  }
}
