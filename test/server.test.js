import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'prstory-srv-'));
  await cp(FIX, path.join(root, '-repo-foo'), { recursive: true });
  return root;
}

test('server: GET / returns the dashboard shell with prstory-data', async () => {
  const root = await setup();
  const srv = await startServer({ projectsRoot: root, projectPaths: null, port: 0 });
  try {
    const res = await fetch(srv.url);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<title>prstory dashboard<\/title>/);
    assert.match(html, /id="prstory-data"/);
  } finally {
    await srv.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('server: GET /api/index returns JSON with sessions', async () => {
  const root = await setup();
  const srv = await startServer({ projectsRoot: root, projectPaths: null, port: 0 });
  try {
    const res = await fetch(srv.url + 'api/index');
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.sessions.length >= 4);
    assert.ok(json.generated_at);
  } finally {
    await srv.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('server: GET /api/session/:id returns body fragment', async () => {
  const root = await setup();
  const srv = await startServer({ projectsRoot: root, projectPaths: null, port: 0 });
  try {
    const res = await fetch(srv.url + 'api/session/sess-basic');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /traefik\.yml/);
    assert.equal(html.includes('<html'), false, 'should be a fragment, not full doc');
  } finally {
    await srv.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('server: GET /api/session/missing returns 404', async () => {
  const root = await setup();
  const srv = await startServer({ projectsRoot: root, projectPaths: null, port: 0 });
  try {
    const res = await fetch(srv.url + 'api/session/does-not-exist');
    assert.equal(res.status, 404);
  } finally {
    await srv.close();
    await rm(root, { recursive: true, force: true });
  }
});
