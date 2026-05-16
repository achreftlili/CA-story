import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const USAGE = `prstory ${pkg.version}

Usage:
  prstory <command> [options]

Commands:
  list                          Discovered sessions across all projects
  session <id>                  Render one session as HTML
  pr --branch <name>            Render PR consolidation
  share                         Commit this branch's sessions to the repo
  dashboard                     Build + open the dashboard
  dashboard --serve [--port N]  Local server with auto-refresh

Common options:
  --help, -h                    Print help (works per subcommand too)
  --version, -v                 Print version

Run 'prstory <command> --help' for command-specific options.
`;

export async function main(argv) {
  if (argv.length === 0) {
    process.stdout.write(USAGE);
    return 0;
  }

  const first = argv[0];

  if (first === '--version' || first === '-v') {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  if (first === '--help' || first === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  const rest = argv.slice(1);

  switch (first) {
    case 'list':
      return (await import('./cmd/list.js')).run(rest);
    case 'session':
      return (await import('./cmd/session.js')).run(rest);
    case 'pr':
      return (await import('./cmd/pr.js')).run(rest);
    case 'share':
      return (await import('./cmd/share.js')).run(rest);
    case 'dashboard':
      return (await import('./cmd/dashboard.js')).run(rest);
    default:
      process.stderr.write(`prstory: unknown command '${first}'\n\n${USAGE}`);
      return 2;
  }
}

// Helper: parse args for a subcommand with a shared error path.
export function parseSubArgs(argv, options) {
  try {
    return parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (err) {
    const e = new Error(err.message);
    e.userMessage = err.message;
    e.exitCode = 2;
    throw e;
  }
}
