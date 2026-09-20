import type { CloudProviderCapabilities, CloudProviderPhase } from '../../contract/provider';
import type { CloudProviderId } from '../../contract/resources';

export const GCP_PROVIDER_ID: CloudProviderId = 'gcp';
export const GCP_PROVIDER_LABEL = 'Google Cloud';
export const GCP_PROVIDER_PHASE: CloudProviderPhase = 'ACTIVE';

export const GCP_PROVIDER_CAPABILITIES: CloudProviderCapabilities = {
  readInventory: true,
  readCosts: false,
  readLogs: false,
  deploy: true,
  mutateInfrastructure: true,
};

// Existing runtime implementation stays in src/lib/gcp.ts during the V3 structure phase.
