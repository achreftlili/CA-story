import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cacheRoot, cacheIndexFile } from './paths.js';

export async function loadIndexCache() {
  try {
    const text = await readFile(cacheIndexFile(), 'utf8');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return emptyCache();
    parsed.entries ??= {};
    return parsed;
  } catch {
    return emptyCache();
  }
}

export async function saveIndexCache(cache) {
  await mkdir(cacheRoot(), { recursive: true });
  await writeFile(cacheIndexFile(), JSON.stringify(cache, null, 2), 'utf8');
}

function emptyCache() {
  return { version: 1, entries: {} };
}

export function cacheKey(absPath, stat) {
  return `${absPath}::${stat.size}::${Math.round(stat.mtimeMs)}`;
}
