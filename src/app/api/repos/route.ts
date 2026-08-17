import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OWNER = 'HazEOskA';

type GitHubRepo = {
  name: string;
  clone_url: string;
  default_branch: string;
  private: boolean;
  archived: boolean;
  fork: boolean;
};

export async function GET() {
  try {
    const response = await fetch(`https://api.github.com/users/${OWNER}/repos?per_page=100&sort=updated`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'OSA-Cloud-Workspace',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status}`);
    }

    const data = (await response.json()) as GitHubRepo[];
    const repos = data
      .filter((repo) => !repo.private && !repo.archived)
      .map((repo) => ({
        name: repo.name,
        cloneUrl: repo.clone_url,
        defaultBranch: repo.default_branch,
        fork: repo.fork,
      }));

    return NextResponse.json({ owner: OWNER, repos, scope: 'public' });
  } catch (error) {
    return NextResponse.json(
      {
        owner: OWNER,
        repos: [],
        scope: 'public',
        error: error instanceof Error ? error.message : 'Nieznany błąd GitHub API.',
      },
      { status: 503 },
    );
  }
}
