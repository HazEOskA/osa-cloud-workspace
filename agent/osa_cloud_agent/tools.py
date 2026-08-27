from __future__ import annotations

import os
from typing import Any

import google.auth
from google.auth.transport.requests import AuthorizedSession
import requests

_CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
_GITHUB_OWNER = os.getenv("OSA_GITHUB_OWNER", "HazEOskA")
_ALLOWED_TOOLS = {
    "gcp_connection_status",
    "list_cloud_run_services",
    "list_cloud_builds",
    "get_github_repo_snapshot",
}


def _credentials() -> tuple[Any, str]:
    credentials, detected_project = google.auth.default(scopes=[_CLOUD_PLATFORM_SCOPE])
    project_id = (os.getenv("GCP_PROJECT_ID") or detected_project or "").strip()
    if not project_id:
        raise RuntimeError("GCP project is UNKNOWN. Configure GCP_PROJECT_ID or ADC project discovery.")
    return credentials, project_id


def _session() -> tuple[AuthorizedSession, str]:
    credentials, project_id = _credentials()
    return AuthorizedSession(credentials), project_id


def _regions() -> list[str]:
    raw = os.getenv("GCP_REGIONS", "europe-west1,europe-west4")
    return list(dict.fromkeys(region.strip() for region in raw.split(",") if region.strip()))


def gcp_connection_status() -> dict[str, Any]:
    """Return read-only identity/project configuration for the current agent runtime."""
    credentials, project_id = _credentials()
    return {
        "connected": True,
        "project_id": project_id,
        "regions": _regions(),
        "identity_type": type(credentials).__name__,
        "mode": "READ_ONLY",
    }


def list_cloud_run_services() -> dict[str, Any]:
    """List Cloud Run services and latest ready revisions. Performs GET requests only."""
    session, project_id = _session()
    services: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for region in _regions():
        url = f"https://run.googleapis.com/v2/projects/{project_id}/locations/{region}/services?pageSize=100"
        page_token: str | None = None
        while True:
            params = {"pageToken": page_token} if page_token else None
            response = session.get(url, params=params, timeout=20)
            if not response.ok:
                errors.append({"region": region, "status": str(response.status_code), "error": response.text[:500]})
                break
            payload = response.json()
            for service in payload.get("services", []):
                services.append({
                    "name": str(service.get("name", "UNKNOWN")).split("/")[-1],
                    "region": region,
                    "uri": service.get("uri"),
                    "latest_ready_revision": str(service.get("latestReadyRevision", "")).split("/")[-1] or None,
                    "generation": service.get("generation"),
                })
            page_token = payload.get("nextPageToken")
            if not page_token:
                break

    return {"project_id": project_id, "services": services, "errors": errors, "mode": "READ_ONLY"}


def list_cloud_builds(limit: int = 20) -> dict[str, Any]:
    """Return recent Cloud Build evidence. Performs GET requests only."""
    safe_limit = min(max(int(limit), 1), 100)
    session, project_id = _session()
    response = session.get(
        f"https://cloudbuild.googleapis.com/v1/projects/{project_id}/builds",
        params={"pageSize": safe_limit},
        timeout=20,
    )
    response.raise_for_status()
    builds = []
    for build in response.json().get("builds", []):
        source = build.get("sourceProvenance", {}).get("resolvedRepoSource", {})
        substitutions = build.get("substitutions", {})
        builds.append({
            "id": build.get("id"),
            "status": build.get("status"),
            "create_time": build.get("createTime"),
            "finish_time": build.get("finishTime"),
            "commit_sha": source.get("commitSha") or substitutions.get("COMMIT_SHA"),
            "repo": source.get("repoName") or substitutions.get("REPO_NAME"),
            "log_url": build.get("logUrl"),
            "images": build.get("results", {}).get("images", []),
        })
    return {"project_id": project_id, "builds": builds, "mode": "READ_ONLY"}


def get_github_repo_snapshot(repo: str = "osa-cloud-workspace") -> dict[str, Any]:
    """Read repository metadata and the latest commit from GitHub using GET only."""
    repo = repo.strip()
    if not repo or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_." for char in repo):
        raise ValueError("Invalid repository name.")

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "OSA-Cloud-Agent-ReadOnly",
    }
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    metadata = requests.get(
        f"https://api.github.com/repos/{_GITHUB_OWNER}/{repo}",
        headers=headers,
        timeout=20,
    )
    metadata.raise_for_status()
    repo_data = metadata.json()

    commits = requests.get(
        f"https://api.github.com/repos/{_GITHUB_OWNER}/{repo}/commits",
        params={"per_page": 1},
        headers=headers,
        timeout=20,
    )
    commits.raise_for_status()
    latest = commits.json()[0] if commits.json() else {}

    return {
        "owner": _GITHUB_OWNER,
        "repo": repo,
        "private": repo_data.get("private"),
        "default_branch": repo_data.get("default_branch"),
        "updated_at": repo_data.get("updated_at"),
        "pushed_at": repo_data.get("pushed_at"),
        "latest_commit_sha": latest.get("sha"),
        "latest_commit_message": latest.get("commit", {}).get("message"),
        "mode": "READ_ONLY",
    }


__all__ = sorted(_ALLOWED_TOOLS)
