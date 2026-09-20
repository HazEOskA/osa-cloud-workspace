export type MultiCloudProvenanceStage =
  | 'SOURCE'
  | 'BUILD'
  | 'ARTIFACT'
  | 'DEPLOY'
  | 'RUNTIME'
  | 'HEALTHCHECK'
  | 'CONFIG_CHECK'
  | 'COST_OBSERVED';

// Existing GCP provenance logic remains in src/lib/provenance.ts until a later approved migration.
