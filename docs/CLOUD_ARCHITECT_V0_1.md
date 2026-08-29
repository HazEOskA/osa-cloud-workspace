# OSA Cloud Architect v0.1

OSA Cloud Architect is the cloud-native expert surface inside OSA Cloud Workspace.

It delegates operator questions to the official Gemini Cloud Assist remote MCP server instead of pretending that a generic LLM has live Google Cloud context.

## Product contract

```text
Workspace operator
  -> Google admin identity
  -> /api/cloud-architect
  -> Workspace runtime ADC
  -> Gemini Cloud Assist remote MCP
  -> ask_cloud_assist
  -> project-scoped answer + contextId
  -> Workspace chat
```

v0.1 is deliberately **READ / PLAN ONLY**.

- The bridge exposes only `ask_cloud_assist`.
- There is no `invoke_operation` implementation in the Workspace bridge.
- The runtime service account remains the hard IAM boundary and should keep read-only permissions to cloud resources.
- A suggestion containing a `gcloud`, Terraform or YAML change is still only a suggestion.
- Applying infrastructure remains a separate, explicitly approved operator action.

## Google Cloud prerequisites

Gemini Cloud Assist remote MCP is currently Private Preview. Live access must not be inferred from repository state.

Enable the Cloud Assist MCP service for the project using the Google-supported setup path:

```bash
gcloud beta services mcp enable geminicloudassist.googleapis.com \
  --project=PROJECT_ID
```

The identity used by Workspace needs MCP tool-call permission and Gemini Cloud Assist access. Current Google documentation lists:

```text
roles/mcp.toolUser
roles/geminicloudassist.user
```

For resource access, keep the Workspace runtime service account on the existing read-only baseline unless a separately approved capability requires more:

```text
roles/viewer
roles/run.viewer
roles/compute.viewer
```

Do not grant broad mutation roles merely to make the chat work.

## Authentication boundary

Browser -> Workspace uses the existing Google Identity admin gate:

```text
GOOGLE_CLIENT_ID
OSA_ADMIN_EMAIL
```

Workspace -> Gemini Cloud Assist uses Application Default Credentials of the Cloud Run runtime service account and OAuth scope:

```text
https://www.googleapis.com/auth/cloud-platform
```

No API key is used or supported for the Gemini Cloud Assist MCP connection.

## MCP contract

Endpoint:

```text
https://geminicloudassist.googleapis.com/mcp
```

Tool:

```text
ask_cloud_assist
```

Request arguments:

```json
{
  "project": "projects/PROJECT_ID",
  "userQuery": "operator prompt verbatim",
  "contextId": "optional previous context id"
}
```

The returned `contextId` is stored only in browser `sessionStorage` and is forwarded on the next turn to maintain the Cloud Assist conversation.

## Evidence semantics

```text
BRIDGE READY
```

means the Workspace code can resolve a project and construct the MCP request.

```text
MCP ACCESS UNKNOWN
```

means Private Preview / IAM has not yet been mechanically proven.

```text
MCP ACCESS VERIFIED
```

is shown by the UI only after a successful authenticated Cloud Assist response in that browser session.

```text
MCP ACCESS BLOCKED
```

means the live call returned an access / allowlist / permission failure.

Repository code, CI success and a deployed Workspace revision are not sufficient evidence of Gemini Cloud Assist Private Preview access.

## v0.1 acceptance

1. Operator can open `/architect` from every Workspace screen.
2. Google admin identity is required before a Cloud Assist call.
3. The project ID is resolved from `GCP_PROJECT_ID` or runtime ADC.
4. The operator prompt is forwarded verbatim to `ask_cloud_assist`.
5. `contextId` persists multi-turn conversation state.
6. JSON and SSE MCP responses are accepted.
7. JSON-RPC and access failures fail closed and remain visible to the operator.
8. No execution MCP tool exists in the v0.1 bridge.
9. Tests prove request shape, prompt integrity, context handling and fail-closed parsing.
10. Live Private Preview access remains UNKNOWN until a real authenticated response succeeds.
