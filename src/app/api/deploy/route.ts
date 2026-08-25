import { NextResponse } from 'next/server';
import { submitRepoDeploy, type RepoDeployRequest } from '@/lib/deploy';
import { requireAdminIdentity } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireAdminIdentity(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as Partial<RepoDeployRequest>;
    if (!body.repo || !body.branch || !body.serviceName) {
      return NextResponse.json({ error: 'Wymagane: repo, branch, serviceName.' }, { status: 400 });
    }

    const result = await submitRepoDeploy({
      repo: body.repo,
      branch: body.branch,
      serviceName: body.serviceName,
    });

    return NextResponse.json({ ...result, actor: auth.email }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nieznany błąd uruchamiania deployu.' },
      { status: 503 },
    );
  }
}
