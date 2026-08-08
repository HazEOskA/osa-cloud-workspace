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
