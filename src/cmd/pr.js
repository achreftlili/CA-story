import { parseSubArgs } from '../cli.js';
import { findBranchSessions } from '../discover.js';
import { parseSession } from '../parse.js';
import { extractEvents } from '../extract.js';
import { buildTimeline } from '../timeline.js';
import { consolidate } from '../consolidate.js';
import { renderPrMarkdown } from '../render/markdown.js';
import { renderPrHtml } from '../render/pr-html.js';
import { buildPrStory } from '../pr-build.js';
import { openInBrowser } from '../util/open.js';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const HELP = `prstory pr — render PR consolidation

Usage:
  prstory pr --branch <name> [--repo PATH] [--out PATH] [--html] [--open]

Options:
  --branch NAME   Git branch to consolidate sessions for (required)
  --repo PATH     Git repo root (default: cwd)
  --out PATH      Write output to PATH (default: stdout)
  --html          Render as a rich HTML report (default: markdown)
  --open          With --html, open the result in your browser
  --help, -h      Show this help
`;

export async function run(argv) {
  const { values } = parseSubArgs(argv, {
    branch: { type: 'string' },
    repo: { type: 'string' },
    out: { type: 'string' },
    html: { type: 'boolean', default: false },
    open: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  if (!values.branch) {
    process.stderr.write('prstory pr: --branch is required\n\n' + HELP);
    return 2;
  }

  const repo = values.repo ?? process.cwd();

  if (values.html) {
    const story = await buildPrStory({ branch: values.branch, repoPath: repo });
    if (story.session_ids.length === 0) {
      process.stderr.write(`prstory pr: no sessions found for branch '${values.branch}' in ${repo}\n`);
      return 1;
    }
    const html = renderPrHtml(story);
    const outPath = values.out ? path.resolve(values.out) : null;
    if (outPath) {
      await writeFile(outPath, html, 'utf8');
      process.stdout.write(`${outPath}\n`);
      if (values.open) await openInBrowser(outPath);
    } else {
      process.stdout.write(html);
    }
    return 0;
  }

  // Markdown path (preserved from previous behavior).
  const sessions = await findBranchSessions(values.branch, repo);
  if (sessions.length === 0) {
    process.stderr.write(`prstory pr: no sessions found for branch '${values.branch}' in ${repo}\n`);
    return 1;
  }
  const timelines = [];
  for (const s of sessions) {
    const raw = await parseSession(s.path);
    const events = extractEvents(raw);
    timelines.push(buildTimeline(events, { sessionId: s.sessionId }));
  }
  const story = consolidate(timelines, values.branch);
  const md = renderPrMarkdown(story);
  if (values.out) {
    await writeFile(values.out, md, 'utf8');
    process.stdout.write(`${values.out}\n`);
  } else {
    process.stdout.write(md);
  }
  return 0;
}
