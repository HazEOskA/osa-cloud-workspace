import type { CloudProviderCapabilities, CloudProviderPhase } from '../../contract/provider';
import type { CloudProviderId } from '../../contract/resources';

export const AWS_PROVIDER_ID: CloudProviderId = 'aws';
export const AWS_PROVIDER_LABEL = 'AWS';
export const AWS_PROVIDER_PHASE: CloudProviderPhase = 'RESERVED';

export const AWS_PROVIDER_CAPABILITIES: CloudProviderCapabilities = {
  readInventory: false,
  readCosts: false,
  readLogs: false,
  deploy: false,
  mutateInfrastructure: false,
};

// Reserved provider slot. No AWS integration is implemented in this phase.
