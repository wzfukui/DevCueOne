import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isSigningEnabled,
  normalizeMacReleaseArgs,
  parseOptions,
  resolveOptionalNotaryCredentials,
} from '../scripts/release-macos-local.mjs'

test('mac release wrapper parses wrapper-only flags and forwards the rest', () => {
  const parsed = parseOptions([
    '--arm64',
    '--skip-tests',
    '--skip-preflight',
    '--skip-post-verify',
  ])

  assert.deepEqual(parsed, {
    forwardArgs: ['--arm64', '--skip-tests'],
    help: false,
    skipPostVerify: true,
    skipPreflight: true,
  })
})

test('mac release wrapper injects --mac by default', () => {
  assert.deepEqual(
    normalizeMacReleaseArgs(['--arm64', '--skip-tests']),
    ['--mac', '--arm64', '--skip-tests'],
  )
})

test('mac release wrapper keeps explicit --mac flag', () => {
  assert.deepEqual(
    normalizeMacReleaseArgs(['--mac', '--x64']),
    ['--mac', '--x64'],
  )
})

test('mac release wrapper rejects non-mac platform flags', () => {
  assert.throws(
    () => normalizeMacReleaseArgs(['--win']),
    /only supports macOS packaging/,
  )
})

test('mac release wrapper detects whether signing is enabled', () => {
  assert.equal(isSigningEnabled({}), false)
  assert.equal(isSigningEnabled({ VOICE_AGENT_ENABLE_SIGNING: '0' }), false)
  assert.equal(isSigningEnabled({ VOICE_AGENT_ENABLE_SIGNING: '1' }), true)
})

test('mac release wrapper treats missing notarization credentials as optional', () => {
  assert.equal(resolveOptionalNotaryCredentials({}), null)
})

test('mac release wrapper rejects partial notarization credentials', () => {
  assert.throws(
    () =>
      resolveOptionalNotaryCredentials({
        VOICE_AGENT_NOTARY_KEY_PATH: '/tmp/AuthKey_TEST123456.p8',
      }),
    /Partial notarization credentials found/,
  )
})

test('mac release wrapper resolves complete notarization credentials', () => {
  assert.deepEqual(
    resolveOptionalNotaryCredentials({
      VOICE_AGENT_NOTARY_KEY_PATH: '/tmp/AuthKey_TEST123456.p8',
      VOICE_AGENT_NOTARY_KEY_ID: 'TEST123456',
      VOICE_AGENT_NOTARY_ISSUER: '11111111-2222-3333-4444-555555555555',
    }),
    {
      issuer: '11111111-2222-3333-4444-555555555555',
      keyId: 'TEST123456',
      keyPath: '/tmp/AuthKey_TEST123456.p8',
    },
  )
})
