import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APP_DISPLAY_NAME,
  appendPastedImagePaths,
  DEFAULT_THEME_PRESET,
  buildSessionIdentifierCopyPayload,
  buildPastedImagePathBlock,
  normalizeAppDisplayName,
  normalizeThemePreset,
  resolveSessionRuntimeDiagnostics,
  shouldShowOnboardingOverlay,
  shouldShowSessionListSkeleton,
} from '../src/app-shell-utils.js'

test('normalizeAppDisplayName maps legacy shell names to the product display name', () => {
  assert.equal(normalizeAppDisplayName('DevCueOne'), APP_DISPLAY_NAME)
  assert.equal(normalizeAppDisplayName('electron'), APP_DISPLAY_NAME)
  assert.equal(normalizeAppDisplayName(''), APP_DISPLAY_NAME)
  assert.equal(normalizeAppDisplayName('DevCue One Preview'), 'DevCue One Preview')
})

test('normalizeThemePreset keeps valid presets and falls back for unknown values', () => {
  assert.equal(normalizeThemePreset('ink_peony'), 'ink_peony')
  assert.equal(normalizeThemePreset('graphite_grove'), 'graphite_grove')
  assert.equal(normalizeThemePreset('unknown'), DEFAULT_THEME_PRESET)
  assert.equal(normalizeThemePreset(null), DEFAULT_THEME_PRESET)
})

test('shouldShowOnboardingOverlay waits until app state is ready', () => {
  assert.equal(
    shouldShowOnboardingOverlay({
      hasDesktopApi: true,
      phase: 'booting',
      appState: null,
      onboardingCompleted: false,
    }),
    false,
  )

  assert.equal(
    shouldShowOnboardingOverlay({
      hasDesktopApi: true,
      phase: 'ready',
      appState: {},
      onboardingCompleted: false,
    }),
    true,
  )

  assert.equal(
    shouldShowOnboardingOverlay({
      hasDesktopApi: true,
      phase: 'ready',
      appState: {},
      onboardingCompleted: true,
    }),
    false,
  )
})

test('buildSessionIdentifierCopyPayload includes runtime session id when present', () => {
  assert.deepEqual(
    buildSessionIdentifierCopyPayload({
      sessionId: 'session-1',
      runtimeSessionId: 'thread-9',
    }),
    {
      text: '会话 ID: session-1\n运行会话 ID: thread-9',
      successHint: '已复制会话与运行会话 ID。',
    },
  )

  assert.deepEqual(
    buildSessionIdentifierCopyPayload({
      sessionId: 'session-1',
      runtimeSessionId: '',
    }),
    {
      text: '会话 ID: session-1',
      successHint: '已复制会话 ID：session-1',
    },
  )

  assert.equal(
    buildSessionIdentifierCopyPayload({
      sessionId: '   ',
      runtimeSessionId: 'thread-9',
    }),
    null,
  )
})

test('buildPastedImagePathBlock formats one or more image paths for the prompt', () => {
  assert.equal(
    buildPastedImagePathBlock(['/tmp/pasted-image-1.png']),
    'Attached image path: /tmp/pasted-image-1.png',
  )

  assert.equal(
    buildPastedImagePathBlock(['/tmp/pasted-image-1.png', '/tmp/pasted-image-2.png']),
    'Attached image paths:\n- /tmp/pasted-image-1.png\n- /tmp/pasted-image-2.png',
  )
})

test('appendPastedImagePaths appends the generated image block after existing text', () => {
  assert.equal(
    appendPastedImagePaths('Check the current layout', ['/tmp/pasted-image-1.png']),
    'Check the current layout\n\nAttached image path: /tmp/pasted-image-1.png',
  )

  assert.equal(
    appendPastedImagePaths('   ', ['/tmp/pasted-image-1.png']),
    'Attached image path: /tmp/pasted-image-1.png',
  )
})

test('resolveSessionRuntimeDiagnostics prefers the latest task event snapshot over current settings', () => {
  const resolved = resolveSessionRuntimeDiagnostics({
    sessionId: 'session-1',
    codexThreadId: 'codex-thread-1',
    developerToolThreads: {
      claude_code: 'claude-thread-1',
      codex: 'codex-thread-1',
    },
    fallbackTool: 'claude_code',
    fallbackToolPath: '/usr/local/bin/claude',
    events: [
      {
        kind: 'task_result',
        payload: {
          backend: 'codex',
          threadId: 'codex-thread-2',
          toolPath: '/usr/local/bin/codex',
        },
      },
    ],
  })

  assert.deepEqual(resolved, {
    sessionId: 'session-1',
    provider: 'codex',
    threadId: 'codex-thread-2',
    toolPath: '/usr/local/bin/codex',
    source: 'task_result',
  })
})

test('resolveSessionRuntimeDiagnostics falls back to the selected tool when there is no task snapshot', () => {
  const resolved = resolveSessionRuntimeDiagnostics({
    sessionId: 'session-2',
    developerToolThreads: {
      claude_code: 'claude-thread-3',
    },
    fallbackTool: 'claude_code',
    fallbackToolPath: '/usr/local/bin/claude',
    events: [],
  })

  assert.deepEqual(resolved, {
    sessionId: 'session-2',
    provider: 'claude_code',
    threadId: 'claude-thread-3',
    toolPath: '/usr/local/bin/claude',
    source: 'fallback',
  })
})

test('shouldShowSessionListSkeleton only renders during desktop bootstrap before state is ready', () => {
  assert.equal(
    shouldShowSessionListSkeleton({
      hasDesktopApi: true,
      phase: 'booting',
      appState: null,
    }),
    true,
  )

  assert.equal(
    shouldShowSessionListSkeleton({
      hasDesktopApi: true,
      phase: 'ready',
      appState: {},
    }),
    false,
  )

  assert.equal(
    shouldShowSessionListSkeleton({
      hasDesktopApi: false,
      phase: 'booting',
      appState: null,
    }),
    false,
  )
})
