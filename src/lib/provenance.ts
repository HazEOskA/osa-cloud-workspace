export type BuildSourceShaOrigin =
  | 'COMMIT_SHA'
  | 'SHORT_SHA'
  | 'repoSource'
  | 'resolvedRepoSource'
  | 'resolvedGitSource'
  | 'gitSource'
  | 'connectedRepository'
  | 'UNKNOWN';

export type BuildImageEvidence = {
  name: string;
  digest: string | null;
  digestUri: string | null;
};

export type CloudBuildSummary = {
  id: string;
  status: string;
  createTime: string | null;
  startTime: string | null;
  finishTime: string | null;
  commitSha: string | null;
  commitShaOrigin: BuildSourceShaOrigin;
  repositoryFullName: string | null;
  serviceName: string | null;
  image: string | null;
  resultImages: BuildImageEvidence[];
  statusDetail: string | null;
  buildTriggerId: string | null;
  logUrl: string | null;
};

export type CloudBuildInput = {
  id?: string;
  status?: string;
  createTime?: string;
  startTime?: string;
  finishTime?: string;
  substitutions?: Record<string, string>;
  source?: {
    repoSource?: { commitSha?: string; repoName?: string };
    gitSource?: { revision?: string; url?: string };
    connectedRepository?: { revision?: string; repository?: string };
  };
  sourceProvenance?: {
    resolvedRepoSource?: { commitSha?: string; repoName?: string };
    resolvedGitSource?: { revision?: string; url?: string };
    resolvedConnectedRepository?: { revision?: string; repository?: string };
  };
  images?: string[];
  results?: {
    images?: Array<{ name?: string; digest?: string }>;
  };
  statusDetail?: string;
  buildTriggerId?: string;
  logUrl?: string;
};

export type ParsedArtifactImage = {
  registryHost: string;
  location: string;
  projectId: string;
  repository: string;
  packageName: string;
  baseUri: string;
  tag: string | null;
  digest: string | null;
  digestUri: string | null;
};

export type ArtifactImageSummary = {
  uri: string;
  digest: string;
  tags: string[];
  location: string;
  repository: string;
  packageName: string;
  uploadTime: string | null;
  buildTime: string | null;
};

export type CloudRunServiceSummary = {
  name: string;
  region: string;
  uri: string | null;
  generation: string | null;
  latestReadyRevision: string | null;
  revisionImage: string | null;
};

export type ProvenanceReason =
  | 'NO_LATEST_READY_REVISION'
  | 'NO_REVISION_IMAGE_DIGEST'
  | 'ARTIFACT_DIGEST_NOT_FOUND'
  | 'BUILD_DIGEST_NOT_FOUND'
  | 'BUILD_DIGEST_AMBIGUOUS'
  | 'SOURCE_SHA_MISSING'
  | 'LIVE_URL_MISSING';

export type DeploymentInventoryItem = {
  service: string;
  region: string;
  sourceSha: string | null;
  sourceShaOrigin: BuildSourceShaOrigin;
  sourceUrl: string | null;
  buildId: string | null;
  buildStatus: string | null;
  buildLogUrl: string | null;
  image: string | null;
  digest: string | null;
  artifactUri: string | null;
  revision: string | null;
  url: string | null;
  provenance: 'VERIFIED' | 'UNKNOWN';
  reasons: ProvenanceReason[];
};

type SourceShaEvidence = {
  sha: string | null;
  origin: BuildSourceShaOrigin;
};

function nonEmpty(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveBuildSourceSha(build: CloudBuildInput): SourceShaEvidence {
  const substitutions = build.substitutions ?? {};
  const candidates: Array<[BuildSourceShaOrigin, string | undefined]> = [
    ['COMMIT_SHA', substitutions.COMMIT_SHA],
    ['SHORT_SHA', substitutions.SHORT_SHA],
    ['repoSource', build.source?.repoSource?.commitSha],
    ['resolvedRepoSource', build.sourceProvenance?.resolvedRepoSource?.commitSha],
    ['resolvedGitSource', build.sourceProvenance?.resolvedGitSource?.revision],
    ['gitSource', build.source?.gitSource?.revision],
    ['connectedRepository', build.sourceProvenance?.resolvedConnectedRepository?.revision ?? build.source?.connectedRepository?.revision],
  ];

  for (const [origin, value] of candidates) {
    const sha = nonEmpty(value);
    if (sha) return { sha, origin };
  }

  return { sha: null, origin: 'UNKNOWN' };
}

function normalizeRepositoryFullName(value?: string): string | null {
  const candidate = nonEmpty(value);
  if (!candidate) return null;
  const repository = candidate.replace(/^https:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) return repository;
  return null;
}

function resolveRepositoryFullName(build: CloudBuildInput): string | null {
  const substitutions = build.substitutions ?? {};
  const candidates = [
    substitutions.REPO_FULL_NAME,
    substitutions._REPO_FULL_NAME,
    build.source?.gitSource?.url,
    build.sourceProvenance?.resolvedGitSource?.url,
  ];

  for (const candidate of candidates) {
    const repository = normalizeRepositoryFullName(candidate);
    if (repository) return repository;
  }

  return null;
}

function normalizeDigest(value?: string | null): string | null {
  const candidate = nonEmpty(value ?? undefined)?.toLowerCase() ?? null;
  return candidate && /^sha256:[a-f0-9]{64}$/.test(candidate) ? candidate : null;
}

export function parseArtifactRegistryImage(value: string): ParsedArtifactImage | null {
  const image = value.trim();
  const match = image.match(/^([a-z0-9-]+)-docker\.pkg\.dev\/([^/]+)\/([^/]+)\/(.+)$/i);
  if (!match) return null;

  const [, registryPrefix, projectId, repository, imagePath] = match;
  const digestIndex = imagePath.lastIndexOf('@sha256:');
  const lastSlash = imagePath.lastIndexOf('/');
  const tagIndex = imagePath.lastIndexOf(':');
  const hasTag = digestIndex === -1 && tagIndex > lastSlash;
  const packageName = digestIndex >= 0
    ? imagePath.slice(0, digestIndex)
    : hasTag
      ? imagePath.slice(0, tagIndex)
      : imagePath;
  const rawDigest = digestIndex >= 0 ? imagePath.slice(digestIndex + 1) : null;
  const digest = normalizeDigest(rawDigest);
  const tag = hasTag ? nonEmpty(imagePath.slice(tagIndex + 1)) : null;
  const registryHost = `${registryPrefix}-docker.pkg.dev`;
  const baseUri = `${registryHost}/${projectId}/${repository}/${packageName}`;

  return {
    registryHost,
    location: registryPrefix,
    projectId,
    repository,
    packageName,
    baseUri,
    tag,
    digest,
    digestUri: digest ? `${baseUri}@${digest}` : null,
  };
}

export function canonicalDigestUri(image: string, digest?: string | null): string | null {
  const parsed = parseArtifactRegistryImage(image);
  if (!parsed) return null;
  const normalizedDigest = normalizeDigest(digest) ?? parsed.digest;
  return normalizedDigest ? `${parsed.baseUri}@${normalizedDigest}` : null;
}

export function mapCloudBuild(build: CloudBuildInput): CloudBuildSummary {
  const source = resolveBuildSourceSha(build);
  const resultImages = (build.results?.images ?? [])
    .map((image): BuildImageEvidence | null => {
      const name = nonEmpty(image.name);
      if (!name) return null;
      const digest = normalizeDigest(image.digest);
      return { name, digest, digestUri: canonicalDigestUri(name, digest) };
    })
    .filter((image): image is BuildImageEvidence => image !== null);
  const images = (build.images ?? []).map((image) => image.trim()).filter(Boolean);

  return {
    id: nonEmpty(build.id) ?? 'UNKNOWN',
    status: nonEmpty(build.status) ?? 'UNKNOWN',
    createTime: nonEmpty(build.createTime),
    startTime: nonEmpty(build.startTime),
    finishTime: nonEmpty(build.finishTime),
    commitSha: source.sha,
    commitShaOrigin: source.origin,
    repositoryFullName: resolveRepositoryFullName(build),
    serviceName: nonEmpty(build.substitutions?._SERVICE_NAME),
    image: images[0] ?? resultImages[0]?.name ?? null,
    resultImages,
    statusDetail: nonEmpty(build.statusDetail),
    buildTriggerId: nonEmpty(build.buildTriggerId),
    logUrl: nonEmpty(build.logUrl),
  };
}

function sourceUrl(build: CloudBuildSummary): string | null {
  if (!build.repositoryFullName || !build.commitSha) return null;
  return `https://github.com/${build.repositoryFullName}/commit/${encodeURIComponent(build.commitSha)}`;
}

export function joinDeploymentProvenance(
  services: CloudRunServiceSummary[],
  builds: CloudBuildSummary[],
  artifacts: ArtifactImageSummary[],
): DeploymentInventoryItem[] {
  const artifactUris = new Set(artifacts.map((artifact) => canonicalDigestUri(artifact.uri, artifact.digest)).filter(Boolean));

  return services.map((service) => {
    const reasons: ProvenanceReason[] = [];
    const revisionImage = service.revisionImage;
    const revisionDigestUri = revisionImage ? canonicalDigestUri(revisionImage) : null;
    const parsedRevisionImage = revisionImage ? parseArtifactRegistryImage(revisionImage) : null;

    if (!service.latestReadyRevision) reasons.push('NO_LATEST_READY_REVISION');
    if (!revisionDigestUri || !parsedRevisionImage?.digest) reasons.push('NO_REVISION_IMAGE_DIGEST');

    const artifactUri = revisionDigestUri && artifactUris.has(revisionDigestUri) ? revisionDigestUri : null;
    if (revisionDigestUri && !artifactUri) reasons.push('ARTIFACT_DIGEST_NOT_FOUND');

    const buildCandidates = revisionDigestUri
      ? builds.filter((build) => build.status === 'SUCCESS' && build.resultImages.some((image) => image.digestUri === revisionDigestUri))
      : [];
    const build = buildCandidates.length === 1 ? buildCandidates[0] : null;

    if (revisionDigestUri && buildCandidates.length === 0) reasons.push('BUILD_DIGEST_NOT_FOUND');
    if (buildCandidates.length > 1) reasons.push('BUILD_DIGEST_AMBIGUOUS');
    if (build && !build.commitSha) reasons.push('SOURCE_SHA_MISSING');
    if (!service.uri) reasons.push('LIVE_URL_MISSING');

    const matchedBuildImage = build?.resultImages.find((image) => image.digestUri === revisionDigestUri) ?? null;
    const verified = Boolean(
      service.latestReadyRevision
      && service.uri
      && revisionDigestUri
      && artifactUri
      && build
      && build.commitSha
      && build.id !== 'UNKNOWN'
      && reasons.length === 0,
    );

    return {
      service: service.name,
      region: service.region,
      sourceSha: build?.commitSha ?? null,
      sourceShaOrigin: build?.commitShaOrigin ?? 'UNKNOWN',
      sourceUrl: build ? sourceUrl(build) : null,
      buildId: build && build.id !== 'UNKNOWN' ? build.id : null,
      buildStatus: build?.status ?? null,
      buildLogUrl: build?.logUrl ?? null,
      image: matchedBuildImage?.name ?? revisionImage ?? null,
      digest: parsedRevisionImage?.digest ?? null,
      artifactUri,
      revision: service.latestReadyRevision,
      url: service.uri,
      provenance: verified ? 'VERIFIED' : 'UNKNOWN',
      reasons,
    };
  });
}
