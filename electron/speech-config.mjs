const DEFAULT_STT_LANGUAGE = 'zh'
const DEFAULT_OPENAI_STT_MODEL = 'gpt-4o-mini-transcribe'
const DEFAULT_GROQ_STT_MODEL = 'whisper-large-v3-turbo'
const DEFAULT_ALIBABA_STT_MODEL = 'qwen3-asr-flash'
const DEFAULT_OPENAI_TTS_MODEL = 'gpt-4o-mini-tts'
const DEFAULT_GROQ_TTS_MODEL = 'canopylabs/orpheus-v1-english'
const DEFAULT_ALIBABA_TTS_MODEL = 'qwen3-tts-flash'
const DEFAULT_OPENAI_TTS_VOICE = 'alloy'
const DEFAULT_GROQ_TTS_VOICE = 'austin'
const DEFAULT_ALIBABA_TTS_VOICE = 'Cherry'
const DEFAULT_ALIBABA_BEIJING_OPENAI_BASE_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1'
const DEFAULT_ALIBABA_BEIJING_API_BASE_URL =
  'https://dashscope.aliyuncs.com/api/v1'
const DEFAULT_ALIBABA_INTL_OPENAI_BASE_URL =
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
const DEFAULT_ALIBABA_INTL_API_BASE_URL =
  'https://dashscope-intl.aliyuncs.com/api/v1'
const DEFAULT_VOLCENGINE_STT_BASE_URL =
  'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash'
const DEFAULT_VOLCENGINE_TTS_BASE_URL =
  'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse'
const DEFAULT_VOLCENGINE_STT_RESOURCE_ID = 'volc.bigasr.auc_turbo'
const DEFAULT_VOLCENGINE_TTS_RESOURCE_ID = 'seed-tts-2.0'
const DEFAULT_VOLCENGINE_TTS_SPEAKER = 'zh_female_shuangkuaisisi_uranus_bigtts'

export const DEFAULT_STT_CONFIG_ID = 'stt-openai-default'
export const DEFAULT_TTS_CONFIG_ID = 'tts-browser-default'

const STT_PROVIDER_LABELS = {
  openai: 'OpenAI',
  fake: 'Fake',
  groq: 'Groq',
  alibaba_model_studio: 'Alibaba Model Studio',
  volcengine_speech: 'Volcengine Speech',
  custom_http: 'Custom HTTP',
}

const TTS_PROVIDER_LABELS = {
  browser: 'Browser / System',
  openai: 'OpenAI',
  fake: 'Fake',
  groq: 'Groq',
  alibaba_model_studio: 'Alibaba Model Studio',
  volcengine_speech: 'Volcengine Speech',
  custom_http: 'Custom HTTP',
}

const AVAILABLE_STT_CONFIG_KINDS = new Set([
  'openai',
  'fake',
  'groq',
  'alibaba_model_studio',
  'volcengine_speech',
  'custom_http',
])

const AVAILABLE_TTS_CONFIG_KINDS = new Set([
  'browser',
  'openai',
  'fake',
  'groq',
  'alibaba_model_studio',
  'volcengine_speech',
  'custom_http',
])

const DEFAULT_STT_CONFIGS = [
  {
    id: DEFAULT_STT_CONFIG_ID,
    name: 'OpenAI Main',
    kind: 'openai',
    enabled: true,
    model: DEFAULT_OPENAI_STT_MODEL,
    language: DEFAULT_STT_LANGUAGE,
  },
  {
    id: 'stt-fake-default',
    name: 'Fake STT',
    kind: 'fake',
    enabled: true,
    model: 'fake-transcribe',
    language: DEFAULT_STT_LANGUAGE,
  },
]

const DEFAULT_TTS_CONFIGS = [
  {
    id: DEFAULT_TTS_CONFIG_ID,
    name: 'Browser / System',
    kind: 'browser',
    enabled: true,
    model: DEFAULT_OPENAI_TTS_MODEL,
    voice: DEFAULT_OPENAI_TTS_VOICE,
    format: 'mp3',
  },
  {
    id: 'tts-openai-default',
    name: 'OpenAI Voice',
    kind: 'openai',
    enabled: true,
    model: DEFAULT_OPENAI_TTS_MODEL,
    voice: DEFAULT_OPENAI_TTS_VOICE,
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
]

const OPENAI_COMPATIBLE_STT_KINDS = new Set([
  'openai',
  'groq',
  'custom_http',
])

const OPENAI_COMPATIBLE_TTS_KINDS = new Set([
  'openai',
  'groq',
  'custom_http',
])

const SUPPORTED_STT_RUNTIME_KINDS = new Set([
  'openai',
  'groq',
  'custom_http',
  'alibaba_model_studio',
  'volcengine_speech',
  'fake',
])

const SUPPORTED_TTS_RUNTIME_KINDS = new Set([
  'browser',
  'openai',
  'groq',
  'custom_http',
  'alibaba_model_studio',
  'volcengine_speech',
  'fake',
])

function cloneConfig(config) {
  return {
    ...config,
    extra: config.extra ? { ...config.extra } : undefined,
  }
}

export function createDefaultSttConfigs() {
  return DEFAULT_STT_CONFIGS.map(cloneConfig)
}

export function createDefaultTtsConfigs() {
  return DEFAULT_TTS_CONFIGS.map(cloneConfig)
}

function normalizeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeBoolean(value, fallback = true) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeExtra(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const entries = Object.entries(value)
    .filter(([key]) => typeof key === 'string' && key.trim())
    .map(([key, item]) => [key.trim(), String(item)])

  return entries.length ? Object.fromEntries(entries) : undefined
}

export function resolveSpeechExtra(config, key, fallback = '') {
  return normalizeText(config?.extra?.[key], fallback)
}

function defaultSttModel(kind) {
  if (kind === 'fake') {
    return 'fake-transcribe'
  }

  if (kind === 'groq') {
    return DEFAULT_GROQ_STT_MODEL
  }

  if (kind === 'alibaba_model_studio') {
    return DEFAULT_ALIBABA_STT_MODEL
  }

  if (kind === 'volcengine_speech') {
    return DEFAULT_VOLCENGINE_STT_RESOURCE_ID
  }

  if (kind === 'openai') {
    return DEFAULT_OPENAI_STT_MODEL
  }

  return DEFAULT_OPENAI_STT_MODEL
}

function defaultTtsModel(kind) {
  if (kind === 'fake') {
    return 'fake-tts'
  }

  if (kind === 'groq') {
    return DEFAULT_GROQ_TTS_MODEL
  }

  if (kind === 'alibaba_model_studio') {
    return DEFAULT_ALIBABA_TTS_MODEL
  }

  if (kind === 'volcengine_speech') {
    return DEFAULT_VOLCENGINE_TTS_RESOURCE_ID
  }

  return DEFAULT_OPENAI_TTS_MODEL
}

function defaultTtsVoice(kind) {
  if (kind === 'fake') {
    return 'silent'
  }

  if (kind === 'groq') {
    return DEFAULT_GROQ_TTS_VOICE
  }

  if (kind === 'alibaba_model_studio') {
    return DEFAULT_ALIBABA_TTS_VOICE
  }

  if (kind === 'volcengine_speech') {
    return DEFAULT_VOLCENGINE_TTS_SPEAKER
  }

  return DEFAULT_OPENAI_TTS_VOICE
}

function defaultTtsFormat(kind) {
  if (kind === 'fake' || kind === 'groq' || kind === 'alibaba_model_studio') {
    return 'wav'
  }

  return 'mp3'
}

function normalizeBaseUrl(baseUrl) {
  return normalizeText(baseUrl).replace(/\/+$/, '')
}

function normalizeRegion(region) {
  return normalizeText(region).toLowerCase().replaceAll('_', '-').replace(/\s+/g, '-')
}

function isAlibabaIntlRegion(region) {
  const normalized = normalizeRegion(region)
  return normalized === 'intl' || normalized === 'international' || normalized === 'singapore'
}

function findEnabledConfig(configs, predicate) {
  return configs.find((config) => config.enabled && predicate(config)) || configs.find(predicate)
}

function canUseTtsSynthConfig(settings, config) {
  return Boolean(
    config &&
      supportsTtsRuntime(config.kind) &&
      resolveSpeechApiKey(settings, config) &&
      resolveSpeechBaseUrl(config, 'tts'),
  )
}

function normalizeSttConfig(config, index) {
  const kind = normalizeText(config?.kind, 'openai')
  const providerLabel = STT_PROVIDER_LABELS[kind] || kind
  return {
    id: normalizeText(config?.id, `stt-config-${index + 1}`),
    name: normalizeText(config?.name, `${providerLabel} STT`),
    kind,
    enabled: normalizeBoolean(config?.enabled, true),
    model: normalizeText(config?.model, defaultSttModel(kind)),
    language: normalizeText(config?.language, DEFAULT_STT_LANGUAGE),
    apiKey: normalizeText(config?.apiKey),
    baseUrl: normalizeText(config?.baseUrl),
    region: normalizeText(config?.region),
    extra: normalizeExtra(config?.extra),
  }
}

function normalizeTtsConfig(config, index) {
  const kind = normalizeText(config?.kind, 'browser')
  const providerLabel = TTS_PROVIDER_LABELS[kind] || kind
  return {
    id: normalizeText(config?.id, `tts-config-${index + 1}`),
    name: normalizeText(config?.name, `${providerLabel} TTS`),
    kind,
    enabled: normalizeBoolean(config?.enabled, true),
    model: normalizeText(config?.model, defaultTtsModel(kind)),
    voice: normalizeText(config?.voice, defaultTtsVoice(kind)),
    format: normalizeText(config?.format, defaultTtsFormat(kind)),
    apiKey: normalizeText(config?.apiKey),
    baseUrl: normalizeText(config?.baseUrl),
    region: normalizeText(config?.region),
    extra: normalizeExtra(config?.extra),
  }
}

function mergeConfigs(defaultConfigs, rawConfigs, normalizeConfig) {
  const merged = new Map(defaultConfigs.map((config) => [config.id, cloneConfig(config)]))
  const source = Array.isArray(rawConfigs) ? rawConfigs : []

  source.forEach((config, index) => {
    const normalized = normalizeConfig(config, index)
    const previous = merged.get(normalized.id)
    merged.set(normalized.id, {
      ...previous,
      ...normalized,
      extra: normalized.extra ?? previous?.extra,
    })
  })

  return [...merged.values()]
}

function filterConfigsByAvailableKinds(configs, availableKinds) {
  return configs.filter((config) => availableKinds.has(config.kind))
}

function ensureLegacyConfig(configs, legacyProvider, createConfig) {
  if (!legacyProvider || configs.some((config) => config.kind === legacyProvider)) {
    return configs
  }

  return [
    ...configs,
    createConfig({
      kind: legacyProvider,
    }, configs.length),
  ]
}

function resolveSelectedConfigId(configs, selectedId, legacyProvider, fallbackId) {
  if (selectedId && configs.some((config) => config.id === selectedId)) {
    return selectedId
  }

  const legacyMatch = configs.find((config) => config.kind === legacyProvider)
  if (legacyMatch) {
    return legacyMatch.id
  }

  return configs[0]?.id || fallbackId
}

function syncSelectedSttLegacyFields(settings, selectedConfig) {
  return {
    ...settings,
    sttProvider: selectedConfig.kind,
    transcriptionModel: selectedConfig.model || DEFAULT_OPENAI_STT_MODEL,
    transcriptionLanguage: selectedConfig.language || DEFAULT_STT_LANGUAGE,
  }
}

function syncSelectedTtsLegacyFields(settings, selectedConfig) {
  return {
    ...settings,
    ttsProvider: selectedConfig.kind,
    ttsModel: selectedConfig.model || DEFAULT_OPENAI_TTS_MODEL,
    ttsVoice: selectedConfig.voice || DEFAULT_OPENAI_TTS_VOICE,
  }
}

export function normalizeSpeechSettings(settings) {
  const rawLegacySttProvider = normalizeText(settings?.sttProvider, 'openai')
  const rawLegacyTtsProvider = normalizeText(settings?.ttsProvider, 'browser')
  const legacySttProvider = AVAILABLE_STT_CONFIG_KINDS.has(rawLegacySttProvider)
    ? rawLegacySttProvider
    : 'openai'
  const legacyTtsProvider = AVAILABLE_TTS_CONFIG_KINDS.has(rawLegacyTtsProvider)
    ? rawLegacyTtsProvider
    : 'browser'

  let sttConfigs = mergeConfigs(
    createDefaultSttConfigs(),
    settings?.sttConfigs,
    normalizeSttConfig,
  )
  let ttsConfigs = mergeConfigs(
    createDefaultTtsConfigs(),
    settings?.ttsConfigs,
    normalizeTtsConfig,
  )

  sttConfigs = filterConfigsByAvailableKinds(sttConfigs, AVAILABLE_STT_CONFIG_KINDS)
  ttsConfigs = filterConfigsByAvailableKinds(ttsConfigs, AVAILABLE_TTS_CONFIG_KINDS)

  sttConfigs = ensureLegacyConfig(
    sttConfigs,
    legacySttProvider,
    normalizeSttConfig,
  )
  ttsConfigs = ensureLegacyConfig(
    ttsConfigs,
    legacyTtsProvider,
    normalizeTtsConfig,
  )

  const selectedSttConfigId = resolveSelectedConfigId(
    sttConfigs,
    normalizeText(settings?.selectedSttConfigId),
    legacySttProvider,
    DEFAULT_STT_CONFIG_ID,
  )
  const selectedTtsConfigId = resolveSelectedConfigId(
    ttsConfigs,
    normalizeText(settings?.selectedTtsConfigId),
    legacyTtsProvider,
    DEFAULT_TTS_CONFIG_ID,
  )

  const hasStoredSttConfigs = Array.isArray(settings?.sttConfigs) && settings.sttConfigs.length > 0
  const hasStoredTtsConfigs = Array.isArray(settings?.ttsConfigs) && settings.ttsConfigs.length > 0

  if (!hasStoredSttConfigs) {
    sttConfigs = sttConfigs.map((config) =>
      config.id === selectedSttConfigId
        ? {
            ...config,
            model: normalizeText(settings?.transcriptionModel, config.model),
            language: normalizeText(settings?.transcriptionLanguage, config.language),
          }
        : config,
    )
  }

  if (!hasStoredTtsConfigs) {
    ttsConfigs = ttsConfigs.map((config) =>
      config.id === selectedTtsConfigId
        ? {
            ...config,
            model: normalizeText(settings?.ttsModel, config.model),
            voice: normalizeText(settings?.ttsVoice, config.voice),
          }
        : config,
    )
  }

  const selectedSttConfig =
    sttConfigs.find((config) => config.id === selectedSttConfigId) || sttConfigs[0]
  const selectedTtsConfig =
    ttsConfigs.find((config) => config.id === selectedTtsConfigId) || ttsConfigs[0]

  return syncSelectedTtsLegacyFields(
    syncSelectedSttLegacyFields(
      {
        ...settings,
        sttConfigs,
        ttsConfigs,
        selectedSttConfigId: selectedSttConfig?.id || DEFAULT_STT_CONFIG_ID,
        selectedTtsConfigId: selectedTtsConfig?.id || DEFAULT_TTS_CONFIG_ID,
      },
      selectedSttConfig || normalizeSttConfig({}, 0),
    ),
    selectedTtsConfig || normalizeTtsConfig({}, 0),
  )
}

export function resolveSelectedSttConfig(settings) {
  const normalized = normalizeSpeechSettings(settings)
  return (
    normalized.sttConfigs.find((config) => config.id === normalized.selectedSttConfigId) ||
    normalized.sttConfigs[0]
  )
}

export function resolveSelectedTtsConfig(settings) {
  const normalized = normalizeSpeechSettings(settings)
  return (
    normalized.ttsConfigs.find((config) => config.id === normalized.selectedTtsConfigId) ||
    normalized.ttsConfigs[0]
  )
}

export function isOpenAiCompatibleSttKind(kind) {
  return OPENAI_COMPATIBLE_STT_KINDS.has(kind)
}

export function isOpenAiCompatibleTtsKind(kind) {
  return OPENAI_COMPATIBLE_TTS_KINDS.has(kind)
}

export function supportsSttRuntime(kind) {
  return SUPPORTED_STT_RUNTIME_KINDS.has(kind)
}

export function supportsTtsRuntime(kind) {
  return SUPPORTED_TTS_RUNTIME_KINDS.has(kind)
}

export function defaultApiBaseUrlForProvider(kind, capability = 'generic', region = '') {
  if (kind === 'openai') {
    return 'https://api.openai.com/v1'
  }

  if (kind === 'groq') {
    return 'https://api.groq.com/openai/v1'
  }

  if (kind === 'alibaba_model_studio') {
    const useInternationalEndpoint = isAlibabaIntlRegion(region)
    return capability === 'tts'
      ? useInternationalEndpoint
        ? DEFAULT_ALIBABA_INTL_API_BASE_URL
        : DEFAULT_ALIBABA_BEIJING_API_BASE_URL
      : useInternationalEndpoint
        ? DEFAULT_ALIBABA_INTL_OPENAI_BASE_URL
        : DEFAULT_ALIBABA_BEIJING_OPENAI_BASE_URL
  }

  if (kind === 'volcengine_speech') {
    return capability === 'tts'
      ? DEFAULT_VOLCENGINE_TTS_BASE_URL
      : DEFAULT_VOLCENGINE_STT_BASE_URL
  }

  return ''
}

export function resolveSpeechApiKey(settings, config) {
  const configApiKey = normalizeText(config?.apiKey)
  return configApiKey
}

export function migrateLegacyGlobalOpenAiApiKey(settings) {
  const normalizedApiKey = normalizeText(settings?.openAiApiKey)
  if (!normalizedApiKey) {
    return settings
  }

  const migrateConfigs = (configs) =>
    Array.isArray(configs)
      ? configs.map((config) =>
          config?.kind === 'openai' && !normalizeText(config?.apiKey)
            ? {
                ...config,
                apiKey: normalizedApiKey,
              }
            : config,
        )
      : configs

  return {
    ...settings,
    sttConfigs: migrateConfigs(settings?.sttConfigs),
    ttsConfigs: migrateConfigs(settings?.ttsConfigs),
    openAiApiKey: '',
  }
}

export function resolveSpeechBaseUrl(config, capability = 'generic') {
  return (
    normalizeBaseUrl(config?.baseUrl) ||
    defaultApiBaseUrlForProvider(config?.kind, capability, config?.region)
  )
}

export function resolveSynthesizerTtsConfig(settings) {
  const normalized = normalizeSpeechSettings(settings)
  const selectedConfig = resolveSelectedTtsConfig(normalized)
  if (selectedConfig && selectedConfig.kind !== 'browser') {
    return selectedConfig
  }

  return (
    findEnabledConfig(
      normalized.ttsConfigs,
      (config) => canUseTtsSynthConfig(normalized, config),
    ) ||
    findEnabledConfig(
      normalized.ttsConfigs,
      (config) => isOpenAiCompatibleTtsKind(config.kind),
    ) || null
  )
}
