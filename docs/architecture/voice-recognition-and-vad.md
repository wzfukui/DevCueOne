# Voice Recognition And VAD Notes

## Purpose

This document explains the current voice-input architecture in DevCue One after the configurable voice-mode pass.

It focuses on:

- the two renderer-side capture engines
- how `voiceInputMode` changes runtime behavior
- what is shared downstream and what is intentionally isolated
- where the UI now exposes the active mode
- what still counts as heuristic VAD versus production-grade VAD

For the broader task pipeline and project-profile flow, see `./turn-pipeline-and-project-profile-context.md`.

## Current Runtime Scope

Primary files:

- `src/App.tsx`
- `src/useVoiceLoop.ts`
- `src/useVadVoiceLoop.ts`
- `src/types.ts`
- `electron/main.mjs`
- `electron/voice-heuristics.mjs`

## 1. What Changed In This Pass

This pass introduced a dual-mode voice-input architecture.

### 1.1 New Global Setting

`DesktopSettings` now contains:

- `voiceInputMode: 'classic' | 'vad_beta'`

Current default:

- `classic`

This is a global runtime setting, not a per-project or per-session field.

### 1.2 Two Capture Engines

DevCue One now has two renderer-side voice engines:

- `src/useVoiceLoop.ts`
  - the legacy classic mode
  - analyser RMS + `MediaRecorder`
- `src/useVadVoiceLoop.ts`
  - the new beta path
  - PCM capture + resampling + pre-roll + WAV emission

### 1.3 Shared Downstream

Only the browser-side capture and segmentation differ.

The downstream path is still shared:

```text
capture engine
  -> utterance blob
  -> submitVoiceTurn(...)
  -> Electron task queue
  -> transcribeAudio(...)
  -> transcript acceptance
  -> local routing or developer tool
```

This is intentional. It keeps comparison easier and avoids duplicating task, routing, and tool-execution logic.

### 1.4 UI Surface Changes

This pass also changed the configuration surface:

- Hero now shows the active voice mode directly
- speech defaults no longer live inside the generic global-settings form
- a dedicated settings drawer now exists:
  - `Voice Workspace / 语音输入与默认方案`

## 2. Runtime Modes

## 2.1 Classic Mode

Classic mode remains the stability-first path.

File:

- `src/useVoiceLoop.ts`

Current behavior:

- requests microphone access with browser DSP enabled
- uses `AnalyserNode` RMS thresholds
- keeps a calibration window
- confirms speech after a minimum candidate duration
- records utterances with `MediaRecorder`
- emits compressed browser-native blobs such as `audio/webm`

This path is still the default because it is the most battle-tested code path in the app.

## 2.2 VAD Beta Mode

VAD Beta is a separate renderer-side capture path.

File:

- `src/useVadVoiceLoop.ts`

Current behavior:

- requests microphone access with the same browser DSP flags
- captures raw PCM with `ScriptProcessorNode`
- resamples audio to `16k` mono
- keeps a rolling pre-roll buffer
- runs a lightweight state-machine segmentation pass
- encodes the utterance as `audio/wav`

Current important constants:

- target sample rate: `16000`
- script processor buffer: `2048`
- pre-roll window: `420ms`
- speech start confirmation: `140ms`
- silence stop window: `900ms`
- minimum segment duration: `450ms`
- minimum voiced duration: `260ms`

Important caveat:

- this is not yet a model-based VAD
- it is still heuristic segmentation
- the value of this pass is isolation, observability, and better pre-roll handling

## 3. Renderer-Side Selection Logic

`src/App.tsx` now mounts both hooks but only enables one at runtime:

- `useVoiceLoop(...)` when `voiceInputMode === 'classic'`
- `useVadVoiceLoop(...)` when `voiceInputMode === 'vad_beta'`

This keeps React hook order stable while still isolating the runtime behavior.

The active mode is derived from saved settings, not just the unsaved draft.

That means:

- switching the select box alone does not immediately change live capture
- the new mode becomes active after the settings are saved

This avoids a class of confusing "draft changed but runtime did not really switch" bugs.

## 4. Submission Payload And Main-Process Handoff

When the renderer emits an utterance:

1. `src/App.tsx` converts the blob to base64
2. it calls `desktopAgent.submitVoiceTurn(...)`
3. the payload includes:
   - `sessionId`
   - `audioBase64`
   - `mimeType`
   - `pendingText`
   - `captureMode`

`captureMode` is then preserved in Electron runtime metadata.

This makes it possible to compare classic mode versus VAD Beta later in logs and event traces.

## 5. Shared Downstream Behavior

After the utterance reaches Electron:

1. `submitVoiceTurn(payload)` resolves session + bound profile + effective settings
2. the voice task is queued
3. `processVoiceTurn(runtime)` calls `transcribeAudio(...)`
4. transcript acceptance still uses the same heuristics
5. accepted voice turns still become regular text turns internally

Nothing about:

- task queueing
- local command routing
- project binding
- developer-tool execution
- playback

was split into a second implementation.

That is the core of the "dual engine, single downstream" design.

## 6. Current UI Surface

## 6.1 Hero

Hero now exposes the active voice mode next to:

- bound project label
- current working language

The goal is to make the current voice-input strategy visible before the user starts speaking.

## 6.2 Settings Workspace

The voice controls were moved out of the generic global-settings stack.

Current settings entry order:

1. `全局设置`
2. `语音输入与默认方案`
3. `开发工具`
4. `STT 配置库`
5. `TTS 配置库`
6. `主题风格`

Inside the speech drawer, the layout is intentionally split into:

- input strategy
- default speech services
- chain relationship note

This separation exists to reduce crowding and clarify which fields control:

- capture behavior
- default STT choice
- default TTS choice

## 7. Event Logging

Voice-related event payloads now include `captureMode` where relevant.

Current key events:

- `user_input`
- `transcribe_done`
- `voice_short_ignored`
- `voice_intent_ready`

This makes mode-specific debugging possible without duplicating the rest of the task pipeline.

## 8. Tuning Map

## 8.1 Classic Mode Tuning

Start in:

- `src/useVoiceLoop.ts`

Typical constants:

- `START_THRESHOLD_*`
- `END_THRESHOLD_*`
- `MIN_SPEECH_START_MS`
- `SILENCE_AFTER_SPEECH_MS`
- `MIN_SEGMENT_MS`
- `MIN_VOICED_MS`

## 8.2 VAD Beta Tuning

Start in:

- `src/useVadVoiceLoop.ts`

Typical constants:

- `TARGET_SAMPLE_RATE`
- `PRE_ROLL_MS`
- `MIN_SPEECH_START_MS`
- `SILENCE_AFTER_SPEECH_MS`
- `MIN_SEGMENT_MS`
- `MIN_VOICED_MS`
- `START_THRESHOLD_*`
- `END_THRESHOLD_*`

If VAD Beta clips too early or ends too late, this is the first file to inspect.

## 9. Known Limitations

Current VAD Beta is intentionally safer than the failed continuous-`MediaRecorder` pre-roll attempt, but it is still not production-grade VAD.

Known limitations:

- `ScriptProcessorNode` is a practical compatibility choice, not the ideal long-term API
- segmentation still depends on RMS heuristics
- browser DSP (`echoCancellation`, `noiseSuppression`, `autoGainControl`) can still distort weak speech onsets
- the mode has compile coverage, but real microphone regression still depends on manual testing

## 10. Production-Grade Roadmap

The recommended path still remains:

1. move beta capture from `ScriptProcessorNode` to `AudioWorklet`
2. keep the PCM + ring-buffer architecture
3. replace heuristic frame decisions with WebRTC VAD first
4. add mode-specific metrics such as:
   - onset clipping
   - false trigger rate
   - ignored short transcript rate
   - segment duration distribution
5. only consider a heavier neural VAD path such as Silero after real data proves WebRTC VAD is not enough

In other words:

- current `vad_beta` is a product architecture step
- production-grade VAD is still a future algorithmic step

## 11. Maintenance Summary

If a future change request says:

- "show the current mode in UI"
  - start in `src/App.tsx`
- "change which mode is default"
  - start in `src/App.tsx`, `electron/main.mjs`, and `src/types.ts`
- "change beta segmentation behavior"
  - start in `src/useVadVoiceLoop.ts`
- "compare classic vs beta outcomes"
  - inspect Electron event payloads in `electron/main.mjs`

That separation is the main design win of this pass.
