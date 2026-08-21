import { NextResponse } from 'next/server';
import { listCloudBuilds } from '@/lib/gcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await listCloudBuilds();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        builds: [],
        scope: 'global',
        error: error instanceof Error ? error.message : 'Nieznany błąd Cloud Build API.',
      },
      { status: 503 },
    );
  }
}
