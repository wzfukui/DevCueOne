export const APP_DISPLAY_NAME = 'DevCue One'
export const DEFAULT_THEME_PRESET = 'amber_canvas'

const THEME_PRESET_VALUES = new Set([
  'amber_canvas',
  'jade_orbit',
  'tide_atlas',
  'rose_parlor',
  'graphite_grove',
  'ink_peony',
])

export function normalizeAppDisplayName(name) {
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  if (
    !normalizedName ||
    normalizedName.toLowerCase() === 'electron' ||
    normalizedName === 'DevCueOne'
  ) {
    return APP_DISPLAY_NAME
  }

  return normalizedName
}

export function normalizeThemePreset(themePreset) {
  return THEME_PRESET_VALUES.has(themePreset) ? themePreset : DEFAULT_THEME_PRESET
}

export function shouldShowOnboardingOverlay({
  hasDesktopApi,
  phase,
  appState,
  onboardingCompleted,
}) {
  return Boolean(
    hasDesktopApi &&
      phase !== 'booting' &&
      appState &&
      onboardingCompleted === false,
  )
}

export function shouldShowSessionListSkeleton({
  hasDesktopApi,
  phase,
  appState,
}) {
  return Boolean(hasDesktopApi && phase === 'booting' && !appState)
}

export function buildSessionIdentifierCopyPayload({
  sessionId,
  runtimeSessionId,
}) {
  const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!normalizedSessionId) {
    return null
  }

  const normalizedRuntimeSessionId =
    typeof runtimeSessionId === 'string' ? runtimeSessionId.trim() : ''

  return {
    text: normalizedRuntimeSessionId
      ? `会话 ID: ${normalizedSessionId}\n运行会话 ID: ${normalizedRuntimeSessionId}`
      : `会话 ID: ${normalizedSessionId}`,
    successHint: normalizedRuntimeSessionId
      ? '已复制会话与运行会话 ID。'
      : `已复制会话 ID：${normalizedSessionId}`,
  }
}

function normalizeStringValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function threadIdForProvider(provider, sessionThreads) {
  const normalizedProvider = normalizeStringValue(provider)
  if (!normalizedProvider) {
    return ''
  }

  return normalizeStringValue(sessionThreads[normalizedProvider])
}

export function buildPastedImagePathBlock(imagePaths) {
  const normalizedPaths = Array.isArray(imagePaths)
    ? imagePaths.map((path) => normalizeStringValue(path)).filter(Boolean)
    : []

  if (!normalizedPaths.length) {
    return ''
  }

  if (normalizedPaths.length === 1) {
    return `Attached image path: ${normalizedPaths[0]}`
  }

  return ['Attached image paths:', ...normalizedPaths.map((path) => `- ${path}`)].join('\n')
}

export function appendPastedImagePaths(existingText, imagePaths) {
  const normalizedExisting = normalizeStringValue(existingText)
  const imageBlock = buildPastedImagePathBlock(imagePaths)

  if (!imageBlock) {
    return normalizedExisting
  }

  return normalizedExisting ? `${normalizedExisting}\n\n${imageBlock}` : imageBlock
}

export function resolveSessionRuntimeDiagnostics({
  sessionId,
  codexThreadId,
  developerToolThreads,
  activeTaskProvider,
  fallbackTool,
  fallbackToolPath,
  events,
}) {
  const normalizedSessionId = normalizeStringValue(sessionId)
  const normalizedFallbackTool = normalizeStringValue(fallbackTool)
  const normalizedFallbackToolPath = normalizeStringValue(fallbackToolPath)
  const sessionThreads = {
    ...(developerToolThreads && typeof developerToolThreads === 'object'
      ? Object.fromEntries(
          Object.entries(developerToolThreads).map(([tool, threadId]) => [
            tool,
            normalizeStringValue(threadId),
          ]),
        )
      : {}),
  }

  if (!sessionThreads.codex && normalizeStringValue(codexThreadId)) {
    sessionThreads.codex = normalizeStringValue(codexThreadId)
  }

  const normalizedEvents = Array.isArray(events) ? events : []

  for (const event of normalizedEvents) {
    if (!event || (event.kind !== 'task_result' && event.kind !== 'task_started')) {
      continue
    }

    const payload =
      event.payload && typeof event.payload === 'object' ? event.payload : {}
    const provider =
      normalizeStringValue(payload.tool) ||
      normalizeStringValue(payload.backend) ||
      normalizeStringValue(payload.provider)
    const toolPath = normalizeStringValue(payload.toolPath)
    const threadId =
      normalizeStringValue(payload.threadId) || threadIdForProvider(provider, sessionThreads)

    if (!provider && !toolPath && !threadId) {
      continue
    }

    return {
      sessionId: normalizedSessionId,
      provider: provider || normalizedFallbackTool,
      threadId,
      toolPath,
      source: event.kind,
    }
  }

  const normalizedActiveTaskProvider = normalizeStringValue(activeTaskProvider)
  if (normalizedActiveTaskProvider) {
    return {
      sessionId: normalizedSessionId,
      provider: normalizedActiveTaskProvider,
      threadId: threadIdForProvider(normalizedActiveTaskProvider, sessionThreads),
      toolPath: '',
      source: 'active_task',
    }
  }

  return {
    sessionId: normalizedSessionId,
    provider: normalizedFallbackTool,
    threadId: threadIdForProvider(normalizedFallbackTool, sessionThreads),
    toolPath: normalizedFallbackToolPath,
    source: 'fallback',
  }
}
