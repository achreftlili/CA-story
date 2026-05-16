import { homedir } from 'node:os';
import path from 'node:path';

export function claudeProjectsRoot() {
  return path.join(homedir(), '.claude', 'projects');
}

export function cacheRoot() {
  return path.join(homedir(), '.cache', 'prstory');
}

export function cacheDashboardDir() {
  return path.join(cacheRoot(), 'dashboard');
}

export function cacheSessionsDir() {
  return path.join(cacheDashboardDir(), 'sessions');
}

export function cacheIndexFile() {
  return path.join(cacheRoot(), 'index.json');
}

// The directories under ~/.claude/projects/ are encoded versions of a cwd:
// `/Users/x/Documents/foo` -> `-Users-x-Documents-foo`. We decode by
// replacing leading dash with `/` and remaining dashes with `/`. This is
// best-effort — the real path comes from `cwd` inside the JSONL.
export function decodeProjectDirName(name) {
  if (!name.startsWith('-')) return name;
  return name.replace(/^-/, '/').replace(/-/g, '/');
}

// A human-friendly project name from a cwd: last path segment.
export function projectNameFromCwd(cwd) {
  if (!cwd) return 'unknown';
  const segs = cwd.split(path.sep).filter(Boolean);
  return segs[segs.length - 1] ?? 'unknown';
}
