import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OWNER = 'HazEOskA';
const REPO_NAME = /^[A-Za-z0-9_.-]+$/;

type GitHubBranch = {
  name: string;
  protected: boolean;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repo = url.searchParams.get('repo')?.trim() ?? '';

  if (!REPO_NAME.test(repo)) {
    return NextResponse.json({ error: 'Nieprawidłowa nazwa repozytorium.' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${encodeURIComponent(repo)}/branches?per_page=100`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'OSA-Cloud-Workspace',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status}`);
    }

    const branches = ((await response.json()) as GitHubBranch[])
      .filter((branch) => Boolean(branch.name))
      .map((branch) => ({ name: branch.name, protected: branch.protected }));

    return NextResponse.json({ owner: OWNER, repo, branches, scope: 'public' });
  } catch (error) {
    return NextResponse.json(
      {
        owner: OWNER,
        repo,
        branches: [],
        scope: 'public',
        error: error instanceof Error ? error.message : 'Nieznany błąd GitHub API.',
      },
      { status: 503 },
    );
  }
}
