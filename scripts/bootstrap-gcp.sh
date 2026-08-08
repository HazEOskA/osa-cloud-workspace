#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-europe-west1}"
AR_REPO="${AR_REPO:-osa-cloud-workspace}"
RUNTIME_SA_NAME="${RUNTIME_SA_NAME:-osa-cloud-workspace-runtime}"
BUILD_SA_NAME="${BUILD_SA_NAME:-osa-cloud-workspace-build}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "Brak PROJECT_ID. Ustaw: export PROJECT_ID=twoj-project-id"
  exit 1
fi

RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SA="${BUILD_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Projekt: ${PROJECT_ID}"
echo "Region:  ${REGION}"

gcloud config set project "${PROJECT_ID}"

gcloud services enable \
  run.googleapis.com \
  compute.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com

if ! gcloud artifacts repositories describe "${AR_REPO}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${AR_REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="OSA Cloud Workspace images"
fi

if ! gcloud iam service-accounts describe "${RUNTIME_SA}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${RUNTIME_SA_NAME}" \
    --display-name="OSA Cloud Workspace runtime"
fi

if ! gcloud iam service-accounts describe "${BUILD_SA}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${BUILD_SA_NAME}" \
    --display-name="OSA Cloud Workspace build"
fi

for ROLE in roles/compute.viewer roles/run.viewer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="${ROLE}" \
    --condition=None >/dev/null
  echo "Runtime: ${ROLE}"
done

for ROLE in roles/artifactregistry.writer roles/run.admin roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${BUILD_SA}" \
    --role="${ROLE}" \
    --condition=None >/dev/null
  echo "Build: ${ROLE}"
done

gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/iam.serviceAccountUser" >/dev/null

echo
echo "BOOTSTRAP OK"
echo "Runtime SA: ${RUNTIME_SA}"
echo "Build SA:   ${BUILD_SA}"
echo "Artifact Registry: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"
echo
echo "Następnie utwórz Cloud Build trigger dla repo HazEOskA/osa-cloud-workspace i ustaw jego Service Account na:"
echo "${BUILD_SA}"
