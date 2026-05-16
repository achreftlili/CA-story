import { parseSubArgs } from '../cli.js';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findRepoRoot, lastKnownBranch, isGitRepo } from '../util/git.js';
import { findBranchSessions } from '../discover.js';

const HELP = `castory share — copy this branch's sessions into the repo so reviewers can see them

Usage:
  castory share [--branch NAME] [--repo PATH] [--no-commit] [--dry-run]

Options:
  --branch NAME   Branch to share (default: current HEAD)
  --repo PATH     Repo root (default: nearest .git ancestor of cwd)
  --no-commit     Stage files but don't commit
  --dry-run       Print what would happen, don't write anything
  --help, -h      Show this help

What it does:
  1. Finds sessions whose recorded git branch matches the target branch
  2. Copies their raw JSONL into <repo>/.castory/sessions/<id>.jsonl
  3. Updates <repo>/.castory/manifest.json
  4. Stages the files and commits them (unless --no-commit)

Reviewers can then run \`castory dashboard\` in the cloned repo to see
exactly the sessions you ran on this branch.

  Transcripts can include anything you pasted into Claude — paths, output,
  secrets, etc. Inspect the staged files before pushing.
`;

function gitRun(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', () => resolve({ ok: false, stdout: '', stderr: '', code: -1 }));
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, code: code ?? -1 }));
  });
}

export async function run(argv) {
  const { values } = parseSubArgs(argv, {
    branch: { type: 'string' },
    repo: { type: 'string' },
    'no-commit': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const startDir = values.repo ? path.resolve(values.repo) : process.cwd();
  const repoRoot = await findRepoRoot(startDir);
  if (!repoRoot || !(await isGitRepo(repoRoot))) {
    process.stderr.write(`castory share: not inside a git repo (looked under ${startDir})\n`);
    return 2;
  }

  const branch = values.branch ?? (await lastKnownBranch(repoRoot));
  if (!branch) {
    process.stderr.write('castory share: could not determine current branch — pass --branch NAME\n');
    return 2;
  }

  const sessions = await findBranchSessions(branch, repoRoot);
  if (sessions.length === 0) {
    process.stderr.write(`castory share: no sessions found for branch '${branch}'\n`);
    return 1;
  }

  const sharedDir = path.join(repoRoot, '.castory', 'sessions');
  const manifestPath = path.join(repoRoot, '.castory', 'manifest.json');

  if (values['dry-run']) {
    process.stdout.write(`Would share ${sessions.length} session(s) for branch '${branch}':\n`);
    for (const s of sessions) {
      process.stdout.write(`  ${s.sessionId}.jsonl  (${formatSize(s.sizeBytes)})\n`);
    }
    process.stdout.write(`Target: ${sharedDir}\n`);
    return 0;
  }

  await mkdir(sharedDir, { recursive: true });
  const written = [];
  for (const s of sessions) {
    const dst = path.join(sharedDir, `${s.sessionId}.jsonl`);
    await copyFile(s.path, dst);
    written.push(dst);
  }

  let manifest = { version: 1, branches: {} };
  try {
    const txt = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(txt);
    if (parsed && typeof parsed === 'object') {
      manifest = { version: parsed.version ?? 1, branches: { ...(parsed.branches ?? {}) } };
    }
  } catch {
    // first time — manifest doesn't exist yet
  }
  manifest.branches[branch] = {
    session_ids: sessions.map((s) => s.sessionId),
    shared_at: new Date().toISOString(),
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const relPaths = [...written, manifestPath].map((p) => path.relative(repoRoot, p));
  const addRes = await gitRun(repoRoot, ['add', '--', ...relPaths]);
  if (!addRes.ok) {
    process.stderr.write(`castory share: git add failed:\n${addRes.stderr}`);
    return 1;
  }

  if (values['no-commit']) {
    process.stdout.write(
      `Staged ${written.length} session(s) for branch '${branch}' under .castory/. Run \`git commit\` when ready.\n`,
    );
    return 0;
  }

  const msg = `chore(castory): share ${written.length} session(s) for ${branch}`;
  const commitRes = await gitRun(repoRoot, ['commit', '-m', msg]);
  if (!commitRes.ok) {
    if (/nothing to commit/i.test(commitRes.stdout + commitRes.stderr)) {
      process.stdout.write(
        `castory share: nothing changed; .castory/ is already up to date for '${branch}'.\n`,
      );
      return 0;
    }
    process.stderr.write(`castory share: git commit failed:\n${commitRes.stderr}`);
    return 1;
  }

  process.stdout.write(
    `Shared ${written.length} session(s) for '${branch}' to .castory/ and committed.\nNext: \`git push\`.\n`,
  );
  return 0;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}
