import type { CloudProviderCapabilities, CloudProviderPhase } from '../../contract/provider';
import type { CloudProviderId } from '../../contract/resources';

export const AZURE_PROVIDER_ID: CloudProviderId = 'azure';
export const AZURE_PROVIDER_LABEL = 'Azure';
export const AZURE_PROVIDER_PHASE: CloudProviderPhase = 'READ_ONLY';

export const AZURE_PROVIDER_CAPABILITIES: CloudProviderCapabilities = {
  readInventory: false,
  readCosts: false,
  readLogs: false,
  deploy: false,
  mutateInfrastructure: false,
};

// Phase 1 intentionally contains no Azure SDK/API implementation.
