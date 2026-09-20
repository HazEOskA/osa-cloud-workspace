export type CloudProviderId = 'gcp' | 'azure' | 'aws';

export type CloudResourceKind =
  | 'COMPUTE'
  | 'CONTAINER_SERVICE'
  | 'DATABASE'
  | 'OBJECT_STORAGE'
  | 'SECRET'
  | 'IDENTITY'
  | 'BUILD'
  | 'DEPLOYMENT'
  | 'LOG'
  | 'COST';

export type CloudResourceState =
  | 'VERIFIED'
  | 'UNKNOWN'
  | 'FAILED'
  | 'BLOCKED';

export type CloudResourceSummary = {
  provider: CloudProviderId;
  id: string;
  name: string;
  kind: CloudResourceKind;
  region: string | null;
  state: CloudResourceState;
  nativeType: string;
  url?: string | null;
};
