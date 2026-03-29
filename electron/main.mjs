import { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AppStateStore } from './state-store.mjs'
import {
  buildPrintModeSpawnArgs,
  buildCursorCliArgs,
  DEVELOPER_TOOL_DEFINITIONS,
  defaultCommandForDeveloperTool,
  detectDeveloperToolExecutable,
  developerToolLabel,
  normalizeDeveloperToolSettings,
  parseStructuredDeveloperToolOutput,
  supportsDeveloperToolResume,
} from './developer-tools.mjs'
import {
  createDefaultSttConfigs,
  createDefaultTtsConfigs,
  isOpenAiCompatibleSttKind,
  isOpenAiCompatibleTtsKind,
  migrateLegacyGlobalOpenAiApiKey,
  normalizeSpeechSettings,
  resolveSpeechApiKey,
  resolveSpeechBaseUrl,
  resolveSpeechExtra,
  resolveSelectedSttConfig,
  resolveSelectedTtsConfig,
  resolveSynthesizerTtsConfig,
  supportsSttRuntime,
  supportsTtsRuntime,
} from './speech-config.mjs'
import {
  evaluateVoiceTranscript,
  MIN_VOICE_TRANSCRIPT_CHARS,
} from './voice-heuristics.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '..')
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const require = createRequire(import.meta.url)
const packageManifest = require('../package.json')
const DEFAULT_APP_PRODUCT_NAME = 'DevCueOne'
const APP_PRODUCT_NAME = packageManifest.productName || DEFAULT_APP_PRODUCT_NAME
const APP_BRAND_NAME = 'DevCue One'
const APP_BASE_VERSION = String(packageManifest.version || '').trim() || app.getVersion()
const APP_BUILD_SUFFIX = String(process.env.VOICE_AGENT_BUILD_SUFFIX || '').trim()
const APP_VERSION = APP_BUILD_SUFFIX ? `${APP_BASE_VERSION}+${APP_BUILD_SUFFIX}` : APP_BASE_VERSION
const THEME_PRESET_VALUES = new Set([
  'amber_canvas',
  'jade_orbit',
  'tide_atlas',
  'rose_parlor',
  'graphite_grove',
  'ink_peony',
])
const VOICE_INPUT_MODE_VALUES = new Set(['classic', 'vad_beta'])

app.setName(APP_PRODUCT_NAME)

const defaultSettings = {
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
  developerTool: 'codex',
  developerToolPath: defaultCommandForDeveloperTool('codex'),
  developerToolPaths: {
    codex: defaultCommandForDeveloperTool('codex'),
    claude_code: defaultCommandForDeveloperTool('claude_code'),
    cursor_cli: defaultCommandForDeveloperTool('cursor_cli'),
    gemini_cli: defaultCommandForDeveloperTool('gemini_cli'),
    qwen_cli: defaultCommandForDeveloperTool('qwen_cli'),
  },
  onboardingCompleted: false,
  executionMode:
    (process.env.VOICE_AGENT_CODEX_PROVIDER ?? 'codex') === 'fake' ? 'fake' : 'real',
  codexPath: 'codex',
  workingDirectory: process.cwd(),
  transcriptionModel: 'gpt-4o-mini-transcribe',
  transcriptionLanguage: 'zh',
  sttProvider: process.env.VOICE_AGENT_STT_PROVIDER ?? 'openai',
  ttsProvider: process.env.VOICE_AGENT_TTS_PROVIDER ?? 'browser',
  codexProvider: process.env.VOICE_AGENT_CODEX_PROVIDER ?? 'codex',
  ttsModel: 'gpt-4o-mini-tts',
  ttsVoice: 'alloy',
  workingLanguage: 'zh-CN',
  voiceInputMode: 'classic',
  themePreset: 'amber_canvas',
  autoStartListening: true,
  audioMuted: false,
  bypassCodexSandbox: true,
  globalTaskConcurrency: 2,
  testMode: process.env.VOICE_AGENT_TEST_MODE === '1',
  sttConfigs: createDefaultSttConfigs(),
  ttsConfigs: createDefaultTtsConfigs(),
  selectedSttConfigId: 'stt-openai-default',
  selectedTtsConfigId: 'tts-browser-default',
}

const ACKNOWLEDGEMENT_TEXT = {
  zh: ['好的，马上处理。', '收到。', '请耐心等待。', '明白，请稍等。', '正在提交任务。', '请稍后。'],
  en: ['Okay, I am on it.', 'Received.', 'Please hold on.', 'Understood, one moment.', 'Submitting the task now.', 'Please wait a moment.'],
}

const STT_CONNECTION_TEST_SAMPLE = {
  zh: path.join(__dirname, 'fixtures/stt-connection-test-zh.wav'),
  en: path.join(__dirname, 'fixtures/stt-connection-test-en.wav'),
}

const TTS_CONNECTION_TEST_TEXT = {
  zh: '你好。这是语音配置测试。',
  en: 'Hello. This is a speech configuration test.',
}

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
])

class CancellationError extends Error {
  constructor(message = '已取消当前任务。') {
    super(message)
    this.name = 'CancellationError'
  }
}

let mainWindow = null
let stateStore = null
const runningTasks = new Map()
const queuedTasks = []
const TASK_RECOVERY_EVENT = 'task_recovered'

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function databasePath() {
  return path.join(app.getPath('userData'), 'app-state.sqlite')
}

function legacyDatabasePath() {
  const currentUserDataPath = app.getPath('userData')
  const legacyUserDataPath = path.join(path.dirname(currentUserDataPath), 'Electron')
  const legacyPath = path.join(legacyUserDataPath, 'app-state.sqlite')
  return legacyPath === databasePath() ? null : legacyPath
}

function debugAudioDirectory() {
  return path.join(app.getPath('userData'), 'debug-audio')
}

function ackPackDirectory() {
  return process.env.VOICE_AGENT_ACK_PACK_DIR || path.join(PROJECT_ROOT, 'tmp/audio/ack-pack')
}

function nowIso() {
  return new Date().toISOString()
}

function summarizeTaskInputPreview(input = '') {
  const normalized = String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return '未命名任务'
  }

  return normalized.length > 140 ? `${normalized.slice(0, 140)}…` : normalized
}

function normalizeLanguageBucket(language = '') {
  return language.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

function normalizeSettings(settings) {
  const ttsProvider =
    settings.ttsProvider ||
    (settings.useOpenAiTts ? 'openai' : defaultSettings.ttsProvider)
  const normalizedToolSettings = normalizeDeveloperToolSettings(settings, defaultSettings)
  const normalizedSpeechSettings = normalizeSpeechSettings({
    ...defaultSettings,
    ...settings,
    ...normalizedToolSettings,
    ttsProvider,
    workingDirectory:
      settings.workingDirectory?.trim() || defaultSettings.workingDirectory,
    globalTaskConcurrency: Math.max(
      1,
      Number(settings.globalTaskConcurrency ?? defaultSettings.globalTaskConcurrency),
    ),
  })

  const normalizedThemePreset =
    typeof normalizedSpeechSettings.themePreset === 'string'
      ? normalizedSpeechSettings.themePreset.trim()
      : ''
  const themePreset =
    normalizedThemePreset || defaultSettings.themePreset
  const voiceInputMode = VOICE_INPUT_MODE_VALUES.has(normalizedSpeechSettings.voiceInputMode)
    ? normalizedSpeechSettings.voiceInputMode
    : defaultSettings.voiceInputMode

  return migrateLegacyGlobalOpenAiApiKey({
    ...normalizedSpeechSettings,
    voiceInputMode,
    themePreset,
    audioMuted: normalizedSpeechSettings.audioMuted === true,
  })
}

function voiceInputModeLabel(mode) {
  return mode === 'vad_beta' ? '增强模式（VAD Beta）' : '基础模式'
}

function normalizeProjectDeveloperTool(tool) {
  return DEVELOPER_TOOL_DEFINITIONS[tool] ? tool : null
}

function resolveProfileDeveloperToolSettings(profile, settings) {
  const profileDeveloperTool = normalizeProjectDeveloperTool(profile?.developerTool)
  if (!profileDeveloperTool) {
    return settings
  }

  const developerToolPath =
    settings.developerToolPaths?.[profileDeveloperTool]?.trim() ||
    (settings.developerTool === profileDeveloperTool
      ? settings.developerToolPath?.trim() || ''
      : '') ||
    defaultCommandForDeveloperTool(profileDeveloperTool)

  return {
    ...settings,
    developerTool: profileDeveloperTool,
    developerToolPath,
  }
}

async function inspectWorkingDirectory(rawDirectory) {
  const input = String(rawDirectory ?? '')
  const normalizedPath = input.trim()

  if (!normalizedPath) {
    return {
      input,
      normalizedPath: '',
      exists: false,
      isAbsolute: false,
      isDirectory: false,
      isValid: false,
      message: '请输入项目目录。',
    }
  }

  if (!path.isAbsolute(normalizedPath)) {
    return {
      input,
      normalizedPath,
      exists: false,
      isAbsolute: false,
      isDirectory: false,
      isValid: false,
      message: '请输入以 / 开头的绝对路径。',
    }
  }

  try {
    const stats = await fs.stat(normalizedPath)
    if (!stats.isDirectory()) {
      return {
        input,
        normalizedPath,
        exists: true,
        isAbsolute: true,
        isDirectory: false,
        isValid: false,
        message: '该路径存在，但不是目录。',
      }
    }

    return {
      input,
      normalizedPath,
      exists: true,
      isAbsolute: true,
      isDirectory: true,
      isValid: true,
      message: '目录可用。',
    }
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return {
        input,
        normalizedPath,
        exists: false,
        isAbsolute: true,
        isDirectory: false,
        isValid: false,
        message: '目录不存在，请检查路径。',
      }
    }

    return {
      input,
      normalizedPath,
      exists: false,
      isAbsolute: true,
      isDirectory: false,
      isValid: false,
      message: '目录检查失败，请稍后重试。',
    }
  }
}

async function requireWorkingDirectory(rawDirectory) {
  const inspection = await inspectWorkingDirectory(rawDirectory)
  if (!inspection.isValid) {
    throw new Error(inspection.message)
  }

  return inspection.normalizedPath
}

async function detectDeveloperTool(payload = {}) {
  const settings = normalizeSettings(stateStore?.getSettings?.() || defaultSettings)
  return detectDeveloperToolExecutable({
    tool: payload.tool || settings.developerTool,
    executablePath: payload.executablePath,
  })
}

function broadcastStateChanged() {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('app:state-changed')
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1240,
    minHeight: 820,
    backgroundColor: '#f5f0e8',
    title: APP_BRAND_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    if (process.env.VOICE_AGENT_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function readApiError(response) {
  let responseText = ''

  try {
    responseText = await response.text()
    const payload = JSON.parse(responseText)
    return payload.error?.message || payload.message || payload.code || responseText
  } catch {
    return responseText.trim() || response.statusText
  }
}

function formatErrorMessage(error, fallbackMessage) {
  if (!(error instanceof Error)) {
    return fallbackMessage
  }

  const details = []
  if (error.message) {
    details.push(error.message)
  }

  const cause = error.cause
  if (cause && typeof cause === 'object') {
    const causeMessage = cause.message || cause.code
    if (causeMessage) {
      details.push(String(causeMessage))
    }
  }

  return details.join(' | ') || fallbackMessage
}

function isRetryableNetworkError(error) {
  if (!(error instanceof Error)) {
    return false
  }

  if (error.name === 'AbortError') {
    return false
  }

  const cause = error.cause
  const code = cause && typeof cause === 'object' ? cause.code : undefined
  return error.message === 'fetch failed' || NETWORK_ERROR_CODES.has(code)
}

function extensionFromMimeType(mimeType) {
  if (mimeType.includes('mp4')) {
    return 'mp4'
  }
  if (mimeType.includes('wav')) {
    return 'wav'
  }
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
    return 'mp3'
  }
  return 'webm'
}

function mimeTypeFromExtension(fileName) {
  const extension = path.extname(fileName).toLowerCase()

  switch (extension) {
    case '.mp3':
      return 'audio/mpeg'
    case '.wav':
      return 'audio/wav'
    case '.m4a':
      return 'audio/mp4'
    case '.aac':
      return 'audio/aac'
    case '.opus':
      return 'audio/opus'
    case '.flac':
      return 'audio/flac'
    default:
      return 'audio/mpeg'
  }
}

function decodeBase64Audio(audioBase64) {
  return Uint8Array.from(Buffer.from(audioBase64, 'base64'))
}

function extractTextFromMessageContent(content) {
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

function mimeTypeFromResponse(contentType, sourceUrl = '') {
  const normalizedContentType = String(contentType || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()

  if (normalizedContentType.startsWith('audio/')) {
    return normalizedContentType
  }

  try {
    const url = new URL(sourceUrl)
    return mimeTypeFromExtension(url.pathname)
  } catch {
    return 'audio/wav'
  }
}

function languageTypeForAlibabaTts(workingLanguage = '') {
  return normalizeLanguageBucket(workingLanguage) === 'en' ? 'English' : 'Chinese'
}

function pickSpeechTestLanguage(language = '', workingLanguage = '') {
  const normalized = String(language || '').toLowerCase()
  if (normalized.startsWith('en')) {
    return 'en'
  }

  if (normalized.startsWith('zh')) {
    return 'zh'
  }

  return normalizeLanguageBucket(workingLanguage)
}

function normalizeVolcengineAudioMimeType(mimeType = '') {
  const normalized = String(mimeType || '').toLowerCase()

  if (normalized.includes('wav')) {
    return 'audio/wav'
  }

  if (normalized.includes('mpeg') || normalized.includes('mp3')) {
    return 'audio/mpeg'
  }

  if (normalized.includes('ogg') || normalized.includes('opus')) {
    return 'audio/ogg'
  }

  return ''
}

function normalizeVolcengineTtsEncoding(format = '') {
  const normalized = String(format || '').trim().toLowerCase()

  switch (normalized) {
    case 'wav':
    case 'pcm':
    case 'ogg_opus':
    case 'mp3':
      return normalized
    default:
      return 'mp3'
  }
}

function volcengineTtsMimeTypeForEncoding(encoding = '') {
  switch (encoding) {
    case 'wav':
      return 'audio/wav'
    case 'pcm':
      return 'audio/pcm'
    case 'ogg_opus':
      return 'audio/ogg'
    case 'mp3':
    default:
      return 'audio/mpeg'
  }
}

function parseVolcengineTtsSseResponse(rawText) {
  const chunks = []

  for (const line of String(rawText || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) {
      continue
    }

    const payloadText = trimmed.slice(5).trim()
    if (!payloadText) {
      continue
    }

    let payload
    try {
      payload = JSON.parse(payloadText)
    } catch {
      continue
    }

    if (
      typeof payload?.code === 'number' &&
      payload.code !== 0 &&
      payload.code !== 20000000
    ) {
      throw new Error(payload.message || `Volcengine TTS 请求失败（code ${payload.code}）。`)
    }

    if (typeof payload?.data === 'string' && payload.data.trim()) {
      chunks.push(payload.data.trim())
    }
  }

  return chunks.join('')
}

async function loadSttConnectionTestSample(language = 'zh') {
  const bucket = language === 'en' ? 'en' : 'zh'
  const filePath = STT_CONNECTION_TEST_SAMPLE[bucket]
  const audioBuffer = await fs.readFile(filePath)
  return {
    audioBase64: audioBuffer.toString('base64'),
    mimeType: 'audio/wav',
    language: bucket,
  }
}

async function persistDebugAudio(audioBytes, mimeType) {
  const directory = debugAudioDirectory()
  await fs.mkdir(directory, { recursive: true })
  const extension = extensionFromMimeType(mimeType)
  const filePath = path.join(directory, `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.${extension}`)
  await fs.writeFile(filePath, Buffer.from(audioBytes))
  return filePath
}

function createRuntime(job) {
  const cancelHooks = new Set()

  return {
    ...job,
    cancelled: false,
    cancelHooks,
    addCancelHook(callback) {
      cancelHooks.add(callback)
      return () => cancelHooks.delete(callback)
    },
    cancel(message = '已取消当前任务。') {
      this.cancelled = true
      for (const hook of cancelHooks) {
        try {
          hook()
        } catch {
          // ignore hook failures during cancellation
        }
      }
      throw new CancellationError(message)
    },
    ensureActive(message = '已取消当前任务。') {
      if (this.cancelled) {
        throw new CancellationError(message)
      }
    },
  }
}

function getRunningTaskCount() {
  return runningTasks.size
}

function isQueuedTaskTracked(taskId) {
  return queuedTasks.some((task) => task.taskId === taskId)
}

function buildRecoveredTaskSummary(task, source) {
  const taskLabel = task.status === 'running' ? '运行中' : '排队中'
  if (source === 'startup') {
    return `应用启动时发现遗留的${taskLabel}任务，已自动回收。`
  }

  return `检测到失联的${taskLabel}任务，已自动回收。`
}

function recoverOrphanedTasks(source = 'runtime_check') {
  if (!stateStore) {
    return []
  }

  const recovered = []
  const activeTasks = stateStore.listActiveTasks()

  for (const task of activeTasks) {
    const tracked =
      task.status === 'running' ? runningTasks.has(task.id) : isQueuedTaskTracked(task.id)
    if (tracked) {
      continue
    }

    const finishedAt = nowIso()
    const summary = buildRecoveredTaskSummary(task, source)
    stateStore.updateTask(task.id, {
      status: 'cancelled',
      finishedAt,
      summary,
      errorMessage: '',
    })
    stateStore.createEvent({
      sessionId: task.sessionId,
      taskId: task.id,
      kind: TASK_RECOVERY_EVENT,
      payload: {
        previousStatus: task.status,
        reason: source,
        recoveredAt: finishedAt,
      },
    })
    recovered.push(task)
  }

  if (recovered.length > 0) {
    broadcastStateChanged()
  }

  return recovered
}

function getConfiguredConcurrency() {
  const settings = stateStore.getSettings()
  return Math.max(1, Number(settings.globalTaskConcurrency ?? 2))
}

function findPendingTaskForSession(sessionId) {
  for (const task of runningTasks.values()) {
    if (task.sessionId === sessionId) {
      return task
    }
  }

  return queuedTasks.find((task) => task.sessionId === sessionId) ?? null
}

function hasRunningTaskForSession(sessionId) {
  for (const task of runningTasks.values()) {
    if (task.sessionId === sessionId) {
      return true
    }
  }

  return false
}

function maybeStartNextQueuedTask() {
  while (queuedTasks.length > 0 && getRunningTaskCount() < getConfiguredConcurrency()) {
    const nextIndex = queuedTasks.findIndex((task) => !hasRunningTaskForSession(task.sessionId))
    if (nextIndex === -1) {
      break
    }

    const [job] = queuedTasks.splice(nextIndex, 1)
    startQueuedTask(job)
  }
}

async function finalizeTask(taskId, patch) {
  stateStore.updateTask(taskId, patch)
  broadcastStateChanged()
  maybeStartNextQueuedTask()
}

async function startQueuedTask(job) {
  const runtime = createRuntime(job)
  runningTasks.set(job.taskId, runtime)
  stateStore.updateTask(job.taskId, {
    status: 'running',
    startedAt: nowIso(),
    workingDirectory: job.workingDirectory,
  })
  stateStore.createEvent({
    sessionId: job.sessionId,
    taskId: job.taskId,
    kind: 'task_started',
    payload: {
      source: job.source,
      queuedAt: job.queuedAt,
    },
  })
  broadcastStateChanged()

  try {
    const result = await processTurn(runtime)
    runningTasks.delete(job.taskId)
    await finalizeTask(job.taskId, {
      status: 'completed',
      finishedAt: nowIso(),
      summary: result.uiReply ?? result.spokenReply ?? '',
      errorMessage: '',
      codexThreadId: result.threadId ?? null,
      workingDirectory: job.workingDirectory,
    })
    job.resolve(result)
  } catch (error) {
    runningTasks.delete(job.taskId)
    const isCancelled = error instanceof CancellationError || runtime.cancelled
    const finishedAt = nowIso()

    if (isCancelled) {
      stateStore.addMessage({
        sessionId: job.sessionId,
        taskId: job.taskId,
        role: 'system',
        text: '本轮任务已取消。',
        detail: '任务在执行过程中被取消。',
      })
      await finalizeTask(job.taskId, {
        status: 'cancelled',
        finishedAt,
        summary: '本轮任务已取消。',
        errorMessage: '',
        codexThreadId: null,
        workingDirectory: job.workingDirectory,
      })
      job.resolve({
        sessionId: job.sessionId,
        taskId: job.taskId,
        status: 'cancelled',
        backend: 'local',
        spokenReply: '',
        uiReply: '本轮任务已取消。',
        nextActionHint: '如果你要继续，重新发起一轮就行。',
      })
    } else {
      const message = formatErrorMessage(error, '任务执行失败。')
      stateStore.addMessage({
        sessionId: job.sessionId,
        taskId: job.taskId,
        role: 'system',
        text: message,
        detail: '任务执行过程出现异常。',
      })
      await finalizeTask(job.taskId, {
        status: 'failed',
        finishedAt,
        summary: '任务执行失败。',
        errorMessage: message,
        codexThreadId: null,
        workingDirectory: job.workingDirectory,
      })
      job.resolve({
        sessionId: job.sessionId,
        taskId: job.taskId,
        status: 'failed',
        backend: 'local',
        spokenReply: message,
        uiReply: message,
        nextActionHint: '查看诊断日志，或重新发起一轮。',
      })
    }
  }
}

function scheduleTask(job, options = {}) {
  const mode = options.mode === 'queue' ? 'queue' : 'submit'
  const pending = findPendingTaskForSession(job.sessionId)
  if (pending && mode !== 'queue') {
    throw new Error('当前会话已有任务在运行或排队，请先取消或等待完成。')
  }

  const canStartImmediately =
    !pending && getRunningTaskCount() < getConfiguredConcurrency()

  const task = stateStore.createTask({
    sessionId: job.sessionId,
    type: job.type,
    provider: job.provider,
    inputPreview: summarizeTaskInputPreview(job.inputText),
    workingDirectory: job.workingDirectory,
    status: canStartImmediately ? 'running' : 'queued',
  })

  const queuedJob = {
    ...job,
    taskId: task.id,
    queuedAt: nowIso(),
    resolve: options.resolve || (() => {}),
    reject: options.reject || (() => {}),
  }

  if (task.status === 'running') {
    startQueuedTask(queuedJob)
    return {
      task,
      queuedJob,
      started: true,
    }
  }

  queuedTasks.push(queuedJob)
  stateStore.createEvent({
    sessionId: queuedJob.sessionId,
    taskId: queuedJob.taskId,
    kind: 'task_queued',
    payload: {
      source: queuedJob.source,
      inputPreview: summarizeTaskInputPreview(queuedJob.inputText),
      mode,
    },
  })
  broadcastStateChanged()
  return {
    task,
    queuedJob,
    started: false,
  }
}

function enqueueTask(job, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      scheduleTask(job, {
        ...options,
        resolve,
        reject,
      })
    } catch (error) {
      reject(error)
    }
  })
}

function cancelQueuedTask(sessionId) {
  const index = queuedTasks.findIndex((task) => task.sessionId === sessionId)
  if (index === -1) {
    return false
  }

  const [task] = queuedTasks.splice(index, 1)
  stateStore.updateTask(task.taskId, {
    status: 'cancelled',
    finishedAt: nowIso(),
    summary: '排队中的任务已取消。',
    errorMessage: '',
  })
  stateStore.addMessage({
    sessionId,
    taskId: task.taskId,
    role: 'system',
    text: '排队中的任务已取消。',
  })
  task.resolve({
    sessionId,
    taskId: task.taskId,
    status: 'cancelled',
    backend: 'local',
    spokenReply: '',
    uiReply: '排队中的任务已取消。',
  })
  broadcastStateChanged()
  return true
}

async function cancelSessionTask(sessionId) {
  const recovered = recoverOrphanedTasks('runtime_check')
  const recoveredTask = recovered.find((task) => task.sessionId === sessionId) ?? null

  for (const task of runningTasks.values()) {
    if (task.sessionId === sessionId) {
      task.cancelled = true
      for (const hook of task.cancelHooks) {
        try {
          hook()
        } catch {
          // ignore
        }
      }
      return { cancelled: true, target: 'running' }
    }
  }

  if (cancelQueuedTask(sessionId)) {
    return { cancelled: true, target: 'queued' }
  }

  if (recoveredTask) {
    return {
      cancelled: true,
      target:
        recoveredTask.status === 'running' || recoveredTask.status === 'queued'
          ? recoveredTask.status
          : null,
    }
  }

  return { cancelled: false, target: null }
}

function runSystemCommand(command, args, cwd = process.cwd(), options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timeoutMs = options.timeoutMs ?? 0
    let stdout = ''
    let stderr = ''
    let settled = false

    options.onSpawn?.(child)

    const timeoutHandle =
      timeoutMs > 0
        ? setTimeout(() => {
            if (settled) {
              return
            }
            settled = true
            child.kill('SIGTERM')
            reject(new Error(`${command} 超时（${Math.round(timeoutMs / 1000)} 秒）。`))
          }, timeoutMs)
        : null

    function finalize(fn) {
      if (settled) {
        return
      }
      settled = true
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
      fn()
    }

    child.on('error', (error) => finalize(() => reject(error)))
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      finalize(() => {
        if (code === 0) {
          resolve({ stdout, stderr })
          return
        }

        reject(new Error(stderr.trim() || `${command} 退出码异常：${code}`))
      })
    })
  })
}

function summarizeListeningPorts(rawOutput) {
  const lines = rawOutput.split('\n').slice(1).filter(Boolean)
  const localOnly = new Set()
  const publicPorts = new Set()

  for (const line of lines) {
    const match = line.match(/TCP\s+(.+):(\d+)\s+\(LISTEN\)$/)
    if (!match) {
      continue
    }

    const host = match[1]
    const port = match[2]
    if (host.startsWith('127.') || host === 'localhost' || host === '[::1]' || host === '::1') {
      localOnly.add(port)
    } else {
      publicPorts.add(port)
    }
  }

  return {
    localOnly: [...localOnly].sort((left, right) => Number(left) - Number(right)),
    public: [...publicPorts].sort((left, right) => Number(left) - Number(right)),
  }
}

function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/i)
  return match ? match[0] : null
}

function looksLikePath(value) {
  if (!value) {
    return false
  }

  return value.startsWith('/') || value.startsWith('~/')
}

function findSessionByTitle(rawTitle) {
  const candidate = rawTitle.trim().toLowerCase()
  if (!candidate) {
    return null
  }

  const sessions = stateStore.listSessions()
  return (
    sessions.find((sessionItem) => sessionItem.title.toLowerCase() === candidate) ||
    sessions.find((sessionItem) => sessionItem.title.toLowerCase().includes(candidate)) ||
    null
  )
}

async function routeWorkspaceIntent(sessionId, combinedText) {
  const trimmed = combinedText.trim()

  let match = trimmed.match(/^(?:新建会话|创建会话)\s+(.+)$/i)
  if (match) {
    const title = match[1].trim()
    const session = stateStore.createSession({ title, titleSource: 'manual', activate: true })
    stateStore.addMessage({
      sessionId,
      role: 'system',
      text: `已创建并切换到会话「${session.title}」。`,
    })
    return {
      backend: 'local',
      status: 'done',
      spokenReply: '已创建新会话。',
      uiReply: `已创建并切换到会话「${session.title}」。`,
      activeSessionId: session.id,
      nextActionHint: '后续语音会进入新会话。',
    }
  }

  match = trimmed.match(/^(?:切换会话|切到会话|打开会话|switch session to|switch to session)\s+(.+)$/i)
  if (match) {
    const target = findSessionByTitle(match[1])
    if (!target) {
      return {
        backend: 'local',
        status: 'failed',
        spokenReply: '没有找到目标会话。',
        uiReply: `未找到匹配的会话：${match[1].trim()}`,
        nextActionHint: '请说更精确的会话名称，或先新建一个。',
      }
    }

    stateStore.setActiveSession(target.id)
    stateStore.addMessage({
      sessionId,
      role: 'system',
      text: `已切换到会话「${target.title}」。`,
    })
    return {
      backend: 'local',
      status: 'done',
      spokenReply: '已切换会话。',
      uiReply: `已切换到会话「${target.title}」。`,
      activeSessionId: target.id,
      nextActionHint: '后续输入将归属到该会话。',
    }
  }

  return null
}

async function runLocalShortcut(spokenText = '', pendingText = '') {
  const combined = [spokenText, pendingText].filter(Boolean).join('\n')
  const lower = combined.toLowerCase()
  const maybeUrl = extractUrl(pendingText) || extractUrl(spokenText)
  const pathCandidate = pendingText.trim()

  if (/开放了哪些端口|开放哪些端口|开放端口|监听端口|list (open )?ports|open ports|listening ports/i.test(combined)) {
    const { stdout } = await runSystemCommand('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'])
    const summary = summarizeListeningPorts(stdout)
    const publicText =
      summary.public.length > 0
        ? `可能对局域网开放的 TCP 监听端口：${summary.public.join('、')}`
        : '暂时没有检测到绑定到全接口的 TCP 监听端口'
    const localText =
      summary.localOnly.length > 0
        ? `仅本机回环监听的 TCP 端口：${summary.localOnly.join('、')}`
        : '没有检测到仅回环监听的 TCP 端口'

    return {
      backend: 'local',
      status: 'done',
      spokenReply:
        summary.public.length > 0
          ? `我已经查到了，当前对外监听的端口有 ${summary.public.join('、')}。`
          : '我已经查过了，当前没有看到明显对外监听的 TCP 端口。',
      uiReply: `${publicText}\n${localText}\n\n说明：这里只统计 TCP LISTEN，不含 UDP 和已建立连接。`,
      needTextContext: false,
      nextActionHint: '如果你要，我还可以继续按端口反查对应进程。',
      rawLogs: [stdout.trim()],
    }
  }

  if (/打开浏览器|open browser|launch browser|open chrome/i.test(combined)) {
    const target = maybeUrl || 'https://www.google.com'
    await shell.openExternal(target)
    return {
      backend: 'local',
      status: 'done',
      spokenReply: maybeUrl ? '浏览器已经打开指定链接。' : '浏览器已经打开。',
      uiReply: `已直接调用系统浏览器。\n${target}`,
      needTextContext: false,
      nextActionHint: '继续说下一步，我会接着处理。',
      rawLogs: [`local:openExternal ${target}`],
    }
  }

  if (/打开链接|打开网址|open link|open url/i.test(combined) && maybeUrl) {
    await shell.openExternal(maybeUrl)
    return {
      backend: 'local',
      status: 'done',
      spokenReply: '链接已经打开。',
      uiReply: `已直接调用系统浏览器。\n${maybeUrl}`,
      needTextContext: false,
      nextActionHint: '如果还要继续操作，可以直接说。',
      rawLogs: [`local:openExternal ${maybeUrl}`],
    }
  }

  if (/打开目录|打开文件夹|open folder|open directory/i.test(lower) && looksLikePath(pathCandidate)) {
    const expanded = pathCandidate.startsWith('~/')
      ? path.join(os.homedir(), pathCandidate.slice(2))
      : pathCandidate
    const failure = await shell.openPath(expanded)
    if (failure) {
      throw new Error(failure)
    }
    return {
      backend: 'local',
      status: 'done',
      spokenReply: '目录已经打开。',
      uiReply: `已在系统中打开目录。\n${expanded}`,
      needTextContext: false,
      nextActionHint: '你可以继续说后续动作。',
      rawLogs: [`local:openPath ${expanded}`],
    }
  }

  return null
}

function buildPrompt({
  spokenText = '',
  pendingText = '',
  workingDirectory,
  conversationContext = '',
  profile,
  workingLanguage = 'zh-CN',
}) {
  const languagePrompt =
    workingLanguage.toLowerCase().startsWith('en')
      ? 'The user is currently working in English.'
      : '当前用户默认使用中文交流。'

  return `
你是一个桌面语音代理背后的开发工具执行器。

${languagePrompt}

任务目标：
1. 理解用户输入与补充文本。
2. 把项目配置视为长期上下文。
3. 必要时在工作目录执行检查、开发、文档或审阅任务。
4. 最终严格输出符合 schema 的 JSON。

输出要求：
- 最终回复必须是单个 JSON 对象，禁止代码块、禁止 Markdown、禁止 JSON 之外的任何额外文字。
- spokenReply：简短、适合直接 TTS 播报。
- uiReply：给界面显示，可稍详细，但仍要紧凑。
- status：只能是 done、need_input、failed。
- needTextContext：如果缺 URL、IP、精确路径或字符串，就设为 true。
- nextActionHint：一句话提示下一步。

行为要求：
- 不要凭空猜测项目路径、接口地址和配置值。
- 如果你执行了动作，spokenReply 先说结论。
- 工作目录中的现有修改不能被随意还原。

当前工作目录：
${workingDirectory || '(未提供)'}

当前项目配置：
名称：${profile?.name || '(未绑定)'}
默认说明：${profile?.defaultPromptContext || '(无)'}
补充备注：${profile?.usageNotes || '(无)'}

最近上下文摘要：
${conversationContext || '(无)'}

本轮语音转写：
${spokenText || '(空)'}

本轮补充文本：
${pendingText || '(空)'}
`.trim()
}

async function transcribeWithFetch({
  formData,
  apiKey,
  endpoint,
  runtime,
}) {
  const controller = new AbortController()
  runtime.addCancelHook(() => controller.abort())

  const timeoutHandle = setTimeout(() => {
    controller.abort()
  }, 25_000)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(await readApiError(response))
    }

    return response.json()
  } finally {
    clearTimeout(timeoutHandle)
  }
}

async function transcribeWithCurl({
  audioBytes,
  mimeType,
  language,
  model,
  apiKey,
  endpoint,
  runtime,
}) {
  const extension = extensionFromMimeType(mimeType)
  const audioPath = path.join(app.getPath('temp'), `voice-agent-upload-${randomUUID()}.${extension}`)
  const responsePath = path.join(app.getPath('temp'), `voice-agent-upload-response-${randomUUID()}.json`)

  await fs.writeFile(audioPath, Buffer.from(audioBytes))

  try {
    const args = [
      '-sS',
      '-o',
      responsePath,
      '-w',
      '%{http_code}',
      endpoint,
      '-H',
      `Authorization: Bearer ${apiKey}`,
      '-F',
      `file=@${audioPath};type=${mimeType}`,
      '-F',
      `model=${model}`,
    ]

    if (language) {
      args.push('-F', `language=${language}`)
    }

    const { stdout } = await runSystemCommand('curl', args, process.cwd(), {
      timeoutMs: 25_000,
      onSpawn: (child) => runtime.addCancelHook(() => child.kill('SIGTERM')),
    })
    const statusCode = Number(stdout.trim())
    const responseText = await fs.readFile(responsePath, 'utf8')

    if (statusCode < 200 || statusCode >= 300) {
      let message = `OpenAI 语音转写失败（HTTP ${statusCode}）。`
      try {
        const payload = JSON.parse(responseText)
        message = payload.error?.message || message
      } catch {
        if (responseText.trim()) {
          message = responseText.trim()
        }
      }
      throw new Error(message)
    }

    return JSON.parse(responseText)
  } finally {
    await fs.unlink(audioPath).catch(() => {})
    await fs.unlink(responsePath).catch(() => {})
  }
}

async function transcribeWithAlibabaQwenAsr({
  audioBase64,
  mimeType,
  language,
  model,
  apiKey,
  endpoint,
  runtime,
}) {
  const controller = new AbortController()
  runtime.addCancelHook(() => controller.abort())

  const timeoutHandle = setTimeout(() => {
    controller.abort()
  }, 25_000)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: `data:${mimeType};base64,${audioBase64}`,
                },
              },
            ],
          },
        ],
        stream: false,
        asr_options: {
          enable_itn: false,
          ...(language ? { language } : {}),
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(await readApiError(response))
    }

    const payload = await response.json()
    return {
      text: extractTextFromMessageContent(payload?.choices?.[0]?.message?.content),
    }
  } finally {
    clearTimeout(timeoutHandle)
  }
}

async function transcribeWithVolcengineBigAsr({
  audioBase64,
  mimeType,
  apiKey,
  appId,
  endpoint,
  resourceId,
  runtime,
}) {
  const normalizedMimeType = normalizeVolcengineAudioMimeType(mimeType)
  if (!normalizedMimeType) {
    throw new Error(
      'Volcengine STT 当前只保证支持 WAV、MP3、OGG Opus 输入。请切换到增强模式（VAD Beta）或更新录音格式后再试。',
    )
  }

  const controller = new AbortController()
  runtime.addCancelHook(() => controller.abort())

  const timeoutHandle = setTimeout(() => {
    controller.abort()
  }, 25_000)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-App-Key': appId,
        'X-Api-Access-Key': apiKey,
        'X-Api-Resource-Id': resourceId,
        'X-Api-Request-Id': randomUUID(),
        'X-Api-Sequence': '-1',
      },
      body: JSON.stringify({
        user: {
          uid: appId,
        },
        audio: {
          data: audioBase64,
        },
        request: {
          model_name: 'bigmodel',
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(await readApiError(response))
    }

    const apiStatusCode = response.headers.get('X-Api-Status-Code') || ''
    const apiMessage = response.headers.get('X-Api-Message') || ''
    const logId = response.headers.get('X-Tt-Logid') || ''
    const payload = await response.json()

    if (apiStatusCode && apiStatusCode !== '20000000' && apiStatusCode !== '20000003') {
      throw new Error(
        [apiMessage, payload?.message, logId ? `logid: ${logId}` : '']
          .filter(Boolean)
          .join(' | ') || 'Volcengine STT 请求失败。',
      )
    }

    return {
      text: String(payload?.result?.text || '').trim(),
    }
  } finally {
    clearTimeout(timeoutHandle)
  }
}

async function transcribeAudio(runtime, payload, settings) {
  const activeConfig = resolveSelectedSttConfig(settings)
  const provider = activeConfig?.kind || settings.sttProvider || 'openai'
  if (provider === 'fake' || settings.testMode) {
    const text =
      process.env.VOICE_AGENT_FAKE_TRANSCRIPT ||
      (settings.workingLanguage?.toLowerCase().startsWith('en')
        ? 'Please check the current git branch.'
        : '帮我看下项目代码提交状态。')

    return {
      text,
      durationMs: 80,
      debugAudioPath: '',
      provider: 'fake',
    }
  }

  if (!activeConfig) {
    throw new Error('当前未选择可用的 STT 配置。')
  }

  if (!supportsSttRuntime(provider)) {
    throw new Error(`当前 STT provider 暂未接入运行时：${provider}`)
  }

  const apiKey = resolveSpeechApiKey(settings, activeConfig)
  const baseUrl = resolveSpeechBaseUrl(activeConfig, 'stt')
  const appId = resolveSpeechExtra(activeConfig, 'appId')
  if (!apiKey) {
    throw new Error(`当前 STT 配置缺少 API Key：${activeConfig.name}`)
  }
  if (!baseUrl) {
    throw new Error(`当前 STT 配置缺少 Base URL：${activeConfig.name}`)
  }
  if (provider === 'volcengine_speech' && !appId) {
    throw new Error(`当前 STT 配置缺少 App ID：${activeConfig.name}`)
  }

  const audioBytes = decodeBase64Audio(payload.audioBase64)
  const model = payload.model || activeConfig?.model || settings.transcriptionModel
  const language = payload.language || activeConfig?.language || settings.transcriptionLanguage
  const startedAt = Date.now()
  let debugAudioPath = ''
  let lastError = null

  try {
    debugAudioPath = await persistDebugAudio(audioBytes, payload.mimeType)
  } catch {
    debugAudioPath = ''
  }

  try {
    if (provider === 'alibaba_model_studio') {
      const endpoint = `${baseUrl}/chat/completions`
      const data = await transcribeWithAlibabaQwenAsr({
        audioBase64: payload.audioBase64,
        mimeType: payload.mimeType,
        language,
        model,
        apiKey,
        endpoint,
        runtime,
      })

      return {
        text: data.text ?? '',
        durationMs: Date.now() - startedAt,
        debugAudioPath,
        provider,
      }
    }

    if (provider === 'volcengine_speech') {
      const data = await transcribeWithVolcengineBigAsr({
        audioBase64: payload.audioBase64,
        mimeType: payload.mimeType,
        apiKey,
        appId,
        endpoint: baseUrl,
        resourceId: model || 'volc.bigasr.auc_turbo',
        runtime,
      })

      return {
        text: data.text ?? '',
        durationMs: Date.now() - startedAt,
        debugAudioPath,
        provider,
      }
    }

    if (!isOpenAiCompatibleSttKind(provider)) {
      throw new Error(`当前 STT provider 暂未接入运行时：${provider}`)
    }

    const endpoint = `${baseUrl}/audio/transcriptions`

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const formData = new FormData()
      formData.append(
        'file',
        new Blob([audioBytes], { type: payload.mimeType }),
        `utterance.${extensionFromMimeType(payload.mimeType)}`,
      )
      formData.append('model', model)
      if (language) {
        formData.append('language', language)
      }

      try {
        const data = await transcribeWithFetch({
          formData,
          apiKey,
          endpoint,
          runtime,
        })
        return {
          text: data.text ?? '',
          durationMs: Date.now() - startedAt,
          debugAudioPath,
          provider,
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new CancellationError('已取消语音转写。')
        }
        lastError = error
        if (!isRetryableNetworkError(error) || attempt === 1) {
          break
        }
      }
    }

    const data = await transcribeWithCurl({
      audioBytes,
      mimeType: payload.mimeType,
      language,
      model,
      apiKey,
      endpoint,
      runtime,
    })

    return {
      text: data.text ?? '',
      durationMs: Date.now() - startedAt,
      debugAudioPath,
      provider,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CancellationError('已取消语音转写。')
    }

    throw new Error(
      formatErrorMessage(
        error ?? lastError,
        `${activeConfig.name || provider} 语音转写失败，请稍后重试。`,
      ),
    )
  }
}

function generateSilentWavBuffer(durationMs = 600) {
  const sampleRate = 16000
  const channels = 1
  const bitsPerSample = 16
  const samples = Math.max(1, Math.floor((sampleRate * durationMs) / 1000))
  const dataSize = samples * channels * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28)
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  return buffer
}

async function synthesizeWithAlibabaQwenTts({
  text,
  model,
  voice,
  languageType,
  apiKey,
  baseUrl,
  runtime,
}) {
  const controller = new AbortController()
  runtime.addCancelHook(() => controller.abort())

  const timeoutHandle = setTimeout(() => {
    controller.abort()
  }, 45_000)

  try {
    const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: {
          text,
          voice,
          language_type: languageType,
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(await readApiError(response))
    }

    const payload = await response.json()
    if (payload?.code || payload?.message === 'error') {
      throw new Error(payload?.message || payload?.code || 'Alibaba TTS 请求失败。')
    }

    const inlineAudioBase64 = payload?.output?.audio?.data
    if (typeof inlineAudioBase64 === 'string' && inlineAudioBase64.trim()) {
      return {
        mimeType: 'audio/wav',
        audioBase64: inlineAudioBase64,
      }
    }

    const audioUrl = payload?.output?.audio?.url
    if (!audioUrl) {
      throw new Error('Alibaba TTS 未返回可下载的音频地址。')
    }

    const audioResponse = await fetch(audioUrl, {
      signal: controller.signal,
    })

    if (!audioResponse.ok) {
      throw new Error(await readApiError(audioResponse))
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())
    return {
      mimeType: mimeTypeFromResponse(audioResponse.headers.get('content-type'), audioUrl),
      audioBase64: audioBuffer.toString('base64'),
    }
  } finally {
    clearTimeout(timeoutHandle)
  }
}

async function synthesizeWithVolcengineTts({
  text,
  resourceId,
  speaker,
  format,
  apiKey,
  baseUrl,
  runtime,
}) {
  const controller = new AbortController()
  runtime.addCancelHook(() => controller.abort())

  const timeoutHandle = setTimeout(() => {
    controller.abort()
  }, 45_000)

  const encoding = normalizeVolcengineTtsEncoding(format)

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'X-Api-Resource-Id': resourceId,
        'X-Api-Request-Id': randomUUID(),
      },
      body: JSON.stringify({
        user: {
          uid: 'DevCueOne',
        },
        req_params: {
          text,
          speaker,
          audio_params: {
            format: encoding,
            sample_rate: 24000,
          },
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(await readApiError(response))
    }

    const rawText = await response.text()
    const audioBase64 = parseVolcengineTtsSseResponse(rawText)
    if (!audioBase64) {
      throw new Error('Volcengine TTS 未返回音频数据。')
    }

    return {
      mimeType: volcengineTtsMimeTypeForEncoding(encoding),
      audioBase64,
    }
  } finally {
    clearTimeout(timeoutHandle)
  }
}

async function synthesizeSpeech(payload, settings) {
  const selectedConfig = resolveSelectedTtsConfig(settings)
  const activeConfig = resolveSynthesizerTtsConfig(settings)
  const provider = activeConfig?.kind || selectedConfig?.kind || settings.ttsProvider || 'browser'

  if (provider === 'fake' || settings.testMode) {
    const wavBuffer = generateSilentWavBuffer(700)
    return {
      mimeType: 'audio/wav',
      audioBase64: wavBuffer.toString('base64'),
      provider: 'fake',
    }
  }

  if (!activeConfig) {
    throw new Error('当前没有可用于合成的云端 TTS 配置。')
  }

  if (!supportsTtsRuntime(provider)) {
    throw new Error(`当前 TTS provider 暂未接入主进程语音合成：${provider}`)
  }

  const apiKey = resolveSpeechApiKey(settings, activeConfig)
  const baseUrl = resolveSpeechBaseUrl(activeConfig, 'tts')
  const model = payload.model || activeConfig?.model || settings.ttsModel
  const voice = payload.voice || activeConfig?.voice || settings.ttsVoice
  if (!apiKey) {
    throw new Error(`当前 TTS 配置缺少 API Key：${activeConfig.name}`)
  }
  if (!baseUrl) {
    throw new Error(`当前 TTS 配置缺少 Base URL：${activeConfig.name}`)
  }

  const controller = new AbortController()
  const cleanup = () => controller.abort()

  try {
    if (provider === 'alibaba_model_studio') {
      const synthesized = await synthesizeWithAlibabaQwenTts({
        text: payload.text,
        model,
        voice,
        languageType: languageTypeForAlibabaTts(settings.workingLanguage),
        apiKey,
        baseUrl,
        runtime: {
          addCancelHook(handler) {
            controller.signal.addEventListener('abort', handler, { once: true })
          },
        },
      })

      return {
        ...synthesized,
        provider,
      }
    }

    if (provider === 'volcengine_speech') {
      const synthesized = await synthesizeWithVolcengineTts({
        text: payload.text,
        resourceId: model || 'seed-tts-2.0',
        speaker: voice || 'zh_female_shuangkuaisisi_uranus_bigtts',
        format: activeConfig?.format || 'mp3',
        apiKey,
        baseUrl,
        runtime: {
          addCancelHook(handler) {
            controller.signal.addEventListener('abort', handler, { once: true })
          },
        },
      })

      return {
        ...synthesized,
        provider,
      }
    }

    if (!isOpenAiCompatibleTtsKind(provider)) {
      throw new Error(`当前 TTS provider 暂未接入主进程语音合成：${provider}`)
    }

    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice,
        input: payload.text,
        response_format: activeConfig?.format || 'mp3',
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(await readApiError(response))
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer())
    return {
      mimeType:
        activeConfig?.format === 'wav'
          ? 'audio/wav'
          : activeConfig?.format === 'aac'
            ? 'audio/aac'
            : 'audio/mpeg',
      audioBase64: audioBuffer.toString('base64'),
      provider,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CancellationError('已取消语音播报。')
    }
    throw error
  } finally {
    cleanup()
  }
}

async function testSttConfigConnection(payload = {}) {
  const normalized = normalizeSettings(payload.settings || stateStore.getSettings())
  const config =
    normalized.sttConfigs.find((item) => item.id === payload.configId) ||
    resolveSelectedSttConfig(normalized)

  if (!config) {
    return {
      ok: false,
      capability: 'stt',
      provider: 'unknown',
      configId: '',
      configName: '',
      detail: '未找到可测试的 STT 配置。',
      latencyMs: 0,
    }
  }

  const language = pickSpeechTestLanguage(config.language, normalized.workingLanguage)
  const startedAt = Date.now()

  try {
    const sample = await loadSttConnectionTestSample(language)
    const result = await transcribeAudio(
      createRuntime({
        taskId: `speech-test-stt-${config.id}`,
        sessionId: null,
      }),
      {
        ...sample,
        model: config.model,
      },
      normalizeSettings({
        ...normalized,
        selectedSttConfigId: config.id,
        sttProvider: config.kind,
        transcriptionModel: config.model,
        transcriptionLanguage: language,
        testMode: false,
      }),
    )

    const transcript = result.text?.trim() || ''
    return {
      ok: Boolean(transcript),
      capability: 'stt',
      provider: config.kind,
      configId: config.id,
      configName: config.name,
      detail: transcript ? '转写接口调用成功。' : '请求成功，但没有返回可读文本。',
      latencyMs: Date.now() - startedAt,
      transcript,
    }
  } catch (error) {
    return {
      ok: false,
      capability: 'stt',
      provider: config.kind,
      configId: config.id,
      configName: config.name,
      detail: formatErrorMessage(error, `${config.name} STT 连通性测试失败。`),
      latencyMs: Date.now() - startedAt,
    }
  }
}

async function testTtsConfigConnection(payload = {}) {
  const normalized = normalizeSettings(payload.settings || stateStore.getSettings())
  const config =
    normalized.ttsConfigs.find((item) => item.id === payload.configId) ||
    resolveSelectedTtsConfig(normalized)

  if (!config) {
    return {
      ok: false,
      capability: 'tts',
      provider: 'unknown',
      configId: '',
      configName: '',
      detail: '未找到可测试的 TTS 配置。',
      latencyMs: 0,
    }
  }

  const language = pickSpeechTestLanguage('', normalized.workingLanguage)
  const startedAt = Date.now()

  try {
    const synthesis = await synthesizeSpeech(
      {
        text: TTS_CONNECTION_TEST_TEXT[language],
        model: config.model,
        voice: config.voice,
      },
      normalizeSettings({
        ...normalized,
        selectedTtsConfigId: config.id,
        ttsProvider: config.kind,
        ttsModel: config.model,
        ttsVoice: config.voice,
        testMode: false,
      }),
    )

    return {
      ok: Boolean(synthesis.audioBase64),
      capability: 'tts',
      provider: config.kind,
      configId: config.id,
      configName: config.name,
      detail: synthesis.audioBase64
        ? `语音合成成功，格式 ${synthesis.mimeType}。`
        : '请求成功，但没有返回音频数据。',
      latencyMs: Date.now() - startedAt,
      synthesis,
    }
  } catch (error) {
    return {
      ok: false,
      capability: 'tts',
      provider: config.kind,
      configId: config.id,
      configName: config.name,
      detail: formatErrorMessage(error, `${config.name} TTS 连通性测试失败。`),
      latencyMs: Date.now() - startedAt,
    }
  }
}

async function runFakeCodexTurn(payload, settings, sessionDetail) {
  const combined = [payload.inputText, payload.pendingText].filter(Boolean).join('\n')
  const isEnglish = settings.workingLanguage.toLowerCase().startsWith('en')
  const workingDirectory = payload.workingDirectory || settings.workingDirectory

  if (/need more info|需要更多信息|缺少|missing/i.test(combined)) {
    return {
      threadId: sessionDetail.session.codexThreadId ?? null,
      status: 'need_input',
      backend: 'fake',
      spokenReply: isEnglish ? 'I need a bit more detail first.' : '我还需要一点更精确的信息。',
      uiReply: isEnglish
        ? 'Fake runner requests more detail before continuing.'
        : 'Fake runner 认为当前信息不足，需要更精确的路径、分支、文件名或目标说明。',
      needTextContext: true,
      nextActionHint: isEnglish ? 'Add the missing path or identifier and send again.' : '补充更具体的路径、分支或文件名后再发起一轮。',
      rawLogs: ['fake:need_input'],
    }
  }

  if (/fail|error|失败|报错/i.test(combined)) {
    return {
      threadId: sessionDetail.session.codexThreadId ?? null,
      status: 'failed',
      backend: 'fake',
      spokenReply: isEnglish ? 'The fake runner reports a failure.' : 'Fake runner 模拟了一次失败。',
      uiReply: isEnglish
        ? 'Fake runner returned a failure for this input.'
        : 'Fake runner 根据输入内容故意返回失败，便于测试错误路径。',
      needTextContext: false,
      nextActionHint: isEnglish ? 'Adjust the prompt or switch back to real execution mode.' : '你可以调整输入，或者切回真实执行模式。',
      rawLogs: ['fake:failed'],
    }
  }

  const threadId = sessionDetail.session.codexThreadId || `fake-thread-${sessionDetail.session.id.slice(0, 8)}`
  return {
    threadId,
    status: 'done',
    backend: 'fake',
    spokenReply: isEnglish
      ? 'Done. The fake runner has accepted the task.'
      : '收到，fake runner 已经接住这项任务。',
    uiReply: [
      isEnglish ? 'Fake Tool Runner' : 'Fake Tool Runner',
      `${isEnglish ? 'Directory' : '目录'}: ${workingDirectory}`,
      `${isEnglish ? 'Input' : '输入'}: ${payload.inputText || '(empty)'}`,
      payload.pendingText
        ? `${isEnglish ? 'Merged context' : '补充上下文'}: ${payload.pendingText}`
        : '',
      sessionDetail.boundProfile?.usageNotes
        ? `${isEnglish ? 'Profile notes' : '项目备注'}: ${sessionDetail.boundProfile.usageNotes}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    needTextContext: false,
    nextActionHint: isEnglish
      ? 'This is a deterministic fake result for automation and UI testing.'
      : '这是用于自动化和 UI 验证的确定性 fake 结果。',
    rawLogs: ['fake:done'],
  }
}

async function runCodexCliTurn(runtime, payload, settings, sessionDetail) {
  const codexPath =
    settings.developerToolPath?.trim() ||
    settings.codexPath?.trim() ||
    defaultCommandForDeveloperTool('codex')
  const workingDirectory = payload.workingDirectory?.trim() || settings.workingDirectory || process.cwd()
  const sessionThreadId = sessionDetail.session.codexThreadId?.trim()
  const shouldResume = Boolean(sessionThreadId)
  const outputFile = path.join(app.getPath('temp'), `voice-agent-${randomUUID()}.json`)
  const schemaPath = path.join(__dirname, 'codex-output-schema.json')
  const prompt = buildPrompt({
    spokenText: payload.inputText,
    pendingText: payload.pendingText,
    workingDirectory,
    conversationContext: payload.conversationContext,
    profile: sessionDetail.boundProfile,
    workingLanguage: settings.workingLanguage,
  })

  const args = shouldResume
    ? [
        'exec',
        'resume',
        sessionThreadId,
        '--skip-git-repo-check',
        '--json',
        '-o',
        outputFile,
      ]
    : [
        'exec',
        '--skip-git-repo-check',
        '--json',
        '--output-schema',
        schemaPath,
        '-o',
        outputFile,
        '-C',
        workingDirectory,
      ]

  if (settings.bypassCodexSandbox !== false) {
    args.push('--dangerously-bypass-approvals-and-sandbox')
  }

  args.push('-')

  let stdoutBuffer = ''
  let stderrBuffer = ''
  let threadId = sessionThreadId
  const rawLogs = [
    `turn:mode=${shouldResume ? 'resume' : 'exec'}`,
    `turn:cwd=${workingDirectory}`,
    `turn:session=${sessionDetail.session.id}`,
    `turn:spokenChars=${payload.inputText?.length ?? 0}`,
    `turn:pendingChars=${payload.pendingText?.length ?? 0}`,
    `turn:contextChars=${payload.conversationContext?.length ?? 0}`,
  ]
  const timeoutMs = Number.parseInt(process.env.CODEX_TURN_TIMEOUT_MS ?? '0', 10)

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(codexPath, args, {
        cwd: workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      runtime.addCancelHook(() => child.kill('SIGTERM'))
      rawLogs.push(`turn:spawn pid=${child.pid ?? 'unknown'}`)

      const timeoutHandle =
        Number.isFinite(timeoutMs) && timeoutMs > 0
          ? setTimeout(() => {
              rawLogs.push(`timeout: Codex 超过 ${timeoutMs / 1000} 秒未完成，已中断`)
              child.kill('SIGTERM')
            }, timeoutMs)
          : null

      child.on('error', (error) => reject(error))

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line) {
            continue
          }

          rawLogs.push(line)
          if (!line.startsWith('{')) {
            continue
          }

          try {
            const event = JSON.parse(line)
            if (event.type === 'thread.started') {
              threadId = event.thread_id
            }
          } catch {
            // keep raw log only
          }
        }
      })

      child.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
        const lines = stderrBuffer.split('\n')
        stderrBuffer = lines.pop() ?? ''
        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (line) {
            rawLogs.push(line)
          }
        }
      })

      child.on('close', (code) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
        }

        if (stdoutBuffer.trim()) {
          rawLogs.push(stdoutBuffer.trim())
        }
        if (stderrBuffer.trim()) {
          rawLogs.push(stderrBuffer.trim())
        }

        if (runtime.cancelled) {
          reject(new CancellationError())
          return
        }

        if (code !== 0) {
          reject(
            new Error(
              rawLogs.find((line) => line.includes('401 Unauthorized')) ||
                rawLogs.at(-1) ||
                `Codex 退出码异常：${code}`,
            ),
          )
          return
        }

        resolve(undefined)
      })

      child.stdin.end(prompt)
    })
  } catch (error) {
    await fs.unlink(outputFile).catch(() => {})
    if (error instanceof CancellationError) {
      return {
        threadId,
        backend: 'codex',
        rawLogs,
        status: 'cancelled',
        spokenReply: '',
        uiReply: '本轮任务已取消。',
        needTextContext: false,
        nextActionHint: '如果你要继续，重新发起一轮就行。',
      }
    }
    throw error
  }

  try {
    const rawOutput = await fs.readFile(outputFile, 'utf8')
    const parsed = JSON.parse(rawOutput)
    await fs.unlink(outputFile).catch(() => {})
    return {
      threadId,
      backend: 'codex',
      rawLogs,
      ...parsed,
    }
  } catch (error) {
    await fs.unlink(outputFile).catch(() => {})
    throw new Error(
      error instanceof Error
        ? `Codex 输出解析失败：${error.message}`
        : 'Codex 输出解析失败。',
    )
  }
}

async function runPrintModeDeveloperToolTurn({
  backend,
  command,
  args,
  prompt,
  workingDirectory,
  runtime,
  sessionThreadId = null,
}) {
  let stdoutBuffer = ''
  let stderrBuffer = ''
  const rawLogs = [
    `turn:tool=${backend}`,
    `turn:cwd=${workingDirectory}`,
    `turn:mode=print`,
  ]
  const timeoutMs = Number.parseInt(process.env.CODEX_TURN_TIMEOUT_MS ?? '0', 10)

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        command,
        buildPrintModeSpawnArgs({
          backend,
          args,
          prompt,
        }),
        {
        cwd: workingDirectory,
        stdio: ['ignore', 'pipe', 'pipe'],
        },
      )

      runtime.addCancelHook(() => child.kill('SIGTERM'))
      rawLogs.push(`turn:spawn pid=${child.pid ?? 'unknown'}`)

      const timeoutHandle =
        Number.isFinite(timeoutMs) && timeoutMs > 0
          ? setTimeout(() => {
              rawLogs.push(
                `timeout: ${developerToolLabel(backend)} 超过 ${timeoutMs / 1000} 秒未完成，已中断`,
              )
              child.kill('SIGTERM')
            }, timeoutMs)
          : null

      child.on('error', (error) => reject(error))

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
      })

      child.on('close', (code) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
        }

        if (stdoutBuffer.trim()) {
          rawLogs.push(stdoutBuffer.trim())
        }
        if (stderrBuffer.trim()) {
          rawLogs.push(stderrBuffer.trim())
        }

        if (runtime.cancelled) {
          reject(new CancellationError())
          return
        }

        if (code !== 0) {
          reject(
            new Error(
              rawLogs.find((line) => line.includes('401 Unauthorized')) ||
                rawLogs.at(-1) ||
                `${developerToolLabel(backend)} 退出码异常：${code}`,
            ),
          )
          return
        }

        resolve(undefined)
      })
    })
  } catch (error) {
    if (error instanceof CancellationError) {
      return {
        threadId: sessionThreadId,
        backend,
        rawLogs,
        status: 'cancelled',
        spokenReply: '',
        uiReply: '本轮任务已取消。',
        needTextContext: false,
        nextActionHint: '如果你要继续，重新发起一轮就行。',
      }
    }

    throw error
  }

  return {
    ...parseStructuredDeveloperToolOutput(stdoutBuffer, backend, sessionThreadId),
    rawLogs,
  }
}

async function runClaudeCodeTurn(runtime, payload, settings, sessionDetail) {
  const workingDirectory = payload.workingDirectory?.trim() || settings.workingDirectory || process.cwd()
  const sessionThreadId =
    supportsDeveloperToolResume('claude_code') && sessionDetail.session.codexThreadId?.trim()
      ? sessionDetail.session.codexThreadId.trim()
      : null
  const schemaJson = await fs.readFile(path.join(__dirname, 'codex-output-schema.json'), 'utf8')
  const prompt = buildPrompt({
    spokenText: payload.inputText,
    pendingText: payload.pendingText,
    workingDirectory,
    conversationContext: payload.conversationContext,
    profile: sessionDetail.boundProfile,
    workingLanguage: settings.workingLanguage,
  })
  const args = ['-p', '--output-format', 'json', '--json-schema', schemaJson, '--add-dir', workingDirectory]

  if (sessionThreadId) {
    args.push('--resume', sessionThreadId)
  }

  if (settings.bypassCodexSandbox !== false) {
    args.push('--dangerously-skip-permissions')
  } else {
    args.push('--permission-mode', 'acceptEdits')
  }

  return runPrintModeDeveloperToolTurn({
    backend: 'claude_code',
    command: settings.developerToolPath?.trim() || defaultCommandForDeveloperTool('claude_code'),
    args,
    prompt,
    workingDirectory,
    runtime,
    sessionThreadId,
  })
}

async function runCursorCliTurn(runtime, payload, settings, sessionDetail) {
  const workingDirectory = payload.workingDirectory?.trim() || settings.workingDirectory || process.cwd()
  const sessionThreadId =
    supportsDeveloperToolResume('cursor_cli') && sessionDetail.session.codexThreadId?.trim()
      ? sessionDetail.session.codexThreadId.trim()
      : null
  const prompt = buildPrompt({
    spokenText: payload.inputText,
    pendingText: payload.pendingText,
    workingDirectory,
    conversationContext: payload.conversationContext,
    profile: sessionDetail.boundProfile,
    workingLanguage: settings.workingLanguage,
  })
  const args = buildCursorCliArgs({
    sessionThreadId,
    bypassPermissions: settings.bypassCodexSandbox !== false,
  })

  return runPrintModeDeveloperToolTurn({
    backend: 'cursor_cli',
    command: settings.developerToolPath?.trim() || defaultCommandForDeveloperTool('cursor_cli'),
    args,
    prompt,
    workingDirectory,
    runtime,
    sessionThreadId,
  })
}

async function runGeminiCliTurn(runtime, payload, settings, sessionDetail) {
  const workingDirectory = payload.workingDirectory?.trim() || settings.workingDirectory || process.cwd()
  const sessionThreadId =
    supportsDeveloperToolResume('gemini_cli') && sessionDetail.session.codexThreadId?.trim()
      ? sessionDetail.session.codexThreadId.trim()
      : null
  const prompt = buildPrompt({
    spokenText: payload.inputText,
    pendingText: payload.pendingText,
    workingDirectory,
    conversationContext: payload.conversationContext,
    profile: sessionDetail.boundProfile,
    workingLanguage: settings.workingLanguage,
  })
  const args = ['--prompt', '--output-format', 'json']

  if (settings.bypassCodexSandbox !== false) {
    args.push('--yolo')
  } else {
    args.push('--approval-mode', 'auto_edit')
  }

  if (sessionThreadId) {
    args.push('--resume', sessionThreadId)
  }

  return runPrintModeDeveloperToolTurn({
    backend: 'gemini_cli',
    command: settings.developerToolPath?.trim() || defaultCommandForDeveloperTool('gemini_cli'),
    args,
    prompt,
    workingDirectory,
    runtime,
    sessionThreadId,
  })
}

async function runQwenCliTurn(runtime, payload, settings, sessionDetail) {
  const workingDirectory = payload.workingDirectory?.trim() || settings.workingDirectory || process.cwd()
  const sessionThreadId =
    supportsDeveloperToolResume('qwen_cli') && sessionDetail.session.codexThreadId?.trim()
      ? sessionDetail.session.codexThreadId.trim()
      : null
  const prompt = buildPrompt({
    spokenText: payload.inputText,
    pendingText: payload.pendingText,
    workingDirectory,
    conversationContext: payload.conversationContext,
    profile: sessionDetail.boundProfile,
    workingLanguage: settings.workingLanguage,
  })
  const args = ['--prompt', '--output-format', 'json']

  if (settings.bypassCodexSandbox !== false) {
    args.push('--yolo')
  } else {
    args.push('--approval-mode', 'auto-edit')
  }

  if (sessionThreadId) {
    args.push('--resume', sessionThreadId)
  }

  return runPrintModeDeveloperToolTurn({
    backend: 'qwen_cli',
    command: settings.developerToolPath?.trim() || defaultCommandForDeveloperTool('qwen_cli'),
    args,
    prompt,
    workingDirectory,
    runtime,
    sessionThreadId,
  })
}

async function runDeveloperToolTurn(runtime, payload, settings, sessionDetail) {
  const localShortcut = await runLocalShortcut(payload.inputText, payload.pendingText)
  if (localShortcut) {
    return localShortcut
  }

  if (settings.executionMode === 'fake' || settings.testMode) {
    return runFakeCodexTurn(payload, settings, sessionDetail)
  }

  switch (settings.developerTool) {
    case 'claude_code':
      return runClaudeCodeTurn(runtime, payload, settings, sessionDetail)
    case 'cursor_cli':
      return runCursorCliTurn(runtime, payload, settings, sessionDetail)
    case 'gemini_cli':
      return runGeminiCliTurn(runtime, payload, settings, sessionDetail)
    case 'qwen_cli':
      return runQwenCliTurn(runtime, payload, settings, sessionDetail)
    case 'codex':
    default:
      return runCodexCliTurn(runtime, payload, settings, sessionDetail)
  }
}

async function resolveSessionWorkingDirectory(sessionDetail, settings) {
  return (
    sessionDetail.boundProfile?.workingDirectory ||
    settings.workingDirectory ||
    process.cwd()
  )
}

function buildConversationContext(messages) {
  return messages
    .slice(-8)
    .map((message) => `${message.role}: ${message.text}`)
    .join('\n')
}

async function processTextTurn(runtime) {
  const sessionDetail = stateStore.getSessionDetail(runtime.sessionId)
  if (!sessionDetail) {
    throw new Error('目标会话不存在。')
  }

  const settings = resolveProfileDeveloperToolSettings(
    sessionDetail.boundProfile,
    normalizeSettings(stateStore.getSettings()),
  )
  const workingDirectory = await resolveSessionWorkingDirectory(sessionDetail, settings)
  const detailText = runtime.pendingText?.trim()
    ? `补充文本已并入本轮\n${runtime.pendingText.trim()}`
    : runtime.sourceLabel

  stateStore.addMessage({
    sessionId: runtime.sessionId,
    taskId: runtime.taskId,
    role: 'user',
    text: runtime.inputText,
    detail: detailText,
  })
  stateStore.createEvent({
    sessionId: runtime.sessionId,
    taskId: runtime.taskId,
    kind: 'user_input',
    payload: {
      source: runtime.source,
      captureMode: runtime.captureMode || null,
      workingDirectory,
    },
  })

  const routedIntent = await routeWorkspaceIntent(
    runtime.sessionId,
    [runtime.inputText, runtime.pendingText].filter(Boolean).join('\n'),
  )

  if (routedIntent) {
    stateStore.addMessage({
      sessionId: runtime.sessionId,
      taskId: runtime.taskId,
      role: routedIntent.status === 'failed' ? 'system' : 'assistant',
      text: routedIntent.uiReply,
      detail: routedIntent.nextActionHint || '',
    })
    if (routedIntent.activeSessionId) {
      stateStore.setActiveSession(routedIntent.activeSessionId)
    }
    stateStore.createEvent({
      sessionId: runtime.sessionId,
      taskId: runtime.taskId,
      kind: 'local_router',
      payload: routedIntent,
    })
    return {
      sessionId: runtime.sessionId,
      taskId: runtime.taskId,
      ...routedIntent,
    }
  }

  const result = await runDeveloperToolTurn(
    runtime,
    {
      inputText: runtime.inputText,
      pendingText: runtime.pendingText,
      workingDirectory,
      conversationContext: buildConversationContext(sessionDetail.messages),
    },
    settings,
    sessionDetail,
  )

  if (result.threadId) {
    stateStore.updateSessionThread(runtime.sessionId, result.threadId)
  }

  stateStore.addMessage({
    sessionId: runtime.sessionId,
    taskId: runtime.taskId,
    role: result.status === 'failed' ? 'system' : 'assistant',
    text: result.uiReply || result.spokenReply,
    detail: result.nextActionHint || '',
  })
  stateStore.createEvent({
    sessionId: runtime.sessionId,
    taskId: runtime.taskId,
    kind: 'task_result',
    payload: result,
  })

  return {
    sessionId: runtime.sessionId,
    taskId: runtime.taskId,
    ...result,
    workingDirectory,
  }
}

async function processVoiceTurn(runtime) {
  const settings = normalizeSettings(stateStore.getSettings())
  const transcript = await transcribeAudio(
    runtime,
    {
      audioBase64: runtime.audioBase64,
      mimeType: runtime.mimeType,
      language: settings.transcriptionLanguage,
      model: settings.transcriptionModel,
    },
    settings,
  )

  stateStore.createEvent({
    sessionId: runtime.sessionId,
    taskId: runtime.taskId,
    kind: 'transcribe_done',
    payload: {
      chars: transcript.text.length,
      provider: transcript.provider,
      captureMode: runtime.captureMode || null,
      debugAudioPath: transcript.debugAudioPath || '',
    },
  })

  const text = transcript.text.trim()
  const transcriptDecision = evaluateVoiceTranscript(text, runtime.pendingText)

  if (!transcriptDecision.accepted && transcriptDecision.reason === 'empty') {
    stateStore.addMessage({
      sessionId: runtime.sessionId,
      taskId: runtime.taskId,
      role: 'system',
      text: '这段语音没有识别出有效文本，本轮已忽略。',
      detail: '转写结果为空。可能是停顿太短、语音太轻，或者只录到了环境噪声。',
    })
    return {
      sessionId: runtime.sessionId,
      taskId: runtime.taskId,
      status: 'cancelled',
      backend: transcript.provider,
      feedbackTone: 'error',
      spokenReply: '',
      uiReply: '这段语音没有识别出有效文本，本轮已忽略。',
      nextActionHint: '可以直接再说一次。',
      transcriptText: text,
      debugAudioPath: transcript.debugAudioPath || '',
    }
  }

  if (!transcriptDecision.accepted && transcriptDecision.reason === 'too_short') {
    stateStore.addMessage({
      sessionId: runtime.sessionId,
      taskId: runtime.taskId,
      role: 'system',
      text: `已识别到语音，但转写文本不足 ${MIN_VOICE_TRANSCRIPT_CHARS} 个字，本轮已忽略。`,
      detail: `本次转写长度为 ${transcriptDecision.chars} 个字。当前规则会忽略过短文本以避免误触发；如果这是有效指令，请补充更多内容，或使用明确的会话/项目切换命令。`,
    })
    stateStore.createEvent({
      sessionId: runtime.sessionId,
      taskId: runtime.taskId,
      kind: 'voice_short_ignored',
      payload: {
        chars: transcriptDecision.chars,
        threshold: MIN_VOICE_TRANSCRIPT_CHARS,
        captureMode: runtime.captureMode || null,
      },
    })
    return {
      sessionId: runtime.sessionId,
      taskId: runtime.taskId,
      status: 'cancelled',
      backend: transcript.provider,
      feedbackTone: 'error',
      spokenReply: '',
      uiReply: `已识别到语音，但转写文本不足 ${MIN_VOICE_TRANSCRIPT_CHARS} 个字，本轮已忽略。`,
      nextActionHint: '如果这是有效指令，请补充更多内容后再说一次。',
      transcriptText: text,
      debugAudioPath: transcript.debugAudioPath || '',
    }
  }

  if (transcriptDecision.route === 'codex') {
    stateStore.createEvent({
      sessionId: runtime.sessionId,
      taskId: runtime.taskId,
      kind: 'voice_intent_ready',
      payload: {
        chars: transcriptDecision.chars,
        route: transcriptDecision.route,
        captureMode: runtime.captureMode || null,
      },
    })
    broadcastStateChanged()
  }

  runtime.inputText = text
  runtime.sourceLabel = `本轮来自语音 · ${voiceInputModeLabel(runtime.captureMode)}`
  const result = await processTextTurn(runtime)
  return {
    ...result,
    transcriptText: text,
    debugAudioPath: transcript.debugAudioPath || '',
  }
}

async function processTurn(runtime) {
  return runtime.source === 'voice'
    ? processVoiceTurn(runtime)
    : processTextTurn(runtime)
}

async function resolveAcknowledgementCue(language) {
  const bucket = normalizeLanguageBucket(language)
  const targetDir = path.join(ackPackDirectory(), bucket)

  try {
    const files = (await fs.readdir(targetDir))
      .filter((fileName) => /\.(mp3|wav|m4a|aac|opus|flac)$/i.test(fileName))
      .sort()

    if (files.length > 0) {
      const selected = files[Math.floor(Math.random() * files.length)]
      const filePath = path.join(targetDir, selected)
      const audioBuffer = await fs.readFile(filePath)
      return {
        type: 'file',
        language: bucket,
        filePath,
        mimeType: mimeTypeFromExtension(selected),
        audioBase64: audioBuffer.toString('base64'),
      }
    }
  } catch {
    // ignore and fall back to text
  }

  const phrases = ACKNOWLEDGEMENT_TEXT[bucket]
  const text = phrases[Math.floor(Math.random() * phrases.length)]
  return {
    type: 'text',
    language: bucket,
    text,
  }
}

async function saveSettings(settings) {
  const normalized = normalizeSettings(settings)
  stateStore.saveSettings(normalized)
  broadcastStateChanged()
  return normalized
}

async function getAppMeta() {
  return {
    name: APP_BRAND_NAME,
    version: APP_VERSION,
  }
}

async function getAppState() {
  recoverOrphanedTasks('runtime_check')
  const state = stateStore.getAppState()
  return {
    ...state,
    settings: normalizeSettings(state.settings),
  }
}

async function getSessionDetail(sessionId) {
  recoverOrphanedTasks('runtime_check')
  const targetSessionId = sessionId || stateStore.getActiveSessionId()
  if (!targetSessionId) {
    return null
  }

  return stateStore.getSessionDetail(targetSessionId)
}

async function createSession(payload = {}) {
  const session = stateStore.createSession({
    title: payload.title,
    titleSource: payload.title ? 'manual' : 'auto',
    boundProfileId: payload.boundProfileId ?? null,
    activate: payload.activate !== false,
  })
  broadcastStateChanged()
  return session
}

async function renameSession(payload) {
  const session = stateStore.renameSession(payload.sessionId, payload.title)
  broadcastStateChanged()
  return session
}

async function activateSession(payload) {
  stateStore.setActiveSession(payload.sessionId)
  broadcastStateChanged()
  return stateStore.getSession(payload.sessionId)
}

async function setSessionPinned(payload) {
  const session = stateStore.setSessionPinned(payload.sessionId, payload.pinned !== false)
  broadcastStateChanged()
  return session
}

async function archiveSession(payload) {
  const currentActiveSessionId = stateStore.getActiveSessionId()
  const session = stateStore.archiveSession(payload.sessionId)
  const remainingSessions = stateStore.listSessions()

  if (payload.sessionId === currentActiveSessionId) {
    if (remainingSessions[0]?.id) {
      stateStore.setActiveSession(remainingSessions[0].id)
    } else {
      stateStore.createSession({ activate: true })
    }
  }

  broadcastStateChanged()
  return session
}

async function saveProfile(payload) {
  const workingDirectory = await requireWorkingDirectory(payload.workingDirectory)
  const profile = stateStore.saveProfile({
    ...payload,
    workingDirectory,
  })
  broadcastStateChanged()
  return profile
}

async function bindProfile(payload) {
  if (payload.profileId) {
    const profile = stateStore.getProfile(payload.profileId)
    if (!profile) {
      throw new Error('目标项目不存在。')
    }

    await requireWorkingDirectory(profile.workingDirectory)
  }

  const session = stateStore.bindProfileToSession(payload.sessionId, payload.profileId)
  broadcastStateChanged()
  return session
}

async function removeProfile(payload) {
  const result = stateStore.removeProfile(payload.profileId)
  broadcastStateChanged()
  return result
}

async function openExternalTarget(payload) {
  const target = String(payload?.target ?? '').trim()
  if (!/^https?:\/\//i.test(target)) {
    throw new Error('只允许打开 http 或 https 链接。')
  }

  await shell.openExternal(target)
  return true
}

async function pickDirectory(payload) {
  const defaultPath = String(payload?.defaultPath ?? '').trim()
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: defaultPath || undefined,
  })

  if (result.canceled) {
    return null
  }

  return result.filePaths[0] || null
}

async function submitTextTurn(payload) {
  recoverOrphanedTasks('runtime_check')
  const session = stateStore.getSession(payload.sessionId)
  const runtimeSettings = normalizeSettings(stateStore.getSettings())
  if (!session) {
    throw new Error('目标会话不存在。')
  }

  const boundProfile = stateStore.getProfile(session.boundProfileId)
  const effectiveSettings = resolveProfileDeveloperToolSettings(boundProfile, runtimeSettings)

  return enqueueTask({
    sessionId: payload.sessionId,
    source: 'text',
    sourceLabel: '本轮来自纯文字',
    type: 'text_turn',
    provider: effectiveSettings.executionMode === 'fake' ? 'fake' : effectiveSettings.developerTool,
    inputText: payload.text?.trim() || '',
    pendingText: payload.pendingText?.trim() || '',
    workingDirectory:
      boundProfile?.workingDirectory ||
      effectiveSettings.workingDirectory,
  }, { mode: 'submit' })
}

async function queueTextTurn(payload) {
  recoverOrphanedTasks('runtime_check')
  const session = stateStore.getSession(payload.sessionId)
  const runtimeSettings = normalizeSettings(stateStore.getSettings())
  if (!session) {
    throw new Error('目标会话不存在。')
  }

  const boundProfile = stateStore.getProfile(session.boundProfileId)
  const effectiveSettings = resolveProfileDeveloperToolSettings(boundProfile, runtimeSettings)

  const { task, started } = scheduleTask({
    sessionId: payload.sessionId,
    source: 'text',
    sourceLabel: '本轮来自纯文字队列',
    type: 'text_turn',
    provider: effectiveSettings.executionMode === 'fake' ? 'fake' : effectiveSettings.developerTool,
    inputText: payload.text?.trim() || '',
    pendingText: payload.pendingText?.trim() || '',
    workingDirectory:
      boundProfile?.workingDirectory ||
      effectiveSettings.workingDirectory,
  }, { mode: 'queue' })

  return {
    sessionId: payload.sessionId,
    taskId: task.id,
    status: 'done',
    backend: 'local',
    spokenReply: '',
    uiReply: started ? '当前没有前序任务，这条任务已经开始执行。' : '已加入当前会话的任务队列。',
    needTextContext: false,
    nextActionHint: started ? '后台已经开始处理这一条。' : '会按顺序在前序任务完成后自动执行。',
  }
}

async function submitVoiceTurn(payload) {
  recoverOrphanedTasks('runtime_check')
  const session = stateStore.getSession(payload.sessionId)
  const runtimeSettings = normalizeSettings(stateStore.getSettings())
  if (!session) {
    throw new Error('目标会话不存在。')
  }

  const boundProfile = stateStore.getProfile(session.boundProfileId)
  const effectiveSettings = resolveProfileDeveloperToolSettings(boundProfile, runtimeSettings)
  const captureMode = payload.captureMode === 'vad_beta'
    ? 'vad_beta'
    : effectiveSettings.voiceInputMode

  return enqueueTask({
    sessionId: payload.sessionId,
    source: 'voice',
    sourceLabel: `本轮来自语音 · ${voiceInputModeLabel(captureMode)}`,
    type: 'voice_turn',
    provider: effectiveSettings.executionMode === 'fake' ? 'fake' : effectiveSettings.developerTool,
    pendingText: payload.pendingText?.trim() || '',
    audioBase64: payload.audioBase64,
    mimeType: payload.mimeType,
    captureMode,
    workingDirectory:
      boundProfile?.workingDirectory ||
      effectiveSettings.workingDirectory,
  })
}

app.whenReady().then(async () => {
  stateStore = new AppStateStore({
    databasePath: databasePath(),
    legacySettingsPath: settingsPath(),
    legacyDatabasePath: legacyDatabasePath(),
    defaultSettings,
  })
  await stateStore.init()
  stateStore.saveSettings(normalizeSettings(stateStore.getSettings()))
  recoverOrphanedTasks('startup')

  session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
    callback(permission === 'media')
  })

  session.defaultSession.setPermissionCheckHandler((_, permission) => permission === 'media')

  ipcMain.handle('app:get-meta', async () => getAppMeta())
  ipcMain.handle('app:get-state', async () => getAppState())
  ipcMain.handle('app:get-session-detail', async (_, sessionId) => getSessionDetail(sessionId))
  ipcMain.handle('settings:save', async (_, settings) => saveSettings(settings))
  ipcMain.handle('session:create', async (_, payload) => createSession(payload))
  ipcMain.handle('session:rename', async (_, payload) => renameSession(payload))
  ipcMain.handle('session:activate', async (_, payload) => activateSession(payload))
  ipcMain.handle('session:set-pinned', async (_, payload) => setSessionPinned(payload))
  ipcMain.handle('session:archive', async (_, payload) => archiveSession(payload))
  ipcMain.handle('profile:save', async (_, payload) => saveProfile(payload))
  ipcMain.handle('profile:bind', async (_, payload) => bindProfile(payload))
  ipcMain.handle('profile:remove', async (_, payload) => removeProfile(payload))
  ipcMain.handle('path:inspect-working-directory', async (_, payload) =>
    inspectWorkingDirectory(payload?.directory),
  )
  ipcMain.handle('tool:detect-developer-tool', async (_, payload) =>
    detectDeveloperTool(payload),
  )
  ipcMain.handle('dialog:pick-directory', async (_, payload) => pickDirectory(payload))
  ipcMain.handle('system:open-external', async (_, payload) => openExternalTarget(payload))
  ipcMain.handle('clipboard:write-text', async (_, payload) => {
    clipboard.writeText(String(payload?.text ?? ''))
    return true
  })
  ipcMain.handle('event:log-client', async (_, payload) => {
    stateStore.createEvent({
      sessionId: payload?.sessionId || null,
      taskId: payload?.taskId || null,
      kind: String(payload?.kind || 'client_event'),
      payload: payload?.payload || {},
    })
    broadcastStateChanged()
    return true
  })
  ipcMain.handle('agent:submit-text-turn', async (_, payload) => submitTextTurn(payload))
  ipcMain.handle('agent:queue-text-turn', async (_, payload) => queueTextTurn(payload))
  ipcMain.handle('agent:submit-voice-turn', async (_, payload) => submitVoiceTurn(payload))
  ipcMain.handle('agent:cancel-session-task', async (_, payload) => cancelSessionTask(payload.sessionId))
  ipcMain.handle('audio:speak', async (_, payload) => synthesizeSpeech(payload, normalizeSettings(stateStore.getSettings())))
  ipcMain.handle('speech:test-stt-config', async (_, payload) => testSttConfigConnection(payload))
  ipcMain.handle('speech:test-tts-config', async (_, payload) => testTtsConfigConnection(payload))
  ipcMain.handle('audio:get-ack-cue', async (_, payload) => resolveAcknowledgementCue(payload?.language || stateStore.getSettings().workingLanguage))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
