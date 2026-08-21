'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  CloudBuildSummary,
  CloudRunServiceSummary,
  DeploymentInventoryItem,
  ProvenanceReason,
} from '@/lib/provenance';

type Status = {
  connected: boolean;
  projectId: string | null;
  identity: 'ADC';
  principal: string | null;
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

type InventoryError = {
  source: 'identity' | 'cloud-build' | 'cloud-run-service' | 'cloud-run-revision' | 'artifact-registry';
  scope: string;
  resource: string | null;
  message: string;
};

type InventoryResult = {
  deployments: DeploymentInventoryItem[];
  services: CloudRunServiceSummary[];
  builds: CloudBuildSummary[];
  artifacts: Array<{ uri: string; digest: string }>;
  errors: InventoryError[];
  scope: { builds: 'global'; regions: string[] };
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
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function Home() {
  const [section, setSection] = useState<Section>('pulpit');
  const [status, setStatus] = useState<Status | null>(null);
  const [vms, setVms] = useState<Vm[]>([]);
  const [vmError, setVmError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryResult | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [statusResult, vmResult, inventoryResult] = await Promise.allSettled([
      readJson<Status>('/api/gcp/status'),
      readJson<{ vms: Vm[]; error?: string }>('/api/gcp/vms'),
      readJson<InventoryResult>('/api/gcp/deployments'),
    ]);

    if (statusResult.status === 'fulfilled') setStatus(statusResult.value);
    else {
      setStatus({
        connected: false,
        projectId: null,
        identity: 'ADC',
        principal: null,
        regions: [],
        error: message(statusResult.reason),
      });
    }

    if (vmResult.status === 'fulfilled') {
      setVms(vmResult.value.vms ?? []);
      setVmError(vmResult.value.error ?? null);
    } else {
      setVms([]);
      setVmError(message(vmResult.reason));
    }

    if (inventoryResult.status === 'fulfilled') {
      setInventory(inventoryResult.value);
      setInventoryError(null);
    } else {
      setInventory(null);
      setInventoryError(message(inventoryResult.reason));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connectionLabel = loading && !status ? 'SPRAWDZANIE' : status?.connected ? 'POŁĄCZONO' : 'NIEPOŁĄCZONE';

  const services = inventory?.services ?? [];
  const builds = inventory?.builds ?? [];
  const deployments = inventory?.deployments ?? [];
  const inventoryErrors = inventory?.errors ?? [];
  const runErrors = inventoryErrors.filter((error) => error.source.startsWith('cloud-run'));
  const buildErrors = inventoryErrors.filter((error) => error.source === 'cloud-build');
  const artifactErrors = inventoryErrors.filter((error) => error.source === 'artifact-registry');
  const verifiedDeployments = deployments.filter((deployment) => deployment.provenance === 'VERIFIED').length;
  const workspaceService = services.find((service) => service.name === 'osa-cloud-workspace');
  const hasPartialEvidence = Boolean(inventory) && inventoryErrors.length > 0 && (
    services.length > 0 || builds.length > 0 || deployments.length > 0
  );
  const systemHealthy = Boolean(status?.connected) && !vmError && !inventoryError && inventoryErrors.length === 0;

  return (
    <main className="workspaceShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="osaMark">OSA</div>
          <div>
            <div className="brandName">OSA Cloud</div>
            <div className="brandSub">Workspace · read-only</div>
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
            <h1>Mobilna sterownia</h1>
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
          {loading && <div className="loadingStrip" role="status">Odczytuję GitHub → Cloud Build → Artifact Registry → Cloud Run…</div>}
          {status?.error && <div className="alert"><strong>Połączenie GCP:</strong> {status.error}</div>}

          {section === 'pulpit' && (
            <div className="dashboard">
              <section className="welcomeRow">
                <div>
                  <h2>Stan bez zgadywania.</h2>
                  <p>Brak deterministycznego dowodu zawsze pozostaje jako UNKNOWN.</p>
                </div>
                <div className={systemHealthy ? 'systemBadge healthy' : 'systemBadge'}>
                  <span className={systemHealthy ? 'statusDot ok' : 'statusDot'} />
                  <div>
                    <strong>{systemHealthy ? 'Pełny odczyt' : hasPartialEvidence ? 'Odczyt częściowy' : 'Wymaga uwagi'}</strong>
                    <span>{loading ? 'Trwa pobieranie danych' : hasPartialEvidence ? 'Część regionów lub API zwróciła błąd' : 'Dane wyłącznie z aktywnych API'}</span>
                  </div>
                </div>
              </section>

              <section className="metricGrid">
                <MetricCard
                  icon="⬡"
                  value={inventory ? services.length : 'UNKNOWN'}
                  label="Usługi Cloud Run"
                  meta={runErrors.length ? `PARTIAL · ${runErrors.length} błędów odczytu` : `${services.filter((service) => service.latestReadyRevision).length} z gotową rewizją`}
                />
                <MetricCard icon="▣" value={vmError ? 'UNKNOWN' : vms.length} label="Maszyny VM" meta={vmError ? 'Błąd Compute Engine API' : 'Tylko odczyt'} />
                <MetricCard
                  icon="⇧"
                  value={inventory ? builds.length : 'UNKNOWN'}
                  label="Cloud Build"
                  meta={buildErrors.length ? 'Odczyt UNKNOWN' : 'Zakres globalny'}
                />
                <MetricCard
                  icon="⌁"
                  value={inventory ? `${verifiedDeployments}/${deployments.length}` : 'UNKNOWN'}
                  label="Provenance VERIFIED"
                  meta="Digest → build → SHA"
                />
              </section>

              <section className="glassPanel identityPanel">
                <div className="panelHeading">
                  <div>
                    <div className="eyebrow">TOŻSAMOŚĆ GCP</div>
                    <h3>Application Default Credentials</h3>
                  </div>
                  <span className={status?.connected ? 'pill ok' : 'pill'}>{connectionLabel}</span>
                </div>
                <div className="identityRows">
                  <KeyValue label="Projekt" value={status?.projectId ?? 'UNKNOWN'} />
                  <KeyValue label="Principal" value={status?.principal ?? 'UNKNOWN'} />
                  <KeyValue label="Regiony Cloud Run" value={status?.regions.join(', ') || 'UNKNOWN'} />
                  <KeyValue label="Rewizja Workspace" value={workspaceService?.latestReadyRevision ?? 'UNKNOWN'} />
                </div>
              </section>

              <section className="projectSection">
                <div className="sectionTitleRow">
                  <div>
                    <div className="eyebrow">READ-ONLY CONTROL DESK</div>
                    <h3>{status?.projectId ?? 'Projekt UNKNOWN'}</h3>
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
                    <div><strong>{inventory?.artifacts.length ?? 'UNKNOWN'}</strong><span>obrazy AR</span></div>
                    <div><strong>{inventory ? services.length : 'UNKNOWN'}</strong><span>Cloud Run</span></div>
                    <div><strong>{vmError ? 'UNKNOWN' : vms.length}</strong><span>VM</span></div>
                  </div>
                  <span className="pill protected">TYLKO ODCZYT</span>
                </article>
              </section>

              <section className="bottomGrid">
                <article className="glassPanel compactPanel">
                  <div className="compactIcon">⇧</div>
                  <div>
                    <div className="eyebrow">LATEST READY REVISION</div>
                    <strong>{workspaceService?.latestReadyRevision ?? 'UNKNOWN'}</strong>
                    <span>{workspaceService ? `${workspaceService.region} · Cloud Run` : 'Brak potwierdzonego odczytu usługi'}</span>
                  </div>
                </article>
                <article className="glassPanel compactPanel">
                  <div className="compactIcon">⌁</div>
                  <div>
                    <div className="eyebrow">ŁAŃCUCH DOWODOWY</div>
                    <strong>SHA → build ID → digest → rewizja → URL</strong>
                    <span>Bez joinu po czasie</span>
                  </div>
                </article>
              </section>
            </div>
          )}

          {section === 'aplikacje' && (
            <ResourcePanel eyebrow="CLOUD RUN API V2" title="Aplikacje" badge={inventory ? `${services.length} usług` : 'UNKNOWN'}>
              {inventoryError && <div className="alert"><strong>Deployment Inventory:</strong> {inventoryError}</div>}
              {runErrors.map((error) => <InventoryAlert error={error} key={errorKey(error)} />)}
              {inventory && services.length === 0 && <p className="empty">API odpowiedziało bez listy usług. Sprawdź skonfigurowane regiony.</p>}
              <div className="resourceRows">
                {services.map((service) => (
                  <article key={`${service.region}-${service.name}`} className="resourceRow">
                    <div className="resourcePrimary">
                      <div className="resourceIcon">⬡</div>
                      <div>
                        <strong>{service.name}</strong>
                        <span>{service.region} · {service.latestReadyRevision ?? 'rewizja UNKNOWN'}</span>
                        <span className="monoLine">{service.revisionImage ?? 'image UNKNOWN'}</span>
                      </div>
                    </div>
                    <div className="resourceActions">
                      <span className={service.latestReadyRevision ? 'pill ok' : 'pill'}>{service.latestReadyRevision ? 'READY' : 'UNKNOWN'}</span>
                      {service.uri ? <a href={service.uri} target="_blank" rel="noreferrer">Endpoint ↗</a> : <span>URL UNKNOWN</span>}
                    </div>
                  </article>
                ))}
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
                    <div className="resourceActions"><span className="pill">{vm.status}</span><span>{vm.externalIp ?? vm.internalIp ?? 'IP UNKNOWN'}</span></div>
                  </article>
                ))}
              </div>
            </ResourcePanel>
          )}

          {section === 'strony' && <TruthPanel title="Strony WWW" text="Moduł domen i hostingu nie jest podłączony do realnych API. Brak evidence = UNKNOWN." />}

          {section === 'wdrozenia' && (
            <div className="dashboard">
              <ResourcePanel
                eyebrow="DETERMINISTYCZNY DEPLOYMENT INVENTORY"
                title="GitHub → GCP"
                badge={inventory ? `${verifiedDeployments}/${deployments.length} VERIFIED` : 'UNKNOWN'}
              >
                {inventoryError && <div className="alert"><strong>Deployment Inventory:</strong> {inventoryError}</div>}
                {inventoryErrors.map((error) => <InventoryAlert error={error} key={errorKey(error)} />)}
                {inventory && deployments.length === 0 && <p className="empty">Nie znaleziono usług Cloud Run możliwych do zmapowania. Provenance pozostaje UNKNOWN.</p>}
                <div className="deploymentList">
                  {deployments.map((deployment) => <DeploymentCard deployment={deployment} key={`${deployment.region}/${deployment.service}`} />)}
                </div>
              </ResourcePanel>

              <ResourcePanel eyebrow="CLOUD BUILD API · GLOBAL" title="Build evidence" badge={inventory ? `${builds.length} buildów` : 'UNKNOWN'}>
                {buildErrors.map((error) => <InventoryAlert error={error} key={errorKey(error)} />)}
                {inventory && builds.length === 0 && <p className="empty">Cloud Build API nie zwróciło buildów z obrazami.</p>}
                <div className="resourceRows">
                  {builds.map((build) => (
                    <article key={build.id} className="resourceRow buildRow">
                      <div className="resourcePrimary">
                        <div className="resourceIcon">⇧</div>
                        <div>
                          <strong>{build.serviceName ?? 'Service UNKNOWN'} · {build.id}</strong>
                          <span>SHA: {build.commitSha ?? 'UNKNOWN'} · źródło: {build.commitShaOrigin}</span>
                          <span>Utworzono: {formatBuildTime(build.createTime)}</span>
                          <span className="monoLine">Digest: {build.resultImages[0]?.digest ?? 'UNKNOWN'}</span>
                        </div>
                      </div>
                      <div className="resourceActions">
                        <BuildStatusPill status={build.status} />
                        {build.logUrl && <a href={build.logUrl} target="_blank" rel="noreferrer">Logi ↗</a>}
                      </div>
                    </article>
                  ))}
                </div>
              </ResourcePanel>
            </div>
          )}

          {section === 'github' && (
            <ResourcePanel eyebrow="SOURCE OF TRUTH" title="GitHub source" badge={inventory ? `${deployments.length} usług` : 'UNKNOWN'}>
              <p className="empty compactEmpty">Link do commitu pojawia się wyłącznie wtedy, gdy SHA pochodzi z jawnych pól Cloud Build i build został jednoznacznie połączony z digestem live rewizji.</p>
              <div className="resourceRows">
                {deployments.map((deployment) => (
                  <article className="resourceRow" key={`source-${deployment.region}-${deployment.service}`}>
                    <div className="resourcePrimary">
                      <div className="resourceIcon">⌁</div>
                      <div>
                        <strong>{deployment.service}</strong>
                        <span>SHA: {deployment.sourceSha ?? 'UNKNOWN'} · {deployment.sourceShaOrigin}</span>
                      </div>
                    </div>
                    <div className="resourceActions">
                      <span className={deployment.sourceUrl ? 'pill ok' : 'pill'}>{deployment.sourceUrl ? 'LINKED' : 'UNKNOWN'}</span>
                      {deployment.sourceUrl && <a href={deployment.sourceUrl} target="_blank" rel="noreferrer">Commit ↗</a>}
                    </div>
                  </article>
                ))}
              </div>
            </ResourcePanel>
          )}

          {section === 'automatyzacje' && <TruthPanel title="Automatyzacje" text="Scheduler, Pub/Sub i Workflows nie są jeszcze podłączone do Workspace." />}
          {section === 'ai' && <TruthPanel title="AI" text="Warstwa Vertex AI / Gemini nie jest jeszcze podłączona do tego interfejsu." />}
          {section === 'storage' && <TruthPanel title="Pamięć / Storage" text="Cloud Storage nie ma jeszcze adaptera inventory w Workspace." />}
          {section === 'koszty' && <TruthPanel title="Koszty" text="Billing API i budżety nie są jeszcze podłączone. Nie pokazujemy szacunków bez danych." />}
          {section === 'advanced' && (
            <ResourcePanel eyebrow="READ-ONLY API COVERAGE" title="Zaawansowane" badge={artifactErrors.length ? 'PARTIAL' : 'AKTYWNE'}>
              {artifactErrors.map((error) => <InventoryAlert error={error} key={errorKey(error)} />)}
              <div className="identityRows">
                <KeyValue label="Artifact Registry images" value={inventory ? String(inventory.artifacts.length) : 'UNKNOWN'} />
                <KeyValue label="Cloud Build scope" value={inventory?.scope.builds ?? 'UNKNOWN'} />
                <KeyValue label="Cloud Run regions" value={inventory?.scope.regions.join(', ') || 'UNKNOWN'} />
                <KeyValue label="Mutacje infrastruktury" value="WYŁĄCZONE" />
              </div>
            </ResourcePanel>
          )}
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

function formatBuildTime(value: string | null): string {
  if (!value) return 'UNKNOWN';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pl-PL');
}

function BuildStatusPill({ status }: { status: string }) {
  const failureStatuses = new Set(['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED']);
  const workingStatuses = new Set(['QUEUED', 'PENDING', 'WORKING']);

  if (status === 'SUCCESS') return <span className="pill ok">{status}</span>;
  if (failureStatuses.has(status)) return <span className="pill failed">{status}</span>;
  if (workingStatuses.has(status)) return <span className="pill protected">{status}</span>;
  return <span className="pill">{status || 'UNKNOWN'}</span>;
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

function InventoryAlert({ error }: { error: InventoryError }) {
  return (
    <div className="alert">
      <strong>{error.source} · {error.scope}{error.resource ? ` · ${error.resource}` : ''}:</strong> {error.message}
    </div>
  );
}

function errorKey(error: InventoryError): string {
  return `${error.source}/${error.scope}/${error.resource ?? ''}/${error.message}`;
}

const reasonLabels: Record<ProvenanceReason, string> = {
  NO_LATEST_READY_REVISION: 'brak latest ready revision',
  NO_REVISION_IMAGE_DIGEST: 'rewizja nie ujawnia immutable digestu',
  ARTIFACT_DIGEST_NOT_FOUND: 'digest niepotwierdzony w Artifact Registry',
  BUILD_DIGEST_NOT_FOUND: 'brak Cloud Build z tym digestem',
  BUILD_DIGEST_AMBIGUOUS: 'więcej niż jeden build pasuje do digestu',
  SOURCE_SHA_MISSING: 'build nie ujawnia source SHA',
  LIVE_URL_MISSING: 'brak live URL',
};

function DeploymentCard({ deployment }: { deployment: DeploymentInventoryItem }) {
  return (
    <article className="deploymentCard">
      <div className="deploymentHeader">
        <div>
          <div className="eyebrow">{deployment.region}</div>
          <h3>{deployment.service}</h3>
        </div>
        <span className={deployment.provenance === 'VERIFIED' ? 'pill ok' : 'pill'}>{deployment.provenance}</span>
      </div>
      <div className="provenanceChain">
        <EvidenceCell label="GitHub SHA" value={deployment.sourceSha} href={deployment.sourceUrl} />
        <EvidenceCell label="Cloud Build" value={deployment.buildId} href={deployment.buildLogUrl} />
        <EvidenceCell label="AR digest" value={deployment.digest} />
        <EvidenceCell label="Cloud Run revision" value={deployment.revision} />
        <EvidenceCell label="Live endpoint" value={deployment.url} href={deployment.url} />
      </div>
      <div className="artifactEvidence">
        <span>Artifact Registry</span>
        <strong>{deployment.artifactUri ?? 'UNKNOWN'}</strong>
      </div>
      {deployment.reasons.length > 0 && (
        <div className="unknownReasons">
          {deployment.reasons.map((reason) => <span key={reason}>UNKNOWN · {reasonLabels[reason]}</span>)}
        </div>
      )}
    </article>
  );
}

function EvidenceCell({ label, value, href }: { label: string; value: string | null; href?: string | null }) {
  const content = value ?? 'UNKNOWN';
  return (
    <div className={value ? 'evidenceCell verified' : 'evidenceCell'}>
      <span>{label}</span>
      {href && value
        ? <a href={href} target="_blank" rel="noreferrer">{content} ↗</a>
        : <strong>{content}</strong>}
    </div>
  );
}
