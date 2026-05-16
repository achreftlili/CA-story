import { messageText, messageToolUses, messageToolResults } from './parse.js';

/**
 * @typedef {Object} Event
 * @property {'decision'|'fork'|'intervention'|'action'|'outcome'} type
 * @property {string} raw_text
 * @property {string} session_id
 * @property {string} timestamp
 * @property {number} line_offset
 * @property {Object} meta
 */

const RE_DECISION = /\b(I['’]ll|Let me|Because|The reason|Going with|Going to|I[\s']+will|We should|We[\s']+ll)\b/i;
const RE_FORK = /\b(two options|three options|could either|should I|would you prefer|either\b.+\bor\b|do you want me to|which (?:approach|one))/i;
const RE_INTERVENTION = /\b(no(?:t|pe)?\b|instead|actually|don['’]t|stop\b|wait\b|use\s+\S+\s+not\s+\S+|never\s+\S+|please\s+(?:use|don['’]t|stop))/i;

// "Yes/ok/go ahead" — explicit confirmations are NOT interventions.
const RE_CONFIRMATION = /^(yes|y|yeah|yep|ok|okay|sure|go ahead|do it|proceed|continue|fine)\b\s*[.!?]?\s*$/i;

const ACTION_TOOLS = new Set(['Edit', 'Write', 'Bash', 'MultiEdit', 'NotebookEdit']);

/**
 * Convert parse.js's RawEvent[] into a flat Event[] suitable for the
 * timeline/consolidation passes.
 * @param {{events: import('./parse.js').RawEvent[]}} parsed
 * @returns {Event[]}
 */
export function extractEvents(parsed) {
  const out = [];
  const raws = parsed.events;
  let lastAssistantWasFork = false;
  let lastForkRef = null;

  for (let i = 0; i < raws.length; i++) {
    const ev = raws[i];
    const sid = ev.sessionId ?? '';
    const ts = ev.timestamp ?? '';
    const off = ev.lineOffset;

    if (ev.kind === 'assistant') {
      const text = messageText(ev).trim();
      const tools = messageToolUses(ev);

      // Detect forks first — they affect subsequent intervention classification.
      let isFork = false;
      if (text && RE_FORK.test(text)) {
        isFork = true;
        const e = makeEvent('fork', text, sid, ts, off, { uuid: ev.uuid });
        out.push(e);
        lastForkRef = e;
      }

      // Decisions: capture once per text block, even if a fork was emitted.
      if (text && RE_DECISION.test(text)) {
        out.push(makeEvent('decision', text, sid, ts, off, { uuid: ev.uuid }));
      }

      // Actions: tool_use of Edit/Write/Bash/etc.
      for (const t of tools) {
        if (!ACTION_TOOLS.has(t.name)) continue;
        const meta = { tool_name: t.name, tool_use_id: t.id };
        const input = t.input ?? {};
        if (input.file_path) meta.file_path = input.file_path;
        if (input.command) meta.command = input.command;
        if (input.description) meta.description = input.description;
        if (t.name === 'Edit' || t.name === 'MultiEdit') {
          if (typeof input.old_string === 'string') meta.old_string = clip(input.old_string, 800);
          if (typeof input.new_string === 'string') meta.new_string = clip(input.new_string, 800);
        }
        if (t.name === 'Write' && typeof input.content === 'string') {
          meta.new_string = clip(input.content, 800);
        }
        const summary = describeTool(t);
        out.push(makeEvent('action', summary, sid, ts, off, meta));
      }

      lastAssistantWasFork = isFork;
      continue;
    }

    if (ev.kind === 'user') {
      const text = messageText(ev).trim();
      const toolResults = messageToolResults(ev);

      // Tool results -> outcome events.
      for (const tr of toolResults) {
        const meta = {
          tool_use_id: tr.tool_use_id,
          is_error: !!tr.is_error,
        };
        const trText = stringifyToolResult(tr.content);
        // toolUseResult sibling object often carries stderr/interrupted.
        if (ev.raw?.toolUseResult) {
          if (ev.raw.toolUseResult.interrupted) meta.interrupted = true;
          if (ev.raw.toolUseResult.stderr) meta.stderr_excerpt = ev.raw.toolUseResult.stderr.slice(0, 200);
        }
        out.push(makeEvent('outcome', trText.slice(0, 500), sid, ts, off, meta));
      }

      // Plain user text -> potential intervention.
      if (!text) continue;
      if (isAutomatedUserMessage(ev)) continue;
      if (RE_CONFIRMATION.test(text)) continue;

      const intervened =
        lastAssistantWasFork ||
        RE_INTERVENTION.test(text);

      if (intervened) {
        out.push(
          makeEvent('intervention', text, sid, ts, off, {
            after_fork: lastAssistantWasFork,
            fork_uuid: lastForkRef?.meta?.uuid ?? null,
            fork_text: lastAssistantWasFork ? lastForkRef?.raw_text ?? null : null,
          }),
        );
        lastAssistantWasFork = false;
      } else {
        // Initial user prompt isn't an "intervention" in the steering sense,
        // but it IS a decision the user made. Capture as a decision so it
        // shows in the timeline as session intent.
        if (looksLikeFirstUserPrompt(out, ev)) {
          out.push(makeEvent('decision', text, sid, ts, off, { user_intent: true }));
        }
      }
    }
  }

  return out;
}

function makeEvent(type, raw_text, session_id, timestamp, line_offset, meta) {
  return { type, raw_text, session_id, timestamp, line_offset, meta: meta ?? {} };
}

function clip(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n… (${s.length - n} more chars)`;
}

function describeTool(toolUse) {
  const name = toolUse.name;
  const input = toolUse.input ?? {};
  if (name === 'Edit' || name === 'MultiEdit') {
    return `${name} ${input.file_path ?? '(unknown file)'}`;
  }
  if (name === 'Write') {
    return `Write ${input.file_path ?? '(unknown file)'}`;
  }
  if (name === 'Bash') {
    const cmd = input.command ?? '';
    const oneLine = cmd.replace(/\s+/g, ' ').slice(0, 160);
    return `Bash: ${oneLine}`;
  }
  if (name === 'NotebookEdit') {
    return `NotebookEdit ${input.notebook_path ?? '(unknown notebook)'}`;
  }
  return name;
}

function stringifyToolResult(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b?.text ?? JSON.stringify(b)))
      .join('\n');
  }
  return JSON.stringify(content ?? '');
}

function isAutomatedUserMessage(ev) {
  // System reminders, command-message wrappers, ide_opened_file, etc. are
  // emitted as "user" type but aren't real user words.
  if (ev.raw?.isMeta) return true;
  const text = messageText(ev);
  if (!text) return true;
  if (/<command-(name|message|args)>/.test(text)) return true;
  if (/<system-reminder>/.test(text)) return true;
  if (/<ide_opened_file>/.test(text)) return true;
  if (/<local-command-(stdout|stderr|caveat)>/.test(text)) return true;
  return false;
}

function looksLikeFirstUserPrompt(eventsSoFar, ev) {
  // Heuristic: the first non-automated user message in the session.
  return !eventsSoFar.some((e) => e.type === 'decision' && e.meta?.user_intent);
}
