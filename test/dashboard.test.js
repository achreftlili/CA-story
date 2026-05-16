import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, writeFile, utimes, stat, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildIndex } from '../src/dashboard.js';
import { renderDashboardHtml } from '../src/render/dashboard-html.js';
import { escapeHtml } from '../src/util/escape.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function setupTempProjects() {
  const root = await mkdtemp(path.join(tmpdir(), 'prstory-test-'));
  const projectDir = path.join(root, '-repo-foo');
  await cp(FIX, projectDir, { recursive: true });
  return root;
}

test('dashboard: buildIndex returns sessions for fixtures', async () => {
  const root = await setupTempProjects();
  try {
    const idx = await buildIndex({ projectsRoot: root });
    assert.ok(idx.sessions.length >= 4, `expected ≥4 sessions, got ${idx.sessions.length}`);
    const ids = idx.sessions.map((s) => s.id);
    assert.ok(ids.includes('sess-basic'));
    assert.ok(ids.includes('sess-fork'));
    assert.ok(ids.includes('sess-cont'));
    const sessBasic = idx.sessions.find((s) => s.id === 'sess-basic');
    assert.ok(sessBasic.files_touched.includes('/repo/foo/traefik/traefik.yml'));
    assert.equal(sessBasic.git_branch, 'feat/healthcheck');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dashboard: cache invalidates when JSONL mtime changes', async () => {
  const root = await setupTempProjects();
  // Use a project-local cache by overriding the cache path via env.
  // Instead, since we cannot easily redirect ~/.cache, just verify the
  // observable property: changing the file content yields different
  // summary.
  try {
    const before = await buildIndex({ projectsRoot: root });
    const sBefore = before.sessions.find((s) => s.id === 'sess-basic');
    const beforeFiles = sBefore.files_touched.length;

    const fp = path.join(root, '-repo-foo', 'sess-basic.jsonl');
    const existing = await readFile(fp, 'utf8');
    // Append a tool_use that touches a new file → observable in files_touched.
    const newLine = '\n' + JSON.stringify({
      parentUuid: 'u3',
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tnew', name: 'Edit', input: {
          file_path: '/repo/foo/NEW.md', old_string: 'a', new_string: 'b',
        } }],
      },
      uuid: 'a99',
      timestamp: '2026-05-10T10:01:00.000Z',
      cwd: '/repo/foo',
      sessionId: 'sess-basic',
      gitBranch: 'feat/healthcheck',
    });
    await writeFile(fp, existing + newLine, 'utf8');
    const future = new Date(Date.now() + 5000);
    await utimes(fp, future, future);

    const after = await buildIndex({ projectsRoot: root });
    const sAfter = after.sessions.find((s) => s.id === 'sess-basic');
    assert.ok(
      sAfter.files_touched.length > beforeFiles,
      `expected files_touched to grow after mtime change; before=${beforeFiles} after=${sAfter.files_touched.length}`,
    );
    assert.ok(sAfter.files_touched.includes('/repo/foo/NEW.md'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dashboard HTML: embeds JSON payload and escapes </script>', () => {
  const html = renderDashboardHtml({
    generated_at: '2026-01-01T00:00:00.000Z',
    version: '1.0',
    projects: [{ name: 'foo', path: '/x', session_count: 1 }],
    sessions: [{
      id: 'sess-x', project_path: '/x', project_name: 'foo',
      started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:00.000Z',
      duration_seconds: 1, message_count: 1, files_touched: [],
      first_user_message: 'hi </script><script>alert(1)</script>',
      git_branch: 'main', intervention_count: 0, tool_calls: {},
      summary: 'hi',
    }],
  }, {});
  assert.match(html, /<script type="application\/json" id="prstory-data">/);
  assert.equal(html.includes('</script><script>alert(1)</script>'), false, 'must escape host </script>');
});

test('escape: <script> rendered as &lt;script&gt;', () => {
  assert.equal(escapeHtml("<script>alert('x')</script>"),
    '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;');
});

test('dashboard: buildIndex merges shared sessions when repoRoot has .prstory/sessions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'prstory-merge-'));
  const projectsRoot = path.join(root, 'projects');
  await mkdir(projectsRoot, { recursive: true });
  const repoRoot = path.join(root, 'repo');
  const sharedDir = path.join(repoRoot, '.prstory', 'sessions');
  await mkdir(sharedDir, { recursive: true });
  await cp(path.join(FIX, 'sess-basic.jsonl'), path.join(sharedDir, 'sess-basic.jsonl'));
  try {
    const idx = await buildIndex({ projectsRoot, repoRoot });
    const s = idx.sessions.find((x) => x.id === 'sess-basic');
    assert.ok(s, 'expected sess-basic in merged index');
    assert.equal(s.shared, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dashboard: buildIndex dedupes shared sessions when also present locally', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'prstory-dedupe-'));
  const projectsRoot = path.join(root, 'projects');
  await cp(FIX, path.join(projectsRoot, '-repo-foo'), { recursive: true });
  const repoRoot = path.join(root, 'repo');
  const sharedDir = path.join(repoRoot, '.prstory', 'sessions');
  await mkdir(sharedDir, { recursive: true });
  await cp(path.join(FIX, 'sess-basic.jsonl'), path.join(sharedDir, 'sess-basic.jsonl'));
  try {
    const idx = await buildIndex({ projectsRoot, repoRoot });
    const matches = idx.sessions.filter((x) => x.id === 'sess-basic');
    assert.equal(matches.length, 1, 'expected exactly one sess-basic after dedupe');
    assert.equal(matches[0].shared, false, 'local copy should win');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
