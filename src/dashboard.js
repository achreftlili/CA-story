import { stat } from 'node:fs/promises';
import path from 'node:path';
import { listAllSessions, listSharedSessions } from './discover.js';
import { parseSession, messageText, messageToolUses, messageBlocks } from './parse.js';
import { extractEvents } from './extract.js';
import { projectNameFromCwd, claudeProjectsRoot } from './util/paths.js';
import { loadIndexCache, saveIndexCache, cacheKey } from './util/cache.js';
import { findRepoRoot, getOriginUrl, githubWebBase } from './util/git.js';
import { readClaudeMdConfig } from './util/claude-md.js';

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

// Memoize CLAUDE.md config per project cwd.
const claudeMdCache = new Map();
async function resolveClaudeMd(cwd) {
  if (!cwd) return null;
  if (claudeMdCache.has(cwd)) return claudeMdCache.get(cwd);
  let cfg = await readClaudeMdConfig(cwd);
  // If not in cwd, also try the repo root.
  if (!cfg) {
    const root = await findRepoRoot(cwd);
    if (root && root !== cwd) cfg = await readClaudeMdConfig(root);
  }
  claudeMdCache.set(cwd, cfg);
  return cfg;
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
export async function buildIndex({
  projectsRoot = claudeProjectsRoot(),
  projectPaths = null,
  repoRoot = null,
} = {}) {
  const cache = await loadIndexCache();
  const sessions = [];
  const projectAgg = new Map();
  const seenIds = new Set();

  async function ingest(loc, { shared = false } = {}) {
    if (projectPaths && !projectPaths.some((p) => loc.cwdGuess?.startsWith(p) || loc.projectDir.startsWith(p))) {
      return;
    }
    if (seenIds.has(loc.sessionId)) return;
    let st;
    try {
      st = await stat(loc.path);
    } catch {
      return;
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
        return;
      }
    }
    sessions.push({ ...entry, __sourcePath: loc.path, shared });
    seenIds.add(loc.sessionId);

    const pp = entry.project_path || loc.cwdGuess || loc.projectDir;
    const agg = projectAgg.get(pp) ?? {
      name: entry.project_name,
      path: pp,
      session_count: 0,
    };
    agg.session_count++;
    projectAgg.set(pp, agg);
  }

  for await (const loc of listAllSessions(projectsRoot)) {
    await ingest(loc, { shared: false });
  }
  if (repoRoot) {
    for await (const loc of listSharedSessions(repoRoot)) {
      await ingest(loc, { shared: true });
    }
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
  const mcp_tools = {};
  const bash_categories = {};
  const slash_commands = {};
  const stop_reasons = {};
  const skills_used = {};
  const subagents_used = {};
  const messageTimestamps = [];
  let sidechain_messages = 0;
  let tool_failures = 0;
  let plan_turns = 0;
  let total_message_for_plan_pct = 0;
  let turn_duration_ms_total = 0;
  let turn_duration_ms_max = 0;
  let turn_count = 0;
  let max_tokens_count = 0;
  let refusal_count = 0;
  const tokens = { input: 0, output: 0, cache_read: 0, cache_creation: 0, assistant_messages: 0 };
  const seenMessageIds = new Set();
  const modelsSet = new Set();
  // Reuse extract.js for high-value fields (summary, intervention_count).
  const extracted = extractEvents({ events });

  for (const e of events) {
    if (e.timestamp) {
      if (!started_at) started_at = e.timestamp;
      ended_at = e.timestamp;
    }
    if (e.cwd) project_path = e.cwd;
    if (e.gitBranch && !git_branch) git_branch = e.gitBranch;
    if (e.raw?.isSidechain === true) sidechain_messages++;
    if (e.kind === 'user') {
      total_message_for_plan_pct++;
      if (e.raw?.permissionMode === 'plan') plan_turns++;
      const blocks = e.raw?.message?.content;
      if (Array.isArray(blocks)) {
        for (const b of blocks) {
          if (b?.type === 'tool_result' && b.is_error) tool_failures++;
        }
      }
      // Slash commands invoked: scan text content for <command-name>...</command-name>.
      const slash = extractSlashCommands(e.raw?.message?.content);
      for (const cmd of slash) slash_commands[cmd] = (slash_commands[cmd] ?? 0) + 1;
    }
    if (e.type === 'system' && e.raw?.subtype === 'turn_duration' && typeof e.raw?.durationMs === 'number') {
      turn_count++;
      turn_duration_ms_total += e.raw.durationMs;
      if (e.raw.durationMs > turn_duration_ms_max) turn_duration_ms_max = e.raw.durationMs;
    }

    if (e.kind === 'user' || e.kind === 'assistant') {
      message_count++;
      if (e.timestamp) messageTimestamps.push(Date.parse(e.timestamp));
    }

    if (e.kind === 'assistant') {
      const tools = messageToolUses(e);
      for (const t of tools) {
        tool_calls[t.name] = (tool_calls[t.name] ?? 0) + 1;
        if (t.input?.file_path) files_touched_set.add(t.input.file_path);
        if (typeof t.name === 'string' && t.name.startsWith('mcp__')) {
          const k = shortenMcp(t.name);
          mcp_tools[k] = (mcp_tools[k] ?? 0) + 1;
        }
        if (t.name === 'Bash' && typeof t.input?.command === 'string') {
          const cat = categorizeBash(t.input.command);
          bash_categories[cat] = (bash_categories[cat] ?? 0) + 1;
        }
        if ((t.name === 'Agent' || t.name === 'Task') && t.input?.subagent_type) {
          const k = t.input.subagent_type;
          subagents_used[k] = (subagents_used[k] ?? 0) + 1;
        }
        if (t.name === 'Skill' && t.input?.skill) {
          const k = t.input.skill;
          skills_used[k] = (skills_used[k] ?? 0) + 1;
        }
      }
      const sr = e.raw?.message?.stop_reason;
      if (typeof sr === 'string' && sr) {
        stop_reasons[sr] = (stop_reasons[sr] ?? 0) + 1;
        if (sr === 'max_tokens') max_tokens_count++;
        if (sr === 'refusal' || sr === 'safety') refusal_count++;
      }
      const attrSkill = e.raw?.attributionSkill;
      if (typeof attrSkill === 'string' && attrSkill) {
        const k = attrSkill;
        skills_used[k] = (skills_used[k] ?? 0) + 1;
      }
      const u = e.raw?.message?.usage;
      const mid = e.raw?.message?.id;
      const model = e.raw?.message?.model;
      // The transcript splits one assistant turn into multiple records
      // (one per content block) but all carry the same `usage`. Count
      // each message.id only once.
      if (u && typeof u === 'object' && mid && !seenMessageIds.has(mid)) {
        seenMessageIds.add(mid);
        tokens.input += +(u.input_tokens || 0);
        tokens.output += +(u.output_tokens || 0);
        tokens.cache_read += +(u.cache_read_input_tokens || 0);
        tokens.cache_creation += +(u.cache_creation_input_tokens || 0);
        tokens.assistant_messages += 1;
      }
      if (model && !modelsSet.has(model)) modelsSet.add(model);
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
  const claude_md = await resolveClaudeMd(project_path);
  const project_name_resolved = claude_md?.display_name || projectNameFromCwd(project_path);

  return {
    id: loc.sessionId,
    project_path,
    project_name: project_name_resolved,
    project_description: claude_md?.description ?? null,
    project_tags: claude_md?.tags ?? [],
    important_files: claude_md?.important_files ?? [],
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
    mcp_tools,
    bash_categories,
    slash_commands,
    stop_reasons,
    max_tokens_count,
    refusal_count,
    skills_used,
    subagents_used,
    tokens: {
      ...tokens,
      total: tokens.input + tokens.output + tokens.cache_read + tokens.cache_creation,
      billable: tokens.input + tokens.output + tokens.cache_creation,
    },
    models: Array.from(modelsSet),
    sidechain_messages,
    tool_failures,
    plan_turn_pct: total_message_for_plan_pct ? plan_turns / total_message_for_plan_pct : 0,
    plan_turns,
    turn_duration_ms_avg: turn_count ? Math.round(turn_duration_ms_total / turn_count) : 0,
    turn_duration_ms_max,
    turn_count,
    summary,
  };
}

// Map a long mcp__ tool name to a compact display label, e.g.
//   mcp__claude_ai_Google_Drive__search_files -> "Google Drive · search_files"
function shortenMcp(name) {
  // mcp__<server>__<tool>
  const m = String(name).match(/^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/);
  if (!m) return name.replace(/^mcp__/, '');
  const server = m[1].replace(/^claude_ai_/, '').replace(/_/g, ' ').trim();
  const tool = m[2];
  return `${server} · ${tool}`;
}

const BASH_RULES = [
  ['git',     /\bgit\b/],
  ['test',    /\b(npm\s+(?:run\s+)?test|pytest|vitest|jest|go\s+test|cargo\s+test|mix\s+test|phpunit|rspec)\b/i],
  ['install', /\b(npm\s+(?:install|i)\b|yarn\s+add\b|pip\s+install\b|brew\s+install\b|apt(?:-get)?\s+install\b|cargo\s+add\b)/i],
  ['build',   /\b(npm\s+(?:run\s+)?build|tsc\b|vite\s+build|webpack|cargo\s+build|docker\s+build|make\b)\b/i],
  ['lint',    /\b(eslint|ruff|flake8|prettier|black|npm\s+(?:run\s+)?lint)\b/i],
  ['docker',  /\bdocker\b/],
  ['find',    /\b(find|grep|rg|ag|fd)\b/],
  ['ls/cat',  /^\s*(ls|cat|head|tail|less|more|wc|stat|file)\b/],
  ['curl',    /\b(curl|wget|http(?:ie)?)\b/],
  ['node',    /\bnode\b/],
  ['python',  /\b(python|python3|uvx?|poetry|pyenv)\b/],
  ['mkdir',   /\b(mkdir|rm|cp|mv|touch|chmod|chown|ln)\b/],
];
function categorizeBash(command) {
  const c = String(command || '').trim();
  for (const [label, rx] of BASH_RULES) {
    if (rx.test(c)) return label;
  }
  return 'other';
}

function extractSlashCommands(content) {
  const out = [];
  const seen = new Set();
  const collect = (s) => {
    if (typeof s !== 'string') return;
    const rx = /<command-name>\s*\/?([\w:-]+)\s*<\/command-name>/g;
    let m;
    while ((m = rx.exec(s)) !== null) {
      const name = m[1];
      if (!seen.has(name)) { seen.add(name); out.push(name); }
    }
  };
  if (typeof content === 'string') collect(content);
  else if (Array.isArray(content)) {
    for (const b of content) if (b?.type === 'text') collect(b.text);
  }
  return out;
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
