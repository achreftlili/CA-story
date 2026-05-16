# Coding Agent Story

Turn Claude Code transcripts into readable PR stories — locally.

![coding-agent-story dashboard](docs/dashboard.png)

`coding-agent-story` reads the JSONL transcripts that Claude Code already writes to
`~/.claude/projects/` and renders three views over them:

- **dashboard** — every session you've ever run, filterable & searchable
- **session** — one conversation replayed as decisions / interventions / edits
- **PR** — sessions on a branch consolidated into paste-ready markdown

All processing happens on your machine. There are **no network calls** and
**no LLM calls** in the default codepath.

## Install

```sh
npm install -g coding-agent-story
```

Or run with no install:

```sh
npx coding-agent-story@latest dashboard
```

Requires Node ≥ 20.

For development against the source tree, use `npm link`:

```sh
git clone https://github.com/achreftlili/coding-agent-story.git && cd coding-agent-story
npm link    # `coding-agent-story` now resolves to your working copy
```

## Quick start

```sh
coding-agent-story dashboard           # build + open in your browser
coding-agent-story list                # plain-text list of every session
coding-agent-story session <id>        # render a single session as HTML
coding-agent-story pr --branch foo     # consolidate sessions on a branch into a PR
coding-agent-story share               # commit this branch's sessions for reviewers
coding-agent-story dashboard --serve   # local server with 30s auto-refresh
```

## Share sessions with reviewers

When you open a PR, reviewers usually only see the diff. With `coding-agent-story share`
you can commit the Claude sessions that produced the diff to the branch, so
anyone reviewing can replay the work locally:

```sh
# On the author's machine, with the feature branch checked out:
coding-agent-story share              # copies branch sessions → .coding-agent-story/sessions/<id>.jsonl
                           # writes .coding-agent-story/manifest.json
                           # stages + commits the files
git push
```

Then on the reviewer's machine, after pulling the branch:

```sh
coding-agent-story dashboard          # auto-discovers .coding-agent-story/sessions in the repo
                           # branch sessions show up with a "shared" badge
```

Useful flags:

- `--branch NAME` — share a branch other than the current HEAD
- `--no-commit` — copy + stage but let the user do the commit
- `--dry-run` — print what would happen, write nothing

> **Heads-up on privacy.** Claude transcripts can contain anything you pasted —
> file paths, command output, secrets, internal-only context. Open the staged
> JSONL files before pushing to a public repo.

## Commands

| Command                              | What it does                                         |
|--------------------------------------|------------------------------------------------------|
| `coding-agent-story list`                       | Print discovered sessions across all projects        |
| `coding-agent-story list --json`                | Same, machine-readable                               |
| `coding-agent-story session <id>`               | Render one session as HTML to stdout                 |
| `coding-agent-story session <id> --out PATH`    | Write HTML to `PATH`                                 |
| `coding-agent-story pr --branch <name>`         | Consolidate sessions on a branch into PR markdown    |
| `coding-agent-story pr --branch foo --repo .`   | Look in a specific repo for the branch's commits     |
| `coding-agent-story share`                      | Commit this branch's sessions to `.coding-agent-story/` for reviewers |
| `coding-agent-story share --no-commit`          | Stage the files but let the user commit              |
| `coding-agent-story share --dry-run`            | Print what would happen, write nothing               |
| `coding-agent-story dashboard`                  | Build the dashboard and open it in your browser      |
| `coding-agent-story dashboard --out PATH`       | Write the dashboard HTML to `PATH`, don't open       |
| `coding-agent-story dashboard --serve`          | Start a local server with auto-refresh               |
| `coding-agent-story dashboard --serve --port N` | Start the server on a specific port (auto-increments if busy) |
| `coding-agent-story dashboard --projects A,B`   | Restrict to specific project paths                   |
| `coding-agent-story --version` / `--help`       | Standard CLI flags (each subcommand has its own `--help`) |

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
- Cache lives at `~/.cache/coding-agent-story/` — delete it any time.

## Uninstall

```sh
npm uninstall -g coding-agent-story
rm -rf ~/.cache/coding-agent-story
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
