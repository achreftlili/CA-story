import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { listAllSessions, findSessionById, peekSessionHeader, findBranchSessions, listSharedSessions, findSharedSessionById } from '../src/discover.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'prstory-disc-'));
  const projectDir = path.join(root, '-repo-foo');
  await cp(FIX, projectDir, { recursive: true });
  return root;
}

test('discover: listAllSessions enumerates fixtures', async () => {
  const root = await setup();
  try {
    const seen = [];
    for await (const s of listAllSessions(root)) seen.push(s);
    assert.ok(seen.length >= 4);
    assert.ok(seen.every((s) => s.path.endsWith('.jsonl')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('discover: findSessionById returns matching entry', async () => {
  const root = await setup();
  try {
    const s = await findSessionById('sess-basic', root);
    assert.ok(s, 'should find sess-basic');
    assert.equal(s.sessionId, 'sess-basic');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('discover: peekSessionHeader returns cwd, gitBranch, startedAt', async () => {
  const root = await setup();
  try {
    const s = await findSessionById('sess-basic', root);
    const head = await peekSessionHeader(s.path);
    assert.equal(head.gitBranch, 'feat/healthcheck');
    assert.equal(head.cwd, '/repo/foo');
    assert.ok(head.startedAt);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('discover: findBranchSessions returns sessions matching branch when no git repo', async () => {
  const root = await setup();
  try {
    const fakeRepo = path.join(root, '..', 'no-git-repo'); // not a git repo
    const sessions = await findBranchSessions('feat/healthcheck', '/repo/foo', root);
    const ids = sessions.map((s) => s.sessionId);
    assert.ok(ids.includes('sess-basic'));
    assert.ok(ids.includes('sess-cont'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('discover: listSharedSessions enumerates .prstory/sessions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'prstory-shared-'));
  const sharedDir = path.join(root, '.prstory', 'sessions');
  await mkdir(sharedDir, { recursive: true });
  await cp(path.join(FIX, 'sess-basic.jsonl'), path.join(sharedDir, 'sess-basic.jsonl'));
  await cp(path.join(FIX, 'sess-fork.jsonl'), path.join(sharedDir, 'sess-fork.jsonl'));
  try {
    const seen = [];
    for await (const s of listSharedSessions(root)) seen.push(s);
    assert.equal(seen.length, 2);
    assert.ok(seen.every((s) => s.shared === true));
    const ids = seen.map((s) => s.sessionId).sort();
    assert.deepEqual(ids, ['sess-basic', 'sess-fork']);

    const found = await findSharedSessionById('sess-basic', root);
    assert.ok(found);
    assert.equal(found.sessionId, 'sess-basic');
    assert.equal(found.shared, true);

    const missing = await findSharedSessionById('does-not-exist', root);
    assert.equal(missing, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('discover: listSharedSessions yields nothing when .prstory/sessions missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'prstory-shared-empty-'));
  try {
    const seen = [];
    for await (const s of listSharedSessions(root)) seen.push(s);
    assert.equal(seen.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
