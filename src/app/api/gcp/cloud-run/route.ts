import { NextResponse } from 'next/server';
import { listCloudRunServices } from '@/lib/gcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await listCloudRunServices();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        services: [],
        errors: [{
          source: 'cloud-run-service',
          scope: 'UNKNOWN',
          resource: null,
          message: error instanceof Error ? error.message : 'Nieznany błąd Cloud Run API.',
        }],
      },
      { status: 503 },
    );
  }
}
