import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUD_ARCHITECT_TOOL,
  buildAskCloudAssistEnvelope,
  parseMcpResponseText,
} from './cloud-assist.ts';

test('builds the exact ask_cloud_assist MCP contract without rewriting the user prompt', () => {
  const prompt = 'Sprawdź Cloud Run osa-cloud-workspace i powiedz czemu ostatnia rewizja nie jest ready.';
  const envelope = buildAskCloudAssistEnvelope('fluid-fiber-477010-a8', prompt, 'ctx-123');

  assert.equal(envelope.method, 'tools/call');
  const params = envelope.params as Record<string, unknown>;
  assert.equal(params.name, CLOUD_ARCHITECT_TOOL);
  const args = params.arguments as Record<string, unknown>;
  assert.equal(args.project, 'projects/fluid-fiber-477010-a8');
  assert.equal(args.userQuery, prompt);
  assert.equal(args.contextId, 'ctx-123');
});

test('omits contextId for a fresh conversation', () => {
  const envelope = buildAskCloudAssistEnvelope('project-1', 'Co działa w tym projekcie?');
  const params = envelope.params as Record<string, unknown>;
  const args = params.arguments as Record<string, unknown>;
  assert.equal('contextId' in args, false);
});

test('parses structuredContent returned by MCP tools/call', () => {
  const parsed = parseMcpResponseText(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: {
      structuredContent: {
        content: 'Cloud Run service is healthy.',
        contextId: 'ctx-next',
      },
    },
  }));

  assert.deepEqual(parsed, {
    content: 'Cloud Run service is healthy.',
    contextId: 'ctx-next',
  });
});

test('parses SSE MCP responses and nested text output', () => {
  const nested = JSON.stringify({ content: 'IAM review complete.', contextId: 'ctx-sse' });
  const raw = [
    'event: message',
    `data: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: nested }] } })}`,
    '',
  ].join('\n');

  assert.deepEqual(parseMcpResponseText(raw), {
    content: 'IAM review complete.',
    contextId: 'ctx-sse',
  });
});

test('fails closed on JSON-RPC errors', () => {
  assert.throws(
    () => parseMcpResponseText(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32000, message: 'permission denied' },
    })),
    /permission denied/,
  );
});
