# DevCue One

DevCue One is an Electron + React desktop workspace for multi-session voice-driven development.

Current product direction:

1. Only the active session accepts microphone input.
2. Each session can bind to an independent project profile and working directory.
3. Background tasks can keep running while you switch to another session.
4. Voice, plain text, local shortcuts, task logs, and playback diagnostics all land in the same session history.
5. Voice acknowledgement and result playback now have explicit fallback and recovery paths instead of relying on a single happy path.

## Latest Workflow Updates

- Multi-session task execution now supports a global concurrency limit and startup/runtime orphan-task recovery.
- The left session column now supports a lightweight `All / Current Project` filter without changing the existing card layout.
- Global settings now separate `Developer Tool`, executable detection, and `Execution Mode`, so the desktop runner is no longer tied to Codex only.
- Voice acknowledgement flow now plays a recognition chime first, then uses local acknowledgement assets when available, and falls back to browser speech when asset playback fails.
- Local acknowledgement assets can now be regenerated from the saved Alibaba TTS config in the app-state database.
- Rejected voice turns now emit an error chime and clearer ignore reasons in diagnostics.
- Result playback now deduplicates by task ID, so the same task result is not read twice from both submit return and event replay.
- Project profile, settings, and diagnostics panels are now collapsible; the profile panel defaults to a compact summary mode.
- Per-session "next-turn supplement" text is persisted locally, so staged context survives reloads.
- Diagnostics now expose combined session/runtime ID copy, thread ID visibility, and recovered-task events.
- Startup now waits for persisted settings before deciding whether onboarding should open, and completed users see a boot skeleton instead of an onboarding flash.
- The left session pane now keeps session-card skeletons on screen during bootstrap, so the list no longer flashes an empty-state card before data arrives.
- Theme presets now support preview-vs-save behavior and include the `Ink Peony` guohua-inspired palette.
- A browser-only mock mode exists for scroll verification of the session list.

## UI Snapshot

```text
+--------------------+-------------------------------+------------------------------+
| Sessions           | Workspace                     | Inspector                    |
|                    |                               |                              |
| - all/current      | - status / mic meter          | - Project Profile            |
|   project filter   | - active session summary      |   - compact summary          |
| - session list     | - start/pause listening       |   - expand to edit/bind      |
| - rename           | - cancel current task         | - Turn Input                 |
| - task badge       | - stop playback               |   - submit now               |
| - profile badge    | - conversation timeline       |   - stage as next turn       |
| - last preview     |   - latest 4 by default       | - STT config library         |
|                    |   - expand older messages     | - TTS config library         |
|                    |                               | - Global Settings            |
|                    |                               |   - tool / path / mode       |
|                    |                               | - Diagnostics (collapsed)    |
|                    |                               |   - copy session + runtime id|
+--------------------+-------------------------------+------------------------------+
```

## Current Capabilities

### Workspace

- Electron desktop shell with a React UI.
- Multi-session list with create, activate, rename, and per-session task status.
- The left column keeps the existing session-card layout and adds a compact `All / Current Project` filter for quick scoping.
- Background queued/running tasks continue after switching away from a session.
- Active-session-only voice capture, so microphone input never lands in the wrong session.
- Conversation panel shows latest messages first and can expand older history on demand.

### Project Profiles

- Create, update, clone, bind, and remove project profiles.
- Each profile stores:
  - name
  - absolute working directory
  - default prompt context
  - usage notes
- Working directory is validated before save/bind.
- Removing a profile only unbinds sessions; it does not delete the directory on disk.
- Profile selection stays stable per session instead of jumping when you switch around.

### Global Settings

- Multiple STT / TTS configs can be stored and selected globally.
- Each speech config can carry its own provider, model, voice/language, API key, base URL, and region.
- Settings panel can test the currently selected STT / TTS config before save.
- Built-in defaults ship for `OpenAI`, `Browser / System`, and `Fake`.
- `Groq`, `Alibaba Model Studio`, `Volcengine Speech`, and generic OpenAI-compatible HTTP speech endpoints are wired for runtime use.
- Developer tool is globally selectable:
  - `Codex`
  - `Claude Code`
  - `Cursor CLI`
  - `Gemini CLI`
  - `Qwen Code`
- Each tool has its own executable/command field in the settings panel.
- Executable paths are remembered per tool, so switching between Codex / Claude / Cursor / Gemini / Qwen does not overwrite the others.
- The app attempts to auto-detect the selected tool locally and can auto-fill a resolved executable path.
- Cursor CLI is validated in headless `--print --output-format json` mode, reuses `session_id`, auto-trusts the active workspace, maps bypass-on to `--force`, and maps bypass-off to `--sandbox enabled`.
- Execution mode is separate from tool choice:
  - `real`: run the selected developer tool
  - `fake`: deterministic fake backend for UI/demo/testing
- `testMode` still forces fake execution even if the UI is set to `real`.
- Configurable global task concurrency limit.
- Optional auto-start listening after app boot.
- Optional sandbox/permission bypass toggle for developer-tool execution.
- Curated theme presets with preview/save separation, including `Ink Peony`.
- Settings panel is collapsible and defaults to summary mode.

### Voice Flow

- Always-on microphone loop with simple calibration, level meter, and speech segmentation.
- Selected STT config is used for real voice turns.
- The selected STT config can run a built-in connection test with a fixed sample clip.
- Real STT currently works with:
  - OpenAI
  - Groq
  - Alibaba Model Studio (`Qwen-ASR`)
  - Volcengine Speech (`Flash` file recognition)
  - OpenAI-compatible custom HTTP endpoints
- Volcengine STT uses the provider-specific `App ID`, `Access Token`, and `Resource ID` fields.
- When the recorded blob is not already in a Volcengine-supported format, the renderer converts it to `wav` before upload.
- Fake STT path for test mode.
- Empty transcripts are ignored with explicit diagnostics.
- Short transcripts are ignored by default when they are not immediate workspace/local commands.
- `MIN_VOICE_TRANSCRIPT_CHARS` is currently `10`.
- Short voice input can still submit to the selected developer tool when "next-turn supplement" text is present.
- Recognition chime plays before transcription completes.
- Accepted developer-tool turns trigger an acknowledgement cue after transcription.
- Rejected voice turns trigger an error chime.

### Acknowledgement And Playback

- Acknowledgement cue priority:
  1. Local asset pack under `tmp/audio/ack-pack/{zh,en}`
  2. Browser/system speech fallback
- The local acknowledgement pack can be refreshed from the saved Alibaba Model Studio TTS config via `scripts/audio/generate-ack-pack-from-db.sh`.
- Result playback priority:
  1. Browser/system TTS by default
  2. First usable cloud TTS config fallback if browser playback fails
- The selected TTS config can run a direct synthesis test from the settings panel.
- Real cloud TTS currently works with:
  - OpenAI
  - Groq Orpheus
  - Alibaba Model Studio (`Qwen-TTS`)
  - Volcengine Speech (`V3` synthesis)
  - OpenAI-compatible custom HTTP endpoints
- Volcengine TTS uses the provider-specific `API Key`, `Resource ID`, and `Speaker` fields.
- Playback is tracked in diagnostics through `ack_playback`, `result_playback`, and `result_playback_skipped` events.
- Result playback is only spoken for the currently active workspace; background sessions or previously bound projects finish silently.
- Switching sessions or rebinding the active session to another project immediately pauses any in-flight TTS playback.
- A dedicated "Stop Playback" control can interrupt browser or synthesized audio.

### Local Routing

The following high-frequency commands are handled locally before reaching the selected developer tool:

- Create session:
  - `新建会话 修复登录页`
- Switch session:
  - `切换会话 Proxy 排查`
- Open browser:
  - `打开浏览器`
- Open URL:
  - `打开链接`
- Open directory:
  - `打开目录`
- Inspect listening ports:
  - `开放了哪些端口`

Notes:

- `打开链接` and `打开目录` work best when the exact URL/path is placed in the supplement text box.

### Text Turns And Staged Context

- Plain text turns and voice turns share the same backend queue and session history.
- The right-side input box supports two modes:
  - submit immediately
  - stage as "next-turn supplement"
- Supplement text is stored per session in `localStorage`.
- Staged supplement can be restored back to the editor or cleared independently.

### Diagnostics And Recovery

- Per-session diagnostics include:
  - session ID
  - runtime session/thread ID
  - developer-tool session/thread ID
  - active task summary
  - recent event log
- Session ID and runtime session ID can be copied together from the diagnostics panel.
- Startup and runtime both recover orphan queued/running tasks and mark them as cancelled with a `task_recovered` event.
- Client-side playback and chime actions are also logged back into the session event stream.

### Developer Modes

- `testMode` switches STT/TTS/developer-tool execution to deterministic fake behavior.
- Browser-only session-scroll harness:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173/?mockSessions=1
```

This renders mock sessions without Electron so you can verify left-column scrolling behavior in a browser.

## Prerequisites

### 1. Node.js

Use Node.js `22+`.

Reason:

- the app state store and its tests use `node:sqlite`
- `npm test` fails on Node `20.x`
- `package.json` now declares the same minimum via `engines.node`

### 2. Developer Tool CLI

By default the app uses `Codex`, so a fresh setup should at least have the Codex CLI installed and logged in:

```bash
codex login
```

The first-pass supported real backends are:

- `Codex`
- `Claude Code`
- `Cursor CLI`
- `Gemini CLI`
- `Qwen Code`

The settings panel will try to auto-detect the selected tool on your machine. If detection fails, fill the executable path or command manually.

Before launching the app, install at least one supported CLI IDE/tool locally and confirm it already works in your terminal with a valid login session. The desktop app only shells out to that CLI; if the CLI itself is missing, expired, or unauthenticated, task execution will fail inside the app too.

If the selected tool is missing, not logged in, or lacks permission, the task path will fail and diagnostics will show the backend error.

Claude-specific note:

- Headless Claude Code runs with `-p --output-format json --json-schema ... --add-dir <workspace> -- "<prompt>"`.
- The `--` separator is required because `--add-dir` is variadic.
- Structured payloads should be read from top-level `structured_output`, while `session_id` remains the reusable thread identifier.

For the full validation record, see `docs/integrations/claude-code-integration-practice.md`.

Cursor-specific note:

- Headless Cursor Agent requires a trusted workspace before it will run. The app now passes `--trust` automatically for Cursor CLI tasks, so the remaining behavior is controlled by the existing bypass toggle:
  - bypass on: `--force`
  - bypass off: `--sandbox enabled`

For the full validation record, see `docs/integrations/cursor-cli-integration-practice.md`.

### 3. Speech Provider API Keys

Real voice workflow needs at least one configured speech provider API key for:

- speech-to-text
- optional cloud TTS fallback
- audio helper scripts

OpenAI can reuse the global `OPENAI_API_KEY`:

```bash
export OPENAI_API_KEY=sk-...
```

Alibaba Model Studio uses a per-config DashScope key in the settings panel. If you only want UI/testing flow, switch providers to `fake` or enable `testMode`.

## Getting Started

### Quick Start Guide

#### 1. Clone The Repository

```bash
git clone git@github.wzfukui:wzfukui/DevCueOne.git
cd DevCueOne
```

#### 2. Prepare Local Prerequisites

- Install Node.js `22+`.
- Install at least one supported CLI IDE/tool and finish its login flow before opening the desktop app.
- Recommended default: `Codex`.
- Other supported choices: `Claude Code`, `Cursor CLI`, `Gemini CLI`, `Qwen Code`.
- For real voice workflow, prepare at least one usable STT/TTS provider config or API key.
- If you only want to try the UI or task flow first, you can switch to `fake` providers / `testMode` during setup.

#### 3. Install Dependencies

```bash
npm install
```

#### 4. Start The Desktop App

```bash
npm run dev:desktop
```

#### 5. Complete Onboarding

On first launch, finish the onboarding flow in this order:

1. choose the working directory for your first project
2. grant microphone permission
3. configure STT / TTS, or temporarily use `fake` for local testing
4. choose the developer tool and confirm the executable path resolves correctly

If the selected CLI is not installed or not logged in yet, fix that in your terminal first, then return to the app and re-run detection.

#### 6. Create Your First Project And Session

- The onboarding flow will create your first project profile and bind it to the active session automatically.
- After onboarding, you can open the `Project Profile` panel to edit the profile name, working directory, prompt context, and usage notes.
- Use the `新建` button in the left session column whenever you want another session.
- Bind a different project profile to the current session if you want that session to target another repository.

#### 7. Start Your First Task

1. click `开始监听`, or type directly into the turn input box
2. say one complete instruction, or submit a text turn manually
3. put URLs, absolute paths, branch names, ticket IDs, or acceptance criteria into the supplement box when extra precision is needed

Example first task:

```text
帮我检查当前仓库未提交的修改，并总结风险。
```

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run dev:desktop
```

Run the browser-only Vite preview for UI/debug work:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Build the app:

```bash
npm run build
```

Build first, then launch Electron against `dist`:

```bash
npm run start
```

Build preview packages for the current platform:

```bash
npm run release:local
```

Preferred local macOS release command:

```bash
npm run release:mac:local
```

Other packaging shortcuts:

```bash
npm run package:dir
npm run package:mac
npm run release:mac:local
npm run release:mac:local:arm64
npm run release:mac:local:x64
npm run package:mac:arm64
npm run package:mac:x64
npm run notarize:mac:app -- release/mac-arm64/DevCueOne.app
npm run package:win
npm run package:linux
```

Packaging notes:

- preview artifacts are written to `release/`
- `npm run package:mac` now emits both Apple Silicon and Intel preview installers by default
- `npm run release:mac:local` is the default operator path for macOS packaging, signing, and verification
- local release automation requires a clean git worktree by default
- unsigned preview packaging is the default unless `VOICE_AGENT_ENABLE_SIGNING=1`
- see `docs/operations/release-automation.md` for the full release flow
- see `docs/operations/macos-signing-and-notarization.md` for environment-driven signing and notarization setup
- see `env/macos-signing.example.env` for a placeholder-only signing environment template
- see `docs/design/app-icon-generation-brief.md` for the icon-generation brief

## Recommended First Run

1. Launch the app with `npm run dev:desktop`.
2. Save global settings on the right side.
3. Create or pick a project profile.
4. Create a session and choose the project profile up front.
5. Click `开始监听`.
6. Speak one complete instruction, or type a text turn manually.
7. Put URLs, absolute paths, branch names, IDs, or acceptance criteria into the supplement text box when the spoken command is ambiguous.

## Real-Time Voice Rules

- Empty transcript: ignored.
- Short transcript without extra context: ignored.
- Short local command such as `打开浏览器`: accepted.
- Short transcript plus supplement text: accepted and sent to the selected developer tool.

This keeps accidental noise from creating full developer-tool turns while still preserving fast voice shortcuts.

## Audio Helper Scripts

The repository includes shell scripts for generating TTS samples, acknowledgement packs, and manual transcription checks.

Important:

- there is currently no `.env.example` file in the repository
- create your own local `.env` if you want script-based audio tooling
- `.env` should stay uncommitted

Minimal local `.env`:

```bash
OPENAI_API_KEY=...
```

### Generate TTS Audio

```bash
./scripts/audio/generate-tts.sh \
  --text "好的，马上处理。" \
  --output ./tmp/audio/ack-zh-01.mp3
```

Read text from file:

```bash
./scripts/audio/generate-tts.sh \
  --text-file ./tmp/text.txt \
  --output ./tmp/audio/out.wav \
  --format wav \
  --voice coral
```

### Transcribe Audio

```bash
./scripts/audio/transcribe-audio.sh \
  --file ./tmp/audio/sample.webm \
  --language zh
```

Write transcription output into a file:

```bash
./scripts/audio/transcribe-audio.sh \
  --file ./tmp/audio/sample.wav \
  --output ./tmp/transcript.json
```

### Generate Acknowledgement Pack

```bash
./scripts/audio/generate-ack-pack.sh
```

Generate the same pack from the saved Alibaba TTS config in the desktop app database:

```bash
./scripts/audio/generate-ack-pack-from-db.sh \
  --db "/path/to/app-state.sqlite"
```

Default output:

```text
./tmp/audio/ack-pack
```

Skip files that already exist:

```bash
./scripts/audio/generate-ack-pack.sh --skip-existing
```

Switch env file explicitly:

```bash
./scripts/audio/generate-tts.sh --env-file ./.env.local ...
```

Useful script environment variables:

- `OPENAI_API_KEY`
- `OPENAI_TTS_MODEL`
- `OPENAI_TTS_VOICE`
- `OPENAI_TTS_FORMAT`
- `OPENAI_STT_MODEL`
- `OPENAI_STT_LANGUAGE`
- `OPENAI_STT_RESPONSE_FORMAT`

## Storage Model

Persistent app state is stored in SQLite and includes:

- settings
- project profiles
- sessions
- messages
- tasks
- event logs

This allows the app to recover queue/task history, restore active session state, and keep diagnostics attached to the correct conversation.

Runtime paths:

- app-state database: `${app.getPath('userData')}/app-state.sqlite`
- legacy settings snapshot: `${app.getPath('userData')}/settings.json`
- debug audio directory: `${app.getPath('userData')}/debug-audio`
- acknowledgement asset directory: `VOICE_AGENT_ACK_PACK_DIR` or `tmp/audio/ack-pack`

## Key Files

- `docs/operations/technical-runbook.md`: architecture, troubleshooting workflow, diagnostics checklist, and handoff notes.
- `electron/main.mjs`: Electron main process, IPC handlers, speech + developer-tool adapters, queue execution, task recovery, local routing.
- `electron/developer-tools.mjs`: developer-tool definitions, executable detection, defaults, and runtime capability metadata.
- `electron/state-store.mjs`: SQLite-backed app state store for sessions, profiles, tasks, and events.
- `electron/voice-heuristics.mjs`: voice acceptance rules and local-command heuristics.
- `electron/preload.cjs`: secure Electron bridge for renderer APIs.
- `electron/codex-output-schema.json`: shared structured output schema for the supported developer tools.
- `electron-builder.yml`: preview packaging targets and artifact layout for desktop builds.
- `src/App.tsx`: main UI, playback state machine, collapsible inspectors, staged context, diagnostics.
- `src/useVoiceLoop.ts`: microphone capture loop and utterance segmentation.
- `scripts/release-build.mjs`: local release helper for validation + packaging automation.
- `scripts/notarize-macos-app.mjs`: retry-friendly notarization helper for an already signed macOS `.app`.
- `docs/operations/release-automation.md`: packaging and CI workflow notes.
- `docs/operations/macos-signing-and-notarization.md`: company-safe macOS signing/notarization setup using environment variables.
- `docs/design/app-icon-generation-brief.md`: icon generation prompt, negative prompt, and asset handoff checklist.
- `test/state-store.test.mjs`: state store bootstrap/profile/task coverage.
- `test/voice-heuristics.test.mjs`: voice acceptance/ignore rule coverage.

## Documentation Map

- `docs/architecture/`: runtime architecture, turn pipeline, and voice-input maintenance notes.
- `docs/audio/`: TTS/STT helper plans and voice asset source material.
- `docs/design/`: visual direction, icon brief, and UI-facing design references.
- `docs/integrations/`: validation notes for Codex-adjacent developer tool CLIs.
- `docs/operations/`: release flow, signing/notarization, and technical runbook material.
- `docs/product/phase-2/`: archived product planning set for the Phase 2 design pass.
- `docs/research/`: research notes and external risk analysis.
- `docs/testing/`: manual and automated test preparation checklists.

## Current Limitations

- Voice segmentation is still prototype-level threshold logic, not a production-grade VAD.
- Only a limited set of local shortcuts is supported.
- Preview packaging automation now exists, but signed distribution and installer polish are not finished.
- Electron permission behavior and packaged-app validation are not yet part of a full release checklist.
- The product is still optimized for developer-run environments rather than end-user distribution.

## Near-Term Direction

- Stronger VAD and more stable microphone behavior.
- More local routing coverage for high-frequency desktop actions.
- Better multi-session recovery and resume behavior.
- More complete automated test coverage around Electron flows.
- Signed packaging, install smoke tests, and distribution hardening.
