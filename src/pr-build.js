import path from 'node:path';
import { findBranchSessions } from './discover.js';
import { parseSession } from './parse.js';
import { extractEvents } from './extract.js';
import { buildTimeline } from './timeline.js';
import {
  findRepoRoot,
  getOriginUrl,
  githubWebBase,
  getDefaultBranch,
  mergeBase,
  branchCommits,
  isGitRepo,
} from './util/git.js';
import { findPrForBranch } from './util/gh.js';
import { alignActions, actionKey } from './git-align.js';
import { summarizeBashOutcomes, thrashScores } from './heuristics.js';

/**
 * @typedef {Object} PRStoryRich
 * @property {string} branch
 * @property {string|null} base_branch
 * @property {string|null} repo_root
 * @property {string|null} github_base
 * @property {Object|null} pr  // {url, number, title, state, baseRefName, headRefName, createdAt}
 * @property {{hash:string,short:string,iso:string,subject:string}[]} commits
 * @property {string[]} session_ids
 * @property {Array} timelines  // per-session timeline objects
 * @property {Array} files     // [{path, actions[], decisions[], interventions[], session_ids[], alignment_counts, thrash}]
 * @property {Array} decisions // global decisions list (deduped)
 * @property {Array} interventions // global interventions list
 * @property {Object} outcomes // {commands, summary}
 * @property {Object} totals   // {sessions, actions, edits, decisions, interventions}
 */

export async function buildPrStory({ branch, repoPath, projectsRoot }) {
  const sessions = await findBranchSessions(branch, repoPath, projectsRoot);

  let repo_root = null;
  let base_branch = null;
  let github_base = null;
  let pr = null;
  let commits = [];
  if (await isGitRepo(repoPath)) {
    repo_root = await findRepoRoot(repoPath);
    base_branch = await getDefaultBranch(repo_root);
    const remote = await getOriginUrl(repo_root);
    github_base = githubWebBase(remote);
    pr = await findPrForBranch(branch, repo_root);
    if (base_branch) {
      const baseRef = pr?.baseRefName ?? base_branch;
      commits = await branchCommits(branch, repo_root, baseRef);
    }
  }

  const timelines = [];
  const allEvents = [];
  for (const s of sessions) {
    const raw = await parseSession(s.path);
    const events = extractEvents(raw);
    const gitBranch = raw.events.find((e) => e.gitBranch)?.gitBranch ?? branch;
    const tl = buildTimeline(events, {
      sessionId: s.sessionId,
      gitBranch,
      githubBase: github_base,
      repoRoot: repo_root,
    });
    timelines.push(tl);
    for (const e of events) allEvents.push({ ...e, _session_id: s.sessionId });
  }

  // Aggregate by file.
  const byFile = new Map();
  for (const ev of allEvents) {
    if (ev.type !== 'action') continue;
    const fp = ev.meta?.file_path;
    if (!fp) continue;
    if (!byFile.has(fp)) byFile.set(fp, []);
    byFile.get(fp).push(ev);
  }

  // Alignment.
  let alignByKey = new Map();
  if (repo_root && pr?.baseRefName) {
    const base = await mergeBase(branch, pr.baseRefName, repo_root);
    if (base) {
      alignByKey = await alignActions(allEvents.filter((e) => e.type === 'action'), {
        repoRoot: repo_root,
        base,
        head: branch,
      });
    }
  } else if (repo_root && base_branch) {
    const base = await mergeBase(branch, base_branch, repo_root);
    if (base) {
      alignByKey = await alignActions(allEvents.filter((e) => e.type === 'action'), {
        repoRoot: repo_root,
        base,
        head: branch,
      });
    }
  }

  const thrash = thrashScores(byFile, alignByKey);
  const outcomes = summarizeBashOutcomes(allEvents);

  // Per-file rich payload.
  const files = [];
  for (const [fp, actions] of byFile) {
    // Decisions / interventions that "touched" this file: those that share
    // a session AND are temporally adjacent to one of its actions (within
    // 2 minutes before any action on this file).
    const sessionIds = Array.from(new Set(actions.map((a) => a._session_id)));
    const fileDecisions = [];
    const fileInterventions = [];
    for (const tl of timelines) {
      if (!sessionIds.includes(tl.session_id)) continue;
      for (const c of tl.chapters) {
        if (c.files_touched.includes(fp)) {
          for (const e of c.events) {
            if (e.type === 'decision') fileDecisions.push(e);
          }
          for (const i of c.interventions) fileInterventions.push(i);
        }
      }
    }

    actions.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));

    const alignmentCounts = { kept: 0, reverted: 0, 'changed-later': 0, 'not-in-pr': 0, unknown: 0 };
    for (const a of actions) {
      const v = alignByKey.get(actionKey(a)) ?? 'unknown';
      a._alignment = v;
      alignmentCounts[v] = (alignmentCounts[v] ?? 0) + 1;
    }
    const t = thrash.find((x) => x.file === fp) ?? { thrash: 0, reverted: 0, changed_later: 0 };

    files.push({
      path: fp,
      actions,
      decisions: dedupBy(fileDecisions, (e) => e.raw_text.slice(0, 80)),
      interventions: dedupBy(fileInterventions, (e) => e.raw_text.slice(0, 80)),
      session_ids: sessionIds,
      alignment_counts: alignmentCounts,
      thrash: t,
    });
  }

  files.sort((a, b) => b.thrash.thrash - a.thrash.thrash || b.actions.length - a.actions.length);

  const allDecisions = dedupBy(
    timelines.flatMap((tl) => tl.chapters.flatMap((c) => c.events.filter((e) => e.type === 'decision'))),
    (e) => e.raw_text.slice(0, 80),
  );
  const allInterventions = timelines.flatMap((tl) => tl.chapters.flatMap((c) => c.interventions));

  const totals = {
    sessions: sessions.length,
    actions: allEvents.filter((e) => e.type === 'action').length,
    edits: allEvents.filter((e) => e.type === 'action' && (e.meta?.tool_name === 'Edit' || e.meta?.tool_name === 'Write' || e.meta?.tool_name === 'MultiEdit')).length,
    decisions: allDecisions.length,
    interventions: allInterventions.length,
  };

  return {
    branch,
    base_branch,
    repo_root,
    github_base,
    pr,
    commits,
    session_ids: sessions.map((s) => s.sessionId),
    timelines,
    files,
    decisions: allDecisions,
    interventions: allInterventions,
    outcomes,
    totals,
  };
}

function dedupBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
