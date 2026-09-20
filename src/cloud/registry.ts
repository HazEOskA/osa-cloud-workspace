import {
  GCP_PROVIDER_CAPABILITIES,
  GCP_PROVIDER_ID,
  GCP_PROVIDER_LABEL,
  GCP_PROVIDER_PHASE,
} from './providers/gcp/provider';
import {
  AZURE_PROVIDER_CAPABILITIES,
  AZURE_PROVIDER_ID,
  AZURE_PROVIDER_LABEL,
  AZURE_PROVIDER_PHASE,
} from './providers/azure/provider';
import {
  AWS_PROVIDER_CAPABILITIES,
  AWS_PROVIDER_ID,
  AWS_PROVIDER_LABEL,
  AWS_PROVIDER_PHASE,
} from './providers/aws/provider';

export const cloudProviderRegistry = [
  {
    id: GCP_PROVIDER_ID,
    label: GCP_PROVIDER_LABEL,
    phase: GCP_PROVIDER_PHASE,
    capabilities: GCP_PROVIDER_CAPABILITIES,
  },
  {
    id: AZURE_PROVIDER_ID,
    label: AZURE_PROVIDER_LABEL,
    phase: AZURE_PROVIDER_PHASE,
    capabilities: AZURE_PROVIDER_CAPABILITIES,
  },
  {
    id: AWS_PROVIDER_ID,
    label: AWS_PROVIDER_LABEL,
    phase: AWS_PROVIDER_PHASE,
    capabilities: AWS_PROVIDER_CAPABILITIES,
  },
] as const;
