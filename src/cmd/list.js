import { parseSubArgs } from '../cli.js';
import { listAllSessions } from '../discover.js';
import { claudeProjectsRoot, projectNameFromCwd } from '../util/paths.js';
import path from 'node:path';

const HELP = `castory list — show discovered sessions across all projects

Usage:
  castory list [--projects DIR1,DIR2] [--json]

Options:
  --projects DIRS   Comma-separated absolute paths to restrict scanning to
  --json            Output JSON instead of a table
  --help, -h        Show this help
`;

export async function run(argv) {
  const { values } = parseSubArgs(argv, {
    projects: { type: 'string' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const projectsRoot = claudeProjectsRoot();
  const filter = values.projects ? values.projects.split(',').map((s) => s.trim()) : null;

  const rows = [];
  for await (const s of listAllSessions(projectsRoot)) {
    if (filter && !filter.some((f) => s.projectDir.startsWith(f) || s.cwdGuess?.startsWith(f))) {
      continue;
    }
    rows.push(s);
  }

  rows.sort((a, b) => (a.mtimeMs > b.mtimeMs ? -1 : 1));

  if (values.json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
    return 0;
  }

  if (rows.length === 0) {
    process.stdout.write('No sessions found.\n');
    return 0;
  }

  for (const r of rows) {
    const name = projectNameFromCwd(r.cwdGuess ?? r.projectDir);
    const stamp = new Date(r.mtimeMs).toISOString().replace('T', ' ').slice(0, 16);
    process.stdout.write(`${stamp}  ${r.sessionId}  ${name}  ${path.basename(r.path)}\n`);
  }

  return 0;
}
