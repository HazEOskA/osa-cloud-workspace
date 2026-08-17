import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { submitPublicRepoDeploy, type RepoDeployRequest } from '@/lib/deploy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const expectedToken = process.env.OSA_ADMIN_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json({ error: 'OSA_ADMIN_TOKEN nie jest skonfigurowany w Cloud Run.' }, { status: 503 });
  }

  const providedToken = request.headers.get('x-osa-admin-token') ?? '';
  if (!tokenMatches(providedToken, expectedToken)) {
    return NextResponse.json({ error: 'Brak autoryzacji do uruchomienia deployu.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<RepoDeployRequest>;
    if (!body.repo || !body.branch || !body.serviceName) {
      return NextResponse.json({ error: 'Wymagane: repo, branch, serviceName.' }, { status: 400 });
    }

    const result = await submitPublicRepoDeploy({
      repo: body.repo,
      branch: body.branch,
      serviceName: body.serviceName,
    });

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nieznany błąd uruchamiania deployu.' },
      { status: 503 },
    );
  }
}
