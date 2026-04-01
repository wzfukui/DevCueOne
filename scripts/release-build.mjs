import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const PROJECT_ROOT = process.cwd()
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release')
const MIN_NODE_MAJOR = 22

function printUsage() {
  console.log(`DevCueOne release helper

Usage:
  npm run release:local -- [--dir] [--mac|--win|--linux] [--arm64|--x64|--universal] [--skip-lint] [--skip-tests] [--skip-build] [--allow-dirty]

Examples:
  npm run release:local
  npm run release:local -- --dir
  npm run release:local -- --mac --skip-tests
  npm run release:local -- --mac --x64 --skip-tests
`)
}

export function parseOptions(argv) {
  const flags = new Set(argv)
  const platforms = ['mac', 'win', 'linux'].filter((platform) => flags.has(`--${platform}`))
  const architectures = ['arm64', 'x64', 'universal'].filter((arch) => flags.has(`--${arch}`))

  return {
    allowDirty: flags.has('--allow-dirty'),
    architectures,
    dir: flags.has('--dir'),
    help: flags.has('--help') || flags.has('-h'),
    platforms,
    skipBuild: flags.has('--skip-build'),
    skipLint: flags.has('--skip-lint'),
    skipTests: flags.has('--skip-tests'),
  }
}

export function detectCurrentPlatformFlag(platform = process.platform) {
  switch (platform) {
    case 'darwin':
      return '--mac'
    case 'win32':
      return '--win'
    default:
      return '--linux'
  }
}

export function resolveArchitectureFlags(
  platformFlags,
  architectures,
) {
  if (architectures.length > 0) {
    return architectures.map((arch) => `--${arch}`)
  }

  if (platformFlags.length === 1 && platformFlags[0] === '--mac') {
    return ['--arm64', '--x64']
  }

  return []
}

export function sanitizeCodeSigningIdentity(identity) {
  return identity.replace(/^Developer ID Application:\s*/, '').trim()
}

export function resolveGenericMacArtifactCopies(version) {
  return ['arm64', 'x64'].flatMap((arch) =>
    ['dmg', 'zip'].map((ext) => ({
      sourceFileName: `DevCue.One-${version}-mac-${arch}.${ext}`,
      targetFileName: `DevCue.One-mac-${arch}.${ext}`,
    })),
  )
}

export function parseCodeSigningIdentities(output) {
  return output
    .split('\n')
    .map((line) => line.match(/"(.+)"/)?.[1] ?? null)
    .filter((identity) => identity !== null)
}

async function getDeveloperIdApplicationIdentities() {
  let output = ''
  await new Promise((resolve, reject) => {
    const child = spawn('security', ['find-identity', '-v', '-p', 'codesigning'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
    })

    child.on('error', reject)
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      reject(new Error(`security find-identity exited with code ${code}`))
    })
  })

  return parseCodeSigningIdentities(output).filter((identity) =>
    identity.startsWith('Developer ID Application: '),
  )
}

export function resolveSigningEnvironment(env, availableDeveloperIdIdentities = []) {
  const builderEnv = {
    ...env,
  }

  if (env.VOICE_AGENT_ENABLE_SIGNING !== '1') {
    builderEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    return {
      builderEnv,
      notarizationEnabled: false,
      selectedIdentity: null,
      signingEnabled: false,
    }
  }

  if (availableDeveloperIdIdentities.length === 0) {
    throw new Error(
      'VOICE_AGENT_ENABLE_SIGNING=1 but no Developer ID Application certificates were found in Keychain Access.',
    )
  }

  const requestedIdentity = env.VOICE_AGENT_SIGNING_IDENTITY || env.CSC_NAME
  const normalizedIdentity = requestedIdentity ? sanitizeCodeSigningIdentity(requestedIdentity) : null

  if (!normalizedIdentity && availableDeveloperIdIdentities.length > 1) {
    throw new Error(
      'Multiple Developer ID Application certificates were found. Set VOICE_AGENT_SIGNING_IDENTITY to the exact company identity (without the "Developer ID Application:" prefix).',
    )
  }

  if (normalizedIdentity) {
    const matchingIdentity = availableDeveloperIdIdentities.find((identity) =>
      identity.includes(normalizedIdentity),
    )
    if (!matchingIdentity) {
      throw new Error(
        `Requested signing identity "${normalizedIdentity}" was not found among installed Developer ID Application certificates.`,
      )
    }

    builderEnv.CSC_NAME = normalizedIdentity
  }

  delete builderEnv.CSC_IDENTITY_AUTO_DISCOVERY

  const notaryKeyPath = env.VOICE_AGENT_NOTARY_KEY_PATH || env.APPLE_API_KEY
  const notaryKeyId = env.VOICE_AGENT_NOTARY_KEY_ID || env.APPLE_API_KEY_ID
  const notaryIssuer = env.VOICE_AGENT_NOTARY_ISSUER || env.APPLE_API_ISSUER
  const hasAnyNotaryCredential = [notaryKeyPath, notaryKeyId, notaryIssuer].some(Boolean)
  const hasFullNotaryCredentialSet = [notaryKeyPath, notaryKeyId, notaryIssuer].every(Boolean)

  if (hasAnyNotaryCredential && !hasFullNotaryCredentialSet) {
    throw new Error(
      'Notarization requires VOICE_AGENT_NOTARY_KEY_PATH, VOICE_AGENT_NOTARY_KEY_ID, and VOICE_AGENT_NOTARY_ISSUER (or the equivalent APPLE_API_* env vars).',
    )
  }

  if (notaryKeyPath && !existsSync(notaryKeyPath)) {
    throw new Error(`Notarization key file was not found: ${notaryKeyPath}`)
  }

  if (hasFullNotaryCredentialSet) {
    builderEnv.APPLE_API_KEY = notaryKeyPath
    builderEnv.APPLE_API_KEY_ID = notaryKeyId
    builderEnv.APPLE_API_ISSUER = notaryIssuer
  }

  return {
    builderEnv,
    notarizationEnabled: hasFullNotaryCredentialSet,
    selectedIdentity: normalizedIdentity,
    signingEnabled: true,
  }
}

function getElectronBuilderBin() {
  return path.join(
    PROJECT_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder',
  )
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: options.env || process.env,
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

export function ensureSupportedNode(version = process.versions.node) {
  const major = Number.parseInt(version.split('.')[0] || '0', 10)
  if (major >= MIN_NODE_MAJOR) {
    return
  }

  throw new Error(
    `Release automation requires Node.js ${MIN_NODE_MAJOR}+ (current: ${version}).`,
  )
}

async function ensureCleanGitTree(allowDirty) {
  if (allowDirty) {
    return
  }

  let output = ''
  await new Promise((resolve, reject) => {
    const child = spawn('git', ['status', '--short'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
    })

    child.on('error', reject)
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      reject(new Error(`git status exited with code ${code}`))
    })
  })

  if (output.trim()) {
    throw new Error('Git worktree is dirty. Commit or stash changes first, or rerun with --allow-dirty.')
  }
}

async function collectArtifacts(rootDir) {
  if (!existsSync(rootDir)) {
    return []
  }

  const entries = await readdir(rootDir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(rootDir, entry.name)
      if (entry.isDirectory()) {
        return collectArtifacts(absolutePath)
      }

      const fileStat = await stat(absolutePath)
      return [
        {
          relativePath: path.relative(PROJECT_ROOT, absolutePath),
          sizeMb: (fileStat.size / (1024 * 1024)).toFixed(2),
        },
      ]
    }),
  )

  return files.flat().sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

async function readPackageVersion() {
  const packageJson = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8'))
  return String(packageJson.version || '').trim()
}

export async function syncGenericMacArtifacts(rootDir, version) {
  if (!version) {
    return []
  }

  const copiedArtifacts = []
  for (const artifact of resolveGenericMacArtifactCopies(version)) {
    const sourcePath = path.join(rootDir, artifact.sourceFileName)
    if (!existsSync(sourcePath)) {
      continue
    }

    const targetPath = path.join(rootDir, artifact.targetFileName)
    await copyFile(sourcePath, targetPath)
    copiedArtifacts.push({
      sourcePath,
      targetPath,
    })
  }

  return copiedArtifacts
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  ensureSupportedNode()
  await ensureCleanGitTree(options.allowDirty)

  if (!options.skipLint) {
    await runCommand(getNpmCommand(), ['run', 'lint'])
  }

  if (!options.skipTests) {
    await runCommand(getNpmCommand(), ['test'])
  }

  if (!options.skipBuild) {
    await runCommand(getNpmCommand(), ['run', 'build'])
  }

  const builderBin = getElectronBuilderBin()
  if (!existsSync(builderBin)) {
    throw new Error('electron-builder is not installed. Run npm install first.')
  }
  const packageVersion = await readPackageVersion()

  const builderArgs = ['--config', 'electron-builder.yml', '--publish', 'never']
  if (options.dir) {
    builderArgs.push('--dir')
  }

  const platformFlags =
    options.platforms.length > 0 ? options.platforms.map((platform) => `--${platform}`) : [detectCurrentPlatformFlag()]
  builderArgs.push(...platformFlags)
  builderArgs.push(...resolveArchitectureFlags(platformFlags, options.architectures))

  const availableDeveloperIdIdentities =
    process.env.VOICE_AGENT_ENABLE_SIGNING === '1' ? await getDeveloperIdApplicationIdentities() : []
  const signing = resolveSigningEnvironment(process.env, availableDeveloperIdIdentities)
  const builderEnv = signing.builderEnv

  if (signing.signingEnabled) {
    const effectiveIdentity =
      signing.selectedIdentity ??
      (availableDeveloperIdIdentities.length === 1
        ? sanitizeCodeSigningIdentity(availableDeveloperIdIdentities[0])
        : 'auto-discovery')
    console.log(`Using Developer ID Application identity: ${effectiveIdentity}`)
  }

  if (signing.notarizationEnabled) {
    console.log('Notarization credentials detected via environment variables.')
  }

  await runCommand(builderBin, builderArgs, {
    env: builderEnv,
  })

  if (platformFlags.includes('--mac')) {
    await syncGenericMacArtifacts(RELEASE_DIR, packageVersion)
  }

  const artifacts = await collectArtifacts(RELEASE_DIR)
  if (artifacts.length === 0) {
    console.log('Release automation completed, but no artifacts were found under release/.')
    return
  }

  console.log('\nArtifacts:')
  for (const artifact of artifacts) {
    console.log(`- ${artifact.relativePath} (${artifact.sizeMb} MB)`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nRelease automation failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
