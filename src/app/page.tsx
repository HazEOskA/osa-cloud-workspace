'use client';

import { useEffect, useMemo, useState } from 'react';

type Status = {
  connected: boolean;
  projectId: string | null;
  identity: 'ADC';
  regions: string[];
  error?: string;
};

type Vm = {
  id: string;
  name: string;
  zone: string;
  status: string;
  machineType: string;
  internalIp: string | null;
  externalIp: string | null;
};

type CloudRunService = {
  name: string;
  region: string;
  uri: string | null;
  generation: string | null;
  latestReadyRevision: string | null;
};

type CloudRunResult = {
  services: CloudRunService[];
  errors: Array<{ region: string; message: string }>;
};

type Section =
  | 'pulpit'
  | 'aplikacje'
  | 'strony'
  | 'vps'
  | 'wdrozenia'
  | 'github'
  | 'automatyzacje'
  | 'ai'
  | 'storage'
  | 'koszty'
  | 'advanced';

const menu: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'pulpit', label: 'Pulpit', icon: '⌂' },
  { id: 'aplikacje', label: 'Aplikacje', icon: '⬡' },
  { id: 'strony', label: 'Strony WWW', icon: '◇' },
  { id: 'vps', label: 'Mój VPS', icon: '▣' },
  { id: 'wdrozenia', label: 'Wdrożenia', icon: '⇧' },
  { id: 'github', label: 'GitHub → GCP', icon: '⌁' },
  { id: 'automatyzacje', label: 'Automatyzacje', icon: '⌘' },
  { id: 'ai', label: 'AI', icon: '✦' },
  { id: 'storage', label: 'Pamięć / Storage', icon: '▱' },
  { id: 'koszty', label: 'Koszty', icon: '◌' },
];

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const data = (await response.json()) as T;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return data;
}

export default function Home() {
  const [section, setSection] = useState<Section>('pulpit');
  const [status, setStatus] = useState<Status | null>(null);
  const [vms, setVms] = useState<Vm[]>([]);
  const [vmError, setVmError] = useState<string | null>(null);
  const [run, setRun] = useState<CloudRunResult>({ services: [], errors: [] });
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [statusResult, vmResult, runResult] = await Promise.allSettled([
      readJson<Status>('/api/gcp/status'),
      readJson<{ vms: Vm[]; error?: string }>('/api/gcp/vms'),
      readJson<CloudRunResult>('/api/gcp/cloud-run'),
    ]);

    if (statusResult.status === 'fulfilled') setStatus(statusResult.value);
    else setStatus({ connected: false, projectId: null, identity: 'ADC', regions: [], error: String(statusResult.reason) });

    if (vmResult.status === 'fulfilled') {
      setVms(vmResult.value.vms ?? []);
      setVmError(vmResult.value.error ?? null);
    } else {
      setVms([]);
      setVmError(String(vmResult.reason));
    }

    if (runResult.status === 'fulfilled') setRun(runResult.value);
    else setRun({ services: [], errors: [{ region: 'UNKNOWN', message: String(runResult.reason) }] });

    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const connectionLabel = useMemo(() => {
    if (loading) return 'SPRAWDZANIE';
    return status?.connected ? 'POŁĄCZONO' : 'NIEPOŁĄCZONE';
  }, [loading, status]);

  const workspaceService = run.services.find((service) => service.name === 'osa-cloud-workspace');
  const healthyRunServices = run.services.filter((service) => Boolean(service.latestReadyRevision)).length;
  const systemHealthy = Boolean(status?.connected) && !vmError && run.errors.length === 0;

  return (
    <main className="workspaceShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="osaMark">OSA</div>
          <div>
            <div className="brandName">OSA Cloud</div>
            <div className="brandSub">Workspace</div>
          </div>
        </div>

        <nav className="navList" aria-label="Główna nawigacja">
          {menu.map((item) => (
            <button key={item.id} className={section === item.id ? 'navItem active' : 'navItem'} onClick={() => setSection(item.id)}>
              <span className="navIcon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button className={section === 'advanced' ? 'advanced active' : 'advanced'} onClick={() => setSection('advanced')}>
          <span className="navIcon">⚙</span>
          <span>Zaawansowane</span>
        </button>
      </aside>

      <section className="workspaceMain">
        <header className="topbar">
          <div>
            <div className="eyebrow">OSA CLOUD WORKSPACE</div>
            <h1>Konsola</h1>
          </div>
          <div className="topbarStatus">
            <span className={status?.connected ? 'statusDot ok' : 'statusDot'} />
            <div>
              <strong>{connectionLabel}</strong>
              <span>{status?.projectId ?? 'Projekt UNKNOWN'}</span>
            </div>
          </div>
        </header>

        <div className="pageWrap">
          {status?.error && <div className="alert"><strong>Połączenie GCP:</strong> {status.error}</div>}

          {section === 'pulpit' && (
            <div className="dashboard">
              <section className="welcomeRow">
                <div>
                  <h2>Dzień dobry.</h2>
                  <p>Oto stan Twojej infrastruktury Google Cloud.</p>
                </div>
                <div className={systemHealthy ? 'systemBadge healthy' : 'systemBadge'}>
                  <span className="statusDot ok" />
                  <div>
                    <strong>{systemHealthy ? 'Połączenie działa' : 'Wymaga uwagi'}</strong>
                    <span>{loading ? 'Trwa odczyt danych' : 'Dane pochodzą z aktywnych API GCP'}</span>
                  </div>
                </div>
              </section>

              <section className="metricGrid">
                <MetricCard icon="⬡" value={run.errors.length ? 'UNKNOWN' : run.services.length} label="Usługi Cloud Run" meta={`${healthyRunServices}/${run.services.length || 0} z gotową rewizją`} />
                <MetricCard icon="▣" value={vmError ? 'UNKNOWN' : vms.length} label="Maszyny VM" meta={vms.length ? 'Compute Engine' : 'Brak wykrytych VM'} />
                <MetricCard icon="◎" value={status?.regions.length ?? 0} label="Regiony obserwowane" meta={status?.regions.join(' · ') || 'Brak konfiguracji'} />
                <MetricCard icon="✦" value={status?.connected ? 'ADC' : 'UNKNOWN'} label="Tożsamość backendu" meta={status?.connected ? 'ADC' : 'Brak potwierdzenia'} />
              </section>

              <section className="glassPanel identityPanel">
                <div className="panelHeading">
                  <div>
                    <div className="eyebrow">TOŻSAMOŚĆ GCP</div>
                    <h3>Połączenie z Google Cloud</h3>
                  </div>
                  <span className={status?.connected ? 'pill ok' : 'pill'}>{connectionLabel}</span>
                </div>
                <div className="identityRows">
                  <KeyValue label="Projekt" value={status?.projectId ?? 'UNKNOWN'} />
                  <KeyValue label="Uwierzytelnianie" value={status?.connected ? 'ADC' : 'UNKNOWN'} />
                  <KeyValue label="Regiony Cloud Run" value={status?.regions.join(', ') || 'UNKNOWN'} />
                  <KeyValue label="Aktualna rewizja Workspace" value={workspaceService?.latestReadyRevision ?? 'UNKNOWN'} />
                </div>
              </section>

              <section className="projectSection">
                <div className="sectionTitleRow">
                  <div>
                    <div className="eyebrow">ZASOBY</div>
                    <h3>Projekt GCP</h3>
                  </div>
                  <button className="secondaryButton" onClick={() => void refresh()} disabled={loading}>{loading ? 'Odświeżanie…' : 'Odśwież dane'}</button>
                </div>

                <article className="projectCard">
                  <div className="projectIcon">G</div>
                  <div className="projectInfo">
                    <strong>{status?.projectId ?? 'UNKNOWN'}</strong>
                    <span>Google Cloud Project</span>
                  </div>
                  <div className="projectStats">
                    <div><strong>{run.errors.length ? 'UNKNOWN' : run.services.length}</strong><span>Cloud Run</span></div>
                    <div><strong>{vmError ? 'UNKNOWN' : vms.length}</strong><span>VM</span></div>
                    <div><strong>{workspaceService?.region ?? 'UNKNOWN'}</strong><span>Workspace</span></div>
                  </div>
                  <span className={status?.connected ? 'pill ok' : 'pill'}>{status?.connected ? 'AKTYWNY' : 'UNKNOWN'}</span>
                </article>
              </section>

              <section className="bottomGrid">
                <article className="glassPanel compactPanel">
                  <div className="compactIcon">⇧</div>
                  <div>
                    <div className="eyebrow">OSTATNIA REWIZJA</div>
                    <strong>{workspaceService?.latestReadyRevision ?? 'UNKNOWN'}</strong>
                    <span>{workspaceService ? `${workspaceService.region} · Cloud Run` : 'Brak danych o usłudze Workspace'}</span>
                  </div>
                </article>
                <article className="glassPanel compactPanel">
                  <div className="compactIcon">⌁</div>
                  <div>
                    <div className="eyebrow">PIPELINE</div>
                    <strong>GitHub → Cloud Build → Artifact Registry → Cloud Run</strong>
                    <span>Aktualny fundament wdrożeniowy</span>
                  </div>
                </article>
              </section>
            </div>
          )}

          {section === 'aplikacje' && (
            <ResourcePanel eyebrow="CLOUD RUN API" title="Aplikacje" badge={run.errors.length ? 'UNKNOWN' : `${run.services.length} usług`}>
              {run.errors.map((error) => <div className="alert" key={`${error.region}-${error.message}`}><strong>{error.region}:</strong> {error.message}</div>)}
              {!run.errors.length && run.services.length === 0 && <p className="empty">API odpowiedziało poprawnie, ale nie znaleziono usług Cloud Run.</p>}
              <div className="resourceRows">
                {run.services.map((service) => {
                  const protectedApr = service.name === 'agent-service';
                  return (
                    <article key={`${service.region}-${service.name}`} className="resourceRow">
                      <div className="resourcePrimary">
                        <div className="resourceIcon">⬡</div>
                        <div>
                          <strong>{service.name}</strong>
                          <span>{service.region} · {service.latestReadyRevision ?? 'rewizja UNKNOWN'}</span>
                        </div>
                      </div>
                      <div className="resourceActions">
                        {protectedApr && <span className="pill protected">APR · TYLKO ODCZYT</span>}
                        {!protectedApr && <span className={service.latestReadyRevision ? 'pill ok' : 'pill'}>{service.latestReadyRevision ? 'GOTOWY' : 'UNKNOWN'}</span>}
                        {service.uri && !protectedApr ? <a href={service.uri} target="_blank" rel="noreferrer">URI ↗</a> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </ResourcePanel>
          )}

          {section === 'vps' && (
            <ResourcePanel eyebrow="COMPUTE ENGINE API" title="Mój VPS" badge={vmError ? 'UNKNOWN' : `${vms.length} VM`}>
              {vmError && <div className="alert">{vmError}</div>}
              {!vmError && vms.length === 0 && <p className="empty">API działa poprawnie. W projekcie nie znaleziono obecnie żadnych maszyn VM.</p>}
              <div className="resourceRows">
                {vms.map((vm) => (
                  <article key={vm.id} className="resourceRow">
                    <div className="resourcePrimary">
                      <div className="resourceIcon">▣</div>
                      <div><strong>{vm.name}</strong><span>{vm.zone} · {vm.machineType}</span></div>
                    </div>
                    <div className="resourceActions"><span className="pill">{vm.status}</span><span>{vm.externalIp ?? vm.internalIp ?? 'bez IP'}</span></div>
                  </article>
                ))}
              </div>
            </ResourcePanel>
          )}

          {section === 'strony' && <TruthPanel title="Strony WWW" text="Moduł domen, hostingu i publicznych endpointów czeka na podłączenie do realnych API. Brak evidence = UNKNOWN." />}
          {section === 'wdrozenia' && <TruthPanel title="Wdrożenia" text="Historia Cloud Build i rewizji Cloud Run nie jest jeszcze pobierana przez backend. Obecny deploy działa, ale ten ekran pozostaje UNKNOWN do czasu adaptera." />}
          {section === 'github' && <TruthPanel title="GitHub → GCP" text="Pipeline działa: kod z repo buduje obraz, trafia do Artifact Registry i jest wdrażany do Cloud Run. Następny krok to widok historii i sterowanie wdrożeniami." />}
          {section === 'automatyzacje' && <TruthPanel title="Automatyzacje" text="Scheduler, Pub/Sub i Workflows nie są jeszcze podłączone do Workspace." />}
          {section === 'ai' && <TruthPanel title="AI" text="Warstwa Vertex AI / Gemini nie jest jeszcze podłączona do tego interfejsu." />}
          {section === 'storage' && <TruthPanel title="Pamięć / Storage" text="Cloud Storage i warstwa pamięci aplikacji nie mają jeszcze adaptera inventory w Workspace." />}
          {section === 'koszty' && <TruthPanel title="Koszty" text="Billing API i budżety nie są jeszcze podłączone. Nie pokazujemy szacunków bez danych." />}
          {section === 'advanced' && <TruthPanel title="Zaawansowane" text="Tu wejdą IAM, Secret Manager, Pub/Sub, Workflows, Artifact Registry, bazy danych, logi i pozostałe API. Funkcje będą odkrywane stopniowo bez ukrywania realnych możliwości GCP." />}
        </div>
      </section>
    </main>
  );
}

function MetricCard({ icon, value, label, meta }: { icon: string; value: string | number; label: string; meta: string }) {
  return (
    <article className="metricCard">
      <div className="metricIcon">{icon}</div>
      <div className="metricValue">{value}</div>
      <strong>{label}</strong>
      <span>{meta}</span>
    </article>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return <div className="keyValue"><span>{label}</span><strong>{value}</strong></div>;
}

function ResourcePanel({ eyebrow, title, badge, children }: { eyebrow: string; title: string; badge: string; children: React.ReactNode }) {
  return (
    <section className="glassPanel resourcePanel">
      <div className="panelHeading">
        <div><div className="eyebrow">{eyebrow}</div><h2 className="sectionHeading">{title}</h2></div>
        <span className="pill">{badge}</span>
      </div>
      {children}
    </section>
  );
}

function TruthPanel({ title, text }: { title: string; text: string }) {
  return (
    <section className="glassPanel resourcePanel">
      <div className="panelHeading"><div><div className="eyebrow">STATUS: NIEZAIMPLEMENTOWANE</div><h2 className="sectionHeading">{title}</h2></div><span className="pill">UNKNOWN</span></div>
      <p className="empty">{text}</p>
    </section>
  );
}
