import type { CloudProviderId } from './resources';

export type NormalizedBuild = {
  provider: CloudProviderId;
  id: string;
  status: string;
  sourceSha: string | null;
  artifactDigest: string | null;
  createdAt: string | null;
  finishedAt: string | null;
};

export type NormalizedDeployment = {
  provider: CloudProviderId;
  id: string;
  service: string;
  region: string | null;
  sourceSha: string | null;
  buildId: string | null;
  artifactDigest: string | null;
  revision: string | null;
  url: string | null;
};
