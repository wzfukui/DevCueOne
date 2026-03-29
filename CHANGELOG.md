# Changelog

All notable product-facing changes in DevCue One should be recorded in this file.

The format is intentionally lightweight and release-oriented.

## 0.4.3 - 2026-03-29

Patch release for the final DevCueOne identity cutover.

Highlights:

- package identity moved from `desktopvoiceagent` to `devcueone`
- macOS app ID moved to `one.devcue.app`
- draft storage now uses the new `devcueone` namespace without legacy compatibility fallback

## 0.4.2 - 2026-03-29

Patch release for DevCueOne rename cleanup and release revalidation.

Highlights:

- public repository references were moved from the previous repository name to `DevCueOne`
- release metadata advanced to `0.4.2` for the rename-validation pass
- signed and notarized macOS packaging was rerun to confirm the current DevCueOne release flow still works end to end

## 0.4.0 - 2026-03-24

Minor release for product-document alignment and acceptance refresh.

Highlights:

- Phase 2 product design, user stories, Milestone A backlog, and manual test cases were rewritten to match the current shipped project-management model
- project selection is now explicitly documented as required at session creation, while saved profile names and working directories are fixed after creation
- outdated references to `voice aliases`, `keywords`, in-session project switching, and voice-driven project rebinding were removed from planning and testing docs
- automated test preparation notes now reflect the current quality bar around mandatory project selection, immutable project identity, and destructive-action confirmation

## 0.3.9 - 2026-03-24

Patch release for project-profile cleanup.

Highlights:

- removed the `voice aliases` field from project management so the profile editor now focuses on durable project metadata only
- removed the hidden voice-driven project-switch/bind route so sessions can no longer bypass the product rule that project selection is fixed at creation time
- added a database migration that drops the legacy `voice_aliases_json` column from existing `project_profiles` tables on next app initialization

## 0.3.8 - 2026-03-24

Patch release for settings-panel toggle cleanup.

Highlights:

- startup auto-listening and global audio mute were split out of the default preferences group into a dedicated startup-and-playback card
- both controls now use pill-style switches with clearer explanatory copy so they read like standalone runtime toggles instead of generic checkboxes

## 0.3.7 - 2026-03-23

Patch release for project-management UX cleanup and session-binding guardrails.

Highlights:

- project management moved into a dedicated modal with a stable split layout, denser editor form, and safer destructive-action confirmation
- session creation now requires selecting a project up front and no longer allows creating an unbound blank session
- new project drafts now prioritize working-directory selection, include a folder picker, and auto-fill the project name from the selected directory
- project-library rows, editor status chips, optional-field placeholders, and directory-picker controls were tightened to reduce layout drift and make the flow easier to understand

## 0.3.4 - 2026-03-23

Patch release for onboarding microphone-permission gating and release hygiene.

Highlights:

- onboarding voice setup now starts with an explicit microphone-permission card instead of waiting for the first failed voice interaction
- granted microphone access now shows a live level preview inside onboarding while keeping the voice loop suspended so setup cannot accidentally submit a real task
- onboarding completion now requires microphone access in addition to the existing STT and TTS configuration checks
- root lint now ignores generated Astro `.astro` and website `dist` output so release validation is not polluted by website build artifacts

## 0.3.3 - 2026-03-22

Patch release for desktop shell polish and settings copy cleanup.

Highlights:

- startup now keeps the session list in a skeleton-loading state until desktop app state is ready, instead of briefly flashing an empty-state card
- settings workspace copy is now user-facing and more compact, with the software-info card reduced to a single product-title, GitHub, and version row
- theme overview and settings navigation copy were shortened to remove internal product-manager/developer explanations from the UI
- renderer app-shell helpers, technical runbook notes, and automated test checklist were updated to match the current onboarding, session-list, theme, and diagnostics behavior

## 0.3.2 - 2026-03-22

Patch release for website messaging refresh.

Highlights:

- website messaging and product copy were refreshed for the current DevCue One positioning
- package version advanced to `0.3.2` for the website polish release

## 0.3.1 - 2026-03-22

Patch release for website polish plus desktop documentation/test alignment.

Highlights:

- DevCue One website copy refined and released under the current `0.3.1` package version
- desktop README and technical runbook refreshed to match the current onboarding, theme-preset, and diagnostics behavior
- renderer-side app shell helpers now have automated coverage for product-name fallback, theme normalization, onboarding gating, session-list skeleton gating, and session/runtime ID copy formatting

## 0.3.0 - 2026-03-22

Documentation and release-management cleanup for the DevCue One rename.

Highlights:

- README and historical planning docs updated to the latest product name where user-facing branding applies
- documentation moved under `docs/` with category folders for architecture, operations, integrations, design, research, audio, testing, and archived product planning
- broken markdown references fixed after the doc move, while packaged-app technical paths kept the existing `DevCueOne.app` artifact name at that point in time
- `.codex/` and generated `build/` assets are now ignored so the repo root stays clean during local work

## 0.2.0 - 2026-03-22

Feature release for first-run onboarding and desktop polish before the website build-out.

Highlights:

- blocking onboarding flow added for project setup, speech provider configuration, and developer-tool detection
- project directory picker now auto-fills the project name from the selected folder while keeping manual override
- System surfaces now show inline versioning beside the product title and include direct GitHub entry points
- external link handling now falls back safely when an older preload bridge does not expose `openExternal`
- onboarding completion is persisted for new installs while existing installs are auto-marked complete during migration

## 0.1.2 - 2026-03-22

Patch release for recent voice and Hero refinements.

Highlights:

- Hero runtime panel copy made tool-agnostic instead of feeling Codex-specific
- cancel action in the Hero runtime panel is now explicit and always visible during active work
- `vad_beta` thresholds and timing tuned to reduce false triggers and premature submission

## 0.1.1 - 2026-03-22

Small product release after the configurable voice-input pass and Claude Code runtime hardening.

Highlights:

- global `voiceInputMode` added with `classic` and `vad_beta`
- isolated beta capture engine added while keeping a shared downstream task pipeline
- Hero now shows the active voice-input mode
- speech defaults moved into a dedicated settings drawer
- Claude Code print-mode integration fixed for variadic `--add-dir` and `structured_output`
- voice-recognition and turn-pipeline maintenance docs updated for the new architecture

## 0.1.0 - 2026-03-22

Initial versioned baseline for the current multi-session desktop workspace.

Highlights:

- multi-session workspace with session switching, pinning, and archiving
- project profile management with per-session binding and working-directory context
- selectable developer-tool runtime with Codex, Claude Code, Cursor CLI, Gemini CLI, and Qwen Code support
- structured JSON execution flow for developer tools, including Cursor CLI trust and sandbox mapping
- configurable STT and TTS providers with runtime test hooks
- voice-driven task submission, local routing, diagnostics, and result playback controls
- technical documentation added for turn pipeline and voice-recognition/VAD maintenance

Versioning note:

- product version is sourced from `package.json`
- optional build metadata can be appended through `VOICE_AGENT_BUILD_SUFFIX`
