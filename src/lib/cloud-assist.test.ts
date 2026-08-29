import assert from 'node:assert/strict';
import test from 'node:test';
import { extractCloudAssistOutput, makeReadOnlyQuery, parseMcpPayload } from './cloud-assist.ts';

test('parseMcpPayload parses JSON responses', () => {
  const envelope = parseMcpPayload(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { structuredContent: { content: 'OK', contextId: 'ctx-1' } },
  }));

  assert.deepEqual(extractCloudAssistOutput(envelope), { content: 'OK', contextId: 'ctx-1' });
});

test('parseMcpPayload parses SSE responses', () => {
  const envelope = parseMcpPayload([
    'event: message',
    'data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\\"content\\":\\"Diagnoza\\",\\"contextId\\":\\"ctx-2\\"}"}]}}',
    '',
  ].join('\n'));

  assert.deepEqual(extractCloudAssistOutput(envelope), { content: 'Diagnoza', contextId: 'ctx-2' });
});

test('makeReadOnlyQuery locks the agent into read-only mode', () => {
  const query = makeReadOnlyQuery('Sprawdź dlaczego Cloud Run ma 503');
  assert.match(query, /READ-ONLY SESSION/);
  assert.match(query, /Nie wykonuj żadnych mutacji/);
  assert.match(query, /Sprawdź dlaczego Cloud Run ma 503/);
});

test('makeReadOnlyQuery rejects empty prompts', () => {
  assert.throws(() => makeReadOnlyQuery('   '), /nie może być puste/);
});
