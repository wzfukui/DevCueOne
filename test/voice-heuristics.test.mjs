import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MIN_VOICE_TRANSCRIPT_CHARS,
  evaluateVoiceTranscript,
  isLikelyImmediateVoiceCommand,
} from '../electron/voice-heuristics.mjs'

test('short noise is ignored by default', () => {
  const result = evaluateVoiceTranscript('收到')
  assert.equal(result.accepted, false)
  assert.equal(result.reason, 'too_short')
  assert.equal(result.chars <= MIN_VOICE_TRANSCRIPT_CHARS, true)
})

test('short workspace voice command is allowed', () => {
  const result = evaluateVoiceTranscript('切到会话 Proxy 排查')
  assert.equal(result.accepted, true)
  assert.equal(result.route, 'local')
  assert.equal(result.reason, 'local_command')
})

test('short local shortcut is allowed', () => {
  assert.equal(isLikelyImmediateVoiceCommand('打开浏览器'), true)
  const result = evaluateVoiceTranscript('打开浏览器')
  assert.equal(result.accepted, true)
  assert.equal(result.route, 'local')
})

test('short transcript with pending text can still go to codex', () => {
  const result = evaluateVoiceTranscript(
    '帮我看看',
    'https://example.com/api/orders\n/workspace/project-beta',
  )
  assert.equal(result.accepted, true)
  assert.equal(result.route, 'codex')
  assert.equal(result.reason, 'has_pending_text')
})

test('long transcript goes to codex', () => {
  const result = evaluateVoiceTranscript('帮我看一下当前仓库里有没有未提交的改动')
  assert.equal(result.accepted, true)
  assert.equal(result.route, 'codex')
  assert.equal(result.reason, 'ready')
})
