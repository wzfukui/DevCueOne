# Gemini CLI Integration Practice

## Purpose

This note records the engineering process used to integrate Gemini CLI into DevCue One as a structured external developer tool runner.

The goal is to make future debugging and extension work reproducible without relying on personal machine details.

## Privacy Rule

All commands, paths, session IDs, and logs in this document are sanitized.

- Use `<project-root>` instead of a real absolute path.
- Use `<session-id>` instead of a real Gemini session identifier.
- Do not copy local usernames, home directories, or machine-specific MCP paths into product docs.

## What Was Verified Locally

The integration was verified against Gemini CLI `0.34.0`.

Observed supported flags:

- `--prompt`
- `--output-format json`
- `--yolo`
- `--approval-mode auto_edit`
- `--resume latest`
- `--resume <session-id>`
- `--list-sessions`

Representative sanitized probes:

```bash
gemini --help
gemini --list-sessions
gemini --prompt "<prompt>" --output-format json --yolo
gemini --prompt "<prompt>" --output-format json --resume <session-id>
gemini --prompt "<prompt>" --output-format json --approval-mode auto_edit --resume latest
```

## Key Runtime Findings

### 1. Resume Semantics

Gemini CLI supports session resume in the current project scope.

- `--resume latest` resumes the most recent session for the current project.
- `--resume <session-id>` also works when the stored session ID is known.
- `--list-sessions` prints both human-friendly indices and the underlying UUID-like session IDs.

Product implication:

- The app can safely persist Gemini session IDs in the existing shared `codexThreadId` field and reuse them on the next turn.

### 2. Output Shape

When Gemini runs with `--output-format json`, stdout is not the final schema payload directly.

Gemini wraps the assistant result in a JSON envelope similar to:

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

Product implication:

- The parser must extract `session_id` as the reusable conversation identifier.
- The parser must parse `response` again because it contains the final structured payload as a JSON string.

### 3. Stdout vs Stderr

Gemini writes structured result JSON to stdout, but environment and runtime messages may appear on stderr.

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

## Compatibility Gaps Found

Before the fix, Gemini was not fully compatible with the product runtime.

Identified gaps:

1. Gemini was marked as non-resumable in the runtime capability matrix.
2. Gemini calls were not forced into `--output-format json`.
3. The shared structured parser did not understand the `{ session_id, response, stats }` envelope.
4. Headless non-bypass mode did not explicitly select a non-interactive approval strategy.

## Product Changes Applied

The integration was updated with the following decisions:

1. Mark Gemini CLI as resumable in the developer tool definition map.
2. Reuse the stored session ID through `--resume <session-id>` when available.
3. Always call Gemini in prompt mode with `--output-format json`.
4. Map bypass-on to `--yolo`.
5. Map bypass-off to `--approval-mode auto_edit`.
6. Extend the shared structured parser to support Gemini `response` wrappers.
7. Update the UI runtime note so the current behavior is visible in settings.
8. Add automated tests for Gemini resume capability and wrapped JSON parsing.

## Sanitized Invocation Mapping

Current Gemini invocation strategy in the app:

```text
if hasStoredSessionId:
  gemini --prompt "<prompt>" --output-format json --resume <session-id> ...
else:
  gemini --prompt "<prompt>" --output-format json ...

if bypassEnabled:
  add --yolo
else:
  add --approval-mode auto_edit
```

## Regression Checklist

Use this checklist when Gemini CLI changes version or the app runtime is refactored:

1. Run `gemini --help` and confirm `--prompt`, `--output-format`, `--resume`, and approval flags still exist.
2. Run a minimal structured prompt with `--output-format json` and confirm stdout is valid JSON.
3. Confirm the JSON envelope still carries a reusable session identifier.
4. Confirm the final assistant payload is still under `response` or update the parser accordingly.
5. Verify `--resume <session-id>` preserves the same session across turns.
6. Verify bypass-on still works in headless mode.
7. Verify bypass-off does not block on interactive approval prompts.
8. Re-run the focused test file for developer tool parsing and capability flags.

## Local Validation Performed

Validation completed during the integration pass:

- focused test: `node --test test/developer-tools.test.mjs`
- lint: `npm run lint`
- build: `npm run build`

Known unrelated environment issue:

- `npm test` may still fail in environments where Node does not provide the `node:sqlite` built-in module required by `test/state-store.test.mjs`.

## Future Follow-Up

If Gemini CLI changes its JSON envelope again, prefer extending the shared parser rather than adding Gemini-only parsing code inside the task runner.

That keeps Codex, Claude Code, Cursor CLI, and Gemini CLI on one structured-output path with tool-specific argument mapping only.

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
- fenced JSON should be stripped before the final schema parse
