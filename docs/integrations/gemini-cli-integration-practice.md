# Gemini CLI Integration Practice

## Purpose

This note records the engineering process used to validate and harden Gemini CLI integration inside DevCue One.

The goal is to keep future debugging and extension work reproducible without relying on personal machine details.

## Privacy Rule

All commands, paths, session IDs, and logs in this document are sanitized.

- Use `<gemini-path>` instead of a real local binary path.
- Use `<project-root>` instead of a real absolute path.
- Use `<session-id>` instead of a real Gemini session identifier.
- Do not copy local usernames, home directories, or machine-specific MCP paths into product docs.

## What Was Verified Locally

The integration was re-verified against Gemini CLI `0.36.0`.

Observed supported flags:

- `--prompt`
- `--output-format json`
- `--model`
- `--yolo`
- `--approval-mode auto_edit`
- `--resume latest`
- `--resume <session-id>`
- `--list-sessions`

Representative sanitized probes:

```bash
<gemini-path> --help
<gemini-path> --version
<gemini-path> --list-sessions
<gemini-path> --output-format json --model gemini-2.5-flash-lite --yolo --prompt "<prompt>"
<gemini-path> --output-format json --model gemini-2.5-flash-lite --resume <session-id> --yolo --prompt "<prompt>"
<gemini-path> --output-format json --model gemini-2.5-flash-lite --approval-mode auto_edit --resume latest --prompt "<prompt>"
```

## Key Runtime Findings

### 1. Resume Semantics

Gemini CLI supports session resume in the current project scope.

- `--resume latest` resumes the most recent session for the current project.
- `--resume <session-id>` also works when the stored session ID is known.
- `--list-sessions` prints both human-friendly indices and the underlying UUID-like session IDs.

Product implication:

- The app persists Gemini runtime session IDs in `sessions.developer_tool_threads_json` under the `gemini_cli` key and reuses them on the next turn.

### 2. Output Shape

When Gemini runs with `--output-format json`, stdout is still an envelope rather than the final schema payload directly.

Representative sanitized envelope:

```json
{
  "session_id": "<session-id>",
  "response": "{\"spokenReply\":\"...\",\"uiReply\":\"...\",\"status\":\"done\",\"needTextContext\":false,\"nextActionHint\":\"...\"}",
  "stats": {
    "tools": {
      "totalCalls": 0
    }
  }
}
```

Observed runtime variants inside `response`:

- a JSON string that already matches the shared schema
- plain text with no JSON wrapper
- mixed prose plus a final standalone JSON object

Product implication:

- The parser must extract `session_id` as the reusable conversation identifier.
- The parser must prefer the final valid structured JSON object inside `response` when Gemini emits mixed prose plus JSON.
- When no structured JSON exists, the parser must still map plain text into the shared `done / need_input / failed` schema instead of crashing.

### 3. Stdout vs Stderr

Gemini writes the structured envelope to stdout, but environment and runtime messages may appear on stderr.

Examples of stderr-only noise:

- credential bootstrap logs
- MCP registration logs
- skill conflict logs
- YOLO mode notices

Product implication:

- Only stdout should be treated as the structured result source.
- stderr should still be preserved in raw logs for diagnostics.

### 4. Approval / Bypass Behavior

Gemini uses a different permission model from Codex and Claude Code.

- Full bypass mode maps to `--yolo`.
- Headless non-bypass mode should not depend on an interactive approval prompt.
- `--approval-mode auto_edit` is the safer non-interactive fallback when bypass is disabled.

Product implication:

- `bypassCodexSandbox === true` maps to `--yolo`.
- `bypassCodexSandbox === false` maps to `--approval-mode auto_edit`.

### 5. Executable Resolution And Model Selection

Desktop Electron processes can resolve a different `gemini` binary than an interactive shell.

Observed production risk:

- GUI `PATH` can hit an older Homebrew-installed Gemini binary even when the user shell resolves a newer `nvm`-managed binary.

Product implication:

- Global settings own the per-tool executable path.
- Project profiles only choose the tool override and do not store another path copy.
- The runtime should re-detect the preferred executable from the global Gemini path before each launch.
- The default Gemini model is `gemini-2.5-flash-lite`, with environment override available through `DEVCUE_GEMINI_MODEL`.

## Compatibility Gaps Found

Before the hardening pass, Gemini was not fully compatible with the product runtime.

Identified gaps:

1. Gemini prompt assembly could emit a dangling `--prompt` flag without the actual prompt value.
2. The desktop runtime could trust GUI `PATH` ordering and launch an outdated Gemini binary.
3. The shared parser assumed `response` was always pure JSON and could misclassify mixed prose plus trailing JSON as `failed`.
4. Diagnostics only exposed the legacy Codex runtime field, which hid Gemini's actual reusable session ID.

## Product Changes Applied

The integration was updated with the following decisions:

1. Keep Gemini CLI marked as resumable in the developer tool definition map.
2. Reuse the stored session ID through `--resume <session-id>` when available.
3. Always call Gemini in prompt mode with `--output-format json`.
4. Append the final prompt as `--prompt "<prompt>"` instead of emitting a bare `--prompt`.
5. Map bypass-on to `--yolo`.
6. Map bypass-off to `--approval-mode auto_edit`.
7. Default Gemini CLI runs to `gemini-2.5-flash-lite`.
8. Extend the shared structured parser to support Gemini `response` wrappers, mixed prose plus final JSON, and plain-text fallback.
9. Reuse the shared runtime executable resolver so the desktop app launches the preferred Gemini binary from the global tool-path setting instead of trusting GUI `PATH` ordering.
10. Show the Gemini runtime session ID in diagnostics through the per-tool thread map.
11. Add automated tests for Gemini resume capability, prompt assembly, backend-error surfacing, plain-text fallback, and mixed-output parsing.

## Sanitized Invocation Mapping

Current Gemini invocation strategy in the app:

```text
base:
  <gemini-path> --output-format json --model gemini-2.5-flash-lite

if hasStoredSessionId:
  add --resume <session-id>

if bypassEnabled:
  add --yolo
else:
  add --approval-mode auto_edit

final prompt:
  --prompt "<prompt>"
```

## Regression Checklist

Use this checklist when Gemini CLI changes version or the app runtime is refactored:

1. Run `gemini --help` and confirm `--prompt`, `--output-format`, `--model`, `--resume`, and approval flags still exist.
2. Run `gemini --version` and confirm the actual binary resolved by the desktop app matches the intended install.
3. Run a minimal structured prompt with `--output-format json` and confirm stdout is valid JSON.
4. Confirm the JSON envelope still carries a reusable session identifier.
5. Confirm the final assistant payload is still under `response`, or update the parser accordingly.
6. Confirm mixed prose plus trailing JSON is still normalized into the shared schema.
7. Verify `--resume <session-id>` preserves the same session across turns.
8. Verify bypass-on still works in headless mode.
9. Verify bypass-off does not block on interactive approval prompts.
10. Re-run the focused test file for developer tool parsing and capability flags.

## Local Validation Performed

Validation completed during the current hardening pass:

- local CLI probe: `gemini --help`
- local CLI probe: `gemini --version`
- local CLI probe: structured headless run with `--output-format json --model gemini-2.5-flash-lite --yolo`
- local CLI probe: structured resume run with `--output-format json --model gemini-2.5-flash-lite --resume <session-id> --yolo`
- focused test: `node --test test/developer-tools.test.mjs`
- lint: `npm run lint`
- build: `npm run build`

Known unrelated environment issue:

- `npm test` may still fail in environments where Node does not provide the `node:sqlite` built-in module required by `test/state-store.test.mjs`.

## Future Follow-Up

If Gemini CLI changes its JSON envelope again, prefer extending the shared parser rather than adding Gemini-only parsing code inside the task runner.

That keeps Codex, Claude Code, Cursor CLI, Gemini CLI, and Qwen Code on one structured-output path with backend-specific argument mapping and a shared runtime executable resolver.

## Related Qwen Note

Qwen Code is similar to Gemini in flag shape, but it is not output-compatible.

Verified differences from a local `qwen 0.12.6` probe:

- resume works via `--resume <session-id>`
- bypass works via `--yolo`
- non-bypass headless mode uses `--approval-mode auto-edit`
- `-o json` returns an event array instead of a single JSON object
- the final structured payload may appear under the last `result` event
- the final payload is often wrapped in a fenced ` ```json ` block

Product implication:

- the shared parser must support both Gemini object envelopes and Qwen event-array envelopes
- Gemini and Qwen now share the same prompt-placement helper and runtime executable resolver, even though their output envelopes differ
