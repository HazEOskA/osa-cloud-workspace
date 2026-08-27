export type AgentMode = 'READ' | 'PLAN';

export type AgentRuntimeStatus = {
  configured: boolean;
  mode: 'READ_ONLY';
  projectId: string | null;
  location: string;
  resourceId: string | null;
  resourceName: string | null;
};

export type AgentQueryRequest = {
  message: string;
  userId?: string;
  sessionId?: string;
};

export type AgentQueryResponse = {
  mode: AgentMode;
  answer: string;
  eventCount: number;
  sessionId: string | null;
  runtime: AgentRuntimeStatus;
};

const MUTATION_PATTERNS = [
  /\bdeploy\b/i,
  /\bredeploy\b/i,
  /\bpush\b/i,
  /\bcommit\b/i,
  /\bdelete\b/i,
  /\brestart\b/i,
  /\bupdate\b/i,
  /\bcreate\b/i,
  /\bwrite\b/i,
  /\bzmień\b/i,
  /\bzmien\b/i,
  /\busuń\b/i,
  /\busun\b/i,
  /\butwórz\b/i,
  /\butworz\b/i,
  /\bwdr[oó]ż\b/i,
  /\bwypchnij\b/i,
  /\bzrestartuj\b/i,
];

export function classifyAgentMode(message: string): AgentMode {
  const normalized = message.replace(/\s+/g, ' ').trim();
  return MUTATION_PATTERNS.some((pattern) => pattern.test(normalized)) ? 'PLAN' : 'READ';
}

export function normalizeAgentUserId(value: string | undefined): string {
  const normalized = (value ?? 'osa-operator').trim().replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 128);
  return normalized || 'osa-operator';
}
