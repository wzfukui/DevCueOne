import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ensureSupportedNode } from './release-build.mjs'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(SCRIPT_PATH)
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..')
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release')
const APP_NAME = 'DevCueOne.app'

function printUsage() {
  console.log(`DevCueOne macOS release wrapper

Usage:
  npm run release:mac:local -- [release-build flags] [--skip-preflight] [--skip-post-verify]

Examples:
  npm run release:mac:local
  npm run release:mac:local -- --arm64
  npm run release:mac:local -- --skip-tests
  npm run release:mac:local -- --skip-preflight --allow-dirty
`)
}

export function parseOptions(argv) {
  const forwardArgs = []
  let help = false
  let skipPostVerify = false
  let skipPreflight = false

  for (const token of argv) {
    if (token === '--help' || token === '-h') {
      help = true
      continue
    }

    if (token === '--skip-preflight') {
      skipPreflight = true
      continue
    }

    if (token === '--skip-post-verify') {
      skipPostVerify = true
      continue
    }

    forwardArgs.push(token)
  }

  return {
    forwardArgs,
    help,
    skipPostVerify,
    skipPreflight,
  }
}

export function normalizeMacReleaseArgs(args) {
  const platformFlags = args.filter((token) => ['--mac', '--win', '--linux'].includes(token))
  if (platformFlags.some((token) => token !== '--mac')) {
    throw new Error('release:mac:local only supports macOS packaging. Remove non-mac platform flags.')
  }

  if (platformFlags.length > 0) {
    return args
  }

  return ['--mac', ...args]
}

export function isSigningEnabled(env) {
  return env.VOICE_AGENT_ENABLE_SIGNING === '1'
}

export function resolveOptionalNotaryCredentials(env) {
  const keyPath = env.VOICE_AGENT_NOTARY_KEY_PATH || env.APPLE_API_KEY || null
  const keyId = env.VOICE_AGENT_NOTARY_KEY_ID || env.APPLE_API_KEY_ID || null
  const issuer = env.VOICE_AGENT_NOTARY_ISSUER || env.APPLE_API_ISSUER || null
  const values = [keyPath, keyId, issuer]
  const hasAny = values.some(Boolean)
  const hasAll = values.every(Boolean)

  if (hasAny && !hasAll) {
    throw new Error(
      'Partial notarization credentials found. Set VOICE_AGENT_NOTARY_KEY_PATH, VOICE_AGENT_NOTARY_KEY_ID, and VOICE_AGENT_NOTARY_ISSUER together.',
    )
  }

  if (!hasAll) {
    return null
  }

  return {
    issuer,
    keyId,
    keyPath,
  }
}

async function runCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      if (!options.quiet) {
        process.stdout.write(text)
      }
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      if (!options.quiet) {
        process.stderr.write(text)
      }
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stderr, stdout })
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

async function collectMacAppBundles(rootDir) {
  const matches = []

  async function walk(currentDir) {
    if (!existsSync(currentDir)) {
      return
    }

    const entries = await readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === APP_NAME && absolutePath.includes(`${path.sep}mac`)) {
          matches.push(absolutePath)
          continue
        }

        await walk(absolutePath)
      }
    }
  }

  await walk(rootDir)
  return matches.sort((left, right) => left.localeCompare(right))
}

async function runSigningPreflight(env) {
  if (!isSigningEnabled(env)) {
    console.log('Signing disabled. Packaging will run as unsigned preview.')
    return { notarizationEnabled: false, signingEnabled: false }
  }

  console.log('Checking local code-signing identities...')
  await runCommand('security', ['find-identity', '-v', '-p', 'codesigning'])

  const notary = resolveOptionalNotaryCredentials(env)
  if (!notary) {
    console.log('Notary credentials not set. Packaging will skip notarization preflight.')
    return { notarizationEnabled: false, signingEnabled: true }
  }

  console.log('Checking Apple notarization credentials...')
  await runCommand('xcrun', [
    'notarytool',
    'history',
    '--key',
    notary.keyPath,
    '--key-id',
    notary.keyId,
    '--issuer',
    notary.issuer,
    '--output-format',
    'json',
  ])

  return { notarizationEnabled: true, signingEnabled: true }
}

async function verifySignedApps(appPaths, notarizationEnabled) {
  for (const appPath of appPaths) {
    const relativePath = path.relative(PROJECT_ROOT, appPath)
    console.log(`Verifying signed app: ${relativePath}`)
    await runCommand('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
    if (notarizationEnabled) {
      await runCommand('spctl', ['--assess', '--type', 'execute', '--verbose', appPath])
    }
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  ensureSupportedNode()

  if (process.platform !== 'darwin') {
    throw new Error('release:mac:local must run on macOS.')
  }

  const releaseArgs = normalizeMacReleaseArgs(options.forwardArgs)

  const preflight =
    options.skipPreflight
      ? { notarizationEnabled: false, signingEnabled: isSigningEnabled(process.env) }
      : await runSigningPreflight(process.env)

  await runCommand(process.execPath, [path.join(SCRIPT_DIR, 'release-build.mjs'), ...releaseArgs])

  if (options.skipPostVerify || !preflight.signingEnabled) {
    return
  }

  const appPaths = await collectMacAppBundles(RELEASE_DIR)
  if (appPaths.length === 0) {
    throw new Error('Packaging finished but no macOS app bundles were found under release/.')
  }

  await verifySignedApps(appPaths, preflight.notarizationEnabled)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nmacOS release wrapper failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
