export const BASE_CSS = `
  :root {
    --bg: #0f1115;
    --panel: #161922;
    --panel-2: #1c212c;
    --border: #262b38;
    --fg: #e6e9ef;
    --muted: #8b93a7;
    --accent: #6aa9ff;
    --accent-soft: #1b2942;
    --green: #69d58e;
    --yellow: #ffd166;
    --red: #ff6b6b;
    --shadow: 0 1px 0 rgba(255,255,255,0.02), 0 4px 20px rgba(0,0,0,0.4);
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: var(--bg); color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px; line-height: 1.55;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  header.castory-header {
    padding: 18px 24px; border-bottom: 1px solid var(--border);
    display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: baseline;
    background: var(--panel); position: sticky; top: 0; z-index: 5;
  }
  header.castory-header h1 { margin: 0; font-size: 18px; letter-spacing: 0.2px; }
  header.castory-header .stats { color: var(--muted); font-size: 12px; }
  main { max-width: 1180px; margin: 0 auto; padding: 18px 24px 80px; }
  .toolbar {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    padding: 10px 12px; margin-bottom: 16px;
    box-shadow: var(--shadow);
  }
  .toolbar input[type="search"], .toolbar select, .toolbar button {
    background: var(--panel-2); color: var(--fg); border: 1px solid var(--border);
    border-radius: 6px; padding: 6px 10px; font: inherit;
  }
  .toolbar input[type="search"] { min-width: 240px; }
  .toolbar label { color: var(--muted); font-size: 12px; }
  .toolbar .spacer { flex: 1; }
  .toolbar .pill {
    background: var(--accent-soft); color: var(--accent);
    border: 1px solid transparent; border-radius: 999px; padding: 2px 8px; font-size: 11px;
  }
  .session-list { list-style: none; padding: 0; margin: 0; }
  .session-row {
    background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    margin-bottom: 8px; overflow: hidden; box-shadow: var(--shadow);
  }
  .session-row[open] { border-color: var(--accent); }
  .session-row summary {
    list-style: none; cursor: pointer; padding: 12px 16px;
    display: grid;
    grid-template-columns: 96px 180px 130px 56px 56px 64px 1fr 130px;
    gap: 12px; align-items: center;
  }
  .session-row summary:hover { background: rgba(106,169,255,0.04); }
  .badges-cell { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .badge-fail { background: rgba(255,107,107,0.10); color: var(--red); border: 1px solid rgba(255,107,107,0.30); }
  .badge-side { background: rgba(170,132,255,0.10); color: #c8a8ff; border: 1px solid rgba(170,132,255,0.30); }
  .badge-plan { background: rgba(255,209,102,0.10); color: var(--yellow); border: 1px solid rgba(255,209,102,0.30); }
  .badge-shared { background: rgba(122,217,255,0.10); color: #7ad9ff; border: 1px solid rgba(122,217,255,0.30); }
  .model-badge {
    display: inline-block; padding: 0 6px; border-radius: 4px;
    background: rgba(106,169,255,0.10); color: var(--accent);
    border: 1px solid rgba(106,169,255,0.25);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
  }
  .session-row .tokens {
    font-variant-numeric: tabular-nums; font-size: 12px; color: var(--muted);
    text-align: right;
  }
  .tag-row { display: inline-flex; gap: 4px; margin-top: 2px; flex-wrap: wrap; }
  .tag-chip {
    display: inline-block; padding: 0 6px; border-radius: 999px;
    background: rgba(122,217,255,0.10); color: var(--user-cyan, #7ad9ff);
    border: 1px solid rgba(122,217,255,0.25);
    font-size: 10px; letter-spacing: 0.3px;
  }
  .tools-row, .chip-row { display: inline-flex; gap: 4px; margin-top: 2px; flex-wrap: wrap; }
  .tool-chip, .skill-chip, .agent-chip {
    display: inline-block; padding: 0 6px; border-radius: 4px;
    background: var(--panel-2); border: 1px solid var(--border);
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
  }
  .tool-chip b { color: var(--green); font-weight: 600; margin-left: 2px; }
  .skill-chip { color: #ffe5a0; border-color: rgba(255,209,102,0.30); background: rgba(255,209,102,0.06); }
  .skill-chip::before { content: "⚡ "; color: var(--yellow); }
  .skill-chip b { color: var(--yellow); font-weight: 600; margin-left: 2px; }
  .agent-chip { color: #c8a8ff; border-color: rgba(170, 132, 255, 0.30); background: rgba(170, 132, 255, 0.06); }
  .agent-chip::before { content: "🤖 "; }
  .agent-chip b { color: #c8a8ff; font-weight: 600; margin-left: 2px; }
  .mcp-chip {
    color: #ffb4ec; border-color: rgba(255,180,236,0.30); background: rgba(255,180,236,0.06);
    display: inline-block; padding: 0 6px; border-radius: 4px; border: 1px solid;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px;
  }
  .mcp-chip::before { content: "🔌 "; }
  .mcp-chip b { color: #ffb4ec; font-weight: 600; margin-left: 2px; }
  .bash-chip {
    color: var(--green); border-color: rgba(105,213,142,0.30); background: rgba(105,213,142,0.04);
    display: inline-block; padding: 0 6px; border-radius: 4px; border: 1px solid;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px;
  }
  .bash-chip::before { content: "$ "; opacity: 0.6; }
  .bash-chip b { color: var(--green); font-weight: 600; margin-left: 2px; }
  .slash-chip {
    color: var(--accent); border-color: rgba(106,169,255,0.30); background: rgba(106,169,255,0.06);
    display: inline-block; padding: 0 6px; border-radius: 4px; border: 1px solid;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px;
  }
  .slash-chip::before { content: "/"; opacity: 0.7; }
  .slash-chip b { color: var(--accent); font-weight: 600; margin-left: 2px; }
  .tool-chip.more, .skill-chip.more, .agent-chip.more,
  .mcp-chip.more, .bash-chip.more, .slash-chip.more { font-style: italic; color: var(--muted); }
  .session-row .summary { display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
  .session-row .summary .row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; }
  .session-row .row-meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .session-row .summary .row-intervention {
    font-size: 11px; color: #ffd166; opacity: 0.85;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    border-left: 2px solid var(--yellow); padding-left: 6px;
  }
  .session-row .spark { width: 80px; height: 18px; display: block; }
  .session-row .spark rect { fill: var(--accent); opacity: 0.7; }
  .session-row summary::-webkit-details-marker { display: none; }
  .session-row .when { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
  .session-row .branch { color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-row .duration { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--muted); }
  .session-row .files { font-size: 12px; color: var(--muted); }
  .session-row .summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-row .project { font-weight: 600; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 11px; }
  .badge-int { background: rgba(255,107,107,0.12); color: var(--red); border: 1px solid rgba(255,107,107,0.3); }
  .badge-ok { background: rgba(105,213,142,0.10); color: var(--green); border: 1px solid rgba(105,213,142,0.25); }
  .session-detail {
    padding: 14px 18px 18px; border-top: 1px solid var(--border); background: var(--panel-2);
  }
  .tldr-panel {
    background: var(--panel); border: 1px solid var(--accent);
    border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;
    box-shadow: 0 2px 8px rgba(106,169,255,0.10);
  }
  .tldr-header {
    display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .tldr-header h4 { margin: 0; font-size: 13px; color: var(--accent); letter-spacing: 0.4px; }
  .tldr-stats { color: var(--muted); font-size: 11px; }
  .tldr-label {
    display: inline-block; font-size: 10px; padding: 1px 7px;
    margin-right: 8px; border-radius: 999px; vertical-align: 1px;
    background: var(--panel-2); color: var(--muted); border: 1px solid var(--border);
    text-transform: uppercase; letter-spacing: 0.4px;
  }
  .tldr-ask, .tldr-summary { font-size: 13px; margin: 4px 0; line-height: 1.55; }
  .tldr-ask .tldr-label { color: var(--user-cyan, #7ad9ff); border-color: rgba(122,217,255,0.30); }
  .tldr-summary .tldr-label { color: var(--accent); border-color: rgba(106,169,255,0.30); }
  .tldr-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .tldr-hint { font-size: 10px; margin-top: 6px; color: var(--muted); opacity: 0.7; }
  .tldr-chips [data-jump-tool], .tldr-chips [data-jump-mcp],
  .tldr-chips [data-jump-bashcat], .tldr-chips [data-jump-skill],
  .tldr-chips [data-jump-agent] { cursor: pointer; user-select: none; }
  .tldr-chips [data-jump-tool]:hover, .tldr-chips [data-jump-mcp]:hover,
  .tldr-chips [data-jump-bashcat]:hover, .tldr-chips [data-jump-skill]:hover,
  .tldr-chips [data-jump-agent]:hover { filter: brightness(1.3); }
  @keyframes jumpFlash {
    0% { background-color: rgba(106,169,255,0.35); }
    100% { background-color: transparent; }
  }
  .jump-flash {
    animation: jumpFlash 1.5s ease-out;
    border-radius: 6px;
  }
  html { scroll-behavior: smooth; }
  .chapter {
    margin-bottom: 18px;
  }
  .chapter h3 {
    margin: 14px 0 8px; font-size: 14px; color: var(--accent);
  }
  .chapter .meta { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
  .chapter ul { list-style: none; padding: 0; margin: 0; }
  .chapter li {
    background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
    padding: 8px 10px; margin: 6px 0; font-size: 13px; word-wrap: break-word;
  }
  .chapter li.action { border-left: 3px solid var(--green); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .chapter li.outcome { border-left: 3px solid var(--muted); color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .chapter li.outcome.error { border-left-color: var(--red); color: var(--red); }
  --user-cyan: #7ad9ff;
  --user-soft: rgba(122, 217, 255, 0.10);
  --user-border: rgba(122, 217, 255, 0.30);
  .decision-group {
    margin: 12px 0;
    padding: 4px 0 4px 12px;
    border-left: 3px solid var(--accent);
  }
  .decision-group.by-claude { border-left-color: var(--accent); }
  .decision-group.by-user   { border-left-color: var(--user-cyan); }
  .decision-group.silent    { border-left-color: var(--muted); border-left-style: dashed; }
  .decision-text {
    font-size: 13px; color: var(--fg); margin-bottom: 6px;
    border-radius: 6px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    background: var(--panel);
  }
  .decision-text.by-claude {
    background: rgba(106, 169, 255, 0.06);
    border-color: rgba(106, 169, 255, 0.20);
  }
  .decision-text.by-user {
    background: var(--user-soft);
    border-color: var(--user-border);
    color: #e6f5ff;
  }
  .decision-text.silent {
    background: transparent; border-style: dashed; color: var(--muted); font-style: italic;
  }
  .decision-by {
    display: inline-block;
    font-size: 10px; letter-spacing: 0.6px; text-transform: uppercase;
    margin-right: 8px; padding: 1px 7px; border-radius: 999px;
    background: var(--panel-2); border: 1px solid var(--border); color: var(--muted);
    font-style: normal; vertical-align: 2px;
  }
  .decision-text.by-claude .decision-by { color: var(--accent); border-color: rgba(106,169,255,0.4); }
  .decision-text.by-user   .decision-by { color: var(--user-cyan); border-color: var(--user-border); }
  .decision-text.silent    .decision-by { color: var(--yellow); border-color: rgba(255,209,102,0.35); }
  .actions-under { margin-left: 4px; }
  .tool-name {
    display: inline-block; font-size: 11px; padding: 1px 7px; margin-right: 6px;
    border-radius: 4px; background: rgba(105,213,142,0.10); color: var(--green);
    border: 1px solid rgba(105,213,142,0.25);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.3px;
  }
  .tool-cmd {
    color: var(--fg); background: var(--panel-2);
    padding: 1px 5px; border-radius: 3px; font-size: 11px;
    word-break: break-all;
  }
  .turn-tok {
    display: inline-block; padding: 1px 7px; border-radius: 999px;
    background: rgba(122, 217, 255, 0.10); color: var(--user-cyan, #7ad9ff);
    border: 1px solid rgba(122, 217, 255, 0.30);
    font-size: 10px; letter-spacing: 0.3px; margin-left: 6px;
    font-variant-numeric: tabular-nums; vertical-align: 1px;
    cursor: help;
  }
  .file-link {
    color: var(--accent); text-decoration: none;
    border-bottom: 1px dashed rgba(106,169,255,0.4);
    word-break: break-all;
  }
  .file-link:hover { border-bottom-style: solid; }
  .file-link.gh::after {
    content: " ↗";
    font-size: 10px; color: var(--muted);
  }
  .file-link-alt {
    color: var(--muted); text-decoration: none;
    margin-left: 4px; font-size: 11px;
  }
  .file-link-alt:hover { color: var(--accent); }
  .action-outcome {
    margin-top: 6px; padding: 4px 8px;
    background: rgba(105,213,142,0.06); border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px; color: var(--muted);
    white-space: pre-wrap; word-break: break-word;
    border-left: 2px solid var(--green);
  }
  .action-outcome.error {
    background: rgba(255,107,107,0.06); color: var(--red); border-left-color: var(--red);
  }
  .intervention {
    background: rgba(255, 209, 102, 0.06);
    border: 1px solid rgba(255, 209, 102, 0.3);
    color: #ffe5a0;
    border-left: 3px solid var(--yellow);
    padding: 10px 12px; margin: 10px 0; border-radius: 6px;
  }
  .intervention.simple::before { content: "📌 your call — "; color: var(--yellow); font-weight: 600; }
  .intervention.qa { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; }
  .intervention.qa .qa-label { color: var(--yellow); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding-top: 2px; }
  .intervention.qa .qa-claude { color: var(--muted); }
  .intervention.qa .qa-user { color: #ffe5a0; }
  .branch-pill {
    display: inline-block; padding: 2px 10px; border-radius: 999px;
    background: rgba(106,169,255,0.10); color: var(--accent);
    border: 1px solid rgba(106,169,255,0.30);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; letter-spacing: 0.2px; white-space: nowrap;
  }
  .session-branch {
    margin: 0 0 10px; display: flex; gap: 8px; align-items: center;
  }
  .session-branch .meta { font-size: 11px; }
  .file-summary {
    background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px;
    padding: 10px 12px; margin-bottom: 14px;
  }
  .file-summary h4 { margin: 0 0 6px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; }
  .file-summary table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .file-summary th, .file-summary td { padding: 3px 6px; text-align: left; }
  .file-summary th { color: var(--muted); font-weight: normal; }
  .file-summary td.count { text-align: right; font-variant-numeric: tabular-nums; color: var(--green); width: 60px; }
  .file-summary td.path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--fg); }
  .file-summary tr.hot td { background: rgba(255, 209, 102, 0.08); }
  .hot-tag { color: var(--yellow); margin-right: 4px; }
  .diff {
    margin: 6px 0 2px; border-radius: 4px; overflow: hidden;
    border: 1px solid var(--border);
  }
  .diff summary {
    background: var(--panel-2); padding: 4px 8px; cursor: pointer;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
    color: var(--muted);
  }
  .diff summary::-webkit-details-marker { display: none; }
  .diff[open] summary::before { content: "▾ "; }
  .diff:not([open]) summary::before { content: "▸ "; }
  .diff pre {
    margin: 0; padding: 6px 8px;
    background: #0c0f14;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px; line-height: 1.45;
    overflow-x: auto;
    white-space: pre;
  }
  .diff .ln { display: block; padding: 0 4px; }
  .diff .ln.add { background: rgba(105,213,142,0.10); color: var(--green); }
  .diff .ln.del { background: rgba(255,107,107,0.10); color: var(--red); }
  .diff .ln.ctx { color: var(--muted); }
  .diff .ln-gutter { display: inline-block; width: 16px; color: var(--muted); user-select: none; }
  .session-toc {
    display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0 16px; font-size: 12px;
  }
  .session-toc a {
    background: var(--panel-2); border: 1px solid var(--border); border-radius: 999px;
    padding: 2px 10px; color: var(--accent);
  }
  .empty {
    text-align: center; padding: 60px 20px; color: var(--muted);
  }
  .help-foot {
    color: var(--muted); font-size: 12px; padding: 24px 0;
    border-top: 1px solid var(--border); margin-top: 32px;
  }
  kbd {
    background: var(--panel-2); border: 1px solid var(--border); border-radius: 4px;
    padding: 1px 5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
  }
  details > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .selected > summary { background: var(--accent-soft); }
`;
