# Turn Pipeline And Project Profile Context

## Purpose

This note explains how DevCue One moves user input and project-profile data through the runtime:

1. renderer capture and form state
2. Electron IPC handoff
3. profile persistence and session binding
4. voice transcription and acceptance
5. local routing vs developer-tool execution
6. structured JSON result parsing
7. message, task, event, UI, and playback updates

The goal is to make future maintenance predictable when changing project fields, prompt construction, routing rules, or execution adapters.

## Scope

This document covers the current runtime behavior in:

- `src/App.tsx`
- `electron/preload.cjs`
- `electron/main.mjs`
- `electron/state-store.mjs`
- `electron/developer-tools.mjs`
- `electron/voice-heuristics.mjs`
- `electron/codex-output-schema.json`

## End-To-End Overview

```text
Project form / voice input / text input
        |
        v
Renderer state in App.tsx
        |
        v
desktopAgent.* IPC bridge (preload)
        |
        v
Electron main handlers
        |
        +--> save/bind profile --> SQLite state
        |
        +--> submit text turn ------+
        |                           |
        +--> submit voice turn --> transcribe --> accept/reject/local/tool
                                            |
                                            v
                              task queue + session/profile lookup
                                            |
                                            v
                           build prompt + call selected developer tool
                                            |
                                            v
                          parse structured JSON result + persist events
                                            |
                                            v
                             renderer updates UI and optional playback
```

## 1. Project Profile Data Model

`ProjectProfile` currently contains:

- `name`
- `workingDirectory`
- `developerTool`
- `defaultPromptContext`
- `usageNotes`

Persistent storage is the `project_profiles` SQLite table in `electron/state-store.mjs`.

Important defaults:

- `default_prompt_context`: `''`
- `usage_notes`: `''`

This means `defaultPromptContext` and `usageNotes` are optional by design in the current schema, not required fields.

## 2. What Each Profile Field Actually Does

The fields are all persisted, but they are not used with the same strength.

| Field | Current Runtime Use |
| --- | --- |
| `name` | UI summary, profile picker label, prompt context |
| `workingDirectory` | validated on save, used as task working directory |
| `developerTool` | optional per-profile override of the global developer tool key; executable paths still come from global settings |
| `defaultPromptContext` | prompt context only |
| `usageNotes` | prompt context only |

Important caveats:

- `defaultPromptContext` and `usageNotes` are not separate system-level controls. They are plain text injected into the prompt body each turn.

## 3. Profile Creation And Update Path

### 3.1 Renderer Draft State

The profile editor lives in `src/App.tsx`.

Renderer responsibilities:

- keep editable profile draft state
- trim optional text fields before submit
- send IPC requests through `desktopAgent.saveProfile()`

Current form behavior:

- `defaultPromptContext` and `usageNotes` default to empty strings
- the editor shows placeholder guidance for optional fields

### 3.2 IPC Save Path

Save flow:

1. `src/App.tsx` builds a `ProfileSaveInput`
2. `desktopAgent.saveProfile()` calls IPC channel `profile:save`
3. `electron/main.mjs` runs `saveProfile(payload)`
4. `saveProfile()` validates `workingDirectory`
5. `stateStore.saveProfile()` writes to SQLite
6. `broadcastStateChanged()` refreshes renderer state

### 3.3 SQLite Write Path

`electron/state-store.mjs` normalizes the data before insert/update:

- `name`: trimmed, or falls back to the working-directory basename
- `developerTool`: normalized tool key or `null`
- `defaultPromptContext`: trimmed or `''`
- `usageNotes`: trimmed or `''`

## 4. Session Binding Path

Project profile data only becomes task context after the session is bound to that profile.

Bind flow:

1. renderer calls `desktopAgent.bindProfile({ sessionId, profileId })`
2. IPC channel `profile:bind` runs in `electron/main.mjs`
3. main process verifies the profile exists
4. main process re-validates the profile working directory
5. `stateStore.bindProfileToSession()` updates `sessions.bound_profile_id`
6. profile `lastUsedAt` is touched
7. state change is broadcast back to the renderer

After binding, `stateStore.getSessionDetail(sessionId)` returns:

- the session record
- `boundProfile`
- messages
- tasks
- recent events

`boundProfile` is the source of truth used during task execution.

## 5. Input Entry Points

DevCue One has two primary turn entry points:

- text turns
- voice turns

Both converge into the same main-process task pipeline after voice transcription.

### 5.1 Text Turn Entry

Renderer path in `src/App.tsx`:

1. user types the main request in the message input
2. user may also fill the staged supplement text box
3. `handleSubmitTextTurn()` calls `desktopAgent.submitTextTurn()`
4. message draft can be restored on failed/cancelled final results
5. staged supplement text is treated as one-shot context and is only restored when local submission fails before the task is actually dispatched

There is also `handleQueueTextTurn()` for queue mode. That path returns early with a local confirmation while the queued task runs later.

### 5.2 Voice Turn Entry

Renderer path:

1. renderer enables either `useVoiceLoop` or `useVadVoiceLoop` based on saved `voiceInputMode`
2. `handleVoiceUtterance()` receives the `Blob`
3. the blob is converted to base64
4. staged supplement text is attached as `pendingText`
5. renderer attaches `captureMode`
6. renderer calls `desktopAgent.submitVoiceTurn()`
7. staged supplement text is consumed once for that submitted turn and is only restored when the local submit path throws before the task reaches the backend

Voice-specific UX around this path:

- a pre-transcription acknowledgement chime can be played
- error chime can be played when the voice turn is rejected
- final result playback is handled after the IPC call returns

Important current split:

- `classic` uses the legacy analyser + `MediaRecorder` path
- `vad_beta` uses the isolated PCM/WAV beta path
- both modes still converge into the same Electron voice-turn pipeline after utterance emission

## 6. IPC Bridge

`electron/preload.cjs` exposes the safe renderer API surface.

Relevant calls:

- `saveProfile`
- `bindProfile`
- `submitTextTurn`
- `queueTextTurn`
- `submitVoiceTurn`
- `cancelSessionTask`
- `onStateChanged`

The renderer never talks to Node or SQLite directly.

## 7. Main-Process Submission Path

### 7.1 Text Submission

`submitTextTurn(payload)` in `electron/main.mjs`:

1. load session
2. load global runtime settings
3. load `boundProfile` from session
4. resolve effective settings with profile-level tool override
5. choose working directory from `boundProfile.workingDirectory` first, else fallback to global settings
6. call `enqueueTask(...)`

### 7.2 Voice Submission

`submitVoiceTurn(payload)` does the same session/profile/settings resolution first, but enqueues a `voice_turn` with audio data instead of plain input text.

Current additional details:

- `captureMode` is normalized from payload/settings
- the queued job keeps that mode metadata
- later voice-related events such as `transcribe_done`, `voice_short_ignored`, and `voice_intent_ready` can include `captureMode`

This means profile binding already affects the working directory and tool choice before transcription starts.

## 8. Shared Task Queue Behavior

Both text and voice turns use the same queue runtime.

Key functions in `electron/main.mjs`:

- `scheduleTask()`
- `enqueueTask()`
- `startQueuedTask()`
- `finalizeTask()`

Important behavior:

- non-queue submit mode rejects if the same session already has a running or queued task
- tasks can start immediately or remain queued depending on current concurrency
- task records are created before execution
- lifecycle events such as `task_queued` and `task_started` are persisted

When a task actually starts, `startQueuedTask()` calls `processTurn(runtime)`.

## 9. Voice-Specific Processing

Voice turns go through extra preprocessing before entering the common text path.

### 9.1 Transcription

`processVoiceTurn(runtime)` calls `transcribeAudio(...)` with current STT settings.

Result:

- transcript text
- provider label
- optional debug audio path

The runtime then writes a `transcribe_done` event.

### 9.2 Acceptance Rules

`evaluateVoiceTranscript(text, pendingText)` in `electron/voice-heuristics.mjs` decides whether the transcript is:

- empty
- too short
- a local command
- a developer-tool turn

Current rule highlights:

- short voice input is usually ignored
- short input can still pass when it matches a local workspace command
- presence of staged supplement text makes acceptance easier

### 9.3 Convergence Into Text Flow

If the voice turn is accepted:

- `runtime.inputText` becomes the transcript text
- `runtime.sourceLabel` becomes `本轮来自语音`
- `processVoiceTurn()` then calls `processTextTurn(runtime)`

From that point, voice and text turns share the same execution logic.

## 10. Common Text Processing Path

`processTextTurn(runtime)` is the main execution hub.

It does the following:

1. load `sessionDetail`
2. resolve effective settings with profile override
3. resolve working directory from bound profile first
4. write the user message into message history
5. create a `user_input` event
6. try local workspace routing first
7. if not locally routed, run the selected developer tool
8. persist the final assistant/system message
9. create a `task_result` event

### 10.1 Conversation Context

Before developer-tool execution, `buildConversationContext(messages)` takes the last 8 messages and flattens them into simple `role: text` lines.

This history becomes part of the prompt payload for the next turn.

## 11. Local Routing Before Tool Execution

There are two local-routing layers before a real developer-tool call happens.

### 11.1 Workspace Intent Router

`routeWorkspaceIntent(sessionId, combinedText)` handles:

- create session
- switch session

If a local workspace route matches, no external developer tool is called.

### 11.2 Local Shortcut Router

`runDeveloperToolTurn()` calls `runLocalShortcut()` before any backend adapter.

Current local shortcuts include:

- list listening ports
- open browser
- open URL
- open folder

These also bypass external tool execution completely.

## 12. How Project Data Reaches The Developer Tool

If the request is not handled locally, the runtime calls a backend adapter such as:

- `runCodexCliTurn`
- `runClaudeCodeTurn`
- `runCursorCliTurn`
- `runGeminiCliTurn`
- `runQwenCliTurn`

All of them build the prompt through the same `buildPrompt(...)` helper.

### 12.1 Prompt Inputs

`buildPrompt(...)` includes:

- working directory
- current project profile summary
- recent conversation summary
- current spoken/text turn input
- current staged supplement text

The current project section contains:

- `名称`: profile `name`
- `默认说明`: `defaultPromptContext`
- `补充备注`: `usageNotes`

Important:

- `defaultPromptContext` and `usageNotes` are not given special structure beyond plain text labels
- if these values are empty, the prompt shows `(无)`
- staged supplement text is intentionally one-shot and is not supposed to silently carry into later turns after a successful dispatch

### 12.2 Profile-Level Tool Override

Before the adapter is selected, `resolveProfileDeveloperToolSettings(profile, settings)` can override the global developer tool with `profile.developerTool`.

This means one project profile can always route to a different backend than the current global default.

Important runtime detail:

- the profile override only changes the selected tool key
- the executable path still comes from the global `developerToolPaths[tool]` map
- the main process then re-detects the preferred executable before launch, so GUI `PATH` ordering does not silently pick an older binary

## 13. Structured Output Contract

The developer tool is expected to produce a JSON object that matches `electron/codex-output-schema.json`.

Required fields:

- `spokenReply`
- `uiReply`
- `status`
- `needTextContext`
- `nextActionHint`

Backend-specific wrappers may return envelopes around the final payload, so `parseStructuredDeveloperToolOutput(...)` in `electron/developer-tools.mjs` normalizes:

- thread/session ID extraction
- per-tool runtime ID extraction into the shared session record
- top-level `result` or `response` envelopes
- markdown code-fence stripping
- mixed prose plus trailing JSON extraction
- plain-text fallback into the shared `done / need_input / failed` schema
- final JSON object parsing

## 14. Result Persistence And Return Path

After a developer tool or local router returns a result:

1. the current backend runtime session ID is updated in `session.developerToolThreads[tool]` when present
2. assistant/system message is added to message history
3. `task_result` event is written
4. task record is finalized as completed/failed/cancelled
5. the IPC promise resolves back to the renderer

For queued tasks, the final resolution happens when execution finishes. For queue-only text submission, the initial IPC return is only the queue acknowledgement.

## 15. Renderer Result Handling

After `desktopAgent.submitTextTurn()` or `desktopAgent.submitVoiceTurn()` resolves, the renderer:

- updates per-session activity hint
- restores the main draft input when needed
- keeps next-turn supplement text one-shot instead of replaying it across later turns
- plays result audio through `playTurnResultWithDedup(...)`
- may log playback-related client events

Playback rules are intentionally conservative:

- only the active workspace speaks results aloud
- duplicate result playback is suppressed
- interrupted or inactive workspaces skip playback
- playback errors update the activity hint but do not restore already-consumed supplement context

## 16. Current UX/Product Caveats

### 16.1 Optional Fields Need Better Guidance

Because `defaultPromptContext` and `usageNotes` are optional in both schema and save path, the current blank textareas are easy to misread as incomplete required fields.

Recommended UI follow-up:

- add placeholder text
- add a visible `optional` or `可留空` hint

### 16.2 Prompt Semantics Are Soft, Not Hard

`defaultPromptContext` sounds stronger than it really is.

Current behavior:

- it is appended as ordinary prompt text
- it is not a separate system prompt layer
- it has no dedicated merge/priority logic

If stronger behavior is needed later, `buildPrompt(...)` is the first place to change.

### 16.3 Project Matching Route Was Removed

Post-creation project switching is no longer supported through hidden local voice commands.

If project-name matching is reintroduced later, it should be attached to session creation or another explicit entry point instead of a hidden rebinding route.

## 17. Best Places To Change Things Later

Use this section as a maintenance map.

### Change Project Profile Form UX

Start in:

- `src/App.tsx`

Typical changes:

- placeholders
- helper text
- validation wording
- field grouping and labels

### Change Data Persistence Or Field Shape

Start in:

- `src/types.ts`
- `electron/state-store.mjs`

Typical changes:

- add/remove fields
- migration behavior
- array normalization
- default values

### Change Session Binding Semantics

Start in:

- `electron/main.mjs`
- `electron/state-store.mjs`

Typical changes:

- auto-bind behavior
- validation rules
- bind/unbind side effects

### Change Voice Acceptance Rules

Start in:

- `electron/voice-heuristics.mjs`
- `electron/main.mjs`

Typical changes:

- transcript length thresholds
- local-command recognition
- supplement-text interaction

### Change Prompt Composition

Start in:

- `electron/main.mjs` `buildPrompt(...)`

Typical changes:

- field ordering
- stronger profile instructions
- extra context sections
- per-backend prompt variation

### Change Developer Tool Invocation

Start in:

- `electron/main.mjs`
- `electron/developer-tools.mjs`

Typical changes:

- CLI flags
- output parsing
- session resume handling
- backend-specific wrappers

### Change Result Playback

Start in:

- `src/App.tsx`
- `../operations/technical-runbook.md`

Typical changes:

- playback suppression rules
- dedup rules
- voice/text acknowledgment timing

## 18. Quick Debug Checklist

When a field seems to be ignored, check in this order:

1. was the profile actually saved to `project_profiles`
2. is the current session bound to that profile
3. is the request being intercepted by a local router before tool execution
4. did `buildPrompt(...)` include the expected profile values
5. did the selected backend launch the expected resolved executable path
6. did the selected backend return valid structured JSON or a parseable mixed envelope
7. did the renderer receive the result but skip playback because the session was inactive

## 19. Summary

The runtime model is:

- project profile data is persistent and session-bound
- voice and text turns converge into the same common execution path
- local routing can short-circuit tool execution before any external CLI is called
- prompt construction is centralized and currently text-based
- structured JSON output is the contract between the app and every supported developer tool

That makes three files especially important for future changes:

- `src/App.tsx`
- `electron/main.mjs`
- `electron/state-store.mjs`
