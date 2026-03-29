# Cursor CLI Integration Practice

## Purpose

This note records the engineering process used to validate and harden Cursor CLI integration inside DevCue One.

The goal is to keep future maintenance reproducible instead of relying on memory or machine-specific setup.

## Privacy Rule

All commands, paths, session IDs, and account details in this document are sanitized.

- Use `<cursor-agent-path>` instead of a real local binary path.
- Use `<project-root>` instead of a real workspace path.
- Use `<session-id>` instead of a real Cursor chat identifier.
- Do not copy local usernames, emails, or home-directory paths into product docs.

## What Was Verified Locally

The integration was re-verified against Cursor Agent `2026.03.20-44cb435`.

Observed supported flags:

- `--print`
- `--output-format json`
- `--resume <session-id>`
- `--trust`
- `--force`
- `--sandbox enabled`

Representative sanitized probes:

```bash
<cursor-agent-path> --help
<cursor-agent-path> status
<cursor-agent-path> --print --output-format json --trust "<prompt>"
<cursor-agent-path> --print --output-format json --trust --force "<prompt>"
<cursor-agent-path> --print --output-format json --trust --force --resume <session-id> "<prompt>"
<cursor-agent-path> --print --output-format json --trust --sandbox enabled "<prompt>"
```

## Key Runtime Findings

### 1. Workspace Trust Is Mandatory In Headless Mode

Running Cursor Agent in headless print mode without trust failed immediately with a workspace-trust prompt instead of structured JSON.

Representative sanitized failure:

```text
Workspace Trust Required

Cursor Agent can execute code and access files in this directory.
To proceed, pass --trust, --yolo, or -f if you trust this directory.
```

Product implication:

- The desktop runtime must always pass `--trust` for Cursor CLI turns.
- Relying on a first interactive run is not acceptable for the app's background execution path.

### 2. Output Shape

With `--print --output-format json`, Cursor Agent returned a single JSON object envelope instead of the final schema payload directly.

Representative sanitized output:

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "result": "\n{\"spokenReply\":\"...\",\"uiReply\":\"...\",\"status\":\"done\",\"needTextContext\":false,\"nextActionHint\":\"...\"}",
  "session_id": "<session-id>"
}
```

Product implication:

- The shared parser must treat top-level `result` as the actual assistant payload.
- `session_id` is the reusable conversation identifier.

### 3. Resume Semantics

`--resume <session-id>` successfully continued the same chat session and returned the same `session_id` on the next turn.

Product implication:

- The app can keep reusing the existing shared `codexThreadId` field for Cursor session persistence.

### 4. Bypass Toggle Mapping

Cursor uses a different runtime surface from Codex, but the existing bypass toggle still maps cleanly:

- bypass on: `--force`
- bypass off: `--sandbox enabled`

`--trust` is orthogonal and should be present in both cases.

Product implication:

- Trust is required for startup.
- Sandbox choice is controlled separately by the existing toggle.

## Compatibility Gap Found

Before this validation pass, Cursor CLI was only partially wired:

1. The app already used `--print --output-format json`.
2. Session reuse already mapped to `--resume <session-id>`.
3. Structured output parsing already worked for the top-level `result` envelope.
4. But non-bypass mode did not pass `--trust`, so headless Cursor execution failed before the model could respond.

## Product Changes Applied

The integration was updated with the following decisions:

1. Add a shared `buildCursorCliArgs()` helper so Cursor flag mapping is explicit and testable.
2. Always pass `--trust` for Cursor CLI turns.
3. Keep bypass-on mapped to `--force`.
4. Map bypass-off to `--sandbox enabled`.
5. Keep `--resume <session-id>` when a stored session exists.
6. Update the settings runtime note so the actual behavior is visible in the UI.
7. Add automated tests for Cursor argument mapping and real output-envelope parsing.

## Sanitized Invocation Mapping

Current Cursor invocation strategy in the app:

```text
base:
  cursor-agent --print --output-format json --trust

if hasStoredSessionId:
  add --resume <session-id>

if bypassEnabled:
  add --force
else:
  add --sandbox enabled
```

## Regression Checklist

Use this checklist when Cursor Agent changes version or the runtime is refactored:

1. Run `cursor-agent --help` and confirm `--print`, `--output-format`, `--resume`, `--trust`, `--force`, and `--sandbox` still exist.
2. Run a minimal structured prompt in headless mode and confirm stdout is valid JSON.
3. Confirm the response still contains a reusable `session_id`.
4. Confirm the final assistant payload is still inside top-level `result`.
5. Confirm `--resume <session-id>` preserves the same session across turns.
6. Confirm non-bypass mode no longer fails on workspace trust.
7. Re-run the focused developer-tool test file.

## Local Validation Performed

Validation completed during this pass:

- local CLI probe: `cursor-agent --help`
- local CLI probe: `cursor-agent status`
- local CLI probe: structured headless run with `--trust`
- local CLI probe: structured headless run with `--trust --force`
- local CLI probe: structured resume run with `--trust --force --resume <session-id>`
- local CLI probe: structured non-bypass run with `--trust --sandbox enabled`
- focused test: `node --test test/developer-tools.test.mjs`

## Follow-Up

If Cursor CLI changes its JSON envelope, extend the shared parser instead of adding Cursor-specific parsing inside the Electron task runner.

That keeps Codex, Claude Code, Cursor CLI, Gemini CLI, and Qwen Code on the same structured-output path with backend-specific flag mapping only.
