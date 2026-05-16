import { spawn } from 'node:child_process';
import { readFile, access, stat } from 'node:fs/promises';
import path from 'node:path';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', () => resolve({ ok: false, stdout: '', stderr: '', code: -1 }));
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, code: code ?? -1 }));
  });
}

// Return ISO timestamps for commits on a branch. Returns [] if the branch
// doesn't exist or this isn't a git repo.
export async function branchCommitTimestamps(branch, repoPath) {
  if (!(await isGitRepo(repoPath))) return [];
  const r = await run('git', ['log', branch, '--format=%cI'], { cwd: repoPath });
  if (!r.ok) return [];
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

// Return ISO timestamps + short hashes + subjects for commits on a branch
// not reachable from `base`. Useful for correlating sessions to commits.
export async function branchCommits(branch, repoPath, base = null) {
  if (!(await isGitRepo(repoPath))) return [];
  const range = base ? `${base}..${branch}` : branch;
  const r = await run(
    'git',
    ['log', range, '--format=%H%x09%cI%x09%s'],
    { cwd: repoPath },
  );
  if (!r.ok) return [];
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, iso, ...rest] = line.split('\t');
      return { hash, short: hash.slice(0, 7), iso, subject: rest.join('\t') };
    });
}

// Guess the default branch by looking at refs/remotes/origin/HEAD.
export async function getDefaultBranch(repoPath) {
  if (!(await isGitRepo(repoPath))) return null;
  const r = await run('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: repoPath });
  if (r.ok) {
    const m = r.stdout.trim().match(/^refs\/remotes\/origin\/(.+)$/);
    if (m) return m[1];
  }
  // Fallback: try main, then master.
  for (const cand of ['main', 'master']) {
    const r2 = await run('git', ['rev-parse', '--verify', cand], { cwd: repoPath });
    if (r2.ok) return cand;
  }
  return null;
}

// Find the merge-base between `branch` and `base` (the divergence point).
export async function mergeBase(branch, base, repoPath) {
  if (!(await isGitRepo(repoPath))) return null;
  const r = await run('git', ['merge-base', base, branch], { cwd: repoPath });
  return r.ok ? r.stdout.trim() : null;
}

// List files changed between two refs.
export async function diffFiles(fromRef, toRef, repoPath) {
  if (!(await isGitRepo(repoPath))) return [];
  const r = await run('git', ['diff', '--name-only', `${fromRef}..${toRef}`], { cwd: repoPath });
  if (!r.ok) return [];
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

// Read a file's contents at a given ref. Returns null on failure (file
// didn't exist at that ref, etc.).
export async function readFileAtRef(ref, relPath, repoPath) {
  if (!(await isGitRepo(repoPath))) return null;
  const r = await run('git', ['show', `${ref}:${relPath}`], { cwd: repoPath });
  return r.ok ? r.stdout : null;
}

export async function isGitRepo(repoPath) {
  try {
    await access(path.join(repoPath, '.git'));
    return true;
  } catch {
    return false;
  }
}

// Best-effort branch name from .git/logs/HEAD — finds the most recently
// active branch when HEAD is detached.
// Walk up from `dir` until we find a `.git` directory. Returns the repo
// root path, or null if not inside a repo.
export async function findRepoRoot(dir) {
  if (!dir) return null;
  let cur = path.resolve(dir);
  while (true) {
    try {
      await access(path.join(cur, '.git'));
      return cur;
    } catch {
      // fallthrough
    }
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

// Read `origin` URL from the repo's .git/config.
export async function getOriginUrl(repoPath) {
  if (!repoPath) return null;
  try {
    const txt = await readFile(path.join(repoPath, '.git', 'config'), 'utf8');
    const m = txt.match(/\[remote\s+"origin"\][^\[]*?url\s*=\s*(\S+)/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// Normalize a GitHub remote URL to `https://github.com/owner/repo`.
// Supports git@github.com:owner/repo(.git) and https://github.com/owner/repo(.git).
// Returns null for non-GitHub remotes.
export function githubWebBase(remoteUrl) {
  if (!remoteUrl) return null;
  let m = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/);
  if (m) return `https://github.com/${m[1]}`;
  m = remoteUrl.match(/^https?:\/\/github\.com\/(.+?)(?:\.git)?$/);
  if (m) return `https://github.com/${m[1]}`;
  // ssh://git@github.com/owner/repo(.git)
  m = remoteUrl.match(/^ssh:\/\/git@github\.com\/(.+?)(?:\.git)?$/);
  if (m) return `https://github.com/${m[1]}`;
  return null;
}

// Build a blob URL for a file path on a branch. `absFilePath` must be
// inside `repoRoot`. Branch falls back to "HEAD" if not provided.
export function githubBlobUrl({ base, branch, repoRoot, absFilePath }) {
  if (!base || !repoRoot || !absFilePath) return null;
  const rel = path.relative(repoRoot, absFilePath);
  if (!rel || rel.startsWith('..')) return null;
  const enc = rel.split(path.sep).map(encodeURIComponent).join('/');
  const b = branch && branch !== 'HEAD' ? encodeURIComponent(branch) : 'HEAD';
  return `${base}/blob/${b}/${enc}`;
}

export async function lastKnownBranch(repoPath) {
  try {
    const head = await readFile(path.join(repoPath, '.git', 'HEAD'), 'utf8');
    const m = head.match(/^ref: refs\/heads\/(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    // fallthrough
  }
  try {
    const log = await readFile(path.join(repoPath, '.git', 'logs', 'HEAD'), 'utf8');
    const lines = log.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/checkout: moving from \S+ to (\S+)/);
      if (m) return m[1];
    }
  } catch {
    // fallthrough
  }
  return null;
}
