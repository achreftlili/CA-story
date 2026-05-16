import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { run as runDashboard } from '../src/cmd/dashboard.js';
import { run as runList } from '../src/cmd/list.js';
import { run as runSession } from '../src/cmd/session.js';
import { run as runPr } from '../src/cmd/pr.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function setupRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'castory-int-'));
  const projectDir = path.join(root, '-repo-foo');
  await cp(FIX, projectDir, { recursive: true });
  return root;
}

async function withFakeHome(root, fn) {
  // Redirect ~/.claude/projects to our fixture root + ~/.cache to a tmp dir
  // by setting HOME — `os.homedir()` honors $HOME on POSIX.
  const fakeHome = await mkdtemp(path.join(tmpdir(), 'castory-home-'));
  const dest = path.join(fakeHome, '.claude', 'projects');
  await cp(root, dest, { recursive: true });
  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    return await fn(fakeHome);
  } finally {
    if (prevHome !== undefined) process.env.HOME = prevHome;
    else delete process.env.HOME;
    await rm(fakeHome, { recursive: true, force: true });
  }
}

test('integration: dashboard --out writes a self-contained HTML', async () => {
  const root = await setupRoot();
  try {
    await withFakeHome(root, async (fakeHome) => {
      const outFile = path.join(fakeHome, 'out.html');
      const code = await runDashboard(['--out', outFile, '--no-open']);
      assert.equal(code, 0);
      const html = await readFile(outFile, 'utf8');
      assert.match(html, /<title>castory dashboard<\/title>/);
      assert.match(html, /id="castory-data"/);
      // All 5 fixture session ids should appear in the embedded JSON.
      for (const id of ['sess-basic', 'sess-cont', 'sess-fork', 'sess-trunc', 'sess-xss']) {
        assert.match(html, new RegExp(id), `${id} should be embedded`);
      }
      // Zero external HTTP/HTTPS references in the output.
      assert.equal(/https?:\/\//.test(html), false, 'no external URLs allowed');
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('integration: list prints rows', async () => {
  const root = await setupRoot();
  await withFakeHome(root, async () => {
    const chunks = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (b) => { chunks.push(Buffer.from(b)); return true; };
    try {
      await runList(['--json']);
    } finally {
      process.stdout.write = orig;
    }
    const out = Buffer.concat(chunks).toString('utf8');
    const data = JSON.parse(out);
    assert.ok(Array.isArray(data));
    assert.ok(data.length >= 4);
  });
  await rm(root, { recursive: true, force: true });
});

test('integration: session renders to file', async () => {
  const root = await setupRoot();
  await withFakeHome(root, async (fakeHome) => {
    const outFile = path.join(fakeHome, 'sess.html');
    const code = await runSession(['sess-basic', '--out', outFile]);
    assert.equal(code, 0);
    const html = await readFile(outFile, 'utf8');
    assert.match(html, /<!doctype html>/);
    assert.match(html, /traefik\.yml/);
  });
  await rm(root, { recursive: true, force: true });
});

test('integration: pr --branch outputs markdown with interventions', async () => {
  const root = await setupRoot();
  await withFakeHome(root, async (fakeHome) => {
    const outFile = path.join(fakeHome, 'pr.md');
    const code = await runPr(['--branch', 'feat/healthcheck', '--repo', '/repo/foo', '--out', outFile]);
    assert.equal(code, 0);
    const md = await readFile(outFile, 'utf8');
    assert.match(md, /# PR Story/);
    assert.match(md, /## Your Calls/);
    assert.match(md, /📌/);
  });
  await rm(root, { recursive: true, force: true });
});
