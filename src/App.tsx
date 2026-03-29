import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import taskSuccessCueUrl from './assets/sounds/task-success.mp3'
import voiceAcceptedCueUrl from './assets/sounds/voice-accepted.wav'
import voiceRejectedCueUrl from './assets/sounds/voice-rejected.wav'
import {
  APP_DISPLAY_NAME,
  buildSessionIdentifierCopyPayload,
  normalizeAppDisplayName,
  normalizeThemePreset,
  shouldShowOnboardingOverlay,
  shouldShowSessionListSkeleton,
} from './app-shell-utils.js'
import type {
  AcknowledgementCue,
  AppMeta,
  AppBootstrapState,
  AppPhase,
  CancelSessionTaskResult,
  ChatMessage,
  DeveloperToolDetectionResult,
  DesktopSettings,
  DeveloperTool,
  EventLogRecord,
  ExecutionMode,
  ProfileRemoveResult,
  ProfileSaveInput,
  ProjectProfile,
  SpeechConfigTestResult,
  SessionArchiveInput,
  SessionDetail,
  SessionPinInput,
  SessionSummary,
  SttConfig,
  SttProvider,
  SynthesisResult,
  TaskRecord,
  TaskStatus,
  ThemePreset,
  TtsConfig,
  TtsProvider,
  TurnExecutionResult,
  VoiceInputMode,
  WorkingLanguage,
  WorkingDirectoryInspection,
} from './types'
import { useVoiceLoop } from './useVoiceLoop'
import { useVadVoiceLoop } from './useVadVoiceLoop'

const PROJECT_GITHUB_URL = 'https://github.com/wzfukui/DevCueOne'
const THEME_PRESET_OPTIONS: Array<{
  value: ThemePreset
  label: string
  kicker: string
  description: string
  swatches: [string, string, string]
}> = [
  {
    value: 'amber_canvas',
    label: 'Amber Canvas',
    kicker: 'Warm editorial',
    description: '保留现在这套暖调工作台，像纸面标注过的作战台。',
    swatches: ['oklch(0.79 0.12 82)', 'oklch(0.72 0.1 38)', 'oklch(0.92 0.03 88)'],
  },
  {
    value: 'jade_orbit',
    label: 'Jade Orbit',
    kicker: 'Mint operations',
    description: '偏青绿色的轻科技方案，界面会更冷静，也更清爽。',
    swatches: ['oklch(0.72 0.11 168)', 'oklch(0.64 0.07 190)', 'oklch(0.93 0.02 170)'],
  },
  {
    value: 'tide_atlas',
    label: 'Tide Atlas',
    kicker: 'Blue drafting',
    description: '更像蓝图工作台，适合偏理性、偏工具感的视觉口味。',
    swatches: ['oklch(0.69 0.09 236)', 'oklch(0.6 0.08 206)', 'oklch(0.92 0.02 226)'],
  },
  {
    value: 'rose_parlor',
    label: 'Rose Parlor',
    kicker: 'Soft cinematic',
    description: '加入一点玫瑰和珊瑚色，界面会更有情绪但不发甜。',
    swatches: ['oklch(0.76 0.09 18)', 'oklch(0.68 0.08 355)', 'oklch(0.94 0.02 12)'],
  },
  {
    value: 'graphite_grove',
    label: 'Graphite Grove',
    kicker: 'Muted forest',
    description: '更克制的灰绿中性色，适合想把颜色压低一点的人。',
    swatches: ['oklch(0.62 0.04 165)', 'oklch(0.48 0.03 220)', 'oklch(0.9 0.01 160)'],
  },
  {
    value: 'ink_peony',
    label: 'Ink Peony',
    kicker: 'Classical guohua',
    description: '宣纸底、墨色骨架，再点一点花青和胭脂，像国画册页里的春景。',
    swatches: ['oklch(0.28 0.02 250)', 'oklch(0.73 0.06 188)', 'oklch(0.68 0.12 24)'],
  },
]

const DEFAULT_SETTINGS: DesktopSettings = {
  openAiApiKey: '',
  developerTool: 'codex',
  developerToolPath: 'codex',
  developerToolPaths: {
    codex: 'codex',
    claude_code: 'claude',
    cursor_cli: 'cursor-agent',
    gemini_cli: 'gemini',
    qwen_cli: 'qwen',
  },
  onboardingCompleted: false,
  executionMode: 'real',
  workingDirectory: '',
  transcriptionModel: 'gpt-4o-mini-transcribe',
  transcriptionLanguage: 'zh',
  sttProvider: 'openai',
  ttsProvider: 'browser',
  ttsModel: 'gpt-4o-mini-tts',
  ttsVoice: 'alloy',
  workingLanguage: 'zh-CN',
  voiceInputMode: 'classic',
  themePreset: 'amber_canvas',
  autoStartListening: true,
  audioMuted: false,
  bypassCodexSandbox: true,
  globalTaskConcurrency: 2,
  testMode: false,
  sttConfigs: [
    {
      id: 'stt-openai-default',
      name: 'OpenAI Main',
      kind: 'openai',
      enabled: true,
      model: 'gpt-4o-mini-transcribe',
      language: 'zh',
    },
    {
      id: 'stt-fake-default',
      name: 'Fake STT',
      kind: 'fake',
      enabled: true,
      model: 'fake-transcribe',
      language: 'zh',
    },
  ],
  ttsConfigs: [
    {
      id: 'tts-browser-default',
      name: 'Browser / System',
      kind: 'browser',
      enabled: true,
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      format: 'mp3',
    },
    {
      id: 'tts-openai-default',
      name: 'OpenAI Voice',
      kind: 'openai',
      enabled: true,
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      format: 'mp3',
    },
    {
      id: 'tts-fake-default',
      name: 'Fake TTS',
      kind: 'fake',
      enabled: true,
      model: 'fake-tts',
      voice: 'silent',
      format: 'wav',
    },
  ],
  selectedSttConfigId: 'stt-openai-default',
  selectedTtsConfigId: 'tts-browser-default',
}

type SettingsWorkspaceDrawer = 'global' | 'speech' | 'developer_tool' | 'stt' | 'tts' | 'theme'
type OnboardingStep = 'project' | 'voice' | 'tool'

const STT_PROVIDER_OPTIONS: Array<{ value: SttProvider; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'fake', label: 'Fake' },
  { value: 'groq', label: 'Groq' },
  { value: 'alibaba_model_studio', label: 'Alibaba Model Studio' },
  { value: 'volcengine_speech', label: 'Volcengine Speech' },
  { value: 'custom_http', label: 'Custom HTTP' },
]

const TTS_PROVIDER_OPTIONS: Array<{ value: TtsProvider; label: string }> = [
  { value: 'browser', label: 'Browser / System' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'fake', label: 'Fake' },
  { value: 'groq', label: 'Groq' },
  { value: 'alibaba_model_studio', label: 'Alibaba Model Studio' },
  { value: 'volcengine_speech', label: 'Volcengine Speech' },
  { value: 'custom_http', label: 'Custom HTTP' },
]

const DEVELOPER_TOOL_OPTIONS: Array<{ value: DeveloperTool; label: string }> = [
  { value: 'codex', label: 'Codex' },
  { value: 'claude_code', label: 'Claude Code' },
  { value: 'cursor_cli', label: 'Cursor CLI' },
  { value: 'gemini_cli', label: 'Gemini CLI' },
  { value: 'qwen_cli', label: 'Qwen Code' },
]

const EXECUTION_MODE_OPTIONS: Array<{ value: ExecutionMode; label: string }> = [
  { value: 'real', label: '真实执行' },
  { value: 'fake', label: 'Fake / 测试' },
]

const VOICE_INPUT_MODE_OPTIONS: Array<{
  value: VoiceInputMode
  label: string
  description: string
}> = [
  {
    value: 'classic',
    label: '基础模式',
    description: '稳定优先，适合日常使用。',
  },
  {
    value: 'vad_beta',
    label: '增强模式（VAD Beta）',
    description: '增强识别，适合更复杂的语音输入。',
  },
]

const BUILT_IN_STT_CONFIG_IDS = new Set([
  'stt-openai-default',
  'stt-fake-default',
])

const BUILT_IN_TTS_CONFIG_IDS = new Set([
  'tts-browser-default',
  'tts-openai-default',
  'tts-fake-default',
])

const DEFAULT_ALIBABA_REGION = 'beijing'
const DEFAULT_VOLCENGINE_STT_RESOURCE_ID = 'volc.bigasr.auc_turbo'
const DEFAULT_VOLCENGINE_TTS_RESOURCE_ID = 'seed-tts-2.0'
const DEFAULT_VOLCENGINE_TTS_SPEAKER = 'zh_female_shuangkuaisisi_uranus_bigtts'
const ONBOARDING_STEP_ORDER: OnboardingStep[] = ['project', 'voice', 'tool']
const VOLCENGINE_STT_RESOURCE_OPTIONS = [
  { value: 'volc.bigasr.auc_turbo', label: '录音文件极速版（当前已验证）' },
  { value: 'volc.seedasr.auc', label: '录音文件识别 2.0（新版 API Key）' },
]
const VOLCENGINE_TTS_RESOURCE_OPTIONS = [
  { value: 'seed-tts-2.0', label: '豆包语音合成模型 2.0' },
  { value: 'seed-tts-1.0', label: '豆包语音合成模型 1.0' },
  { value: 'seed-tts-1.0-concurr', label: '豆包语音合成模型 1.0 并发版' },
]
const VOLCENGINE_TTS_SPEAKER_OPTIONS = [
  { value: 'zh_female_qingxinnvsheng_uranus_bigtts', label: '清新女声 2.0' },
  { value: 'zh_female_cancan_uranus_bigtts', label: '知性灿灿 2.0' },
  { value: 'zh_female_sajiaoxuemei_uranus_bigtts', label: '撒娇学妹 2.0' },
  { value: 'zh_female_tianmeixiaoyuan_uranus_bigtts', label: '甜美小源 2.0' },
  { value: 'zh_female_tianmeitaozi_uranus_bigtts', label: '甜美桃子 2.0' },
  { value: 'zh_female_shuangkuaisisi_uranus_bigtts', label: '爽快思思 2.0' },
]

function providerLabelByValue<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T | string,
) {
  return options.find((option) => option.value === value)?.label || value
}

function hasSuggestedSpeechOption(
  options: Array<{ value: string; label: string }>,
  value: string | null | undefined,
) {
  return options.some((option) => option.value === value)
}

function isVolcengineSpeechProvider(provider: SttProvider | TtsProvider) {
  return provider === 'volcengine_speech'
}

function readSpeechExtraValue(
  config: { extra?: Record<string, string> | undefined } | null | undefined,
  key: string,
) {
  const value = config?.extra?.[key]
  return typeof value === 'string' ? value : ''
}

function patchSpeechExtraValue(
  extra: Record<string, string> | undefined,
  key: string,
  value: string,
) {
  const trimmedKey = key.trim()
  if (!trimmedKey) {
    return extra
  }

  const nextValue = value.trim()
  const nextExtra = { ...(extra || {}) }

  if (nextValue) {
    nextExtra[trimmedKey] = nextValue
  } else {
    delete nextExtra[trimmedKey]
  }

  return Object.keys(nextExtra).length ? nextExtra : undefined
}

function defaultExecutableNameForDeveloperTool(tool: DeveloperTool) {
  switch (tool) {
    case 'claude_code':
      return 'claude'
    case 'cursor_cli':
      return 'cursor-agent'
    case 'gemini_cli':
      return 'gemini'
    case 'qwen_cli':
      return 'qwen'
    case 'codex':
    default:
      return 'codex'
  }
}

function normalizeRendererSettings(
  settings?: Partial<DesktopSettings> | null,
): DesktopSettings {
  const developerTool = DEVELOPER_TOOL_OPTIONS.some(
    (option) => option.value === settings?.developerTool,
  )
    ? (settings?.developerTool as DeveloperTool)
    : DEFAULT_SETTINGS.developerTool

  const developerToolPaths = {
    ...DEFAULT_SETTINGS.developerToolPaths,
    ...(settings?.developerToolPaths || {}),
  }
  const explicitCurrentPath =
    typeof settings?.developerToolPath === 'string' ? settings.developerToolPath.trim() : ''

  if (explicitCurrentPath) {
    developerToolPaths[developerTool] = explicitCurrentPath
  }

  const themePreset = normalizeThemePreset(settings?.themePreset)
  const voiceInputMode =
    settings?.voiceInputMode === 'vad_beta'
      ? 'vad_beta'
      : DEFAULT_SETTINGS.voiceInputMode

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    developerTool,
    voiceInputMode,
    themePreset,
    audioMuted: settings?.audioMuted === true,
    developerToolPaths,
    developerToolPath:
      explicitCurrentPath ||
      developerToolPaths[developerTool] ||
      defaultExecutableNameForDeveloperTool(developerTool),
  }
}

function developerToolRuntimeNote(tool: DeveloperTool) {
  switch (tool) {
    case 'claude_code':
      return '使用 Claude Code 处理任务。'
    case 'cursor_cli':
      return '使用 Cursor CLI 处理任务。'
    case 'gemini_cli':
      return '使用 Gemini CLI 处理任务。'
    case 'qwen_cli':
      return '使用 Qwen Code 处理任务。'
    case 'codex':
    default:
      return '使用 Codex CLI 处理任务。'
  }
}

function defaultTranscriptionLanguageForWorkingLanguage(language: WorkingLanguage) {
  return language === 'en-US' ? 'en' : 'zh'
}

function defaultRegionForProvider(provider: SttProvider | TtsProvider) {
  return provider === 'alibaba_model_studio' ? DEFAULT_ALIBABA_REGION : ''
}

function defaultSttModelForProvider(provider: SttProvider) {
  switch (provider) {
    case 'alibaba_model_studio':
      return 'qwen3-asr-flash'
    case 'volcengine_speech':
      return DEFAULT_VOLCENGINE_STT_RESOURCE_ID
    case 'groq':
      return 'whisper-large-v3-turbo'
    case 'fake':
      return 'fake-transcribe'
    default:
      return 'gpt-4o-mini-transcribe'
  }
}

function defaultTtsModelForProvider(provider: TtsProvider) {
  switch (provider) {
    case 'alibaba_model_studio':
      return 'qwen3-tts-flash'
    case 'volcengine_speech':
      return DEFAULT_VOLCENGINE_TTS_RESOURCE_ID
    case 'groq':
      return 'canopylabs/orpheus-v1-english'
    case 'fake':
      return 'fake-tts'
    default:
      return 'gpt-4o-mini-tts'
  }
}

function defaultTtsVoiceForProvider(provider: TtsProvider) {
  switch (provider) {
    case 'alibaba_model_studio':
      return 'Cherry'
    case 'volcengine_speech':
      return DEFAULT_VOLCENGINE_TTS_SPEAKER
    case 'groq':
      return 'austin'
    case 'fake':
      return 'silent'
    default:
      return 'alloy'
  }
}

function defaultTtsFormatForProvider(provider: TtsProvider) {
  switch (provider) {
    case 'alibaba_model_studio':
    case 'groq':
    case 'fake':
      return 'wav'
    case 'volcengine_speech':
      return 'mp3'
    default:
      return 'mp3'
  }
}

function defaultSttConfigName(provider: SttProvider) {
  return `${providerLabelByValue(STT_PROVIDER_OPTIONS, provider)} STT`
}

function defaultTtsConfigName(provider: TtsProvider) {
  if (provider === 'browser') {
    return 'Browser / System'
  }

  return `${providerLabelByValue(TTS_PROVIDER_OPTIONS, provider)} TTS`
}

function baseUrlPlaceholderForSttProvider(provider: SttProvider) {
  switch (provider) {
    case 'openai':
      return '留空时使用 https://api.openai.com/v1'
    case 'groq':
      return '留空时使用 https://api.groq.com/openai/v1'
    case 'alibaba_model_studio':
      return '留空时按 Region 走 DashScope compatible-mode 默认端点'
    case 'volcengine_speech':
      return '留空时使用 https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash'
    case 'custom_http':
      return '示例：https://api.example.com/v1'
    default:
      return '按 provider 决定；通常可以留空'
  }
}

function baseUrlPlaceholderForTtsProvider(provider: TtsProvider) {
  switch (provider) {
    case 'openai':
      return '留空时使用 https://api.openai.com/v1'
    case 'groq':
      return '留空时使用 https://api.groq.com/openai/v1'
    case 'alibaba_model_studio':
      return '留空时按 Region 走 DashScope API 默认端点'
    case 'volcengine_speech':
      return '留空时使用 https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse'
    case 'custom_http':
      return '示例：https://api.example.com/v1'
    default:
      return '按 provider 决定；通常可以留空'
  }
}

function speechAppIdPlaceholderForProvider(provider: SttProvider | TtsProvider) {
  return isVolcengineSpeechProvider(provider) ? '火山控制台里的 App ID' : ''
}

function sttApiKeyLabelForProvider(provider: SttProvider) {
  return isVolcengineSpeechProvider(provider) ? 'Access Token' : 'API Key'
}

function sttApiKeyPlaceholderForProvider(provider: SttProvider) {
  return isVolcengineSpeechProvider(provider) ? '火山控制台里的 Access Token' : ''
}

function ttsApiKeyLabelForProvider(provider: TtsProvider) {
  return isVolcengineSpeechProvider(provider) ? 'API Key' : 'API Key'
}

function ttsApiKeyPlaceholderForProvider(provider: TtsProvider) {
  return isVolcengineSpeechProvider(provider) ? '火山新版控制台里的 API Key' : ''
}

function sttModelLabelForProvider(provider: SttProvider) {
  return isVolcengineSpeechProvider(provider) ? 'Resource ID' : '模型'
}

function sttModelPlaceholderForProvider(provider: SttProvider) {
  return isVolcengineSpeechProvider(provider) ? DEFAULT_VOLCENGINE_STT_RESOURCE_ID : ''
}

function ttsModelLabelForProvider(provider: TtsProvider) {
  return isVolcengineSpeechProvider(provider) ? 'Resource ID' : '模型'
}

function ttsModelPlaceholderForProvider(provider: TtsProvider) {
  return isVolcengineSpeechProvider(provider) ? DEFAULT_VOLCENGINE_TTS_RESOURCE_ID : ''
}

function ttsVoiceLabelForProvider(provider: TtsProvider) {
  return isVolcengineSpeechProvider(provider) ? 'Speaker' : '音色'
}

function ttsVoicePlaceholderForProvider(provider: TtsProvider) {
  return isVolcengineSpeechProvider(provider) ? DEFAULT_VOLCENGINE_TTS_SPEAKER : ''
}

function ttsFormatLabelForProvider(provider: TtsProvider) {
  return isVolcengineSpeechProvider(provider) ? 'Encoding' : '音频格式'
}

function ttsFormatPlaceholderForProvider(provider: TtsProvider) {
  return isVolcengineSpeechProvider(provider) ? 'mp3 / wav / pcm / ogg_opus' : ''
}

function sttProviderFieldVisibility(provider: SttProvider) {
  return {
    appId: provider === 'volcengine_speech',
    model: true,
    language: true,
    apiKey: provider !== 'fake',
    baseUrl:
      provider === 'openai' ||
      provider === 'groq' ||
      provider === 'alibaba_model_studio' ||
      provider === 'custom_http' ||
      provider === 'volcengine_speech',
    region: provider === 'alibaba_model_studio',
  }
}

function ttsProviderFieldVisibility(provider: TtsProvider) {
  return {
    appId: false,
    model: provider !== 'browser',
    voice: provider !== 'browser',
    format:
      provider === 'openai' ||
      provider === 'groq' ||
      provider === 'custom_http' ||
      provider === 'fake' ||
      provider === 'volcengine_speech',
    apiKey: provider !== 'browser' && provider !== 'fake',
    baseUrl:
      provider === 'openai' ||
      provider === 'groq' ||
      provider === 'alibaba_model_studio' ||
      provider === 'custom_http' ||
      provider === 'volcengine_speech',
    region: provider === 'alibaba_model_studio',
  }
}

function createClientSideId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createSttConfigTemplate(
  provider: SttProvider,
  workingLanguage: WorkingLanguage,
  existingCount: number,
): SttConfig {
  return {
    id: createClientSideId('stt'),
    name: existingCount > 0 ? `新建 STT 配置 ${existingCount + 1}` : '新建 STT 配置',
    kind: provider,
    enabled: true,
    model: defaultSttModelForProvider(provider),
    language: defaultTranscriptionLanguageForWorkingLanguage(workingLanguage),
    apiKey: '',
    baseUrl: '',
    region: defaultRegionForProvider(provider),
  }
}

function createTtsConfigTemplate(
  provider: TtsProvider,
  existingCount: number,
): TtsConfig {
  return {
    id: createClientSideId('tts'),
    name: existingCount > 0 ? `新建 TTS 配置 ${existingCount + 1}` : '新建 TTS 配置',
    kind: provider,
    enabled: true,
    model: defaultTtsModelForProvider(provider),
    voice: defaultTtsVoiceForProvider(provider),
    format: defaultTtsFormatForProvider(provider),
    apiKey: '',
    baseUrl: '',
    region: defaultRegionForProvider(provider),
  }
}

function appendSttConfig(
  settings: DesktopSettings,
  provider: SttProvider,
): { settings: DesktopSettings; configId: string } {
  const config = createSttConfigTemplate(
    provider,
    settings.workingLanguage,
    settings.sttConfigs.filter((item) => item.kind === provider).length,
  )

  return {
    settings: {
      ...settings,
      sttConfigs: [...settings.sttConfigs, config],
    },
    configId: config.id,
  }
}

function appendTtsConfig(
  settings: DesktopSettings,
  provider: TtsProvider,
): { settings: DesktopSettings; configId: string } {
  const config = createTtsConfigTemplate(
    provider,
    settings.ttsConfigs.filter((item) => item.kind === provider).length,
  )

  return {
    settings: {
      ...settings,
      ttsConfigs: [...settings.ttsConfigs, config],
    },
    configId: config.id,
  }
}

function resolveSttConfigById(settings: DesktopSettings, configId?: string | null) {
  if (configId) {
    const matchedConfig = settings.sttConfigs.find((config) => config.id === configId)
    if (matchedConfig) {
      return matchedConfig
    }
  }

  return resolveSelectedSttConfig(settings)
}

function resolveTtsConfigById(settings: DesktopSettings, configId?: string | null) {
  if (configId) {
    const matchedConfig = settings.ttsConfigs.find((config) => config.id === configId)
    if (matchedConfig) {
      return matchedConfig
    }
  }

  return resolveSelectedTtsConfig(settings)
}

function updateSttConfigById(
  settings: DesktopSettings,
  configId: string,
  update: (config: SttConfig) => SttConfig,
): DesktopSettings {
  const targetConfig = settings.sttConfigs.find((config) => config.id === configId)
  if (!targetConfig) {
    return settings
  }

  const nextSettings = {
    ...settings,
    sttConfigs: settings.sttConfigs.map((config) =>
      config.id === configId ? update(config) : config,
    ),
  }

  return settings.selectedSttConfigId === configId
    ? syncSelectedSttConfig(nextSettings)
    : nextSettings
}

function updateTtsConfigById(
  settings: DesktopSettings,
  configId: string,
  update: (config: TtsConfig) => TtsConfig,
): DesktopSettings {
  const targetConfig = settings.ttsConfigs.find((config) => config.id === configId)
  if (!targetConfig) {
    return settings
  }

  const nextSettings = {
    ...settings,
    ttsConfigs: settings.ttsConfigs.map((config) =>
      config.id === configId ? update(config) : config,
    ),
  }

  return settings.selectedTtsConfigId === configId
    ? syncSelectedTtsConfig(nextSettings)
    : nextSettings
}

function removeSttConfigById(settings: DesktopSettings, configId: string): DesktopSettings {
  if (!settings.sttConfigs.some((config) => config.id === configId)) {
    return settings
  }

  const remainingConfigs = settings.sttConfigs.filter((config) => config.id !== configId)
  if (!remainingConfigs.length) {
    return settings
  }

  const nextSelectedId =
    settings.selectedSttConfigId === configId
      ? remainingConfigs[0]?.id || settings.selectedSttConfigId
      : settings.selectedSttConfigId

  return syncSelectedSttConfig({
    ...settings,
    sttConfigs: remainingConfigs,
    selectedSttConfigId: nextSelectedId,
  })
}

function sttProviderRuntimeNote(provider: SttProvider) {
  switch (provider) {
    case 'openai':
      return '使用 OpenAI 转写服务。'
    case 'groq':
      return '使用 Groq 转写服务。'
    case 'alibaba_model_studio':
      return '使用阿里云百炼转写服务；Region 和 Base URL 可按需填写。'
    case 'fake':
      return '测试模式，不会发送真实请求。'
    case 'custom_http':
      return '适合兼容 OpenAI 协议的自建服务。'
    case 'volcengine_speech':
      return '使用火山引擎录音文件极速版识别；请填写 App ID、Access Token、Resource ID，推荐配合增强模式（VAD Beta）使用。'
    default:
      return ''
  }
}

function ttsProviderRuntimeNote(provider: TtsProvider) {
  switch (provider) {
    case 'browser':
      return '使用系统语音播报。'
    case 'openai':
      return '使用 OpenAI 语音合成。'
    case 'groq':
      return '使用 Groq 语音合成。'
    case 'alibaba_model_studio':
      return '使用阿里云百炼语音合成；Region 和 Base URL 可按需填写。'
    case 'fake':
      return '测试模式，返回静音音频。'
    case 'custom_http':
      return '适合兼容 OpenAI 协议的自建服务。'
    case 'volcengine_speech':
      return '使用火山引擎语音合成 2.0 V3；请填写 API Key、Resource ID、Speaker。'
    default:
      return ''
  }
}

type SessionDraftMap = Record<string, string>
type LocalStagePhase = 'transcribing' | 'submitting'
type LocalStageMap = Record<string, { phase: LocalStagePhase; startedAt: number }>
type SessionExpansionMap = Record<string, boolean>
type SessionAttentionCueMap = Record<string, 'success' | 'error'>
type SessionContextMenuState = {
  sessionId: string
  x: number
  y: number
} | null
type SessionScrollHarness = {
  appState: AppBootstrapState
  sessionDetail: SessionDetail
}
type ResultPlaybackTrigger = 'submit_return'
type PlaybackWorkspace = {
  sessionId: string | null
  workingDirectory: string
}

const handledResultPlaybackTaskIds = new Set<string>()
const activeResultPlaybackTaskIds = new Set<string>()
const MAX_HANDLED_RESULT_PLAYBACK_TASK_IDS = 200
const CONTEXT_DRAFT_STORAGE_KEY = 'devcueone:context-drafts'
const DEFAULT_SESSION_TITLE = '新会话'
const TERMINAL_TASK_STATUSES = new Set<TaskStatus>(['completed', 'failed', 'cancelled'])

class PlaybackInterruptedError extends Error {
  constructor(message = '语音播报已停止。') {
    super(message)
    this.name = 'PlaybackInterruptedError'
  }
}

function rememberHandledResultPlaybackTaskId(taskId: string) {
  handledResultPlaybackTaskIds.add(taskId)

  while (handledResultPlaybackTaskIds.size > MAX_HANDLED_RESULT_PLAYBACK_TASK_IDS) {
    const oldestTaskId = handledResultPlaybackTaskIds.values().next().value
    if (!oldestTaskId) {
      break
    }
    handledResultPlaybackTaskIds.delete(oldestTaskId)
  }
}

function readPersistedSessionDraftMap(storageKey: string): SessionDraftMap {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return Object.entries(parsed).reduce<SessionDraftMap>((result, [sessionId, draft]) => {
      if (typeof sessionId === 'string' && typeof draft === 'string') {
        result[sessionId] = draft
      }
      return result
    }, {})
  } catch {
    return {}
  }
}

function persistSessionDraftMap(storageKey: string, drafts: SessionDraftMap) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const sanitized = Object.fromEntries(
      Object.entries(drafts).filter(
        ([sessionId, draft]) =>
          typeof sessionId === 'string' &&
          Boolean(sessionId) &&
          typeof draft === 'string' &&
          Boolean(draft.trim()),
      ),
    )

    if (!Object.keys(sanitized).length) {
      window.localStorage.removeItem(storageKey)
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify(sanitized))
  } catch {
    // Ignore storage errors so staging remains non-blocking.
  }
}

function normalizeSessionTitle(title: string | null | undefined) {
  return title?.trim() || DEFAULT_SESSION_TITLE
}

function normalizeSessionActionError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback
  if (/No handler registered for 'session:(set-pinned|archive)'/i.test(message)) {
    return '主进程还停在旧版本，重启桌面应用后再试一次。'
  }

  return message || fallback
}

function normalizeWorkingDirectory(value?: string | null) {
  return value?.trim() || ''
}

function resolveSelectedSttConfig(settings: DesktopSettings): SttConfig | null {
  return (
    settings.sttConfigs.find((config) => config.id === settings.selectedSttConfigId) ||
    settings.sttConfigs[0] ||
    null
  )
}

function resolveSelectedTtsConfig(settings: DesktopSettings): TtsConfig | null {
  return (
    settings.ttsConfigs.find((config) => config.id === settings.selectedTtsConfigId) ||
    settings.ttsConfigs[0] ||
    null
  )
}

function syncSelectedSttConfig(settings: DesktopSettings): DesktopSettings {
  const selectedConfig = resolveSelectedSttConfig(settings)
  if (!selectedConfig) {
    return settings
  }

  return {
    ...settings,
    sttProvider: selectedConfig.kind,
    transcriptionModel: selectedConfig.model,
    transcriptionLanguage: selectedConfig.language,
  }
}

function syncSelectedTtsConfig(settings: DesktopSettings): DesktopSettings {
  const selectedConfig = resolveSelectedTtsConfig(settings)
  if (!selectedConfig) {
    return settings
  }

  return {
    ...settings,
    ttsProvider: selectedConfig.kind,
    ttsModel: selectedConfig.model,
    ttsVoice: selectedConfig.voice,
  }
}

function applySelectedSttConfig(
  settings: DesktopSettings,
  selectedSttConfigId: string,
): DesktopSettings {
  return syncSelectedSttConfig({
    ...settings,
    selectedSttConfigId,
  })
}

function applySelectedTtsConfig(
  settings: DesktopSettings,
  selectedTtsConfigId: string,
): DesktopSettings {
  return syncSelectedTtsConfig({
    ...settings,
    selectedTtsConfigId,
  })
}

function removeTtsConfigById(settings: DesktopSettings, configId: string): DesktopSettings {
  if (!settings.ttsConfigs.some((config) => config.id === configId)) {
    return settings
  }

  const remainingConfigs = settings.ttsConfigs.filter((config) => config.id !== configId)
  if (!remainingConfigs.length) {
    return settings
  }

  const nextSelectedId =
    settings.selectedTtsConfigId === configId
      ? remainingConfigs[0]?.id || settings.selectedTtsConfigId
      : settings.selectedTtsConfigId

  return syncSelectedTtsConfig({
    ...settings,
    ttsConfigs: remainingConfigs,
    selectedTtsConfigId: nextSelectedId,
  })
}

function assignSttProviderToConfig(
  settings: DesktopSettings,
  configId: string,
  provider: SttProvider,
): DesktopSettings {
  return updateSttConfigById(settings, configId, (config) => ({
    ...config,
    kind: provider,
    model: defaultSttModelForProvider(provider),
    language: defaultTranscriptionLanguageForWorkingLanguage(settings.workingLanguage),
    baseUrl: '',
    region: defaultRegionForProvider(provider),
    extra: undefined,
  }))
}

function assignTtsProviderToConfig(
  settings: DesktopSettings,
  configId: string,
  provider: TtsProvider,
): DesktopSettings {
  return updateTtsConfigById(settings, configId, (config) => ({
    ...config,
    kind: provider,
    model: defaultTtsModelForProvider(provider),
    voice: defaultTtsVoiceForProvider(provider),
    format: defaultTtsFormatForProvider(provider),
    baseUrl: '',
    region: defaultRegionForProvider(provider),
    extra: undefined,
  }))
}

function buildSpeechConfigOptionLabel(config: { name: string; kind: string }) {
  return `${config.name} · ${config.kind}`
}

function cloneSttConfigs(configs: SttConfig[]) {
  return configs.map((config) => ({
    ...config,
    extra: config.extra ? { ...config.extra } : undefined,
  }))
}

function cloneTtsConfigs(configs: TtsConfig[]) {
  return configs.map((config) => ({
    ...config,
    extra: config.extra ? { ...config.extra } : undefined,
  }))
}

function settingsDraftEquals(left: DesktopSettings, right: DesktopSettings) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function restoreSttSettingsFromSaved(
  current: DesktopSettings,
  saved: DesktopSettings,
): DesktopSettings {
  const sttConfigs = cloneSttConfigs(saved.sttConfigs)
  const nextSelectedSttConfigId = sttConfigs.some(
    (config) => config.id === current.selectedSttConfigId,
  )
    ? current.selectedSttConfigId
    : saved.selectedSttConfigId

  return syncSelectedSttConfig({
    ...current,
    sttConfigs,
    selectedSttConfigId: nextSelectedSttConfigId,
  })
}

function restoreTtsSettingsFromSaved(
  current: DesktopSettings,
  saved: DesktopSettings,
): DesktopSettings {
  const ttsConfigs = cloneTtsConfigs(saved.ttsConfigs)
  const nextSelectedTtsConfigId = ttsConfigs.some(
    (config) => config.id === current.selectedTtsConfigId,
  )
    ? current.selectedTtsConfigId
    : saved.selectedTtsConfigId

  return syncSelectedTtsConfig({
    ...current,
    ttsConfigs,
    selectedTtsConfigId: nextSelectedTtsConfigId,
  })
}

function describeSpeechConfigTestResult(result: SpeechConfigTestResult | null) {
  if (!result) {
    return ''
  }

  const summary = `${result.ok ? '最近测试成功' : '最近测试失败'} · ${result.latencyMs}ms · ${result.detail}`
  if (result.capability === 'stt' && result.transcript) {
    return `${summary} 样本转写：${result.transcript}`
  }

  return summary
}

function createPlaybackWorkspace(
  sessionId: string | null,
  workingDirectory?: string | null,
): PlaybackWorkspace {
  return {
    sessionId,
    workingDirectory: normalizeWorkingDirectory(workingDirectory),
  }
}

function isSamePlaybackWorkspace(left: PlaybackWorkspace, right: PlaybackWorkspace) {
  return (
    left.sessionId === right.sessionId &&
    left.workingDirectory === right.workingDirectory
  )
}

function detectBackgroundTaskCue(
  previousSessions: SessionSummary[] | null,
  nextSessions: SessionSummary[],
  activeSessionId: string | null,
) {
  if (!previousSessions?.length) {
    return null
  }

  const previousById = new Map(previousSessions.map((session) => [session.id, session]))
  const completedSessionIds: string[] = []
  const failedSessionIds: string[] = []

  for (const nextSession of nextSessions) {
    if (nextSession.id === activeSessionId) {
      continue
    }

    const previousSession = previousById.get(nextSession.id)
    const nextStatus = nextSession.lastTaskStatus

    if (!previousSession || !nextStatus || !TERMINAL_TASK_STATUSES.has(nextStatus)) {
      continue
    }

    const droppedOutOfActiveTask =
      previousSession.activeTaskCount > 0 && nextSession.activeTaskCount === 0
    const hasFreshTerminalUpdate =
      nextSession.activeTaskCount === 0 &&
      nextSession.unreadEventCount > previousSession.unreadEventCount &&
      nextSession.lastActivityAt !== previousSession.lastActivityAt

    if (!droppedOutOfActiveTask && !hasFreshTerminalUpdate) {
      continue
    }

    if (nextStatus === 'completed') {
      completedSessionIds.push(nextSession.id)
    } else {
      failedSessionIds.push(nextSession.id)
    }
  }

  if (!completedSessionIds.length && !failedSessionIds.length) {
    return null
  }

  if (failedSessionIds.length) {
    return {
      tone: 'error' as const,
      primarySessionId: failedSessionIds[0],
      sessionIds: [...failedSessionIds, ...completedSessionIds],
      completedSessionIds,
      failedSessionIds,
    }
  }

  return {
    tone: 'success' as const,
    primarySessionId: completedSessionIds[0],
    sessionIds: completedSessionIds,
    completedSessionIds,
    failedSessionIds,
  }
}

function canPlayTurnResultForWorkspace(
  result: TurnExecutionResult,
  workspace: PlaybackWorkspace,
) {
  if (!workspace.sessionId || result.sessionId !== workspace.sessionId) {
    return false
  }

  const resultWorkingDirectory = normalizeWorkingDirectory(result.workingDirectory)
  if (!workspace.workingDirectory || !resultWorkingDirectory) {
    return true
  }

  return workspace.workingDirectory === resultWorkingDirectory
}

function isPlaybackInterruptedError(error: unknown) {
  return error instanceof Error && error.name === 'PlaybackInterruptedError'
}

function isAudioMutedPlaybackResult(result: Record<string, unknown> | null | undefined) {
  return result?.reason === 'audio_muted'
}

function formatClock(value?: string | null, locale = 'zh-CN') {
  if (!value) {
    return '—'
  }

  return new Intl.DateTimeFormat(locale, {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatTaskStatus(status: TaskRecord['status'] | null | undefined) {
  switch (status) {
    case 'queued':
      return '排队中'
    case 'running':
      return '进行中'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    default:
      return '空闲'
  }
}

function buildSessionTaskStatusLabel(sessionItem: SessionSummary) {
  const statusLabel = formatTaskStatus(sessionItem.lastTaskStatus)
  if (sessionItem.activeTaskCount > 0) {
    return `${sessionItem.activeTaskCount} 个任务，${statusLabel}`
  }

  return statusLabel
}

function formatEventKind(kind: string) {
  switch (kind) {
    case 'voice_chime':
      return '提示铃声'
    case 'voice_intent_ready':
      return '语音已受理'
    case 'voice_short_ignored':
      return '短语音已忽略'
    case 'voice_reject_chime':
      return '拒绝提示音'
    case 'task_started':
      return '任务开始'
    case 'task_queued':
      return '任务排队'
    case 'user_input':
      return '用户输入'
    case 'local_router':
      return '本地路由'
    case 'task_result':
      return '任务结果'
    case 'task_recovered':
      return '任务已回收'
    case 'transcribe_done':
      return '转写完成'
    case 'ack_playback':
      return '确认播报'
    case 'result_playback':
      return '结果播报'
    default:
      return kind
  }
}

function mergeStagedTurnInput(existingValue: string, nextValue: string) {
  const existing = existingValue.trim()
  const next = nextValue.trim()

  if (!existing) {
    return next
  }

  if (!next) {
    return existing
  }

  return `${existing}\n\n${next}`
}

function acknowledgementFallbackText(language: WorkingLanguage) {
  return language === 'en-US' ? 'Okay, I am on it.' : '收到。'
}

type ProfileDraft = Omit<ProfileSaveInput, 'developerTool'> & {
  developerTool: DeveloperTool | ''
}

function createEmptyProfileDraft(): ProfileDraft {
  return {
    name: '',
    workingDirectory: '',
    developerTool: '',
    defaultPromptContext: '',
    usageNotes: '',
  }
}

function deriveProjectNameFromDirectory(directory: string) {
  const normalized = directory.trim().replace(/[\\/]+$/, '')
  if (!normalized) {
    return ''
  }

  const segments = normalized.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] || ''
}

function describeMicrophonePermissionError(error: unknown) {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return '未获得麦克风权限，请允许访问后重试。'
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return '没有检测到可用麦克风，请先连接麦克风后重试。'
      case 'NotReadableError':
      case 'TrackStartError':
        return '麦克风当前可能被其他应用占用，请释放后重试。'
      default:
        return '无法访问麦克风，请检查系统权限和设备状态。'
    }
  }

  return error instanceof Error
    ? error.message
    : '无法访问麦克风，请检查系统权限和设备状态。'
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.67 0 8.2c0 3.63 2.29 6.71 5.47 7.8.4.08.55-.18.55-.4 0-.2-.01-.87-.01-1.58-2.01.38-2.53-.51-2.69-.98-.09-.24-.48-.99-.81-1.18-.27-.15-.66-.53-.01-.54.61-.01 1.04.57 1.19.8.69 1.18 1.79.85 2.23.64.07-.51.27-.85.49-1.05-1.78-.21-3.64-.92-3.64-4.08 0-.9.31-1.64.82-2.22-.08-.21-.36-1.05.08-2.19 0 0 .67-.22 2.2.84.64-.18 1.32-.28 2-.28s1.36.1 2 .28c1.53-1.06 2.2-.84 2.2-.84.44 1.14.16 1.98.08 2.19.51.58.82 1.31.82 2.22 0 3.17-1.87 3.87-3.65 4.08.29.26.54.75.54 1.52 0 1.1-.01 1.98-.01 2.26 0 .22.15.49.55.4A8.18 8.18 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z"
      />
    </svg>
  )
}

function blobToBase64(blob: Blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''

    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }

    return btoa(binary)
  })
}

function encodeWavBuffer(samples: Float32Array, sampleRate: number) {
  const byteLength = 44 + samples.length * 2
  const buffer = new ArrayBuffer(byteLength)
  const view = new DataView(buffer)

  function writeAscii(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    view.setInt16(offset, value, true)
    offset += 2
  }

  return buffer
}

async function convertAudioBlobToWav(blob: Blob) {
  if (blob.type.includes('wav')) {
    return blob
  }

  const AudioContextCtor =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined
  if (!AudioContextCtor) {
    throw new Error('当前环境不支持音频格式转换，请切换到增强模式（VAD Beta）后重试。')
  }

  const audioContext = new AudioContextCtor()

  try {
    const arrayBuffer = await blob.arrayBuffer()
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    const mixedSamples = new Float32Array(decoded.length)
    const channelCount = Math.max(1, decoded.numberOfChannels)

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const channelData = decoded.getChannelData(channelIndex)
      for (let sampleIndex = 0; sampleIndex < decoded.length; sampleIndex += 1) {
        mixedSamples[sampleIndex] += channelData[sampleIndex] / channelCount
      }
    }

    return new Blob([encodeWavBuffer(mixedSamples, decoded.sampleRate)], {
      type: 'audio/wav',
    })
  } finally {
    await audioContext.close().catch(() => {})
  }
}

function createProfileDraft(
  profile: ProjectProfile | null,
): ProfileDraft {
  if (!profile) {
    return createEmptyProfileDraft()
  }

  return {
    id: profile.id,
    name: profile.name,
    workingDirectory: profile.workingDirectory,
    developerTool: profile.developerTool || '',
    defaultPromptContext: profile.defaultPromptContext,
    usageNotes: profile.usageNotes,
  }
}

function taskForSession(detail: SessionDetail | null) {
  if (!detail?.tasks.length) {
    return null
  }

  const runningTask = detail.tasks.find((task) => task.status === 'running')
  if (runningTask) {
    return runningTask
  }

  return [...detail.tasks]
    .filter((task) => task.status === 'queued')
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ?? null
}

function scheduledTasksForSession(detail: SessionDetail | null) {
  if (!detail?.tasks.length) {
    return []
  }

  const runningTasks = detail.tasks
    .filter((task) => task.status === 'running')
    .sort((left, right) =>
      (left.startedAt || left.createdAt).localeCompare(right.startedAt || right.createdAt),
    )
  const queuedTasks = detail.tasks
    .filter((task) => task.status === 'queued')
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))

  return [...runningTasks, ...queuedTasks]
}

function createSessionScrollHarness(): SessionScrollHarness {
  const now = Date.now()
  const profile: ProjectProfile = {
    id: 'mock-profile-scroll',
    name: '滚动验证项目',
    workingDirectory: '/mock/session-scroll-harness',
    developerTool: null,
    defaultPromptContext: '用于浏览器里验证左侧会话列表滚动。',
    usageNotes: 'Mock 数据，仅用于自动化滚动验证。',
    createdAt: new Date(now - 86_400_000).toISOString(),
    updatedAt: new Date(now).toISOString(),
    lastUsedAt: new Date(now).toISOString(),
  }

  const sessions: SessionSummary[] = Array.from({ length: 14 }, (_, index) => {
    const offset = index * 90_000
    const timestamp = new Date(now - offset).toISOString()

    return {
      id: `mock-session-${index + 1}`,
      title: `滚动验证会话 ${index + 1}`,
      titleSource: 'manual',
      createdAt: timestamp,
      updatedAt: timestamp,
      lastActivityAt: timestamp,
      boundProfileId: profile.id,
      codexThreadId: null,
      pinnedAt: index === 0 ? timestamp : null,
      lastMessagePreview:
        '这是用于浏览器自动化测试的长预览文本，用来拉高卡片高度并验证左侧列表在多条记录下是否还能继续滚动。',
      unreadEventCount: 0,
      archivedAt: null,
      boundProfileName: profile.name,
      boundWorkingDirectory: profile.workingDirectory,
      activeTaskCount: index === 0 ? 1 : 0,
      lastTaskStatus: index === 0 ? 'running' : 'completed',
      isActive: index === 0,
    }
  })

  const activeSession = sessions[0]

  return {
    appState: {
      settings: {
        ...DEFAULT_SETTINGS,
        workingDirectory: profile.workingDirectory,
        autoStartListening: false,
        testMode: true,
      },
      sessions,
      profiles: [profile],
      activeSessionId: activeSession.id,
    },
    sessionDetail: {
      session: activeSession,
      boundProfile: profile,
      messages: [
        {
          id: 'mock-message-1',
          sessionId: activeSession.id,
          taskId: 'mock-task-1',
          role: 'user',
          text: '请确认左侧会话列表是否可以滚动。',
          detail: '',
          createdAt: new Date(now - 30_000).toISOString(),
        },
        {
          id: 'mock-message-2',
          sessionId: activeSession.id,
          taskId: 'mock-task-1',
          role: 'assistant',
          text: '当前页面运行在浏览器调试模式，专门用于自动化验证左侧列表滚动。',
          detail: '',
          createdAt: new Date(now - 20_000).toISOString(),
        },
      ],
      tasks: [
        {
          id: 'mock-task-1',
          sessionId: activeSession.id,
          type: 'text_turn',
          status: 'running',
          provider: 'fake',
          inputPreview: '验证左侧滚动行为',
          startedAt: new Date(now - 15_000).toISOString(),
          finishedAt: null,
          summary: '验证左侧滚动行为',
          errorMessage: '',
          codexThreadId: null,
          workingDirectory: profile.workingDirectory,
          createdAt: new Date(now - 15_000).toISOString(),
        },
      ],
      events: [],
    },
  }
}

function resolveInspectorProfile(args: {
  profiles: ProjectProfile[]
  detail: SessionDetail | null
  selectedProfileId: string | null
  preferSelectedProfile: boolean
  creatingDraft: boolean
}) {
  const {
    profiles,
    detail,
    selectedProfileId,
    preferSelectedProfile,
    creatingDraft,
  } = args

  if (creatingDraft) {
    return null
  }

  const selectedProfile = selectedProfileId
    ? profiles.find((profile) => profile.id === selectedProfileId) ?? null
    : null
  const boundProfileId = detail?.boundProfile?.id ?? null
  const boundProfile = boundProfileId
    ? profiles.find((profile) => profile.id === boundProfileId) ?? null
    : null

  if (preferSelectedProfile && selectedProfile) {
    return selectedProfile
  }

  return boundProfile ?? selectedProfile ?? profiles[0] ?? null
}

function buildMessageMeta(message: ChatMessage, locale: string) {
  const roleLabel =
    message.role === 'user' ? '你' : message.role === 'assistant' ? 'Agent' : '系统'

  return `${roleLabel} · ${formatClock(message.createdAt, locale)}`
}

function App() {
  const desktopAgent = window.desktopAgent
  const isSessionScrollHarness =
    new URLSearchParams(window.location.search).get('mockSessions') === '1'
  const hasDesktopApi = typeof desktopAgent !== 'undefined' && !isSessionScrollHarness
  const sessionScrollHarness = useMemo(
    () => (isSessionScrollHarness ? createSessionScrollHarness() : null),
    [isSessionScrollHarness],
  )
  const [appMeta, setAppMeta] = useState<AppMeta>({
    name: APP_DISPLAY_NAME,
    version: '—',
  })
  const [appState, setAppState] = useState<AppBootstrapState | null>(null)
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<DesktopSettings>(
    normalizeRendererSettings(DEFAULT_SETTINGS),
  )
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(createEmptyProfileDraft())
  const [phase, setPhase] = useState<AppPhase>('booting')
  const [activityHint, setActivityHint] = useState('正在准备新的多会话工作台。')
  const [lastError, setLastError] = useState('')
  const [listeningEnabled, setListeningEnabled] = useState(false)
  const [playbackActive, setPlaybackActive] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [profileDirty, setProfileDirty] = useState(false)
  const [isCreatingProfileDraft, setIsCreatingProfileDraft] = useState(false)
  const [isProfileInspectorExpanded, setIsProfileInspectorExpanded] = useState(false)
  const [isSessionCreateDialogOpen, setIsSessionCreateDialogOpen] = useState(false)
  const [pendingSessionProfileId, setPendingSessionProfileId] = useState<string | null>(null)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [isSettingsInspectorExpanded, setIsSettingsInspectorExpanded] = useState(false)
  const [isSettingsWorkspaceOpen, setIsSettingsWorkspaceOpen] = useState(false)
  const [activeSettingsWorkspaceDrawer, setActiveSettingsWorkspaceDrawer] =
    useState<SettingsWorkspaceDrawer | null>(null)
  const [isSttInspectorExpanded, setIsSttInspectorExpanded] = useState(false)
  const [isTtsInspectorExpanded, setIsTtsInspectorExpanded] = useState(false)
  const [isSttConfigFormVisible, setIsSttConfigFormVisible] = useState(false)
  const [isTtsConfigFormVisible, setIsTtsConfigFormVisible] = useState(false)
  const [isDiagnosticsInspectorExpanded, setIsDiagnosticsInspectorExpanded] = useState(false)
  const [isCheckingProfilePath, setIsCheckingProfilePath] = useState(false)
  const [profilePathInspection, setProfilePathInspection] =
    useState<WorkingDirectoryInspection | null>(null)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isTestingSttConfig, setIsTestingSttConfig] = useState(false)
  const [isTestingTtsConfig, setIsTestingTtsConfig] = useState(false)
  const [sttConfigTestResult, setSttConfigTestResult] =
    useState<SpeechConfigTestResult | null>(null)
  const [ttsConfigTestResult, setTtsConfigTestResult] =
    useState<SpeechConfigTestResult | null>(null)
  const [developerToolDetection, setDeveloperToolDetection] =
    useState<DeveloperToolDetectionResult | null>(null)
  const [isDetectingDeveloperTool, setIsDetectingDeveloperTool] = useState(false)
  const [draftSttConfigIds, setDraftSttConfigIds] = useState<string[]>([])
  const [draftTtsConfigIds, setDraftTtsConfigIds] = useState<string[]>([])
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [playbackStartedAt, setPlaybackStartedAt] = useState<number | null>(null)
  const [messageDrafts, setMessageDrafts] = useState<SessionDraftMap>({})
  const [contextDrafts, setContextDrafts] = useState<SessionDraftMap>(() =>
    readPersistedSessionDraftMap(CONTEXT_DRAFT_STORAGE_KEY),
  )
  const [localStages, setLocalStages] = useState<LocalStageMap>({})
  const [expandedConversationSessions, setExpandedConversationSessions] =
    useState<SessionExpansionMap>({})
  const [sessionAttentionCues, setSessionAttentionCues] =
    useState<SessionAttentionCueMap>({})
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [sessionListFilter, setSessionListFilter] = useState<'all' | 'project'>('all')
  const [sessionContextMenu, setSessionContextMenu] = useState<SessionContextMenuState>(null)
  const [editingSttConfigId, setEditingSttConfigId] = useState<string | null>(null)
  const [editingTtsConfigId, setEditingTtsConfigId] = useState<string | null>(null)
  const [phaseElapsedSeconds, setPhaseElapsedSeconds] = useState(0)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isProfileRemoveDialogOpen, setIsProfileRemoveDialogOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('project')
  const [isFinishingOnboarding, setIsFinishingOnboarding] = useState(false)
  const [onboardingMicrophonePermissionState, setOnboardingMicrophonePermissionState] = useState<
    'idle' | 'requesting' | 'granted' | 'denied'
  >('idle')
  const [onboardingMicrophoneMessage, setOnboardingMicrophoneMessage] = useState(
    '点击下方按钮触发系统麦克风授权，后面的语音配置和测试才会顺畅。',
  )
  const runtimeSettings = useMemo(
    () => normalizeRendererSettings(appState?.settings ?? DEFAULT_SETTINGS),
    [appState?.settings],
  )
  const activeVoiceInputMode = runtimeSettings.voiceInputMode

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const uiCueAudioRef = useRef<HTMLAudioElement | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const playbackWorkspaceRef = useRef<PlaybackWorkspace>(
    createPlaybackWorkspace(null, null),
  )
  const playbackInterruptRef = useRef<((error: PlaybackInterruptedError) => void) | null>(
    null,
  )
  const selectedProfileIdRef = useRef<string | null>(null)
  const listeningEnabledRef = useRef(false)
  const settingsDirtyRef = useRef(false)
  const profileDirtyRef = useRef(false)
  const isCreatingProfileDraftRef = useRef(false)
  const profileSelectionSessionIdRef = useRef<string | null>(null)
  const autoStartAppliedRef = useRef(false)
  const transcriptListRef = useRef<HTMLDivElement | null>(null)
  const handledVoiceIntentEventIdsRef = useRef(new Set<string>())
  const isSavingSessionRenameRef = useRef(false)
  const skipNextSessionRenameSaveRef = useRef(false)
  const previousSessionSummariesRef = useRef<SessionSummary[] | null>(null)
  const sessionAttentionTimeoutsRef = useRef<Record<string, number>>({})
  const onboardingPreparedRef = useRef(false)

  const activeSessionId = appState?.activeSessionId ?? null
  const activeTask = useMemo(() => taskForSession(sessionDetail), [sessionDetail])
  const scheduledSessionTasks = useMemo(
    () => scheduledTasksForSession(sessionDetail),
    [sessionDetail],
  )
  const activeSession = useMemo(
    () => appState?.sessions.find((item) => item.id === activeSessionId) ?? null,
    [activeSessionId, appState?.sessions],
  )
  const activeSessionProfileId =
    sessionDetail?.boundProfile?.id ?? activeSession?.boundProfileId ?? null
  const currentPlaybackWorkspace = useMemo(
    () =>
      createPlaybackWorkspace(
        activeSessionId,
        sessionDetail?.boundProfile?.workingDirectory ?? activeSession?.boundWorkingDirectory ?? null,
      ),
    [
      activeSessionId,
      activeSession?.boundWorkingDirectory,
      sessionDetail?.boundProfile?.workingDirectory,
    ],
  )
  const selectedSttConfig = useMemo(
    () => resolveSelectedSttConfig(settingsDraft),
    [settingsDraft],
  )
  const selectedTtsConfig = useMemo(
    () => resolveSelectedTtsConfig(settingsDraft),
    [settingsDraft],
  )
  const editingSttConfig = useMemo(
    () => resolveSttConfigById(settingsDraft, editingSttConfigId),
    [editingSttConfigId, settingsDraft],
  )
  const editingTtsConfig = useMemo(
    () => resolveTtsConfigById(settingsDraft, editingTtsConfigId),
    [editingTtsConfigId, settingsDraft],
  )
  const sttFields = sttProviderFieldVisibility(editingSttConfig?.kind ?? 'openai')
  const ttsFields = ttsProviderFieldVisibility(editingTtsConfig?.kind ?? 'browser')
  const isEditingNewSttConfig = Boolean(
    editingSttConfig && draftSttConfigIds.includes(editingSttConfig.id),
  )
  const isEditingNewTtsConfig = Boolean(
    editingTtsConfig && draftTtsConfigIds.includes(editingTtsConfig.id),
  )
  const isEditingSttProviderLocked = Boolean(
    editingSttConfig && !draftSttConfigIds.includes(editingSttConfig.id),
  )
  const isEditingTtsProviderLocked = Boolean(
    editingTtsConfig && !draftTtsConfigIds.includes(editingTtsConfig.id),
  )
  const visibleSttConfigTestResult =
    sttConfigTestResult && sttConfigTestResult.configId === editingSttConfig?.id
      ? sttConfigTestResult
      : null
  const visibleTtsConfigTestResult =
    ttsConfigTestResult && ttsConfigTestResult.configId === editingTtsConfig?.id
      ? ttsConfigTestResult
      : null
  const conversationMessages = useMemo(
    () => (sessionDetail?.messages ? [...sessionDetail.messages].reverse() : []),
    [sessionDetail?.messages],
  )
  const isConversationExpanded = activeSessionId
    ? expandedConversationSessions[activeSessionId] ?? false
    : false
  const visibleConversationMessages = useMemo(
    () =>
      isConversationExpanded ? conversationMessages : conversationMessages.slice(0, 4),
    [conversationMessages, isConversationExpanded],
  )
  const hiddenConversationCount = Math.max(
    0,
    conversationMessages.length - visibleConversationMessages.length,
  )
  const queuedTurnCount = useMemo(
    () => scheduledSessionTasks.filter((task) => task.status === 'queued').length,
    [scheduledSessionTasks],
  )
  const currentLocalStage = activeSessionId ? localStages[activeSessionId] ?? null : null
  const currentMessageDraft = activeSessionId ? messageDrafts[activeSessionId] ?? '' : ''
  const currentContextDraft = activeSessionId ? contextDrafts[activeSessionId] ?? '' : ''
  const hasCurrentMessageDraft = Boolean(currentMessageDraft.trim())
  const hasCurrentContextDraft = Boolean(currentContextDraft.trim())
  const stageTurnInputLabel = hasCurrentContextDraft ? '追加到下一轮补充' : '设为下一轮补充'
  const canQueueCurrentTurnInput =
    Boolean(activeSessionId && hasCurrentMessageDraft) &&
    Boolean(activeTask || queuedTurnCount > 0)
  const canSubmitCurrentTurnInput =
    Boolean(activeSessionId && hasCurrentMessageDraft) &&
    !activeTask &&
    !currentLocalStage
  const locale = settingsDraft.workingLanguage || 'zh-CN'
  const hasTaskControls = Boolean(activeTask || currentLocalStage)
  const trimmedProfilePath = profileDraft.workingDirectory?.trim() || ''
  const hasSavedProfiles = (appState?.profiles.length ?? 0) > 0
  const boundProfileSummary = useMemo(() => {
    if (sessionDetail?.boundProfile) {
      return sessionDetail.boundProfile
    }

    if (!activeSessionProfileId) {
      return null
    }

    return appState?.profiles.find((profile) => profile.id === activeSessionProfileId) ?? null
  }, [activeSessionProfileId, appState?.profiles, sessionDetail?.boundProfile])
  const pendingSessionProfileSummary = useMemo(
    () =>
      pendingSessionProfileId
        ? appState?.profiles.find((profile) => profile.id === pendingSessionProfileId) ?? null
        : null,
    [appState?.profiles, pendingSessionProfileId],
  )
  const selectedProfileSessionCount = useMemo(() => {
    if (!selectedProfileId) {
      return 0
    }

    return (appState?.sessions ?? []).filter(
      (sessionItem) => sessionItem.boundProfileId === selectedProfileId,
    ).length
  }, [appState?.sessions, selectedProfileId])
  const selectedProfileDisplayName = profileDraft.name?.trim() || '当前项目'
  const isSelectedProfileBoundToActiveSession = Boolean(
    selectedProfileId &&
      activeSessionProfileId &&
      selectedProfileId === activeSessionProfileId,
  )
  const isEditingSavedProfile = Boolean(selectedProfileId && !isCreatingProfileDraft)
  const canSaveProfile = Boolean(
    !isSavingProfile &&
      trimmedProfilePath &&
      profilePathInspection?.isValid &&
      !isCheckingProfilePath,
  )
  const isBootstrappingApp = phase === 'booting' && !appState
  const isSessionListLoading = shouldShowSessionListSkeleton({
    hasDesktopApi,
    phase,
    appState,
  })
  const isOnboardingOpen = shouldShowOnboardingOverlay({
    hasDesktopApi,
    phase,
    appState,
    onboardingCompleted: normalizeRendererSettings(appState?.settings).onboardingCompleted,
  })
  const onboardingMicrophonePreviewEnabled =
    isOnboardingOpen &&
    onboardingStep === 'voice' &&
    onboardingMicrophonePermissionState === 'granted'
  const onboardingSttFields = sttProviderFieldVisibility(selectedSttConfig?.kind ?? 'openai')
  const onboardingTtsFields = ttsProviderFieldVisibility(selectedTtsConfig?.kind ?? 'browser')
  const isOnboardingProjectStepValid = Boolean(
    profileDraft.name?.trim() &&
      trimmedProfilePath &&
      profilePathInspection?.isValid &&
      !isCheckingProfilePath,
  )
  const isOnboardingVoiceStepValid = Boolean(
    onboardingMicrophonePermissionState === 'granted' &&
      selectedSttConfig &&
      selectedSttConfig.kind !== 'fake' &&
      (!onboardingSttFields.apiKey || Boolean(selectedSttConfig.apiKey?.trim())) &&
      selectedTtsConfig &&
      selectedTtsConfig.kind !== 'fake' &&
      (!onboardingTtsFields.apiKey || Boolean(selectedTtsConfig.apiKey?.trim())),
  )
  const isOnboardingToolStepValid = Boolean(
    settingsDraft.developerToolPath.trim() &&
      developerToolDetection?.tool === settingsDraft.developerTool &&
      developerToolDetection.found,
  )
  const onboardingCurrentStepIndex = ONBOARDING_STEP_ORDER.indexOf(onboardingStep)
  const canAdvanceOnboarding =
    onboardingStep === 'project'
      ? isOnboardingProjectStepValid
      : onboardingStep === 'voice'
        ? isOnboardingVoiceStepValid
        : isOnboardingToolStepValid
  const canCompleteOnboarding =
    isOnboardingProjectStepValid &&
    isOnboardingVoiceStepValid &&
    isOnboardingToolStepValid &&
    !isSavingProfile &&
    !isSavingSettings &&
    !isFinishingOnboarding
  const currentCancelableTaskKey = useMemo(() => {
    if (!activeSessionId) {
      return null
    }

    if (activeTask?.status === 'running' || activeTask?.status === 'queued') {
      return `${activeSessionId}:${activeTask.id}:${activeTask.status}`
    }

    if (currentLocalStage?.phase === 'submitting') {
      return `${activeSessionId}:local:${currentLocalStage.phase}:${currentLocalStage.startedAt}`
    }

    return null
  }, [activeSessionId, activeTask?.id, activeTask?.status, currentLocalStage])
  const visibleSessions = useMemo(() => {
    const sessions = appState?.sessions ?? []
    if (sessionListFilter !== 'project' || !activeSessionProfileId) {
      return sessions
    }

    return sessions.filter((sessionItem) => sessionItem.boundProfileId === activeSessionProfileId)
  }, [activeSessionProfileId, appState?.sessions, sessionListFilter])
  const contextMenuSession = useMemo(
    () =>
      sessionContextMenu
        ? appState?.sessions.find((sessionItem) => sessionItem.id === sessionContextMenu.sessionId) ?? null
        : null,
    [appState?.sessions, sessionContextMenu],
  )

  useEffect(() => {
    persistSessionDraftMap(CONTEXT_DRAFT_STORAGE_KEY, contextDrafts)
  }, [contextDrafts])

  useEffect(() => {
    if (sessionListFilter === 'project' && !activeSessionProfileId) {
      setSessionListFilter('all')
    }
  }, [activeSessionProfileId, sessionListFilter])

  useEffect(() => {
    if (!sessionContextMenu) {
      return
    }

    const dismissContextMenu = () => {
      setSessionContextMenu(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissContextMenu()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', dismissContextMenu)
    window.addEventListener('scroll', dismissContextMenu, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', dismissContextMenu)
      window.removeEventListener('scroll', dismissContextMenu, true)
    }
  }, [sessionContextMenu])

  useEffect(() => {
    if (!currentCancelableTaskKey) {
      setIsCancelDialogOpen(false)
      return
    }
  }, [currentCancelableTaskKey])

  useEffect(() => {
    if (!isCancelDialogOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCancelDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCancelDialogOpen])

  useEffect(() => {
    if (!isProfileRemoveDialogOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileRemoveDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isProfileRemoveDialogOpen])

  useEffect(() => {
    if (!selectedProfileId) {
      setIsProfileRemoveDialogOpen(false)
    }
  }, [selectedProfileId])

  useEffect(() => {
    if (!isProfileInspectorExpanded) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const previousOverscrollBehavior = document.body.style.overscrollBehavior

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'contain'

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscrollBehavior
    }
  }, [isProfileInspectorExpanded])

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    selectedProfileIdRef.current = selectedProfileId
  }, [selectedProfileId])

  useEffect(() => {
    listeningEnabledRef.current = listeningEnabled
  }, [listeningEnabled])

  useEffect(() => {
    settingsDirtyRef.current = settingsDirty
  }, [settingsDirty])

  const setActivityHintForSession = useCallback((sessionId: string, message: string) => {
    if (activeSessionIdRef.current !== sessionId) {
      return
    }

    setActivityHint(message)
  }, [])

  const setLastErrorForSession = useCallback((sessionId: string, message: string) => {
    if (activeSessionIdRef.current !== sessionId) {
      return
    }

    setLastError(message)
  }, [])

  useEffect(() => {
    if (!settingsDraft.sttConfigs.length) {
      setEditingSttConfigId(null)
      return
    }

    if (
      editingSttConfigId &&
      settingsDraft.sttConfigs.some((config) => config.id === editingSttConfigId)
    ) {
      return
    }

    setEditingSttConfigId(settingsDraft.selectedSttConfigId || settingsDraft.sttConfigs[0]?.id || null)
  }, [editingSttConfigId, settingsDraft.selectedSttConfigId, settingsDraft.sttConfigs])

  useEffect(() => {
    if (!settingsDraft.ttsConfigs.length) {
      setEditingTtsConfigId(null)
      return
    }

    if (
      editingTtsConfigId &&
      settingsDraft.ttsConfigs.some((config) => config.id === editingTtsConfigId)
    ) {
      return
    }

    setEditingTtsConfigId(settingsDraft.selectedTtsConfigId || settingsDraft.ttsConfigs[0]?.id || null)
  }, [editingTtsConfigId, settingsDraft.selectedTtsConfigId, settingsDraft.ttsConfigs])

  useEffect(() => {
    if (!isOnboardingOpen) {
      return
    }

    if (selectedSttConfig?.id && editingSttConfigId !== selectedSttConfig.id) {
      setEditingSttConfigId(selectedSttConfig.id)
    }

    if (selectedTtsConfig?.id && editingTtsConfigId !== selectedTtsConfig.id) {
      setEditingTtsConfigId(selectedTtsConfig.id)
    }
  }, [
    editingSttConfigId,
    editingTtsConfigId,
    isOnboardingOpen,
    selectedSttConfig?.id,
    selectedTtsConfig?.id,
  ])

  useEffect(() => {
    profileDirtyRef.current = profileDirty
  }, [profileDirty])

  useEffect(() => {
    isCreatingProfileDraftRef.current = isCreatingProfileDraft
  }, [isCreatingProfileDraft])

  useEffect(() => {
    if (!isOnboardingOpen) {
      onboardingPreparedRef.current = false
      return
    }

    if (onboardingPreparedRef.current) {
      return
    }

    onboardingPreparedRef.current = true
    selectedProfileIdRef.current = null
    profileSelectionSessionIdRef.current = activeSessionIdRef.current
    setSelectedProfileId(null)
    setIsCreatingProfileDraft(true)
    setProfileDirty(false)
    setProfileDraft(createEmptyProfileDraft())
    setOnboardingStep('project')
    setOnboardingMicrophonePermissionState('idle')
    setOnboardingMicrophoneMessage(
      '点击下方按钮触发系统麦克风授权，后面的语音配置和测试才会顺畅。',
    )
    setListeningEnabled(false)
    setActivityHint('先完成首次接入配置，再开始正式开发。')
  }, [isOnboardingOpen])

  useEffect(() => {
    if (!trimmedProfilePath) {
      setIsCheckingProfilePath(false)
      setProfilePathInspection({
        input: '',
        normalizedPath: '',
        exists: false,
        isAbsolute: false,
        isDirectory: false,
        isValid: false,
        message: '请输入以 / 开头的本地项目目录。',
      })
      return
    }

    if (!hasDesktopApi) {
      return
    }

    let disposed = false
    setIsCheckingProfilePath(true)

    const timer = window.setTimeout(() => {
      void desktopAgent
        .inspectWorkingDirectory(trimmedProfilePath)
        .then((inspection) => {
          if (!disposed) {
            setProfilePathInspection(inspection)
            setIsCheckingProfilePath(false)
          }
        })
        .catch((error) => {
          if (!disposed) {
            setProfilePathInspection({
              input: trimmedProfilePath,
              normalizedPath: trimmedProfilePath,
              exists: false,
              isAbsolute: trimmedProfilePath.startsWith('/'),
              isDirectory: false,
              isValid: false,
              message:
                error instanceof Error ? error.message : '目录检查失败，请稍后重试。',
            })
            setIsCheckingProfilePath(false)
          }
        })
    }, 180)

    return () => {
      disposed = true
      window.clearTimeout(timer)
    }
  }, [desktopAgent, hasDesktopApi, trimmedProfilePath])

  const handleDetectDeveloperTool = useCallback(
    async (tool: DeveloperTool, executablePath: string) => {
      if (!hasDesktopApi) {
        return null
      }

      setIsDetectingDeveloperTool(true)
      try {
        const result = await desktopAgent.detectDeveloperTool({
          tool,
          executablePath,
        })
        setDeveloperToolDetection(result)
        if (
          result.found &&
          result.resolvedPath &&
          (!executablePath.trim() ||
            executablePath.trim() === defaultExecutableNameForDeveloperTool(tool) ||
            executablePath.trim() === result.command)
        ) {
          setSettingsDraft((current) => {
            if (
              current.developerTool !== tool ||
              current.developerToolPath.trim() !== executablePath.trim()
            ) {
              return current
            }

            return {
              ...current,
              developerToolPath: result.resolvedPath,
              developerToolPaths: {
                ...current.developerToolPaths,
                [tool]: result.resolvedPath,
              },
            }
          })
        }
        return result
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : '开发工具检测失败。'
        const isMissingHandler = /No handler registered|没有注册处理器/i.test(errorMessage)
        setDeveloperToolDetection({
          tool,
          found: false,
          supported: false,
          command: executablePath.trim() || defaultExecutableNameForDeveloperTool(tool),
          resolvedPath: '',
          detail: isMissingHandler
            ? '当前桌面应用主进程还没加载开发工具检测能力，请完整重启应用后再试。'
            : errorMessage,
        })
        return null
      } finally {
        setIsDetectingDeveloperTool(false)
      }
    },
    [desktopAgent, hasDesktopApi],
  )

  useEffect(() => {
    if (!hasDesktopApi) {
      return
    }

    let disposed = false
    const timer = window.setTimeout(() => {
      if (!disposed) {
        void handleDetectDeveloperTool(
          settingsDraft.developerTool,
          settingsDraft.developerToolPath,
        )
      }
    }, 220)

    return () => {
      disposed = true
      window.clearTimeout(timer)
    }
  }, [
    handleDetectDeveloperTool,
    hasDesktopApi,
    settingsDraft.developerTool,
    settingsDraft.developerToolPath,
  ])

  const stopPlayback = useCallback(() => {
    const interruptPlayback = playbackInterruptRef.current
    playbackInterruptRef.current = null

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }

    setPlaybackActive(false)
    setPlaybackStartedAt(null)
    interruptPlayback?.(new PlaybackInterruptedError())
  }, [])

  const stopUiCuePlayback = useCallback(() => {
    if (!uiCueAudioRef.current) {
      return
    }

    uiCueAudioRef.current.pause()
    uiCueAudioRef.current.currentTime = 0
    uiCueAudioRef.current = null
  }, [])

  const setPlaybackWorkspace = useCallback(
    (
      workspace: PlaybackWorkspace,
      options?: {
        interrupt?: boolean
        reasonHint?: string
      },
    ) => {
      const previousWorkspace = playbackWorkspaceRef.current
      playbackWorkspaceRef.current = workspace

      if (
        options?.interrupt &&
        playbackActive &&
        !isSamePlaybackWorkspace(previousWorkspace, workspace)
      ) {
        stopPlayback()
        if (options.reasonHint) {
          setActivityHint(options.reasonHint)
        }
      }
    },
    [playbackActive, stopPlayback],
  )

  useEffect(() => () => stopUiCuePlayback(), [stopUiCuePlayback])

  useEffect(() => {
    if (!settingsDraft.audioMuted) {
      return
    }

    stopPlayback()
    stopUiCuePlayback()
  }, [settingsDraft.audioMuted, stopPlayback, stopUiCuePlayback])

  useEffect(
    () => () => {
      Object.values(sessionAttentionTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      sessionAttentionTimeoutsRef.current = {}
    },
    [],
  )

  const cueSessionCard = useCallback((sessionId: string, tone: 'success' | 'error') => {
    if (!sessionId) {
      return
    }

    const existingTimeout = sessionAttentionTimeoutsRef.current[sessionId]
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    setSessionAttentionCues((current) => ({
      ...current,
      [sessionId]: tone,
    }))

    sessionAttentionTimeoutsRef.current[sessionId] = window.setTimeout(() => {
      setSessionAttentionCues((current) => {
        if (!(sessionId in current)) {
          return current
        }

        const next = { ...current }
        delete next[sessionId]
        return next
      })
      delete sessionAttentionTimeoutsRef.current[sessionId]
    }, 1600)
  }, [])

  const cueBackgroundSessionCards = useCallback(
    (cue: {
      completedSessionIds: string[]
      failedSessionIds: string[]
    }) => {
      cue.completedSessionIds.forEach((sessionId) => {
        cueSessionCard(sessionId, 'success')
      })
      cue.failedSessionIds.forEach((sessionId) => {
        cueSessionCard(sessionId, 'error')
      })
    },
    [cueSessionCard],
  )

  useEffect(() => {
    setPlaybackWorkspace(currentPlaybackWorkspace, {
      interrupt: true,
      reasonHint: '已切换到新的项目上下文，上一条任务的语音播报已暂停。',
    })
  }, [currentPlaybackWorkspace, setPlaybackWorkspace])

  const speakWithBrowser = useCallback(
    async (text: string, language: string) => {
      if (!text.trim()) {
        return {
          played: false,
          provider: 'browser',
          reason: 'empty_text',
        }
      }

      if (settingsDraft.audioMuted) {
        return {
          played: false,
          provider: 'browser',
          reason: 'audio_muted',
        }
      }

      if (!('speechSynthesis' in window)) {
        throw new Error('浏览器语音能力不可用。')
      }

      stopPlayback()
      setPlaybackActive(true)
      setPlaybackStartedAt(Date.now())

      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        let settled = false
        const finish = (
          callback: () => void,
          result?: Record<string, unknown>,
        ) => {
          if (settled) {
            return
          }

          settled = true
          playbackInterruptRef.current = null
          callback()
          if (result) {
            resolve(result)
          }
        }
        const timeoutId = window.setTimeout(() => {
          finish(() => {
            setPlaybackActive(false)
            setPlaybackStartedAt(null)
            window.speechSynthesis.cancel()
            reject(new Error('浏览器语音播放超时。'))
          })
        }, 12000)
        playbackInterruptRef.current = (error) => {
          finish(() => {
            window.clearTimeout(timeoutId)
            reject(error)
          })
        }
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = language
        utterance.rate = 1.03
        utterance.pitch = 1
        utterance.addEventListener('end', () => {
          finish(
            () => {
              window.clearTimeout(timeoutId)
              setPlaybackActive(false)
              setPlaybackStartedAt(null)
            },
            {
              played: true,
              provider: 'browser',
              source: 'speech_synthesis',
            },
          )
        })
        utterance.addEventListener('error', () => {
          finish(() => {
            window.clearTimeout(timeoutId)
            setPlaybackActive(false)
            setPlaybackStartedAt(null)
            reject(new Error('浏览器语音播放失败。'))
          })
        })
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utterance)
      })
    },
    [settingsDraft.audioMuted, stopPlayback],
  )

  const playSynthesizedAudio = useCallback(
    async (payload: SynthesisResult) => {
      if (settingsDraft.audioMuted) {
        return {
          played: false,
          provider: payload.provider || 'synthesized',
          source: 'synthesized',
          reason: 'audio_muted',
        }
      }

      stopPlayback()
      setPlaybackActive(true)
      setPlaybackStartedAt(Date.now())
      const binary = atob(payload.audioBase64)
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      const blob = new Blob([bytes], { type: payload.mimeType })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        let settled = false
        const handleEnded = () => {
          finish(
            () => {
              setPlaybackActive(false)
              setPlaybackStartedAt(null)
            },
            {
              played: true,
              provider: payload.provider || 'synthesized',
              source: 'synthesized',
            },
          )
        }
        const handleError = () => {
          finish(() => {
            setPlaybackActive(false)
            setPlaybackStartedAt(null)
            reject(new Error('播放合成语音失败。'))
          })
        }
        const release = () => {
          audio.removeEventListener('ended', handleEnded)
          audio.removeEventListener('error', handleError)
          URL.revokeObjectURL(url)
          if (audioRef.current === audio) {
            audioRef.current = null
          }
        }
        const finish = (
          callback: () => void,
          result?: Record<string, unknown>,
        ) => {
          if (settled) {
            return
          }

          settled = true
          playbackInterruptRef.current = null
          release()
          callback()
          if (result) {
            resolve(result)
          }
        }

        playbackInterruptRef.current = (error) => {
          finish(() => {
            reject(error)
          })
        }

        audio.addEventListener('ended', handleEnded)
        audio.addEventListener('error', handleError)
        void audio.play().catch((error) => {
          finish(() => {
            reject(error instanceof Error ? error : new Error('播放合成语音失败。'))
          })
        })
      })
    },
    [settingsDraft.audioMuted, stopPlayback],
  )

  const playUiCue = useCallback(
    async (
      sourceUrl: string,
      cueId: 'voice_accepted' | 'voice_rejected' | 'task_success',
    ) => {
      if (settingsDraft.audioMuted) {
        return {
          played: false,
          provider: 'html_audio',
          source: 'asset',
          cueId,
          reason: 'audio_muted',
        }
      }

      if (typeof Audio === 'undefined') {
        return {
          played: false,
          provider: 'none',
          cueId,
          reason: 'html_audio_unavailable',
        }
      }

      stopUiCuePlayback()
      const audio = new Audio(sourceUrl)
      audio.preload = 'auto'
      uiCueAudioRef.current = audio

      return await new Promise<Record<string, unknown>>((resolve) => {
        let settled = false

        const release = () => {
          audio.removeEventListener('ended', handleEnded)
          audio.removeEventListener('error', handleError)
          if (uiCueAudioRef.current === audio) {
            uiCueAudioRef.current = null
          }
        }

        const finish = (result: Record<string, unknown>) => {
          if (settled) {
            return
          }

          settled = true
          release()
          resolve(result)
        }

        const handleEnded = () => {
          finish({
            played: true,
            provider: 'html_audio',
            source: 'asset',
            cueId,
            durationMs: Number.isFinite(audio.duration)
              ? Math.round(audio.duration * 1000)
              : null,
          })
        }

        const handleError = () => {
          finish({
            played: false,
            provider: 'html_audio',
            source: 'asset',
            cueId,
            reason: 'audio_element_error',
          })
        }

        audio.addEventListener('ended', handleEnded)
        audio.addEventListener('error', handleError)

        void audio.play().catch((error) => {
          finish({
            played: false,
            provider: 'html_audio',
            source: 'asset',
            cueId,
            reason: error instanceof Error ? error.message : 'unknown_error',
          })
        })
      })
    },
    [settingsDraft.audioMuted, stopUiCuePlayback],
  )

  const playRecognitionChime = useCallback(
    async () => playUiCue(voiceAcceptedCueUrl, 'voice_accepted'),
    [playUiCue],
  )

  const playTaskSuccessChime = useCallback(
    async () => playUiCue(taskSuccessCueUrl, 'task_success'),
    [playUiCue],
  )

  const playErrorChime = useCallback(
    async () => playUiCue(voiceRejectedCueUrl, 'voice_rejected'),
    [playUiCue],
  )

  const playAcknowledgementCue = useCallback(
    async (cue: AcknowledgementCue) => {
      if (cue.type === 'file') {
        return await playSynthesizedAudio({
          audioBase64: cue.audioBase64,
          mimeType: cue.mimeType,
          provider: 'local',
        })
      }

      return await speakWithBrowser(
        cue.text,
        cue.language === 'en' ? 'en-US' : 'zh-CN',
      )
    },
    [playSynthesizedAudio, speakWithBrowser],
  )

  const logClientEvent = useCallback(
    async (
      kind: string,
      payload: Record<string, unknown>,
      target:
        | string
        | null
        | {
            sessionId?: string | null
            taskId?: string | null
          }
        | undefined = activeSessionIdRef.current,
    ) => {
      const sessionId =
        typeof target === 'string' ? target : target?.sessionId ?? activeSessionIdRef.current
      const taskId = typeof target === 'string' ? null : target?.taskId ?? null

      if (!hasDesktopApi || !sessionId) {
        return
      }

      try {
        await desktopAgent.logClientEvent({
          sessionId,
          taskId,
          kind,
          payload,
        })
      } catch {
        // Keep diagnostics non-blocking for the UI flow.
      }
    },
    [desktopAgent, hasDesktopApi],
  )

  const playBackgroundTaskCue = useCallback(
    async (cue: { tone: 'success' | 'error'; primarySessionId: string; sessionIds: string[] }) => {
      const playbackResult =
        cue.tone === 'error' ? await playErrorChime() : await playTaskSuccessChime()

      await logClientEvent(
        'background_task_cue',
        {
          ...playbackResult,
          tone: cue.tone,
          source: 'background_session_terminal',
          sessionIds: cue.sessionIds,
        },
        cue.primarySessionId,
      )
    },
    [logClientEvent, playErrorChime, playTaskSuccessChime],
  )

  const speakTurnResult = useCallback(
    async (result: TurnExecutionResult, trigger: ResultPlaybackTrigger) => {
      if (!result.spokenReply?.trim()) {
        return
      }

      if (!hasDesktopApi) {
        return
      }

      const activeWorkspace = playbackWorkspaceRef.current
      if (!canPlayTurnResultForWorkspace(result, activeWorkspace)) {
        await logClientEvent(
          'result_playback_skipped',
          {
            source: 'turn_result',
            trigger,
            taskId: result.taskId,
            reason: 'inactive_workspace',
            activeSessionId: activeWorkspace.sessionId,
            activeWorkingDirectory: activeWorkspace.workingDirectory,
            resultWorkingDirectory: normalizeWorkingDirectory(result.workingDirectory),
          },
          {
            sessionId: result.sessionId,
            taskId: result.taskId,
          },
        )
        return
      }

      if (settingsDraft.audioMuted) {
        await logClientEvent(
          'result_playback_skipped',
          {
            source: 'turn_result',
            trigger,
            taskId: result.taskId,
            reason: 'audio_muted',
          },
          {
            sessionId: result.sessionId,
            taskId: result.taskId,
          },
        )
        return
      }

      if (settingsDraft.ttsProvider === 'browser') {
        try {
          const browserPlayback = await speakWithBrowser(
            result.spokenReply,
            settingsDraft.workingLanguage,
          )
          if (isAudioMutedPlaybackResult(browserPlayback)) {
            await logClientEvent(
              'result_playback_skipped',
              {
                source: 'turn_result',
                trigger,
                taskId: result.taskId,
                reason: 'audio_muted',
              },
              {
                sessionId: result.sessionId,
                taskId: result.taskId,
              },
            )
            return
          }
          await logClientEvent(
            'result_playback',
            {
              ...browserPlayback,
              provider: 'browser',
              source: 'turn_result',
              trigger,
              taskId: result.taskId,
              fallback: false,
            },
            {
              sessionId: result.sessionId,
              taskId: result.taskId,
            },
          )
          return
        } catch (error) {
          if (isPlaybackInterruptedError(error)) {
            await logClientEvent(
              'result_playback_skipped',
              {
                source: 'turn_result',
                trigger,
                taskId: result.taskId,
                reason: 'playback_interrupted',
              },
              {
                sessionId: result.sessionId,
                taskId: result.taskId,
              },
            )
            return
          }

          const reason = error instanceof Error ? error.message : 'browser_tts_failed'
          await logClientEvent(
            'result_playback',
            {
              provider: 'browser',
              source: 'turn_result',
              trigger,
              taskId: result.taskId,
              fallback: false,
              success: false,
              reason,
            },
            {
              sessionId: result.sessionId,
              taskId: result.taskId,
            },
          )

          const synthesized = await desktopAgent.synthesizeSpeech({
            text: result.spokenReply,
          })
          try {
            const fallbackPlayback = await playSynthesizedAudio(synthesized)
            if (isAudioMutedPlaybackResult(fallbackPlayback)) {
              await logClientEvent(
                'result_playback_skipped',
                {
                  source: 'turn_result',
                  trigger,
                  taskId: result.taskId,
                  reason: 'audio_muted',
                },
                {
                  sessionId: result.sessionId,
                  taskId: result.taskId,
                },
              )
              return
            }
            await logClientEvent(
              'result_playback',
              {
                ...fallbackPlayback,
                provider: synthesized.provider,
                source: 'turn_result',
                trigger,
                taskId: result.taskId,
                fallback: true,
                reason,
              },
              {
                sessionId: result.sessionId,
                taskId: result.taskId,
              },
            )
          } catch (fallbackError) {
            if (isPlaybackInterruptedError(fallbackError)) {
              await logClientEvent(
                'result_playback_skipped',
                {
                  source: 'turn_result',
                  trigger,
                  taskId: result.taskId,
                  reason: 'playback_interrupted',
                },
                {
                  sessionId: result.sessionId,
                  taskId: result.taskId,
                },
              )
              return
            }

            throw fallbackError
          }
          setActivityHint('系统播报失败，已回退到可用的云端 TTS 配置。')
          return
        }
      }

      try {
        const synthesized = await desktopAgent.synthesizeSpeech({
          text: result.spokenReply,
        })
        const playbackResult = await playSynthesizedAudio(synthesized)
        if (isAudioMutedPlaybackResult(playbackResult)) {
          await logClientEvent(
            'result_playback_skipped',
            {
              source: 'turn_result',
              trigger,
              taskId: result.taskId,
              reason: 'audio_muted',
            },
            {
              sessionId: result.sessionId,
              taskId: result.taskId,
            },
          )
          return
        }
        await logClientEvent(
          'result_playback',
          {
            ...playbackResult,
            provider: settingsDraft.ttsProvider,
            source: 'turn_result',
            trigger,
            taskId: result.taskId,
          },
          {
            sessionId: result.sessionId,
            taskId: result.taskId,
          },
        )
      } catch (error) {
        if (isPlaybackInterruptedError(error)) {
          await logClientEvent(
            'result_playback_skipped',
            {
              source: 'turn_result',
              trigger,
              taskId: result.taskId,
              reason: 'playback_interrupted',
            },
            {
              sessionId: result.sessionId,
              taskId: result.taskId,
            },
          )
          return
        }

        throw error
      }
    },
    [
      desktopAgent,
      hasDesktopApi,
      logClientEvent,
      playSynthesizedAudio,
      settingsDraft.audioMuted,
      settingsDraft.ttsProvider,
      settingsDraft.workingLanguage,
      speakWithBrowser,
    ],
  )

  const playTurnResultWithDedup = useCallback(
    async (
      result: TurnExecutionResult,
      trigger: ResultPlaybackTrigger,
    ) => {
      const taskId = result.taskId?.trim()

      if (taskId && (handledResultPlaybackTaskIds.has(taskId) || activeResultPlaybackTaskIds.has(taskId))) {
        await logClientEvent(
          'result_playback_skipped',
          {
            source: 'turn_result',
            trigger,
            taskId,
            reason: handledResultPlaybackTaskIds.has(taskId)
              ? 'already_played'
              : 'already_in_flight',
          },
          {
            sessionId: result.sessionId,
            taskId,
          },
        )
        return
      }

      if (taskId) {
        activeResultPlaybackTaskIds.add(taskId)
      }

      try {
        await speakTurnResult(result, trigger)
        if (taskId) {
          rememberHandledResultPlaybackTaskId(taskId)
        }
      } finally {
        if (taskId) {
          activeResultPlaybackTaskIds.delete(taskId)
        }
      }
    },
    [logClientEvent, speakTurnResult],
  )

  const loadData = useCallback(
    async (preferredSessionId?: string | null) => {
      if (!hasDesktopApi) {
        return
      }

      const state = await desktopAgent.getAppState()
      const normalizedSettings = normalizeRendererSettings(state.settings)
      const normalizedState = {
        ...state,
        settings: normalizedSettings,
      }
      const sessionId =
        preferredSessionId ?? normalizedState.activeSessionId ?? normalizedState.sessions[0]?.id ?? null
      const detail = sessionId ? await desktopAgent.getSessionDetail(sessionId) : null
      const backgroundTaskCue = detectBackgroundTaskCue(
        previousSessionSummariesRef.current,
        normalizedState.sessions,
        normalizedState.activeSessionId,
      )
      previousSessionSummariesRef.current = normalizedState.sessions

      startTransition(() => {
        setAppState(normalizedState)
        setSessionDetail(detail)

        if (!settingsDirtyRef.current) {
          setSettingsDraft(normalizedSettings)
        }

        const shouldStayOnNewDraft = isCreatingProfileDraftRef.current
        const nextProfile = resolveInspectorProfile({
          profiles: normalizedState.profiles,
          detail,
          selectedProfileId: selectedProfileIdRef.current,
          preferSelectedProfile:
            profileSelectionSessionIdRef.current === sessionId &&
            !profileDirtyRef.current,
          creatingDraft: shouldStayOnNewDraft,
        })

        if (!profileDirtyRef.current) {
          setSelectedProfileId(nextProfile?.id ?? null)
          setIsCreatingProfileDraft(!nextProfile)
          setProfileDraft(createProfileDraft(nextProfile))
          profileSelectionSessionIdRef.current = sessionId
        }

        if (!autoStartAppliedRef.current) {
          setListeningEnabled(
            normalizedSettings.onboardingCompleted ? normalizedSettings.autoStartListening : false,
          )
          autoStartAppliedRef.current = true
        }
      })

      if (backgroundTaskCue) {
        cueBackgroundSessionCards(backgroundTaskCue)
        void playBackgroundTaskCue(backgroundTaskCue)
      }
    },
    [cueBackgroundSessionCards, desktopAgent, hasDesktopApi, playBackgroundTaskCue],
  )

  useEffect(() => {
    if (!isSessionScrollHarness || !sessionScrollHarness) {
      return
    }

    const normalizedSettings = normalizeRendererSettings(sessionScrollHarness.appState.settings)

    startTransition(() => {
      setAppState({
        ...sessionScrollHarness.appState,
        settings: normalizedSettings,
      })
      setSessionDetail(sessionScrollHarness.sessionDetail)
      setSettingsDraft(normalizedSettings)
      setListeningEnabled(normalizedSettings.autoStartListening)
      setLastError('')
      setActivityHint('浏览器滚动调试模式已就绪。')
      setPhase('ready')
      setSelectedProfileId(sessionScrollHarness.sessionDetail.boundProfile?.id ?? null)
      setIsCreatingProfileDraft(false)
      setProfileDraft(createProfileDraft(sessionScrollHarness.sessionDetail.boundProfile))
      profileSelectionSessionIdRef.current = sessionScrollHarness.appState.activeSessionId
      autoStartAppliedRef.current = true
    })
  }, [isSessionScrollHarness, sessionScrollHarness])

  useEffect(() => {
    if (!hasDesktopApi) {
      if (isSessionScrollHarness) {
        return
      }

      setPhase('error')
      setLastError('当前不在 Electron 环境，请使用 npm run dev:desktop 启动。')
      return
    }

    let disposed = false

    void loadData().then(
      () => {
        if (!disposed) {
          setPhase('ready')
          setActivityHint('系统已就绪。当前激活会话将接收语音输入。')
        }
      },
      (error) => {
        if (!disposed) {
          setPhase('error')
          setLastError(error instanceof Error ? error.message : '读取应用状态失败。')
        }
      },
    )

    const unsubscribe = desktopAgent.onStateChanged(() => {
      void loadData(activeSessionIdRef.current)
    })

    return () => {
      disposed = true
      unsubscribe()
      stopPlayback()
    }
  }, [desktopAgent, hasDesktopApi, isSessionScrollHarness, loadData, stopPlayback])

  useEffect(() => {
    if (!hasDesktopApi) {
      return
    }

    let disposed = false

    void desktopAgent.getAppMeta().then(
      (meta) => {
        if (!disposed) {
          setAppMeta({
            name: normalizeAppDisplayName(meta.name),
            version: meta.version,
          })
        }
      },
      () => {
        // Keep the built-in fallback label if metadata cannot be loaded.
      },
    )

    return () => {
      disposed = true
    }
  }, [desktopAgent, hasDesktopApi])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.themePreset = normalizeThemePreset(settingsDraft.themePreset)

    return () => {
      delete root.dataset.themePreset
    }
  }, [settingsDraft.themePreset])

  useEffect(() => {
    if (!isSettingsWorkspaceOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsWorkspaceOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSettingsWorkspaceOpen])

  useEffect(() => {
    if (!activeSessionId || !hasDesktopApi) {
      return
    }

    void desktopAgent
      .getSessionDetail(activeSessionId)
      .then((detail) => {
        if (!detail) {
          return
        }

        startTransition(() => {
          setSessionDetail(detail)
          if (!profileDirtyRef.current) {
            const selected = resolveInspectorProfile({
              profiles: appState?.profiles ?? [],
              detail,
              selectedProfileId: selectedProfileIdRef.current,
              preferSelectedProfile:
                profileSelectionSessionIdRef.current === activeSessionId &&
                !profileDirtyRef.current,
              creatingDraft: isCreatingProfileDraftRef.current,
            })
            setSelectedProfileId(selected?.id ?? null)
            setIsCreatingProfileDraft(!selected)
            setProfileDraft(selected ? createProfileDraft(selected) : createEmptyProfileDraft())
            profileSelectionSessionIdRef.current = activeSessionId
          }
        })
      })
      .catch((error) => {
        setLastError(error instanceof Error ? error.message : '读取会话详情失败。')
      })
  }, [activeSessionId, appState?.profiles, desktopAgent, hasDesktopApi, selectedProfileId])

  useEffect(() => {
    if (transcriptListRef.current) {
      transcriptListRef.current.scrollTop = 0
    }
  }, [conversationMessages.length, activeSessionId])

  const phaseStartedAt = useMemo(() => {
    if (playbackActive && playbackStartedAt) {
      return playbackStartedAt
    }
    if (currentLocalStage) {
      return currentLocalStage.startedAt
    }
    if (activeTask?.startedAt) {
      return new Date(activeTask.startedAt).getTime()
    }
    return null
  }, [activeTask?.startedAt, currentLocalStage, playbackActive, playbackStartedAt])

  useEffect(() => {
    if (!phaseStartedAt) {
      setPhaseElapsedSeconds(0)
      return
    }

    const tick = () => {
      setPhaseElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - phaseStartedAt) / 1000)),
      )
    }

    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [phaseStartedAt])

  useEffect(() => {
    if (lastError) {
      setPhase('error')
      return
    }

    if (playbackActive) {
      setPhase('speaking')
      return
    }

    if (currentLocalStage?.phase === 'transcribing') {
      setPhase('transcribing')
      return
    }

    if (currentLocalStage?.phase === 'submitting' || activeTask) {
      setPhase('submitting')
      return
    }

    if (listeningEnabled) {
      setPhase('listening')
      return
    }

    setPhase('ready')
  }, [activeTask, currentLocalStage, lastError, listeningEnabled, playbackActive])

  const setSessionMessageDraft = useCallback((sessionId: string, value: string) => {
    setMessageDrafts((current) => ({
      ...current,
      [sessionId]: value,
    }))
  }, [])

  const setSessionContextDraft = useCallback((sessionId: string, value: string) => {
    setContextDrafts((current) => ({
      ...current,
      [sessionId]: value,
    }))
  }, [])
  const restoreSessionMessageDraftIfEmpty = useCallback(
    (sessionId: string, value: string) => {
      const nextValue = value.trim()
      if (!sessionId || !nextValue) {
        return
      }

      setMessageDrafts((current) => {
        if ((current[sessionId] ?? '').trim()) {
          return current
        }

        return {
          ...current,
          [sessionId]: nextValue,
        }
      })
    },
    [],
  )
  const restoreSessionContextDraftIfEmpty = useCallback(
    (sessionId: string, value: string) => {
      const nextValue = value.trim()
      if (!sessionId || !nextValue) {
        return
      }

      setContextDrafts((current) => {
        if ((current[sessionId] ?? '').trim()) {
          return current
        }

        return {
          ...current,
          [sessionId]: nextValue,
        }
      })
    },
    [],
  )

  const markStage = useCallback((sessionId: string, nextPhase: LocalStagePhase) => {
    setLocalStages((current) => ({
      ...current,
      [sessionId]: {
        phase: nextPhase,
        startedAt: Date.now(),
      },
    }))
  }, [])

  const clearStage = useCallback((sessionId: string) => {
    setLocalStages((current) => {
      const next = { ...current }
      delete next[sessionId]
      return next
    })
  }, [])

  useEffect(() => {
    if (!activeSessionId || !currentLocalStage || activeTask) {
      return
    }

    // Local stage is only a renderer hint. If the backend no longer reports an active task,
    // clear the residue so the UI does not stay stuck in "submitting".
    const timer = window.setTimeout(() => {
      clearStage(activeSessionId)
    }, 1500)

    return () => window.clearTimeout(timer)
  }, [activeSessionId, activeTask, clearStage, currentLocalStage])

  useEffect(() => {
    const latestVoiceReadyEvent = sessionDetail?.events.find(
      (event) => event.kind === 'voice_intent_ready',
    )
    const currentSessionId = activeSessionIdRef.current
    const voiceReadyTimestamp = latestVoiceReadyEvent
      ? new Date(latestVoiceReadyEvent.createdAt).getTime()
      : NaN

    if (
      !currentSessionId ||
      !hasDesktopApi ||
      !latestVoiceReadyEvent ||
      !Number.isFinite(voiceReadyTimestamp) ||
      currentLocalStage?.phase !== 'transcribing' ||
      voiceReadyTimestamp < (currentLocalStage?.startedAt ?? 0) ||
      handledVoiceIntentEventIdsRef.current.has(latestVoiceReadyEvent.id)
    ) {
      return
    }

    handledVoiceIntentEventIdsRef.current.add(latestVoiceReadyEvent.id)
    markStage(currentSessionId, 'submitting')

    void (async () => {
      const route =
        typeof latestVoiceReadyEvent.payload?.route === 'string'
          ? latestVoiceReadyEvent.payload.route
          : 'codex'

      if (route !== 'codex') {
        setActivityHint('识别完成，正在处理本地指令。')
        return
      }

      try {
        const cue = await desktopAgent.getAcknowledgementCue(settingsDraft.workingLanguage)
        const playbackResult = await playAcknowledgementCue(cue)
        await logClientEvent(
          'ack_playback',
          {
            ...playbackResult,
            provider: cue.type === 'file' ? 'asset' : 'browser',
            fallback: false,
            language: cue.language,
            stage: 'post_transcribe',
          },
          currentSessionId,
        )
        if (isAudioMutedPlaybackResult(playbackResult)) {
          setActivityHint('识别完成，当前已全局静音，直接提交当前会话任务。')
          return
        }
        setActivityHint(
          cue.type === 'file'
            ? '识别完成，已播放本地确认语音，正在提交当前会话任务。'
            : '识别完成，正在使用系统确认语音，随后提交当前会话任务。',
        )
      } catch (error) {
        if (isPlaybackInterruptedError(error)) {
          await logClientEvent(
            'ack_playback',
            {
              provider: 'interrupted',
              fallback: false,
              language: settingsDraft.workingLanguage,
              reason: 'playback_interrupted',
              stage: 'post_transcribe',
            },
            currentSessionId,
          )
          return
        }

        const fallbackResult = await speakWithBrowser(
          acknowledgementFallbackText(settingsDraft.workingLanguage),
          settingsDraft.workingLanguage,
        ).catch(() => null)
        await logClientEvent(
          'ack_playback',
          {
            ...(fallbackResult || {}),
            provider: 'browser',
            fallback: true,
            language: settingsDraft.workingLanguage,
            reason:
              fallbackResult && !isAudioMutedPlaybackResult(fallbackResult)
                ? fallbackResult.reason
                : 'post_transcribe_ack_failed',
            stage: 'post_transcribe',
          },
          currentSessionId,
        )
        if (isAudioMutedPlaybackResult(fallbackResult)) {
          setActivityHint('识别完成，当前已全局静音，直接提交当前会话任务。')
          return
        }
        setActivityHint('本地确认语音播放失败，已回退到系统确认语音。')
      }
    })()
  }, [
    currentLocalStage?.phase,
    currentLocalStage?.startedAt,
    desktopAgent,
    hasDesktopApi,
    logClientEvent,
    markStage,
    playAcknowledgementCue,
    sessionDetail?.events,
    settingsDraft.workingLanguage,
    speakWithBrowser,
  ])

  const handleVoiceUtterance = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (!hasDesktopApi) {
        return
      }

      const sessionId = activeSessionIdRef.current
      if (!sessionId) {
        return
      }

      const stagedContext = contextDrafts[sessionId]?.trim() || ''

      try {
        setLastError('')
        setActivityHintForSession(sessionId, '收到语音片段，正在识别。')
        markStage(sessionId, 'transcribing')
        void playRecognitionChime()
          .then((result) =>
            logClientEvent(
              'voice_chime',
              {
                ...result,
                stage: 'pre_transcribe',
              },
              sessionId,
            ),
          )
          .catch((error) =>
            logClientEvent(
              'voice_chime',
              {
                played: false,
                provider: 'webaudio',
                stage: 'pre_transcribe',
                reason: error instanceof Error ? error.message : 'unknown_error',
              },
              sessionId,
            ),
          )

        let uploadBlob = blob
        let uploadMimeType = mimeType

        if (
          selectedSttConfig?.kind === 'volcengine_speech' &&
          !mimeType.toLowerCase().includes('wav') &&
          !mimeType.toLowerCase().includes('mpeg') &&
          !mimeType.toLowerCase().includes('mp3') &&
          !mimeType.toLowerCase().includes('ogg') &&
          !mimeType.toLowerCase().includes('opus')
        ) {
          uploadBlob = await convertAudioBlobToWav(blob)
          uploadMimeType = 'audio/wav'
        }

        const audioBase64 = await blobToBase64(uploadBlob)

        if (stagedContext) {
          setSessionContextDraft(sessionId, '')
        }

        const result = await desktopAgent.submitVoiceTurn({
          sessionId,
          audioBase64,
          mimeType: uploadMimeType,
          pendingText: stagedContext,
          captureMode: activeVoiceInputMode,
        })

        if (
          stagedContext &&
          (result.status === 'failed' || (result.status === 'cancelled' && result.feedbackTone === 'error'))
        ) {
          restoreSessionContextDraftIfEmpty(sessionId, stagedContext)
        }

        if (result.status === 'failed') {
          setLastErrorForSession(sessionId, result.uiReply)
        } else if (result.status === 'cancelled') {
          setActivityHintForSession(sessionId, '本轮语音输入未进入任务执行。')
          if (result.feedbackTone === 'error') {
            void playErrorChime()
              .then((chimeResult) =>
                logClientEvent(
                  'voice_reject_chime',
                  {
                    ...chimeResult,
                    reason: 'voice_turn_rejected',
                  },
                  sessionId,
                ),
              )
              .catch((error) =>
                logClientEvent(
                  'voice_reject_chime',
                  {
                    played: false,
                    provider: 'webaudio',
                    reason: error instanceof Error ? error.message : 'unknown_error',
                  },
                  sessionId,
                ),
              )
          }
        } else {
          setActivityHintForSession(sessionId, result.nextActionHint || '语音任务已完成。')
        }

        await playTurnResultWithDedup(result, 'submit_return')
      } catch (error) {
        restoreSessionContextDraftIfEmpty(sessionId, stagedContext)
        const message =
          error instanceof Error ? error.message : '语音任务执行失败。'
        setLastErrorForSession(sessionId, message)
      } finally {
        clearStage(sessionId)
      }
    },
    [
      clearStage,
      contextDrafts,
      desktopAgent,
      hasDesktopApi,
      markStage,
      activeVoiceInputMode,
      playErrorChime,
      logClientEvent,
      playRecognitionChime,
      playTurnResultWithDedup,
      restoreSessionContextDraftIfEmpty,
      selectedSttConfig?.kind,
      setActivityHintForSession,
      setLastErrorForSession,
      setSessionContextDraft,
    ],
  )

  const isVoiceLoopSuspended =
    !activeSessionId ||
    playbackActive ||
    Boolean(currentLocalStage) ||
    Boolean(activeTask)

  const classicVoiceLoop = useVoiceLoop({
    enabled:
      hasDesktopApi &&
      (listeningEnabled || onboardingMicrophonePreviewEnabled) &&
      activeVoiceInputMode === 'classic',
    suspended: isVoiceLoopSuspended || isOnboardingOpen,
    onUtterance: handleVoiceUtterance,
    onError: (message) => {
      setLastError(message)
    },
  })

  const vadVoiceLoop = useVadVoiceLoop({
    enabled:
      hasDesktopApi &&
      (listeningEnabled || onboardingMicrophonePreviewEnabled) &&
      activeVoiceInputMode === 'vad_beta',
    suspended: isVoiceLoopSuspended || isOnboardingOpen,
    onUtterance: handleVoiceUtterance,
    onError: (message) => {
      setLastError(message)
    },
  })

  const {
    cancelCurrentUtterance,
    hasPermission,
    isCalibrating,
    isSpeechDetected,
    level,
    voicePhase,
  } = activeVoiceInputMode === 'vad_beta' ? vadVoiceLoop : classicVoiceLoop

  useEffect(() => {
    if (!isOnboardingOpen || onboardingStep !== 'voice' || !hasPermission) {
      return
    }

    setOnboardingMicrophonePermissionState((current) =>
      current === 'granted' ? current : 'granted',
    )
    setOnboardingMicrophoneMessage('麦克风已就绪。现在说一句话，确认下方电平条会动。')
  }, [hasPermission, isOnboardingOpen, onboardingStep])

  const handleSaveSettings = useCallback(async () => {
    if (!hasDesktopApi) {
      return
    }

    setIsSavingSettings(true)
    try {
      const saved = await desktopAgent.saveSettings(settingsDraft)
      setSettingsDraft(normalizeRendererSettings(saved))
      setSettingsDirty(false)
      setDraftSttConfigIds([])
      setDraftTtsConfigIds([])
      setLastError('')
      setActivityHint(saved.audioMuted ? '设置已保存，全局静音已开启。' : '设置已保存。')
      await loadData(activeSessionIdRef.current)
    } catch (error) {
      setLastError(error instanceof Error ? error.message : '保存设置失败。')
    } finally {
      setIsSavingSettings(false)
    }
  }, [desktopAgent, hasDesktopApi, loadData, settingsDraft])

  const handleCancelSettings = useCallback(() => {
    const savedSettings = normalizeRendererSettings(appState?.settings ?? DEFAULT_SETTINGS)
    setSettingsDraft(savedSettings)
    setSettingsDirty(false)
    setDraftSttConfigIds([])
    setDraftTtsConfigIds([])
    setDeveloperToolDetection(null)
    setSttConfigTestResult(null)
    setTtsConfigTestResult(null)
    setLastError('')
    setActivityHint('已取消全局设置修改。')
  }, [appState?.settings])

  const handleOpenSettingsWorkspace = useCallback(() => {
    setIsSettingsWorkspaceOpen(true)
    setActiveSettingsWorkspaceDrawer(null)
    setIsSettingsInspectorExpanded(false)
    setIsSttInspectorExpanded(false)
    setIsTtsInspectorExpanded(false)
    setLastError('')
    setActivityHint('已打开系统设置。')
  }, [])

  const handleCloseSettingsWorkspace = useCallback(() => {
    setIsSettingsWorkspaceOpen(false)
    setActiveSettingsWorkspaceDrawer(null)
  }, [])

  const handleOpenProjectGithub = useCallback(async () => {
    try {
      if (hasDesktopApi && typeof desktopAgent.openExternal === 'function') {
        await desktopAgent.openExternal(PROJECT_GITHUB_URL)
      } else {
        window.open(PROJECT_GITHUB_URL, '_blank', 'noopener,noreferrer')
      }
      setActivityHint('已打开 GitHub 项目主页。')
    } catch (error) {
      setLastError(error instanceof Error ? error.message : '打开 GitHub 项目主页失败。')
    }
  }, [desktopAgent, hasDesktopApi])

  const handlePickOnboardingDirectory = useCallback(async () => {
    if (!hasDesktopApi) {
      return
    }

    try {
      const selectedDirectory = await desktopAgent.pickDirectory({
        defaultPath: trimmedProfilePath || settingsDraft.workingDirectory,
      })
      if (!selectedDirectory) {
        return
      }

      const nextProjectName = deriveProjectNameFromDirectory(selectedDirectory)
      setProfileDraft((current) => ({
        ...current,
        workingDirectory: selectedDirectory,
        name: nextProjectName || current.name,
      }))
      setProfileDirty(true)
      setLastError('')
    } catch (error) {
      setLastError(error instanceof Error ? error.message : '选择项目目录失败。')
    }
  }, [desktopAgent, hasDesktopApi, settingsDraft.workingDirectory, trimmedProfilePath])

  const handlePickProfileDirectory = useCallback(async () => {
    if (!hasDesktopApi || isEditingSavedProfile) {
      return
    }

    try {
      const selectedDirectory = await desktopAgent.pickDirectory({
        defaultPath: trimmedProfilePath || settingsDraft.workingDirectory,
      })
      if (!selectedDirectory) {
        return
      }

      const nextProjectName = deriveProjectNameFromDirectory(selectedDirectory)
      setProfileDraft((current) => ({
        ...current,
        workingDirectory: selectedDirectory,
        name: nextProjectName || current.name,
      }))
      setProfileDirty(true)
      setLastError('')
    } catch (error) {
      setLastError(error instanceof Error ? error.message : '选择项目目录失败。')
    }
  }, [
    desktopAgent,
    hasDesktopApi,
    isEditingSavedProfile,
    settingsDraft.workingDirectory,
    trimmedProfilePath,
  ])

  const handleOpenSettingsWorkspaceDrawer = useCallback(
    (drawer: SettingsWorkspaceDrawer) => {
      setActiveSettingsWorkspaceDrawer(drawer)
      if (drawer === 'global') {
        setIsSettingsInspectorExpanded(true)
      }
      if (drawer === 'stt') {
        setIsSttInspectorExpanded(true)
      }
      if (drawer === 'tts') {
        setIsTtsInspectorExpanded(true)
      }
    },
    [],
  )

  const handleTestSttConfig = useCallback(async () => {
    if (!hasDesktopApi || !editingSttConfig) {
      return
    }

    setIsTestingSttConfig(true)
    setLastError('')
    setActivityHint(`正在测试 STT 配置「${editingSttConfig.name}」。`)

    try {
      const result = await desktopAgent.testSttConfig({
        settings: settingsDraft,
        configId: editingSttConfig.id,
      })
      setSttConfigTestResult(result)

      if (result.ok) {
        setActivityHint(`STT 配置测试通过：${editingSttConfig.name}`)
      } else {
        setActivityHint(`STT 配置测试失败：${editingSttConfig.name}`)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'STT 配置测试失败。'
      setSttConfigTestResult({
        ok: false,
        capability: 'stt',
        provider: editingSttConfig.kind,
        configId: editingSttConfig.id,
        configName: editingSttConfig.name,
        detail,
        latencyMs: 0,
      })
      setLastError(detail)
    } finally {
      setIsTestingSttConfig(false)
    }
  }, [desktopAgent, editingSttConfig, hasDesktopApi, settingsDraft])

  const handleTestTtsConfig = useCallback(async () => {
    if (!editingTtsConfig) {
      return
    }

    setIsTestingTtsConfig(true)
    setLastError('')
    setActivityHint(`正在测试 TTS 配置「${editingTtsConfig.name}」。`)

    try {
      if (editingTtsConfig.kind === 'browser') {
        const text =
          settingsDraft.workingLanguage === 'en-US'
            ? 'Hello. This is a browser speech test.'
            : '你好。这是浏览器语音测试。'
        const playbackResult = await speakWithBrowser(text, settingsDraft.workingLanguage)
        const result: SpeechConfigTestResult = {
          ok: true,
          capability: 'tts',
          provider: editingTtsConfig.kind,
          configId: editingTtsConfig.id,
          configName: editingTtsConfig.name,
          detail: isAudioMutedPlaybackResult(playbackResult)
            ? '全局静音已开启，浏览器语音未实际播放。'
            : '浏览器语音播放成功。',
          latencyMs: 0,
        }
        setTtsConfigTestResult(result)
        setActivityHint(
          isAudioMutedPlaybackResult(playbackResult)
            ? `TTS 配置已验证，但当前全局静音：${editingTtsConfig.name}`
            : `TTS 配置测试通过：${editingTtsConfig.name}`,
        )
        return
      }

      if (!hasDesktopApi) {
        return
      }

      const result = await desktopAgent.testTtsConfig({
        settings: settingsDraft,
        configId: editingTtsConfig.id,
      })

      let nextResult = result
      if (result.ok && result.synthesis) {
        const playbackResult = await playSynthesizedAudio(result.synthesis)
        if (isAudioMutedPlaybackResult(playbackResult)) {
          nextResult = {
            ...result,
            detail: `${result.detail} 当前全局静音，未实际播放。`,
          }
        }
      }
      setTtsConfigTestResult(nextResult)

      if (nextResult.ok) {
        setActivityHint(
          settingsDraft.audioMuted
            ? `TTS 配置已验证，但当前全局静音：${editingTtsConfig.name}`
            : `TTS 配置测试通过：${editingTtsConfig.name}`,
        )
      } else {
        setActivityHint(`TTS 配置测试失败：${editingTtsConfig.name}`)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'TTS 配置测试失败。'
      setTtsConfigTestResult({
        ok: false,
        capability: 'tts',
        provider: editingTtsConfig.kind,
        configId: editingTtsConfig.id,
        configName: editingTtsConfig.name,
        detail,
        latencyMs: 0,
      })
      setLastError(detail)
    } finally {
      setIsTestingTtsConfig(false)
    }
  }, [
    desktopAgent,
    editingTtsConfig,
    hasDesktopApi,
    playSynthesizedAudio,
    settingsDraft,
    speakWithBrowser,
  ])

  const handleOnboardingSttProviderChange = useCallback((provider: SttProvider) => {
    setSettingsDraft((current) => {
      const selectedConfig = resolveSelectedSttConfig(current)
      const targetConfigId = selectedConfig?.id ?? current.sttConfigs[0]?.id
      if (!targetConfigId) {
        return current
      }

      return updateSttConfigById(
        applySelectedSttConfig(current, targetConfigId),
        targetConfigId,
        (config) => ({
          ...assignSttProviderToConfig(current, targetConfigId, provider).sttConfigs.find(
            (item) => item.id === targetConfigId,
          ) ?? config,
          name: defaultSttConfigName(provider),
          enabled: true,
        }),
      )
    })
    setSttConfigTestResult(null)
    setSettingsDirty(true)
  }, [])

  const handleOnboardingTtsProviderChange = useCallback((provider: TtsProvider) => {
    setSettingsDraft((current) => {
      const selectedConfig = resolveSelectedTtsConfig(current)
      const targetConfigId = selectedConfig?.id ?? current.ttsConfigs[0]?.id
      if (!targetConfigId) {
        return current
      }

      return updateTtsConfigById(
        applySelectedTtsConfig(current, targetConfigId),
        targetConfigId,
        (config) => ({
          ...assignTtsProviderToConfig(current, targetConfigId, provider).ttsConfigs.find(
            (item) => item.id === targetConfigId,
          ) ?? config,
          name: defaultTtsConfigName(provider),
          enabled: true,
        }),
      )
    })
    setTtsConfigTestResult(null)
    setSettingsDirty(true)
  }, [])

  const handleAdvanceOnboarding = useCallback(() => {
    if (!canAdvanceOnboarding) {
      return
    }

    const nextStep = ONBOARDING_STEP_ORDER[onboardingCurrentStepIndex + 1]
    if (nextStep) {
      setOnboardingStep(nextStep)
    }
  }, [canAdvanceOnboarding, onboardingCurrentStepIndex])

  const handleRetreatOnboarding = useCallback(() => {
    const previousStep = ONBOARDING_STEP_ORDER[onboardingCurrentStepIndex - 1]
    if (previousStep) {
      setOnboardingStep(previousStep)
    }
  }, [onboardingCurrentStepIndex])

  const handleRequestOnboardingMicrophoneAccess = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const message = '当前环境不支持麦克风访问，请在桌面应用中重试。'
      setOnboardingMicrophonePermissionState('denied')
      setOnboardingMicrophoneMessage(message)
      setLastError(message)
      return
    }

    setOnboardingMicrophonePermissionState('requesting')
    setOnboardingMicrophoneMessage('正在等待系统麦克风授权…')
    setLastError('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      stream.getTracks().forEach((track) => track.stop())
      setOnboardingMicrophonePermissionState('granted')
      setOnboardingMicrophoneMessage('麦克风已就绪。现在说一句话，确认下方电平条会动。')
      setActivityHint('麦克风已授权，可以继续配置语音供应商。')
    } catch (error) {
      const message = describeMicrophonePermissionError(error)
      setOnboardingMicrophonePermissionState('denied')
      setOnboardingMicrophoneMessage(message)
      setLastError(message)
    }
  }, [])

  const handleCompleteOnboarding = useCallback(async () => {
    if (!hasDesktopApi) {
      return
    }

    if (!isOnboardingProjectStepValid) {
      setOnboardingStep('project')
      setLastError('请先填写项目名称，并确认工作目录有效。')
      return
    }

    if (!isOnboardingVoiceStepValid) {
      setOnboardingStep('voice')
      setLastError('请先完成麦克风授权，并补全 STT / TTS 的必填配置。')
      return
    }

    if (!isOnboardingToolStepValid) {
      setOnboardingStep('tool')
      setLastError('请先完成开发工具检测，确保路径可用。')
      return
    }

    setIsFinishingOnboarding(true)
    setLastError('')
    const previousWorkspace = playbackWorkspaceRef.current

    try {
      const inspectedPath = await desktopAgent.inspectWorkingDirectory(trimmedProfilePath)
      if (!inspectedPath.isValid) {
        setProfilePathInspection(inspectedPath)
        setOnboardingStep('project')
        throw new Error(inspectedPath.message || '项目目录不可用。')
      }

      let sessionId = activeSessionIdRef.current
      if (!sessionId) {
        const session = await desktopAgent.createSession({ activate: true })
        sessionId = session.id
      }

      const savedProfile = await desktopAgent.saveProfile({
        name: profileDraft.name?.trim() || undefined,
        workingDirectory: inspectedPath.normalizedPath || trimmedProfilePath,
        developerTool: null,
        defaultPromptContext: '',
        usageNotes: '',
      })

      if (sessionId) {
        await desktopAgent.bindProfile({
          sessionId,
          profileId: savedProfile.id,
        })
      }

      const savedSettings = await desktopAgent.saveSettings({
        ...settingsDraft,
        executionMode: 'real',
        workingDirectory: inspectedPath.normalizedPath || trimmedProfilePath,
        onboardingCompleted: true,
      })
      const normalizedSettings = normalizeRendererSettings(savedSettings)

      setPlaybackWorkspace(
        createPlaybackWorkspace(sessionId, savedProfile.workingDirectory),
        {
          interrupt: true,
          reasonHint: '首次接入配置已完成，语音工作区已切换到新的项目目录。',
        },
      )
      setSelectedProfileId(savedProfile.id)
      setProfileDraft(createProfileDraft(savedProfile))
      setIsCreatingProfileDraft(false)
      setProfileDirty(false)
      setSettingsDraft(normalizedSettings)
      setSettingsDirty(false)
      setDraftSttConfigIds([])
      setDraftTtsConfigIds([])
      setListeningEnabled(normalizedSettings.autoStartListening)
      setActivityHint('首次接入完成，可以开始说话或输入任务了。')
      await loadData(sessionId)
    } catch (error) {
      setPlaybackWorkspace(previousWorkspace)
      setLastError(error instanceof Error ? error.message : '完成首次接入失败。')
    } finally {
      setIsFinishingOnboarding(false)
    }
  }, [
    desktopAgent,
    hasDesktopApi,
    isOnboardingProjectStepValid,
    isOnboardingToolStepValid,
    isOnboardingVoiceStepValid,
    loadData,
    profileDraft.name,
    setPlaybackWorkspace,
    settingsDraft,
    trimmedProfilePath,
  ])

  const handleAddSttConfig = useCallback(() => {
    const { settings: nextSettings, configId } = appendSttConfig(
      settingsDraft,
      editingSttConfig?.kind ?? 'openai',
    )
    setSettingsDraft(nextSettings)
    setDraftSttConfigIds((current) => [...current, configId])
    setEditingSttConfigId(configId)
    setIsSttInspectorExpanded(true)
    setIsSttConfigFormVisible(true)
    setSettingsDirty(true)
  }, [editingSttConfig?.kind, settingsDraft])

  const handleAddTtsConfig = useCallback(() => {
    const { settings: nextSettings, configId } = appendTtsConfig(
      settingsDraft,
      editingTtsConfig?.kind ?? 'openai',
    )
    setSettingsDraft(nextSettings)
    setDraftTtsConfigIds((current) => [...current, configId])
    setEditingTtsConfigId(configId)
    setIsTtsInspectorExpanded(true)
    setIsTtsConfigFormVisible(true)
    setSettingsDirty(true)
  }, [editingTtsConfig?.kind, settingsDraft])

  const handleCancelSttConfigEditing = useCallback(() => {
    const savedSettings = appState?.settings
    if (!savedSettings) {
      return
    }

    const nextSettings = restoreSttSettingsFromSaved(settingsDraft, savedSettings)
    setSettingsDraft(nextSettings)
    setEditingSttConfigId(
      nextSettings.sttConfigs.find((config) => config.id === editingSttConfigId)?.id ||
        nextSettings.selectedSttConfigId ||
        nextSettings.sttConfigs[0]?.id ||
        null,
    )
    setDraftSttConfigIds((current) =>
      current.filter((id) => nextSettings.sttConfigs.some((config) => config.id === id)),
    )
    setSttConfigTestResult(null)
    setIsSttConfigFormVisible(false)
    setSettingsDirty(!settingsDraftEquals(nextSettings, savedSettings))
    setActivityHint('STT 配置修改已撤销。')
  }, [appState?.settings, editingSttConfigId, settingsDraft])

  const handleCancelTtsConfigEditing = useCallback(() => {
    const savedSettings = appState?.settings
    if (!savedSettings) {
      return
    }

    const nextSettings = restoreTtsSettingsFromSaved(settingsDraft, savedSettings)
    setSettingsDraft(nextSettings)
    setEditingTtsConfigId(
      nextSettings.ttsConfigs.find((config) => config.id === editingTtsConfigId)?.id ||
        nextSettings.selectedTtsConfigId ||
        nextSettings.ttsConfigs[0]?.id ||
        null,
    )
    setDraftTtsConfigIds((current) =>
      current.filter((id) => nextSettings.ttsConfigs.some((config) => config.id === id)),
    )
    setTtsConfigTestResult(null)
    setIsTtsConfigFormVisible(false)
    setSettingsDirty(!settingsDraftEquals(nextSettings, savedSettings))
    setActivityHint('TTS 配置修改已撤销。')
  }, [appState?.settings, editingTtsConfigId, settingsDraft])

  const handleOpenSttConfigEditor = useCallback((configId: string) => {
    setEditingSttConfigId(configId)
    setIsSttConfigFormVisible(true)
  }, [])

  const handleOpenTtsConfigEditor = useCallback((configId: string) => {
    setEditingTtsConfigId(configId)
    setIsTtsConfigFormVisible(true)
  }, [])

  const handleDeleteSttConfig = useCallback(
    (configId: string) => {
      const nextSettings = removeSttConfigById(settingsDraft, configId)
      const wasEditingConfig = editingSttConfigId === configId
      const nextEditingConfig =
        nextSettings.sttConfigs.find((config) => config.id === editingSttConfigId) ||
        nextSettings.sttConfigs[0] ||
        null

      setSettingsDraft(nextSettings)
      setDraftSttConfigIds((current) => current.filter((id) => id !== configId))
      setEditingSttConfigId(nextEditingConfig?.id ?? null)
      if (wasEditingConfig) {
        setIsSttConfigFormVisible(false)
      }
      setSettingsDirty(true)
    },
    [editingSttConfigId, settingsDraft],
  )

  const handleDeleteTtsConfig = useCallback(
    (configId: string) => {
      const nextSettings = removeTtsConfigById(settingsDraft, configId)
      const wasEditingConfig = editingTtsConfigId === configId
      const nextEditingConfig =
        nextSettings.ttsConfigs.find((config) => config.id === editingTtsConfigId) ||
        nextSettings.ttsConfigs[0] ||
        null

      setSettingsDraft(nextSettings)
      setDraftTtsConfigIds((current) => current.filter((id) => id !== configId))
      setEditingTtsConfigId(nextEditingConfig?.id ?? null)
      if (wasEditingConfig) {
        setIsTtsConfigFormVisible(false)
      }
      setSettingsDirty(true)
    },
    [editingTtsConfigId, settingsDraft],
  )

  const handleStartProfileDraft = useCallback(() => {
    profileSelectionSessionIdRef.current = activeSessionIdRef.current
    selectedProfileIdRef.current = null
    setSelectedProfileId(null)
    setIsCreatingProfileDraft(true)
    setProfileDraft(createEmptyProfileDraft())
    setProfileDirty(false)
  }, [])

  const handleSelectProfile = useCallback(
    (nextId: string | null) => {
      profileSelectionSessionIdRef.current = activeSessionIdRef.current
      selectedProfileIdRef.current = nextId

      if (!nextId) {
        setSelectedProfileId(null)
        setIsCreatingProfileDraft(true)
        setProfileDraft(createEmptyProfileDraft())
        setProfileDirty(false)
        return
      }

      setSelectedProfileId(nextId)
      setIsCreatingProfileDraft(false)
      const nextProfile =
        appState?.profiles.find((profile) => profile.id === nextId) ?? null
      setProfileDraft(createProfileDraft(nextProfile))
      setProfileDirty(false)
    },
    [appState?.profiles],
  )

  const handleCancelProfileEditing = useCallback(() => {
    const nextProfile = resolveInspectorProfile({
      profiles: appState?.profiles ?? [],
      detail: sessionDetail,
      selectedProfileId: selectedProfileIdRef.current,
      preferSelectedProfile: false,
      creatingDraft: false,
    })

    profileSelectionSessionIdRef.current = activeSessionIdRef.current
    selectedProfileIdRef.current = nextProfile?.id ?? null
    setSelectedProfileId(nextProfile?.id ?? null)
    setIsCreatingProfileDraft(!nextProfile)
    setProfileDraft(createProfileDraft(nextProfile))
    setProfileDirty(false)
    setActivityHint('项目配置修改已撤销。')
  }, [appState?.profiles, sessionDetail])

  const handleOpenProjectManagerDialog = useCallback(() => {
    if (!profileDirty && !selectedProfileId) {
      const nextProfileId = activeSessionProfileId ?? appState?.profiles[0]?.id ?? null
      if (nextProfileId) {
        handleSelectProfile(nextProfileId)
      }
    }

    setIsProfileInspectorExpanded(true)
  }, [activeSessionProfileId, appState?.profiles, handleSelectProfile, profileDirty, selectedProfileId])

  const handleDismissProjectManagerDialog = useCallback(() => {
    setIsProfileInspectorExpanded(false)
  }, [])

  const handleOpenSessionCreateDialog = useCallback(() => {
    if (!hasDesktopApi) {
      return
    }

    setSessionContextMenu(null)
    setPendingSessionProfileId(activeSessionProfileId ?? appState?.profiles[0]?.id ?? null)
    setIsSessionCreateDialogOpen(true)
  }, [activeSessionProfileId, appState?.profiles, hasDesktopApi])

  const handleDismissSessionCreateDialog = useCallback(() => {
    if (isCreatingSession) {
      return
    }

    setIsSessionCreateDialogOpen(false)
  }, [isCreatingSession])

  const handleSessionCreate = useCallback(async () => {
    if (!hasDesktopApi || isCreatingSession) {
      return
    }

    if (!pendingSessionProfileId) {
      setLastError('请先选择一个项目，再创建会话。')
      return
    }

    const previousWorkspace = playbackWorkspaceRef.current
    setIsCreatingSession(true)

    try {
      setSessionContextMenu(null)
      setPlaybackWorkspace(createPlaybackWorkspace(null, null), {
        interrupt: true,
        reasonHint: '正在切换到新会话，旧会话的语音播报已暂停。',
      })
      const session = await desktopAgent.createSession({
        boundProfileId: pendingSessionProfileId,
        activate: true,
      })
      activeSessionIdRef.current = session.id
      setPlaybackWorkspace(
        createPlaybackWorkspace(session.id, session.boundWorkingDirectory ?? null),
        {
          interrupt: true,
        },
      )
      setIsSessionCreateDialogOpen(false)
      setIsProfileInspectorExpanded(false)
      setActivityHint(
        `已创建会话「${session.title}」，绑定项目「${session.boundProfileName || pendingSessionProfileSummary?.name || '项目'}」，后续不支持切换。`,
      )
      await loadData(session.id)
    } catch (error) {
      setPlaybackWorkspace(previousWorkspace)
      setLastError(error instanceof Error ? error.message : '创建会话失败。')
    } finally {
      setIsCreatingSession(false)
    }
  }, [
    desktopAgent,
    hasDesktopApi,
    isCreatingSession,
    loadData,
    pendingSessionProfileId,
    pendingSessionProfileSummary?.name,
    setPlaybackWorkspace,
  ])

  const handleSessionActivate = useCallback(
    async (sessionId: string) => {
      if (!hasDesktopApi) {
        return
      }

      const previousWorkspace = playbackWorkspaceRef.current
      const previousSessionId = activeSessionIdRef.current
      const targetSession =
        appState?.sessions.find((sessionItem) => sessionItem.id === sessionId) ?? null

      try {
        setSessionContextMenu(null)
        activeSessionIdRef.current = sessionId
        setPlaybackWorkspace(
          createPlaybackWorkspace(sessionId, targetSession?.boundWorkingDirectory ?? null),
          {
            interrupt: true,
            reasonHint: '已切换到新的项目，上一条任务的语音播报已暂停。',
          },
        )
        const session = await desktopAgent.activateSession({ sessionId })
        if (!session) {
          throw new Error('目标会话不存在。')
        }
        activeSessionIdRef.current = session.id
        setPlaybackWorkspace(
          createPlaybackWorkspace(session.id, session.boundWorkingDirectory ?? null),
          {
            interrupt: true,
            reasonHint: '已切换到新的项目，上一条任务的语音播报已暂停。',
          },
        )
        setActivityHint('已切换当前会话。')
        setIsProfileInspectorExpanded(false)
        await loadData(sessionId)
      } catch (error) {
        activeSessionIdRef.current = previousSessionId
        setPlaybackWorkspace(previousWorkspace)
        setLastError(error instanceof Error ? error.message : '切换会话失败。')
      }
    },
    [appState?.sessions, desktopAgent, hasDesktopApi, loadData, setPlaybackWorkspace],
  )

  const handleSessionRenameStart = useCallback((sessionId: string, title: string) => {
    skipNextSessionRenameSaveRef.current = false
    setSessionContextMenu(null)
    setEditingSessionId(sessionId)
    setRenameDraft(title)
  }, [])

  const handleSessionRenameCancel = useCallback(() => {
    skipNextSessionRenameSaveRef.current = true
    setEditingSessionId(null)
    setRenameDraft('')
  }, [])

  const handleSessionContextMenu = useCallback(
    (event: React.MouseEvent, sessionId: string) => {
      event.preventDefault()
      event.stopPropagation()

      const menuWidth = 180
      const menuHeight = 88
      const nextX = Math.min(event.clientX, window.innerWidth - menuWidth - 12)
      const nextY = Math.min(event.clientY, window.innerHeight - menuHeight - 12)

      setSessionContextMenu({
        sessionId,
        x: Math.max(12, nextX),
        y: Math.max(12, nextY),
      })
    },
    [],
  )

  const handleSessionPinToggle = useCallback(
    async (payload: SessionPinInput) => {
      if (!hasDesktopApi) {
        return
      }

      try {
        setSessionContextMenu(null)
        const session = await desktopAgent.setSessionPinned(payload)
        const sessionTitle =
          normalizeSessionTitle(
            session?.title ??
              appState?.sessions.find((sessionItem) => sessionItem.id === payload.sessionId)?.title,
          )

        setLastError('')
        setActivityHint(
          payload.pinned
            ? `已将会话「${sessionTitle}」置顶。`
            : `已取消会话「${sessionTitle}」置顶。`,
        )
        await loadData(activeSessionIdRef.current ?? payload.sessionId)
      } catch (error) {
        setLastError(normalizeSessionActionError(error, '更新会话置顶状态失败。'))
      }
    },
    [appState?.sessions, desktopAgent, hasDesktopApi, loadData],
  )

  const handleSessionArchive = useCallback(
    async (payload: SessionArchiveInput) => {
      if (!hasDesktopApi) {
        return
      }

      try {
        setSessionContextMenu(null)
        const session = await desktopAgent.archiveSession(payload)
        const sessionTitle =
          normalizeSessionTitle(
            session?.title ??
              appState?.sessions.find((sessionItem) => sessionItem.id === payload.sessionId)?.title,
          )

        setLastError('')
        setActivityHint(`已归档会话「${sessionTitle}」。`)
        await loadData()
      } catch (error) {
        setLastError(normalizeSessionActionError(error, '归档会话失败。'))
      }
    },
    [appState?.sessions, desktopAgent, hasDesktopApi, loadData],
  )

  const handleSessionRenameSave = useCallback(async () => {
    if (
      skipNextSessionRenameSaveRef.current ||
      isSavingSessionRenameRef.current ||
      !hasDesktopApi ||
      !editingSessionId
    ) {
      return
    }

    const nextTitle = normalizeSessionTitle(renameDraft)
    const currentTitle = normalizeSessionTitle(
      appState?.sessions.find((sessionItem) => sessionItem.id === editingSessionId)?.title,
    )

    if (nextTitle === currentTitle) {
      handleSessionRenameCancel()
      return
    }

    isSavingSessionRenameRef.current = true

    try {
      await desktopAgent.renameSession({
        sessionId: editingSessionId,
        title: nextTitle,
      })
      handleSessionRenameCancel()
      setActivityHint('会话名称已更新。')
      await loadData(activeSessionIdRef.current ?? editingSessionId)
    } catch (error) {
      setLastError(error instanceof Error ? error.message : '重命名会话失败。')
    } finally {
      isSavingSessionRenameRef.current = false
    }
  }, [
    appState?.sessions,
    activeSessionIdRef,
    desktopAgent,
    editingSessionId,
    handleSessionRenameCancel,
    hasDesktopApi,
    loadData,
    renameDraft,
  ])

  const handleSubmitTextTurn = useCallback(async () => {
    if (!hasDesktopApi || !activeSessionId || !currentMessageDraft.trim()) {
      return
    }

    const stagedMessage = currentMessageDraft.trim()
    const stagedContext = currentContextDraft.trim()

    try {
      setLastError('')
      setActivityHintForSession(activeSessionId, '正在提交文字任务。')
      markStage(activeSessionId, 'submitting')
      setSessionMessageDraft(activeSessionId, '')

      if (stagedContext) {
        setSessionContextDraft(activeSessionId, '')
      }

      const result = await desktopAgent.submitTextTurn({
        sessionId: activeSessionId,
        text: stagedMessage,
        pendingText: stagedContext,
      })

      if (result.status === 'failed' || result.status === 'cancelled') {
        restoreSessionMessageDraftIfEmpty(activeSessionId, stagedMessage)
      }
      if (stagedContext && (result.status === 'failed' || result.status === 'cancelled')) {
        restoreSessionContextDraftIfEmpty(activeSessionId, stagedContext)
      }
      setActivityHintForSession(activeSessionId, result.nextActionHint || '文字任务已完成。')
      await playTurnResultWithDedup(result, 'submit_return')
    } catch (error) {
      restoreSessionMessageDraftIfEmpty(activeSessionId, stagedMessage)
      restoreSessionContextDraftIfEmpty(activeSessionId, stagedContext)
      setLastErrorForSession(
        activeSessionId,
        error instanceof Error ? error.message : '提交文字任务失败。',
      )
    } finally {
      clearStage(activeSessionId)
    }
  }, [
    activeSessionId,
    clearStage,
    currentContextDraft,
    currentMessageDraft,
    desktopAgent,
    hasDesktopApi,
    markStage,
    playTurnResultWithDedup,
    restoreSessionMessageDraftIfEmpty,
    restoreSessionContextDraftIfEmpty,
    setActivityHintForSession,
    setLastErrorForSession,
    setSessionContextDraft,
    setSessionMessageDraft,
  ])

  const handleQueueTextTurn = useCallback(async () => {
    if (!hasDesktopApi || !activeSessionId || !currentMessageDraft.trim()) {
      return
    }

    const stagedMessage = currentMessageDraft.trim()
    const stagedContext = currentContextDraft.trim()

    try {
      setLastError('')
      setActivityHintForSession(activeSessionId, '正在加入任务队列。')
      setSessionMessageDraft(activeSessionId, '')

      if (stagedContext) {
        setSessionContextDraft(activeSessionId, '')
      }

      const result = await desktopAgent.queueTextTurn({
        sessionId: activeSessionId,
        text: stagedMessage,
        pendingText: stagedContext,
      })

      setActivityHintForSession(activeSessionId, result.nextActionHint || result.uiReply)
    } catch (error) {
      restoreSessionMessageDraftIfEmpty(activeSessionId, stagedMessage)
      restoreSessionContextDraftIfEmpty(activeSessionId, stagedContext)
      setLastErrorForSession(
        activeSessionId,
        error instanceof Error ? error.message : '加入任务队列失败。',
      )
    }
  }, [
    activeSessionId,
    currentContextDraft,
    currentMessageDraft,
    desktopAgent,
    hasDesktopApi,
    restoreSessionMessageDraftIfEmpty,
    restoreSessionContextDraftIfEmpty,
    setActivityHintForSession,
    setLastErrorForSession,
    setSessionContextDraft,
    setSessionMessageDraft,
  ])

  const handleStageTurnInput = useCallback(() => {
    if (!activeSessionId || !currentMessageDraft.trim()) {
      return
    }

    const nextContextDraft = mergeStagedTurnInput(currentContextDraft, currentMessageDraft)

    setSessionContextDraft(activeSessionId, nextContextDraft)
    setSessionMessageDraft(activeSessionId, '')
    setLastError('')
    setActivityHint(currentContextDraft.trim() ? '已追加到下一轮输入。' : '已暂存到下一轮输入。')
  }, [
    activeSessionId,
    currentContextDraft,
    currentMessageDraft,
    setSessionContextDraft,
    setSessionMessageDraft,
  ])

  const handleRestoreStagedTurnInput = useCallback(() => {
    if (!activeSessionId || !currentContextDraft.trim()) {
      return
    }

    const nextDraft = currentMessageDraft.trim()
      ? `${currentContextDraft.trim()}\n\n${currentMessageDraft.trim()}`
      : currentContextDraft.trim()

    setSessionMessageDraft(activeSessionId, nextDraft)
    setSessionContextDraft(activeSessionId, '')
    setLastError('')
    setActivityHint('已将暂存内容放回输入框。')
  }, [
    activeSessionId,
    currentContextDraft,
    currentMessageDraft,
    setSessionContextDraft,
    setSessionMessageDraft,
  ])

  const handleClearStagedTurnInput = useCallback(() => {
    if (!activeSessionId || !currentContextDraft) {
      return
    }

    setSessionContextDraft(activeSessionId, '')
    setLastError('')
    setActivityHint('已清空下一轮暂存。')
  }, [activeSessionId, currentContextDraft, setSessionContextDraft])

  const handleRequestCancelCurrentTask = useCallback(() => {
    if (!hasDesktopApi || !activeSessionId || !currentCancelableTaskKey) {
      return
    }

    setLastError('')
    setIsCancelDialogOpen(true)
  }, [activeSessionId, currentCancelableTaskKey, hasDesktopApi])

  const handleDismissCancelDialog = useCallback(() => {
    setIsCancelDialogOpen(false)
  }, [])

  const handleOpenProfileRemoveDialog = useCallback(() => {
    if (!selectedProfileId) {
      return
    }

    setIsProfileRemoveDialogOpen(true)
  }, [selectedProfileId])

  const handleDismissProfileRemoveDialog = useCallback(() => {
    setIsProfileRemoveDialogOpen(false)
  }, [])

  const handleCancelCurrentTask = useCallback(async () => {
    if (!hasDesktopApi || !activeSessionId || !currentCancelableTaskKey) {
      return
    }

    setIsCancelDialogOpen(false)

    try {
      const result: CancelSessionTaskResult = await desktopAgent.cancelSessionTask(
        activeSessionId,
      )
      if (result.cancelled) {
        clearStage(activeSessionId)
        setActivityHint(
          result.target === 'queued' ? '已取消排队任务。' : '已取消当前会话任务。',
        )
      } else if (currentLocalStage && !activeTask) {
        clearStage(activeSessionId)
        setActivityHint('没有检测到后台任务，已重置本地进行中状态。')
      } else {
        setActivityHint('当前会话没有可取消的任务。')
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : '取消任务失败。')
    }
  }, [
    activeSessionId,
    activeTask,
    clearStage,
    currentLocalStage,
    currentCancelableTaskKey,
    desktopAgent,
    hasDesktopApi,
  ])

  const handleProfileSave = useCallback(
    async (mode: 'update' | 'create') => {
      if (!hasDesktopApi) {
        return
      }

      if (!trimmedProfilePath) {
        setLastError('请先填写项目目录。')
        return
      }

      setIsSavingProfile(true)
      try {
        const payload: ProfileSaveInput = {
          id: mode === 'update' ? selectedProfileId ?? undefined : undefined,
          name: profileDraft.name?.trim() || undefined,
          workingDirectory: trimmedProfilePath,
          developerTool: profileDraft.developerTool || null,
          defaultPromptContext: profileDraft.defaultPromptContext?.trim() || '',
          usageNotes: profileDraft.usageNotes?.trim() || '',
        }

        const profile = await desktopAgent.saveProfile(payload)
        selectedProfileIdRef.current = profile.id
        setSelectedProfileId(profile.id)
        setIsCreatingProfileDraft(false)
        setIsProfileInspectorExpanded(true)
        setProfileDirty(false)
        setActivityHint(
          mode === 'update'
            ? selectedProfileSessionCount > 1
              ? `项目配置已更新，${selectedProfileSessionCount} 个会话会同步使用新配置。`
              : '项目配置已更新。'
            : '已创建新的项目配置，可在新建会话时选择它。',
        )
        profileSelectionSessionIdRef.current = activeSessionIdRef.current

        await loadData(activeSessionIdRef.current)
      } catch (error) {
        setLastError(error instanceof Error ? error.message : '保存项目配置失败。')
      } finally {
        setIsSavingProfile(false)
      }
    },
    [
      desktopAgent,
      hasDesktopApi,
      loadData,
      profileDraft,
      selectedProfileId,
      selectedProfileSessionCount,
      trimmedProfilePath,
    ],
  )

  const handleCopySessionIdentifiers = useCallback(
    async ({
      sessionId,
      runtimeSessionId,
    }: {
      sessionId: string
      runtimeSessionId?: string | null
    }) => {
      const copyPayload = buildSessionIdentifierCopyPayload({
        sessionId,
        runtimeSessionId,
      })
      if (!copyPayload) {
        return
      }

      try {
        const copied = await desktopAgent.copyText(copyPayload.text)
        if (copied) {
          setLastError('')
          setActivityHint(copyPayload.successHint)
        }
      } catch (error) {
        setLastError(error instanceof Error ? error.message : '复制会话诊断 ID 失败。')
      }
    },
    [desktopAgent],
  )

  const handleProfileRemove = useCallback(async () => {
    if (!hasDesktopApi || !selectedProfileId) {
      return
    }

    setIsProfileRemoveDialogOpen(false)

    try {
      const result: ProfileRemoveResult = await desktopAgent.removeProfile({
        profileId: selectedProfileId,
      })
      profileSelectionSessionIdRef.current = activeSessionIdRef.current
      selectedProfileIdRef.current = null
      setSelectedProfileId(null)
      setIsCreatingProfileDraft(false)
      setProfileDraft(createEmptyProfileDraft())
      setProfileDirty(false)
      setActivityHint(
        result.affectedSessionCount > 0
          ? `已移除项目配置，并从 ${result.affectedSessionCount} 个会话中解绑。`
          : '已移除项目配置。',
      )
      await loadData(activeSessionIdRef.current)
    } catch (error) {
      setLastError(error instanceof Error ? error.message : '移除项目配置失败。')
    }
  }, [desktopAgent, hasDesktopApi, loadData, selectedProfileId])

  const renderSessionItem = (sessionItem: SessionSummary) => {
    const isEditing = editingSessionId === sessionItem.id
    const taskStatusLabel = buildSessionTaskStatusLabel(sessionItem)
    const attentionCueTone = sessionAttentionCues[sessionItem.id] ?? null
    return (
      <article
        key={sessionItem.id}
        className={`session-card${sessionItem.isActive ? ' is-active' : ''}${
          sessionItem.pinnedAt ? ' is-pinned' : ''
        }${
          attentionCueTone ? ` is-cued is-cued-${attentionCueTone}` : ''
        }`}
        onContextMenu={(event) => {
          if (!isEditing) {
            handleSessionContextMenu(event, sessionItem.id)
          }
        }}
      >
        <div
          className={`session-card-main${isEditing ? ' is-editing' : ''}`}
          role="button"
          tabIndex={isEditing ? -1 : 0}
          aria-pressed={sessionItem.isActive}
          onClick={() => {
            if (!isEditing) {
              void handleSessionActivate(sessionItem.id)
            }
          }}
          onMouseLeave={() => {
            if (isEditing) {
              void handleSessionRenameSave()
            }
          }}
          onKeyDown={(event) => {
            if (isEditing) {
              return
            }

            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              void handleSessionActivate(sessionItem.id)
            }
          }}
        >
          <div className="session-card-head">
            {isEditing ? (
              <input
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={() => {
                  void handleSessionRenameSave()
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleSessionRenameSave()
                    return
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault()
                    handleSessionRenameCancel()
                  }
                }}
                className="inline-input"
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="session-title-button"
                onClick={(event) => {
                  event.stopPropagation()
                  handleSessionRenameStart(sessionItem.id, sessionItem.title)
                }}
              >
                {sessionItem.title}
              </button>
            )}
            <div className="session-card-status">
              {sessionItem.pinnedAt ? <span className="session-pin-badge">置顶</span> : null}
              <span
                className={`task-indicator task-${sessionItem.lastTaskStatus ?? 'idle'}`}
                title={taskStatusLabel}
                aria-label={taskStatusLabel}
              />
            </div>
          </div>
          <p>{sessionItem.lastMessagePreview || '还没有消息，直接开始说话或输入。'}</p>
          <div className="session-card-meta">
            <span className={`summary-chip session-profile-chip${sessionItem.boundProfileName ? ' accent' : ''}`}>
              {sessionItem.boundProfileName || '未绑定项目'}
            </span>
            <time>{formatClock(sessionItem.lastActivityAt, locale)}</time>
          </div>
        </div>
      </article>
    )
  }

  const renderMessage = (message: ChatMessage) => (
    <article key={message.id} className={`message-card role-${message.role}`}>
      <header>{buildMessageMeta(message, locale)}</header>
      <p>{message.text}</p>
      {message.detail ? <pre>{message.detail}</pre> : null}
    </article>
  )

  const renderEvent = (event: EventLogRecord) => (
    <article key={event.id} className="event-card">
      <div className="event-head">
        <strong>{formatEventKind(event.kind)}</strong>
        <time>{formatClock(event.createdAt, locale)}</time>
      </div>
      <pre>{JSON.stringify(event.payload, null, 2)}</pre>
    </article>
  )

  const renderSessionListSkeleton = () => (
    <>
      {Array.from({ length: 5 }, (_, index) => (
        <article
          key={`session-skeleton-${index}`}
          className="session-card session-card-skeleton"
          aria-hidden="true"
        >
          <div className="session-card-main session-card-main-skeleton">
            <div className="session-card-head">
              <span className="session-skeleton-line session-skeleton-title" />
              <div className="session-card-status">
                <span className="session-skeleton-dot" />
              </div>
            </div>
            <span className="session-skeleton-line session-skeleton-body" />
            <span className="session-skeleton-line session-skeleton-body is-short" />
            <div className="session-card-meta">
              <span className="session-skeleton-chip" />
              <span className="session-skeleton-chip is-compact" />
            </div>
          </div>
        </article>
      ))}
    </>
  )

  const phaseLabel = useMemo(() => {
    switch (phase) {
      case 'booting':
        return '启动中'
      case 'ready':
        return '待命'
      case 'listening':
        return '监听中'
      case 'transcribing':
        return '转写中'
      case 'submitting':
        return '任务处理中'
      case 'speaking':
        return '播报中'
      case 'error':
        return '出现错误'
      default:
        return '待命'
    }
  }, [phase])

  const isBackendBusy =
    currentLocalStage?.phase === 'submitting' ||
    activeTask?.status === 'running' ||
    activeTask?.status === 'queued'

  const backendWorkerLabel = useMemo(() => {
    switch (activeTask?.provider) {
      case 'fake':
        return 'Fake Runner'
      case 'claude_code':
        return 'Claude Code'
      case 'cursor_cli':
        return 'Cursor CLI'
      case 'gemini_cli':
        return 'Gemini CLI'
      case 'qwen_cli':
        return 'Qwen Code'
      case 'local':
        return '本地执行器'
      case 'codex':
        return 'Codex'
      default:
        return '当前执行器'
    }
  }, [activeTask?.provider])

  const backendWorkTone =
    activeTask?.status === 'queued' ? 'queued' : isBackendBusy ? 'running' : 'idle'

  const backendWorkStatusLabel = activeTask
    ? formatTaskStatus(activeTask.status)
    : isBackendBusy
      ? '任务处理中'
      : '后台待命'

  const backendCancelActionLabel =
    activeTask?.status === 'queued' ? '取消排队任务' : '取消当前任务'

  const backendStatusHeadline = useMemo(() => {
    if (activeTask?.status === 'queued') {
      return '当前轮次已进入队列'
    }

    if (isBackendBusy) {
      return '后台正在处理当前轮次'
    }

    return '后台执行器待命中'
  }, [activeTask?.status, isBackendBusy])

  const backendWorkSummary = useMemo(() => {
    if (activeTask?.summary?.trim()) {
      return activeTask.summary.trim()
    }

    if (activeTask?.status === 'queued') {
      return '当前轮次已经进入队列，后台会在前序任务结束后自动接手。'
    }

    if (isBackendBusy) {
      return '请求已经送出，后台正在处理本轮输入，结果返回后会自动更新。'
    }

    return '当前没有后台任务。'
  }, [activeTask?.status, activeTask?.summary, isBackendBusy])

  const cancelDialogTitle = activeTask?.status === 'queued' ? '确认取消排队任务？' : '确认取消当前任务？'
  const cancelDialogDescription = activeTask?.status === 'queued'
    ? '这条任务会从当前队列中移除，之后不会继续执行。'
    : currentLocalStage?.phase === 'submitting' && !activeTask
      ? '这轮请求已经送出，确认后会尝试停止当前会话的任务流程。'
      : '当前任务正在后台执行，确认后会立即中断这一轮处理。'
  const cancelDialogConfirmLabel =
    activeTask?.status === 'queued' ? '确认取消排队任务' : '确认取消当前任务'

  const microphoneStatusLabel = hasPermission ? '麦克风已授权' : '等待麦克风授权'
  const voicePresenceLabel = isCalibrating ? '环境校准中' : isSpeechDetected ? '检测到语音' : '安静中'
  const languageLabel = settingsDraft.workingLanguage === 'en-US' ? 'English' : '中文'
  const activeVoiceInputModeOption =
    VOICE_INPUT_MODE_OPTIONS.find((option) => option.value === activeVoiceInputMode) ||
    VOICE_INPUT_MODE_OPTIONS[0]
  const draftVoiceInputModeOption =
    VOICE_INPUT_MODE_OPTIONS.find((option) => option.value === settingsDraft.voiceInputMode) ||
    VOICE_INPUT_MODE_OPTIONS[0]
  const heroVoiceModeLabel =
    activeVoiceInputModeOption.value === 'vad_beta' ? '语音：增强模式' : '语音：基础模式'
  const isCapturingUtterance = voicePhase === 'capturing_utterance'
  const selectedDeveloperToolLabel = providerLabelByValue(
    DEVELOPER_TOOL_OPTIONS,
    settingsDraft.developerTool,
  ) || '当前执行器'
  const displayedBackendLabel = activeTask ? backendWorkerLabel : selectedDeveloperToolLabel
  const developerToolPathLabel = `${selectedDeveloperToolLabel} 可执行文件`
  const executionModeLabel =
    settingsDraft.executionMode === 'fake' || settingsDraft.testMode
      ? 'Fake / 测试'
      : '真实执行'
  const appDisplayName = normalizeAppDisplayName(appMeta.name)
  const appVersionLabel = appMeta.version.trim() ? `v${appMeta.version}` : '版本未读取'
  const activeSessionToolLabel = sessionDetail?.boundProfile?.developerTool
    ? providerLabelByValue(DEVELOPER_TOOL_OPTIONS, sessionDetail.boundProfile.developerTool)
    : selectedDeveloperToolLabel
  const currentThemePreset = normalizeThemePreset(settingsDraft.themePreset)
  const activeThemePresetOption =
    THEME_PRESET_OPTIONS.find((option) => option.value === currentThemePreset) ||
    THEME_PRESET_OPTIONS[0]
  const savedThemePreset = normalizeThemePreset(appState?.settings.themePreset)
  const savedThemePresetOption =
    THEME_PRESET_OPTIONS.find((option) => option.value === savedThemePreset) ||
    THEME_PRESET_OPTIONS[0]
  const isThemePresetDirty = currentThemePreset !== savedThemePreset

  const renderSettingsInspectorCard = ({
    forceExpanded = false,
    drawerMode = false,
    onClose,
  }: {
    forceExpanded?: boolean
    drawerMode?: boolean
    onClose?: (() => void) | undefined
  } = {}) => {
    const isExpanded = forceExpanded || isSettingsInspectorExpanded

    return (
      <section
        className={`panel inspector-card settings-inspector-card${
          drawerMode ? ' settings-workspace-drawer-card' : ''
        }`}
      >
      <div className="panel-top">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>全局设置</h2>
        </div>
        <div className="summary-chip-group">
          {settingsDirty ? <span className="summary-chip accent">未保存</span> : null}
          {settingsDraft.testMode ? <span className="summary-chip accent">Test Mode</span> : null}
          {settingsDraft.audioMuted ? <span className="summary-chip accent">全局静音</span> : null}
          {drawerMode ? (
            <button
              type="button"
              className="mini-button ghost"
              onClick={onClose}
            >
              收起
            </button>
          ) : (
            <button
              type="button"
              className="mini-button ghost"
              onClick={() => {
                setIsSettingsInspectorExpanded((current) => !current)
              }}
            >
              {isExpanded ? '收起' : '展开'}
            </button>
          )}
        </div>
      </div>

      {!isExpanded ? (
        <>
          <div className="summary-chip-group">
            <span className="summary-chip">
              {settingsDraft.workingLanguage === 'en-US' ? 'English' : '中文'}
            </span>
            <span className="summary-chip">并发 {settingsDraft.globalTaskConcurrency}</span>
            <span className="summary-chip">
              {settingsDraft.autoStartListening ? '自动监听' : '手动监听'}
            </span>
            <span className="summary-chip">
              {settingsDraft.audioMuted ? '静音中' : '正常播报'}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="settings-section-stack">
            <section className="settings-subsection">
              <div className="settings-subsection-header">
                <strong>运行偏好</strong>
                <p>设置语言、默认目录和启动行为。</p>
              </div>

              <div className="settings-grid">
                <label>
                  <span>工作语言</span>
                  <select
                    value={settingsDraft.workingLanguage}
                    onChange={(event) => {
                      setSettingsDraft((current) => ({
                        ...current,
                        workingLanguage: event.target.value as DesktopSettings['workingLanguage'],
                      }))
                      setSettingsDirty(true)
                    }}
                  >
                    <option value="zh-CN">中文</option>
                    <option value="en-US">English</option>
                  </select>
                </label>

                <label>
                  <span>全局并发上限</span>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={settingsDraft.globalTaskConcurrency}
                    onChange={(event) => {
                      setSettingsDraft((current) => ({
                        ...current,
                        globalTaskConcurrency: Number(event.target.value || 1),
                      }))
                      setSettingsDirty(true)
                    }}
                  />
                </label>

                <label className="wide">
                  <span>默认工作目录</span>
                  <input
                    value={settingsDraft.workingDirectory}
                    onChange={(event) => {
                      setSettingsDraft((current) => ({
                        ...current,
                        workingDirectory: event.target.value,
                      }))
                      setSettingsDirty(true)
                    }}
                  />
                </label>
              </div>
            </section>

            <section className="settings-subsection settings-subsection-muted">
              <div className="settings-subsection-header">
                <strong>启动与播报</strong>
                <p>这里放的是启动和播报相关设置，方便单独调整。</p>
              </div>

              <div className="pill-toggle-list">
                <label className="pill-toggle-row">
                  <div className="pill-toggle-copy">
                    <strong>启动后自动监听</strong>
                    <small>启动应用后直接开始监听，省去手动点击。</small>
                  </div>
                  <input
                    type="checkbox"
                    className="pill-toggle-input"
                    checked={settingsDraft.autoStartListening}
                    onChange={(event) => {
                      setSettingsDraft((current) => ({
                        ...current,
                        autoStartListening: event.target.checked,
                      }))
                      setSettingsDirty(true)
                    }}
                  />
                </label>

                <label className="pill-toggle-row">
                  <div className="pill-toggle-copy">
                    <strong>全局静音</strong>
                    <small>立即拦截确认音、结果播报和 TTS 测试音频，但不影响录音、转写或任务执行。</small>
                  </div>
                  <input
                    type="checkbox"
                    className="pill-toggle-input"
                    checked={settingsDraft.audioMuted}
                    onChange={(event) => {
                      setSettingsDraft((current) => ({
                        ...current,
                        audioMuted: event.target.checked,
                      }))
                      setSettingsDirty(true)
                    }}
                  />
                </label>
              </div>
            </section>

          </div>

          <div className="stack-actions">
            <button
              type="button"
              className="secondary-button ghost"
              onClick={handleCancelSettings}
              disabled={isSavingSettings || !settingsDirty}
            >
              取消
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleSaveSettings()}
              disabled={isSavingSettings || !settingsDirty}
            >
              保存设置
            </button>
          </div>
        </>
      )}
      </section>
    )
  }

  const renderDeveloperToolInspectorCard = ({
    onClose,
  }: {
    onClose?: (() => void) | undefined
  } = {}) => (
    <section className="panel inspector-card settings-workspace-drawer-card">
      <div className="panel-top">
        <div>
          <p className="eyebrow">Developer Tool</p>
          <h2>开发工具</h2>
        </div>
        <div className="summary-chip-group">
          {settingsDirty ? <span className="summary-chip accent">未保存</span> : null}
          <span className="summary-chip">{selectedDeveloperToolLabel}</span>
          <span className="summary-chip">{executionModeLabel}</span>
          <button
            type="button"
            className="mini-button ghost"
            onClick={onClose}
          >
            收起
          </button>
        </div>
      </div>

      <div className="settings-section-stack">
        <section className="settings-subsection">
          <div className="settings-subsection-header">
            <strong>工具选择</strong>
            <p>选择要使用的开发工具，并检查可执行文件路径。</p>
          </div>

          <div className="settings-grid settings-grid-tooling">
            <label>
              <span>开发工具</span>
              <select
                value={settingsDraft.developerTool}
                onChange={(event) => {
                  const nextTool = event.target.value as DesktopSettings['developerTool']
                  setSettingsDraft((current) => ({
                    ...current,
                    developerTool: nextTool,
                    developerToolPath:
                      current.developerToolPaths?.[nextTool] ||
                      defaultExecutableNameForDeveloperTool(nextTool),
                  }))
                  setSettingsDirty(true)
                  setDeveloperToolDetection(null)
                }}
              >
                {DEVELOPER_TOOL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{developerToolPathLabel}</span>
              <input
                value={settingsDraft.developerToolPath}
                onChange={(event) => {
                  setSettingsDraft((current) => ({
                    ...current,
                    developerToolPath: event.target.value,
                    developerToolPaths: {
                      ...current.developerToolPaths,
                      [current.developerTool]: event.target.value,
                    },
                  }))
                  setSettingsDirty(true)
                }}
                placeholder={defaultExecutableNameForDeveloperTool(settingsDraft.developerTool)}
              />
            </label>

            <label className="wide">
              <span>工具检测</span>
              <p
                className={`field-note ${
                  developerToolDetection?.found
                    ? 'is-valid'
                    : developerToolDetection
                      ? 'is-error'
                      : ''
                }`}
              >
                {isDetectingDeveloperTool
                  ? '正在检测系统里的可执行文件…'
                  : developerToolDetection?.detail ||
                    '切换工具后会自动检测；如果系统没找到，也可以手动填写路径。'}
              </p>
              <div className="stack-actions">
                <button
                  type="button"
                  className="mini-button ghost"
                  onClick={() =>
                    void handleDetectDeveloperTool(
                      settingsDraft.developerTool,
                      settingsDraft.developerToolPath,
                    )
                  }
                  disabled={isDetectingDeveloperTool}
                >
                  {isDetectingDeveloperTool ? '检测中…' : '重新检测'}
                </button>
              </div>
            </label>

            <label className="wide">
              <span>当前工具</span>
              <p className="field-note">
                {developerToolRuntimeNote(settingsDraft.developerTool)}
              </p>
            </label>
          </div>
        </section>

        <section className="settings-subsection">
          <div className="settings-subsection-header">
            <strong>执行策略</strong>
            <p>设置运行模式和权限确认方式。</p>
          </div>

          <div className="settings-grid">
            <label>
              <span>运行模式</span>
              <select
                value={settingsDraft.executionMode}
                onChange={(event) => {
                  setSettingsDraft((current) => ({
                    ...current,
                    executionMode: event.target.value as DesktopSettings['executionMode'],
                  }))
                  setSettingsDirty(true)
                }}
              >
                {EXECUTION_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="wide">
              <span>运行模式</span>
              <p className="field-note">真实执行会调用当前工具；Fake 模式用于演示和调试。</p>
            </label>
          </div>

          <div className="toggle-row">
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={settingsDraft.bypassCodexSandbox}
                onChange={(event) => {
                  setSettingsDraft((current) => ({
                    ...current,
                    bypassCodexSandbox: event.target.checked,
                  }))
                  setSettingsDirty(true)
                }}
              />
              <span>开发工具跳过权限/沙箱确认</span>
            </label>
          </div>
        </section>
      </div>

      <div className="stack-actions">
        <button
          type="button"
          className="secondary-button ghost"
          onClick={handleCancelSettings}
          disabled={isSavingSettings || !settingsDirty}
        >
          取消
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => void handleSaveSettings()}
          disabled={isSavingSettings || !settingsDirty}
        >
          保存开发工具设置
        </button>
      </div>
    </section>
  )

  const renderSttConfigInspectorCard = ({
    forceExpanded = false,
    drawerMode = false,
    onClose,
  }: {
    forceExpanded?: boolean
    drawerMode?: boolean
    onClose?: (() => void) | undefined
  } = {}) => {
    const isExpanded = forceExpanded || isSttInspectorExpanded

    return (
      <section
        className={`panel inspector-card stt-config-inspector-card${
          drawerMode ? ' settings-workspace-drawer-card' : ''
        }`}
      >
      <div className="panel-top">
        <div>
          <p className="eyebrow">Speech Configs</p>
          <h2>STT 语音转文本配置库</h2>
        </div>
        <div className="summary-chip-group">
          {settingsDirty ? <span className="summary-chip accent">未保存</span> : null}
          {drawerMode ? (
            <button
              type="button"
              className="mini-button ghost"
              onClick={onClose}
            >
              收起
            </button>
          ) : (
            <button
              type="button"
              className="mini-button ghost"
              onClick={() => {
                setIsSttInspectorExpanded((current) => !current)
              }}
            >
              {isExpanded ? '收起' : '展开'}
            </button>
          )}
        </div>
      </div>

      {!isExpanded ? (
        <>
          <div className="summary-chip-group">
            <span className="summary-chip">
              默认：{selectedSttConfig?.name ?? '未选择'}
            </span>
            <span className="summary-chip">共 {settingsDraft.sttConfigs.length} 条</span>
          </div>
          <p className="panel-note">先配置，再到“语音输入与默认方案”里设为默认。</p>
        </>
      ) : (
        <>
          <div className="speech-config-card-head">
            <div>
              <strong>STT 配置列表</strong>
              <p className="panel-note">
                先看列表，需要修改哪一条就点编辑；需要新方案就直接新增。
              </p>
            </div>
            <div className="stack-actions">
              <button
                type="button"
                className="mini-button ghost"
                onClick={handleAddSttConfig}
              >
                新增 STT
              </button>
            </div>
          </div>

          <div className="speech-config-list">
            {settingsDraft.sttConfigs.map((config) => {
              const canDeleteConfig =
                !BUILT_IN_STT_CONFIG_IDS.has(config.id) &&
                settingsDraft.sttConfigs.length > 1

              return (
                <div
                  key={config.id}
                  className={`speech-config-list-item${
                    isSttConfigFormVisible && editingSttConfig?.id === config.id
                      ? ' is-active'
                      : ''
                  }`}
                >
                  <div className="speech-config-list-main">
                    <div className="speech-config-list-title-row">
                      <strong>{config.name}</strong>
                      {settingsDraft.selectedSttConfigId === config.id ? (
                        <span className="summary-chip accent">默认</span>
                      ) : null}
                      {draftSttConfigIds.includes(config.id) ? (
                        <span className="summary-chip">新建</span>
                      ) : null}
                    </div>
                    <p className="panel-note">
                      {providerLabelByValue(STT_PROVIDER_OPTIONS, config.kind)}
                      {config.model ? ` · ${config.model}` : ''}
                    </p>
                  </div>
                  <div className="stack-actions">
                    <button
                      type="button"
                      className="mini-button ghost"
                      onClick={() => handleOpenSttConfigEditor(config.id)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="mini-button ghost"
                      onClick={() => handleDeleteSttConfig(config.id)}
                      disabled={!canDeleteConfig}
                    >
                      删除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {isSttConfigFormVisible && editingSttConfig ? (
            <div className="speech-config-editor">
              <div className="speech-config-card-head">
                <div>
                  <strong>{isEditingNewSttConfig ? '新建 STT 配置' : '编辑 STT 配置'}</strong>
                  <p className="panel-note">
                    先填写配置名，再选择服务。
                  </p>
                </div>
                <div className="stack-actions">
                  <button
                    type="button"
                    className="mini-button ghost"
                    onClick={() => void handleTestSttConfig()}
                    disabled={isTestingSttConfig}
                  >
                    {isTestingSttConfig ? '测试中…' : '测试当前'}
                  </button>
                </div>
              </div>

              <div className="settings-grid speech-config-grid">
                <label>
                  <span>配置名</span>
                  <input
                    value={editingSttConfig.name}
                    onChange={(event) => {
                      setSettingsDraft((current) =>
                        updateSttConfigById(current, editingSttConfig.id, (config) => ({
                          ...config,
                          name: event.target.value,
                        })),
                      )
                      setSettingsDirty(true)
                    }}
                  />
                </label>

                <label>
                  <span>Provider</span>
                  <select
                    value={editingSttConfig.kind}
                    disabled={isEditingSttProviderLocked}
                    onChange={(event) => {
                      setSettingsDraft((current) =>
                        assignSttProviderToConfig(
                          current,
                          editingSttConfig.id,
                          event.target.value as DesktopSettings['sttProvider'],
                        ),
                      )
                      setSettingsDirty(true)
                    }}
                  >
                    {STT_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="wide">
                  <span>Provider 锁定</span>
                  <p className="field-note">
                    {isEditingSttProviderLocked
                      ? '已保存的配置不允许直接改 Provider。需要换一家时，请新建一条新的 STT 配置。'
                      : '当前是本轮新建配置，保存前可以选择 Provider。'}
                  </p>
                </label>

                <label className="wide">
                  <span>当前服务</span>
                  <p className="field-note">{providerLabelByValue(STT_PROVIDER_OPTIONS, editingSttConfig.kind)}</p>
                </label>

                {sttFields.appId ? (
                  <label>
                    <span>App ID</span>
                    <input
                      value={readSpeechExtraValue(editingSttConfig, 'appId')}
                      onChange={(event) => {
                        setSettingsDraft((current) =>
                          updateSttConfigById(current, editingSttConfig.id, (config) => ({
                            ...config,
                            extra: patchSpeechExtraValue(config.extra, 'appId', event.target.value),
                          })),
                        )
                        setSettingsDirty(true)
                      }}
                      placeholder={speechAppIdPlaceholderForProvider(editingSttConfig.kind)}
                    />
                  </label>
                ) : null}

                {sttFields.model ? (
                  <label>
                    <span>{sttModelLabelForProvider(editingSttConfig.kind)}</span>
                    {editingSttConfig.kind === 'volcengine_speech' ? (
                      <>
                        <select
                          value={
                            hasSuggestedSpeechOption(
                              VOLCENGINE_STT_RESOURCE_OPTIONS,
                              editingSttConfig.model,
                            )
                              ? editingSttConfig.model
                              : '__custom__'
                          }
                          onChange={(event) => {
                            setSettingsDraft((current) =>
                              updateSttConfigById(current, editingSttConfig.id, (config) => ({
                                ...config,
                                model: event.target.value === '__custom__' ? '' : event.target.value,
                              })),
                            )
                            setSettingsDirty(true)
                          }}
                        >
                          {VOLCENGINE_STT_RESOURCE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                          <option value="__custom__">自定义 Resource ID</option>
                        </select>
                        {!hasSuggestedSpeechOption(
                          VOLCENGINE_STT_RESOURCE_OPTIONS,
                          editingSttConfig.model,
                        ) ? (
                          <input
                            value={editingSttConfig.model}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateSttConfigById(current, editingSttConfig.id, (config) => ({
                                  ...config,
                                  model: event.target.value,
                                })),
                              )
                              setSettingsDirty(true)
                            }}
                            placeholder={sttModelPlaceholderForProvider(editingSttConfig.kind)}
                          />
                        ) : null}
                      </>
                    ) : (
                      <input
                        value={editingSttConfig.model}
                        onChange={(event) => {
                          setSettingsDraft((current) =>
                            updateSttConfigById(current, editingSttConfig.id, (config) => ({
                              ...config,
                              model: event.target.value,
                            })),
                          )
                          setSettingsDirty(true)
                        }}
                        placeholder={sttModelPlaceholderForProvider(editingSttConfig.kind)}
                      />
                    )}
                  </label>
                ) : null}

                {sttFields.language ? (
                  <label>
                    <span>语言</span>
                    <input
                      value={editingSttConfig.language}
                      onChange={(event) => {
                        setSettingsDraft((current) =>
                          updateSttConfigById(current, editingSttConfig.id, (config) => ({
                            ...config,
                            language: event.target.value,
                          })),
                        )
                        setSettingsDirty(true)
                      }}
                    />
                  </label>
                ) : null}

                {sttFields.apiKey ? (
                  <label>
                    <span>{sttApiKeyLabelForProvider(editingSttConfig.kind)}</span>
                    <input
                      type="password"
                      value={editingSttConfig.apiKey ?? ''}
                      onChange={(event) => {
                        setSettingsDraft((current) =>
                          updateSttConfigById(current, editingSttConfig.id, (config) => ({
                            ...config,
                            apiKey: event.target.value,
                          })),
                        )
                        setSettingsDirty(true)
                      }}
                      placeholder={sttApiKeyPlaceholderForProvider(editingSttConfig.kind)}
                    />
                  </label>
                ) : null}

                {sttFields.region ? (
                  <label>
                    <span>Region</span>
                    <input
                      value={editingSttConfig.region ?? ''}
                      onChange={(event) => {
                        setSettingsDraft((current) =>
                          updateSttConfigById(current, editingSttConfig.id, (config) => ({
                            ...config,
                            region: event.target.value,
                          })),
                        )
                        setSettingsDirty(true)
                      }}
                      placeholder="beijing / singapore / intl"
                    />
                  </label>
                ) : null}

                {sttFields.baseUrl ? (
                  <label className="wide">
                    <span>Base URL</span>
                    <input
                      value={editingSttConfig.baseUrl ?? ''}
                      onChange={(event) => {
                        setSettingsDraft((current) =>
                          updateSttConfigById(current, editingSttConfig.id, (config) => ({
                            ...config,
                            baseUrl: event.target.value,
                          })),
                        )
                        setSettingsDirty(true)
                      }}
                      placeholder={baseUrlPlaceholderForSttProvider(editingSttConfig.kind)}
                    />
                  </label>
                ) : null}

                <label className="wide">
                  <span>运行时说明</span>
                  <p className="field-note">
                    {sttProviderRuntimeNote(editingSttConfig.kind)}
                  </p>
                </label>

                {visibleSttConfigTestResult ? (
                  <label className="wide">
                    <span>连通性测试</span>
                    <p
                      className={`field-note ${
                        visibleSttConfigTestResult.ok ? 'is-valid' : 'is-error'
                      }`}
                    >
                      {describeSpeechConfigTestResult(visibleSttConfigTestResult)}
                    </p>
                  </label>
                ) : null}
              </div>

              <div className="inspector-card-actions">
                <div className="stack-actions">
                  <button
                    type="button"
                    className="secondary-button ghost"
                    onClick={handleCancelSttConfigEditing}
                    disabled={!appState?.settings}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleSaveSettings()}
                    disabled={isSavingSettings || !settingsDirty}
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-inline">
              从上方配置列表选择“编辑”，或点击“新增 STT”创建新配置。
            </div>
          )}
        </>
      )}
      </section>
    )
  }

  const renderTtsConfigInspectorCard = ({
    forceExpanded = false,
    drawerMode = false,
    onClose,
  }: {
    forceExpanded?: boolean
    drawerMode?: boolean
    onClose?: (() => void) | undefined
  } = {}) => {
    const isExpanded = forceExpanded || isTtsInspectorExpanded

    return (
      <section
        className={`panel inspector-card tts-config-inspector-card${
          drawerMode ? ' settings-workspace-drawer-card' : ''
        }`}
      >
      <div className="panel-top">
        <div>
          <p className="eyebrow">Speech Configs</p>
          <h2>TTS 文本转语音配置库</h2>
        </div>
        <div className="summary-chip-group">
          {settingsDirty ? <span className="summary-chip accent">未保存</span> : null}
          {drawerMode ? (
            <button
              type="button"
              className="mini-button ghost"
              onClick={onClose}
            >
              收起
            </button>
          ) : (
            <button
              type="button"
              className="mini-button ghost"
              onClick={() => {
                setIsTtsInspectorExpanded((current) => !current)
              }}
            >
              {isExpanded ? '收起' : '展开'}
            </button>
          )}
        </div>
      </div>

      {!isExpanded ? (
        <>
          <div className="summary-chip-group">
            <span className="summary-chip">
              默认：{selectedTtsConfig?.name ?? '未选择'}
            </span>
            <span className="summary-chip">共 {settingsDraft.ttsConfigs.length} 条</span>
          </div>
          <p className="panel-note">先配置，再到“语音输入与默认方案”里设为默认。</p>
        </>
      ) : (
        <>
          <div className="speech-config-card-head">
            <div>
              <strong>TTS 配置列表</strong>
              <p className="panel-note">
                先看列表，需要修改哪一条就点编辑；需要新方案就直接新增。
              </p>
            </div>
            <div className="stack-actions">
              <button
                type="button"
                className="mini-button ghost"
                onClick={handleAddTtsConfig}
              >
                新增 TTS
              </button>
            </div>
          </div>

          <div className="speech-config-list">
            {settingsDraft.ttsConfigs.map((config) => {
              const canDeleteConfig =
                !BUILT_IN_TTS_CONFIG_IDS.has(config.id) &&
                settingsDraft.ttsConfigs.length > 1

              return (
                <div
                  key={config.id}
                  className={`speech-config-list-item${
                    isTtsConfigFormVisible && editingTtsConfig?.id === config.id
                      ? ' is-active'
                      : ''
                  }`}
                >
                  <div className="speech-config-list-main">
                    <div className="speech-config-list-title-row">
                      <strong>{config.name}</strong>
                      {settingsDraft.selectedTtsConfigId === config.id ? (
                        <span className="summary-chip accent">默认</span>
                      ) : null}
                      {draftTtsConfigIds.includes(config.id) ? (
                        <span className="summary-chip">新建</span>
                      ) : null}
                    </div>
                    <p className="panel-note">
                      {providerLabelByValue(TTS_PROVIDER_OPTIONS, config.kind)}
                      {config.voice ? ` · ${config.voice}` : config.model ? ` · ${config.model}` : ''}
                    </p>
                  </div>
                  <div className="stack-actions">
                    <button
                      type="button"
                      className="mini-button ghost"
                      onClick={() => handleOpenTtsConfigEditor(config.id)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="mini-button ghost"
                      onClick={() => handleDeleteTtsConfig(config.id)}
                      disabled={!canDeleteConfig}
                    >
                      删除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {isTtsConfigFormVisible && editingTtsConfig ? (
            <div className="speech-config-editor">
              <div className="speech-config-card-head">
                <div>
                  <strong>{isEditingNewTtsConfig ? '新建 TTS 配置' : '编辑 TTS 配置'}</strong>
                  <p className="panel-note">
                    先填写配置名，再选择服务。
                  </p>
                </div>
                <div className="stack-actions">
                  <button
                    type="button"
                    className="mini-button ghost"
                    onClick={() => void handleTestTtsConfig()}
                    disabled={isTestingTtsConfig}
                  >
                    {isTestingTtsConfig ? '测试中…' : '测试当前'}
                  </button>
                </div>
              </div>

              <div className="settings-grid speech-config-grid">
                <label>
                  <span>配置名</span>
                  <input
                    value={editingTtsConfig.name}
                    onChange={(event) => {
                      setSettingsDraft((current) =>
                        updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                          ...config,
                          name: event.target.value,
                        })),
                      )
                      setSettingsDirty(true)
                    }}
                  />
                </label>

                <label>
                  <span>Provider</span>
                  <select
                    value={editingTtsConfig.kind}
                    disabled={isEditingTtsProviderLocked}
                    onChange={(event) => {
                      setSettingsDraft((current) =>
                        assignTtsProviderToConfig(
                          current,
                          editingTtsConfig.id,
                          event.target.value as DesktopSettings['ttsProvider'],
                        ),
                      )
                      setSettingsDirty(true)
                    }}
                  >
                    {TTS_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="wide">
                  <span>Provider 锁定</span>
                  <p className="field-note">
                    {isEditingTtsProviderLocked
                      ? '已保存的配置不允许直接改 Provider。需要换一家时，请新建一条新的 TTS 配置。'
                      : '当前是本轮新建配置，保存前可以选择 Provider。'}
                  </p>
                </label>

                <label className="wide">
                  <span>当前服务</span>
                  <p className="field-note">{providerLabelByValue(TTS_PROVIDER_OPTIONS, editingTtsConfig.kind)}</p>
                </label>

                {ttsFields.appId ? (
                  <label>
                    <span>App ID</span>
                    <input
                      value={readSpeechExtraValue(editingTtsConfig, 'appId')}
                      onChange={(event) => {
                        setSettingsDraft((current) =>
                          updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                            ...config,
                            extra: patchSpeechExtraValue(config.extra, 'appId', event.target.value),
                          })),
                        )
                        setSettingsDirty(true)
                      }}
                      placeholder={speechAppIdPlaceholderForProvider(editingTtsConfig.kind)}
                    />
                  </label>
                ) : null}

                {ttsFields.model ? (
                  <label>
                    <span>{ttsModelLabelForProvider(editingTtsConfig.kind)}</span>
                    {editingTtsConfig.kind === 'volcengine_speech' ? (
                      <>
                        <select
                          value={
                            hasSuggestedSpeechOption(
                              VOLCENGINE_TTS_RESOURCE_OPTIONS,
                              editingTtsConfig.model,
                            )
                              ? editingTtsConfig.model
                              : '__custom__'
                          }
                          onChange={(event) => {
                            setSettingsDraft((current) =>
                              updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                                ...config,
                                model: event.target.value === '__custom__' ? '' : event.target.value,
                              })),
                            )
                            setSettingsDirty(true)
                          }}
                        >
                          {VOLCENGINE_TTS_RESOURCE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                          <option value="__custom__">自定义 Resource ID</option>
                        </select>
                        {!hasSuggestedSpeechOption(
                          VOLCENGINE_TTS_RESOURCE_OPTIONS,
                          editingTtsConfig.model,
                        ) ? (
                          <input
                            value={editingTtsConfig.model}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                                  ...config,
                                  model: event.target.value,
                                })),
                              )
                              setSettingsDirty(true)
                            }}
                            placeholder={ttsModelPlaceholderForProvider(editingTtsConfig.kind)}
                          />
                        ) : null}
                      </>
                    ) : (
                      <input
                        value={editingTtsConfig.model}
                        onChange={(event) => {
                          setSettingsDraft((current) =>
                            updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                              ...config,
                              model: event.target.value,
                            })),
                          )
                          setSettingsDirty(true)
                        }}
                        placeholder={ttsModelPlaceholderForProvider(editingTtsConfig.kind)}
                      />
                    )}
                  </label>
                ) : null}

                {ttsFields.voice ? (
                  <label>
                    <span>{ttsVoiceLabelForProvider(editingTtsConfig.kind)}</span>
                    {editingTtsConfig.kind === 'volcengine_speech' ? (
                      <>
                        <select
                          value={
                            hasSuggestedSpeechOption(
                              VOLCENGINE_TTS_SPEAKER_OPTIONS,
                              editingTtsConfig.voice,
                            )
                              ? editingTtsConfig.voice ?? ''
                              : '__custom__'
                          }
                          onChange={(event) => {
                            setSettingsDraft((current) =>
                              updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                                ...config,
                                voice: event.target.value === '__custom__' ? '' : event.target.value,
                              })),
                            )
                            setSettingsDirty(true)
                          }}
                        >
                          {VOLCENGINE_TTS_SPEAKER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                          <option value="__custom__">自定义 Speaker</option>
                        </select>
                        {!hasSuggestedSpeechOption(
                          VOLCENGINE_TTS_SPEAKER_OPTIONS,
                          editingTtsConfig.voice,
                        ) ? (
                          <input
                            value={editingTtsConfig.voice ?? ''}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                                  ...config,
                                  voice: event.target.value,
                                })),
                              )
                              setSettingsDirty(true)
                            }}
                            placeholder={ttsVoicePlaceholderForProvider(editingTtsConfig.kind)}
                          />
                        ) : null}
                      </>
                    ) : (
                      <input
                        value={editingTtsConfig.voice ?? ''}
                        onChange={(event) => {
                          setSettingsDraft((current) =>
                            updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                              ...config,
                              voice: event.target.value,
                            })),
                          )
                          setSettingsDirty(true)
                        }}
                        placeholder={ttsVoicePlaceholderForProvider(editingTtsConfig.kind)}
                      />
                    )}
                  </label>
                ) : null}

                {ttsFields.format ? (
                  <label>
                    <span>{ttsFormatLabelForProvider(editingTtsConfig.kind)}</span>
                    <input
                      value={editingTtsConfig.format ?? 'mp3'}
                      onChange={(event) => {
                        setSettingsDraft((current) =>
                          updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                            ...config,
                            format: event.target.value,
                          })),
                        )
                        setSettingsDirty(true)
                      }}
                      placeholder={ttsFormatPlaceholderForProvider(editingTtsConfig.kind)}
                    />
                  </label>
                ) : null}

                {ttsFields.apiKey ? (
                  <label>
                    <span>{ttsApiKeyLabelForProvider(editingTtsConfig.kind)}</span>
                    <input
                      type="password"
                      value={editingTtsConfig.apiKey ?? ''}
                      onChange={(event) => {
                        setSettingsDraft((current) =>
                          updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                            ...config,
                            apiKey: event.target.value,
                          })),
                        )
                        setSettingsDirty(true)
                      }}
                      placeholder={ttsApiKeyPlaceholderForProvider(editingTtsConfig.kind)}
                    />
                  </label>
                ) : null}

                {ttsFields.region ? (
                  <label>
                    <span>Region</span>
                    <input
                      value={editingTtsConfig.region ?? ''}
                      onChange={(event) => {
                        setSettingsDraft((current) =>
                          updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                            ...config,
                            region: event.target.value,
                          })),
                        )
                        setSettingsDirty(true)
                      }}
                      placeholder="beijing / singapore / intl"
                    />
                  </label>
                ) : null}

                {ttsFields.baseUrl ? (
                  <label className="wide">
                    <span>Base URL</span>
                    <input
                      value={editingTtsConfig.baseUrl ?? ''}
                      onChange={(event) => {
                        setSettingsDraft((current) =>
                          updateTtsConfigById(current, editingTtsConfig.id, (config) => ({
                            ...config,
                            baseUrl: event.target.value,
                          })),
                        )
                        setSettingsDirty(true)
                      }}
                      placeholder={baseUrlPlaceholderForTtsProvider(editingTtsConfig.kind)}
                    />
                  </label>
                ) : null}

                <label className="wide">
                  <span>运行时说明</span>
                  <p className="field-note">
                    {ttsProviderRuntimeNote(editingTtsConfig.kind)}
                  </p>
                </label>

                {visibleTtsConfigTestResult ? (
                  <label className="wide">
                    <span>连通性测试</span>
                    <p
                      className={`field-note ${
                        visibleTtsConfigTestResult.ok ? 'is-valid' : 'is-error'
                      }`}
                    >
                      {describeSpeechConfigTestResult(visibleTtsConfigTestResult)}
                    </p>
                  </label>
                ) : null}
              </div>

              <div className="inspector-card-actions">
                <div className="stack-actions">
                  <button
                    type="button"
                    className="secondary-button ghost"
                    onClick={handleCancelTtsConfigEditing}
                    disabled={!appState?.settings}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleSaveSettings()}
                    disabled={isSavingSettings || !settingsDirty}
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-inline">
              从上方配置列表选择“编辑”，或点击“新增 TTS”创建新配置。
            </div>
          )}
        </>
      )}
      </section>
    )
  }

  const renderSpeechDefaultsInspectorCard = ({
    onClose,
  }: {
    onClose?: (() => void) | undefined
  } = {}) => (
    <section className="panel inspector-card settings-workspace-drawer-card">
      <div className="panel-top">
        <div>
          <p className="eyebrow">Voice Workspace</p>
          <h2>语音输入与默认方案</h2>
        </div>
        <div className="summary-chip-group">
          {settingsDirty ? <span className="summary-chip accent">未保存</span> : null}
          <span className="summary-chip">{draftVoiceInputModeOption.label}</span>
          <button
            type="button"
            className="mini-button ghost"
            onClick={onClose}
          >
            收起
          </button>
        </div>
      </div>

      <div className="settings-section-stack">
        <section className="settings-subsection">
          <div className="settings-subsection-header">
            <strong>输入策略</strong>
            <p>选择语音输入模式。</p>
          </div>

          <div className="settings-grid">
            <label className="wide">
              <span>语音输入模式</span>
              <select
                value={settingsDraft.voiceInputMode}
                onChange={(event) => {
                  setSettingsDraft((current) => ({
                    ...current,
                    voiceInputMode: event.target.value as VoiceInputMode,
                  }))
                  setSettingsDirty(true)
                }}
              >
                {VOICE_INPUT_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="wide">
              <span>当前模式说明</span>
              <p className="field-note">{draftVoiceInputModeOption.description}</p>
            </label>
          </div>
        </section>

        <section className="settings-subsection">
          <div className="settings-subsection-header">
            <strong>默认语音服务</strong>
            <p>设置默认 STT 和默认 TTS。</p>
          </div>

          <div className="settings-grid settings-grid-speech-pair">
            <label>
              <span>默认 STT 配置</span>
              <select
                value={settingsDraft.selectedSttConfigId}
                onChange={(event) => {
                  setSettingsDraft((current) =>
                    applySelectedSttConfig(current, event.target.value),
                  )
                  setSettingsDirty(true)
                }}
              >
                {settingsDraft.sttConfigs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {buildSpeechConfigOptionLabel(config)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>默认 TTS 配置</span>
              <select
                value={settingsDraft.selectedTtsConfigId}
                onChange={(event) => {
                  setSettingsDraft((current) =>
                    applySelectedTtsConfig(current, event.target.value),
                  )
                  setSettingsDirty(true)
                }}
              >
                {settingsDraft.ttsConfigs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {buildSpeechConfigOptionLabel(config)}
                  </option>
                ))}
              </select>
            </label>

            <label className="wide">
              <span>当前默认组合</span>
              <p className="field-note">
                输入：{draftVoiceInputModeOption.label}；转写：{selectedSttConfig?.name ?? '未选择'}；播报：{selectedTtsConfig?.name ?? '未选择'}。
              </p>
            </label>
          </div>
        </section>

      </div>

      <div className="stack-actions">
        <button
          type="button"
          className="secondary-button ghost"
          onClick={handleCancelSettings}
          disabled={isSavingSettings || !settingsDirty}
        >
          取消
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => void handleSaveSettings()}
          disabled={isSavingSettings || !settingsDirty}
        >
          保存语音设置
        </button>
      </div>
    </section>
  )

  const renderThemePresetInspectorCard = ({
    onClose,
  }: {
    onClose?: (() => void) | undefined
  } = {}) => (
    <section className="panel inspector-card settings-theme-card settings-workspace-drawer-card">
      <div className="panel-top">
        <div>
          <p className="eyebrow">Appearance</p>
          <h2>主题风格</h2>
        </div>
        <div className="summary-chip-group">
          {settingsDirty ? <span className="summary-chip accent">未保存</span> : null}
          <button
            type="button"
            className="mini-button ghost"
            onClick={onClose}
          >
            收起
          </button>
        </div>
      </div>

      <p className="panel-note">
        点击主题即可预览；保存应用，取消恢复到 {savedThemePresetOption.label}。
      </p>

      <div className="theme-preset-grid">
        {THEME_PRESET_OPTIONS.map((option) => {
          const isSelected = currentThemePreset === option.value

          return (
            <button
              key={option.value}
              type="button"
              className={`theme-preset-card${isSelected ? ' is-selected' : ''}`}
              onClick={() => {
                if (currentThemePreset === option.value) {
                  return
                }
                setSettingsDraft((current) => ({
                  ...current,
                  themePreset: option.value,
                }))
                setSettingsDirty(true)
              }}
            >
              <div className="theme-preset-swatches" aria-hidden="true">
                {option.swatches.map((swatch) => (
                  <span
                    key={swatch}
                    className="theme-preset-swatch"
                    style={{ background: swatch }}
                  />
                ))}
              </div>
              <div className="theme-preset-copy">
                <div className="theme-preset-copy-head">
                  <strong>{option.label}</strong>
                  {isSelected ? <span className="summary-chip accent">当前</span> : null}
                </div>
                <span>{option.kicker}</span>
                <p>{option.description}</p>
              </div>
            </button>
          )
        })}
      </div>

      <div className="inspector-card-actions">
        <p className="panel-note">
          {isThemePresetDirty
            ? `当前预览：${activeThemePresetOption.label}；已保存：${savedThemePresetOption.label}。`
            : `当前已保存：${activeThemePresetOption.label}。`}
        </p>
        <div className="stack-actions">
          <button
            type="button"
            className="secondary-button ghost"
            onClick={handleCancelSettings}
            disabled={isSavingSettings || !settingsDirty}
          >
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSaveSettings()}
            disabled={isSavingSettings || !settingsDirty}
          >
            保存主题
          </button>
        </div>
      </div>
    </section>
  )

  const renderSettingsWorkspaceDrawer = () => {
    switch (activeSettingsWorkspaceDrawer) {
      case 'global':
        return renderSettingsInspectorCard({
          forceExpanded: true,
          drawerMode: true,
          onClose: () => setActiveSettingsWorkspaceDrawer(null),
        })
      case 'speech':
        return renderSpeechDefaultsInspectorCard({
          onClose: () => setActiveSettingsWorkspaceDrawer(null),
        })
      case 'developer_tool':
        return renderDeveloperToolInspectorCard({
          onClose: () => setActiveSettingsWorkspaceDrawer(null),
        })
      case 'stt':
        return renderSttConfigInspectorCard({
          forceExpanded: true,
          drawerMode: true,
          onClose: () => setActiveSettingsWorkspaceDrawer(null),
        })
      case 'tts':
        return renderTtsConfigInspectorCard({
          forceExpanded: true,
          drawerMode: true,
          onClose: () => setActiveSettingsWorkspaceDrawer(null),
        })
      case 'theme':
        return renderThemePresetInspectorCard({
          onClose: () => setActiveSettingsWorkspaceDrawer(null),
        })
      default:
        return null
    }
  }

  const renderOnboardingDialog = () => {
    if (!isOnboardingOpen) {
      return null
    }

    return (
      <div className="onboarding-backdrop" role="presentation">
        <section
          className="onboarding-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          aria-describedby="onboarding-description"
        >
          <div className="onboarding-hero">
            <div>
              <p className="eyebrow">First Run</p>
              <h2 id="onboarding-title">完成首次接入配置</h2>
              <p id="onboarding-description" className="panel-note">
                完成项目、语音和开发工具设置后即可开始使用。
              </p>
            </div>
            <div className="summary-chip-group">
              <span className="summary-chip">真实接入</span>
              <span className="summary-chip">3 步完成</span>
            </div>
          </div>

          <div className="onboarding-progress" role="tablist" aria-label="首次接入步骤">
            {ONBOARDING_STEP_ORDER.map((step, index) => {
              const isCurrent = onboardingStep === step
              const label =
                step === 'project'
                  ? '项目'
                  : step === 'voice'
                    ? '语音'
                    : '工具'

              return (
                <button
                  key={step}
                  type="button"
                  className={`onboarding-progress-step${isCurrent ? ' is-current' : ''}`}
                  onClick={() => setOnboardingStep(step)}
                  aria-selected={isCurrent}
                  role="tab"
                >
                  <span>{`0${index + 1}`}</span>
                  <strong>{label}</strong>
                </button>
              )
            })}
          </div>

          <div className="onboarding-body">
            {onboardingStep === 'project' ? (
              <div className="onboarding-step-stack">
                <section className="onboarding-card">
                  <div className="speech-config-card-head">
                    <div>
                      <strong>项目名称与默认目录</strong>
                      <p className="panel-note">
                        这里创建首次默认项目，并把这个目录写成当前应用默认工作目录。
                      </p>
                    </div>
                    {profilePathInspection?.isValid ? (
                      <span className="summary-chip accent">目录可用</span>
                    ) : null}
                  </div>

                  <div className="settings-grid">
                    <label>
                      <span>项目名称</span>
                      <input
                        value={profileDraft.name ?? ''}
                        onChange={(event) => {
                          setProfileDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                          setProfileDirty(true)
                        }}
                        placeholder={`例如：${APP_DISPLAY_NAME} 主项目`}
                      />
                    </label>

                    <label className="wide">
                      <span>默认工作目录</span>
                      <div className="onboarding-directory-row">
                        <input
                          value={profileDraft.workingDirectory ?? ''}
                          onChange={(event) => {
                            setProfileDraft((current) => ({
                              ...current,
                              workingDirectory: event.target.value,
                            }))
                            setProfileDirty(true)
                          }}
                          placeholder="/absolute/path/to/project"
                        />
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void handlePickOnboardingDirectory()}
                        >
                          选择文件夹
                        </button>
                      </div>
                    </label>

                    <label className="wide">
                      <span>自动命名</span>
                      <p className="field-note">
                        选择目录后，会自动用最后一级文件夹名回填项目名称；你仍然可以继续手动修改。
                      </p>
                    </label>

                    <label className="wide">
                      <span>目录检查</span>
                      <p
                        className={`field-note ${
                          profilePathInspection?.isValid
                            ? 'is-valid'
                            : trimmedProfilePath
                              ? 'is-error'
                              : ''
                        }`}
                      >
                        {isCheckingProfilePath
                          ? '正在检查目录状态…'
                          : profilePathInspection?.message ||
                            '请输入以 / 开头的本地项目目录。'}
                      </p>
                    </label>
                  </div>
                </section>

                <section className="onboarding-card onboarding-card-muted">
                  <strong>这些可以稍后再补</strong>
                  <p className="panel-note">
                    默认提示和备注都可以后面再补，不影响先开始使用。
                  </p>
                </section>
              </div>
            ) : null}

            {onboardingStep === 'voice' ? (
              <div className="onboarding-step-stack">
                <section className="onboarding-card onboarding-card-muted">
                  <div className="speech-config-card-head">
                    <div>
                      <strong>先打开麦克风权限</strong>
                      <p className="panel-note">
                        DevCue One 需要麦克风权限来完成语音输入与语音测试。授权后你仍然可以随时暂停监听。
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mini-button ghost"
                      onClick={() => void handleRequestOnboardingMicrophoneAccess()}
                      disabled={onboardingMicrophonePermissionState === 'requesting'}
                    >
                      {onboardingMicrophonePermissionState === 'granted'
                        ? '重新检查麦克风'
                        : onboardingMicrophonePermissionState === 'requesting'
                          ? '等待授权…'
                          : onboardingMicrophonePermissionState === 'denied'
                            ? '重新申请权限'
                            : '授权麦克风并测试'}
                    </button>
                  </div>

                  <div className="summary-chip-group">
                    <span
                      className={`summary-chip${
                        onboardingMicrophonePermissionState === 'granted' ? ' accent' : ''
                      }`}
                    >
                      {onboardingMicrophonePermissionState === 'granted'
                        ? '麦克风已就绪'
                        : onboardingMicrophonePermissionState === 'requesting'
                          ? '等待系统授权'
                          : onboardingMicrophonePermissionState === 'denied'
                            ? '麦克风未授权'
                            : '尚未申请麦克风权限'}
                    </span>
                    <span className="summary-chip">
                      {onboardingMicrophonePermissionState === 'granted'
                        ? '现在说一句话，确认电平条有反馈'
                        : '先处理权限，再继续做语音配置'}
                    </span>
                  </div>

                  <div className="onboarding-mic-preview">
                    <div className="meter-cluster onboarding-meter-cluster">
                      <div className="meter">
                        <span style={{ width: `${Math.min(100, Math.round(level * 900))}%` }} />
                      </div>
                    </div>
                    <p
                      className={`field-note ${
                        onboardingMicrophonePermissionState === 'granted'
                          ? 'is-valid'
                          : onboardingMicrophonePermissionState === 'denied'
                            ? 'is-error'
                            : ''
                      }`}
                    >
                      {onboardingMicrophoneMessage}
                    </p>
                  </div>
                </section>

                <section className="onboarding-card">
                  <div className="speech-config-card-head">
                    <div>
                      <strong>STT 语音转文本</strong>
                      <p className="panel-note">
                        请先设置默认 STT 配置。
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mini-button ghost"
                      onClick={() => void handleTestSttConfig()}
                      disabled={isTestingSttConfig}
                    >
                      {isTestingSttConfig ? '测试中…' : '测试 STT'}
                    </button>
                  </div>

                  {selectedSttConfig ? (
                    <div className="settings-grid">
                      <label>
                        <span>Provider</span>
                        <select
                          value={selectedSttConfig.kind}
                          onChange={(event) =>
                            handleOnboardingSttProviderChange(
                              event.target.value as DesktopSettings['sttProvider'],
                            )
                          }
                        >
                          {STT_PROVIDER_OPTIONS.filter((option) => option.value !== 'fake').map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {onboardingSttFields.appId ? (
                        <label>
                          <span>App ID</span>
                          <input
                            value={readSpeechExtraValue(selectedSttConfig, 'appId')}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateSttConfigById(current, selectedSttConfig.id, (config) => ({
                                  ...config,
                                  extra: patchSpeechExtraValue(config.extra, 'appId', event.target.value),
                                })),
                              )
                              setSttConfigTestResult(null)
                              setSettingsDirty(true)
                            }}
                            placeholder={speechAppIdPlaceholderForProvider(selectedSttConfig.kind)}
                          />
                        </label>
                      ) : null}

                      {onboardingSttFields.model ? (
                        <label>
                          <span>{sttModelLabelForProvider(selectedSttConfig.kind)}</span>
                          {selectedSttConfig.kind === 'volcengine_speech' ? (
                            <>
                              <select
                                value={
                                  hasSuggestedSpeechOption(
                                    VOLCENGINE_STT_RESOURCE_OPTIONS,
                                    selectedSttConfig.model,
                                  )
                                    ? selectedSttConfig.model
                                    : '__custom__'
                                }
                                onChange={(event) => {
                                  setSettingsDraft((current) =>
                                    updateSttConfigById(current, selectedSttConfig.id, (config) => ({
                                      ...config,
                                      model: event.target.value === '__custom__' ? '' : event.target.value,
                                    })),
                                  )
                                  setSttConfigTestResult(null)
                                  setSettingsDirty(true)
                                }}
                              >
                                {VOLCENGINE_STT_RESOURCE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                                <option value="__custom__">自定义 Resource ID</option>
                              </select>
                              {!hasSuggestedSpeechOption(
                                VOLCENGINE_STT_RESOURCE_OPTIONS,
                                selectedSttConfig.model,
                              ) ? (
                                <input
                                  value={selectedSttConfig.model}
                                  onChange={(event) => {
                                    setSettingsDraft((current) =>
                                      updateSttConfigById(current, selectedSttConfig.id, (config) => ({
                                        ...config,
                                        model: event.target.value,
                                      })),
                                    )
                                    setSttConfigTestResult(null)
                                    setSettingsDirty(true)
                                  }}
                                  placeholder={sttModelPlaceholderForProvider(selectedSttConfig.kind)}
                                />
                              ) : null}
                            </>
                          ) : (
                            <input
                              value={selectedSttConfig.model}
                              onChange={(event) => {
                                setSettingsDraft((current) =>
                                  updateSttConfigById(current, selectedSttConfig.id, (config) => ({
                                    ...config,
                                    model: event.target.value,
                                  })),
                                )
                                setSttConfigTestResult(null)
                                setSettingsDirty(true)
                              }}
                              placeholder={sttModelPlaceholderForProvider(selectedSttConfig.kind)}
                            />
                          )}
                        </label>
                      ) : null}

                      {onboardingSttFields.language ? (
                        <label>
                          <span>语言</span>
                          <input
                            value={selectedSttConfig.language}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateSttConfigById(current, selectedSttConfig.id, (config) => ({
                                  ...config,
                                  language: event.target.value,
                                })),
                              )
                              setSttConfigTestResult(null)
                              setSettingsDirty(true)
                            }}
                          />
                        </label>
                      ) : null}

                      {onboardingSttFields.apiKey ? (
                        <label>
                          <span>{sttApiKeyLabelForProvider(selectedSttConfig.kind)}</span>
                          <input
                            type="password"
                            value={selectedSttConfig.apiKey ?? ''}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateSttConfigById(current, selectedSttConfig.id, (config) => ({
                                  ...config,
                                  apiKey: event.target.value,
                                })),
                              )
                              setSttConfigTestResult(null)
                              setSettingsDirty(true)
                            }}
                            placeholder={sttApiKeyPlaceholderForProvider(selectedSttConfig.kind)}
                          />
                        </label>
                      ) : null}

                      {onboardingSttFields.region ? (
                        <label>
                          <span>Region</span>
                          <input
                            value={selectedSttConfig.region ?? ''}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateSttConfigById(current, selectedSttConfig.id, (config) => ({
                                  ...config,
                                  region: event.target.value,
                                })),
                              )
                              setSttConfigTestResult(null)
                              setSettingsDirty(true)
                            }}
                            placeholder="beijing / singapore / intl"
                          />
                        </label>
                      ) : null}

                      {onboardingSttFields.baseUrl ? (
                        <label className="wide">
                          <span>Base URL</span>
                          <input
                            value={selectedSttConfig.baseUrl ?? ''}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateSttConfigById(current, selectedSttConfig.id, (config) => ({
                                  ...config,
                                  baseUrl: event.target.value,
                                })),
                              )
                              setSttConfigTestResult(null)
                              setSettingsDirty(true)
                            }}
                            placeholder={baseUrlPlaceholderForSttProvider(selectedSttConfig.kind)}
                          />
                        </label>
                      ) : null}

                      <label className="wide">
                        <span>运行时说明</span>
                        <p className="field-note">{sttProviderRuntimeNote(selectedSttConfig.kind)}</p>
                      </label>

                      {sttConfigTestResult && sttConfigTestResult.configId === selectedSttConfig.id ? (
                        <label className="wide">
                          <span>最近测试</span>
                          <p className={`field-note ${sttConfigTestResult.ok ? 'is-valid' : 'is-error'}`}>
                            {describeSpeechConfigTestResult(sttConfigTestResult)}
                          </p>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className="onboarding-card">
                  <div className="speech-config-card-head">
                    <div>
                      <strong>TTS 文本转语音</strong>
                      <p className="panel-note">
                        Browser / System 可以先兜底，但更推荐直接配云端 TTS，首轮体验会稳定很多。
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mini-button ghost"
                      onClick={() => void handleTestTtsConfig()}
                      disabled={isTestingTtsConfig}
                    >
                      {isTestingTtsConfig ? '测试中…' : '测试 TTS'}
                    </button>
                  </div>

                  {selectedTtsConfig ? (
                    <div className="settings-grid">
                      <label>
                        <span>Provider</span>
                        <select
                          value={selectedTtsConfig.kind}
                          onChange={(event) =>
                            handleOnboardingTtsProviderChange(
                              event.target.value as DesktopSettings['ttsProvider'],
                            )
                          }
                        >
                          {TTS_PROVIDER_OPTIONS.filter((option) => option.value !== 'fake').map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {onboardingTtsFields.appId ? (
                        <label>
                          <span>App ID</span>
                          <input
                            value={readSpeechExtraValue(selectedTtsConfig, 'appId')}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateTtsConfigById(current, selectedTtsConfig.id, (config) => ({
                                  ...config,
                                  extra: patchSpeechExtraValue(config.extra, 'appId', event.target.value),
                                })),
                              )
                              setTtsConfigTestResult(null)
                              setSettingsDirty(true)
                            }}
                            placeholder={speechAppIdPlaceholderForProvider(selectedTtsConfig.kind)}
                          />
                        </label>
                      ) : null}

                      {onboardingTtsFields.model ? (
                        <label>
                          <span>{ttsModelLabelForProvider(selectedTtsConfig.kind)}</span>
                          {selectedTtsConfig.kind === 'volcengine_speech' ? (
                            <>
                              <select
                                value={
                                  hasSuggestedSpeechOption(
                                    VOLCENGINE_TTS_RESOURCE_OPTIONS,
                                    selectedTtsConfig.model,
                                  )
                                    ? selectedTtsConfig.model
                                    : '__custom__'
                                }
                                onChange={(event) => {
                                  setSettingsDraft((current) =>
                                    updateTtsConfigById(current, selectedTtsConfig.id, (config) => ({
                                      ...config,
                                      model: event.target.value === '__custom__' ? '' : event.target.value,
                                    })),
                                  )
                                  setTtsConfigTestResult(null)
                                  setSettingsDirty(true)
                                }}
                              >
                                {VOLCENGINE_TTS_RESOURCE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                                <option value="__custom__">自定义 Resource ID</option>
                              </select>
                              {!hasSuggestedSpeechOption(
                                VOLCENGINE_TTS_RESOURCE_OPTIONS,
                                selectedTtsConfig.model,
                              ) ? (
                                <input
                                  value={selectedTtsConfig.model}
                                  onChange={(event) => {
                                    setSettingsDraft((current) =>
                                      updateTtsConfigById(current, selectedTtsConfig.id, (config) => ({
                                        ...config,
                                        model: event.target.value,
                                      })),
                                    )
                                    setTtsConfigTestResult(null)
                                    setSettingsDirty(true)
                                  }}
                                  placeholder={ttsModelPlaceholderForProvider(selectedTtsConfig.kind)}
                                />
                              ) : null}
                            </>
                          ) : (
                            <input
                              value={selectedTtsConfig.model}
                              onChange={(event) => {
                                setSettingsDraft((current) =>
                                  updateTtsConfigById(current, selectedTtsConfig.id, (config) => ({
                                    ...config,
                                    model: event.target.value,
                                  })),
                                )
                                setTtsConfigTestResult(null)
                                setSettingsDirty(true)
                              }}
                              placeholder={ttsModelPlaceholderForProvider(selectedTtsConfig.kind)}
                            />
                          )}
                        </label>
                      ) : null}

                      {onboardingTtsFields.voice ? (
                        <label>
                          <span>{ttsVoiceLabelForProvider(selectedTtsConfig.kind)}</span>
                          {selectedTtsConfig.kind === 'volcengine_speech' ? (
                            <>
                              <select
                                value={
                                  hasSuggestedSpeechOption(
                                    VOLCENGINE_TTS_SPEAKER_OPTIONS,
                                    selectedTtsConfig.voice,
                                  )
                                    ? selectedTtsConfig.voice ?? ''
                                    : '__custom__'
                                }
                                onChange={(event) => {
                                  setSettingsDraft((current) =>
                                    updateTtsConfigById(current, selectedTtsConfig.id, (config) => ({
                                      ...config,
                                      voice: event.target.value === '__custom__' ? '' : event.target.value,
                                    })),
                                  )
                                  setTtsConfigTestResult(null)
                                  setSettingsDirty(true)
                                }}
                              >
                                {VOLCENGINE_TTS_SPEAKER_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                                <option value="__custom__">自定义 Speaker</option>
                              </select>
                              {!hasSuggestedSpeechOption(
                                VOLCENGINE_TTS_SPEAKER_OPTIONS,
                                selectedTtsConfig.voice,
                              ) ? (
                                <input
                                  value={selectedTtsConfig.voice ?? ''}
                                  onChange={(event) => {
                                    setSettingsDraft((current) =>
                                      updateTtsConfigById(current, selectedTtsConfig.id, (config) => ({
                                        ...config,
                                        voice: event.target.value,
                                      })),
                                    )
                                    setTtsConfigTestResult(null)
                                    setSettingsDirty(true)
                                  }}
                                  placeholder={ttsVoicePlaceholderForProvider(selectedTtsConfig.kind)}
                                />
                              ) : null}
                            </>
                          ) : (
                            <input
                              value={selectedTtsConfig.voice ?? ''}
                              onChange={(event) => {
                                setSettingsDraft((current) =>
                                  updateTtsConfigById(current, selectedTtsConfig.id, (config) => ({
                                    ...config,
                                    voice: event.target.value,
                                  })),
                                )
                                setTtsConfigTestResult(null)
                                setSettingsDirty(true)
                              }}
                              placeholder={ttsVoicePlaceholderForProvider(selectedTtsConfig.kind)}
                            />
                          )}
                        </label>
                      ) : null}

                      {onboardingTtsFields.format ? (
                        <label>
                          <span>{ttsFormatLabelForProvider(selectedTtsConfig.kind)}</span>
                          <input
                            value={selectedTtsConfig.format ?? 'mp3'}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateTtsConfigById(current, selectedTtsConfig.id, (config) => ({
                                  ...config,
                                  format: event.target.value,
                                })),
                              )
                              setTtsConfigTestResult(null)
                              setSettingsDirty(true)
                            }}
                            placeholder={ttsFormatPlaceholderForProvider(selectedTtsConfig.kind)}
                          />
                        </label>
                      ) : null}

                      {onboardingTtsFields.apiKey ? (
                        <label>
                          <span>{ttsApiKeyLabelForProvider(selectedTtsConfig.kind)}</span>
                          <input
                            type="password"
                            value={selectedTtsConfig.apiKey ?? ''}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateTtsConfigById(current, selectedTtsConfig.id, (config) => ({
                                  ...config,
                                  apiKey: event.target.value,
                                })),
                              )
                              setTtsConfigTestResult(null)
                              setSettingsDirty(true)
                            }}
                            placeholder={ttsApiKeyPlaceholderForProvider(selectedTtsConfig.kind)}
                          />
                        </label>
                      ) : null}

                      {onboardingTtsFields.region ? (
                        <label>
                          <span>Region</span>
                          <input
                            value={selectedTtsConfig.region ?? ''}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateTtsConfigById(current, selectedTtsConfig.id, (config) => ({
                                  ...config,
                                  region: event.target.value,
                                })),
                              )
                              setTtsConfigTestResult(null)
                              setSettingsDirty(true)
                            }}
                            placeholder="beijing / singapore / intl"
                          />
                        </label>
                      ) : null}

                      {onboardingTtsFields.baseUrl ? (
                        <label className="wide">
                          <span>Base URL</span>
                          <input
                            value={selectedTtsConfig.baseUrl ?? ''}
                            onChange={(event) => {
                              setSettingsDraft((current) =>
                                updateTtsConfigById(current, selectedTtsConfig.id, (config) => ({
                                  ...config,
                                  baseUrl: event.target.value,
                                })),
                              )
                              setTtsConfigTestResult(null)
                              setSettingsDirty(true)
                            }}
                            placeholder={baseUrlPlaceholderForTtsProvider(selectedTtsConfig.kind)}
                          />
                        </label>
                      ) : null}

                      <label className="wide">
                        <span>运行时说明</span>
                        <p className="field-note">{ttsProviderRuntimeNote(selectedTtsConfig.kind)}</p>
                      </label>

                      {ttsConfigTestResult && ttsConfigTestResult.configId === selectedTtsConfig.id ? (
                        <label className="wide">
                          <span>最近测试</span>
                          <p className={`field-note ${ttsConfigTestResult.ok ? 'is-valid' : 'is-error'}`}>
                            {describeSpeechConfigTestResult(ttsConfigTestResult)}
                          </p>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}

            {onboardingStep === 'tool' ? (
              <div className="onboarding-step-stack">
                <section className="onboarding-card">
                  <div className="speech-config-card-head">
                    <div>
                      <strong>开发工具与路径检查</strong>
                      <p className="panel-note">
                        这一步只保留真实执行所需的最小信息。路径能自动探测就自动探测，找不到再手工填写。
                      </p>
                    </div>
                    <span className="summary-chip">默认真实执行</span>
                  </div>

                  <div className="settings-grid settings-grid-tooling">
                    <label>
                      <span>开发工具</span>
                      <select
                        value={settingsDraft.developerTool}
                        onChange={(event) => {
                          const nextTool = event.target.value as DesktopSettings['developerTool']
                          setSettingsDraft((current) => ({
                            ...current,
                            developerTool: nextTool,
                            developerToolPath:
                              current.developerToolPaths?.[nextTool] ||
                              defaultExecutableNameForDeveloperTool(nextTool),
                          }))
                          setDeveloperToolDetection(null)
                          setSettingsDirty(true)
                        }}
                      >
                        {DEVELOPER_TOOL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>{developerToolPathLabel}</span>
                      <input
                        value={settingsDraft.developerToolPath}
                        onChange={(event) => {
                          setSettingsDraft((current) => ({
                            ...current,
                            developerToolPath: event.target.value,
                            developerToolPaths: {
                              ...current.developerToolPaths,
                              [current.developerTool]: event.target.value,
                            },
                          }))
                          setDeveloperToolDetection(null)
                          setSettingsDirty(true)
                        }}
                        placeholder={defaultExecutableNameForDeveloperTool(settingsDraft.developerTool)}
                      />
                    </label>

                    <label className="wide">
                      <span>检测结果</span>
                      <p
                        className={`field-note ${
                          developerToolDetection?.found
                            ? 'is-valid'
                            : developerToolDetection
                              ? 'is-error'
                              : ''
                        }`}
                      >
                        {isDetectingDeveloperTool
                          ? '正在检测系统里的可执行文件…'
                          : developerToolDetection?.detail ||
                            '切换工具或路径后会自动检测。'}
                      </p>
                      <div className="stack-actions">
                        <button
                          type="button"
                          className="mini-button ghost"
                          onClick={() =>
                            void handleDetectDeveloperTool(
                              settingsDraft.developerTool,
                              settingsDraft.developerToolPath,
                            )
                          }
                          disabled={isDetectingDeveloperTool}
                        >
                          {isDetectingDeveloperTool ? '检测中…' : '重新检测'}
                        </button>
                      </div>
                    </label>

                    <label className="wide">
                      <span>调用方式</span>
                      <p className="field-note">{developerToolRuntimeNote(settingsDraft.developerTool)}</p>
                    </label>
                  </div>
                </section>
              </div>
            ) : null}
          </div>

          <div className="onboarding-footer">
            <div className="summary-chip-group">
              <span className="summary-chip">
                {onboardingStep === 'project'
                  ? '先绑定项目'
                  : onboardingStep === 'voice'
                    ? '再接通语音'
                    : '最后检查执行器'}
              </span>
              {onboardingStep === 'voice' && selectedTtsConfig?.kind === 'browser' ? (
                <span className="summary-chip">当前 TTS 为 Browser / System</span>
              ) : null}
            </div>

            <div className="stack-actions">
              {onboardingCurrentStepIndex > 0 ? (
                <button
                  type="button"
                  className="secondary-button ghost"
                  onClick={handleRetreatOnboarding}
                >
                  上一步
                </button>
              ) : null}
              {onboardingStep !== 'tool' ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleAdvanceOnboarding}
                  disabled={!canAdvanceOnboarding}
                >
                  下一步
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleCompleteOnboarding()}
                  disabled={!canCompleteOnboarding}
                >
                  {isFinishingOnboarding ? '启动中…' : '完成配置并开始'}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    )
  }

  const renderBootSkeleton = () => {
    if (!isBootstrappingApp) {
      return null
    }

    return (
      <div
        className="boot-skeleton-backdrop"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <section className="boot-skeleton-shell" aria-label="应用启动加载中">
          <div className="boot-skeleton-head">
            <p className="eyebrow">Booting</p>
            <h2>正在恢复你的工作台</h2>
            <p className="panel-note">
              正在读取会话、项目绑定和语音配置。状态确认前，不会抢先弹出首次接入窗口。
            </p>
          </div>

          <div className="boot-skeleton-grid" aria-hidden="true">
            <div className="boot-skeleton-column">
              <span className="boot-skeleton-block is-tall" />
              <span className="boot-skeleton-block" />
            </div>
            <div className="boot-skeleton-column">
              <span className="boot-skeleton-block" />
              <span className="boot-skeleton-block" />
              <span className="boot-skeleton-block is-compact" />
            </div>
          </div>

          <div className="boot-skeleton-meta">
            <span>{phaseLabel}</span>
            <span>{activityHint}</span>
          </div>
        </section>
      </div>
    )
  }

  const renderProjectManagerDialog = () => {
    if (!isProfileInspectorExpanded) {
      return null
    }

    return (
      <div
        className="project-manager-dialog-backdrop"
        role="presentation"
        onClick={handleDismissProjectManagerDialog}
      >
        <section
          className="project-manager-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-manager-dialog-title"
          aria-describedby="project-manager-dialog-description"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="project-manager-dialog-head">
            <div className="project-manager-dialog-heading">
              <span className="project-manager-dialog-kicker">Project Library</span>
              <h2 id="project-manager-dialog-title">项目管理</h2>
              <p id="project-manager-dialog-description">
                左侧选择项目，右侧编辑配置。项目名称和工作目录属于固定属性，创建后不再直接修改。
              </p>
            </div>
            <button
              type="button"
              className="mini-button ghost"
              onClick={handleDismissProjectManagerDialog}
            >
              关闭
            </button>
          </div>

          <div className="project-manager-dialog-body">
            <aside className="project-manager-dialog-sidebar">
              <div className="project-manager-dialog-sidebar-head">
                <strong>项目列表</strong>
                <button
                  type="button"
                  className="mini-button ghost"
                  onClick={handleStartProfileDraft}
                >
                  新建项目
                </button>
              </div>

              <div className="project-manager-dialog-list">
                {appState?.profiles.length ? (
                  appState.profiles.map((profile) => {
                    const isSelected = selectedProfileId === profile.id && !isCreatingProfileDraft
                    const isCurrent = activeSessionProfileId === profile.id

                    return (
                      <button
                        key={profile.id}
                        type="button"
                        className={`project-manager-dialog-item${isSelected ? ' is-selected' : ''}`}
                        onClick={() => handleSelectProfile(profile.id)}
                      >
                        <div className="project-manager-dialog-item-head">
                          <strong>{profile.name}</strong>
                          {isCurrent ? <span className="summary-chip accent">当前会话</span> : null}
                        </div>
                      </button>
                    )
                  })
                ) : (
                  <div className="empty-state">
                    <strong>还没有项目。</strong>
                    <p>系统启动时会优先用当前程序目录生成默认项目；也可以在这里手动新建。</p>
                  </div>
                )}
              </div>
            </aside>

            <div className="project-manager-dialog-editor">
              <div className="settings-subsection-header project-manager-editor-header">
                <div className="project-manager-editor-title-row">
                  <strong>{isEditingSavedProfile ? '编辑项目配置' : '新建项目配置'}</strong>
                  <div className="summary-chip-group project-manager-editor-status">
                    {profileDirty ? <span className="summary-chip accent">未保存</span> : null}
                    <span className="summary-chip">
                      {selectedProfileId ? `${selectedProfileSessionCount} 个会话使用中` : '新项目草稿'}
                    </span>
                    {isSelectedProfileBoundToActiveSession ? (
                      <span className="summary-chip accent">当前会话正在使用</span>
                    ) : null}
                  </div>
                </div>
                <p>名称与工作目录创建后固定；开发工具和项目元信息可编辑。</p>
              </div>

              <div className="project-manager-dialog-editor-scroll">

                <div className="settings-grid profile-management-grid">
                  <label className="profile-field-row">
                    <span>工作目录</span>
                    {isEditingSavedProfile ? (
                      <input
                        value={profileDraft.workingDirectory ?? ''}
                        readOnly
                        aria-readonly="true"
                        onChange={(event) => {
                          setProfileDraft((current) => ({
                            ...current,
                            workingDirectory: event.target.value,
                          }))
                          setProfileDirty(true)
                        }}
                      />
                    ) : (
                      <div className="onboarding-directory-row">
                        <input
                          value={profileDraft.workingDirectory ?? ''}
                          onChange={(event) => {
                            setProfileDraft((current) => ({
                              ...current,
                              workingDirectory: event.target.value,
                            }))
                            setProfileDirty(true)
                          }}
                          placeholder="/absolute/path/to/project"
                        />
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void handlePickProfileDirectory()}
                        >
                          打开
                        </button>
                      </div>
                    )}
                    <small
                      className={`field-note${
                        isCheckingProfilePath
                          ? ''
                          : profilePathInspection?.isValid
                            ? ' is-valid'
                            : ' is-error'
                      }`}
                    >
                      {isCheckingProfilePath
                        ? '正在检查目录…'
                        : profilePathInspection?.message || '请输入以 / 开头的本地项目目录。'}
                    </small>
                  </label>

                  <label className="profile-field-row">
                    <span>名称</span>
                    <input
                      value={profileDraft.name ?? ''}
                      readOnly={isEditingSavedProfile}
                      aria-readonly={isEditingSavedProfile}
                      onChange={(event) => {
                        setProfileDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                        setProfileDirty(true)
                      }}
                      placeholder="选择目录后会自动带出名称"
                    />
                  </label>

                  <label className="profile-field-row">
                    <span>项目开发工具</span>
                    <select
                      value={profileDraft.developerTool}
                      onChange={(event) => {
                        setProfileDraft((current) => ({
                          ...current,
                          developerTool: event.target.value as DeveloperTool | '',
                        }))
                        setProfileDirty(true)
                      }}
                    >
                      <option value="">使用默认工具（{selectedDeveloperToolLabel}）</option>
                      {DEVELOPER_TOOL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <small className="field-note">
                      想为这个项目单独指定工具时在这里选；留空就继续使用默认工具。
                    </small>
                  </label>

                  <label className="profile-field-row is-multiline">
                    <span>默认提示</span>
                    <textarea
                      rows={3}
                      value={profileDraft.defaultPromptContext ?? ''}
                      placeholder="可选。写项目的长期背景、目标或默认约束，作为后续任务的补充上下文"
                      onChange={(event) => {
                        setProfileDraft((current) => ({
                          ...current,
                          defaultPromptContext: event.target.value,
                        }))
                        setProfileDirty(true)
                      }}
                    />
                  </label>

                  <label className="profile-field-row is-multiline">
                    <span>使用备注</span>
                    <textarea
                      rows={4}
                      value={profileDraft.usageNotes ?? ''}
                      placeholder="可选。记录使用建议、注意事项或边界，方便后续会话快速接手"
                      onChange={(event) => {
                        setProfileDraft((current) => ({
                          ...current,
                          usageNotes: event.target.value,
                        }))
                        setProfileDirty(true)
                      }}
                    />
                  </label>
                </div>

              </div>

              <div className="project-manager-dialog-actions">
                <button
                  type="button"
                  className="secondary-button ghost"
                  onClick={handleCancelProfileEditing}
                  disabled={!profileDirty}
                >
                  取消编辑
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleProfileSave(selectedProfileId ? 'update' : 'create')}
                  disabled={!canSaveProfile}
                >
                  {selectedProfileId ? '保存项目配置' : '创建项目配置'}
                </button>
                {selectedProfileId ? (
                  <button
                    type="button"
                    className="secondary-button ghost"
                    onClick={handleOpenProfileRemoveDialog}
                  >
                    移除项目配置
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    )
  }

  const renderSessionCreateDialog = () => {
    if (!isSessionCreateDialogOpen) {
      return null
    }

    return (
      <div
        className="session-create-dialog-backdrop"
        role="presentation"
        onClick={handleDismissSessionCreateDialog}
      >
        <section
          className="session-create-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-create-dialog-title"
          aria-describedby="session-create-dialog-description"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="session-create-dialog-kicker">Session Setup</span>
          <h2 id="session-create-dialog-title">新建会话</h2>
          <p id="session-create-dialog-description">
            项目只在创建时决定。创建后不支持切换；如果要去另一个项目，请新建下一条会话。
          </p>

          <div className="session-create-dialog-meta">
            <span>{boundProfileSummary ? `当前项目：${boundProfileSummary.name}` : '当前项目：未绑定'}</span>
            <span>{pendingSessionProfileId ? '将绑定项目启动' : '需先选择项目'}</span>
          </div>

          <label>
            <span>会话初始项目</span>
            <select
              value={pendingSessionProfileId ?? ''}
              onChange={(event) => {
                setPendingSessionProfileId(event.target.value || null)
              }}
            >
              {!hasSavedProfiles ? <option value="">请先创建项目配置</option> : null}
              {appState?.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>

          <p className="panel-note">
            {pendingSessionProfileSummary
              ? `创建后会固定使用「${pendingSessionProfileSummary.name}」，如需换项目，请新建会话。`
              : hasSavedProfiles
                ? '请选择一个项目再创建会话；如需换项目，请新建会话。'
                : '当前还没有项目配置，请先到项目管理里创建项目，再回来新建会话。'}
          </p>

          <div className="session-create-dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handleDismissSessionCreateDialog}
              disabled={isCreatingSession}
            >
              取消
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleSessionCreate()}
              disabled={isCreatingSession || !pendingSessionProfileId}
            >
              {isCreatingSession ? '创建中…' : '创建会话'}
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (!hasDesktopApi && !isSessionScrollHarness) {
    return (
      <main className="shell error-shell">
        <section className="hero-panel">
          <p className="eyebrow">DevCue One</p>
          <h1>当前不在 Electron 环境中。</h1>
          <p>请使用 <code>npm run dev:desktop</code> 启动桌面应用。</p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <aside className="sessions-pane">
        <div className="sessions-scroll panel" role="region" aria-label="会话列表">
          <div className="panel-top">
            <div>
              <p className="eyebrow">Sessions</p>
              <h2>会话</h2>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={handleOpenSessionCreateDialog}
              disabled={isSessionListLoading}
            >
              新建
            </button>
          </div>
          <div className="session-filter-row" role="toolbar" aria-label="会话筛选">
            <div className="summary-chip-group">
              <button
                type="button"
                className={`mini-button ghost session-filter-button${
                  sessionListFilter === 'all' ? ' is-selected' : ''
                }`}
                onClick={() => setSessionListFilter('all')}
                disabled={isSessionListLoading}
                aria-pressed={sessionListFilter === 'all'}
              >
                全部
              </button>
              <button
                type="button"
                className={`mini-button ghost session-filter-button${
                  sessionListFilter === 'project' ? ' is-selected' : ''
                }`}
                onClick={() => setSessionListFilter('project')}
                disabled={!activeSessionProfileId}
                aria-pressed={sessionListFilter === 'project'}
                title={activeSessionProfileId ? '只看当前项目会话' : '当前会话未绑定项目'}
              >
                当前项目
              </button>
            </div>
          </div>
          <div className="session-list" aria-busy={isSessionListLoading}>
            {isSessionListLoading ? (
              renderSessionListSkeleton()
            ) : visibleSessions.length ? (
              visibleSessions.map(renderSessionItem)
            ) : (
              <div className="empty-state">
                <strong>当前项目下还没有会话。</strong>
                <p>可以新建一条会话，或者切回“全部”查看其他项目。</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {sessionContextMenu ? (
        <div
          className="session-context-menu-backdrop"
          role="presentation"
          onClick={() => setSessionContextMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault()
            setSessionContextMenu(null)
          }}
        >
          <div
            className="session-context-menu"
            role="menu"
            aria-label="会话操作"
            style={{
              top: sessionContextMenu.y,
              left: sessionContextMenu.x,
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              className="session-context-menu-item"
              role="menuitem"
              onClick={() =>
                void handleSessionPinToggle({
                  sessionId: sessionContextMenu.sessionId,
                  pinned: !contextMenuSession?.pinnedAt,
                })
              }
            >
              {contextMenuSession?.pinnedAt ? '取消置顶' : '置顶'}
            </button>
            <button
              type="button"
              className="session-context-menu-item session-context-menu-item-danger"
              role="menuitem"
              onClick={() =>
                void handleSessionArchive({
                  sessionId: sessionContextMenu.sessionId,
                })
              }
            >
              归档
            </button>
          </div>
        </div>
      ) : null}

      <section className="workspace-pane">
        <section className="hero-panel panel">
          <div className="hero-copy">
            <p className="eyebrow">Desktop Developer Workspace</p>
            <h1>多会话、按项目组织的语音开发工作台。</h1>
            <p className="hero-subcopy">
              当前激活会话接收语音输入。后台任务可继续运行，完成后默认静默通知，不会打断你正在做的下一件事。
            </p>
          </div>

          <div className="hero-grid">
            <div className="hero-inline hero-focus-card">
              <span>当前会话</span>
              <strong className="hero-session-name">{activeSession?.title || '未选中会话'}</strong>
              <div className="hero-inline-meta">
                <span className={`summary-chip${sessionDetail?.boundProfile?.developerTool ? ' accent' : ''}`}>
                  {activeSessionToolLabel}
                </span>
                <span className="summary-chip">{languageLabel}</span>
                <span className={`summary-chip${activeVoiceInputMode === 'vad_beta' ? ' accent' : ''}`}>
                  {heroVoiceModeLabel}
                </span>
                {settingsDraft.audioMuted ? (
                  <span className="summary-chip accent">静音中</span>
                ) : null}
              </div>
            </div>
            <div className="hero-inline hero-presence-card">
              <div className="hero-presence-head">
                <div>
                  <span>麦克风状态</span>
                  <strong>{microphoneStatusLabel}</strong>
                </div>
                <div className={`status-pill status-${phase} status-pill-compact`}>
                  <span className="status-dot" />
                  <span>{phaseLabel}</span>
                </div>
              </div>
              <div className="hero-inline-meta">
                <span className={`summary-chip${isSpeechDetected ? ' accent' : ''}`}>{voicePresenceLabel}</span>
                <span className="summary-chip">{phaseElapsedSeconds > 0 ? `${phaseElapsedSeconds}s` : '—'}</span>
              </div>
            </div>
          </div>

          <div className="hero-control-row">
            <div className="meter-cluster">
              <div className="meter">
                <span style={{ width: `${Math.min(100, Math.round(level * 900))}%` }} />
              </div>
            </div>
            <div className="hero-actions">
              <div className="hero-action-slot" aria-hidden={!isCapturingUtterance}>
                <button
                  type="button"
                  className={`secondary-button ghost hero-action-transient${
                    isCapturingUtterance ? ' is-visible' : ''
                  }`}
                  onClick={() => {
                    cancelCurrentUtterance()
                    setLastError('')
                    setActivityHint('已取消本次录音，继续保持监听。')
                  }}
                  disabled={!isCapturingUtterance}
                  tabIndex={isCapturingUtterance ? 0 : -1}
                >
                  取消本次录音
                </button>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => setListeningEnabled((current) => !current)}
              >
                {listeningEnabled ? '暂停监听' : '开始监听'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={stopPlayback}
                disabled={!playbackActive}
              >
                停止播报
              </button>
            </div>
          </div>

          <div className={`hero-runtime-card${isBackendBusy ? ' is-active' : ''}`} aria-live="polite">
            <div className="hero-runtime-head">
              <div className="hero-runtime-head-main">
                <span className="hero-runtime-kicker">任务执行面板</span>
                <strong>{backendStatusHeadline}</strong>
              </div>
              <div className="hero-runtime-head-actions">
                <span className="hero-runtime-badge">{backendWorkStatusLabel}</span>
                {isBackendBusy ? (
                  <button
                    type="button"
                    className={`hero-runtime-action hero-runtime-action-${backendWorkTone}`}
                    onClick={handleRequestCancelCurrentTask}
                    disabled={!hasTaskControls}
                    aria-label={backendCancelActionLabel}
                  >
                    {backendCancelActionLabel}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="hero-runtime-track" aria-hidden="true">
              <div className="hero-runtime-lane hero-runtime-lane-top">
                <span className="hero-runtime-packet" />
              </div>
              <div className="hero-runtime-lane hero-runtime-lane-bottom">
                <span className="hero-runtime-packet" />
              </div>
              <div className="hero-runtime-cluster">
                <span className="hero-runtime-module hero-runtime-module-a" />
                <span className="hero-runtime-module hero-runtime-module-b" />
                <span className="hero-runtime-module hero-runtime-module-c" />
                <span className="hero-runtime-module hero-runtime-module-d" />
              </div>
            </div>
            <div className="hero-runtime-copy">
              <p>{backendWorkSummary}</p>
              <div className="hero-runtime-meta">
                <span>{`执行器：${displayedBackendLabel}`}</span>
                <span>{phaseElapsedSeconds > 0 ? `${phaseElapsedSeconds}s` : '刚开始'}</span>
                <span>{isBackendBusy ? '后台处理中' : '等待下一轮任务'}</span>
              </div>
            </div>
          </div>

          <p className="activity-copy">{lastError || activityHint}</p>
        </section>

        <section className="conversation-panel panel">
          <div className="panel-top">
            <div>
              <p className="eyebrow">Conversation</p>
              <h2>{activeSession?.title || '当前会话'}</h2>
            </div>
          </div>

          <div ref={transcriptListRef} className="message-list">
            {visibleConversationMessages.length ? (
              <>
                {visibleConversationMessages.map(renderMessage)}
                {hiddenConversationCount > 0 ? (
                  <button
                    type="button"
                    className="mini-button ghost message-history-toggle"
                    onClick={() => {
                      if (activeSessionId) {
                        setExpandedConversationSessions((current) => ({
                          ...current,
                          [activeSessionId]: true,
                        }))
                      }
                    }}
                  >
                    展开更早消息（{hiddenConversationCount} 条）
                  </button>
                ) : null}
                {isConversationExpanded && conversationMessages.length > 4 ? (
                  <button
                    type="button"
                    className="mini-button ghost message-history-toggle"
                    onClick={() => {
                      if (activeSessionId) {
                        setExpandedConversationSessions((current) => ({
                          ...current,
                          [activeSessionId]: false,
                        }))
                      }
                    }}
                  >
                    收起更早消息
                  </button>
                ) : null}
              </>
            ) : (
              <div className="empty-state">
                <strong>这条会话还没有内容。</strong>
                <p>直接开始说话，或者用下方输入框发起第一条任务。</p>
              </div>
            )}
          </div>

        </section>
      </section>

      <aside className="inspector-pane">
        <div className="inspector-scroll">
          <section className="panel inspector-card inspector-system-card">
            <div className="panel-top">
              <div>
                <p className="eyebrow">System</p>
                <h2>{appDisplayName}</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={handleOpenSettingsWorkspace}
              >
                设置
              </button>
            </div>
            <div className="system-entry-summary">
              <span className="system-entry-tagline">Speak it, Ship it.</span>
              <button
                type="button"
                className="mini-button ghost system-link-button"
                onClick={() => void handleOpenProjectGithub()}
                aria-label="打开 GitHub 项目主页"
                title="打开 GitHub 项目主页"
              >
                <GitHubIcon />
              </button>
              <span className="summary-chip">{appVersionLabel}</span>
            </div>
          </section>

          <section className="panel inspector-card">
            <div className="panel-top">
              <div>
                <p className="eyebrow">Project Context</p>
                <h2>当前项目</h2>
              </div>
              <div className="summary-chip-group">
                <button
                  type="button"
                  className="mini-button ghost"
                  onClick={handleOpenProjectManagerDialog}
                >
                  管理项目
                </button>
              </div>
            </div>
            <div className="profile-summary">
              <div className="profile-summary-lines">
                <div className="summary-chip-group">
                  <span className={`summary-chip${boundProfileSummary ? ' accent' : ''}`}>
                    {boundProfileSummary?.name || '未绑定项目'}
                  </span>
                  <span className="summary-chip">
                    {boundProfileSummary?.developerTool
                      ? providerLabelByValue(
                          DEVELOPER_TOOL_OPTIONS,
                          boundProfileSummary.developerTool,
                        )
                      : '默认工具'}
                  </span>
                </div>
                <span className="summary-chip">
                  <code>{boundProfileSummary?.workingDirectory || '—'}</code>
                </span>
              </div>
              <p className="panel-note">
                项目会在新建会话时确定，创建后不支持切换；如需其他项目，请新建一条会话。
              </p>
            </div>
          </section>

          <section className="panel inspector-card turn-input-inspector-card">
            <div className="panel-top">
              <div>
                <p className="eyebrow">Turn Input</p>
                <h2>本轮输入（精准上下文）</h2>
              </div>
              <div className="summary-chip-group">
                {hasCurrentContextDraft ? <span className="summary-chip accent">已设为下一轮补充</span> : null}
                {queuedTurnCount > 0 ? <span className="summary-chip accent">队列 {queuedTurnCount}</span> : null}
              </div>
            </div>

            <p className="panel-note">
              不方便语音准确输入的 IP 地址、域名、URL、英文字符串、命令或文件路径，可以直接在这里补充。
            </p>

            <div className="composer">
              {hasCurrentContextDraft ? (
                <div className="pending-turn-card">
                  <div className="pending-turn-header">
                    <strong>已设为下一轮补充</strong>
                    <span>下一次语音或文字任务会自动带上这段文字；后续再点会追加，不会覆盖</span>
                  </div>
                  <p>{currentContextDraft}</p>
                  <div className="composer-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleRestoreStagedTurnInput}
                      disabled={!activeSessionId}
                    >
                      取回编辑
                    </button>
                    <button
                      type="button"
                      className="secondary-button ghost"
                      onClick={handleClearStagedTurnInput}
                      disabled={!activeSessionId}
                    >
                      清空暂存
                    </button>
                  </div>
                </div>
              ) : null}

              <textarea
                aria-label="本轮输入（精准上下文）"
                rows={4}
                value={currentMessageDraft}
                onChange={(event) => {
                  if (activeSessionId) {
                    setSessionMessageDraft(activeSessionId, event.target.value)
                  }
                }}
                placeholder="例如：192.168.1.12、api.example.com、https://demo.site/path、英文变量名或命令。这里适合填写不方便语音准确说出的内容。"
              />

              {scheduledSessionTasks.length > 0 ? (
                <div className="turn-queue-card">
                  <div className="speech-config-card-head">
                    <div>
                      <strong>当前会话任务队列</strong>
                      <p className="panel-note">
                        后台会按这个顺序执行；顶部是正在处理的任务，后面是等待中的 follow-up。
                      </p>
                    </div>
                  </div>

                  <div className="turn-queue-list">
                    {scheduledSessionTasks.map((task, index) => (
                      <div
                        key={task.id}
                        className={`turn-queue-item${task.status === 'running' ? ' is-running' : ''}`}
                      >
                        <div className="turn-queue-item-copy">
                          <div className="turn-queue-item-head">
                            <span className="summary-chip">#{index + 1}</span>
                            <span className={`summary-chip${task.status === 'running' ? ' accent' : ''}`}>
                              {formatTaskStatus(task.status)}
                            </span>
                          </div>
                          <strong>{task.inputPreview || task.summary || '未命名任务'}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="composer-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleStageTurnInput}
                  disabled={!activeSessionId || !hasCurrentMessageDraft}
                >
                  {stageTurnInputLabel}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleQueueTextTurn()}
                  disabled={!canQueueCurrentTurnInput}
                >
                  提交到队列
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleSubmitTextTurn()}
                  disabled={!canSubmitCurrentTurnInput}
                >
                  立即提交
                </button>
              </div>
              <p className="panel-note">
                {`${stageTurnInputLabel}会先暂存，已有暂存时会把当前输入追加到末尾；提交到队列会按顺序挂到当前会话后面；立即提交只在当前没有活跃任务时可用。`}
              </p>
            </div>
          </section>

          <section className="panel inspector-card diagnostics-inspector-card">
            <div className="panel-top">
              <div>
                <p className="eyebrow">Diagnostics</p>
                <h2>诊断与任务</h2>
              </div>
              <div className="summary-chip-group">
                {activeTask ? <span className="summary-chip accent">{formatTaskStatus(activeTask.status)}</span> : null}
                <button
                  type="button"
                  className="mini-button ghost"
                  onClick={() => {
                    setIsDiagnosticsInspectorExpanded((current) => !current)
                  }}
                >
                  {isDiagnosticsInspectorExpanded ? '收起' : '展开'}
                </button>
              </div>
            </div>

            {!isDiagnosticsInspectorExpanded ? (
              <>
                <div className="summary-chip-group">
                  <span className="summary-chip">
                    {activeTask ? formatTaskStatus(activeTask.status) : '无活跃任务'}
                  </span>
                  <span className="summary-chip">事件 {sessionDetail?.events.length ?? 0}</span>
                </div>
                <p className="panel-note">默认折叠，需要排查任务与事件时再展开。</p>
              </>
            ) : (
              <>
                <div className="summary-chip-group">
                  {sessionDetail?.session.id ? (
                    <button
                      type="button"
                      className="mini-button ghost"
                      onClick={() =>
                        void handleCopySessionIdentifiers({
                          sessionId: sessionDetail.session.id,
                          runtimeSessionId: sessionDetail.session.codexThreadId,
                        })
                      }
                    >
                      复制会话与运行会话 ID
                    </button>
                  ) : null}
                </div>

                <div className="diagnostic-meta-grid">
                  <div className="diagnostic-meta-item">
                    <span>会话 ID</span>
                    <code>{sessionDetail?.session.id || '—'}</code>
                  </div>
                  <div className="diagnostic-meta-item">
                    <span>运行会话 ID</span>
                    <code>{sessionDetail?.session.codexThreadId || '—'}</code>
                  </div>
                </div>

                {activeTask ? (
                  <div className="task-card">
                    <strong>{activeTask.type === 'voice_turn' ? '语音任务' : '文字任务'}</strong>
                    <p>{activeTask.summary || '任务正在运行中。'}</p>
                    <div className="task-meta">
                      <span>{activeTask.provider || '—'}</span>
                      <span>{activeTask.workingDirectory || '—'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="empty-inline">当前会话没有活跃任务。</div>
                )}

                <div className="event-list">
                  {sessionDetail?.events.length ? (
                    sessionDetail.events.map(renderEvent)
                  ) : (
                    <div className="empty-inline">还没有诊断事件。</div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </aside>

      {isSettingsWorkspaceOpen ? (
        <div
          className="settings-workspace-backdrop"
          role="presentation"
          onClick={handleCloseSettingsWorkspace}
        >
          <div
            className="settings-workspace-shell"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-workspace-title"
            onClick={(event) => event.stopPropagation()}
          >
            {activeSettingsWorkspaceDrawer ? (
              <div className="settings-workspace-drawer-shell">
                {renderSettingsWorkspaceDrawer()}
              </div>
            ) : null}

            <section
              className={`settings-workspace-panel${
                activeSettingsWorkspaceDrawer ? ' is-condensed' : ''
              }`}
            >
              <div className="settings-workspace-header">
                <div>
                  <p className="eyebrow">System Workspace</p>
                  <h2 id="settings-workspace-title">设置</h2>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleCloseSettingsWorkspace}
                >
                  关闭
                </button>
              </div>

              <div className="settings-workspace-scroll">
                <section className="settings-workspace-overview">
                  <article className="settings-workspace-card">
                    <p className="settings-workspace-kicker">软件信息</p>
                    <div className="settings-workspace-card-heading">
                      <strong>{appDisplayName}</strong>
                      <button
                        type="button"
                        className="mini-button ghost system-link-button"
                        onClick={() => void handleOpenProjectGithub()}
                        aria-label="打开 GitHub 项目主页"
                        title="打开 GitHub 项目主页"
                      >
                        <GitHubIcon />
                      </button>
                      <span className="summary-chip">{appVersionLabel}</span>
                    </div>
                  </article>

                  <article className="settings-workspace-card">
                    <p className="settings-workspace-kicker">Appearance</p>
                    <div className="settings-workspace-card-heading">
                      <strong>{activeThemePresetOption.label}</strong>
                      <span className="summary-chip">{activeThemePresetOption.kicker}</span>
                      {settingsDirty ? <span className="summary-chip accent">未保存</span> : null}
                    </div>
                  </article>
                </section>

                <section className="settings-workspace-nav-board">
                  <div className="settings-workspace-nav-list" role="list">
                    <button
                      type="button"
                      className={`settings-workspace-nav-item${
                        activeSettingsWorkspaceDrawer === 'global' ? ' is-active' : ''
                      }`}
                      onClick={() => handleOpenSettingsWorkspaceDrawer('global')}
                    >
                      <div className="settings-workspace-nav-copy">
                        <p className="settings-workspace-kicker">Settings</p>
                        <strong>全局设置</strong>
                        <p>设置语言、默认目录和启动行为。</p>
                      </div>
                      <div className="summary-chip-group">
                        <span className="summary-chip">{languageLabel}</span>
                        <span className="summary-chip">并发 {settingsDraft.globalTaskConcurrency}</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`settings-workspace-nav-item${
                        activeSettingsWorkspaceDrawer === 'speech' ? ' is-active' : ''
                      }`}
                      onClick={() => handleOpenSettingsWorkspaceDrawer('speech')}
                    >
                      <div className="settings-workspace-nav-copy">
                        <p className="settings-workspace-kicker">Voice Workspace</p>
                        <strong>语音输入与默认方案</strong>
                        <p>设置输入模式和默认 STT / TTS。</p>
                      </div>
                      <div className="summary-chip-group">
                        <span className="summary-chip">{draftVoiceInputModeOption.label}</span>
                        <span className="summary-chip">
                          STT：{selectedSttConfig?.name ?? '未选择'}
                        </span>
                        <span className="summary-chip">
                          TTS：{selectedTtsConfig?.name ?? '未选择'}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`settings-workspace-nav-item${
                        activeSettingsWorkspaceDrawer === 'developer_tool' ? ' is-active' : ''
                      }`}
                      onClick={() => handleOpenSettingsWorkspaceDrawer('developer_tool')}
                    >
                      <div className="settings-workspace-nav-copy">
                        <p className="settings-workspace-kicker">Developer Tool</p>
                        <strong>开发工具</strong>
                        <p>选择工具、路径和运行模式。</p>
                      </div>
                      <div className="summary-chip-group">
                        <span className="summary-chip">{selectedDeveloperToolLabel}</span>
                        <span className="summary-chip">{executionModeLabel}</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`settings-workspace-nav-item${
                        activeSettingsWorkspaceDrawer === 'stt' ? ' is-active' : ''
                      }`}
                      onClick={() => handleOpenSettingsWorkspaceDrawer('stt')}
                    >
                      <div className="settings-workspace-nav-copy">
                        <p className="settings-workspace-kicker">Speech Configs</p>
                        <strong>STT 配置库</strong>
                        <p>管理转写服务和测试。</p>
                      </div>
                      <div className="summary-chip-group">
                        <span className="summary-chip">
                          默认：{selectedSttConfig?.name ?? '未选择'}
                        </span>
                        <span className="summary-chip">共 {settingsDraft.sttConfigs.length} 条</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`settings-workspace-nav-item${
                        activeSettingsWorkspaceDrawer === 'tts' ? ' is-active' : ''
                      }`}
                      onClick={() => handleOpenSettingsWorkspaceDrawer('tts')}
                    >
                      <div className="settings-workspace-nav-copy">
                        <p className="settings-workspace-kicker">Speech Configs</p>
                        <strong>TTS 配置库</strong>
                        <p>管理播报服务、音色和测试。</p>
                      </div>
                      <div className="summary-chip-group">
                        <span className="summary-chip">
                          默认：{selectedTtsConfig?.name ?? '未选择'}
                        </span>
                        <span className="summary-chip">共 {settingsDraft.ttsConfigs.length} 条</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`settings-workspace-nav-item${
                        activeSettingsWorkspaceDrawer === 'theme' ? ' is-active' : ''
                      }`}
                      onClick={() => handleOpenSettingsWorkspaceDrawer('theme')}
                    >
                      <div className="settings-workspace-nav-copy">
                        <p className="settings-workspace-kicker">Appearance</p>
                        <strong>主题风格</strong>
                        <p>切换界面主题风格。</p>
                      </div>
                      <div className="summary-chip-group">
                        <span className="summary-chip">{activeThemePresetOption.label}</span>
                        <span className="summary-chip">{activeThemePresetOption.kicker}</span>
                      </div>
                    </button>
                  </div>
                </section>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {renderOnboardingDialog()}
      {renderProjectManagerDialog()}
      {renderSessionCreateDialog()}
      {renderBootSkeleton()}

      {isProfileRemoveDialogOpen ? (
        <div
          className="cancel-task-dialog-backdrop"
          role="presentation"
          onClick={handleDismissProfileRemoveDialog}
        >
          <section
            className="cancel-task-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="profile-remove-dialog-title"
            aria-describedby="profile-remove-dialog-description"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="cancel-task-dialog-kicker">危险操作</span>
            <h2 id="profile-remove-dialog-title">确认移除项目配置？</h2>
            <p id="profile-remove-dialog-description">
              移除后，这个项目配置会从项目库删除；正在使用它的会话也会被解绑。
            </p>
            <div className="cancel-task-dialog-meta">
              <span>{selectedProfileDisplayName}</span>
              <span>
                {selectedProfileSessionCount > 0
                  ? `${selectedProfileSessionCount} 个会话会解绑`
                  : '当前没有会话使用'}
              </span>
            </div>
            <div className="cancel-task-dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleDismissProfileRemoveDialog}
                autoFocus
              >
                取消
              </button>
              <button
                type="button"
                className="primary-button cancel-task-dialog-confirm"
                onClick={() => void handleProfileRemove()}
              >
                确认移除
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isCancelDialogOpen ? (
        <div
          className="cancel-task-dialog-backdrop"
          role="presentation"
          onClick={handleDismissCancelDialog}
        >
          <section
            className="cancel-task-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-task-dialog-title"
            aria-describedby="cancel-task-dialog-description"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="cancel-task-dialog-kicker">任务确认</span>
            <h2 id="cancel-task-dialog-title">{cancelDialogTitle}</h2>
            <p id="cancel-task-dialog-description">{cancelDialogDescription}</p>
            <div className="cancel-task-dialog-meta">
              <span>{backendWorkerLabel}</span>
              <span>{backendWorkStatusLabel}</span>
              <span>{activeSession?.title || '当前会话'}</span>
            </div>
            <div className="cancel-task-dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleDismissCancelDialog}
                autoFocus
              >
                继续运行
              </button>
              <button
                type="button"
                className="primary-button cancel-task-dialog-confirm"
                onClick={() => void handleCancelCurrentTask()}
              >
                {cancelDialogConfirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
