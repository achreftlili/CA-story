import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, mkdir, readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { run as shareRun } from '../src/cmd/share.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function git(cwd, args) {
  return new Promise((resolve) => {
    const c = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (err += d));
    c.on('error', () => resolve({ code: -1, out: '', err: '' }));
    c.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });
}

async function setupRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'castory-share-'));
  const projectsRoot = path.join(root, 'projects');
  const repoRoot = path.join(root, 'repo');
  await mkdir(repoRoot, { recursive: true });

  // Encode repoRoot into project-dir name so findBranchSessions picks them up.
  const encoded = '-' + repoRoot.replace(/^\//, '').replace(/\//g, '-');
  await cp(FIX, path.join(projectsRoot, encoded), { recursive: true });

  await git(repoRoot, ['init', '-b', 'main']);
  await git(repoRoot, ['config', 'user.email', 'test@example.com']);
  await git(repoRoot, ['config', 'user.name', 'test']);
  await git(repoRoot, ['config', 'commit.gpgsign', 'false']);

  return { root, projectsRoot, repoRoot };
}

function muteStdout() {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  return () => { process.stdout.write = original; };
}

function withProjectsRoot(p) {
  const prev = process.env.CASTORY_PROJECTS_ROOT;
  process.env.CASTORY_PROJECTS_ROOT = p;
  return () => {
    if (prev === undefined) delete process.env.CASTORY_PROJECTS_ROOT;
    else process.env.CASTORY_PROJECTS_ROOT = prev;
  };
}

test('share: copies branch sessions and writes manifest + commits', async () => {
  const { root, projectsRoot, repoRoot } = await setupRepo();
  const restoreEnv = withProjectsRoot(projectsRoot);
  const restoreOut = muteStdout();
  try {
    const code = await shareRun(['--branch', 'feat/healthcheck', '--repo', repoRoot]);
    assert.equal(code, 0);

    await access(path.join(repoRoot, '.castory', 'sessions', 'sess-basic.jsonl'));
    const manifest = JSON.parse(
      await readFile(path.join(repoRoot, '.castory', 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest.version, 1);
    assert.ok(manifest.branches['feat/healthcheck']);
    assert.ok(manifest.branches['feat/healthcheck'].session_ids.includes('sess-basic'));

    const log = await git(repoRoot, ['log', '--oneline']);
    assert.equal(log.code, 0);
    assert.match(log.out, /chore\(castory\): share \d+ session\(s\) for feat\/healthcheck/);
  } finally {
    restoreOut();
    restoreEnv();
    await rm(root, { recursive: true, force: true });
  }
});

test('share: --no-commit stages but does not commit', async () => {
  const { root, projectsRoot, repoRoot } = await setupRepo();
  const restoreEnv = withProjectsRoot(projectsRoot);
  const restoreOut = muteStdout();
  try {
    const code = await shareRun(['--branch', 'feat/healthcheck', '--repo', repoRoot, '--no-commit']);
    assert.equal(code, 0);

    await access(path.join(repoRoot, '.castory', 'sessions', 'sess-basic.jsonl'));
    const log = await git(repoRoot, ['log', '--oneline']);
    assert.notEqual(log.code, 0, 'expected `git log` to fail — no commits yet');

    const staged = await git(repoRoot, ['diff', '--cached', '--name-only']);
    assert.equal(staged.code, 0);
    assert.match(staged.out, /\.castory\/sessions\/sess-basic\.jsonl/);
    assert.match(staged.out, /\.castory\/manifest\.json/);
  } finally {
    restoreOut();
    restoreEnv();
    await rm(root, { recursive: true, force: true });
  }
});

test('share: --dry-run writes nothing', async () => {
  const { root, projectsRoot, repoRoot } = await setupRepo();
  const restoreEnv = withProjectsRoot(projectsRoot);
  const restoreOut = muteStdout();
  try {
    const code = await shareRun(['--branch', 'feat/healthcheck', '--repo', repoRoot, '--dry-run']);
    assert.equal(code, 0);

    let exists = false;
    try { await access(path.join(repoRoot, '.castory')); exists = true; } catch {}
    assert.equal(exists, false, '.castory must not exist after --dry-run');
  } finally {
    restoreOut();
    restoreEnv();
    await rm(root, { recursive: true, force: true });
  }
});

test('share: fails clearly when not in a git repo', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'castory-share-nogit-'));
  const restoreOut = (() => {
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;
    return () => { process.stderr.write = orig; };
  })();
  try {
    const code = await shareRun(['--branch', 'feat/healthcheck', '--repo', root]);
    assert.equal(code, 2);
  } finally {
    restoreOut();
    await rm(root, { recursive: true, force: true });
  }
});
