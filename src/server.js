import { createServer } from 'node:http';
import { buildIndex } from './dashboard.js';
import { findSessionById, findSharedSessionById } from './discover.js';
import { parseSession } from './parse.js';
import { extractEvents } from './extract.js';
import { buildTimeline } from './timeline.js';
import { renderDashboardHtml } from './render/dashboard-html.js';
import { renderTimelineBody } from './render/session-html.js';
import { findRepoRoot, getOriginUrl, githubWebBase } from './util/git.js';
import { readClaudeMdConfig } from './util/claude-md.js';

const DEFAULT_PORT = 7842;
const PORT_TRIES = 50;

/**
 * Start a local HTTP server serving the dashboard with live refresh.
 * @param {{ projectsRoot: string, projectPaths: string[]|null, port?: number }} opts
 */
export async function startServer(opts) {
  const startPort = opts.port ?? DEFAULT_PORT;
  const projectsRoot = opts.projectsRoot;
  const projectPaths = opts.projectPaths ?? null;
  const repoRoot = opts.repoRoot ?? null;

  const fragmentCache = new Map();

  async function freshIndex() {
    return buildIndex({ projectsRoot, projectPaths, repoRoot });
  }

  async function renderShell() {
    const idx = await freshIndex();
    return renderDashboardHtml(idx, { serve: true });
  }

  async function fragmentFor(sessionId) {
    const cached = fragmentCache.get(sessionId);
    if (cached) return cached;
    let loc = await findSessionById(sessionId, projectsRoot);
    if (!loc && repoRoot) {
      loc = await findSharedSessionById(sessionId, repoRoot);
    }
    if (!loc) return null;
    const { events } = await parseSession(loc.path);
    const evs = extractEvents({ events });
    const gitBranch = events.find((e) => e.gitBranch)?.gitBranch ?? null;
    const cwd = events.find((e) => e.cwd)?.cwd ?? null;
    const sessionRepoRoot = cwd ? await findRepoRoot(cwd) : null;
    const githubBase = sessionRepoRoot ? githubWebBase(await getOriginUrl(sessionRepoRoot)) : null;
    const cmd = (await readClaudeMdConfig(cwd)) ?? (sessionRepoRoot ? await readClaudeMdConfig(sessionRepoRoot) : null);
    const importantFiles = cmd?.important_files ?? [];
    const timeline = buildTimeline(evs, { sessionId, gitBranch, githubBase, repoRoot: sessionRepoRoot, importantFiles });
    const body = renderTimelineBody(timeline);
    fragmentCache.set(sessionId, body);
    return body;
  }

  const server = createServer(async (req, res) => {
    try {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        return res.end('Method not allowed');
      }
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = await renderShell();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(html);
      }
      if (url.pathname === '/api/index') {
        const idx = await freshIndex();
        // Strip private fields and any cached fragments.
        idx.sessions = idx.sessions.map(stripPrivate);
        fragmentCache.clear();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify(idx));
      }
      const m = url.pathname.match(/^\/api\/session\/(.+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const body = await fragmentFor(id);
        if (!body) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(body);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`prstory error: ${err.message}`);
    }
  });

  const port = await listenWithFallback(server, startPort, PORT_TRIES);
  const url = `http://127.0.0.1:${port}/`;

  return {
    server,
    port,
    url,
    close() {
      return new Promise((resolve) => {
        server.close(() => resolve());
        setTimeout(() => resolve(), 1000);
      });
    },
  };
}

function listenWithFallback(server, startPort, tries) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function tryOnce() {
      const port = startPort === 0 ? 0 : startPort + attempt;
      const onError = (err) => {
        server.off('listening', onListening);
        if (err && err.code === 'EADDRINUSE' && attempt < tries - 1) {
          attempt++;
          tryOnce();
          return;
        }
        reject(err);
      };
      const onListening = () => {
        server.off('error', onError);
        const actual = server.address();
        resolve(typeof actual === 'object' && actual ? actual.port : port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      // Bind explicitly to 127.0.0.1 — sandboxed environments often block
      // dual-stack listening on '::'.
      server.listen(port, '127.0.0.1');
    }
    tryOnce();
  });
}

function stripPrivate(s) {
  const copy = { ...s };
  delete copy.__sourcePath;
  return copy;
}
