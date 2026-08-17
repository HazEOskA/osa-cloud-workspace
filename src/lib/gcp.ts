import { GoogleAuth } from 'google-auth-library';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });

export type GcpConnectionStatus = {
  connected: boolean;
  projectId: string | null;
  identity: 'ADC';
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

export type CloudRunServiceSummary = {
  name: string;
  region: string;
  uri: string | null;
  generation: string | null;
  latestReadyRevision: string | null;
};

export type CloudBuildSummary = {
  id: string;
  status: string;
  createTime: string | null;
  startTime: string | null;
  finishTime: string | null;
  commitSha: string | null;
  serviceName: string | null;
  image: string | null;
  statusDetail: string | null;
  buildTriggerId: string | null;
  logUrl: string | null;
};

export function getConfiguredRegions(): string[] {
  return (process.env.GCP_REGIONS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
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

export async function getConnectionStatus(): Promise<GcpConnectionStatus> {
  try {
    const projectId = await resolveProjectId();
    await auth.getClient();
    return {
      connected: true,
      projectId,
      identity: 'ADC',
      regions: getConfiguredRegions(),
    };
  } catch (error) {
    return {
      connected: false,
      projectId: null,
      identity: 'ADC',
      regions: getConfiguredRegions(),
      error: error instanceof Error ? error.message : 'Nieznany błąd połączenia z Google Cloud.',
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

type CloudRunListResponse = {
  services?: Array<{
    name?: string;
    uri?: string;
    generation?: string;
    latestReadyRevision?: string;
  }>;
};

type CloudBuildListResponse = {
  builds?: Array<{
    id?: string;
    status?: string;
    createTime?: string;
    startTime?: string;
    finishTime?: string;
    substitutions?: Record<string, string>;
    source?: {
      repoSource?: {
        commitSha?: string;
      };
    };
    images?: string[];
    statusDetail?: string;
    buildTriggerId?: string;
    logUrl?: string;
  }>;
};

const WORKSPACE_SERVICE = 'osa-cloud-workspace';
const WORKSPACE_IMAGE_PATH = '/osa-cloud-workspace/osa-cloud-workspace:';

export async function listCloudBuilds(): Promise<{
  builds: CloudBuildSummary[];
  scope: 'global';
  service: 'osa-cloud-workspace';
}> {
  const projectId = await resolveProjectId();
  const data = await gcpGet<CloudBuildListResponse>(
    `https://cloudbuild.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/builds?pageSize=100`,
  );

  const builds = (data.builds ?? [])
    .filter((build) => {
      const substitutions = build.substitutions ?? {};
      return (
        substitutions._SERVICE_NAME === WORKSPACE_SERVICE
        || substitutions._AR_REPO === WORKSPACE_SERVICE
        || (build.images ?? []).some((image) => image.includes(WORKSPACE_IMAGE_PATH))
      );
    })
    .map((build): CloudBuildSummary => {
      const substitutions = build.substitutions ?? {};
      const workspaceImage = (build.images ?? []).find((image) => image.includes(WORKSPACE_IMAGE_PATH));

      return {
        id: build.id ?? 'UNKNOWN',
        status: build.status ?? 'UNKNOWN',
        createTime: build.createTime ?? null,
        startTime: build.startTime ?? null,
        finishTime: build.finishTime ?? null,
        commitSha:
          substitutions.COMMIT_SHA ??
          substitutions.SHORT_SHA ??
          build.source?.repoSource?.commitSha ??
          null,
        serviceName: substitutions._SERVICE_NAME ?? null,
        image: workspaceImage ?? build.images?.[0] ?? null,
        statusDetail: build.statusDetail ?? null,
        buildTriggerId: build.buildTriggerId ?? null,
        logUrl: build.logUrl ?? null,
      };
    })
    .sort((a, b) => {
      const aTime = a.createTime ? Date.parse(a.createTime) : 0;
      const bTime = b.createTime ? Date.parse(b.createTime) : 0;
      return bTime - aTime;
    });

  return {
    builds,
    scope: 'global',
    service: WORKSPACE_SERVICE,
  };
}

export async function listCloudRunServices(): Promise<{
  services: CloudRunServiceSummary[];
  errors: Array<{ region: string; message: string }>;
}> {
  const projectId = await resolveProjectId();
  const regions = getConfiguredRegions();

  if (regions.length === 0) {
    return {
      services: [],
      errors: [{ region: 'BRAK', message: 'Brak GCP_REGIONS. Cloud Run v2 wymaga konkretnego regionu przy listowaniu usług.' }],
    };
  }

  const results = await Promise.all(
    regions.map(async (region) => {
      try {
        const data = await gcpGet<CloudRunListResponse>(
          `https://run.googleapis.com/v2/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}/services`,
        );
        return {
          region,
          services: (data.services ?? []).map((service) => ({
            name: tail(service.name),
            region,
            uri: service.uri ?? null,
            generation: service.generation ?? null,
            latestReadyRevision: tail(service.latestReadyRevision),
          })),
          error: null,
        };
      } catch (error) {
        return {
          region,
          services: [] as CloudRunServiceSummary[],
          error: error instanceof Error ? error.message : 'Nieznany błąd Cloud Run API.',
        };
      }
    }),
  );

  return {
    services: results.flatMap((result) => result.services).sort((a, b) => a.name.localeCompare(b.name)),
    errors: results.filter((result) => result.error).map((result) => ({ region: result.region, message: result.error as string })),
  };
}
