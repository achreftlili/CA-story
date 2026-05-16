import { parseSubArgs } from '../cli.js';
import { findSessionById } from '../discover.js';
import { parseSession } from '../parse.js';
import { extractEvents } from '../extract.js';
import { buildTimeline } from '../timeline.js';
import { renderSessionHtml } from '../render/session-html.js';
import { claudeProjectsRoot } from '../util/paths.js';
import { findRepoRoot, getOriginUrl, githubWebBase } from '../util/git.js';
import { readClaudeMdConfig } from '../util/claude-md.js';
import { writeFile } from 'node:fs/promises';

function countToolCalls(events) {
  const out = {};
  for (const e of events) {
    if (e.kind !== 'assistant') continue;
    const content = e.raw?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type === 'tool_use' && b.name) {
        out[b.name] = (out[b.name] ?? 0) + 1;
      }
    }
  }
  return out;
}

function countSkillsUsed(events) {
  const out = {};
  for (const e of events) {
    if (e.kind !== 'assistant') continue;
    const attr = e.raw?.attributionSkill;
    if (typeof attr === 'string' && attr) out[attr] = (out[attr] ?? 0) + 1;
    const content = e.raw?.message?.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b?.type === 'tool_use' && b.name === 'Skill' && b.input?.skill) {
          const k = b.input.skill;
          out[k] = (out[k] ?? 0) + 1;
        }
      }
    }
  }
  return out;
}

function countSubagentsUsed(events) {
  const out = {};
  for (const e of events) {
    if (e.kind !== 'assistant') continue;
    const content = e.raw?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task') && b.input?.subagent_type) {
        const k = b.input.subagent_type;
        out[k] = (out[k] ?? 0) + 1;
      }
    }
  }
  return out;
}

function sumTokens(events) {
  const t = { input: 0, output: 0, cache_read: 0, cache_creation: 0, assistant_messages: 0 };
  const seen = new Set();
  for (const e of events) {
    if (e.kind !== 'assistant') continue;
    const u = e.raw?.message?.usage;
    const mid = e.raw?.message?.id;
    if (!u || !mid || seen.has(mid)) continue;
    seen.add(mid);
    t.input += +(u.input_tokens || 0);
    t.output += +(u.output_tokens || 0);
    t.cache_read += +(u.cache_read_input_tokens || 0);
    t.cache_creation += +(u.cache_creation_input_tokens || 0);
    t.assistant_messages++;
  }
  t.total = t.input + t.output + t.cache_read + t.cache_creation;
  t.billable = t.input + t.output + t.cache_creation;
  return t;
}

const HELP = `prstory session — render one session as HTML

Usage:
  prstory session <sessionId> [--out PATH]

Options:
  --out PATH    Write HTML to PATH (default: stdout)
  --help, -h    Show this help
`;

export async function run(argv) {
  const { values, positionals } = parseSubArgs(argv, {
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const sessionId = positionals[0];
  if (!sessionId) {
    process.stderr.write('prstory session: missing <sessionId>\n\n' + HELP);
    return 2;
  }

  const located = await findSessionById(sessionId, claudeProjectsRoot());
  if (!located) {
    process.stderr.write(`prstory session: no session found for id '${sessionId}'\n`);
    return 1;
  }

  const raw = await parseSession(located.path);
  const events = extractEvents(raw);
  const gitBranch = raw.events.find((e) => e.gitBranch)?.gitBranch ?? null;
  const cwd = raw.events.find((e) => e.cwd)?.cwd ?? null;
  const repoRoot = cwd ? await findRepoRoot(cwd) : null;
  const githubBase = repoRoot ? githubWebBase(await getOriginUrl(repoRoot)) : null;
  const claudeMd = (await readClaudeMdConfig(cwd)) ?? (repoRoot ? await readClaudeMdConfig(repoRoot) : null);
  const importantFiles = claudeMd?.important_files ?? [];
  const timeline = buildTimeline(events, { sessionId, gitBranch, githubBase, repoRoot, importantFiles });
  const tokens = sumTokens(raw.events);
  const toolCalls = countToolCalls(raw.events);
  const skillsUsed = countSkillsUsed(raw.events);
  const subagentsUsed = countSubagentsUsed(raw.events);
  const html = renderSessionHtml(timeline, {
    meta: {
      ...located,
      displayName: claudeMd?.display_name,
      tokens,
      toolCalls,
      skillsUsed,
      subagentsUsed,
    },
  });

  if (values.out) {
    await writeFile(values.out, html, 'utf8');
    process.stdout.write(`${values.out}\n`);
  } else {
    process.stdout.write(html);
  }
  return 0;
}
