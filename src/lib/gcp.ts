import { GoogleAuth } from 'google-auth-library';
import {
  joinDeploymentProvenance,
  mapCloudBuild,
  parseArtifactRegistryImage,
  type ArtifactImageSummary,
  type CloudBuildInput,
  type CloudBuildSummary,
  type CloudRunServiceSummary,
  type DeploymentInventoryItem,
} from '@/lib/provenance';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });

export type GcpConnectionStatus = {
  connected: boolean;
  projectId: string | null;
  identity: 'ADC';
  principal: string | null;
  regions: string[];
  error?: string;
};

export type VmSummary = {
  id: string;
  name: string;
  zone: string;
  status: string;
  machineType: string;
  internalIp: string | null;
  externalIp: string | null;
};

export type ResourceReadError = {
  source: 'identity' | 'cloud-build' | 'cloud-run-service' | 'cloud-run-revision' | 'artifact-registry';
  scope: string;
  resource: string | null;
  message: string;
};

export type DeploymentInventoryResult = {
  deployments: DeploymentInventoryItem[];
  services: CloudRunServiceSummary[];
  builds: CloudBuildSummary[];
  artifacts: ArtifactImageSummary[];
  errors: ResourceReadError[];
  scope: {
    builds: 'global';
    regions: string[];
  };
};

export function getConfiguredRegions(): string[] {
  return [...new Set(
    (process.env.GCP_REGIONS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

export async function resolveProjectId(): Promise<string> {
  const explicitProject = process.env.GCP_PROJECT_ID?.trim();
  if (explicitProject) return explicitProject;

  const detectedProject = await auth.getProjectId();
  if (!detectedProject) {
    throw new Error('Nie udało się wykryć GCP Project ID z ADC. Ustaw GCP_PROJECT_ID lub skonfiguruj Application Default Credentials.');
  }
  return detectedProject;
}

async function gcpGet<T>(url: string): Promise<T> {
  const client = await auth.getClient();
  const response = await client.request<T>({ url, method: 'GET' });
  return response.data;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function withPageToken(url: string, pageToken: string | null): string {
  if (!pageToken) return url;
  const parsed = new URL(url);
  parsed.searchParams.set('pageToken', pageToken);
  return parsed.toString();
}

export async function getConnectionStatus(): Promise<GcpConnectionStatus> {
  try {
    const projectId = await resolveProjectId();
    await auth.getClient();
    const credentials = await auth.getCredentials();
    return {
      connected: true,
      projectId,
      identity: 'ADC',
      principal: credentials.client_email?.trim() || null,
      regions: getConfiguredRegions(),
    };
  } catch (error) {
    return {
      connected: false,
      projectId: null,
      identity: 'ADC',
      principal: null,
      regions: getConfiguredRegions(),
      error: errorMessage(error, 'Nieznany błąd połączenia z Google Cloud.'),
    };
  }
}

type ComputeAggregatedResponse = {
  items?: Record<
    string,
    {
      instances?: Array<{
        id?: string;
        name?: string;
        zone?: string;
        status?: string;
        machineType?: string;
        networkInterfaces?: Array<{
          networkIP?: string;
          accessConfigs?: Array<{ natIP?: string }>;
        }>;
      }>;
    }
  >;
};

function tail(resourceName?: string): string {
  if (!resourceName) return 'UNKNOWN';
  const parts = resourceName.split('/');
  return parts.at(-1) ?? resourceName;
}

export async function listVms(): Promise<VmSummary[]> {
  const projectId = await resolveProjectId();
  const data = await gcpGet<ComputeAggregatedResponse>(
    `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(projectId)}/aggregated/instances?returnPartialSuccess=true`,
  );

  const vms: VmSummary[] = [];
  for (const scopedList of Object.values(data.items ?? {})) {
    for (const vm of scopedList.instances ?? []) {
      const nic = vm.networkInterfaces?.[0];
      vms.push({
        id: vm.id ?? vm.name ?? 'UNKNOWN',
        name: vm.name ?? 'UNKNOWN',
        zone: tail(vm.zone),
        status: vm.status ?? 'UNKNOWN',
        machineType: tail(vm.machineType),
        internalIp: nic?.networkIP ?? null,
        externalIp: nic?.accessConfigs?.[0]?.natIP ?? null,
      });
    }
  }

  return vms.sort((a, b) => a.name.localeCompare(b.name));
}

type CloudBuildListResponse = {
  builds?: CloudBuildInput[];
  nextPageToken?: string;
};

export async function listCloudBuilds(): Promise<{
  builds: CloudBuildSummary[];
  scope: 'global';
}> {
  const projectId = await resolveProjectId();
  const baseUrl = `https://cloudbuild.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/builds?pageSize=100`;
  const rawBuilds: CloudBuildInput[] = [];
  let pageToken: string | null = null;

  do {
    const data: CloudBuildListResponse = await gcpGet<CloudBuildListResponse>(withPageToken(baseUrl, pageToken));
    rawBuilds.push(...(data.builds ?? []));
    pageToken = data.nextPageToken?.trim() || null;
  } while (pageToken);

  const builds = rawBuilds
    .map(mapCloudBuild)
    .filter((build) => build.serviceName !== null || build.resultImages.some((image) => image.digestUri !== null) || build.image !== null)
    .sort((a, b) => {
      const aTime = a.createTime ? Date.parse(a.createTime) : 0;
      const bTime = b.createTime ? Date.parse(b.createTime) : 0;
      return bTime - aTime;
    });

  return { builds, scope: 'global' };
}

type CloudRunListResponse = {
  services?: Array<{
    name?: string;
    uri?: string;
    generation?: string;
    latestReadyRevision?: string;
  }>;
  nextPageToken?: string;
};

type CloudRunRevisionResponse = {
  containers?: Array<{ image?: string }>;
};

type RegionalCloudRunResult = {
  services: CloudRunServiceSummary[];
  errors: ResourceReadError[];
};

async function listCloudRunRegion(projectId: string, region: string): Promise<RegionalCloudRunResult> {
  const baseUrl = `https://run.googleapis.com/v2/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}/services?pageSize=100`;
  const rawServices: NonNullable<CloudRunListResponse['services']> = [];
  let pageToken: string | null = null;

  try {
    do {
      const data: CloudRunListResponse = await gcpGet<CloudRunListResponse>(withPageToken(baseUrl, pageToken));
      rawServices.push(...(data.services ?? []));
      pageToken = data.nextPageToken?.trim() || null;
    } while (pageToken);
  } catch (error) {
    return {
      services: [],
      errors: [{
        source: 'cloud-run-service',
        scope: region,
        resource: null,
        message: errorMessage(error, 'Nieznany błąd Cloud Run API.'),
      }],
    };
  }

  const revisionResults = await Promise.all(rawServices.map(async (service) => {
    const name = tail(service.name);
    const latestReadyRevision = service.latestReadyRevision ? tail(service.latestReadyRevision) : null;
    let revisionImage: string | null = null;
    let revisionError: ResourceReadError | null = null;

    if (service.latestReadyRevision) {
      try {
        const revision = await gcpGet<CloudRunRevisionResponse>(`https://run.googleapis.com/v2/${service.latestReadyRevision}`);
        revisionImage = revision.containers?.[0]?.image?.trim() || null;
      } catch (error) {
        revisionError = {
          source: 'cloud-run-revision',
          scope: region,
          resource: latestReadyRevision,
          message: errorMessage(error, 'Nieznany błąd odczytu rewizji Cloud Run.'),
        };
      }
    }

    return {
      service: {
        name,
        region,
        uri: service.uri?.trim() || null,
        generation: service.generation?.trim() || null,
        latestReadyRevision,
        revisionImage,
      },
      error: revisionError,
    };
  }));

  return {
    services: revisionResults.map((result) => result.service),
    errors: revisionResults.flatMap((result) => result.error ? [result.error] : []),
  };
}

export async function listCloudRunServices(): Promise<{
  services: CloudRunServiceSummary[];
  errors: ResourceReadError[];
}> {
  const projectId = await resolveProjectId();
  const regions = getConfiguredRegions();

  if (regions.length === 0) {
    return {
      services: [],
      errors: [{
        source: 'cloud-run-service',
        scope: 'UNKNOWN',
        resource: null,
        message: 'Brak GCP_REGIONS. Cloud Run v2 wymaga konkretnego regionu przy listowaniu usług.',
      }],
    };
  }

  const results = await Promise.all(regions.map((region) => listCloudRunRegion(projectId, region)));
  return {
    services: results.flatMap((result) => result.services).sort((a, b) => `${a.region}/${a.name}`.localeCompare(`${b.region}/${b.name}`)),
    errors: results.flatMap((result) => result.errors),
  };
}

type ArtifactRegistryListResponse = {
  dockerImages?: Array<{
    uri?: string;
    tags?: string[];
    uploadTime?: string;
    buildTime?: string;
  }>;
  nextPageToken?: string;
};

type ArtifactRepositoryTarget = {
  projectId: string;
  location: string;
  repository: string;
};

function artifactTargets(projectId: string, images: Array<string | null>): ArtifactRepositoryTarget[] {
  const targets = new Map<string, ArtifactRepositoryTarget>();
  for (const image of images) {
    if (!image) continue;
    const parsed = parseArtifactRegistryImage(image);
    if (!parsed || parsed.projectId !== projectId) continue;
    const target = { projectId, location: parsed.location, repository: parsed.repository };
    targets.set(`${target.location}/${target.repository}`, target);
  }
  return [...targets.values()];
}

async function listArtifactRepository(target: ArtifactRepositoryTarget): Promise<{
  artifacts: ArtifactImageSummary[];
  errors: ResourceReadError[];
}> {
  const baseUrl = `https://artifactregistry.googleapis.com/v1/projects/${encodeURIComponent(target.projectId)}/locations/${encodeURIComponent(target.location)}/repositories/${encodeURIComponent(target.repository)}/dockerImages?pageSize=100`;
  const artifacts: ArtifactImageSummary[] = [];
  let pageToken: string | null = null;

  try {
    do {
      const data: ArtifactRegistryListResponse = await gcpGet<ArtifactRegistryListResponse>(withPageToken(baseUrl, pageToken));
      for (const image of data.dockerImages ?? []) {
        const uri = image.uri?.trim();
        if (!uri) continue;
        const parsed = parseArtifactRegistryImage(uri);
        if (!parsed?.digest) continue;
        artifacts.push({
          uri,
          digest: parsed.digest,
          tags: image.tags ?? [],
          location: parsed.location,
          repository: parsed.repository,
          packageName: parsed.packageName,
          uploadTime: image.uploadTime?.trim() || null,
          buildTime: image.buildTime?.trim() || null,
        });
      }
      pageToken = data.nextPageToken?.trim() || null;
    } while (pageToken);

    return { artifacts, errors: [] };
  } catch (error) {
    return {
      artifacts: [],
      errors: [{
        source: 'artifact-registry',
        scope: target.location,
        resource: target.repository,
        message: errorMessage(error, 'Nieznany błąd Artifact Registry API.'),
      }],
    };
  }
}

export async function getDeploymentInventory(): Promise<DeploymentInventoryResult> {
  const projectId = await resolveProjectId();
  const errors: ResourceReadError[] = [];
  const [runResult, buildResult] = await Promise.allSettled([
    listCloudRunServices(),
    listCloudBuilds(),
  ]);

  const services = runResult.status === 'fulfilled' ? runResult.value.services : [];
  if (runResult.status === 'fulfilled') errors.push(...runResult.value.errors);
  else {
    errors.push({
      source: 'cloud-run-service',
      scope: 'UNKNOWN',
      resource: null,
      message: errorMessage(runResult.reason, 'Nieznany błąd Cloud Run API.'),
    });
  }

  const builds = buildResult.status === 'fulfilled' ? buildResult.value.builds : [];
  if (buildResult.status === 'rejected') {
    errors.push({
      source: 'cloud-build',
      scope: 'global',
      resource: null,
      message: errorMessage(buildResult.reason, 'Nieznany błąd Cloud Build API.'),
    });
  }

  const targets = artifactTargets(projectId, [
    ...services.map((service) => service.revisionImage),
    ...builds.flatMap((build) => [build.image, ...build.resultImages.map((image) => image.name)]),
  ]);
  const artifactResults = await Promise.all(targets.map(listArtifactRepository));
  const artifacts = artifactResults.flatMap((result) => result.artifacts);
  errors.push(...artifactResults.flatMap((result) => result.errors));

  return {
    deployments: joinDeploymentProvenance(services, builds, artifacts),
    services,
    builds,
    artifacts,
    errors,
    scope: { builds: 'global', regions: getConfiguredRegions() },
  };
}
