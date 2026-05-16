# Coding Agent Story

Turn Claude Code transcripts into PR stories — locally and offline.

<!-- castory:config
display_name: castory
description: Local-only CLI that renders Claude Code sessions, PRs, and a dashboard
base_branch: master
important_files:
  - src/extract.js
  - src/render/**
  - src/pr-build.js
  - src/git-align.js
tags:
  - tooling
  - review
  - internal
-->

## castory hints

- State intent before edits using "I'll <X> because <Y>".
- When proposing alternatives, write "Options: 1) … 2) …" so forks are detectable.
- After a user correction, restate the new direction before continuing.
