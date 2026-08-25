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
  const token = process.env.GITHUB_TOKEN?.trim();
  const endpoint = token
    ? 'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner'
    : `https://api.github.com/users/${OWNER}/repos?per_page=100&sort=updated`;

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'OSA-Cloud-Workspace',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status}`);
    }

    const data = (await response.json()) as GitHubRepo[];
    const repos = data
      .filter((repo) => !repo.archived)
      .filter((repo) => token || !repo.private)
      .map((repo) => ({
        name: repo.name,
        cloneUrl: repo.clone_url,
        defaultBranch: repo.default_branch,
        private: repo.private,
        fork: repo.fork,
      }));

    return NextResponse.json({
      owner: OWNER,
      repos,
      scope: token ? 'authenticated' : 'public',
      authenticated: Boolean(token),
    });
  } catch (error) {
    return NextResponse.json(
      {
        owner: OWNER,
        repos: [],
        scope: token ? 'authenticated' : 'public',
        authenticated: Boolean(token),
        error: error instanceof Error ? error.message : 'Nieznany błąd GitHub API.',
      },
      { status: 503 },
    );
  }
}
