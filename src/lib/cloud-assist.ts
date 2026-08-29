import { GoogleAuth } from 'google-auth-library';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
export const GEMINI_CLOUD_ASSIST_MCP = 'https://geminicloudassist.googleapis.com/mcp';
export const CLOUD_ARCHITECT_TOOL = 'ask_cloud_assist' as const;

const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });

export type CloudArchitectReply = {
  content: string;
  contextId: string | null;
  projectId: string;
  tool: typeof CLOUD_ARCHITECT_TOOL;
};

export type CloudArchitectStatus = {
  bridge: 'READY' | 'PARTIAL';
  projectId: string | null;
  endpoint: string;
  tool: typeof CLOUD_ARCHITECT_TOOL;
  mode: 'READ_PLAN_ONLY';
  preview: 'PRIVATE_PREVIEW';
  access: 'UNKNOWN';
};

type JsonRecord = Record<string, unknown>;

type AgentOutput = {
  content: string;
  contextId: string | null;
};

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function extractAgentOutput(payload: unknown): AgentOutput | null {
  const root = asRecord(payload);
  if (!root) return null;

  const error = asRecord(root.error);
  if (error) {
    const message = typeof error.message === 'string' ? error.message : JSON.stringify(error);
    throw new Error(`Gemini Cloud Assist MCP error: ${message}`);
  }

  const result = asRecord(root.result);
  const structured = result
    ? asRecord(result.structuredContent) ?? asRecord(result.structured_content)
    : null;

  for (const candidate of [structured, result, root]) {
    if (!candidate || typeof candidate.content !== 'string') continue;
    return {
      content: candidate.content,
      contextId: typeof candidate.contextId === 'string'
        ? candidate.contextId
        : typeof candidate.context_id === 'string'
          ? candidate.context_id
          : null,
    };
  }

  const contentItems = result?.content;
  if (Array.isArray(contentItems)) {
    const plainText: string[] = [];
    for (const item of contentItems) {
      const record = asRecord(item);
      if (!record || typeof record.text !== 'string') continue;
      const text = record.text.trim();
      if (!text) continue;
      try {
        const nested = extractAgentOutput(JSON.parse(text));
        if (nested) return nested;
      } catch (error) {
        if (error instanceof SyntaxError) {
          plainText.push(text);
          continue;
        }
        throw error;
      }
      plainText.push(text);
    }
    if (plainText.length > 0) {
      return { content: plainText.join('\n'), contextId: null };
    }
  }

  return null;
}

export function buildAskCloudAssistEnvelope(
  projectId: string,
  userQuery: string,
  contextId?: string | null,
): JsonRecord {
  const argumentsPayload: JsonRecord = {
    project: `projects/${projectId}`,
    userQuery,
  };
  if (contextId) argumentsPayload.contextId = contextId;

  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: CLOUD_ARCHITECT_TOOL,
      arguments: argumentsPayload,
    },
  };
}

export function parseMcpResponseText(raw: string): AgentOutput {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Gemini Cloud Assist MCP returned an empty response.');

  const candidates: string[] = [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    candidates.push(trimmed);
  }
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data && data !== '[DONE]') candidates.push(data);
  }

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const output = extractAgentOutput(JSON.parse(candidates[index]));
      if (output) return output;
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }

  throw new Error('Gemini Cloud Assist MCP response did not contain agent content.');
}

export async function resolveCloudProjectId(): Promise<string> {
  const explicit = process.env.GCP_PROJECT_ID?.trim();
  if (explicit) return explicit;

  const detected = await auth.getProjectId();
  if (!detected) throw new Error('Nie udało się wykryć GCP Project ID dla Cloud Architect.');
  return detected;
}

export async function getCloudArchitectStatus(): Promise<CloudArchitectStatus> {
  try {
    const projectId = await resolveCloudProjectId();
    return {
      bridge: 'READY',
      projectId,
      endpoint: GEMINI_CLOUD_ASSIST_MCP,
      tool: CLOUD_ARCHITECT_TOOL,
      mode: 'READ_PLAN_ONLY',
      preview: 'PRIVATE_PREVIEW',
      access: 'UNKNOWN',
    };
  } catch {
    return {
      bridge: 'PARTIAL',
      projectId: null,
      endpoint: GEMINI_CLOUD_ASSIST_MCP,
      tool: CLOUD_ARCHITECT_TOOL,
      mode: 'READ_PLAN_ONLY',
      preview: 'PRIVATE_PREVIEW',
      access: 'UNKNOWN',
    };
  }
}

export async function askCloudArchitect(input: {
  userQuery: string;
  contextId?: string | null;
}): Promise<CloudArchitectReply> {
  const userQuery = input.userQuery;
  if (!userQuery.trim()) throw new Error('Pytanie do Cloud Architect nie może być puste.');
  if (userQuery.length > 16_000) throw new Error('Pytanie do Cloud Architect jest za długie.');

  const projectId = await resolveCloudProjectId();
  const client = await auth.getClient();
  const access = await client.getAccessToken();
  const token = access.token;
  if (!token) throw new Error('ADC nie zwróciło access tokenu dla Gemini Cloud Assist MCP.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(GEMINI_CLOUD_ASSIST_MCP, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'x-goog-user-project': projectId,
      },
      body: JSON.stringify(buildAskCloudAssistEnvelope(projectId, userQuery, input.contextId)),
      cache: 'no-store',
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      const detail = raw.trim().slice(0, 1200) || response.statusText;
      throw new Error(`Gemini Cloud Assist MCP HTTP ${response.status}: ${detail}`);
    }

    const parsed = parseMcpResponseText(raw);
    return {
      ...parsed,
      projectId,
      tool: CLOUD_ARCHITECT_TOOL,
    };
  } finally {
    clearTimeout(timeout);
  }
}
