import { GoogleAuth } from 'google-auth-library';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const CLOUD_ASSIST_MCP_URL = 'https://geminicloudassist.googleapis.com/mcp';
const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });

export const CLOUD_ASSIST_TOOLS = ['ask_cloud_assist', 'investigate_issue', 'optimize_costs'] as const;
export type CloudAssistTool = (typeof CLOUD_ASSIST_TOOLS)[number];

export type CloudAssistRequest = {
  projectId: string;
  userQuery: string;
  contextId?: string | null;
  tool?: CloudAssistTool;
};

export type CloudAssistResponse = {
  content: string;
  contextId: string | null;
  tool: CloudAssistTool;
};

type JsonObject = Record<string, unknown>;

type McpEnvelope = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function parseMcpPayload(raw: unknown): McpEnvelope {
  if (isObject(raw)) return raw as McpEnvelope;
  if (typeof raw !== 'string') throw new Error('Gemini Cloud Assist zwrócił nieobsługiwany format odpowiedzi.');

  const direct = parseJson(raw);
  if (isObject(direct)) return direct as McpEnvelope;

  const events = raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean)
    .map(parseJson)
    .filter(isObject);

  const last = events.at(-1);
  if (!last) throw new Error('Gemini Cloud Assist zwrócił pusty albo nieczytelny strumień MCP.');
  return last as McpEnvelope;
}

function extractOutputCandidate(value: unknown): { content?: string; contextId?: string } | null {
  if (!isObject(value)) return null;

  if (typeof value.content === 'string') {
    return {
      content: value.content,
      contextId: typeof value.contextId === 'string' ? value.contextId : undefined,
    };
  }

  const structured = value.structuredContent;
  if (isObject(structured) && typeof structured.content === 'string') {
    return {
      content: structured.content,
      contextId: typeof structured.contextId === 'string' ? structured.contextId : undefined,
    };
  }

  const content = value.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!isObject(part) || typeof part.text !== 'string') continue;
      const nested = parseJson(part.text);
      if (isObject(nested) && typeof nested.content === 'string') {
        return {
          content: nested.content,
          contextId: typeof nested.contextId === 'string' ? nested.contextId : undefined,
        };
      }
      return { content: part.text };
    }
  }

  return null;
}

export function extractCloudAssistOutput(envelope: McpEnvelope): { content: string; contextId: string | null } {
  if (envelope.error) {
    const details = typeof envelope.error.data === 'string' ? ` ${envelope.error.data}` : '';
    throw new Error(`${envelope.error.message ?? 'Gemini Cloud Assist MCP error.'}${details}`.trim());
  }

  const output = extractOutputCandidate(envelope.result);
  if (!output?.content) throw new Error('Gemini Cloud Assist nie zwrócił treści odpowiedzi.');
  return { content: output.content, contextId: output.contextId ?? null };
}

export function makeReadOnlyQuery(userQuery: string): string {
  const trimmed = userQuery.trim();
  if (!trimmed) throw new Error('Zapytanie do Gemini Cloud Assist nie może być puste.');
  if (trimmed.length > 20_000) throw new Error('Zapytanie do Gemini Cloud Assist jest zbyt długie.');

  return [
    '[OSA CLOUD WORKSPACE — READ-ONLY SESSION]',
    'Nie wykonuj żadnych mutacji w Google Cloud. Nie uruchamiaj operacji zmieniających zasoby, IAM, sieć, deploymenty ani konfigurację.',
    'Możesz diagnozować, czytać stan, analizować logi oraz proponować dokładne działania lub komendy, ale ich nie wykonuj. Jeśli użytkownik prosi o zmianę, opisz plan i zaznacz, że wymaga osobnego approval gate w OSA Cloud Workspace.',
    '',
    trimmed,
  ].join('\n');
}

export function isCloudAssistTool(value: unknown): value is CloudAssistTool {
  return typeof value === 'string' && (CLOUD_ASSIST_TOOLS as readonly string[]).includes(value);
}

export async function callCloudAssist(input: CloudAssistRequest): Promise<CloudAssistResponse> {
  const tool = input.tool ?? 'ask_cloud_assist';
  if (!isCloudAssistTool(tool)) throw new Error(`Niedozwolone narzędzie Cloud Assist: ${String(tool)}`);

  const projectId = input.projectId.trim();
  if (!projectId) throw new Error('Brak GCP Project ID.');

  const argumentsPayload: Record<string, string> = {
    project: `projects/${projectId}`,
    userQuery: makeReadOnlyQuery(input.userQuery),
  };
  if (input.contextId?.trim()) argumentsPayload.contextId = input.contextId.trim();

  const client = await auth.getClient();
  const response = await client.request<unknown>({
    url: CLOUD_ASSIST_MCP_URL,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: tool,
        arguments: argumentsPayload,
      },
    },
    responseType: 'text',
  });

  const envelope = parseMcpPayload(response.data);
  const output = extractCloudAssistOutput(envelope);
  return { ...output, tool };
}
