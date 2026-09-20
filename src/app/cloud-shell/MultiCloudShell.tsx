'use client';

import { useState } from 'react';
import styles from './multi-cloud-shell.module.css';

export type CloudProvider = 'gcp' | 'aws' | 'azure';
type ProviderView = 'command' | 'compute' | 'deploy' | 'infra' | 'costs';

const providers: Array<{
  id: CloudProvider;
  label: string;
  subtitle: string;
  tone: 'green' | 'amber' | 'cyan';
}> = [
  { id: 'gcp', label: 'GCP', subtitle: 'Google Cloud', tone: 'green' },
  { id: 'aws', label: 'AWS', subtitle: 'Amazon Web Services', tone: 'amber' },
  { id: 'azure', label: 'AZURE', subtitle: 'Microsoft Azure', tone: 'cyan' },
];

const nav: Array<{ id: ProviderView; label: string }> = [
  { id: 'command', label: 'Command' },
  { id: 'compute', label: 'Compute' },
  { id: 'deploy', label: 'Deploy' },
  { id: 'infra', label: 'Infra' },
  { id: 'costs', label: 'Costs' },
];

const providerCopy = {
  aws: {
    eyebrow: 'AWS APPLICATION // FRONTEND SHELL',
    title: 'OSA AWS Workspace',
    subtitle: 'Osobny control plane dla AWS. Frontend jest gotowy do spięcia z kontem, regionami i usługami — backend pozostaje celowo odłączony.',
    contextLabel: 'ACCOUNT',
    contextValue: 'DISCONNECTED',
    services: ['ECS / EKS', 'Lambda', 'EC2 / VPC'],
  },
  azure: {
    eyebrow: 'AZURE APPLICATION // FRONTEND SHELL',
    title: 'OSA Azure Workspace',
    subtitle: 'Osobny control plane dla Azure. Frontend jest gotowy pod subscription, resource groups i runtime — backend pozostaje celowo odłączony.',
    contextLabel: 'SUBSCRIPTION',
    contextValue: 'DISCONNECTED',
    services: ['Container Apps / AKS', 'Functions', 'Virtual Machines'],
  },
} as const;

export function CloudProviderSwitcher({
  active,
  onChange,
  gcpConnected,
}: {
  active: CloudProvider;
  onChange: (provider: CloudProvider) => void;
  gcpConnected: boolean;
}) {
  return (
    <header className={styles.providerRail}>
      <div className={styles.railInner}>
        <div className={styles.railMeta}>
          <strong>OSA MULTI-CLOUD</strong>
          <span>3 APPS // 1 CONTROL SURFACE</span>
        </div>

        <div className={styles.cloudSelector} role="tablist" aria-label="Wybierz aplikację chmurową">
          {providers.map((provider) => {
            const connected = provider.id === 'gcp' && gcpConnected;
            const buttonClass = [
              styles.cloudButton,
              styles[provider.tone],
              active === provider.id ? styles.active : '',
            ].filter(Boolean).join(' ');

            return (
              <button
                key={provider.id}
                type="button"
                role="tab"
                aria-selected={active === provider.id}
                className={buttonClass}
                onClick={() => onChange(provider.id)}
              >
                <span className={styles.cloudShape} aria-hidden="true">
                  <span className={styles.cloudName}>{provider.label}</span>
                </span>
                <span className={styles.cloudCaption}>
                  <i className={connected ? styles.liveDot : styles.offDot} />
                  {provider.subtitle}
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.railState}>
          <span>ACTIVE APP</span>
          <b>{active.toUpperCase()}</b>
        </div>
      </div>
    </header>
  );
}

export function DisconnectedCloudApp({ provider }: { provider: Exclude<CloudProvider, 'gcp'> }) {
  const [view, setView] = useState<ProviderView>('command');
  const copy = providerCopy[provider];
  const providerClass = provider === 'aws' ? styles.awsApp : styles.azureApp;
  const appClass = [styles.providerApp, providerClass].join(' ');

  return (
    <div className={appClass}>
      <aside className={styles.providerSide}>
        <div className={styles.providerBrand}>
          <span className={styles.miniCloud}>{provider.toUpperCase()}</span>
          <div>
            <strong>OSA {provider.toUpperCase()}</strong>
            <small>WORKSPACE // V1</small>
          </div>
        </div>

        <div className={styles.providerConnection}>
          <i />
          <div>
            <b>DISCONNECTED</b>
            <span>{copy.contextLabel} UNKNOWN</span>
          </div>
        </div>

        <nav>
          {nav.map((item) => (
            <button key={item.id} className={view === item.id ? styles.navActive : ''} onClick={() => setView(item.id)}>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <footer>
          FRONTEND ONLY
          <span>CLAIM ≠ PROOF</span>
        </footer>
      </aside>

      <main className={styles.providerWorkspace}>
        <header className={styles.providerTop}>
          <div>
            <span>{copy.eyebrow}</span>
            <h1>{nav.find((item) => item.id === view)?.label ?? 'Command'}</h1>
          </div>
          <div className={styles.contextChip}>
            <span>{copy.contextLabel}</span>
            <b>{copy.contextValue}</b>
          </div>
        </header>

        <nav className={styles.mobileProviderNav}>
          {nav.map((item) => (
            <button key={item.id} className={view === item.id ? styles.navActive : ''} onClick={() => setView(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        {view === 'command' ? (
          <>
            <section className={styles.providerHero}>
              <div>
                <span>{copy.eyebrow}</span>
                <h2>{copy.title}</h2>
                <p>{copy.subtitle}</p>
              </div>
              <div className={styles.heroCloud}>
                <div className={styles.heroCloudShape}>{provider.toUpperCase()}</div>
                <strong>DISCONNECTED</strong>
                <span>adapter boundary ready</span>
              </div>
            </section>

            <section className={styles.providerMetrics}>
              <article><span>Context</span><strong>UNKNOWN</strong><small>{copy.contextLabel.toLowerCase()} adapter not connected</small></article>
              <article><span>Resources</span><strong>UNKNOWN</strong><small>zero fake inventory</small></article>
              <article><span>Regions</span><strong>UNKNOWN</strong><small>backend not connected</small></article>
              <article><span>Cost state</span><strong>UNKNOWN</strong><small>billing not connected</small></article>
            </section>

            <section className={styles.providerGrid}>
              {copy.services.map((service) => (
                <article key={service}>
                  <span>RESOURCE SURFACE</span>
                  <h3>{service}</h3>
                  <p>Frontend slot przygotowany. Dane i akcje pozostają zablokowane do czasu podłączenia realnego adaptera {provider.toUpperCase()}.</p>
                  <b>DISCONNECTED</b>
                </article>
              ))}
            </section>
          </>
        ) : (
          <section className={styles.providerEmpty}>
            <div className={styles.emptyCloud}>{provider.toUpperCase()}</div>
            <span>{view.toUpperCase()} APPLICATION SURFACE</span>
            <h2>{nav.find((item) => item.id === view)?.label}</h2>
            <p>Ten ekran należy wyłącznie do aplikacji {provider.toUpperCase()}. Frontend shell jest rozdzielony, ale backend nie jest jeszcze podpięty — dlatego wszystkie dane pozostają UNKNOWN.</p>
            <div>
              <b>STATUS</b>
              <strong>DISCONNECTED</strong>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
