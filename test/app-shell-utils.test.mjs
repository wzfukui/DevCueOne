import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APP_DISPLAY_NAME,
  DEFAULT_THEME_PRESET,
  buildSessionIdentifierCopyPayload,
  normalizeAppDisplayName,
  normalizeThemePreset,
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
