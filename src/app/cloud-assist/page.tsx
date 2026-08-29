'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './cloud-assist.module.css';

type AuthConfig = { configured: boolean; clientId: string | null };
type Tool = 'ask_cloud_assist' | 'investigate_issue' | 'optimize_costs';
type Message = { role: 'user' | 'assistant'; content: string };
type CloudAssistResult = {
  content?: string;
  contextId?: string | null;
  tool?: Tool;
  projectId?: string;
  actor?: string;
  execution?: 'LOCKED';
  policy?: 'READ_ONLY';
  error?: string;
};

type GoogleCredentialResponse = { credential?: string };
type GoogleAccountsId = {
  initialize(input: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
  renderButton(parent: HTMLElement, options: Record<string, string>): void;
};
type GoogleWindow = Window & { google?: { accounts: { id: GoogleAccountsId } } };

const CONTEXT_KEY = 'osa-cloud-assist-context-id';
const MESSAGES_KEY = 'osa-cloud-assist-messages';

export default function CloudAssistPage() {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [idToken, setIdToken] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [contextId, setContextId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tool, setTool] = useState<Tool>('ask_cloud_assist');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const savedContext = sessionStorage.getItem(CONTEXT_KEY);
      const savedMessages = sessionStorage.getItem(MESSAGES_KEY);
      if (savedContext) setContextId(savedContext);
      if (savedMessages) setMessages(JSON.parse(savedMessages) as Message[]);
    } catch {
      sessionStorage.removeItem(CONTEXT_KEY);
      sessionStorage.removeItem(MESSAGES_KEY);
    }

    void fetch('/api/auth/config', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as AuthConfig & { error?: string };
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        setAuthConfig(data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  useEffect(() => {
    if (!authConfig?.configured || !authConfig.clientId || idToken) return;

    const mountButton = () => {
      const googleWindow = window as GoogleWindow;
      if (!googleWindow.google || !googleButtonRef.current || !authConfig.clientId) return;
      googleWindow.google.accounts.id.initialize({
        client_id: authConfig.clientId,
        callback: (response) => {
          if (response.credential) {
            setIdToken(response.credential);
            setError(null);
          }
        },
      });
      googleButtonRef.current.innerHTML = '';
      googleWindow.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-osa-google-identity]');
    if (existing) {
      if ((window as GoogleWindow).google) mountButton();
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

  useEffect(() => {
    try {
      sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
      if (contextId) sessionStorage.setItem(CONTEXT_KEY, contextId);
      else sessionStorage.removeItem(CONTEXT_KEY);
    } catch {
      // Session persistence is best-effort only.
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, contextId]);

  function resetConversation() {
    setMessages([]);
    setContextId(null);
    setError(null);
    sessionStorage.removeItem(CONTEXT_KEY);
    sessionStorage.removeItem(MESSAGES_KEY);
  }

  async function send() {
    const userQuery = query.trim();
    if (!userQuery || sending) return;
    if (!idToken) {
      setError('Najpierw zaloguj się kontem Google administratora.');
      return;
    }

    setMessages((current) => [...current, { role: 'user', content: userQuery }]);
    setQuery('');
    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/gcp/cloud-assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ userQuery, contextId, tool }),
      });
      const data = (await response.json()) as CloudAssistResult;
      if (!response.ok || !data.content) throw new Error(data.error ?? `HTTP ${response.status}`);

      setProjectId(data.projectId ?? null);
      setContextId(data.contextId ?? null);
      setMessages((current) => [...current, { role: 'assistant', content: data.content ?? '' }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <a className={styles.back} href="/">← OSA CLOUD WORKSPACE</a>
          <span className={styles.kicker}>GEMINI CLOUD ASSIST // REMOTE MCP</span>
          <h1>Cloud Agent</h1>
          <p>Ekspert Google Cloud osadzony w control plane. Aktualny etap jest twardo zablokowany do READ ONLY.</p>
        </div>
        <div className={styles.statusStack}>
          <span className={styles.locked}>EXECUTION LOCKED</span>
          <span>{projectId ?? 'PROJECT VIA ADC'}</span>
          <span>{contextId ? `SESSION ${contextId.slice(0, 14)}…` : 'NEW SESSION'}</span>
        </div>
      </header>

      <section className={styles.controlBar}>
        <label>
          <span>AGENT MODE</span>
          <select value={tool} onChange={(event) => setTool(event.target.value as Tool)} disabled={sending}>
            <option value="ask_cloud_assist">Cloud Assist</option>
            <option value="investigate_issue">Investigate issue</option>
            <option value="optimize_costs">Optimize costs</option>
          </select>
        </label>
        <div className={styles.authBox}>
          <span>{idToken ? 'ADMIN AUTHENTICATED' : 'ADMIN AUTH REQUIRED'}</span>
          {!idToken && <div ref={googleButtonRef} />}
          {idToken && <button onClick={() => setIdToken('')}>Wyloguj sesję</button>}
        </div>
        <button className={styles.reset} onClick={resetConversation}>Nowa rozmowa</button>
      </section>

      <section className={styles.chat}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <strong>GCA ROOT AGENT READY</strong>
            <p>Przykład: „Przeanalizuj ostatni failed Cloud Build i wskaż pierwszy realny błąd oraz najmniejszą poprawkę. Niczego nie zmieniaj.”</p>
          </div>
        )}
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`${styles.message} ${message.role === 'user' ? styles.user : styles.assistant}`}>
            <span>{message.role === 'user' ? 'OSA' : 'CLOUD ASSIST'}</span>
            <div>{message.content}</div>
          </article>
        ))}
        {sending && <article className={`${styles.message} ${styles.assistant}`}><span>CLOUD ASSIST</span><div>Analizuję Google Cloud…</div></article>}
        <div ref={endRef} />
      </section>

      {error && <div className={styles.error}><strong>BLOCKED / ERROR</strong><span>{error}</span></div>}

      <section className={styles.composer}>
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Zapytaj o Cloud Run, Build, logi, IAM, koszty, incydent…"
          disabled={sending}
        />
        <button onClick={() => void send()} disabled={sending || !query.trim()}>{sending ? 'WORKING…' : 'ASK CLOUD ASSIST'}</button>
      </section>

      <footer className={styles.footer}>
        <span>ADC → geminicloudassist.googleapis.com/mcp</span>
        <span>ask / investigate / optimize</span>
        <strong>NO MUTATION PATH EXPOSED</strong>
      </footer>
    </main>
  );
}
