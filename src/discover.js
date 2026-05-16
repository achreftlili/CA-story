import { readdir, stat, readFile, open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { claudeProjectsRoot, decodeProjectDirName } from './util/paths.js';
import { branchCommitTimestamps, isGitRepo } from './util/git.js';

/**
 * @typedef {Object} SessionLocator
 * @property {string} sessionId
 * @property {string} path           // absolute jsonl path
 * @property {string} projectDir     // absolute dir under ~/.claude/projects
 * @property {string|null} cwdGuess  // decoded cwd or first cwd seen in file
 * @property {number} mtimeMs
 * @property {number} sizeBytes
 */

export async function* listAllSessions(root = claudeProjectsRoot()) {
  let projectDirs;
  try {
    projectDirs = await readdir(root, { withFileTypes: true });
  } catch (err) {
    const e = new Error(
      `Could not list ${root}. Is Claude Code installed and have you ever used it?\n` +
        `(${err.message})`,
    );
    e.userMessage = e.message;
    e.exitCode = 2;
    throw e;
  }

  for (const entry of projectDirs) {
    if (!entry.isDirectory()) continue;
    const projectDir = path.join(root, entry.name);
    let files;
    try {
      files = await readdir(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
      const fp = path.join(projectDir, f.name);
      let st;
      try {
        st = await stat(fp);
      } catch {
        continue;
      }
      yield {
        sessionId: f.name.replace(/\.jsonl$/, ''),
        path: fp,
        projectDir,
        cwdGuess: decodeProjectDirName(entry.name),
        mtimeMs: st.mtimeMs,
        sizeBytes: st.size,
      };
    }
  }
}

export async function findSessionById(sessionId, root = claudeProjectsRoot()) {
  for await (const s of listAllSessions(root)) {
    if (s.sessionId === sessionId) return s;
  }
  return null;
}

// Walk `<repoRoot>/.castory/sessions/*.jsonl`. These are JSONL files committed
// to the repo by `castory share` so reviewers can render the author's sessions
// locally via `castory dashboard`. Yields nothing if the dir doesn't exist.
export async function* listSharedSessions(repoRoot) {
  if (!repoRoot) return;
  const sharedDir = path.join(repoRoot, '.castory', 'sessions');
  let files;
  try {
    files = await readdir(sharedDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
    const fp = path.join(sharedDir, f.name);
    let st;
    try {
      st = await stat(fp);
    } catch {
      continue;
    }
    yield {
      sessionId: f.name.replace(/\.jsonl$/, ''),
      path: fp,
      projectDir: sharedDir,
      cwdGuess: null,
      mtimeMs: st.mtimeMs,
      sizeBytes: st.size,
      shared: true,
    };
  }
}

export async function findSharedSessionById(sessionId, repoRoot) {
  for await (const s of listSharedSessions(repoRoot)) {
    if (s.sessionId === sessionId) return s;
  }
  return null;
}

// Pull the first two timestamps and any cwd from a JSONL by reading at most
// the first ~40 lines. Used for cheap discovery filters without parsing the
// full session.
export async function peekSessionHeader(jsonlPath) {
  const out = { startedAt: null, cwd: null, gitBranch: null };
  let count = 0;
  const stream = createReadStream(jsonlPath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      count++;
      if (count > 40) break;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (!out.startedAt && obj.timestamp) out.startedAt = obj.timestamp;
      if (!out.cwd && obj.cwd) out.cwd = obj.cwd;
      if (!out.gitBranch && obj.gitBranch) out.gitBranch = obj.gitBranch;
      if (out.startedAt && out.cwd && out.gitBranch) break;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return out;
}

// Cheap last-line read — open at the end and read a small tail.
export async function peekSessionTail(jsonlPath, byteWindow = 16384) {
  const fh = await open(jsonlPath, 'r');
  try {
    const st = await fh.stat();
    const start = Math.max(0, st.size - byteWindow);
    const len = st.size - start;
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, start);
    const text = buf.toString('utf8');
    const lines = text.split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.timestamp) return { endedAt: obj.timestamp };
      } catch {
        // partial last line
      }
    }
  } finally {
    await fh.close();
  }
  return { endedAt: null };
}

// Return sessions that overlap a branch's commit timestamp range.
// Fallback when no git history: return all sessions in the repo's project
// dir, sorted by recency.
export async function findBranchSessions(branch, repoPath, root = claudeProjectsRoot()) {
  const projectDir = findProjectDirForCwd(repoPath, root);
  const allForProject = [];
  for await (const s of listAllSessions(root)) {
    if (path.resolve(s.projectDir) === path.resolve(projectDir)) {
      allForProject.push(s);
    }
  }

  if (!(await isGitRepo(repoPath))) {
    return allForProject.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  const stamps = await branchCommitTimestamps(branch, repoPath);
  if (stamps.length === 0) {
    // Branch unknown to git; fall back to sessions whose recorded gitBranch
    // matches.
    const matched = [];
    for (const s of allForProject) {
      const head = await peekSessionHeader(s.path);
      if (head.gitBranch === branch) matched.push(s);
    }
    return matched.sort((a, b) => a.mtimeMs - b.mtimeMs);
  }

  const tMin = new Date(stamps[stamps.length - 1]).getTime();
  const tMax = new Date(stamps[0]).getTime();
  // Pad window so editing-before-commit sessions are caught (1 day each side).
  const pad = 24 * 60 * 60 * 1000;
  const lo = tMin - pad;
  const hi = tMax + pad;

  const matched = [];
  for (const s of allForProject) {
    const head = await peekSessionHeader(s.path);
    if (head.gitBranch && head.gitBranch === branch) {
      matched.push(s);
      continue;
    }
    const t = head.startedAt ? new Date(head.startedAt).getTime() : s.mtimeMs;
    if (t >= lo && t <= hi) matched.push(s);
  }
  return matched.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

// ~/.claude/projects/<encoded-cwd>/ — encoded form is "/foo/bar" -> "-foo-bar".
function findProjectDirForCwd(cwd, root) {
  const encoded = '-' + path.resolve(cwd).replace(/^\//, '').replace(/\//g, '-');
  return path.join(root, encoded);
}
