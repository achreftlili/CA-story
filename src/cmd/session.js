import { parseSubArgs } from '../cli.js';
import { findSessionById } from '../discover.js';
import { parseSession } from '../parse.js';
import { extractEvents } from '../extract.js';
import { buildTimeline } from '../timeline.js';
import { renderSessionHtml } from '../render/session-html.js';
import { claudeProjectsRoot } from '../util/paths.js';
import { findRepoRoot, getOriginUrl, githubWebBase } from '../util/git.js';
import { writeFile } from 'node:fs/promises';

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
  const timeline = buildTimeline(events, { sessionId, gitBranch, githubBase, repoRoot });
  const html = renderSessionHtml(timeline, { meta: located });

  if (values.out) {
    await writeFile(values.out, html, 'utf8');
    process.stdout.write(`${values.out}\n`);
  } else {
    process.stdout.write(html);
  }
  return 0;
}
