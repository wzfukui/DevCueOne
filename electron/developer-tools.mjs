import { constants as fsConstants, promises as fs } from 'node:fs'
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
    structuredPayload = JSON.parse(stripMarkdownCodeFence(structuredPayload))
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
  const probe = process.platform === 'win32' ? 'where' : 'which'
  return new Promise((resolve) => {
    execFile(probe, [command], (error, stdout) => {
      if (error) {
        resolve('')
        return
      }

      const match = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)

      resolve(match || '')
    })
  })
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
      : await searchExecutableOnPath(normalizedPath)

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
    const resolvedPath = await searchExecutableOnPath(candidate)
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
