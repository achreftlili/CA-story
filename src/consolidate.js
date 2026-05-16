/**
 * @typedef {Object} PRStory
 * @property {string} branch
 * @property {string[]} session_ids
 * @property {import('./timeline.js').Chapter[]} chapters
 */

const SIMILARITY_THRESHOLD = 0.85;

/**
 * Merge multiple per-session timelines into one PR story.
 * Dedup rules:
 *   - actions  : same (file_path, tool_name, normalized-arg) within a chapter
 *   - decisions: token-set similarity > 0.85
 *   - interventions: always preserved verbatim
 * @param {{session_id:string, chapters: import('./timeline.js').Chapter[]}[]} timelines
 * @param {string} branch
 * @returns {PRStory}
 */
export function consolidate(timelines, branch) {
  const allChapters = [];
  const session_ids = [];

  for (const tl of timelines) {
    session_ids.push(tl.session_id);
    for (const c of tl.chapters) {
      allChapters.push({ ...c, __session_id: tl.session_id });
    }
  }

  allChapters.sort((a, b) => {
    const ta = a.started_at ? Date.parse(a.started_at) : 0;
    const tb = b.started_at ? Date.parse(b.started_at) : 0;
    return ta - tb;
  });

  // Group chapters that share file footprint.
  const groups = [];
  for (const ch of allChapters) {
    let placed = null;
    for (const g of groups) {
      if (chaptersOverlap(g, ch)) {
        placed = g;
        break;
      }
    }
    if (placed) {
      mergeChapter(placed, ch);
    } else {
      groups.push(cloneChapter(ch));
    }
  }

  // Dedup decisions inside each merged chapter.
  for (const g of groups) {
    g.events = dedupDecisionsAndActions(g.events);
  }

  return {
    branch,
    session_ids,
    chapters: groups,
  };
}

function cloneChapter(c) {
  return {
    id: `pr-${c.__session_id?.slice(0, 8) ?? 'x'}-${c.id}`,
    title: c.title,
    intent: c.intent,
    events: [...c.events],
    files_touched: [...c.files_touched],
    interventions: [...c.interventions],
    started_at: c.started_at,
    ended_at: c.ended_at,
    session_ids: [c.__session_id],
  };
}

function mergeChapter(into, from) {
  into.events.push(...from.events);
  for (const f of from.files_touched) {
    if (!into.files_touched.includes(f)) into.files_touched.push(f);
  }
  into.interventions.push(...from.interventions);
  if (!into.session_ids.includes(from.__session_id)) into.session_ids.push(from.__session_id);
  if (!into.title && from.title) into.title = from.title;
  if (!into.intent && from.intent) into.intent = from.intent;
  if (from.ended_at && (!into.ended_at || from.ended_at > into.ended_at)) into.ended_at = from.ended_at;
}

function chaptersOverlap(a, b) {
  // Share at least one file_path?
  if (a.files_touched.some((f) => b.files_touched.includes(f))) return true;
  // Or share strongly similar titles?
  if (a.title && b.title && tokenSetSimilarity(a.title, b.title) >= SIMILARITY_THRESHOLD) return true;
  return false;
}

function dedupDecisionsAndActions(events) {
  const out = [];
  const seenActions = new Set();
  const decisionTexts = [];

  for (const e of events) {
    if (e.type === 'action') {
      const key = actionKey(e);
      if (seenActions.has(key)) continue;
      seenActions.add(key);
      out.push(e);
    } else if (e.type === 'decision') {
      const dup = decisionTexts.find((t) => tokenSetSimilarity(t, e.raw_text) >= SIMILARITY_THRESHOLD);
      if (dup) continue;
      decisionTexts.push(e.raw_text);
      out.push(e);
    } else {
      out.push(e); // outcomes, forks, interventions preserved
    }
  }
  return out;
}

function actionKey(e) {
  const tool = e.meta?.tool_name ?? '';
  const file = e.meta?.file_path ?? '';
  const cmd = e.meta?.command ?? '';
  return `${tool}${file}${cmd}`;
}

// Token-set similarity: 2 * |A∩B| / (|A| + |B|) over lowercased word sets.
// Returns a value in [0, 1].
export function tokenSetSimilarity(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

function tokenize(s) {
  return new Set(
    String(s ?? '')
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((t) => t.length > 1),
  );
}
