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

type Section = 'pulpit' | 'aplikacje' | 'strony' | 'vps' | 'wdrozenia' | 'advanced';

const menu: Array<{ id: Section; label: string }> = [
  { id: 'pulpit', label: 'Pulpit' },
  { id: 'aplikacje', label: 'Aplikacje' },
  { id: 'strony', label: 'Strony WWW' },
  { id: 'vps', label: 'Mój VPS' },
  { id: 'wdrozenia', label: 'Wdrożenia' },
  { id: 'advanced', label: 'Zaawansowane' },
];

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  return (await response.json()) as T;
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

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">OSA <span>CLOUD WORKSPACE</span></div>
        <div className="projectBox">
          <small>PROJEKT GCP</small>
          <strong>{status?.projectId ?? 'UNKNOWN'}</strong>
          <span className={status?.connected ? 'pill ok' : 'pill'}>{connectionLabel}</span>
        </div>
        <nav>
          {menu.map((item) => (
            <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <button className="refresh" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Odświeżanie…' : 'Odśwież dane'}
        </button>
      </aside>

      <section className="content">
        <header>
          <div>
            <small>TOŻSAMOŚĆ BACKENDU: ADC</small>
            <h1>{menu.find((item) => item.id === section)?.label}</h1>
          </div>
          <span className={status?.connected ? 'pill ok' : 'pill'}>{connectionLabel}</span>
        </header>

        {status?.error && <div className="alert"><strong>Połączenie GCP:</strong> {status.error}</div>}

        {section === 'pulpit' && (
          <div className="stack">
            <section className="hero">
              <small>OSA CONTROL PLANE</small>
              <h2>Jedna sterownia. Tylko to, czego naprawdę używasz.</h2>
              <p>Ten ekran nie pokazuje danych demonstracyjnych. Wszystko poniżej pochodzi z API Google Cloud albo ma status UNKNOWN.</p>
            </section>

            <div className="cards">
              <article><small>VM</small><strong>{vmError ? 'UNKNOWN' : vms.length}</strong><span>Compute Engine</span></article>
              <article><small>CLOUD RUN</small><strong>{run.errors.length ? 'UNKNOWN' : run.services.length}</strong><span>Usługi w skonfigurowanych regionach</span></article>
              <article><small>REGIONY RUN</small><strong>{status?.regions.length ?? 0}</strong><span>{status?.regions.join(', ') || 'Brak GCP_REGIONS'}</span></article>
            </div>

            <section className="panel">
              <div className="panelTitle"><div><small>ŚCIEŻKA</small><h3>GitHub → Google Cloud</h3></div></div>
              <div className="pipeline"><span>GitHub</span><b>→</b><span>Cloud Build</span><b>→</b><span>Artifact Registry</span><b>→</b><span>Cloud Run</span></div>
            </section>
          </div>
        )}

        {section === 'vps' && (
          <section className="panel">
            <div className="panelTitle"><div><small>COMPUTE ENGINE API</small><h3>Maszyny wirtualne</h3></div><span>{vmError ? 'UNKNOWN' : `${vms.length} VM`}</span></div>
            {vmError && <div className="alert">{vmError}</div>}
            {!vmError && vms.length === 0 && <p className="empty">API odpowiedziało poprawnie, ale nie znaleziono VM.</p>}
            <div className="rows">
              {vms.map((vm) => (
                <article key={vm.id} className="row">
                  <div><strong>{vm.name}</strong><span>{vm.zone} · {vm.machineType}</span></div>
                  <div className="right"><strong>{vm.status}</strong><span>{vm.externalIp ?? vm.internalIp ?? 'bez IP'}</span></div>
                </article>
              ))}
            </div>
          </section>
        )}

        {section === 'aplikacje' && (
          <section className="panel">
            <div className="panelTitle"><div><small>CLOUD RUN API</small><h3>Aplikacje</h3></div><span>{run.errors.length ? 'UNKNOWN' : `${run.services.length} usług`}</span></div>
            {run.errors.map((error) => <div className="alert" key={`${error.region}-${error.message}`}><strong>{error.region}:</strong> {error.message}</div>)}
            {!run.errors.length && run.services.length === 0 && <p className="empty">API odpowiedziało poprawnie, ale nie znaleziono usług Cloud Run w skonfigurowanych regionach.</p>}
            <div className="rows">
              {run.services.map((service) => (
                <article key={`${service.region}-${service.name}`} className="row">
                  <div><strong>{service.name}</strong><span>{service.region} · rev: {service.latestReadyRevision ?? 'UNKNOWN'}</span></div>
                  <div className="right"><strong>Cloud Run</strong>{service.uri ? <a href={service.uri} target="_blank" rel="noreferrer">Otwórz</a> : <span>URI UNKNOWN</span>}</div>
                </article>
              ))}
            </div>
          </section>
        )}

        {section === 'strony' && <TruthPanel title="Strony WWW" text="Moduł domen, hostingu i endpointów publicznych. Integracja Cloud DNS / Firebase / Cloud Run zostanie dodana po pierwszym działającym discovery." />}
        {section === 'wdrozenia' && <TruthPanel title="Wdrożenia" text="Historia buildów i rewizji nie jest jeszcze podłączona. Następny adapter: Cloud Build + Cloud Run revisions." />}
        {section === 'advanced' && <TruthPanel title="Zaawansowane" text="Tu wejdą IAM, Secret Manager, Pub/Sub, Workflows, Artifact Registry, SQL i pozostałe API. Na razie brak evidence = UNKNOWN." />}
      </section>
    </main>
  );
}

function TruthPanel({ title, text }: { title: string; text: string }) {
  return <section className="panel"><div className="panelTitle"><div><small>STATUS: NIEZAIMPLEMENTOWANE</small><h3>{title}</h3></div></div><p className="empty">{text}</p></section>;
}
