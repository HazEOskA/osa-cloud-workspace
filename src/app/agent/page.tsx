'use client';

import { useEffect, useRef, useState } from 'react';

type AgentStatus = {
  configured: boolean;
  mode: 'READ_ONLY';
  projectId: string | null;
  location: string;
  resourceId: string | null;
  resourceName: string | null;
};

type AgentReply = {
  mode: 'READ' | 'PLAN';
  answer: string;
  eventCount: number;
  sessionId: string | null;
  actor: string;
  error?: string;
};

type AuthConfig = { configured: boolean; clientId: string | null };
type GoogleCredentialResponse = { credential?: string };
type GoogleAccountsId = {
  initialize(input: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
  renderButton(parent: HTMLElement, options: Record<string, string>): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

export default function AgentPage() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [idToken, setIdToken] = useState('');
  const [message, setMessage] = useState('Sprawdź Cloud Run i ostatnie buildy. Pokaż tylko potwierdzone evidence.');
  const [reply, setReply] = useState<AgentReply | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [statusResponse, authResponse] = await Promise.all([
          fetch('/api/agent/status', { cache: 'no-store' }),
          fetch('/api/auth/config', { cache: 'no-store' }),
        ]);
        const statusData = (await statusResponse.json()) as AgentStatus;
        const authData = (await authResponse.json()) as AuthConfig;
        setStatus(statusData);
        setAuthConfig(authData);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
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

  async function askAgent() {
    if (!idToken) {
      setError('Zaloguj się kontem Google administratora.');
      return;
    }
    if (!status?.configured) {
      setError('OSA Cloud Agent Runtime jest NIEPOŁĄCZONY. Phase 1 kod jest gotowy, ale runtime nie został wdrożony.');
      return;
    }

    setRunning(true);
    setError(null);
    setReply(null);
    try {
      const response = await fetch('/api/agent/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ message, sessionId }),
      });
      const data = (await response.json()) as AgentReply;
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setReply(data);
      setSessionId(data.sessionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="workspace" style={{ maxWidth: 1100, margin: '0 auto', minHeight: '100vh' }}>
      <header className="topBar">
        <div><span className="kicker">OSA // CLOUD AGENT // PHASE 1</span><h1>Cloud Agent</h1></div>
        <div className="topActions"><a className="ghost" href="/">← Workspace</a></div>
      </header>

      <div className="sectionPage">
        <div className="pageIntro">
          <span className="kicker">READ-ONLY SUPERVISOR</span>
          <h2>Diagnozuje chmurę. Nie wykonuje mutacji.</h2>
          <p>Gemini ADK + Agent Runtime jako reasoning plane. Deploy, push, delete i inne write-intenty są w Phase 1 redukowane do PLAN / AWAITING_APPROVAL.</p>
        </div>

        <div className="cards3">
          <article className="infoCard"><span>Runtime</span><strong>{status?.configured ? 'CONNECTED' : 'NIEPOŁĄCZONE'}</strong><small>{status?.resourceId ?? 'resource UNKNOWN'}</small></article>
          <article className="infoCard"><span>Mode</span><strong>{status?.mode ?? 'READ_ONLY'}</strong><small>0 write tools</small></article>
          <article className="infoCard"><span>Region</span><strong>{status?.location ?? 'europe-west1'}</strong><small>{status?.projectId ?? 'project UNKNOWN'}</small></article>
        </div>

        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panelHead"><div><span>OPERATOR SESSION</span><h3>Zapytaj OSA Cloud Agent</h3></div><span className="statusBadge good">READ ONLY</span></div>
          <div style={{ display: 'grid', gap: 14 }}>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={6}
              maxLength={12000}
              style={{ width: '100%', resize: 'vertical', padding: 16, borderRadius: 14, background: '#08090d', color: 'inherit', border: '1px solid rgba(255,255,255,.12)', font: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {!idToken && <div ref={googleButtonRef} />}
              {idToken && <button className="primary" onClick={() => void askAgent()} disabled={running || !message.trim()}>{running ? 'ANALIZUJĘ…' : 'ASK AGENT'}</button>}
              <span className="kicker">SESSION {sessionId ?? 'NEW'}</span>
            </div>
          </div>
        </section>

        {error && <div className="errorStrip" style={{ marginTop: 18 }}><div><b>BLOCKED / ERROR</b><span>{error}</span></div></div>}

        {reply && <section className="panel" style={{ marginTop: 18 }}>
          <div className="panelHead"><div><span>AGENT RESULT</span><h3>{reply.mode === 'PLAN' ? 'AWAITING_APPROVAL' : 'READ RESULT'}</h3></div><span className="statusBadge">{reply.mode}</span></div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.65 }}>{reply.answer}</pre>
          <div style={{ marginTop: 14, opacity: .65, fontSize: 12 }}>events: {reply.eventCount} · actor: {reply.actor}</div>
        </section>}
      </div>
    </main>
  );
}
