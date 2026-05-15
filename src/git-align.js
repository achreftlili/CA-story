import path from 'node:path';
import { readFileAtRef, diffFiles } from './util/git.js';

/**
 * For a list of Edit/Write actions and a target ref, classify each action
 * as one of:
 *   - kept           : the change is visible in the file at HEAD
 *   - reverted       : the pre-edit text is back at HEAD (likely undone)
 *   - changed-later  : neither old nor new matches — something else replaced it
 *   - not-in-pr      : the file is not part of the diff base..head
 *   - unknown        : couldn't read the file (deleted? renamed?)
 *
 * @param {Array} actions array of action events with meta.file_path/old_string/new_string
 * @param {{repoRoot: string, base: string|null, head: string}} ctx
 * @returns {Promise<Map<string, 'kept'|'reverted'|'changed-later'|'not-in-pr'|'unknown'>>}
 *          mapped by `${file_path}::${line_offset}`
 */
export async function alignActions(actions, ctx) {
  const result = new Map();
  const filesAtHead = new Map();
  const filesAtBase = new Map();
  const inDiff = new Set();
  let diffComputed = false;

  if (ctx.repoRoot && ctx.base) {
    try {
      const files = await diffFiles(ctx.base, ctx.head, ctx.repoRoot);
      for (const f of files) inDiff.add(path.join(ctx.repoRoot, f));
      diffComputed = true;
    } catch {
      // fallthrough — keep all as unknown vs-in-pr
    }
  }

  async function fileAtRef(ref, abs, cache) {
    if (cache.has(abs)) return cache.get(abs);
    const rel = path.relative(ctx.repoRoot, abs);
    if (!rel || rel.startsWith('..')) {
      cache.set(abs, null);
      return null;
    }
    const text = await readFileAtRef(ref, rel, ctx.repoRoot);
    cache.set(abs, text);
    return text;
  }

  for (const a of actions) {
    const fp = a.meta?.file_path;
    if (!fp) continue;
    const key = actionKey(a);

    if (diffComputed && !inDiff.has(fp)) {
      result.set(key, 'not-in-pr');
      continue;
    }

    const head = await fileAtRef(ctx.head, fp, filesAtHead);
    if (head == null) {
      result.set(key, 'unknown');
      continue;
    }
    const newS = (a.meta?.new_string ?? '').trim();
    const oldS = (a.meta?.old_string ?? '').trim();

    if (newS && head.includes(newS)) {
      result.set(key, 'kept');
      continue;
    }
    if (oldS && head.includes(oldS)) {
      result.set(key, 'reverted');
      continue;
    }
    // Compare with base too — if old_string is in base but neither old nor
    // new is in head, the file changed past this edit.
    if (ctx.base) {
      const base = await fileAtRef(ctx.base, fp, filesAtBase);
      if (base != null && oldS && base.includes(oldS)) {
        result.set(key, 'changed-later');
        continue;
      }
    }
    result.set(key, 'changed-later');
  }
  return result;
}

export function actionKey(a) {
  return `${a.meta?.file_path ?? ''}::${a.line_offset}`;
}
