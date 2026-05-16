import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseSession } from '../src/parse.js';
import { extractEvents } from '../src/extract.js';
import { buildTimeline } from '../src/timeline.js';
import { consolidate, tokenSetSimilarity } from '../src/consolidate.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('consolidate: dedupes identical chapters across sessions', async () => {
  const a = buildTimeline(extractEvents(await parseSession(path.join(FIX, 'sess-basic.jsonl'))), { sessionId: 'sess-basic' });
  const b = buildTimeline(extractEvents(await parseSession(path.join(FIX, 'sess-cont.jsonl'))), { sessionId: 'sess-cont' });
  const story = consolidate([a, b], 'feat/healthcheck');
  assert.equal(story.chapters.length, 1, `expected 1 merged chapter, got ${story.chapters.length}`);
  assert.equal(story.chapters[0].session_ids.length, 2);
});

test('consolidate: preserves every intervention', async () => {
  const a = buildTimeline(extractEvents(await parseSession(path.join(FIX, 'sess-basic.jsonl'))), { sessionId: 'sess-basic' });
  const b = buildTimeline(extractEvents(await parseSession(path.join(FIX, 'sess-cont.jsonl'))), { sessionId: 'sess-cont' });
  const beforeInts = (a.chapters.flatMap((c) => c.interventions).length
    + b.chapters.flatMap((c) => c.interventions).length);
  const story = consolidate([a, b], 'feat/healthcheck');
  const afterInts = story.chapters.flatMap((c) => c.interventions).length;
  assert.equal(afterInts, beforeInts);
  assert.ok(afterInts >= 1);
});

test('consolidate: token-set similarity behaves', () => {
  assert.equal(tokenSetSimilarity('add healthcheck', 'add healthcheck'), 1);
  assert.ok(tokenSetSimilarity('add healthcheck to traefik', 'add a healthcheck for traefik') > 0.7);
  assert.equal(tokenSetSimilarity('hello world', 'goodbye'), 0);
});
