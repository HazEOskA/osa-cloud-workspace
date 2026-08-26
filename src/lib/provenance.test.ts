import test from 'node:test';
import assert from 'node:assert/strict';
import {
  joinDeploymentProvenance,
  mapCloudBuild,
  resolveBuildSourceSha,
  type ArtifactImageSummary,
  type CloudRunServiceSummary,
} from './provenance.ts';

const digest = `sha256:${'a'.repeat(64)}`;
const taggedImage = 'europe-west1-docker.pkg.dev/test-project/workspace/osa-cloud-workspace:abc1234';
const digestImage = `europe-west1-docker.pkg.dev/test-project/workspace/osa-cloud-workspace@${digest}`;

test('COMMIT_SHA has priority over every fallback', () => {
  assert.deepEqual(resolveBuildSourceSha({
    substitutions: { COMMIT_SHA: 'full-sha', SHORT_SHA: 'short-sha' },
    source: { repoSource: { commitSha: 'repo-sha' } },
  }), { sha: 'full-sha', origin: 'COMMIT_SHA' });
});

test('SHORT_SHA remains the first fallback', () => {
  assert.deepEqual(resolveBuildSourceSha({
    substitutions: { SHORT_SHA: 'abc1234' },
    source: { repoSource: { commitSha: 'repo-sha' } },
  }), { sha: 'abc1234', origin: 'SHORT_SHA' });
});

test('repoSource commit SHA remains covered', () => {
  assert.deepEqual(resolveBuildSourceSha({
    source: { repoSource: { commitSha: 'repo-sha' } },
  }), { sha: 'repo-sha', origin: 'repoSource' });
});

test('missing source evidence stays UNKNOWN', () => {
  assert.deepEqual(resolveBuildSourceSha({}), { sha: null, origin: 'UNKNOWN' });
});

function service(image: string | null = digestImage): CloudRunServiceSummary {
  return {
    name: 'osa-cloud-workspace',
    region: 'europe-west1',
    uri: 'https://osa-cloud-workspace.example.run.app',
    generation: '12',
    latestReadyRevision: 'osa-cloud-workspace-00012-abc',
    revisionImage: image,
  };
}

function artifact(): ArtifactImageSummary {
  return {
    uri: digestImage,
    digest,
    tags: ['abc1234'],
    location: 'europe-west1',
    repository: 'workspace',
    packageName: 'osa-cloud-workspace',
    uploadTime: '2026-08-21T10:00:00Z',
    buildTime: '2026-08-21T09:59:00Z',
  };
}

function successfulBuild(id = 'build-1') {
  return mapCloudBuild({
    id,
    status: 'SUCCESS',
    createTime: '2020-01-01T00:00:00Z',
    substitutions: {
      COMMIT_SHA: 'd7a356e36309e8409b826c182afc2ca634c4ff27',
      REPO_FULL_NAME: 'HazEOskA/osa-cloud-workspace',
      _SERVICE_NAME: 'osa-cloud-workspace',
    },
    images: [taggedImage],
    results: { images: [{ name: taggedImage, digest }] },
    logUrl: `https://console.cloud.google.com/cloud-build/builds/${id}`,
  });
}

test('joins the live revision only through the exact immutable digest', () => {
  const [deployment] = joinDeploymentProvenance([service()], [successfulBuild()], [artifact()]);

  assert.equal(deployment.provenance, 'VERIFIED');
  assert.equal(deployment.buildId, 'build-1');
  assert.equal(deployment.digest, digest);
  assert.equal(deployment.artifactUri, digestImage);
  assert.equal(
    deployment.sourceUrl,
    'https://github.com/HazEOskA/osa-cloud-workspace/commit/d7a356e36309e8409b826c182afc2ca634c4ff27',
  );
  assert.deepEqual(deployment.reasons, []);
});

test('never joins a tag-only revision by time or image name', () => {
  const [deployment] = joinDeploymentProvenance([service(taggedImage)], [successfulBuild()], [artifact()]);

  assert.equal(deployment.provenance, 'UNKNOWN');
  assert.equal(deployment.buildId, null);
  assert.ok(deployment.reasons.includes('NO_REVISION_IMAGE_DIGEST'));
});

test('ambiguous digest-to-build evidence remains UNKNOWN', () => {
  const [deployment] = joinDeploymentProvenance(
    [service()],
    [successfulBuild('build-1'), successfulBuild('build-2')],
    [artifact()],
  );

  assert.equal(deployment.provenance, 'UNKNOWN');
  assert.equal(deployment.buildId, null);
  assert.ok(deployment.reasons.includes('BUILD_DIGEST_AMBIGUOUS'));
});

test('missing Artifact Registry evidence remains UNKNOWN', () => {
  const [deployment] = joinDeploymentProvenance([service()], [successfulBuild()], []);

  assert.equal(deployment.provenance, 'UNKNOWN');
  assert.equal(deployment.artifactUri, null);
  assert.ok(deployment.reasons.includes('ARTIFACT_DIGEST_NOT_FOUND'));
});
