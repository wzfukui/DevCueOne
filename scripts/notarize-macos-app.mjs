import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const PROJECT_ROOT = process.cwd()

function printUsage() {
  console.log(`DevCueOne notarization helper

Usage:
  npm run notarize:mac:app -- <app-path> [--zip <zip-path>] [--log <log-path>]

Example:
  npm run notarize:mac:app -- release/mac-arm64/DevCueOne.app
`)
}

export function parseOptions(argv) {
  let appPath = null
  let logPath = null
  let zipPath = null

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') {
      return { appPath: null, help: true, logPath: null, zipPath: null }
    }

    if (token === '--zip') {
      zipPath = argv[index + 1] ?? null
      index += 1
      continue
    }

    if (token === '--log') {
      logPath = argv[index + 1] ?? null
      index += 1
      continue
    }

    if (!token.startsWith('--') && appPath === null) {
      appPath = token
    }
  }

  return {
    appPath,
    help: false,
    logPath,
    zipPath,
  }
}

export function resolveNotaryEnvironment(env) {
  const keyPath = env.VOICE_AGENT_NOTARY_KEY_PATH || env.APPLE_API_KEY
  const keyId = env.VOICE_AGENT_NOTARY_KEY_ID || env.APPLE_API_KEY_ID
  const issuer = env.VOICE_AGENT_NOTARY_ISSUER || env.APPLE_API_ISSUER

  if (![keyPath, keyId, issuer].every(Boolean)) {
    throw new Error(
      'Notarization requires VOICE_AGENT_NOTARY_KEY_PATH, VOICE_AGENT_NOTARY_KEY_ID, and VOICE_AGENT_NOTARY_ISSUER (or the equivalent APPLE_API_* env vars).',
    )
  }

  if (!existsSync(keyPath)) {
    throw new Error(`Notarization key file was not found: ${keyPath}`)
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
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env || process.env,
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

async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  if (!options.appPath) {
    throw new Error('Missing app path. Example: npm run notarize:mac:app -- release/mac-arm64/DevCueOne.app')
  }

  const absoluteAppPath = path.resolve(PROJECT_ROOT, options.appPath)
  if (!existsSync(absoluteAppPath)) {
    throw new Error(`App bundle was not found: ${absoluteAppPath}`)
  }

  const appBaseName = path.basename(absoluteAppPath, '.app')
  const zipPath =
    options.zipPath !== null
      ? path.resolve(PROJECT_ROOT, options.zipPath)
      : path.join(path.dirname(absoluteAppPath), `${appBaseName}-notary.zip`)
  const logPath =
    options.logPath !== null
      ? path.resolve(PROJECT_ROOT, options.logPath)
      : path.join(path.dirname(absoluteAppPath), `${appBaseName}-notary-log.json`)

  const notary = resolveNotaryEnvironment(process.env)

  await runCommand('ditto', [
    '-c',
    '-k',
    '--sequesterRsrc',
    '--keepParent',
    absoluteAppPath,
    zipPath,
  ])

  const submitResult = await runCommand(
    'xcrun',
    [
      'notarytool',
      'submit',
      zipPath,
      '--key',
      notary.keyPath,
      '--key-id',
      notary.keyId,
      '--issuer',
      notary.issuer,
      '--output-format',
      'json',
    ],
    { quiet: true },
  )

  const submission = JSON.parse(submitResult.stdout)
  if (!submission.id) {
    throw new Error('Notary submission did not return a submission id.')
  }

  let finalStatus
  try {
    const waitResult = await runCommand(
      'xcrun',
      [
        'notarytool',
        'wait',
        submission.id,
        '--key',
        notary.keyPath,
        '--key-id',
        notary.keyId,
        '--issuer',
        notary.issuer,
        '--output-format',
        'json',
      ],
      { quiet: true },
    )

    finalStatus = JSON.parse(waitResult.stdout)
  } catch {
    const infoResult = await runCommand(
      'xcrun',
      [
        'notarytool',
        'info',
        submission.id,
        '--key',
        notary.keyPath,
        '--key-id',
        notary.keyId,
        '--issuer',
        notary.issuer,
        '--output-format',
        'json',
      ],
      { quiet: true },
    )

    finalStatus = JSON.parse(infoResult.stdout)
  }

  if (finalStatus.status !== 'Accepted') {
    await runCommand('xcrun', [
      'notarytool',
      'log',
      submission.id,
      logPath,
      '--key',
      notary.keyPath,
      '--key-id',
      notary.keyId,
      '--issuer',
      notary.issuer,
    ])

    throw new Error(
      `Notarization failed with status ${finalStatus.status}. See ${path.relative(PROJECT_ROOT, logPath)}.`,
    )
  }

  await runCommand('xcrun', ['stapler', 'staple', absoluteAppPath])

  console.log(JSON.stringify({
    appPath: path.relative(PROJECT_ROOT, absoluteAppPath),
    logPath: path.relative(PROJECT_ROOT, logPath),
    status: finalStatus.status,
    submissionId: submission.id,
    zipPath: path.relative(PROJECT_ROOT, zipPath),
  }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nNotarization failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
