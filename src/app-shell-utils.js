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
