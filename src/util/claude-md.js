import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Read a project's CLAUDE.md (if any) and return a small config object.
 * Recognised inputs:
 *  - explicit `<!-- castory:config … -->` block with a tiny key:value
 *    flavour of YAML (supports flat keys + list values, no nesting)
 *  - implicit fallback: H1 → display_name, first paragraph → description
 *
 * Returned shape (any field may be missing):
 *   { display_name, description, base_branch, repo,
 *     important_files: string[], tags: string[] }
 *
 * @param {string} projectCwd absolute path to a project root (the session's cwd)
 * @returns {Promise<Object|null>}
 */
export async function readClaudeMdConfig(projectCwd) {
  if (!projectCwd) return null;
  for (const name of ['CLAUDE.md', 'claude.md', 'Claude.md']) {
    const fp = path.join(projectCwd, name);
    try {
      const text = await readFile(fp, 'utf8');
      return parseClaudeMd(text);
    } catch {
      // try next casing
    }
  }
  return null;
}

export function parseClaudeMd(text) {
  const out = {};
  const cfg = parseConfigBlock(text);
  if (cfg) Object.assign(out, cfg);
  if (!out.display_name) {
    const h1 = text.match(/^\s*#\s+(.+?)\s*$/m);
    if (h1) out.display_name = h1[1].trim();
  }
  if (!out.description) {
    out.description = firstParagraph(text);
  }
  return Object.keys(out).length ? out : null;
}

// Extract and parse the castory:config HTML-comment block.
function parseConfigBlock(text) {
  const m = text.match(/<!--\s*castory:config\s*([\s\S]*?)-->/i);
  if (!m) return null;
  const body = m[1].trim();
  const out = {};
  const lines = body.split('\n').map((l) => l.replace(/\r$/, ''));
  let currentList = null;
  for (const raw of lines) {
    if (!raw.trim() || /^\s*#/.test(raw)) {
      currentList = null;
      continue;
    }
    const listItem = raw.match(/^\s*-\s+(.+)$/);
    if (listItem && currentList) {
      currentList.push(stripQuotes(listItem[1].trim()));
      continue;
    }
    const kv = raw.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const valRaw = kv[2].trim();
    if (valRaw === '') {
      out[key] = [];
      currentList = out[key];
    } else if (valRaw.startsWith('[') && valRaw.endsWith(']')) {
      out[key] = valRaw
        .slice(1, -1)
        .split(',')
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean);
      currentList = null;
    } else {
      out[key] = stripQuotes(valRaw);
      currentList = null;
    }
  }
  return out;
}

function firstParagraph(text) {
  const body = text.replace(/<!--[\s\S]*?-->/g, '');
  const lines = body.split('\n');
  // Skip leading H1/blank/HR.
  let i = 0;
  while (i < lines.length && /^\s*(#|<|-{3,}|=={3,}|\s*$)/.test(lines[i])) i++;
  const para = [];
  while (i < lines.length && lines[i].trim()) {
    para.push(lines[i].trim());
    i++;
  }
  const joined = para.join(' ').replace(/\s+/g, ' ').trim();
  return joined.slice(0, 280);
}

function stripQuotes(s) {
  if (!s) return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Compile important_files globs into a single test function.
 * Supports `**` (any depth) and `*` (path segment) globs.
 * @param {string[]} globs
 * @returns {(absPath: string, repoRoot: string|null) => boolean}
 */
export function compileGlobs(globs) {
  if (!globs || !globs.length) return () => false;
  const regs = globs.map((g) => globToRegex(g));
  return (absPath, repoRoot) => {
    if (!absPath) return false;
    const rel = repoRoot ? path.relative(repoRoot, absPath) : absPath;
    return regs.some((rx) => rx.test(rel));
  };
}

function globToRegex(glob) {
  // Escape regex metachars except for glob ones, then translate * and **
  // through sentinels so the regex injected by `**/` isn't clobbered by
  // the subsequent `*` pass.
  const esc = String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pat = esc
    .replace(/\*\*\//g, '\x01')
    .replace(/\*\*/g, '\x02')
    .replace(/\*/g, '\x03')
    .replace(/\?/g, '\x04')
    .replace(/\x01/g, '(?:.*/)?')
    .replace(/\x02/g, '.*')
    .replace(/\x03/g, '[^/]*')
    .replace(/\x04/g, '.');
  return new RegExp('^' + pat + '$');
}
