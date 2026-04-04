import { constants as fsConstants, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

export const DEVELOPER_TOOL_DEFINITIONS = {
  codex: {
    label: 'Codex',
    commands: ['codex'],
    supportsRuntime: true,
    supportsResume: true,
  },
  claude_code: {
    label: 'Claude Code',
    commands: ['claude'],
    supportsRuntime: true,
    supportsResume: true,
  },
  cursor_cli: {
    label: 'Cursor CLI',
    commands: ['cursor-agent', 'cursor'],
    supportsRuntime: true,
    supportsResume: true,
  },
  gemini_cli: {
    label: 'Gemini CLI',
    commands: ['gemini'],
    supportsRuntime: true,
    supportsResume: true,
  },
  qwen_cli: {
    label: 'Qwen Code',
    commands: ['qwen'],
    supportsRuntime: true,
    supportsResume: true,
  },
}

const DEVELOPER_TOOL_KEYS = Object.keys(DEVELOPER_TOOL_DEFINITIONS)

export function defaultCommandForDeveloperTool(tool = 'codex') {
  return DEVELOPER_TOOL_DEFINITIONS[tool]?.commands?.[0] || 'codex'
}

export function developerToolLabel(tool = 'codex') {
  return DEVELOPER_TOOL_DEFINITIONS[tool]?.label || tool
}

export function supportsDeveloperToolRuntime(tool = 'codex') {
  return Boolean(DEVELOPER_TOOL_DEFINITIONS[tool]?.supportsRuntime)
}

export function supportsDeveloperToolResume(tool = 'codex') {
  return Boolean(DEVELOPER_TOOL_DEFINITIONS[tool]?.supportsResume)
}

export function buildCursorCliArgs({
  sessionThreadId = null,
  bypassPermissions = true,
} = {}) {
  const args = ['--print', '--output-format', 'json', '--trust']

  if (sessionThreadId) {
    args.push('--resume', sessionThreadId)
  }

  if (bypassPermissions !== false) {
    args.push('--force')
  } else {
    args.push('--sandbox', 'enabled')
  }

  return args
}

export function buildPrintModeSpawnArgs({
  backend = 'codex',
  args = [],
  prompt = '',
} = {}) {
  const spawnArgs = [...args]

  if (backend === 'claude_code') {
    // Claude's --add-dir option is variadic, so we must terminate option parsing
    // before appending the prompt argument.
    spawnArgs.push('--')
    spawnArgs.push(prompt)
    return spawnArgs
  }

  if (backend === 'gemini_cli' || backend === 'qwen_cli') {
    spawnArgs.push('--prompt', prompt)
    return spawnArgs
  }

  spawnArgs.push(prompt)
  return spawnArgs
}

function extractTextFromDeveloperToolContent(content) {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }

      if (!item || typeof item !== 'object') {
        return ''
      }

      return item.text || item.transcript || item.content || ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function extractThreadIdFromDeveloperToolPayload(payload, fallbackThreadId = null) {
  if (!payload || typeof payload !== 'object') {
    return fallbackThreadId
  }

  return (
    payload.session_id ||
    payload.sessionId ||
    payload.thread_id ||
    payload.threadId ||
    payload.chatId ||
    fallbackThreadId
  )
}

function stripMarkdownCodeFence(text) {
  const trimmed = String(text || '').trim()
  const fencedMatch = trimmed.match(/^```(?:[\w+-]+)?\s*([\s\S]*?)\s*```$/)
  return fencedMatch ? fencedMatch[1].trim() : trimmed
}

function isStructuredTurnPayload(payload) {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      typeof payload.status === 'string' &&
      (
        typeof payload.spokenReply === 'string' ||
        typeof payload.uiReply === 'string' ||
        typeof payload.nextActionHint === 'string'
      ),
  )
}

function extractJsonCandidatesFromText(text) {
  const source = String(text || '')
  const candidates = []

  for (let start = 0; start < source.length; start += 1) {
    const firstChar = source[start]
    if (firstChar !== '{' && firstChar !== '[') {
      continue
    }

    const stack = [firstChar === '{' ? '}' : ']']
    let inString = false
    let escaped = false

    for (let index = start + 1; index < source.length; index += 1) {
      const currentChar = source[index]

      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }

        if (currentChar === '\\') {
          escaped = true
          continue
        }

        if (currentChar === '"') {
          inString = false
        }

        continue
      }

      if (currentChar === '"') {
        inString = true
        continue
      }

      if (currentChar === '{') {
        stack.push('}')
        continue
      }

      if (currentChar === '[') {
        stack.push(']')
        continue
      }

      if (currentChar === '}' || currentChar === ']') {
        if (stack[stack.length - 1] !== currentChar) {
          break
        }

        stack.pop()
        if (stack.length === 0) {
          candidates.push(source.slice(start, index + 1))
          break
        }
      }
    }
  }

  return candidates
}

function extractStructuredPayloadFromMixedText(text) {
  const normalized = stripMarkdownCodeFence(text)
  const candidates = extractJsonCandidatesFromText(normalized)

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(candidates[index])
      if (isStructuredTurnPayload(parsed)) {
        return parsed
      }
    } catch {
      // Ignore invalid JSON candidates and keep searching.
    }
  }

  return null
}

function summarizeDeveloperToolText(text, maxLength = 160) {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return ''
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized
}

const DEVELOPER_TOOL_NEED_INPUT_PATTERNS = [
  /please provide/i,
  /could you provide/i,
  /need more information/i,
  /which (file|path|directory|project|url|one)/i,
  /what (is|exact|specific)/i,
  /请提供/,
  /请补充/,
  /需要更多信息/,
  /缺少.*(路径|文件|目录|链接|url|名称)/i,
  /哪个(文件|路径|目录|项目|链接)/,
]

const DEVELOPER_TOOL_FAILED_PATTERNS = [
  /\bnot found\b/i,
  /\bcan't find\b/i,
  /\bcannot find\b/i,
  /\bcouldn't find\b/i,
  /\bunable to\b/i,
  /\berror\b/i,
  /\bfailed\b/i,
  /未找到/,
  /找不到/,
  /无法/,
  /失败/,
  /错误/,
]

function inferPlainTextTurnStatus(text) {
  const normalized = String(text || '').trim()

  if (!normalized) {
    return 'failed'
  }

  if (DEVELOPER_TOOL_NEED_INPUT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'need_input'
  }

  if (DEVELOPER_TOOL_FAILED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'failed'
  }

  return 'done'
}

function buildPlainTextStructuredPayload(text) {
  const normalized = String(text || '').trim()
  const status = inferPlainTextTurnStatus(normalized)
  const spokenReply = summarizeDeveloperToolText(normalized, 120)

  return {
    spokenReply: spokenReply || '本轮任务已完成。',
    uiReply: normalized || '本轮任务已完成。',
    status,
    needTextContext: status === 'need_input',
    nextActionHint:
      status === 'need_input'
        ? '请补充缺失信息后再试一次。'
        : status === 'failed'
          ? '请查看结果内容后继续。'
          : '如果要继续，可以直接说下一步。',
  }
}

export function parseStructuredDeveloperToolOutput(rawOutput, backend, fallbackThreadId = null) {
  const trimmed = String(rawOutput || '').trim()
  if (!trimmed) {
    throw new Error(`${developerToolLabel(backend)} 没有返回可解析的输出。`)
  }

  const parsedOutput = JSON.parse(trimmed)
  let threadId = fallbackThreadId
  let structuredPayload = parsedOutput

  if (Array.isArray(parsedOutput)) {
    let resultEvent = null
    let assistantEvent = null

    for (let index = parsedOutput.length - 1; index >= 0; index -= 1) {
      const event = parsedOutput[index]
      if (!event || typeof event !== 'object') {
        continue
      }

      threadId = extractThreadIdFromDeveloperToolPayload(event, threadId)

      if (
        !resultEvent &&
        event.type === 'result' &&
        (typeof event.structured_output !== 'undefined' || typeof event.result !== 'undefined')
      ) {
        resultEvent = event
      }

      if (!assistantEvent && event.type === 'assistant' && event.message?.content) {
        assistantEvent = event
      }
    }

    if (resultEvent) {
      threadId = extractThreadIdFromDeveloperToolPayload(resultEvent, threadId)
      structuredPayload =
        typeof resultEvent.structured_output !== 'undefined'
          ? resultEvent.structured_output
          : resultEvent.result
    } else if (assistantEvent) {
      threadId = extractThreadIdFromDeveloperToolPayload(assistantEvent, threadId)
      structuredPayload = extractTextFromDeveloperToolContent(assistantEvent.message.content)
    }
  } else if (parsedOutput && typeof parsedOutput === 'object') {
    threadId = extractThreadIdFromDeveloperToolPayload(parsedOutput, fallbackThreadId)

    if (parsedOutput.error?.message) {
      throw new Error(String(parsedOutput.error.message))
    }

    if (typeof parsedOutput.structured_output !== 'undefined') {
      structuredPayload = parsedOutput.structured_output
    } else if (typeof parsedOutput.result !== 'undefined') {
      structuredPayload = parsedOutput.result
    } else if (typeof parsedOutput.response !== 'undefined') {
      structuredPayload = parsedOutput.response
    } else if (
      typeof parsedOutput.content === 'string' ||
      Array.isArray(parsedOutput.content)
    ) {
      structuredPayload = extractTextFromDeveloperToolContent(parsedOutput.content)
    } else if (parsedOutput.message?.content) {
      structuredPayload = extractTextFromDeveloperToolContent(parsedOutput.message.content)
    } else if (typeof parsedOutput.text === 'string') {
      structuredPayload = parsedOutput.text
    }
  }

  if (typeof structuredPayload === 'string') {
    const normalizedPayload = stripMarkdownCodeFence(structuredPayload)

    if (!normalizedPayload) {
      throw new Error(`${developerToolLabel(backend)} 返回了空响应。`)
    }

    try {
      structuredPayload = JSON.parse(normalizedPayload)
    } catch {
      const extractedPayload = extractStructuredPayloadFromMixedText(normalizedPayload)
      if (extractedPayload) {
        structuredPayload = extractedPayload
      } else if (/^[{\[]/.test(normalizedPayload)) {
        const preview = summarizeDeveloperToolText(normalizedPayload)
        throw new Error(`${developerToolLabel(backend)} 返回了不完整的 JSON 响应：${preview}`)
      } else {
        structuredPayload = buildPlainTextStructuredPayload(normalizedPayload)
      }
    }
  }

  if (!structuredPayload || typeof structuredPayload !== 'object' || Array.isArray(structuredPayload)) {
    throw new Error(`${developerToolLabel(backend)} 返回了不可识别的结果结构。`)
  }

  return {
    threadId,
    backend,
    ...structuredPayload,
  }
}

function normalizeDeveloperToolPathMap(paths = {}) {
  return DEVELOPER_TOOL_KEYS.reduce((accumulator, tool) => {
    const candidate = typeof paths?.[tool] === 'string' ? paths[tool].trim() : ''
    accumulator[tool] = candidate || defaultCommandForDeveloperTool(tool)
    return accumulator
  }, {})
}

function looksLikePath(value = '') {
  return value.includes(path.sep) || value.includes('/') || value.includes('\\')
}

async function checkExecutablePath(candidatePath) {
  try {
    await fs.access(candidatePath, fsConstants.X_OK)
    return candidatePath
  } catch {
    return ''
  }
}

function searchExecutableOnPath(command) {
  return searchExecutableCandidatesOnPath(command).then((matches) => matches[0] || '')
}

function searchExecutableCandidatesOnPath(command) {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const probeArgs = process.platform === 'win32' ? [command] : ['-a', command]
  return new Promise((resolve) => {
    execFile(probe, probeArgs, (error, stdout) => {
      if (error) {
        resolve([])
        return
      }

      const matches = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      resolve([...new Set(matches)])
    })
  })
}

async function detectUserManagedExecutableCandidates(command) {
  if (process.platform === 'win32') {
    return []
  }

  const home = os.homedir()
  if (!home) {
    return []
  }

  const directCandidates = [
    path.join(home, '.local', 'bin', command),
    path.join(home, 'bin', command),
    path.join(home, '.volta', 'bin', command),
    path.join(home, '.asdf', 'shims', command),
    '/opt/homebrew/bin/' + command,
    '/usr/local/bin/' + command,
  ]

  const nvmRoot = path.join(home, '.nvm', 'versions', 'node')
  try {
    const versionDirs = await fs.readdir(nvmRoot, { withFileTypes: true })
    for (const entry of versionDirs) {
      if (!entry.isDirectory()) {
        continue
      }
      directCandidates.push(path.join(nvmRoot, entry.name, 'bin', command))
    }
  } catch {
    // ignore
  }

  const resolved = []
  for (const candidatePath of directCandidates) {
    const executablePath = await checkExecutablePath(candidatePath)
    if (executablePath) {
      resolved.push(executablePath)
    }
  }

  return [...new Set(resolved)]
}

function parseSemverVersion(rawVersion = '') {
  const normalized = String(rawVersion || '').trim()
  const match = normalized.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    return null
  }

  return match.slice(1).map((value) => Number.parseInt(value, 10))
}

function compareSemverVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0)
    if (delta !== 0) {
      return delta
    }
  }

  return 0
}

async function readExecutableVersion(executablePath) {
  return new Promise((resolve) => {
    execFile(executablePath, ['--version'], (error, stdout, stderr) => {
      if (error) {
        resolve('')
        return
      }

      const output = `${stdout || ''}\n${stderr || ''}`
      const match = output.match(/(\d+\.\d+\.\d+)/)
      resolve(match?.[1] || '')
    })
  })
}

function executablePathPriority(executablePath) {
  if (!executablePath) {
    return 0
  }

  if (executablePath.includes(`${path.sep}.nvm${path.sep}`)) {
    return 4
  }

  if (executablePath.includes(`${path.sep}.volta${path.sep}`)) {
    return 3
  }

  if (executablePath.includes(`${path.sep}.asdf${path.sep}`)) {
    return 2
  }

  if (executablePath.startsWith('/opt/homebrew/bin/')) {
    return 1
  }

  return 0
}

async function resolvePreferredExecutable(command) {
  const pathMatches = await searchExecutableCandidatesOnPath(command)
  const managedMatches = await detectUserManagedExecutableCandidates(command)
  const candidates = [...new Set([...pathMatches, ...managedMatches])]

  if (candidates.length === 0) {
    return ''
  }

  const annotated = await Promise.all(
    candidates.map(async (executablePath) => ({
      executablePath,
      version: parseSemverVersion(await readExecutableVersion(executablePath)),
      priority: executablePathPriority(executablePath),
    })),
  )

  annotated.sort((left, right) => {
    if (left.version && right.version) {
      const versionDelta = compareSemverVersion(right.version, left.version)
      if (versionDelta !== 0) {
        return versionDelta
      }
    } else if (left.version || right.version) {
      return left.version ? -1 : 1
    }

    const priorityDelta = right.priority - left.priority
    if (priorityDelta !== 0) {
      return priorityDelta
    }

    return left.executablePath.localeCompare(right.executablePath)
  })

  return annotated[0]?.executablePath || ''
}

export async function detectDeveloperToolExecutable({
  tool = 'codex',
  executablePath = '',
} = {}) {
  const normalizedTool = DEVELOPER_TOOL_DEFINITIONS[tool] ? tool : 'codex'
  const normalizedPath = String(executablePath || '').trim()
  const fallbackCommand = defaultCommandForDeveloperTool(normalizedTool)
  const command = normalizedPath || fallbackCommand
  const label = developerToolLabel(normalizedTool)

  if (normalizedPath) {
    const resolvedPath = looksLikePath(normalizedPath)
      ? await checkExecutablePath(normalizedPath)
      : await resolvePreferredExecutable(normalizedPath)

    return {
      tool: normalizedTool,
      found: Boolean(resolvedPath),
      supported: supportsDeveloperToolRuntime(normalizedTool),
      command,
      resolvedPath,
      detail: resolvedPath
        ? `已检测到 ${label} 可执行文件。`
        : `没有检测到 ${label} 可执行文件，请手动确认路径或命令名。`,
    }
  }

  for (const candidate of DEVELOPER_TOOL_DEFINITIONS[normalizedTool].commands) {
    const resolvedPath = await resolvePreferredExecutable(candidate)
    if (!resolvedPath) {
      continue
    }

    return {
      tool: normalizedTool,
      found: true,
      supported: supportsDeveloperToolRuntime(normalizedTool),
      command: candidate,
      resolvedPath,
      detail: `系统已自动检测到 ${label}。`,
    }
  }

  return {
    tool: normalizedTool,
    found: false,
    supported: supportsDeveloperToolRuntime(normalizedTool),
    command,
    resolvedPath: '',
    detail: `系统里暂时没有检测到 ${label}，可以手动填写路径或命令名。`,
  }
}

export function normalizeDeveloperToolSettings(settings = {}, defaults = {}) {
  const developerTool = DEVELOPER_TOOL_DEFINITIONS[settings.developerTool]
    ? settings.developerTool
    : 'codex'
  const executionMode =
    settings.executionMode ||
    ((settings.codexProvider || defaults.codexProvider) === 'fake' || settings.testMode
      ? 'fake'
      : 'real')
  const legacyCodexPath =
    settings.codexPath?.trim() ||
    defaults.codexPath?.trim() ||
    (settings.developerTool === 'codex' ? settings.developerToolPath?.trim() || '' : '') ||
    (defaults.developerTool === 'codex' ? defaults.developerToolPath?.trim() || '' : '')
  const pathCandidates = {
    ...(defaults.developerToolPaths || {}),
    ...(settings.developerToolPaths || {}),
  }
  if (legacyCodexPath) {
    pathCandidates.codex = legacyCodexPath
  }

  const developerToolPaths = normalizeDeveloperToolPathMap(pathCandidates)
  const explicitCurrentPath = settings.developerToolPath?.trim()
  const hasStoredCurrentPath =
    typeof settings.developerToolPaths?.[developerTool] === 'string' &&
    settings.developerToolPaths[developerTool].trim()

  if (explicitCurrentPath && !hasStoredCurrentPath) {
    developerToolPaths[developerTool] = explicitCurrentPath
  }

  const developerToolPath = developerToolPaths[developerTool]

  return {
    ...settings,
    developerTool,
    developerToolPaths,
    developerToolPath,
    executionMode,
    codexPath: developerToolPaths.codex,
    codexProvider: executionMode === 'fake' ? 'fake' : 'codex',
  }
}
