/**
 * Compute thrash / outcome flags from a flat event list.
 * "Thrash" hotspots = files that were repeatedly edited or had multiple
 * interventions attached. "Outcomes" = aggregate of test/lint/build runs
 * inferred from Bash actions and their tool_result outcomes.
 */

const TEST_CMD_PATTERNS = [
  /\bnpm\s+(?:run\s+)?test\b/i,
  /\bnpx?\s+jest\b/i,
  /\bnpx?\s+vitest\b/i,
  /\bnpx?\s+mocha\b/i,
  /\bpytest\b/i,
  /\bpython\s+-m\s+pytest\b/i,
  /\bgo\s+test\b/i,
  /\bcargo\s+test\b/i,
  /\bmix\s+test\b/i,
  /\bphpunit\b/i,
  /\brspec\b/i,
];
const LINT_CMD_PATTERNS = [
  /\beslint\b/i,
  /\bnpm\s+(?:run\s+)?lint\b/i,
  /\bruff\b/i,
  /\bflake8\b/i,
  /\bblack\b/i,
  /\bprettier\b/i,
];
const BUILD_CMD_PATTERNS = [
  /\bnpm\s+(?:run\s+)?build\b/i,
  /\btsc\b/i,
  /\bvite\s+build\b/i,
  /\bwebpack\b/i,
  /\bcargo\s+build\b/i,
  /\bmake\b/i,
  /\bdocker\s+build\b/i,
];
const PASS_PATTERNS = [
  /\b(?:\d+)\s+passing\b/,
  /\bok\b/,
  /\ball tests passed\b/i,
  /\bsuccess(?:fully)?\b/i,
  /\bbuilt in\b/i,
  /\bpassed\b.*?\d+/,
];
const FAIL_PATTERNS = [
  /\bfail(?:ed|ing|ure)?\b/i,
  /\b(?:\d+)\s+failing\b/,
  /\berror\b/i,
  /\btraceback\b/i,
  /\bcompilation error\b/i,
];

/**
 * @param {import('./extract.js').Event[]} events
 * @returns {{
 *   commands: { kind: 'test'|'lint'|'build', command: string, outcome: 'pass'|'fail'|'unknown' }[],
 *   summary: { tests_run: number, tests_passed: number, tests_failed: number,
 *              lints_run: number, builds_run: number }
 * }}
 */
export function summarizeBashOutcomes(events) {
  const commands = [];
  const summary = { tests_run: 0, tests_passed: 0, tests_failed: 0, lints_run: 0, builds_run: 0 };

  const actionsById = new Map();
  for (const e of events) {
    if (e.type === 'action' && e.meta?.tool_use_id) {
      actionsById.set(e.meta.tool_use_id, e);
    }
  }

  for (const e of events) {
    if (e.type !== 'outcome') continue;
    const id = e.meta?.tool_use_id;
    const act = actionsById.get(id);
    if (!act || act.meta?.tool_name !== 'Bash') continue;
    const cmd = act.meta?.command ?? '';
    let kind = null;
    if (TEST_CMD_PATTERNS.some((rx) => rx.test(cmd))) kind = 'test';
    else if (LINT_CMD_PATTERNS.some((rx) => rx.test(cmd))) kind = 'lint';
    else if (BUILD_CMD_PATTERNS.some((rx) => rx.test(cmd))) kind = 'build';
    if (!kind) continue;

    const text = String(e.raw_text ?? '');
    let outcome = 'unknown';
    if (e.meta?.is_error) outcome = 'fail';
    else if (FAIL_PATTERNS.some((rx) => rx.test(text))) outcome = 'fail';
    else if (PASS_PATTERNS.some((rx) => rx.test(text))) outcome = 'pass';
    commands.push({ kind, command: cmd, outcome });

    if (kind === 'test') {
      summary.tests_run++;
      if (outcome === 'pass') summary.tests_passed++;
      if (outcome === 'fail') summary.tests_failed++;
    } else if (kind === 'lint') {
      summary.lints_run++;
    } else if (kind === 'build') {
      summary.builds_run++;
    }
  }
  return { commands, summary };
}

/**
 * Score thrash per file. Inputs are file-grouped action lists and a Map
 * from `actionKey` → alignment ('kept'|'reverted'|'changed-later'|...).
 * @param {Map<string, Array>} byFile  filePath -> actions
 * @param {Map<string, string>} alignByKey  see git-align.actionKey
 * @returns {Array<{file: string, edits: number, reverted: number, changed_later: number, thrash: number}>}
 */
export function thrashScores(byFile, alignByKey) {
  const out = [];
  for (const [file, actions] of byFile) {
    let reverted = 0;
    let changedLater = 0;
    for (const a of actions) {
      const k = `${a.meta?.file_path ?? ''}::${a.line_offset}`;
      const v = alignByKey?.get(k);
      if (v === 'reverted') reverted++;
      else if (v === 'changed-later') changedLater++;
    }
    const thrash = reverted * 2 + changedLater;
    out.push({ file, edits: actions.length, reverted, changed_later: changedLater, thrash });
  }
  out.sort((a, b) => b.thrash - a.thrash || b.edits - a.edits);
  return out;
}
