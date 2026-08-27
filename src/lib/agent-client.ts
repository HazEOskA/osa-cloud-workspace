import { GoogleAuth } from 'google-auth-library';
import type { AgentQueryResponse, AgentRuntimeStatus } from '@/lib/agent-contract';
import { classifyAgentMode, normalizeAgentUserId } from '@/lib/agent-contract';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });

async function resolveAgentProjectId(): Promise<string | null> {
  const explicit = process.env.OSA_AGENT_PROJECT_ID?.trim() || process.env.GCP_PROJECT_ID?.trim();
  if (explicit) return explicit;
  try {
    return (await auth.getProjectId())?.trim() || null;
  } catch {
    return null;
  }
}

export async function getAgentRuntimeStatus(): Promise<AgentRuntimeStatus> {
  const projectId = await resolveAgentProjectId();
  const location = process.env.OSA_AGENT_LOCATION?.trim() || 'europe-west1';
  const resourceId = process.env.OSA_AGENT_RESOURCE_ID?.trim() || null;
  const resourceName = projectId && resourceId
    ? `projects/${projectId}/locations/${location}/reasoningEngines/${resourceId}`
    : null;

  return {
    configured: Boolean(resourceName),
    mode: 'READ_ONLY',
    projectId,
    location,
    resourceId,
    resourceName,
  };
}

function parseSseEvents(body: string): unknown[] {
  const dataLines = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  if (dataLines.length === 0) {
    try {
      return [JSON.parse(body) as unknown];
    } catch {
      return body.trim() ? [body.trim()] : [];
    }
  }

  return dataLines.map((line) => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      return line;
    }
  });
}

function collectText(value: unknown, depth = 0): string[] {
  if (depth > 8 || value === null || value === undefined) return [];
  if (typeof value === 'string') return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item, depth + 1));
  if (typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const direct = ['text', 'output', 'answer']
    .map((key) => record[key])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

  return [
    ...direct,
    ...Object.entries(record)
      .filter(([key]) => !['text', 'output', 'answer'].includes(key))
      .flatMap(([, item]) => collectText(item, depth + 1)),
  ];
}

function findSessionId(value: unknown, depth = 0): string | null {
  if (depth > 8 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSessionId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of ['session_id', 'sessionId']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  for (const item of Object.values(record)) {
    const found = findSessionId(item, depth + 1);
    if (found) return found;
  }
  return null;
}

export async function queryCloudAgent(input: {
  message: string;
  userId?: string;
  sessionId?: string;
}): Promise<AgentQueryResponse> {
  const runtime = await getAgentRuntimeStatus();
  if (!runtime.configured || !runtime.resourceName || !runtime.projectId) {
    throw new Error('OSA Cloud Agent Runtime jest NIEPOŁĄCZONY. Brak OSA_AGENT_RESOURCE_ID lub Project ID.');
  }

  const message = input.message.trim();
  if (!message) throw new Error('Wiadomość do agenta nie może być pusta.');
  if (message.length > 12_000) throw new Error('Wiadomość przekracza limit 12000 znaków.');

  const mode = classifyAgentMode(message);
  const client = await auth.getClient();
  const response = await client.request<string>({
    url: `https://${runtime.location}-aiplatform.googleapis.com/v1/${runtime.resourceName}:streamQuery`,
    method: 'POST',
    params: { alt: 'sse' },
    responseType: 'text',
    data: {
      class_method: 'async_stream_query',
      input: {
        user_id: normalizeAgentUserId(input.userId),
        ...(input.sessionId?.trim() ? { session_id: input.sessionId.trim() } : {}),
        message: mode === 'PLAN'
          ? `[PHASE1_MODE=PLAN][NO_EXECUTION] ${message}`
          : `[PHASE1_MODE=READ][NO_EXECUTION] ${message}`,
      },
    },
  });

  const rawBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  const events = parseSseEvents(rawBody);
  const texts = events.flatMap((event) => collectText(event)).filter(Boolean);
  const answer = texts.at(-1)?.trim() || (mode === 'PLAN'
    ? 'AWAITING_APPROVAL — Phase 1 nie posiada execution capability.'
    : 'Agent odpowiedział bez tekstowej części. Sprawdź event stream po stronie runtime.');

  return {
    mode,
    answer,
    eventCount: events.length,
    sessionId: findSessionId(events) ?? input.sessionId?.trim() ?? null,
    runtime,
  };
}
