'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

type View = 'overview' | 'agents' | 'automations' | 'projects' | 'devtools' | 'testlab' | 'deploy' | 'infra' | 'costs';
type IconName = 'grid' | 'bot' | 'zap' | 'layers' | 'code' | 'flask' | 'rocket' | 'server' | 'wallet' | 'refresh' | 'external' | 'activity' | 'cloud' | 'terminal' | 'database' | 'lock' | 'github' | 'logs' | 'monitor' | 'check' | 'alert';

type Status = { connected: boolean; projectId: string | null; identity: 'ADC'; principal: string | null; regions: string[]; error?: string };
type Vm = { id: string; name: string; zone: string; status: string; machineType: string; internalIp: string | null; externalIp: string | null };
type Repo = { name: string; cloneUrl: string; defaultBranch: string; private: boolean; fork: boolean };
type RepoResult = { owner: string; repos: Repo[]; scope: 'public' | 'authenticated'; authenticated: boolean; error?: string };
type Service = { name: string; region: string; uri: string | null; generation: string | null; latestReadyRevision: string | null; revisionImage: string | null };
type Build = { id: string; status: string; createTime: string | null; finishTime: string | null; commitSha: string | null; repositoryFullName: string | null; serviceName: string | null; logUrl: string | null };
type Deployment = { service: string; region: string; sourceSha: string | null; sourceUrl: string | null; buildId: string | null; buildStatus: string | null; buildLogUrl: string | null; digest: string | null; revision: string | null; url: string | null; provenance: 'VERIFIED' | 'UNKNOWN'; reasons: string[] };
type Inventory = { deployments: Deployment[]; services: Service[]; builds: Build[]; artifacts: Array<{ uri: string; digest: string }>; errors: Array<{ source: string; message: string }>; scope: { builds: 'global'; regions: string[] } };
type Probe = { state: 'idle' | 'running' | 'pass' | 'fail'; status?: number; latency?: number; message?: string };

const nav: Array<{ id: View; label: string; icon: IconName }> = [
  { id: 'overview', label: 'Command', icon: 'grid' },
  { id: 'agents', label: 'Agents', icon: 'bot' },
  { id: 'automations', label: 'Automations', icon: 'zap' },
  { id: 'projects', label: 'Portfolio', icon: 'layers' },
  { id: 'devtools', label: 'Dev Tools', icon: 'code' },
  { id: 'testlab', label: 'Test Lab', icon: 'flask' },
  { id: 'deploy', label: 'Deploy', icon: 'rocket' },
  { id: 'infra', label: 'Infra', icon: 'server' },
  { id: 'costs', label: 'Costs', icon: 'wallet' },
];

const toolDefs: Array<{ label: string; icon: IconName; path: (p: string) => string; note: string }> = [
  { label: 'Cloud Workstations', icon: 'monitor', path: (p) => `https://console.cloud.google.com/workstations/list?project=${p}`, note: 'pełne środowisko dev' },
  { label: 'Cloud Shell', icon: 'terminal', path: (p) => `https://console.cloud.google.com/home/dashboard?cloudshell=true&project=${p}`, note: 'terminal w przeglądarce' },
  { label: 'Cloud Run', icon: 'cloud', path: (p) => `https://console.cloud.google.com/run?project=${p}`, note: 'usługi i rewizje' },
  { label: 'Cloud Build', icon: 'rocket', path: (p) => `https://console.cloud.google.com/cloud-build/builds?project=${p}`, note: 'buildy i triggery' },
  { label: 'Logs Explorer', icon: 'logs', path: (p) => `https://console.cloud.google.com/logs/query?project=${p}`, note: 'live logi' },
  { label: 'Artifact Registry', icon: 'database', path: (p) => `https://console.cloud.google.com/artifacts?project=${p}`, note: 'obrazy i digesty' },
  { label: 'Secret Manager', icon: 'lock', path: (p) => `https://console.cloud.google.com/security/secret-manager?project=${p}`, note: 'sekrety bez wartości w UI' },
  { label: 'Compute Engine', icon: 'server', path: (p) => `https://console.cloud.google.com/compute/instances?project=${p}`, note: 'VM i VPS' },
  { label: 'Monitoring', icon: 'activity', path: (p) => `https://console.cloud.google.com/monitoring?project=${p}`, note: 'metryki i alerty' },
  { label: 'Cloud Scheduler', icon: 'zap', path: (p) => `https://console.cloud.google.com/cloudscheduler?project=${p}`, note: 'harmonogramy' },
  { label: 'Cloud SQL', icon: 'database', path: (p) => `https://console.cloud.google.com/sql/instances?project=${p}`, note: 'bazy danych' },
  { label: 'IAM', icon: 'lock', path: (p) => `https://console.cloud.google.com/iam-admin/iam?project=${p}`, note: 'tożsamości i role' },
];

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const data = (await response.json()) as T;
  if (!response.ok) throw new Error(typeof data === 'object' && data && 'error' in data ? String((data as { error?: string }).error) : `HTTP ${response.status}`);
  return data;
}

function norm(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function short(value: string | null | undefined, n = 9) { return value ? value.slice(0, n) : 'UNKNOWN'; }
function consoleProject(projectId: string | null) { return projectId ?? 'fluid-fiber-477010-a8'; }

export default function Home() {
  const [view, setView] = useState<View>('overview');
  const [status, setStatus] = useState<Status | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [vms, setVms] = useState<Vm[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [probeTarget, setProbeTarget] = useState('');
  const [probe, setProbe] = useState<Probe>({ state: 'idle' });

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrors([]);
    const [s, i, v, r] = await Promise.allSettled([
      readJson<Status>('/api/gcp/status'),
      readJson<Inventory>('/api/gcp/deployments'),
      readJson<{ vms: Vm[] }>('/api/gcp/vms'),
      readJson<RepoResult>('/api/repos'),
    ]);
    const nextErrors: string[] = [];
    if (s.status === 'fulfilled') setStatus(s.value); else { setStatus(null); nextErrors.push(`GCP: ${String(s.reason)}`); }
    if (i.status === 'fulfilled') setInventory(i.value); else { setInventory(null); nextErrors.push(`Inventory: ${String(i.reason)}`); }
    if (v.status === 'fulfilled') setVms(v.value.vms ?? []); else { setVms([]); nextErrors.push(`VM: ${String(v.reason)}`); }
    if (r.status === 'fulfilled') setRepos(r.value.repos ?? []); else { setRepos([]); nextErrors.push(`GitHub: ${String(r.reason)}`); }
    setErrors(nextErrors);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const services = inventory?.services ?? [];
  const deployments = inventory?.deployments ?? [];
  const builds = inventory?.builds ?? [];
  const live = deployments.filter((d) => Boolean(d.url));
  const verified = deployments.filter((d) => d.provenance === 'VERIFIED').length;
  const failedBuilds = builds.filter((b) => b.status === 'FAILURE' || b.status === 'FAILED').length;
  const projectId = consoleProject(status?.projectId ?? null);
  const health = status?.connected && errors.length === 0 ? 'ONLINE' : loading ? 'SYNC' : 'PARTIAL';

  const agents = useMemo(() => {
    const rx = /(agent|runtime|mcp|hydra|hermes|worker|fleet)/i;
    const cloud = services.filter((s) => rx.test(s.name)).map((s) => ({ name: s.name, source: 'Cloud Run', status: s.latestReadyRevision ? 'ONLINE' : 'UNKNOWN', url: s.uri, detail: `${s.region} · ${s.latestReadyRevision ?? 'revision UNKNOWN'}` }));
    const seen = new Set(cloud.map((a) => norm(a.name)));
    const source = repos.filter((r) => rx.test(r.name) && !seen.has(norm(r.name))).slice(0, 8).map((r) => ({ name: r.name, source: 'GitHub', status: 'SOURCE', url: `https://github.com/HazEOskA/${r.name}`, detail: `${r.private ? 'private' : 'public'} · ${r.defaultBranch}` }));
    return [...cloud, ...source];
  }, [services, repos]);

  const portfolio = useMemo(() => {
    return repos.map((repo) => {
      const candidates = deployments.filter((d) => norm(d.service) === norm(repo.name) || norm(repo.name).includes(norm(d.service)) || norm(d.service).includes(norm(repo.name)));
      const dep = candidates.find((d) => d.url) ?? candidates[0] ?? null;
      return { repo, dep };
    }).sort((a, b) => Number(Boolean(b.dep?.url)) - Number(Boolean(a.dep?.url)) || a.repo.name.localeCompare(b.repo.name));
  }, [repos, deployments]);

  const runProbe = async () => {
    const target = probeTarget.trim();
    if (!target) return;
    setProbe({ state: 'running' });
    const started = performance.now();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(target, { method: 'GET', cache: 'no-store', signal: controller.signal });
      window.clearTimeout(timer);
      setProbe({ state: response.ok ? 'pass' : 'fail', status: response.status, latency: Math.round(performance.now() - started), message: response.ok ? 'Endpoint odpowiedział.' : `HTTP ${response.status}` });
    } catch (error) {
      window.clearTimeout(timer);
      setProbe({ state: 'fail', latency: Math.round(performance.now() - started), message: error instanceof Error ? error.message : String(error) });
    }
  };

  const switchView = (next: View) => { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="appShell">
      <aside className="sideNav">
        <div className="brand"><div className="brandMark">O</div><div><strong>OSA CLOUD</strong><span>WORKSPACE // V2</span></div></div>
        <div className="sideStatus"><span className={`dot ${status?.connected ? 'ok' : ''}`} /><div><b>{health}</b><small>{status?.projectId ?? 'PROJECT UNKNOWN'}</small></div></div>
        <nav>{nav.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => switchView(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
        <div className="sideFooter"><button onClick={() => void refresh()} disabled={loading}><Icon name="refresh" /><span>{loading ? 'Synchronizacja…' : 'Odśwież wszystko'}</span></button><small>claim → evidence → UNKNOWN</small></div>
      </aside>

      <main className="workspace">
        <header className="topBar">
          <div><span className="kicker">OSA // OPERATIONS CONTROL PLANE</span><h1>{nav.find((n) => n.id === view)?.label}</h1></div>
          <div className="topActions"><button className="ghost" onClick={() => switchView('devtools')}><Icon name="code" /> DEV</button><a className="primary" href="/deploy"><Icon name="rocket" /> DEPLOY</a></div>
        </header>

        {errors.length > 0 && <div className="errorStrip"><Icon name="alert" /><div><b>Odczyt częściowy</b><span>{errors.join(' · ')}</span></div></div>}

        {view === 'overview' && <>
          <section className="hero">
            <div className="heroCopy"><span className="kicker">COMMAND CENTER</span><h2>Buduj. Testuj. Steruj.<br /><em>Z jednego miejsca.</em></h2><p>Agenci, automatyzacje, portfolio projektów, narzędzia developerskie i Google Cloud w jednym mobilnym control plane.</p><div className="heroActions"><button onClick={() => switchView('agents')}><Icon name="bot" /> Agents</button><button onClick={() => switchView('testlab')}><Icon name="flask" /> Test Lab</button><a href="/deploy"><Icon name="rocket" /> Quick deploy</a></div></div>
            <div className="liveCore"><span className="corePulse" /><div><small>SYSTEM CORE</small><strong>{health}</strong><span>{verified}/{deployments.length} deploymentów VERIFIED</span></div></div>
          </section>

          <section className="metricRow">
            <Metric icon="bot" label="Agents" value={agents.length || 'UNKNOWN'} meta={agents.filter((a) => a.status === 'ONLINE').length ? `${agents.filter((a) => a.status === 'ONLINE').length} online` : 'discovery'} onClick={() => switchView('agents')} />
            <Metric icon="zap" label="Automations" value={builds.length || 'UNKNOWN'} meta={`${failedBuilds} failed build`} onClick={() => switchView('automations')} />
            <Metric icon="layers" label="Portfolio" value={repos.length || 'UNKNOWN'} meta={`${live.length} live endpoint`} onClick={() => switchView('projects')} />
            <Metric icon="server" label="Infrastructure" value={services.length + vms.length || 'UNKNOWN'} meta={`${services.length} Run · ${vms.length} VM`} onClick={() => switchView('infra')} />
          </section>

          <div className="dashboardGrid">
            <Panel title="Active agents" kicker="RUNTIME / MCP / WORKERS" action={<button onClick={() => switchView('agents')}>Wszystkie</button>}>
              <div className="compactList">{agents.slice(0, 5).map((agent) => <CompactRow key={`${agent.source}-${agent.name}`} icon="bot" title={agent.name} meta={agent.detail} status={agent.status} href={agent.url} />)}{agents.length === 0 && <Empty text="Nie wykryto agentów w aktualnym inventory. Źródła pozostają UNKNOWN." />}</div>
            </Panel>
            <Panel title="Project portfolio" kicker="GITHUB → BUILD → LIVE" action={<button onClick={() => switchView('projects')}>Portfolio</button>}>
              <div className="compactList">{portfolio.slice(0, 5).map(({ repo, dep }) => <CompactRow key={repo.name} icon="layers" title={repo.name} meta={`${repo.defaultBranch} · ${dep?.revision ?? 'revision UNKNOWN'}`} status={dep?.url ? 'LIVE' : dep ? dep.provenance : 'SOURCE'} href={dep?.url ?? `https://github.com/HazEOskA/${repo.name}`} />)}{repos.length === 0 && <Empty text="GitHub repo discovery jest NIEPOŁĄCZONE." />}</div>
            </Panel>
            <Panel title="Recent pipeline" kicker="CLOUD BUILD" action={<a href={`https://console.cloud.google.com/cloud-build/builds?project=${projectId}`} target="_blank" rel="noreferrer">Cloud Build</a>}>
              <div className="timeline">{builds.slice(0, 5).map((b) => <div key={b.id}><span className={`timelineDot ${b.status === 'SUCCESS' ? 'ok' : b.status.includes('FAIL') ? 'bad' : ''}`} /><div><b>{b.serviceName ?? b.repositoryFullName ?? 'build'}</b><small>{short(b.commitSha)} · {b.status}</small></div>{b.logUrl && <a href={b.logUrl} target="_blank" rel="noreferrer"><Icon name="external" /></a>}</div>)}{builds.length === 0 && <Empty text="Brak evidence Cloud Build." />}</div>
            </Panel>
            <Panel title="Quick tools" kicker="ZERO MENU HUNTING">
              <div className="quickTools">{toolDefs.slice(0, 6).map((tool) => <ToolLink key={tool.label} tool={tool} projectId={projectId} compact />)}</div>
            </Panel>
          </div>
        </>}

        {view === 'agents' && <SectionPage kicker="AGENT FLEET" title="Agents & runtimes" subtitle="Realne Cloud Run services oraz repozytoria agentowe. Bez fikcyjnych heartbeatów.">
          <div className="cards3">{agents.map((agent) => <article className="agentCard" key={`${agent.source}-${agent.name}`}><div className="cardIcon"><Icon name="bot" /></div><div className="cardHead"><div><small>{agent.source}</small><h3>{agent.name}</h3></div><StatusBadge value={agent.status} /></div><p>{agent.detail}</p><div className="cardActions">{agent.url && <a href={agent.url} target="_blank" rel="noreferrer"><Icon name="external" /> Otwórz</a>}<button onClick={() => { setProbeTarget(agent.url ?? ''); switchView('testlab'); }} disabled={!agent.url}><Icon name="flask" /> Test</button></div></article>)}{agents.length === 0 && <EmptyCard title="Agents UNKNOWN" text="Nie ma jeszcze źródła danych, które potwierdza uruchomione agenty. Repo i runtime inventory nie są udawane." />}</div>
        </SectionPage>}

        {view === 'automations' && <SectionPage kicker="AUTOMATION HUB" title="Automations" subtitle="Build pipelines są odczytywane live. Scheduler i pozostałe automaty mają bezpośredni dostęp do konsoli, dopóki nie podłączymy ich API.">
          <div className="cards3">
            <AutomationCard title="Cloud Build pipeline" icon="rocket" status={builds.length ? 'CONNECTED' : 'UNKNOWN'} detail={`${builds.length} ostatnich buildów · ${failedBuilds} failed`} href={`https://console.cloud.google.com/cloud-build/builds?project=${projectId}`} />
            <AutomationCard title="Cloud Scheduler" icon="zap" status="NIEPOŁĄCZONE" detail="Bezpośredni dostęp do harmonogramów GCP. API discovery do podpięcia." href={`https://console.cloud.google.com/cloudscheduler?project=${projectId}`} />
            <AutomationCard title="GitHub Actions" icon="github" status="ACCESS" detail="Workflowy dla OSA Cloud Workspace i repozytoriów." href="https://github.com/HazEOskA/osa-cloud-workspace/actions" />
          </div>
          <Panel title="Ostatnie wykonania" kicker="BUILD RUNS"><div className="runTable">{builds.slice(0, 12).map((b) => <div key={b.id}><StatusBadge value={b.status} /><b>{b.serviceName ?? b.repositoryFullName ?? 'UNKNOWN'}</b><span>{short(b.commitSha)}</span><span>{b.finishTime ? new Date(b.finishTime).toLocaleString('pl-PL') : 'czas UNKNOWN'}</span>{b.logUrl ? <a href={b.logUrl} target="_blank" rel="noreferrer">LOGS <Icon name="external" /></a> : <span>LOGS UNKNOWN</span>}</div>)}</div></Panel>
        </SectionPage>}

        {view === 'projects' && <SectionPage kicker="PROJECT PORTFOLIO" title="Twoje projekty" subtitle="Repozytorium, branch, live deployment i provenance w jednym miejscu.">
          <div className="portfolioGrid">{portfolio.map(({ repo, dep }) => <article className="projectCard" key={repo.name}><div className="projectTop"><div className="cardIcon"><Icon name="layers" /></div><StatusBadge value={dep?.url ? 'LIVE' : dep?.provenance ?? 'SOURCE'} /></div><h3>{repo.name}</h3><p>{repo.private ? 'Private repository' : 'Public repository'} · {repo.defaultBranch}</p><div className="projectEvidence"><span>SHA <b>{short(dep?.sourceSha)}</b></span><span>BUILD <b>{short(dep?.buildId)}</b></span><span>REV <b>{dep?.revision ?? 'UNKNOWN'}</b></span></div><div className="cardActions"><a href={`https://github.com/HazEOskA/${repo.name}`} target="_blank" rel="noreferrer"><Icon name="github" /> GitHub</a>{dep?.url && <a href={dep.url} target="_blank" rel="noreferrer"><Icon name="external" /> Live</a>}<a href="/deploy"><Icon name="rocket" /> Deploy</a></div></article>)}</div>
        </SectionPage>}

        {view === 'devtools' && <SectionPage kicker="DEVELOPER ACCESS" title="Dev Tools" subtitle="Najważniejsze narzędzia developerskie bez przeklikiwania Google Cloud.">
          <div className="toolGrid">{toolDefs.map((tool) => <ToolLink key={tool.label} tool={tool} projectId={projectId} />)}<a className="toolCard" href="https://github.com/HazEOskA" target="_blank" rel="noreferrer"><div className="cardIcon"><Icon name="github" /></div><div><h3>GitHub</h3><p>repo, PR, Actions, source of truth</p></div><Icon name="external" /></a></div>
        </SectionPage>}

        {view === 'testlab' && <SectionPage kicker="LIVE PROBE" title="Test Lab" subtitle="Szybki test endpointu bez zmiany infrastruktury. Test działa z przeglądarki i nie przechowuje sekretów.">
          <div className="testConsole"><div className="testInput"><span>GET</span><input value={probeTarget} onChange={(e) => setProbeTarget(e.target.value)} placeholder="https://service.run.app/health" /><button onClick={() => void runProbe()} disabled={!probeTarget || probe.state === 'running'}><Icon name="flask" /> {probe.state === 'running' ? 'TESTUJĘ…' : 'RUN TEST'}</button></div><div className={`probeResult ${probe.state}`}><div className="probeIcon"><Icon name={probe.state === 'pass' ? 'check' : probe.state === 'fail' ? 'alert' : 'activity'} /></div><div><small>RESULT</small><strong>{probe.state.toUpperCase()}</strong><span>{probe.message ?? 'Wybierz live endpoint poniżej albo wpisz własny URL.'}</span></div><div className="probeStats"><b>{probe.status ?? '—'}</b><span>HTTP</span><b>{probe.latency ? `${probe.latency}ms` : '—'}</b><span>LATENCY</span></div></div></div>
          <Panel title="Live targets" kicker="CLOUD RUN ENDPOINTS"><div className="targetGrid">{live.map((dep) => <button key={`${dep.region}-${dep.service}`} onClick={() => setProbeTarget(dep.url ?? '')}><Icon name="cloud" /><div><b>{dep.service}</b><span>{dep.url}</span></div><StatusBadge value={dep.provenance} /></button>)}</div></Panel>
        </SectionPage>}

        {view === 'deploy' && <SectionPage kicker="SHIP CENTER" title="Deploy Center" subtitle="Aktualny bezpieczny flow /deploy zostaje osobnym ekranem wykonawczym; tutaj masz kontekst i evidence.">
          <div className="deployHero"><div><span className="kicker">ONE CONTROL PLANE</span><h2>GitHub → Build → Artifact → Cloud Run</h2><p>Wybierz repo i branch, uruchom build, a potem wróć tutaj po provenance.</p></div><a className="megaButton" href="/deploy"><Icon name="rocket" /> OTWÓRZ DEPLOY</a></div>
          <div className="cards3"><InfoCard icon="github" title="Source" value={`${repos.length || 'UNKNOWN'} repo`} note="public + private discovery" /><InfoCard icon="rocket" title="Build" value={`${builds.length || 'UNKNOWN'} runs`} note={`${failedBuilds} failed`} /><InfoCard icon="check" title="Verified" value={`${verified}/${deployments.length}`} note="digest → revision → URL" /></div>
        </SectionPage>}

        {view === 'infra' && <SectionPage kicker="GCP INVENTORY" title="Infrastructure" subtitle="Cloud Run, Compute Engine i immutable artifact evidence.">
          <Panel title="Cloud Run services" kicker={`${services.length} SERVICES`}><div className="infraList">{services.map((s) => { const dep = deployments.find((d) => d.service === s.name && d.region === s.region); return <div key={`${s.region}-${s.name}`}><div className="cardIcon"><Icon name="cloud" /></div><div><b>{s.name}</b><span>{s.region} · {s.latestReadyRevision ?? 'revision UNKNOWN'}</span></div><StatusBadge value={dep?.provenance ?? 'UNKNOWN'} />{s.uri && <a href={s.uri} target="_blank" rel="noreferrer"><Icon name="external" /></a>}</div>})}</div></Panel>
          <Panel title="Compute Engine" kicker={`${vms.length} VM`}><div className="infraList">{vms.map((vm) => <div key={vm.id}><div className="cardIcon"><Icon name="server" /></div><div><b>{vm.name}</b><span>{vm.zone} · {vm.machineType} · {vm.externalIp ?? vm.internalIp ?? 'IP UNKNOWN'}</span></div><StatusBadge value={vm.status} /></div>)}{vms.length === 0 && <Empty text="Brak wykrytych VM lub Compute API NIEPOŁĄCZONE." />}</div></Panel>
        </SectionPage>}

        {view === 'costs' && <SectionPage kicker="FINOPS / WALLET" title="Costs & usage" subtitle="Nie pokazuję wymyślonych kwot. Billing API nie jest jeszcze źródłem Workspace, więc liczby pozostają UNKNOWN, ale dostęp do kosztów jest natychmiastowy.">
          <div className="cards3"><InfoCard icon="wallet" title="Current spend" value="UNKNOWN" note="Billing API NIEPOŁĄCZONE" /><InfoCard icon="activity" title="Budget" value="UNKNOWN" note="bez fake danych" /><InfoCard icon="cloud" title="Project" value={projectId} note="aktywny scope" /></div>
          <div className="toolGrid"><ToolSimple icon="wallet" title="Billing reports" note="koszty w czasie" href={`https://console.cloud.google.com/billing?project=${projectId}`} /><ToolSimple icon="activity" title="Cost table" note="koszt per usługa / SKU" href={`https://console.cloud.google.com/billing/reports?project=${projectId}`} /><ToolSimple icon="alert" title="Budgets & alerts" note="limity i powiadomienia" href={`https://console.cloud.google.com/billing/budgets?project=${projectId}`} /></div>
        </SectionPage>}
      </main>

      <nav className="mobileNav">{nav.slice(0, 5).map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => switchView(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}<button onClick={() => switchView(view === 'devtools' ? 'overview' : 'devtools')}><Icon name="grid" /><span>More</span></button></nav>
    </div>
  );
}

function SectionPage({ kicker, title, subtitle, children }: { kicker: string; title: string; subtitle: string; children: ReactNode }) { return <div className="sectionPage"><div className="pageIntro"><span className="kicker">{kicker}</span><h2>{title}</h2><p>{subtitle}</p></div>{children}</div>; }
function Panel({ title, kicker, action, children }: { title: string; kicker: string; action?: ReactNode; children: ReactNode }) { return <section className="panel"><div className="panelHead"><div><span>{kicker}</span><h3>{title}</h3></div>{action && <div className="panelAction">{action}</div>}</div>{children}</section>; }
function Metric({ icon, label, value, meta, onClick }: { icon: IconName; label: string; value: string | number; meta: string; onClick: () => void }) { return <button className="metric" onClick={onClick}><div className="metricIcon"><Icon name={icon} /></div><span>{label}</span><strong>{value}</strong><small>{meta}</small></button>; }
function StatusBadge({ value }: { value: string }) { const good = /ONLINE|LIVE|SUCCESS|VERIFIED|CONNECTED|RUNNING|ACCESS/i.test(value); const bad = /FAIL|ERROR|STOP|OFFLINE/i.test(value); return <span className={`statusBadge ${good ? 'good' : bad ? 'bad' : ''}`}>{value}</span>; }
function CompactRow({ icon, title, meta, status, href }: { icon: IconName; title: string; meta: string; status: string; href?: string | null }) { const body = <><div className="miniIcon"><Icon name={icon} /></div><div className="compactBody"><b>{title}</b><span>{meta}</span></div><StatusBadge value={status} />{href && <Icon name="external" />}</>; return href ? <a className="compactRow" href={href} target="_blank" rel="noreferrer">{body}</a> : <div className="compactRow">{body}</div>; }
function ToolLink({ tool, projectId, compact = false }: { tool: (typeof toolDefs)[number]; projectId: string; compact?: boolean }) { return <a className={compact ? 'quickTool' : 'toolCard'} href={tool.path(projectId)} target="_blank" rel="noreferrer"><div className="cardIcon"><Icon name={tool.icon} /></div><div><h3>{tool.label}</h3><p>{tool.note}</p></div><Icon name="external" /></a>; }
function ToolSimple({ icon, title, note, href }: { icon: IconName; title: string; note: string; href: string }) { return <a className="toolCard" href={href} target="_blank" rel="noreferrer"><div className="cardIcon"><Icon name={icon} /></div><div><h3>{title}</h3><p>{note}</p></div><Icon name="external" /></a>; }
function AutomationCard({ title, icon, status, detail, href }: { title: string; icon: IconName; status: string; detail: string; href: string }) { return <article className="agentCard"><div className="cardIcon"><Icon name={icon} /></div><div className="cardHead"><h3>{title}</h3><StatusBadge value={status} /></div><p>{detail}</p><div className="cardActions"><a href={href} target="_blank" rel="noreferrer"><Icon name="external" /> Otwórz</a></div></article>; }
function InfoCard({ icon, title, value, note }: { icon: IconName; title: string; value: string; note: string }) { return <article className="infoCard"><div className="cardIcon"><Icon name={icon} /></div><span>{title}</span><strong>{value}</strong><small>{note}</small></article>; }
function Empty({ text }: { text: string }) { return <div className="emptyState">{text}</div>; }
function EmptyCard({ title, text }: { title: string; text: string }) { return <article className="emptyCard"><Icon name="alert" /><h3>{title}</h3><p>{text}</p></article>; }

function Icon({ name }: { name: IconName }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    bot: <><rect x="4" y="7" width="16" height="12" rx="4"/><path d="M9 7V4h6v3M8 13h.01M16 13h.01M9 17h6"/></>,
    zap: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>, layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
    code: <><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></>, flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M8 15h8"/></>,
    rocket: <><path d="M14 4c3-2 5-1 6-1 0 1 1 3-1 6l-5 5-5-5 5-5Z"/><path d="m9 9-4 1-2 4 6 1M15 15l-1 4-4 2-1-6M8 16l-4 4"/></>,
    server: <><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></>, wallet: <><path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12"/><path d="M16 11h6v4h-6a2 2 0 0 1 0-4Z"/></>,
    refresh: <><path d="M20 6v5h-5M4 18v-5h5"/><path d="M18 9a7 7 0 0 0-12-3L4 8M6 15a7 7 0 0 0 12 3l2-2"/></>, external: <><path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></>,
    activity: <path d="M3 12h4l2-7 4 14 2-7h6"/>, cloud: <path d="M7 18h11a4 4 0 0 0 .5-8A6 6 0 0 0 7 8a5 5 0 0 0 0 10Z"/>, terminal: <><path d="m4 17 6-5-6-5M12 19h8"/></>, database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>, github: <><circle cx="12" cy="12" r="9"/><path d="M9 19c-4 1-4-2-5-2M15 19v-3c0-1 .3-1.7.8-2.2 2.6-.3 5.2-1.3 5.2-5.8 0-1.2-.4-2.2-1.1-3 .1-.3.5-1.5-.1-3-1 0-2.4.5-3.3 1.2a11 11 0 0 0-6 0C9.6 2.5 8.2 2 7.2 2c-.6 1.5-.2 2.7-.1 3C6.4 5.8 6 6.8 6 8c0 4.5 2.6 5.5 5.2 5.8.5.5.8 1.2.8 2.2v3"/></>,
    logs: <><path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/></>, monitor: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>, check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>, alert: <><path d="M10.3 3.7 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}
