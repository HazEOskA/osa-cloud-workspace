import type { CloudProviderId } from './resources';

export type EvidenceState = 'VERIFIED' | 'UNKNOWN' | 'FAILED' | 'BLOCKED';

export type EvidenceStep =
  | 'SOURCE'
  | 'BUILD'
  | 'ARTIFACT'
  | 'DEPLOY'
  | 'RUNTIME'
  | 'HEALTHCHECK'
  | 'CONFIG_CHECK'
  | 'COST_OBSERVED';

export type EvidenceRecord = {
  provider: CloudProviderId;
  resourceId: string;
  step: EvidenceStep;
  state: EvidenceState;
  observedAt: string | null;
  reason: string | null;
};
