import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseSession, messageText } from '../src/parse.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('parse: basic fixture yields expected event count', async () => {
  const { events, stats } = await parseSession(path.join(FIX, 'sess-basic.jsonl'));
  assert.equal(stats.badLines, 0);
  assert.ok(events.length >= 7, `events should be >=7, got ${events.length}`);
  const types = events.map((e) => e.kind);
  assert.ok(types.includes('user'));
  assert.ok(types.includes('assistant'));
});

test('parse: tolerates a truncated final line', async () => {
  const { events, stats } = await parseSession(path.join(FIX, 'sess-trunc.jsonl'));
  assert.equal(stats.badLines, 1, 'one bad line expected');
  assert.equal(events.length, 2, 'two good events expected');
});

test('parse: messageText handles both string and array content', async () => {
  const { events } = await parseSession(path.join(FIX, 'sess-basic.jsonl'));
  const u1 = events.find((e) => e.uuid === 'u1');
  assert.equal(messageText(u1), 'Add a healthcheck to traefik.yml');
  const a1 = events.find((e) => e.uuid === 'a1');
  assert.match(messageText(a1), /healthcheck/);
});

test('parse: output is byte-stable across runs', async () => {
  const a = await parseSession(path.join(FIX, 'sess-basic.jsonl'));
  const b = await parseSession(path.join(FIX, 'sess-basic.jsonl'));
  assert.deepEqual(a.events, b.events);
});
