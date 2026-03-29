# DevCue One

DevCue One is an open-source Electron + React desktop workspace for multi-session, voice-driven software development. It combines project-bound sessions, voice turns, text turns, local control flows, diagnostics, playback, and macOS release automation in one desktop app.

- Website: https://devcue.one/
- Chinese README: [README_CN.md](./README_CN.md)
- Bilibili Demo: https://www.bilibili.com/video/BV1oJXVBhESc/?share_source=copy_web&vd_source=54186efa4ddd36c2c793ae694ef28b7f
- Author on X: https://x.com/fukui_wuzhi
- License: [MIT](./LICENSE)

## Overview

DevCue One is designed as a persistent desktop developer workspace rather than a one-shot voice trigger.

Current product direction:

1. Only the active session accepts microphone input.
2. Each session can bind to a stable project profile and working directory.
3. Background tasks continue while you switch to another session.
4. Voice turns, text turns, local actions, task logs, diagnostics, and playback remain in the same session history.
5. Voice acknowledgement, playback, diagnostics, and recovery paths are explicit rather than relying on a single happy path.

## Key Features

### Multi-session workspace

- Create, activate, rename, and manage multiple long-lived sessions
- Keep queued and running tasks alive while switching sessions
- Scope the left session column with `All / Current Project`
- Persist session history, status, and diagnostics per session

### Project profiles

- Bind each session to a stable project profile
- Store working directory, default prompt context, and usage notes
- Restore project context when switching sessions

### Voice + text workflow

- Active-session-only voice capture
- Direct text submission and staged "next-turn supplement" input
- Clear handling for short transcripts, ignored turns, local actions, and supplement-assisted turns
- Recognition chime, acknowledgement cue, error chime, and result playback with fallback behavior

### Developer tools and speech providers

Supported developer tools:

- Codex
- Claude Code
- Cursor CLI
- Gemini CLI
- Qwen Code

Supported STT / TTS modes:

- Browser / System
- Fake
- OpenAI
- Groq
- Alibaba Model Studio
- Volcengine Speech
- OpenAI-compatible custom HTTP endpoints

### Diagnostics and recovery

- Session-level diagnostics with session ID, runtime ID, developer-tool thread ID, task summary, and event stream
- Startup and runtime orphan-task recovery
- Browser-only mock mode and deterministic fake backend for UI/testing work
- Automated tests for state storage, developer-tool args, voice heuristics, packaging, signing, and notarization helpers

### macOS release automation

- Apple Silicon and Intel packaging
- Developer ID signing
- Apple notarization
- Gatekeeper validation
- Environment-driven local release flow with project-specific scripts and docs

## Product Preview

![DevCue One Hero](./website/public/screens/devcue-one-hero.jpg)


## Demo Video

- Bilibili product demo: <https://www.bilibili.com/video/BV1oJXVBhESc/?share_source=copy_web&vd_source=54186efa4ddd36c2c793ae694ef28b7f>

## Getting Started

### Prerequisites

- Node.js `22+`
- `nvm` available locally; the repo ships with `.nvmrc`
- At least one supported developer-tool CLI installed and logged in
- At least one usable STT / TTS provider if you want the real voice flow

### Install and run

```bash
git clone git@github.wzfukui:wzfukui/DevCueOne.git
cd DevCueOne
nvm use 22
npm install
npm run dev:desktop
```

Recommended first-run flow:

1. choose a working directory for the first project
2. grant microphone permission
3. configure STT / TTS, or temporarily switch to `fake` / `testMode`
4. configure the developer-tool CLI and verify its executable path

## Common Commands

```bash
# Electron + Vite development
npm run dev:desktop

# Browser-only UI development
npm run dev

# Automated tests
npm test

# Lint
npm run lint

# Build
npm run build

# Current-platform packaging
npm run release:local

# Preferred macOS packaging path
npm run release:mac:local
```

## macOS Packaging, Signing, and Notarization

Recommended entry point:

```bash
npm run release:mac:local
```

Related docs:

- `docs/operations/release-automation.md`
- `docs/operations/macos-signing-and-notarization.md`
- `env/macos-signing.example.env`

Preview-only alternatives:

```bash
npm run package:mac
npm run package:mac:arm64
npm run package:mac:x64
```

## Repository Layout

- `electron/`: Electron main process, IPC, state store, voice heuristics, developer-tool adapters
- `src/`: React renderer UI and voice hooks
- `scripts/`: release, notarization, and audio helper scripts
- `docs/`: architecture, product, operations, testing, and integration notes
- `test/`: automated tests for runtime helpers and release tooling
- `website/`: marketing site and static website assets

## Security Notes

- Real API keys, certificates, `.p8`, `.p12`, and notarization credentials should never be committed
- Keep local secrets in `.env`, `.env.local`, `.env.signing.local`, or system environment variables
- Signing and notarization docs in this repo use placeholders only

## Documentation

- Chinese product README: [`README_CN.md`](./README_CN.md)
- Technical runbook: [`docs/operations/technical-runbook.md`](./docs/operations/technical-runbook.md)
- Release automation: [`docs/operations/release-automation.md`](./docs/operations/release-automation.md)
- macOS signing and notarization: [`docs/operations/macos-signing-and-notarization.md`](./docs/operations/macos-signing-and-notarization.md)
- Product design archive: [`docs/product/phase-2/product-design.md`](./docs/product/phase-2/product-design.md)

## Current Limitations

- The current VAD is still engineering-grade prototype logic, not a production-grade speech segmentation system
- Local routing still covers only a limited set of high-frequency actions
- The app is currently optimized for developer workstations rather than zero-config end-user distribution
- A YouTube demo is planned, but the public demo link is Bilibili-only for now

## Contributing

Issues and pull requests are welcome. Before sending changes:

1. use Node.js `22+`
2. keep secrets out of the repository
3. run `npm run lint`, `npm test`, and `npm run build`

## License

This project is released under the MIT License. See [LICENSE](./LICENSE).
