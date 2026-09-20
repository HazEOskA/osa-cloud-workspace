export type EvidenceLedgerEntry = {
  provider: 'gcp' | 'azure' | 'aws';
  resourceId: string;
  verdict: 'VERIFIED' | 'UNKNOWN' | 'FAILED' | 'BLOCKED';
  observedAt: string | null;
  reason: string | null;
};

// Persistence is intentionally not implemented in the structure phase.
