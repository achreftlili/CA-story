import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseSession } from '../src/parse.js';
import { extractEvents } from '../src/extract.js';
import { buildTimeline } from '../src/timeline.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('timeline: groups events into chapters with titles', async () => {
  const parsed = await parseSession(path.join(FIX, 'sess-basic.jsonl'));
  const events = extractEvents(parsed);
  const tl = buildTimeline(events, { sessionId: 'sess-basic' });
  assert.ok(tl.chapters.length >= 1);
  assert.ok(tl.chapters[0].title);
  assert.ok(tl.chapters[0].files_touched.length >= 1);
});

test('timeline: idle gap > 5 min triggers a new chapter', () => {
  const events = [
    decision('First idea', '2026-05-10T10:00:00.000Z'),
    action('Edit /a.js', '2026-05-10T10:00:01.000Z'),
    decision('Second idea', '2026-05-10T10:30:00.000Z'),
    action('Edit /b.js', '2026-05-10T10:30:01.000Z'),
  ];
  const tl = buildTimeline(events, { sessionId: 's' });
  assert.equal(tl.chapters.length, 2);
});

function decision(text, ts) {
  return { type: 'decision', raw_text: text, session_id: 's', timestamp: ts, line_offset: 0, meta: {} };
}
function action(text, ts) {
  return {
    type: 'action', raw_text: text, session_id: 's', timestamp: ts, line_offset: 0,
    meta: { tool_name: 'Edit', file_path: text.split(' ')[1] },
  };
}
