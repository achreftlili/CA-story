import { stat } from 'node:fs/promises';
import path from 'node:path';
import { listAllSessions } from './discover.js';
import { parseSession, messageText, messageToolUses, messageBlocks } from './parse.js';
import { extractEvents } from './extract.js';
import { projectNameFromCwd, claudeProjectsRoot } from './util/paths.js';
import { loadIndexCache, saveIndexCache, cacheKey } from './util/cache.js';
import { findRepoRoot, getOriginUrl, githubWebBase } from './util/git.js';

// Memoize repo resolution per cwd so we read .git/config at most once.
const repoMetaCache = new Map();
async function resolveRepoMeta(cwd) {
  if (!cwd) return { repo_root: null, github_base: null };
  if (repoMetaCache.has(cwd)) return repoMetaCache.get(cwd);
  const root = await findRepoRoot(cwd);
  const remote = root ? await getOriginUrl(root) : null;
  const base = githubWebBase(remote);
  const out = { repo_root: root, github_base: base };
  repoMetaCache.set(cwd, out);
  return out;
}

/**
 * @typedef {Object} DashboardSession
 * @property {string} id
 * @property {string} project_path
 * @property {string} project_name
 * @property {string|null} started_at
 * @property {string|null} ended_at
 * @property {number} duration_seconds
 * @property {number} message_count
 * @property {string[]} files_touched
 * @property {string} first_user_message
 * @property {string|null} git_branch
 * @property {number} intervention_count
 * @property {Record<string, number>} tool_calls
 * @property {string} summary
 */

/**
 * @returns {Promise<{generated_at:string, version:string, projects: any[], sessions: DashboardSession[]}>}
 */
export async function buildIndex({ projectsRoot = claudeProjectsRoot(), projectPaths = null } = {}) {
  const cache = await loadIndexCache();
  const sessions = [];
  const projectAgg = new Map();

  for await (const loc of listAllSessions(projectsRoot)) {
    if (projectPaths && !projectPaths.some((p) => loc.cwdGuess?.startsWith(p) || loc.projectDir.startsWith(p))) {
      continue;
    }
    let st;
    try {
      st = await stat(loc.path);
    } catch {
      continue;
    }
    const k = cacheKey(loc.path, st);
    let entry = cache.entries[loc.sessionId];
    if (entry?.key !== k) {
      try {
        entry = await summarizeSession(loc);
        entry.key = k;
        cache.entries[loc.sessionId] = entry;
      } catch (err) {
        process.stderr.write(`prstory: skipping ${loc.path}: ${err.message}\n`);
        continue;
      }
    }
    sessions.push({ ...entry, __sourcePath: loc.path });

    const pp = entry.project_path || loc.cwdGuess || loc.projectDir;
    const agg = projectAgg.get(pp) ?? {
      name: entry.project_name,
      path: pp,
      session_count: 0,
    };
    agg.session_count++;
    projectAgg.set(pp, agg);
  }

  // Prune cache entries that no longer correspond to a file on disk.
  const liveIds = new Set(sessions.map((s) => s.id));
  for (const id of Object.keys(cache.entries)) {
    if (!liveIds.has(id)) delete cache.entries[id];
  }
  await saveIndexCache(cache);

  sessions.sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));

  return {
    generated_at: new Date().toISOString(),
    version: '1.0',
    projects: Array.from(projectAgg.values()).sort((a, b) => b.session_count - a.session_count),
    sessions,
  };
}

const ACTIVITY_BUCKETS = 24;

async function summarizeSession(loc) {
  const { events } = await parseSession(loc.path);

  let started_at = null;
  let ended_at = null;
  let message_count = 0;
  let first_user_message = '';
  let git_branch = null;
  let project_path = loc.cwdGuess ?? loc.projectDir;
  const files_touched_set = new Set();
  const tool_calls = {};
  const messageTimestamps = [];
  // Reuse extract.js for high-value fields (summary, intervention_count).
  const extracted = extractEvents({ events });

  for (const e of events) {
    if (e.timestamp) {
      if (!started_at) started_at = e.timestamp;
      ended_at = e.timestamp;
    }
    if (e.cwd) project_path = e.cwd;
    if (e.gitBranch && !git_branch) git_branch = e.gitBranch;

    if (e.kind === 'user' || e.kind === 'assistant') {
      message_count++;
      if (e.timestamp) messageTimestamps.push(Date.parse(e.timestamp));
    }

    if (e.kind === 'assistant') {
      const tools = messageToolUses(e);
      for (const t of tools) {
        tool_calls[t.name] = (tool_calls[t.name] ?? 0) + 1;
        if (t.input?.file_path) files_touched_set.add(t.input.file_path);
      }
    }

    if (!first_user_message && e.kind === 'user') {
      const blocks = messageBlocks(e);
      const realText = blocks
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
      if (
        realText &&
        !/<command-(name|message|args)>|<system-reminder>|<ide_opened_file>|<local-command-/.test(realText) &&
        !e.raw?.isMeta
      ) {
        first_user_message = realText.slice(0, 200);
      }
    }
  }

  // Summary = first decision in the session, or first user message.
  const firstDecision = extracted.find((e) => e.type === 'decision');
  const summary = firstDecision
    ? firstDecision.raw_text.split(/[.!?\n]/)[0].slice(0, 80)
    : first_user_message.slice(0, 80);

  const interventions = extracted.filter((e) => e.type === 'intervention');
  const intervention_count = interventions.length;
  const first_intervention = interventions[0]?.raw_text?.replace(/\s+/g, ' ').slice(0, 140) ?? '';

  const startMs = started_at ? Date.parse(started_at) : 0;
  const endMs = ended_at ? Date.parse(ended_at) : 0;
  const duration_seconds = startMs && endMs ? Math.max(0, Math.round((endMs - startMs) / 1000)) : 0;
  const activity_buckets = bucketize(messageTimestamps, startMs, endMs, ACTIVITY_BUCKETS);

  const { repo_root, github_base } = await resolveRepoMeta(project_path);

  return {
    id: loc.sessionId,
    project_path,
    project_name: projectNameFromCwd(project_path),
    started_at,
    ended_at,
    duration_seconds,
    message_count,
    files_touched: Array.from(files_touched_set).slice(0, 25),
    first_user_message,
    git_branch,
    repo_root,
    github_base,
    intervention_count,
    first_intervention,
    activity_buckets,
    tool_calls,
    summary,
  };
}

function bucketize(stamps, startMs, endMs, n) {
  if (!stamps.length || !startMs || !endMs || endMs <= startMs) {
    return new Array(n).fill(0);
  }
  const span = endMs - startMs;
  const buckets = new Array(n).fill(0);
  for (const t of stamps) {
    const rel = t - startMs;
    let idx = Math.floor((rel / span) * n);
    if (idx >= n) idx = n - 1;
    if (idx < 0) idx = 0;
    buckets[idx]++;
  }
  return buckets;
}
