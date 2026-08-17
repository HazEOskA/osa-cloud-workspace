'use client';

import { useEffect, useMemo, useState } from 'react';

type Repo = {
  name: string;
  cloneUrl: string;
  defaultBranch: string;
  fork: boolean;
};

type RepoResult = {
  owner: string;
  repos: Repo[];
  scope: 'public';
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
};

function toServiceName(name: string): string {
  let value = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!value) value = 'app';
  if (!/^[a-z]/.test(value)) value = `app-${value}`;
  return value.slice(0, 63).replace(/-+$/g, '') || 'app';
}

export default function DeployPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoName, setRepoName] = useState('');
  const [branch, setBranch] = useState('main');
  const [serviceName, setServiceName] = useState('');
  const [token, setToken] = useState('');
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeployResult | null>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem('osa-admin-token');
    if (stored) setToken(stored);

    void (async () => {
      try {
        const response = await fetch('/api/repos', { cache: 'no-store' });
        const data = (await response.json()) as RepoResult;
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        setRepos(data.repos);
        const first = data.repos[0];
        if (first) {
          setRepoName(first.name);
          setBranch(first.defaultBranch);
          setServiceName(toServiceName(first.name));
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoadingRepos(false);
      }
    })();
  }, []);

  const selectedRepo = useMemo(() => repos.find((repo) => repo.name === repoName) ?? null, [repos, repoName]);

  function onRepoChange(nextName: string) {
    setRepoName(nextName);
    const next = repos.find((repo) => repo.name === nextName);
    if (next) {
      setBranch(next.defaultBranch);
      setServiceName(toServiceName(next.name));
    }
  }

  async function deploy() {
    setDeploying(true);
    setError(null);
    setResult(null);
    window.sessionStorage.setItem('osa-admin-token', token);

    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-osa-admin-token': token,
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
    <main style={{ minHeight: '100vh', background: '#080b0f', color: '#f4f7fb', padding: '32px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <a href="/" style={{ color: '#9fb3c8', textDecoration: 'none' }}>← OSA Cloud Workspace</a>
        <div style={{ marginTop: 28, marginBottom: 24 }}>
          <div style={{ color: '#78d6b0', fontSize: 12, letterSpacing: 2 }}>GITHUB → CLOUD BUILD → CLOUD RUN</div>
          <h1 style={{ margin: '8px 0', fontSize: 36 }}>Repo Deploy MVP</h1>
          <p style={{ color: '#9fb3c8', margin: 0 }}>Dzisiaj: publiczne repo HazEOskA z Dockerfile → Artifact Registry → publiczny Cloud Run.</p>
        </div>

        <section style={{ border: '1px solid #25303a', borderRadius: 18, padding: 24, background: '#0d1218' }}>
          <label style={{ display: 'block', marginBottom: 8, color: '#9fb3c8' }}>Repozytorium</label>
          <select
            value={repoName}
            onChange={(event) => onRepoChange(event.target.value)}
            disabled={loadingRepos || deploying}
            style={{ width: '100%', padding: 12, borderRadius: 10, background: '#111821', color: '#fff', border: '1px solid #2d3945', marginBottom: 18 }}
          >
            {repos.map((repo) => <option key={repo.name} value={repo.name}>{repo.name}{repo.fork ? ' · fork' : ''}</option>)}
          </select>

          <label style={{ display: 'block', marginBottom: 8, color: '#9fb3c8' }}>Branch</label>
          <input
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            disabled={deploying}
            style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, background: '#111821', color: '#fff', border: '1px solid #2d3945', marginBottom: 18 }}
          />

          <label style={{ display: 'block', marginBottom: 8, color: '#9fb3c8' }}>Cloud Run service</label>
          <input
            value={serviceName}
            onChange={(event) => setServiceName(event.target.value)}
            disabled={deploying}
            style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, background: '#111821', color: '#fff', border: '1px solid #2d3945', marginBottom: 18 }}
          />

          <label style={{ display: 'block', marginBottom: 8, color: '#9fb3c8' }}>Admin token</label>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={deploying}
            placeholder="OSA_ADMIN_TOKEN"
            style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, background: '#111821', color: '#fff', border: '1px solid #2d3945', marginBottom: 20 }}
          />

          <button
            onClick={() => void deploy()}
            disabled={deploying || loadingRepos || !selectedRepo || !token || !branch || !serviceName}
            style={{ padding: '13px 20px', borderRadius: 10, border: 0, fontWeight: 700, cursor: 'pointer', background: '#78d6b0', color: '#07110d', opacity: deploying ? 0.6 : 1 }}
          >
            {deploying ? 'Uruchamiam Cloud Build…' : 'DEPLOY NA GOOGLE CLOUD'}
          </button>
        </section>

        {error && <div style={{ marginTop: 18, padding: 16, borderRadius: 12, background: '#261216', border: '1px solid #743b46', color: '#ff9ca8' }}>{error}</div>}

        {result && (
          <section style={{ marginTop: 18, padding: 20, borderRadius: 16, background: '#0f1a16', border: '1px solid #285743' }}>
            <strong style={{ color: '#78d6b0' }}>BUILD ACCEPTED</strong>
            <div style={{ marginTop: 10, color: '#c8d4df' }}>Repo: {result.repoUrl}</div>
            <div style={{ color: '#c8d4df' }}>Service: {result.serviceName}</div>
            <div style={{ color: '#c8d4df' }}>Status: {result.status}</div>
            <div style={{ color: '#c8d4df' }}>Build ID: {result.buildId ?? 'jeszcze UNKNOWN'}</div>
            <div style={{ color: '#8798a9', marginTop: 8, wordBreak: 'break-all' }}>Operation: {result.operationName ?? 'UNKNOWN'}</div>
            {result.logUrl && <a href={result.logUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 12, color: '#78d6b0' }}>Otwórz logi Cloud Build ↗</a>}
          </section>
        )}
      </div>
    </main>
  );
}
