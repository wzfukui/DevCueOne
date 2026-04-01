import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  detectCurrentPlatformFlag,
  ensureSupportedNode,
  parseCodeSigningIdentities,
  parseOptions,
  resolveArchitectureFlags,
  resolveGenericMacArtifactCopies,
  resolveSigningEnvironment,
  sanitizeCodeSigningIdentity,
  syncGenericMacArtifacts,
} from '../scripts/release-build.mjs'

test('release helper parses platform and skip flags', () => {
  const parsed = parseOptions([
    '--mac',
    '--arm64',
    '--dir',
    '--skip-tests',
    '--skip-build',
    '--allow-dirty',
  ])

  assert.deepEqual(parsed, {
    allowDirty: true,
    architectures: ['arm64'],
    dir: true,
    help: false,
    platforms: ['mac'],
    skipBuild: true,
    skipLint: false,
    skipTests: true,
  })
})

test('release helper resolves current platform flag', () => {
  assert.equal(detectCurrentPlatformFlag('darwin'), '--mac')
  assert.equal(detectCurrentPlatformFlag('win32'), '--win')
  assert.equal(detectCurrentPlatformFlag('linux'), '--linux')
})

test('release helper defaults mac builds to arm64 and x64', () => {
  assert.deepEqual(resolveArchitectureFlags(['--mac'], []), ['--arm64', '--x64'])
})

test('release helper respects explicit architecture selection', () => {
  assert.deepEqual(resolveArchitectureFlags(['--mac'], ['x64']), ['--x64'])
  assert.deepEqual(resolveArchitectureFlags(['--win'], []), [])
})

test('release helper derives generic mac artifact aliases from the versioned names', () => {
  assert.deepEqual(resolveGenericMacArtifactCopies('0.4.4'), [
    {
      sourceFileName: 'DevCue.One-0.4.4-mac-arm64.dmg',
      targetFileName: 'DevCue.One-mac-arm64.dmg',
    },
    {
      sourceFileName: 'DevCue.One-0.4.4-mac-arm64.zip',
      targetFileName: 'DevCue.One-mac-arm64.zip',
    },
    {
      sourceFileName: 'DevCue.One-0.4.4-mac-x64.dmg',
      targetFileName: 'DevCue.One-mac-x64.dmg',
    },
    {
      sourceFileName: 'DevCue.One-0.4.4-mac-x64.zip',
      targetFileName: 'DevCue.One-mac-x64.zip',
    },
  ])
})

test('release helper copies generic mac artifacts for website downloads', async () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'release-artifacts-'))
  const versionedDmgPath = path.join(releaseDir, 'DevCue.One-0.4.4-mac-arm64.dmg')
  writeFileSync(versionedDmgPath, 'arm64-dmg')

  const copiedArtifacts = await syncGenericMacArtifacts(releaseDir, '0.4.4')
  const genericDmgPath = path.join(releaseDir, 'DevCue.One-mac-arm64.dmg')

  assert.equal(existsSync(genericDmgPath), true)
  assert.equal(readFileSync(genericDmgPath, 'utf8'), 'arm64-dmg')
  assert.deepEqual(
    copiedArtifacts.map((artifact) => path.basename(artifact.targetPath)),
    ['DevCue.One-mac-arm64.dmg'],
  )
})

test('release helper sanitizes Developer ID identity names', () => {
  assert.equal(
    sanitizeCodeSigningIdentity('Developer ID Application: Example Company Co., Ltd. (TEAM123456)'),
    'Example Company Co., Ltd. (TEAM123456)',
  )
})

test('release helper parses code-signing identity output', () => {
  const parsed = parseCodeSigningIdentities(`
  1) ABCDEF1234567890 "Developer ID Application: Example Company Co., Ltd. (TEAM123456)"
  2) 1234567890ABCDEF "Apple Development: Kui Fu (8UB5LQNT2J)"
`)

  assert.deepEqual(parsed, [
    'Developer ID Application: Example Company Co., Ltd. (TEAM123456)',
    'Apple Development: Kui Fu (8UB5LQNT2J)',
  ])
})

test('release helper disables signing auto-discovery unless explicitly enabled', () => {
  const resolved = resolveSigningEnvironment({}, [])

  assert.equal(resolved.signingEnabled, false)
  assert.equal(resolved.builderEnv.CSC_IDENTITY_AUTO_DISCOVERY, 'false')
})

test('release helper requires explicit identity when multiple Developer ID certs are installed', () => {
  assert.throws(
    () =>
      resolveSigningEnvironment(
        { VOICE_AGENT_ENABLE_SIGNING: '1' },
        [
          'Developer ID Application: Another Example Company Co., Ltd. (TEAM654321)',
          'Developer ID Application: Example Company Co., Ltd. (TEAM123456)',
        ],
      ),
    /Multiple Developer ID Application certificates were found/,
  )
})

test('release helper maps signing and notarization env vars', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'release-build-test-'))
  const notaryKeyPath = path.join(tempDir, 'AuthKey_12345ABCDE.p8')
  writeFileSync(notaryKeyPath, 'dummy')

  const resolved = resolveSigningEnvironment(
    {
      VOICE_AGENT_ENABLE_SIGNING: '1',
      VOICE_AGENT_SIGNING_IDENTITY: 'Developer ID Application: Example Company Co., Ltd. (TEAM123456)',
      VOICE_AGENT_NOTARY_KEY_PATH: notaryKeyPath,
      VOICE_AGENT_NOTARY_KEY_ID: '12345ABCDE',
      VOICE_AGENT_NOTARY_ISSUER: '11111111-2222-3333-4444-555555555555',
    },
    ['Developer ID Application: Example Company Co., Ltd. (TEAM123456)'],
  )

  assert.equal(resolved.signingEnabled, true)
  assert.equal(resolved.notarizationEnabled, true)
  assert.equal(
    resolved.builderEnv.CSC_NAME,
    'Example Company Co., Ltd. (TEAM123456)',
  )
  assert.equal(resolved.builderEnv.APPLE_API_KEY, notaryKeyPath)
  assert.equal(resolved.builderEnv.APPLE_API_KEY_ID, '12345ABCDE')
  assert.equal(
    resolved.builderEnv.APPLE_API_ISSUER,
    '11111111-2222-3333-4444-555555555555',
  )
})

test('release helper rejects partial notarization credentials', () => {
  assert.throws(
    () =>
      resolveSigningEnvironment(
        {
          VOICE_AGENT_ENABLE_SIGNING: '1',
          VOICE_AGENT_SIGNING_IDENTITY: 'Example Company Co., Ltd. (TEAM123456)',
          VOICE_AGENT_NOTARY_KEY_PATH: '/tmp/AuthKey_12345.p8',
        },
        ['Developer ID Application: Example Company Co., Ltd. (TEAM123456)'],
      ),
    /Notarization requires/,
  )
})

test('release helper enforces Node 22+', () => {
  assert.doesNotThrow(() => ensureSupportedNode('22.22.1'))
  assert.throws(
    () => ensureSupportedNode('20.19.2'),
    /Release automation requires Node\.js 22\+/,
  )
})
