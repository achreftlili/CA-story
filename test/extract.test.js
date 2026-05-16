import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseSession } from '../src/parse.js';
import { extractEvents } from '../src/extract.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function ex(name) {
  const parsed = await parseSession(path.join(FIX, name));
  return extractEvents(parsed);
}

test('extract: decision/action/outcome flow from sess-basic.jsonl', async () => {
  const events = await ex('sess-basic.jsonl');
  const types = events.map((e) => e.type);
  assert.ok(types.includes('decision'), `decisions: ${JSON.stringify(types)}`);
  assert.ok(types.includes('action'), `actions: ${JSON.stringify(types)}`);
  assert.ok(types.includes('outcome'), `outcomes: ${JSON.stringify(types)}`);

  const editAction = events.find(
    (e) => e.type === 'action' && e.meta?.tool_name === 'Edit',
  );
  assert.ok(editAction, 'expected an Edit action');
  assert.equal(editAction.meta.file_path, '/repo/foo/traefik/traefik.yml');
});

test('extract: detects fork + subsequent intervention', async () => {
  const events = await ex('sess-fork.jsonl');
  const fork = events.find((e) => e.type === 'fork');
  const intervention = events.find((e) => e.type === 'intervention');
  assert.ok(fork, 'expected fork event');
  assert.ok(intervention, 'expected intervention event');
  assert.equal(intervention.meta.after_fork, true);
});

test('extract: confirmations are NOT interventions', async () => {
  const parsed = {
    events: [
      makeAssistant('I will run the tests.', 'a1'),
      makeUser('yes', 'u1'),
    ],
  };
  const events = extractEvents(parsed);
  assert.equal(events.filter((e) => e.type === 'intervention').length, 0);
});

test('extract: skips system-reminder/automated user messages', async () => {
  const parsed = {
    events: [
      makeUser('<system-reminder>foo</system-reminder>', 'u1', { isMeta: true }),
      makeUser('<command-name>/foo</command-name>', 'u2'),
      makeUser('actually use Bash not Edit', 'u3'),
    ],
  };
  const events = extractEvents(parsed);
  const ints = events.filter((e) => e.type === 'intervention');
  assert.equal(ints.length, 1);
  assert.match(ints[0].raw_text, /actually use Bash/);
});

function makeAssistant(text, uuid) {
  return {
    kind: 'assistant',
    type: 'assistant',
    timestamp: '2026-05-10T10:00:00.000Z',
    sessionId: 'x',
    cwd: '/x',
    gitBranch: 'main',
    uuid,
    parentUuid: null,
    lineOffset: 0,
    raw: { message: { role: 'assistant', content: [{ type: 'text', text }] } },
  };
}
function makeUser(text, uuid, extra = {}) {
  return {
    kind: 'user',
    type: 'user',
    timestamp: '2026-05-10T10:00:01.000Z',
    sessionId: 'x',
    cwd: '/x',
    gitBranch: 'main',
    uuid,
    parentUuid: null,
    lineOffset: 0,
    raw: { message: { role: 'user', content: text }, ...extra },
  };
}
