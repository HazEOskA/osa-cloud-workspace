import type { CloudProviderId } from './resources';

export type CloudCostSummary = {
  provider: CloudProviderId;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number | null;
  state: 'VERIFIED' | 'UNKNOWN' | 'FAILED' | 'BLOCKED';
};
