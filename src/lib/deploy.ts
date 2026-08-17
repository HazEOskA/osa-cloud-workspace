import { GoogleAuth } from 'google-auth-library';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });

const OWNER = 'HazEOskA';
const REGION = 'europe-west1';
const AR_REPOSITORY = 'osa-cloud-workspace';
const BUILD_SERVICE_ACCOUNT = 'osa-cloud-build';
const RUNTIME_SERVICE_ACCOUNT = 'osa-cloud-workspace';

const REPO_NAME = /^[A-Za-z0-9_.-]+$/;
const BRANCH_NAME = /^[A-Za-z0-9._/-]+$/;
const SERVICE_NAME = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type BuildOperation = {
  name?: string;
  metadata?: {
    build?: {
      id?: string;
      status?: string;
      logUrl?: string;
    };
  };
};

export type RepoDeployRequest = {
  repo: string;
  branch: string;
  serviceName: string;
};

export type RepoDeployResult = {
  accepted: true;
  operationName: string | null;
  buildId: string | null;
  status: string;
  logUrl: string | null;
  repoUrl: string;
  serviceName: string;
};

async function resolveProjectId(): Promise<string> {
  const explicitProject = process.env.GCP_PROJECT_ID?.trim();
  if (explicitProject) return explicitProject;

  const detectedProject = await auth.getProjectId();
  if (!detectedProject) throw new Error('Nie udało się wykryć GCP Project ID.');
  return detectedProject;
}

export async function submitPublicRepoDeploy(input: RepoDeployRequest): Promise<RepoDeployResult> {
  const repo = input.repo.trim();
  const branch = input.branch.trim();
  const serviceName = input.serviceName.trim();

  if (!REPO_NAME.test(repo)) throw new Error('Nieprawidłowa nazwa repozytorium.');
  if (!BRANCH_NAME.test(branch)) throw new Error('Nieprawidłowa nazwa brancha.');
  if (!SERVICE_NAME.test(serviceName)) {
    throw new Error('Nazwa usługi Cloud Run musi mieć 1-63 znaki: małe litery, cyfry i myślniki.');
  }

  const projectId = await resolveProjectId();
  const repoUrl = `https://github.com/${OWNER}/${repo}.git`;
  const image = `${REGION}-docker.pkg.dev/${projectId}/${AR_REPOSITORY}/${serviceName}:$BUILD_ID`;
  const buildServiceAccount = `projects/${projectId}/serviceAccounts/${BUILD_SERVICE_ACCOUNT}@${projectId}.iam.gserviceaccount.com`;
  const runtimeServiceAccount = `${RUNTIME_SERVICE_ACCOUNT}@${projectId}.iam.gserviceaccount.com`;

  const build = {
    steps: [
      {
        name: 'gcr.io/cloud-builders/git',
        args: ['clone', '--depth=1', '--branch', branch, repoUrl, '/workspace/source'],
      },
      {
        name: 'gcr.io/cloud-builders/docker',
        args: ['build', '-t', image, '/workspace/source'],
      },
      {
        name: 'gcr.io/cloud-builders/docker',
        args: ['push', image],
      },
      {
        name: 'gcr.io/google.com/cloudsdktool/cloud-sdk:slim',
        entrypoint: 'gcloud',
        args: [
          'run',
          'deploy',
          serviceName,
          `--image=${image}`,
          `--region=${REGION}`,
          '--platform=managed',
          `--service-account=${runtimeServiceAccount}`,
          '--no-invoker-iam-check',
          '--max-instances=2',
          '--quiet',
        ],
      },
    ],
    images: [image],
    serviceAccount: buildServiceAccount,
    options: {
      logging: 'CLOUD_LOGGING_ONLY',
    },
  };

  const client = await auth.getClient();
  const response = await client.request<BuildOperation>({
    url: `https://cloudbuild.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/builds`,
    method: 'POST',
    data: build,
  });

  const operation = response.data;
  const createdBuild = operation.metadata?.build;

  return {
    accepted: true,
    operationName: operation.name ?? null,
    buildId: createdBuild?.id ?? null,
    status: createdBuild?.status ?? 'QUEUED',
    logUrl: createdBuild?.logUrl ?? null,
    repoUrl,
    serviceName,
  };
}
