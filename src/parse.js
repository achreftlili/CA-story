import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

/**
 * @typedef {Object} RawEvent
 * @property {string} kind                  // user | assistant | system | attachment | meta
 * @property {string|null} timestamp        // ISO-8601
 * @property {string|null} sessionId
 * @property {string|null} cwd
 * @property {string|null} gitBranch
 * @property {string|null} uuid
 * @property {string|null} parentUuid
 * @property {number} lineOffset            // 0-based line index in the JSONL
 * @property {any} raw                      // original parsed line
 */

const KIND_FOR_TYPE = {
  user: 'user',
  assistant: 'assistant',
  system: 'system',
  attachment: 'attachment',
};

/**
 * Parse a JSONL transcript line-by-line via streaming, tolerating the
 * malformed final line that's common in sessions killed mid-write.
 * @param {string} jsonlPath
 * @returns {Promise<{events: RawEvent[], stats: {totalLines:number, badLines:number}}>}
 */
export async function parseSession(jsonlPath) {
  const events = [];
  let totalLines = 0;
  let badLines = 0;
  let lastGoodTimestamp = null;

  const stream = createReadStream(jsonlPath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      const lineOffset = totalLines;
      totalLines++;
      if (!line) continue;

      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        badLines++;
        // Likely the final, half-written record. Skip silently — by design.
        continue;
      }

      const t = obj.timestamp ?? null;
      if (t) lastGoodTimestamp = t;

      const kind = KIND_FOR_TYPE[obj.type] ?? 'meta';

      events.push({
        kind,
        type: obj.type ?? null,
        timestamp: t ?? lastGoodTimestamp,
        sessionId: obj.sessionId ?? null,
        cwd: obj.cwd ?? null,
        gitBranch: obj.gitBranch ?? null,
        uuid: obj.uuid ?? null,
        parentUuid: obj.parentUuid ?? null,
        lineOffset,
        raw: obj,
      });
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return { events, stats: { totalLines, badLines } };
}

/**
 * Helper: extract content blocks from a message envelope. Returns an array
 * of blocks even when `message.content` is a plain string.
 */
export function messageBlocks(rawEvent) {
  const msg = rawEvent?.raw?.message;
  if (!msg) return [];
  const c = msg.content;
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  if (Array.isArray(c)) return c;
  return [];
}

/** Helper: gather all text from a message regardless of content shape. */
export function messageText(rawEvent) {
  return messageBlocks(rawEvent)
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

/** Helper: gather all tool_use blocks from a message. */
export function messageToolUses(rawEvent) {
  return messageBlocks(rawEvent).filter((b) => b && b.type === 'tool_use');
}

/** Helper: gather all tool_result blocks from a message. */
export function messageToolResults(rawEvent) {
  return messageBlocks(rawEvent).filter((b) => b && b.type === 'tool_result');
}
