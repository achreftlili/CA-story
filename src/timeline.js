/**
 * @typedef {Object} Chapter
 * @property {string} id
 * @property {string} title
 * @property {string} intent
 * @property {import('./extract.js').Event[]} events
 * @property {string[]} files_touched
 * @property {import('./extract.js').Event[]} interventions
 * @property {string|null} started_at
 * @property {string|null} ended_at
 */

const IDLE_GAP_MS = 5 * 60 * 1000; // 5 minutes -> new chapter

/**
 * Group events into chapters by idle-gap and file-cluster heuristics.
 * @param {import('./extract.js').Event[]} events
 * @param {{sessionId?: string, gitBranch?: string|null}} [opts]
 * @returns {{ session_id: string, chapters: Chapter[], git_branch: string|null }}
 */
export function buildTimeline(events, opts = {}) {
  const chapters = [];
  let current = null;
  let lastT = null;
  let lastFile = null;

  for (const e of events) {
    const t = e.timestamp ? new Date(e.timestamp).getTime() : null;

    let breakHere = false;
    if (!current) breakHere = true;
    else if (t && lastT && t - lastT > IDLE_GAP_MS) breakHere = true;
    else if (
      e.type === 'action' &&
      e.meta?.file_path &&
      lastFile &&
      e.meta.file_path !== lastFile &&
      !sharesPathPrefix(e.meta.file_path, lastFile) &&
      current.events.length > 6
    ) {
      breakHere = true;
    }

    if (breakHere) {
      current = newChapter(chapters.length);
      chapters.push(current);
    }

    current.events.push(e);
    current.ended_at = e.timestamp ?? current.ended_at;
    if (!current.started_at) current.started_at = e.timestamp ?? null;

    if (e.type === 'action' && e.meta?.file_path) {
      if (!current.files_touched.includes(e.meta.file_path)) {
        current.files_touched.push(e.meta.file_path);
      }
      lastFile = e.meta.file_path;
    }
    if (e.type === 'intervention') {
      current.interventions.push(e);
    }
    if (e.type === 'decision' && !current.intent) {
      current.intent = e.raw_text;
      current.title = truncate(firstSentence(e.raw_text), 60);
    }

    if (t) lastT = t;
  }

  // Fallback titles for chapters with no decision text.
  for (const c of chapters) {
    if (c.title) continue;
    const firstAction = c.events.find((e) => e.type === 'action');
    if (firstAction) {
      c.title = truncate(firstAction.raw_text, 60);
      c.intent = firstAction.raw_text;
      continue;
    }
    c.title = 'Untitled chapter';
    c.intent = '';
  }

  return {
    session_id: opts.sessionId ?? '',
    git_branch: opts.gitBranch ?? null,
    github_base: opts.githubBase ?? null,
    repo_root: opts.repoRoot ?? null,
    important_files: opts.importantFiles ?? [],
    chapters,
  };
}

function newChapter(idx) {
  return {
    id: `ch${idx + 1}`,
    title: '',
    intent: '',
    events: [],
    files_touched: [],
    interventions: [],
    started_at: null,
    ended_at: null,
  };
}

function firstSentence(s) {
  const m = s.match(/^.+?[.!?](?=\s|$)/);
  return (m ? m[0] : s).trim();
}

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

function sharesPathPrefix(a, b) {
  const aSegs = a.split('/');
  const bSegs = b.split('/');
  const min = Math.min(aSegs.length, bSegs.length);
  let match = 0;
  for (let i = 0; i < min; i++) {
    if (aSegs[i] === bSegs[i]) match++;
    else break;
  }
  return match >= Math.max(3, min - 1);
}
