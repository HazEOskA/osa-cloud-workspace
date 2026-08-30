type JsonRecord = Record<string, unknown>;

type ExecutionForceMethod = 'GET' | 'POST';

export type ExecutionForceBridgeStatus = {
  configured: boolean;
  urlConfigured: boolean;
  apiKeyConfigured: boolean;
  baseUrl: string | null;
  auth: 'SERVER_SIDE_BEARER';
  authority: 'OSA_RUNTIME_V2';
};

export class ExecutionForceError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.name = 'ExecutionForceError';
    this.status = status;
    this.detail = detail;
  }
}

function bridgeConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.OSA_EXECUTION_FORCE_URL?.trim().replace(/\/+$/, '') ?? '';
  const apiKey = process.env.OSA_EXECUTION_FORCE_API_KEY?.trim() ?? '';

  if (!baseUrl || !apiKey) {
    throw new ExecutionForceError(
      503,
      'Execution Force bridge is not configured.',
      {
        code: 'EXECUTION_FORCE_NOT_CONFIGURED',
        urlConfigured: Boolean(baseUrl),
        apiKeyConfigured: Boolean(apiKey),
      },
    );
  }

  return { baseUrl, apiKey };
}

export function getExecutionForceBridgeStatus(): ExecutionForceBridgeStatus {
  const baseUrl = process.env.OSA_EXECUTION_FORCE_URL?.trim().replace(/\/+$/, '') ?? '';
  const apiKeyConfigured = Boolean(process.env.OSA_EXECUTION_FORCE_API_KEY?.trim());
  return {
    configured: Boolean(baseUrl) && apiKeyConfigured,
    urlConfigured: Boolean(baseUrl),
    apiKeyConfigured,
    baseUrl: baseUrl || null,
    auth: 'SERVER_SIDE_BEARER',
    authority: 'OSA_RUNTIME_V2',
  };
}

function safeJson(raw: string): unknown {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw.slice(0, 4000);
  }
}

async function callExecutionForce(
  path: string,
  method: ExecutionForceMethod,
  body?: JsonRecord,
): Promise<unknown> {
  const { baseUrl, apiKey } = bridgeConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });

    const raw = await response.text();
    const payload = safeJson(raw);
    if (!response.ok) {
      throw new ExecutionForceError(
        response.status,
        `Execution Force HTTP ${response.status}`,
        payload,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof ExecutionForceError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ExecutionForceError(504, 'Execution Force request timed out.', {
        code: 'EXECUTION_FORCE_TIMEOUT',
      });
    }
    throw new ExecutionForceError(502, 'Execution Force request failed.', {
      code: 'EXECUTION_FORCE_UNREACHABLE',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeExecutionForce(): Promise<unknown> {
  return callExecutionForce('/api/v1/auth/status', 'GET');
}

export async function resolveExecutionSkill(payload: JsonRecord): Promise<unknown> {
  return callExecutionForce('/api/v2/skills/resolve', 'POST', payload);
}

export async function runExecutionMission(payload: JsonRecord): Promise<unknown> {
  return callExecutionForce('/api/v2/missions/run', 'POST', payload);
}

export async function getExecutionMission(missionId: string): Promise<unknown> {
  return callExecutionForce(`/api/v2/missions/${encodeURIComponent(missionId)}`, 'GET');
}

export async function resumeExecutionMission(
  missionId: string,
  payload: JsonRecord,
): Promise<unknown> {
  return callExecutionForce(
    `/api/v2/missions/${encodeURIComponent(missionId)}/resume`,
    'POST',
    payload,
  );
}
