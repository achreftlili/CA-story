import { parseSubArgs } from '../cli.js';
import { buildIndex } from '../dashboard.js';
import { renderDashboardHtml } from '../render/dashboard-html.js';
import { renderSessionHtml, renderTimelineBody } from '../render/session-html.js';
import { parseSession } from '../parse.js';
import { extractEvents } from '../extract.js';
import { buildTimeline } from '../timeline.js';
import {
  claudeProjectsRoot,
  cacheDashboardDir,
  cacheSessionsDir,
} from '../util/paths.js';
import { startServer } from '../server.js';
import { openInBrowser } from '../util/open.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HELP = `prstory dashboard — build and view the cross-session dashboard

Usage:
  prstory dashboard [--out PATH] [--serve] [--port N] [--projects A,B]

Options:
  --out PATH       Write index HTML to PATH and exit; do not open browser
  --serve          Start a local HTTP server with auto-refresh
  --port N         Server port (default 7842, auto-increments if busy)
  --projects DIRS  Comma-separated project paths to include
  --no-open        Do not auto-open browser (default mode only)
  --help, -h       Show this help
`;

export async function run(argv) {
  const { values } = parseSubArgs(argv, {
    out: { type: 'string' },
    serve: { type: 'boolean', default: false },
    port: { type: 'string' },
    projects: { type: 'string' },
    'no-open': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const projectPaths = values.projects
    ? values.projects.split(',').map((s) => s.trim()).filter(Boolean)
    : null;
  const projectsRoot = claudeProjectsRoot();

  if (values.serve) {
    const port = values.port ? Number(values.port) : 7842;
    const srv = await startServer({ projectsRoot, projectPaths, port });
    process.stdout.write(`prstory: serving at ${srv.url}\n`);
    if (!values['no-open']) await openInBrowser(srv.url);
    await new Promise((resolve) => {
      const handler = () => {
        process.stdout.write('\nprstory: shutting down...\n');
        srv.close().then(resolve);
      };
      process.on('SIGINT', handler);
      process.on('SIGTERM', handler);
    });
    return 0;
  }

  const index = await buildIndex({ projectsRoot, projectPaths });

  // Build per-session fragments for inline expansion (so file:// works
  // without fetch). Also write standalone session HTML files so users can
  // share or bookmark them.
  const fragments = {};
  let outDir;
  let indexPath;
  if (values.out) {
    indexPath = path.resolve(values.out);
    outDir = path.dirname(indexPath);
  } else {
    outDir = cacheDashboardDir();
    indexPath = path.join(outDir, 'index.html');
  }
  const sessionsDir = path.join(outDir, 'sessions');
  await mkdir(sessionsDir, { recursive: true });

  for (const s of index.sessions) {
    try {
      const { events } = await parseSession(s.__sourcePath);
      const evs = extractEvents({ events });
      const timeline = buildTimeline(evs, {
        sessionId: s.id,
        gitBranch: s.git_branch,
        githubBase: s.github_base,
        repoRoot: s.repo_root,
      });
      fragments[s.id] = renderTimelineBody(timeline);
      const standalone = renderSessionHtml(timeline, {
        meta: { cwdGuess: s.project_path, projectDir: '' },
      });
      await writeFile(path.join(sessionsDir, `${s.id}.html`), standalone, 'utf8');
    } catch (err) {
      process.stderr.write(`prstory: skipping fragment for ${s.id}: ${err.message}\n`);
    }
  }

  const html = renderDashboardHtml(index, { fragments });
  await writeFile(indexPath, html, 'utf8');

  process.stdout.write(`${indexPath}\n`);
  if (!values.out && !values['no-open']) {
    await openInBrowser(indexPath);
  }
  return 0;
}
