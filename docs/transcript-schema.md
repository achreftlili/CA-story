# Claude Code Transcript Schema (as observed)

> Locked-in schema from real `~/.claude/projects/*/*.jsonl` files. Used by
> `src/parse.js` and `src/extract.js`. If parsing breaks, the first thing to
> re-check is this file against a fresh JSONL.

JSONL files live at:

```
~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
```

Each line is one independent JSON record. There are several record `type`s,
not all of them messages.

## Record types observed (across 5 sampled sessions)

| `type` value             | Source                              | Has `timestamp`? | Has `gitBranch`? |
|--------------------------|-------------------------------------|------------------|------------------|
| `user`                   | message from the user (or hook)     | yes              | yes              |
| `assistant`              | message from Claude                 | yes              | yes              |
| `system`                 | system event (e.g. turn duration)   | yes              | yes              |
| `attachment`             | tool listings, skill listings, etc. | yes              | yes              |
| `permission-mode`        | session-start metadata              | no               | no               |
| `file-history-snapshot`  | file backup state                   | yes              | no               |
| `last-prompt`            | session-end metadata                | varies           | no               |
| `ai-title`               | generated session title             | varies           | no               |
| `queue-operation`        | scheduler bookkeeping               | yes              | no               |

Note: some sessions begin with `queue-operation`, others with
`permission-mode`. The parser **must not** assume the first line is any
specific type.

## Message envelope (user / assistant)

```jsonc
{
  "parentUuid": "uuid-or-null",
  "isSidechain": false,
  "promptId": "uuid",
  "type": "user",            // or "assistant"
  "message": {
    "role": "user",          // or "assistant"
    "content": "string OR array of blocks"
  },
  "uuid": "uuid",
  "timestamp": "2026-05-10T11:58:37.325Z",
  "userType": "external",
  "entrypoint": "cli",
  "cwd": "/Users/.../my-project",
  "sessionId": "<sessionId>",
  "version": "2.1.138",
  "gitBranch": "main"        // CRITICAL — used to map sessions to branches
}
```

### `message.content`

Either a plain string, or an array of typed blocks:

- `{type: "text", text: "..."}`
- `{type: "tool_use", id, name, input}`            (assistant)
- `{type: "tool_result", tool_use_id, content}`    (user)

### Tool-use shapes (verbatim from real sessions)

`Edit`:
```jsonc
{"type":"tool_use","name":"Edit","input":{
  "file_path":"/abs/path.yml",
  "old_string":"...",
  "new_string":"...",
  "replace_all":false
}}
```

`Write`:
```jsonc
{"type":"tool_use","name":"Write","input":{
  "file_path":"/abs/path.sh",
  "content":"..."
}}
```

`Bash`:
```jsonc
{"type":"tool_use","name":"Bash","input":{
  "command":"uvx --version",
  "description":"Check uvx version"
}}
```

`Read`:
```jsonc
{"type":"tool_use","name":"Read","input":{
  "file_path":"/abs/path.js",
  "limit": 50,
  "offset": 0
}}
```

### Tool-result shape

Inside a `user`-type record:

```jsonc
{"type":"tool_result","tool_use_id":"toolu_...","content":"stdout or message","is_error":false}
```

Some sessions also carry a sibling `toolUseResult` object on the parent
record with `{stdout, stderr, interrupted, isImage}` — useful for outcome
detection without re-parsing `content`.

## System events

Most relevant:

```jsonc
{"type":"system","subtype":"turn_duration","durationMs":11901,"messageCount":9,...}
```

## Fields the parser must extract

- `type` (line discriminator)
- `sessionId`
- `timestamp` (some types lack this — fall back to the previous event's stamp)
- `cwd` (used to derive project identity)
- `gitBranch` (used for PR consolidation)
- `message.role` and `message.content`
- For each content block: `type` and the relevant fields above
- `uuid`, `parentUuid` (chain ordering)

## Tolerances (real-world)

- Last line of a live/killed session can be partial. Parser must skip it.
- `message.content` is sometimes a string, sometimes an array — handle both.
- `gitBranch` can be `"HEAD"` (detached) or missing entirely.
- `cwd` can be absent on non-message records.
- Records may include very large `input.content` (Write of a 50 KB file).
  Streaming line-by-line is mandatory.
