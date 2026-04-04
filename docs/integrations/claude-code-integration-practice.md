# Claude Code Integration Practice

## Purpose

This note records the engineering process used to validate and harden Claude Code integration inside DevCue One.

The goal is to keep future maintenance reproducible instead of relying on memory or machine-specific setup.

## Privacy Rule

All commands, paths, session IDs, and logs in this document are sanitized.

- Use `<claude-path>` instead of a real local binary path.
- Use `<project-root>` instead of a real workspace path.
- Use `<session-id>` instead of a real Claude session identifier.
- Do not copy local usernames, home-directory paths, or account details into product docs.

## What Was Verified Locally

The integration was re-verified against Claude Code `2.1.80`.

Observed supported flags:

- `-p` / `--print`
- `--output-format json`
- `--json-schema <schema>`
- `--add-dir <directories...>`
- `--resume <session-id>`
- `--dangerously-skip-permissions`
- `--permission-mode acceptEdits`

Representative sanitized probes:

```bash
<claude-path> --help
<claude-path> --version
<claude-path> -p --output-format json --json-schema '<schema-json>' --permission-mode acceptEdits --add-dir <project-root> -- "<prompt>"
<claude-path> -p --output-format json --json-schema '<schema-json>' --dangerously-skip-permissions --add-dir <project-root> -- "<prompt>"
<claude-path> -p --output-format json --json-schema '<schema-json>' --permission-mode acceptEdits --resume <session-id> --add-dir <project-root> -- "<prompt>"
```

## Key Runtime Findings

### 1. `--add-dir` Is Variadic And Can Swallow The Prompt

Claude declares `--add-dir <directories...>` as a variadic option.

If the app appends the prompt immediately after `--add-dir <project-root>`, Claude treats the prompt as another directory and exits with:

```text
Error: Input must be provided either through stdin or as a prompt argument when using --print
```

Product implication:

- The runtime must terminate option parsing with `--` before appending the prompt argument.

### 2. Output Shape

With `-p --output-format json --json-schema ...`, Claude returns a JSON envelope instead of the final schema payload directly.

Representative sanitized output:

```json
{
  "type": "result",
  "subtype": "success",
  "session_id": "<session-id>",
  "result": "已完成。",
  "structured_output": {
    "spokenReply": "...",
    "uiReply": "...",
    "status": "done",
    "needTextContext": false,
    "nextActionHint": ""
  }
}
```

Product implication:

- The shared parser must prefer top-level `structured_output`.
- Top-level `result` is display-oriented text and is not reliable as the structured schema payload.
- `session_id` is the reusable conversation identifier.

### 3. Resume Semantics

`--resume <session-id>` successfully continued the same session and returned the same `session_id` on the next turn.

Product implication:

- The app persists Claude runtime session IDs in `sessions.developer_tool_threads_json` under the `claude_code` key.

### 4. Non-Interactive Permission Mapping

The current headless mapping was re-verified:

- bypass on: `--dangerously-skip-permissions`
- bypass off: `--permission-mode acceptEdits`

Product implication:

- The existing desktop bypass toggle can remain shared across Codex and Claude Code.
- Headless Claude execution does not need an interactive permission prompt in the app flow.

## Compatibility Gaps Found

Before this validation pass, Claude Code was only partially wired:

1. The product already exposed Claude Code in the tool selector.
2. Session resume was already mapped to `--resume <session-id>`.
3. But prompt appending after `--add-dir` broke headless print mode.
4. And the shared parser preferred `result` instead of `structured_output`, which could drop the actual schema payload.

## Product Changes Applied

The integration was updated with the following decisions:

1. Add a shared `buildPrintModeSpawnArgs()` helper so Claude prompt placement is explicit and testable.
2. Insert `--` before the prompt for Claude Code print-mode runs.
3. Extend the shared parser to prefer `structured_output` when Claude returns it.
4. Add automated tests for Claude argument assembly and structured envelope parsing.
5. Document the verified invocation shape and resume behavior.
6. Reuse the shared runtime executable resolver so the desktop app launches the preferred Claude binary from the global tool-path setting instead of trusting GUI `PATH` ordering.

## Sanitized Invocation Mapping

Current Claude invocation strategy in the app:

```text
base:
  claude -p --output-format json --json-schema <schema-json> --add-dir <project-root>

if hasStoredSessionId:
  add --resume <session-id>

if bypassEnabled:
  add --dangerously-skip-permissions
else:
  add --permission-mode acceptEdits

before prompt:
  add --

final prompt:
  "<prompt>"
```

## Regression Checklist

Use this checklist when Claude Code changes version or the runtime is refactored:

1. Run `claude --help` and confirm `--print`, `--output-format`, `--json-schema`, `--add-dir`, `--resume`, and the permission flags still exist.
2. Run a minimal structured prompt in headless mode and confirm stdout is valid JSON.
3. Confirm the JSON envelope still contains a reusable `session_id`.
4. Confirm the actual schema payload is still exposed under `structured_output` or update the parser accordingly.
5. Confirm `--resume <session-id>` preserves the same session across turns.
6. Confirm the prompt still needs `--` after variadic options.
7. Re-run the focused developer-tool test file.

## Local Validation Performed

Validation completed during this pass:

- local CLI probe: `claude --help`
- local CLI probe: `claude --version`
- local CLI probe: structured headless run with `--permission-mode acceptEdits`
- local CLI probe: structured resume run with `--permission-mode acceptEdits --resume <session-id>`
- local CLI probe: failure reproduction without `--` after `--add-dir`
- focused test: `node --test test/developer-tools.test.mjs`

## Follow-Up

If Claude Code changes its JSON envelope again, extend the shared parser instead of adding Claude-specific parsing inside the Electron task runner.

That keeps Codex, Claude Code, Cursor CLI, Gemini CLI, and Qwen Code on one structured-output path with backend-specific flag mapping only.
