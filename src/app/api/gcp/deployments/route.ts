import { NextResponse } from 'next/server';
import { getDeploymentInventory } from '@/lib/gcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const inventory = await getDeploymentInventory();
    return NextResponse.json(inventory);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Nieznany błąd Deployment Inventory.',
        deployments: [],
        services: [],
        builds: [],
        artifacts: [],
        errors: [{
          source: 'identity',
          scope: 'UNKNOWN',
          resource: null,
          message: error instanceof Error ? error.message : 'Nieznany błąd Deployment Inventory.',
        }],
        scope: { builds: 'global', regions: [] },
      },
      { status: 503 },
    );
  }
}
