'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './architect.module.css';

type AuthConfig = {
  configured: boolean;
  clientId: string | null;
};

type CloudArchitectStatus = {
  bridge: 'READY' | 'PARTIAL';
  projectId: string | null;
  endpoint: string;
  tool: 'ask_cloud_assist';
  mode: 'READ_PLAN_ONLY';
  preview: 'PRIVATE_PREVIEW';
  access: 'UNKNOWN';
};

type CloudArchitectResponse = {
  content?: string;
  contextId?: string | null;
  projectId?: string;
  tool?: string;
  actor?: string;
  mode?: string;
  executionEnabled?: boolean;
  error?: string;
  code?: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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

const CONTEXT_KEY = 'osa-cloud-architect-context-v01';
const ID_TOKEN_KEY = 'osa-cloud-architect-id-token-v01';

const quickPrompts = [
  'Zrób read-only audyt tego projektu GCP. Wskaż trzy najważniejsze problemy operacyjne i evidence, które powinienem sprawdzić.',
  'Sprawdź architekturę Cloud Run i Cloud Build w tym projekcie. Nie wykonuj zmian — daj plan i ryzyka.',
  'Przeanalizuj IAM pod kątem zbyt szerokich uprawnień. Tylko odczyt i rekomendacje.',
  'Powiedz co powinienem sprawdzić przed kolejnym deployem, bazując na aktualnym stanie projektu.',
];

export default function ArchitectPage() {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [status, setStatus] = useState<CloudArchitectStatus | null>(null);
  const [idToken, setIdToken] = useState('');
  const [contextId, setContextId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveAccess, setLiveAccess] = useState<'UNKNOWN' | 'VERIFIED' | 'BLOCKED'>('UNKNOWN');
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [authResponse, statusResponse] = await Promise.all([
          fetch('/api/auth/config', { cache: 'no-store' }),
          fetch('/api/cloud-architect', { cache: 'no-store' }),
        ]);
        const authData = (await authResponse.json()) as AuthConfig;
        const statusData = (await statusResponse.json()) as CloudArchitectStatus;
        setAuthConfig(authData);
        setStatus(statusData);
        const saved = window.sessionStorage.getItem(CONTEXT_KEY);
        if (saved) setContextId(saved);
        const savedToken = window.sessionStorage.getItem(ID_TOKEN_KEY);
        if (savedToken) setIdToken(savedToken);
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
          if (!response.credential) return;
          window.sessionStorage.setItem(ID_TOKEN_KEY, response.credential);
          setIdToken(response.credential);
          setError(null);
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

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  function newConversation() {
    setContextId(null);
    setMessages([]);
    setError(null);
    window.sessionStorage.removeItem(CONTEXT_KEY);
  }

  async function send() {
    const userQuery = input;
    if (!userQuery.trim() || sending) return;
    if (!idToken) {
      setError('Najpierw zaloguj się kontem Google administratora.');
      return;
    }

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: userQuery,
    };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/cloud-architect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ userQuery, contextId }),
      });
      const data = (await response.json()) as CloudArchitectResponse;
      if (!response.ok || !data.content) {
        const message = data.error ?? `HTTP ${response.status}`;
        if (response.status === 401) {
          window.sessionStorage.removeItem(ID_TOKEN_KEY);
          setIdToken('');
        }
        if (data.code === 'CLOUD_ASSIST_ACCESS_BLOCKED') setLiveAccess('BLOCKED');
        throw new Error(message);
      }

      setLiveAccess('VERIFIED');
      const nextContext = data.contextId ?? null;
      setContextId(nextContext);
      if (nextContext) window.sessionStorage.setItem(CONTEXT_KEY, nextContext);
      else window.sessionStorage.removeItem(CONTEXT_KEY);

      setMessages((current) => [...current, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.content ?? '',
      }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }

  const authState = idToken ? 'SIGNED IN' : authConfig?.configured ? 'LOGIN REQUIRED' : 'AUTH NOT CONFIGURED';

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.mark}>✦</div>
          <div><strong>OSA CLOUD ARCHITECT</strong><span>GEMINI CLOUD ASSIST // V0.1</span></div>
        </div>
        <a className={styles.back} href="/">← WORKSPACE</a>
      </header>

      <div className={styles.frame}>
        <section className={styles.chat}>
          <div className={styles.hero}>
            <div>
              <div className={styles.kicker}>CLOUD-NATIVE ARCHITECT / READ + PLAN</div>
              <h1>Zapytaj chmurę<br />o własną chmurę.</h1>
              <p>Gemini Cloud Assist przez oficjalny Google Cloud MCP. Projekt i tożsamość pochodzą z Workspace. v0.1 nie wystawia żadnego execution toola.</p>
            </div>
            <div className={styles.sessionActions}>
              <button className={styles.button} onClick={newConversation}>NOWA SESJA</button>
            </div>
          </div>

          <div className={styles.messages} ref={messagesRef}>
            {messages.length === 0 && !sending && (
              <div className={styles.empty}>
                <strong>Cloud Architect jest gotowy do rozmowy.</strong>
                <p>Możesz pytać o Cloud Run, Build, IAM, logi, networking, architekturę i operacje. Pierwszy udany call jest dopiero dowodem, że Twój projekt ma dostęp do private preview.</p>
                <div className={styles.quick}>
                  {quickPrompts.map((prompt) => (
                    <button key={prompt} className={styles.button} onClick={() => setInput(prompt)}>{prompt}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <article key={message.id} className={`${styles.message} ${message.role === 'user' ? styles.user : styles.assistant}`}>
                <div className={styles.role}>{message.role === 'user' ? 'OPERATOR' : 'GEMINI CLOUD ASSIST'}</div>
                <div className={styles.content}>{message.content}</div>
              </article>
            ))}

            {sending && (
              <article className={`${styles.message} ${styles.assistant}`}>
                <div className={styles.role}>GEMINI CLOUD ASSIST</div>
                <div className={styles.content}>Analizuję aktualny kontekst projektu…</div>
              </article>
            )}
          </div>

          <div>
            {error && (
              <details className={styles.error}>
                <summary>{liveAccess === 'BLOCKED' ? 'Cloud Assist access: BLOCKED' : 'Cloud Assist request failed'}</summary>
                <pre>{error}</pre>
              </details>
            )}
            <div className={styles.composer}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Np. Dlaczego ostatnia rewizja Cloud Run nie jest ready? Sprawdź evidence i zaproponuj plan naprawy."
                maxLength={16000}
              />
              <div className={styles.composeRow}>
                <small>CTRL/⌘ + ENTER · prompt jest przekazywany do Cloud Assist bez przepisywania · contextId utrzymuje sesję</small>
                <button className={styles.primary} disabled={sending || !input.trim() || !idToken} onClick={() => void send()}>{sending ? 'ANALIZA…' : 'ZAPYTAJ CLOUD ARCHITECT'}</button>
              </div>
            </div>
          </div>
        </section>

        <aside className={styles.side}>
          <section>
            <div className={styles.badge}>READ / PLAN ONLY</div>
            <h2>Runtime contract</h2>
            <div className={styles.stat}><span>Project</span><b>{status?.projectId ?? 'UNKNOWN'}</b></div>
            <div className={styles.stat}><span>Bridge</span><b className={status?.bridge === 'READY' ? styles.good : styles.warn}>{status?.bridge ?? 'UNKNOWN'}</b></div>
            <div className={styles.stat}><span>MCP access</span><b className={liveAccess === 'VERIFIED' ? styles.good : liveAccess === 'BLOCKED' ? styles.warn : ''}>{liveAccess}</b></div>
            <div className={styles.stat}><span>Tool</span><b>{status?.tool ?? 'ask_cloud_assist'}</b></div>
            <div className={styles.stat}><span>Execution</span><b className={styles.good}>DISABLED</b></div>
            <div className={styles.stat}><span>Session</span><b>{contextId ? 'CONTINUED' : 'NEW'}</b></div>
          </section>

          <section>
            <h2>Operator identity</h2>
            <div className={styles.stat}><span>Auth</span><b>{authState}</b></div>
            {!idToken && <div className={styles.signin} ref={googleButtonRef} />}
            {idToken && <button className={styles.button} onClick={() => { window.sessionStorage.removeItem(ID_TOKEN_KEY); setIdToken(''); }}>WYLOGUJ SESJĘ UI</button>}
          </section>

          <section>
            <h2>Safety boundary</h2>
            <p className={styles.notice}>Backend wywołuje tylko <b>ask_cloud_assist</b>. Nie ma kodu dla <b>invoke_operation</b>. Runtime Service Account powinien mieć wyłącznie read-only dostęp do zasobów GCP; IAM jest ostatnią bramą nawet wtedy, gdy agent zasugeruje mutację.</p>
          </section>

          <section>
            <h2>Preview status</h2>
            <p className={styles.notice}>Gemini Cloud Assist remote MCP jest private preview. <b>UNKNOWN</b> zmienia się na <b>VERIFIED</b> dopiero po pierwszej poprawnej odpowiedzi z endpointu.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
