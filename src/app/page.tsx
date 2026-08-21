'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
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

const deskLinks = [
  { href: '#services', icon: '⬡', label: 'Usługi' },
  { href: '#vms', icon: '▣', label: 'VM' },
  { href: '#builds', icon: '⇧', label: 'Buildy' },
  { href: '#evidence', icon: '⌁', label: 'Dowody' },
];

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const data = (await response.json()) as T;
  if (!response.ok) {
    const error = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `HTTP ${response.status}`;
    throw new Error(error);
  }
  return data;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function Home() {
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
        error: errorMessage(statusResult.reason),
      });
    }

    if (vmResult.status === 'fulfilled') {
      setVms(vmResult.value.vms ?? []);
      setVmError(vmResult.value.error ?? null);
    } else {
      setVms([]);
      setVmError(errorMessage(vmResult.reason));
    }

    if (inventoryResult.status === 'fulfilled') {
      setInventory(inventoryResult.value);
      setInventoryError(null);
    } else {
      setInventory(null);
      setInventoryError(errorMessage(inventoryResult.reason));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const services = inventory?.services ?? [];
  const builds = inventory?.builds ?? [];
  const deployments = inventory?.deployments ?? [];
  const inventoryErrors = inventory?.errors ?? [];
  const runErrors = inventoryErrors.filter((error) => error.source.startsWith('cloud-run'));
  const buildErrors = inventoryErrors.filter((error) => error.source === 'cloud-build');
  const artifactErrors = inventoryErrors.filter((error) => error.source === 'artifact-registry');
  const verifiedDeployments = deployments.filter((deployment) => deployment.provenance === 'VERIFIED').length;
  const hasPartialEvidence = Boolean(inventory) && inventoryErrors.length > 0;
  const vmsKnown = status !== null || vmError !== null;
  const connectionLabel = loading && !status ? 'SPRAWDZANIE' : status?.connected ? 'POŁĄCZONO' : 'NIEPOŁĄCZONE';
  const healthLabel = status?.connected && !vmError && !inventoryError && inventoryErrors.length === 0
    ? 'Pełny odczyt'
    : hasPartialEvidence
      ? 'Odczyt częściowy'
      : 'Wymaga uwagi';

  return (
    <main className="controlDesk">
      <header className="controlHeader">
        <div className="brandBlock">
          <div className="osaMark">OSA</div>
          <div>
            <strong>OSA Cloud Workspace</strong>
            <span>Mobilna sterownia</span>
          </div>
        </div>
        <div className="connectionState" aria-live="polite">
          <span className={status?.connected ? 'statusDot ok' : 'statusDot'} />
          <div>
            <strong>{connectionLabel}</strong>
            <span>{status?.projectId ?? 'Projekt UNKNOWN'}</span>
          </div>
        </div>
      </header>

      <nav className="controlRail" aria-label="Przejdź do zasobów">
        {deskLinks.map((item) => (
          <a href={item.href} key={item.href}>
            <span>{item.icon}</span>
            {item.label}
          </a>
        ))}
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          <span className={loading ? 'spin' : ''}>↻</span>
          {loading ? 'Odświeżam' : 'Odśwież'}
        </button>
      </nav>

      <div className="deskContent">
        {loading && <div className="loadingStrip" role="status">Odczytuję GitHub → Cloud Build → Artifact Registry → Cloud Run…</div>}
        {status?.error && <StateNotice kind="error" title="Połączenie GCP" message={status.error} onRetry={refresh} />}

        <section className="heroPanel" aria-labelledby="desk-title">
          <div>
            <div className="eyebrow">LIVE RESOURCE DESK</div>
            <h1 id="desk-title">Jedno miejsce. Każdy dowód pod ręką.</h1>
            <p>Dotknij zasobu, żeby rozwinąć prawdziwe szczegóły, logi, źródło, rewizję i endpoint. Brak dowodu pozostaje UNKNOWN.</p>
          </div>
          <div className={hasPartialEvidence ? 'healthBadge partial' : status?.connected ? 'healthBadge healthy' : 'healthBadge'}>
            <span className={status?.connected ? 'statusDot ok' : 'statusDot'} />
            <div><strong>{healthLabel}</strong><span>{inventoryErrors.length ? `${inventoryErrors.length} błędów zakresu` : 'Bieżący stan API'}</span></div>
          </div>
        </section>

        <section className="summaryGrid" aria-label="Skrót zasobów">
          <SummaryLink href="#services" icon="⬡" value={inventory ? services.length : 'UNKNOWN'} label="Cloud Run" meta={`${verifiedDeployments}/${deployments.length} VERIFIED`} />
          <SummaryLink href="#vms" icon="▣" value={!vmsKnown || vmError ? 'UNKNOWN' : vms.length} label="Compute VM" meta={vmError ? 'Błąd API' : !vmsKnown ? 'Trwa odczyt' : 'Kliknij po szczegóły'} />
          <SummaryLink href="#builds" icon="⇧" value={inventory ? builds.length : 'UNKNOWN'} label="Cloud Build" meta="Zakres globalny" />
          <SummaryLink href="#evidence" icon="⌁" value={inventory ? inventory.artifacts.length : 'UNKNOWN'} label="Obrazy AR" meta="Immutable digest" />
        </section>

        <section className="deskSection" id="services" aria-labelledby="services-title">
          <SectionHeading eyebrow="CLOUD RUN · DEPLOYMENT INVENTORY" title="Usługi" id="services-title" badge={inventory ? `${services.length} usług` : 'UNKNOWN'} />
          {inventoryError && <StateNotice kind="error" title="Deployment Inventory" message={inventoryError} onRetry={refresh} />}
          {runErrors.map((error) => <InventoryAlert error={error} key={errorKey(error)} />)}
          {loading && !inventory && <StateNotice title="Ładuję usługi" message="Sprawdzam regiony i latest ready revisions." />}
          {inventory && services.length === 0 && <StateNotice title="Brak usług" message="API odpowiedziało poprawnie, ale nie zwróciło usług w skonfigurowanych regionach." onRetry={refresh} />}
          <div className="serviceGrid">
            {services.map((service) => {
              const deployment = deployments.find((item) => item.region === service.region && item.service === service.name) ?? null;
              return (
                <ServiceDisclosure
                  key={`${service.region}/${service.name}`}
                  service={service}
                  deployment={deployment}
                  projectId={status?.projectId ?? null}
                />
              );
            })}
          </div>
        </section>

        <section className="deskSection" id="vms" aria-labelledby="vms-title">
          <SectionHeading eyebrow="COMPUTE ENGINE" title="Maszyny VM" id="vms-title" badge={!vmsKnown || vmError ? 'UNKNOWN' : `${vms.length} VM`} />
          {vmError && <StateNotice kind="error" title="Compute Engine API" message={vmError} onRetry={refresh} />}
          {loading && !status && <StateNotice title="Ładuję maszyny" message="Odczytuję bieżący stan instancji." />}
          {!vmError && !loading && vms.length === 0 && <StateNotice title="Brak maszyn" message="Compute Engine API działa; projekt nie zawiera obecnie instancji VM." onRetry={refresh} />}
          <div className="resourceList">
            {vms.map((vm) => <VmDisclosure vm={vm} projectId={status?.projectId ?? null} key={vm.id} />)}
          </div>
        </section>

        <section className="deskSection" id="builds" aria-labelledby="builds-title">
          <SectionHeading eyebrow="CLOUD BUILD · GLOBAL" title="Buildy" id="builds-title" badge={inventory ? `${builds.length} buildów` : 'UNKNOWN'} />
          {inventoryError && <StateNotice kind="error" title="Cloud Build" message={inventoryError} onRetry={refresh} />}
          {buildErrors.map((error) => <InventoryAlert error={error} key={errorKey(error)} />)}
          {loading && !inventory && <StateNotice title="Ładuję buildy" message="Odczytuję obrazy wynikowe i jawne identyfikatory źródła." />}
          {inventory && builds.length === 0 && <StateNotice title="Brak buildów" message="Cloud Build API nie zwróciło buildów z obrazami wynikowymi." onRetry={refresh} />}
          <div className="resourceList">
            {builds.map((build) => {
              const deployment = deployments.find((item) => item.buildId === build.id) ?? null;
              return <BuildDisclosure build={build} deployment={deployment} projectId={status?.projectId ?? null} key={build.id} />;
            })}
          </div>
        </section>

        <section className="deskSection" id="evidence" aria-labelledby="evidence-title">
          <SectionHeading eyebrow="IDENTITY · ARTIFACT REGISTRY · COVERAGE" title="Dowody i zakres" id="evidence-title" badge={artifactErrors.length ? 'PARTIAL' : inventory ? 'AKTYWNE' : 'UNKNOWN'} />
          {inventoryError && <StateNotice kind="error" title="Artifact Registry i zakres" message={inventoryError} onRetry={refresh} />}
          {artifactErrors.map((error) => <InventoryAlert error={error} key={errorKey(error)} />)}
          {loading && !inventory && <StateNotice title="Ładuję dowody" message="Odczytuję tożsamość, regiony i immutable digesty Artifact Registry." />}
          <div className="identityGrid">
            <KeyValue label="Projekt" value={status?.projectId ?? 'UNKNOWN'} />
            <KeyValue label="Principal ADC" value={status?.principal ?? 'UNKNOWN'} />
            <KeyValue label="Regiony Cloud Run" value={inventory?.scope.regions.join(', ') || status?.regions.join(', ') || 'UNKNOWN'} />
            <KeyValue label="Cloud Build scope" value={inventory?.scope.builds ?? 'UNKNOWN'} />
          </div>
          {inventory && inventory.artifacts.length === 0 && <StateNotice title="Brak obrazów" message="Artifact Registry nie zwrócił obrazów z immutable digestem." onRetry={refresh} />}
          <div className="artifactList">
            {inventory?.artifacts.map((artifact) => (
              <article className="artifactRow" key={`${artifact.uri}@${artifact.digest}`}>
                <div><span>Artifact Registry</span><strong>{artifact.uri}</strong></div>
                <CopyButton value={artifact.digest} label="Kopiuj digest" />
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryLink({ href, icon, value, label, meta }: { href: string; icon: string; value: string | number; label: string; meta: string }) {
  return (
    <a className="summaryCard" href={href}>
      <span className="summaryIcon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{meta}</small>
      <b aria-hidden="true">↓</b>
    </a>
  );
}

function SectionHeading({ eyebrow, title, id, badge }: { eyebrow: string; title: string; id: string; badge: string }) {
  return (
    <div className="sectionHeading">
      <div><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2></div>
      <span className="pill">{badge}</span>
    </div>
  );
}

function ServiceDisclosure({ service, deployment, projectId }: { service: CloudRunServiceSummary; deployment: DeploymentInventoryItem | null; projectId: string | null }) {
  const consoleUrl = projectId
    ? `https://console.cloud.google.com/run/detail/${encodeURIComponent(service.region)}/${encodeURIComponent(service.name)}/revisions?project=${encodeURIComponent(projectId)}`
    : null;

  return (
    <details className="serviceCard">
      <summary>
        <span className="resourceIcon">⬡</span>
        <span className="summaryBody"><strong>{service.name}</strong><small>{service.region} · {service.latestReadyRevision ?? 'rewizja UNKNOWN'}</small></span>
        <span className={deployment?.provenance === 'VERIFIED' ? 'pill ok' : 'pill'}>{deployment?.provenance ?? 'UNKNOWN'}</span>
        <span className="disclosureArrow" aria-hidden="true">⌄</span>
      </summary>
      <div className="disclosureBody">
        <div className="actionRow">
          {service.uri && <ExternalLink href={service.uri}>Otwórz endpoint</ExternalLink>}
          {consoleUrl && <ExternalLink href={consoleUrl}>Cloud Run Console</ExternalLink>}
          {deployment?.sourceUrl && <ExternalLink href={deployment.sourceUrl}>Commit GitHub</ExternalLink>}
          {deployment?.buildLogUrl && <ExternalLink href={deployment.buildLogUrl}>Logi buildu</ExternalLink>}
        </div>
        <div className="detailGrid">
          <KeyValue label="Region" value={service.region} />
          <KeyValue label="Ready revision" value={service.latestReadyRevision ?? 'UNKNOWN'} copy />
          <KeyValue label="Live URL" value={service.uri ?? 'UNKNOWN'} copy={Boolean(service.uri)} />
          <KeyValue label="Revision image" value={service.revisionImage ?? 'UNKNOWN'} copy={Boolean(service.revisionImage)} />
        </div>
        <EvidenceChain deployment={deployment} />
      </div>
    </details>
  );
}

function VmDisclosure({ vm, projectId }: { vm: Vm; projectId: string | null }) {
  const consoleUrl = projectId
    ? `https://console.cloud.google.com/compute/instancesDetail/zones/${encodeURIComponent(vm.zone)}/instances/${encodeURIComponent(vm.name)}?project=${encodeURIComponent(projectId)}`
    : null;
  return (
    <details className="resourceDisclosure">
      <summary>
        <span className="resourceIcon">▣</span>
        <span className="summaryBody"><strong>{vm.name}</strong><small>{vm.zone} · {vm.machineType}</small></span>
        <span className={vm.status === 'RUNNING' ? 'pill ok' : 'pill'}>{vm.status || 'UNKNOWN'}</span>
        <span className="disclosureArrow" aria-hidden="true">⌄</span>
      </summary>
      <div className="disclosureBody">
        <div className="actionRow">{consoleUrl && <ExternalLink href={consoleUrl}>Compute Console</ExternalLink>}</div>
        <div className="detailGrid compact">
          <KeyValue label="Internal IP" value={vm.internalIp ?? 'UNKNOWN'} copy={Boolean(vm.internalIp)} />
          <KeyValue label="External IP" value={vm.externalIp ?? 'UNKNOWN'} copy={Boolean(vm.externalIp)} />
          <KeyValue label="Machine type" value={vm.machineType} copy />
        </div>
      </div>
    </details>
  );
}

function BuildDisclosure({ build, deployment, projectId }: { build: CloudBuildSummary; deployment: DeploymentInventoryItem | null; projectId: string | null }) {
  const consoleUrl = build.logUrl ?? (projectId
    ? `https://console.cloud.google.com/cloud-build/builds/${encodeURIComponent(build.id)}?project=${encodeURIComponent(projectId)}`
    : null);
  return (
    <details className="resourceDisclosure">
      <summary>
        <span className="resourceIcon">⇧</span>
        <span className="summaryBody"><strong>{build.serviceName ?? 'Service UNKNOWN'}</strong><small>{build.id} · {formatBuildTime(build.createTime)}</small></span>
        <BuildStatusPill status={build.status} />
        <span className="disclosureArrow" aria-hidden="true">⌄</span>
      </summary>
      <div className="disclosureBody">
        <div className="actionRow">
          {consoleUrl && <ExternalLink href={consoleUrl}>Build i logi</ExternalLink>}
          {deployment?.sourceUrl && <ExternalLink href={deployment.sourceUrl}>Commit GitHub</ExternalLink>}
        </div>
        <div className="detailGrid compact">
          <KeyValue label="Build ID" value={build.id} copy />
          <KeyValue label={`Source SHA · ${build.commitShaOrigin}`} value={build.commitSha ?? 'UNKNOWN'} copy={Boolean(build.commitSha)} />
          <KeyValue label="Image digest" value={build.resultImages[0]?.digest ?? 'UNKNOWN'} copy={Boolean(build.resultImages[0]?.digest)} />
          <KeyValue label="Status detail" value={build.statusDetail ?? 'UNKNOWN'} />
        </div>
      </div>
    </details>
  );
}

function EvidenceChain({ deployment }: { deployment: DeploymentInventoryItem | null }) {
  return (
    <div className="evidenceBlock">
      <div className="evidenceTitle"><span>Deterministyczny łańcuch</span><strong>{deployment?.provenance ?? 'UNKNOWN'}</strong></div>
      <div className="provenanceChain">
        <EvidenceCell label="Source SHA" value={deployment?.sourceSha ?? null} href={deployment?.sourceUrl} />
        <EvidenceCell label="Build ID" value={deployment?.buildId ?? null} href={deployment?.buildLogUrl} />
        <EvidenceCell label="AR digest" value={deployment?.digest ?? null} />
        <EvidenceCell label="Ready revision" value={deployment?.revision ?? null} />
        <EvidenceCell label="Live URL" value={deployment?.url ?? null} href={deployment?.url} />
      </div>
      {deployment?.artifactUri && <div className="artifactEvidence"><span>Artifact URI</span><CopyButton value={deployment.artifactUri} label="Kopiuj URI" /></div>}
      {deployment && deployment.reasons.length > 0 && (
        <div className="unknownReasons">{deployment.reasons.map((reason) => <span key={reason}>UNKNOWN · {reasonLabels[reason]}</span>)}</div>
      )}
      {!deployment && <div className="unknownReasons"><span>UNKNOWN · brak deterministycznego deployment join</span></div>}
    </div>
  );
}

function EvidenceCell({ label, value, href }: { label: string; value: string | null; href?: string | null }) {
  return (
    <div className={value ? 'evidenceCell verified' : 'evidenceCell'}>
      <span>{label}</span>
      {href && value ? <ExternalLink href={href}>{shortValue(value)}</ExternalLink> : value ? <CopyButton value={value} label={shortValue(value)} /> : <strong>UNKNOWN</strong>}
    </div>
  );
}

function KeyValue({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="keyValue">
      <span>{label}</span>
      {copy && value !== 'UNKNOWN' ? <CopyButton value={value} label={value} /> : <strong>{value}</strong>}
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  return <button className="copyButton" type="button" onClick={() => void copy()} title={value}>{copied ? 'Skopiowano ✓' : label}</button>;
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="externalLink" href={href} target="_blank" rel="noreferrer">{children}<span aria-hidden="true">↗</span></a>;
}

function StateNotice({ title, message, kind = 'neutral', onRetry }: { title: string; message: string; kind?: 'neutral' | 'error'; onRetry?: () => void | Promise<void> }) {
  return (
    <div className={kind === 'error' ? 'stateNotice error' : 'stateNotice'} role={kind === 'error' ? 'alert' : 'status'}>
      <div><strong>{title}</strong><span>{message}</span></div>
      {onRetry && <button type="button" onClick={() => void onRetry()}>Spróbuj ponownie</button>}
    </div>
  );
}

function InventoryAlert({ error }: { error: InventoryError }) {
  return <StateNotice kind="error" title={`${error.source} · ${error.scope}${error.resource ? ` · ${error.resource}` : ''}`} message={error.message} />;
}

function BuildStatusPill({ status }: { status: string }) {
  const failureStatuses = new Set(['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED']);
  if (status === 'SUCCESS') return <span className="pill ok">{status}</span>;
  if (failureStatuses.has(status)) return <span className="pill failed">{status}</span>;
  return <span className="pill">{status || 'UNKNOWN'}</span>;
}

function formatBuildTime(value: string | null): string {
  if (!value) return 'UNKNOWN';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pl-PL');
}

function shortValue(value: string): string {
  return value.length > 28 ? `${value.slice(0, 14)}…${value.slice(-10)}` : value;
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
