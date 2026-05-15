# prstory

Turn Claude Code transcripts into readable PR stories — locally.

`prstory` reads the JSONL transcripts that Claude Code already writes to
`~/.claude/projects/` and renders three views over them:

- **dashboard** — every session you've ever run, filterable & searchable
- **session** — one conversation replayed as decisions / interventions / edits
- **PR** — sessions on a branch consolidated into paste-ready markdown

All processing happens on your machine. There are **no network calls** and
**no LLM calls** in the default codepath.

## Install

Recommended — install globally from a checkout:

```sh
git clone <this-repo> prstory && cd prstory
npm install -g .
```

Or run without installing (once published):

```sh
npx prstory dashboard
```

For development against the source tree, use `npm link`:

```sh
cd prstory && npm link
# `prstory` now resolves to your working copy
```

Requires Node ≥ 20.

## Quick start

```sh
prstory dashboard           # build + open in your browser
prstory list                # plain-text list of every session
prstory session <id>        # render a single session as HTML
prstory pr --branch foo     # consolidate sessions on a branch into a PR
prstory dashboard --serve   # local server with 30s auto-refresh
```

## Commands

| Command                              | What it does                                         |
|--------------------------------------|------------------------------------------------------|
| `prstory list`                       | Print discovered sessions across all projects        |
| `prstory list --json`                | Same, machine-readable                               |
| `prstory session <id>`               | Render one session as HTML to stdout                 |
| `prstory session <id> --out PATH`    | Write HTML to `PATH`                                 |
| `prstory pr --branch <name>`         | Consolidate sessions on a branch into PR markdown    |
| `prstory pr --branch foo --repo .`   | Look in a specific repo for the branch's commits     |
| `prstory dashboard`                  | Build the dashboard and open it in your browser      |
| `prstory dashboard --out PATH`       | Write the dashboard HTML to `PATH`, don't open       |
| `prstory dashboard --serve`          | Start a local server with auto-refresh               |
| `prstory dashboard --serve --port N` | Start the server on a specific port (auto-increments if busy) |
| `prstory dashboard --projects A,B`   | Restrict to specific project paths                   |
| `prstory --version` / `--help`       | Standard CLI flags (each subcommand has its own `--help`) |

## What it extracts

Each session is parsed into events:

- **decisions** — assistant statements of intent ("I'll …", "Let me …")
- **forks** — the assistant offering you a choice
- **interventions** — your steering message after a fork or correction
- **actions** — `Edit` / `Write` / `Bash` tool calls
- **outcomes** — tool results

Events are grouped into chapters by file proximity and idle gaps (>5 min).
For PR consolidation, actions are deduped by `(file_path, tool, command)`
and decisions by token-set similarity > 0.85. **Every intervention is
preserved verbatim** — those are the highest-signal moments in a session.

## Privacy

- All data stays on your machine.
- No network calls in the default codepath. Verify in DevTools: opening the
  dashboard makes **zero** outbound requests.
- No LLM calls. Summaries are extracted strings from your transcript.
- Cache lives at `~/.cache/prstory/` — delete it any time.

## Uninstall

```sh
npm uninstall -g prstory
rm -rf ~/.cache/prstory
```

## Development

```sh
npm test            # unit + integration tests
npm run test:e2e    # playwright headless smoke (requires `npx playwright install chromium` once)
```

No runtime npm dependencies — everything is Node stdlib. Playwright is the
only dev dependency.

## Schema reference

See [`docs/transcript-schema.md`](docs/transcript-schema.md) for the
verbatim Claude Code JSONL schema this tool reads.
