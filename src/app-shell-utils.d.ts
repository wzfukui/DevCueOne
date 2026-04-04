export const APP_DISPLAY_NAME: string
export const DEFAULT_THEME_PRESET:
  | 'amber_canvas'
  | 'jade_orbit'
  | 'tide_atlas'
  | 'rose_parlor'
  | 'graphite_grove'
  | 'ink_peony'

export function normalizeAppDisplayName(name: string | null | undefined): string

export function normalizeThemePreset(
  themePreset: string | null | undefined,
): typeof DEFAULT_THEME_PRESET | 'jade_orbit' | 'tide_atlas' | 'rose_parlor' | 'graphite_grove' | 'ink_peony'

export function shouldShowOnboardingOverlay(input: {
  hasDesktopApi: boolean
  phase: string
  appState: unknown
  onboardingCompleted: boolean
}): boolean

export function shouldShowSessionListSkeleton(input: {
  hasDesktopApi: boolean
  phase: string
  appState: unknown
}): boolean

export function buildSessionIdentifierCopyPayload(input: {
  sessionId: string
  runtimeSessionId?: string | null
}):
  | {
      text: string
      successHint: string
    }
  | null

export function buildPastedImagePathBlock(
  imagePaths: Array<string | null | undefined>,
): string

export function appendPastedImagePaths(
  existingText: string | null | undefined,
  imagePaths: Array<string | null | undefined>,
): string

export function resolveSessionRuntimeDiagnostics(input: {
  sessionId?: string | null
  codexThreadId?: string | null
  developerToolThreads?: Record<string, string | null | undefined> | null
  activeTaskProvider?: string | null
  fallbackTool?: string | null
  fallbackToolPath?: string | null
  events?:
    | Array<{
        kind?: string | null
        payload?: Record<string, unknown> | null
      }>
    | null
}): {
  sessionId: string
  provider: string
  threadId: string
  toolPath: string
  source: string
}
