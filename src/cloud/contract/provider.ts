import type { CloudCostSummary } from './costs';
import type { NormalizedBuild, NormalizedDeployment } from './deployment';
import type { CloudProviderId, CloudResourceSummary } from './resources';

export type CloudProviderPhase = 'ACTIVE' | 'READ_ONLY' | 'RESERVED';

export type CloudProviderCapabilities = {
  readInventory: boolean;
  readCosts: boolean;
  readLogs: boolean;
  deploy: boolean;
  mutateInfrastructure: boolean;
};

export interface CloudProvider {
  readonly id: CloudProviderId;
  readonly label: string;
  readonly phase: CloudProviderPhase;
  readonly capabilities: CloudProviderCapabilities;

  listResources(): Promise<CloudResourceSummary[]>;
  listBuilds(): Promise<NormalizedBuild[]>;
  listDeployments(): Promise<NormalizedDeployment[]>;
  getCosts(): Promise<CloudCostSummary>;
}
