import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  parseOptions,
  resolveNotaryEnvironment,
} from '../scripts/notarize-macos-app.mjs'

test('notarization helper parses paths and flags', () => {
  const parsed = parseOptions([
    'release/mac-arm64/DevCueOne.app',
    '--zip',
    'release/tmp.zip',
    '--log',
    'release/notary-log.json',
  ])

  assert.deepEqual(parsed, {
    appPath: 'release/mac-arm64/DevCueOne.app',
    help: false,
    logPath: 'release/notary-log.json',
    zipPath: 'release/tmp.zip',
  })
})

test('notarization helper resolves environment variables', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'notary-helper-test-'))
  const keyPath = path.join(tempDir, 'AuthKey_TEST123456.p8')
  writeFileSync(keyPath, 'dummy')

  const resolved = resolveNotaryEnvironment({
    VOICE_AGENT_NOTARY_KEY_PATH: keyPath,
    VOICE_AGENT_NOTARY_KEY_ID: 'TEST123456',
    VOICE_AGENT_NOTARY_ISSUER: '11111111-2222-3333-4444-555555555555',
  })

  assert.deepEqual(resolved, {
    issuer: '11111111-2222-3333-4444-555555555555',
    keyId: 'TEST123456',
    keyPath,
  })
})

test('notarization helper rejects incomplete credentials', () => {
  assert.throws(
    () =>
      resolveNotaryEnvironment({
        VOICE_AGENT_NOTARY_KEY_PATH: '/tmp/AuthKey_TEST123456.p8',
      }),
    /Notarization requires/,
  )
})
