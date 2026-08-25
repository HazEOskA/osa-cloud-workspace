'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Repo = {
  name: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
  fork: boolean;
};

type RepoResult = {
  owner: string;
  repos: Repo[];
  scope: 'public' | 'authenticated';
  authenticated: boolean;
  error?: string;
};

type Branch = {
  name: string;
  protected: boolean;
};

type BranchResult = {
  owner: string;
  repo: string;
  branches: Branch[];
  scope: 'public' | 'authenticated';
  authenticated: boolean;
  error?: string;
};

type DeployResult = {
  accepted: true;
  operationName: string | null;
  buildId: string | null;
  status: string;
  logUrl: string | null;
  repoUrl: string;
  serviceName: string;
  privateRepo: boolean;
  actor: string;
};

type AuthConfig = {
  configured: boolean;
  clientId: string | null;
};

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccountsId = {
  initialize(input: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
  renderButton(parent: HTMLElement, options: Record<string, string>): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

function toServiceName(name: string): string {
  let value = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!value) value = 'app';
  if (!/^[a-z]/.test(value)) value = `app-${value}`;
  return value.slice(0, 63).replace(/-+$/g, '') || 'app';
}

export default function DeployPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [repoName, setRepoName] = useState('');
  const [branch, setBranch] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [idToken, setIdToken] = useState('');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeployResult | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  async function loadBranches(repo: Repo) {
    setLoadingBranches(true);
    setBranchError(null);
    setBranches([]);
    setBranch(repo.defaultBranch);

    try {
      const response = await fetch(`/api/branches?repo=${encodeURIComponent(repo.name)}`, { cache: 'no-store' });
      const data = (await response.json()) as BranchResult;
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);

      setBranches(data.branches);
      if (data.branches.some((item) => item.name === repo.defaultBranch)) {
        setBranch(repo.defaultBranch);
      } else if (data.branches[0]) {
        setBranch(data.branches[0].name);
      }
    } catch (cause) {
      setBranchError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingBranches(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const [repoResponse, authResponse] = await Promise.all([
          fetch('/api/repos', { cache: 'no-store' }),
          fetch('/api/auth/config', { cache: 'no-store' }),
        ]);
        const repoData = (await repoResponse.json()) as RepoResult;
        const authData = (await authResponse.json()) as AuthConfig;
        if (!repoResponse.ok) throw new Error(repoData.error ?? `HTTP ${repoResponse.status}`);

        setAuthConfig(authData);
        setRepos(repoData.repos);
        const first = repoData.repos[0];
        if (first) {
          setRepoName(first.name);
          setServiceName(toServiceName(first.name));
          await loadBranches(first);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoadingRepos(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!authConfig?.configured || !authConfig.clientId || idToken) return;

    const mountButton = () => {
      if (!window.google || !googleButtonRef.current || !authConfig.clientId) return;
      window.google.accounts.id.initialize({
        client_id: authConfig.clientId,
        callback: (response) => {
          if (response.credential) {
            setIdToken(response.credential);
            setError(null);
          }
        },
      });
      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-osa-google-identity]');
    if (existing) {
      if (window.google) mountButton();
      else existing.addEventListener('load', mountButton, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.osaGoogleIdentity = 'true';
    script.addEventListener('load', mountButton, { once: true });
    document.head.appendChild(script);
  }, [authConfig, idToken]);

  const selectedRepo = useMemo(() => repos.find((repo) => repo.name === repoName) ?? null, [repos, repoName]);
  const branchOptions = branches.length > 0
    ? branches
    : branch
      ? [{ name: branch, protected: false }]
      : [];

  function onRepoChange(nextName: string) {
    setRepoName(nextName);
    setResult(null);
    setError(null);
    const next = repos.find((repo) => repo.name === nextName);
    if (next) {
      setServiceName(toServiceName(next.name));
      void loadBranches(next);
    }
  }

  async function deploy() {
    if (!idToken) {
      setError('Najpierw zaloguj się kontem Google administratora.');
      return;
    }

    setDeploying(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ repo: repoName, branch, serviceName }),
      });
      const data = (await response.json()) as DeployResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeploying(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#080b0f', color: '#f4f7fb', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <a href="/" style={{ color: '#9fb3c8', textDecoration: 'none' }}>← OSA Cloud Workspace</a>

        <div style={{ marginTop: 24, marginBottom: 20 }}>
          <div style={{ color: '#78d6b0', fontSize: 12, letterSpacing: 2 }}>ONE CONTROL PLANE</div>
          <h1 style={{ margin: '8px 0', fontSize: 36 }}>Deploy z jednego ekranu</h1>
          <p style={{ color: '#9fb3c8', margin: 0 }}>
            GitHub → Cloud Build → Artifact Registry → Cloud Run. Bez ręcznego tokena w telefonie.
          </p>
        </div>

        <section style={{ border: '1px solid #25303a', borderRadius: 18, padding: 22, background: '#0d1218' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, color: '#9fb3c8' }}>Repozytorium</label>
              <select
                value={repoName}
                onChange={(event) => onRepoChange(event.target.value)}
                disabled={loadingRepos || deploying}
                style={{ width: '100%', padding: 12, borderRadius: 10, background: '#111821', color: '#fff', border: '1px solid #2d3945' }}
              >
                {repos.map((repo) => (
                  <option key={repo.name} value={repo.name}>
                    {repo.name}{repo.private ? ' · private' : ''}{repo.fork ? ' · fork' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 8, color: '#9fb3c8' }}>Branch</label>
              <select
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                disabled={deploying || loadingBranches || !branch}
                style={{ width: '100%', padding: 12, borderRadius: 10, background: '#111821', color: '#fff', border: '1px solid #2d3945' }}
              >
                {loadingBranches && <option value={branch || ''}>Ładowanie branchy…</option>}
                {!loadingBranches && branchOptions.map((item) => (
                  <option key={item.name} value={item.name}>{item.name}{item.protected ? ' · protected' : ''}</option>
                ))}
              </select>
              {branchError && <div style={{ marginTop: 8, color: '#e6b86b', fontSize: 13 }}>{branchError}</div>}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 8, color: '#9fb3c8' }}>Cloud Run service</label>
              <input
                value={serviceName}
                onChange={(event) => setServiceName(event.target.value)}
                disabled={deploying}
                style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, background: '#111821', color: '#fff', border: '1px solid #2d3945' }}
              />
            </div>
          </div>

          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #25303a' }}>
            {!authConfig?.configured && (
              <div style={{ marginBottom: 14, color: '#ffb3bd' }}>
                Google admin auth: NIEPOŁĄCZONE. Ustaw GOOGLE_CLIENT_ID i OSA_ADMIN_EMAIL w Cloud Run.
              </div>
            )}
            {authConfig?.configured && !idToken && <div ref={googleButtonRef} />}
            {idToken && <div style={{ marginBottom: 12, color: '#78d6b0', fontSize: 13 }}>✓ Administrator Google zalogowany</div>}

            <button
              onClick={() => void deploy()}
              disabled={deploying || loadingRepos || !selectedRepo || !branch || !serviceName || !idToken}
              style={{ width: '100%', padding: '14px 20px', borderRadius: 10, border: 0, fontWeight: 800, cursor: 'pointer', background: '#78d6b0', color: '#07110d', opacity: deploying || !idToken ? 0.55 : 1 }}
            >
              {deploying ? 'URUCHAMIAM BUILD…' : 'DEPLOY / REDEPLOY'}
            </button>
          </div>
        </section>

        {error && <div style={{ marginTop: 18, padding: 16, borderRadius: 12, background: '#261216', border: '1px solid #743b46', color: '#ff9ca8' }}>{error}</div>}

        {result && (
          <section style={{ marginTop: 18, padding: 20, borderRadius: 16, background: '#0f1a16', border: '1px solid #285743' }}>
            <strong style={{ color: '#78d6b0' }}>BUILD ACCEPTED</strong>
            <div style={{ marginTop: 10, color: '#c8d4df' }}>Repo: {result.repoUrl}</div>
            <div style={{ color: '#c8d4df' }}>Service: {result.serviceName}</div>
            <div style={{ color: '#c8d4df' }}>Status: {result.status}</div>
            <div style={{ color: '#c8d4df' }}>Build ID: {result.buildId ?? 'UNKNOWN'}</div>
            <div style={{ color: '#c8d4df' }}>Repo scope: {result.privateRepo ? 'private' : 'public'}</div>
            <div style={{ color: '#8798a9', marginTop: 8, wordBreak: 'break-all' }}>Operation: {result.operationName ?? 'UNKNOWN'}</div>
            {result.logUrl && <a href={result.logUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 12, color: '#78d6b0' }}>Logi Cloud Build ↗</a>}
          </section>
        )}
      </div>
    </main>
  );
}
