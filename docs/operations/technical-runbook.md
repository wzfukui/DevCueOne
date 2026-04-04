# DevCue One Technical Runbook

## 1. Purpose

This document is for:

- day-to-day troubleshooting
- issue tracking and diagnosis
- project handoff and onboarding

It focuses on the current product shape instead of historical plans.

## 2. Current Product Baseline

The current desktop app is centered around:

- multi-session voice-driven development
- per-session project binding
- selectable developer-tool execution with runtime detection
- project-level tool overrides that still inherit executable-path ownership from global settings
- background task execution with recovery
- local acknowledgement assets plus browser/cloud playback fallback
- startup skeleton gating before onboarding is shown
- session-card skeletons in the left pane while bootstrap data is still loading
- theme presets with preview/save semantics, including `Ink Peony`
- collapsible right-side inspectors for project, turn input, STT, TTS, settings, and diagnostics
- a lightweight left-column session filter: `All / Current Project`

Important behavior:

- only the active session accepts microphone input
- only the active workspace speaks task results aloud
- switching session or rebinding project interrupts in-flight playback
- acknowledgement cues prefer local assets under `tmp/audio/ack-pack/{zh,en}`

## 3. Runtime Architecture

### 3.1 Renderer

Primary files:

- `src/App.tsx`
- `src/useVoiceLoop.ts`
- `src/useVadVoiceLoop.ts`

Responsibilities:

- session list, current-project filter, workspace panel, and right-side inspectors
- onboarding gating and theme-preset preview/save behavior
- microphone capture and speech segmentation
- browser playback, acknowledgement playback, and result playback coordination
- client-side diagnostics event reporting through `event:log-client`

### 3.2 Electron Main Process

Primary file:

- `electron/main.mjs`

Responsibilities:

- window lifecycle and Electron permission handling
- IPC surface for state, sessions, profiles, voice turns, text turns, playback, and config tests
- task queue, cancellation, orphan-task recovery, and local routing
- developer-tool adapter dispatch, per-tool runtime session tracking, and executable detection
- STT runtime calls
- cloud TTS synthesis for supported providers
- acknowledgement asset resolution from the local pack

### 3.3 Persistent State

Primary file:

- `electron/state-store.mjs`

Storage backend:

- SQLite via `app-state.sqlite`

Primary tables:

- `settings`
- `project_profiles`
- `sessions`
- `messages`
- `tasks`
- `event_logs`

### 3.4 Renderer/Main Bridge

Primary file:

- `electron/preload.cjs`

This exposes the Electron API surface used by the React app without giving the renderer raw Node access.

### 3.5 Developer Tool Adapter Layer

Primary file:

- `electron/developer-tools.mjs`

Responsibilities:

- declare supported developer tools and labels
- provide default executable names
- probe local command/path availability and prefer the best available executable for the selected tool
- normalize backend envelopes, mixed text plus trailing JSON, and plain-text fallbacks into the shared schema
- normalize legacy Codex-only settings into the current generic model

## 4. Key Runtime Paths

Derived in `electron/main.mjs`:

- app-state database: `${app.getPath('userData')}/app-state.sqlite`
- legacy settings snapshot: `${app.getPath('userData')}/settings.json`
- debug audio directory: `${app.getPath('userData')}/debug-audio`
- acknowledgement asset directory: `VOICE_AGENT_ACK_PACK_DIR` or `tmp/audio/ack-pack`

Useful note:

- acknowledgement asset selection reads directly from `tmp/audio/ack-pack/zh` or `tmp/audio/ack-pack/en`
- result playback is not read from the asset pack; it is synthesized or spoken live

## 5. Core Flows

### 5.1 Voice Turn

1. Renderer records an utterance through `useVoiceLoop`.
2. Renderer sends `agent:submit-voice-turn`.
3. Main process transcribes audio with the selected STT config.
4. Main process decides whether the transcript should be ignored, locally routed, or submitted to the selected developer tool.
5. Accepted turns create/update task records and message history.
6. Renderer plays acknowledgement cue after transcription if the turn is accepted.

Relevant events:

- `transcribe_done`
- `voice_short_ignored`
- `voice_intent_ready`
- `user_input`
- `task_queued`
- `task_started`
- `task_result`

### 5.2 Text Turn

1. Renderer sends `agent:submit-text-turn`.
2. Main process enqueues the task with the active session and working directory.
3. Result is stored in messages, tasks, and event logs.

### 5.3 Acknowledgement Playback

Priority:

1. Local asset pack under `tmp/audio/ack-pack/{zh,en}`
2. Browser/system speech fallback

Current helper scripts:

- `scripts/audio/generate-ack-pack.sh`
- `scripts/audio/generate-ack-pack-from-db.sh`

### 5.4 Result Playback

Priority:

1. Browser/system TTS
2. First usable cloud TTS config fallback

Important:

- result playback is intentionally skipped for inactive workspaces
- dedup logic prevents the same task result from being spoken twice

## 6. IPC Surface

Important IPC handlers from `electron/main.mjs`:

- `app:get-state`
- `app:get-session-detail`
- `settings:save`
- `session:create`
- `session:rename`
- `session:activate`
- `profile:save`
- `profile:bind`
- `profile:remove`
- `path:inspect-working-directory`
- `clipboard:write-text`
- `event:log-client`
- `agent:submit-text-turn`
- `agent:submit-voice-turn`
- `agent:cancel-session-task`
- `audio:speak`
- `speech:test-stt-config`
- `speech:test-tts-config`
- `tool:detect-developer-tool`
- `audio:get-ack-cue`

## 7. Diagnostics Workflow

### 7.1 First Checks In The UI

When a bug report comes in, verify these first:

- which session is active
- whether the session is bound to the expected project profile
- whether the left filter is on `All` or `Current Project`
- whether STT/TTS config tests pass in the right-side inspector
- which developer tool / execution mode is selected in global settings
- whether the configured executable path matches the resolved runtime path shown in settings
- whether diagnostics show a session ID, the active backend's runtime session ID, an active task, or recent events

### 7.2 Event Log Interpretation

Useful event kinds:

- `task_queued`: task entered queue
- `task_started`: worker started execution
- `task_result`: backend produced a final result
- `task_recovered`: queued/running task was recovered and cancelled after restart
- `transcribe_done`: STT finished
- `voice_short_ignored`: transcript was intentionally ignored
- `voice_intent_ready`: transcript passed acceptance and is ready for submission
- `local_router`: command was handled locally before reaching the selected developer tool
- `ack_playback`: acknowledgement playback attempt
- `result_playback`: result playback attempt
- `result_playback_skipped`: playback intentionally skipped or interrupted

### 7.3 SQLite Queries

Use placeholder paths instead of assuming a fixed OS path:

```bash
DB="/path/to/app-state.sqlite"
```

Recent sessions:

```bash
sqlite3 "$DB" "
SELECT id, title, bound_profile_id, last_activity_at
FROM sessions
ORDER BY last_activity_at DESC
LIMIT 20;
"
```

Recent tasks for one session:

```bash
sqlite3 "$DB" "
SELECT id, status, provider, summary, error_message, created_at
FROM tasks
WHERE session_id = 'SESSION_ID'
ORDER BY created_at DESC
LIMIT 20;
"
```

Recent events for one session:

```bash
sqlite3 "$DB" "
SELECT kind, created_at, payload_json
FROM event_logs
WHERE session_id = 'SESSION_ID'
ORDER BY created_at DESC
LIMIT 30;
"
```

Current TTS config selection:

```bash
sqlite3 "$DB" "
SELECT json_extract(value, '$.selectedTtsConfigId')
FROM settings
WHERE key = 'app_settings';
"
```

### 7.4 Audio Asset Checks

Check local acknowledgement assets:

```bash
find ./tmp/audio/ack-pack -type f | sort
```

Verify generated MP3 codec:

```bash
ffprobe -v error \
  -show_entries stream=codec_name,duration \
  -of default=noprint_wrappers=1 \
  ./tmp/audio/ack-pack/zh/ack_zh_02.mp3
```

Regenerate the pack from the saved Alibaba config:

```bash
./scripts/audio/generate-ack-pack-from-db.sh \
  --db "/path/to/app-state.sqlite"
```

## 8. Common Failure Patterns

### 8.1 No Voice Response

Check:

- macOS/Electron microphone permission
- active session is actually selected
- selected STT config has valid API key/base URL
- diagnostics show `transcribe_done` or only `voice_short_ignored`

### 8.2 Voice Was Heard But Ignored

Expected reasons include:

- transcript too short
- transcript was empty
- command lacked required supplement text such as URL/path/ID

Check:

- `voice_short_ignored`
- staged supplement text in the right-side turn input panel

### 8.3 No Acknowledgement Audio

Check:

- files exist under `tmp/audio/ack-pack/{zh,en}`
- `audio:get-ack-cue` returns a file cue instead of text fallback
- browser audio playback is not blocked

If needed, regenerate assets with:

- `scripts/audio/generate-ack-pack.sh`
- `scripts/audio/generate-ack-pack-from-db.sh`

### 8.4 Result Playback Is Silent After Switching Sessions

This is expected behavior.

The app only plays task results for the currently active workspace.

### 8.5 Task Appears Stuck

Check:

- `tasks` table for `queued` or `running`
- diagnostics for `task_started`, `task_result`, or `task_recovered`
- whether global task concurrency is too low
- whether the selected developer tool executable exists
- whether the resolved runtime path points to the binary version you expect instead of an older GUI `PATH` hit
- whether the selected developer tool is logged in and allowed to access the working directory

### 8.6 Wrong Project Context

Check:

- active session binding in the right-side profile panel
- left filter is only a view filter; it does not change underlying binding
- session switching may move you into a different bound profile

## 9. Handoff Checklist

When handing this project to another engineer, make sure they understand:

- the product is session-centric, not project-centric
- only the active session captures voice
- only the active workspace speaks results
- project profiles only choose the tool override; executable paths and execution mode live in global settings
- acknowledgement assets are local files, not live TTS
- STT/TTS config libraries are editable from the right-side inspector
- the session filter `All / Current Project` changes list visibility only
- SQLite is the source of truth for settings, sessions, tasks, and events

Minimum handoff steps:

1. Read `README.md`.
2. Read this file.
3. Launch with `npm run dev:desktop`.
4. Verify STT and TTS connection tests from the UI.
5. Inspect one real session in the diagnostics panel.
6. Regenerate the acknowledgement pack once to confirm toolchain access.

## 10. Key Files For Deep Dives

- `README.md`
- `electron/main.mjs`
- `electron/developer-tools.mjs`
- `electron/state-store.mjs`
- `electron/preload.cjs`
- `electron/speech-config.mjs`
- `src/App.tsx`
- `src/useVoiceLoop.ts`
- `scripts/audio/generate-ack-pack.sh`
- `scripts/audio/generate-ack-pack-from-db.sh`
- `test/state-store.test.mjs`
- `test/voice-heuristics.test.mjs`
