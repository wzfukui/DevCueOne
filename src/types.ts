export type AppPhase =
  | 'booting'
  | 'ready'
  | 'listening'
  | 'transcribing'
  | 'submitting'
  | 'speaking'
  | 'error'

export type SttProvider =
  | 'openai'
  | 'fake'
  | 'groq'
  | 'alibaba_model_studio'
  | 'volcengine_speech'
  | 'custom_http'
export type TtsProvider =
  | 'browser'
  | 'openai'
  | 'fake'
  | 'groq'
  | 'alibaba_model_studio'
  | 'volcengine_speech'
  | 'custom_http'
export type DeveloperTool =
  | 'codex'
  | 'claude_code'
  | 'cursor_cli'
  | 'gemini_cli'
  | 'qwen_cli'
export type CodexProvider = 'codex' | 'fake'
export type ExecutionMode = 'real' | 'fake'
export type WorkingLanguage = 'zh-CN' | 'en-US'
export type VoiceInputMode = 'classic' | 'vad_beta'
export type ThemePreset =
  | 'amber_canvas'
  | 'jade_orbit'
  | 'tide_atlas'
  | 'rose_parlor'
  | 'graphite_grove'
  | 'ink_peony'
export type BackendKind = DeveloperTool | 'fake' | 'local' | 'openai'
export type TurnStatus = 'done' | 'need_input' | 'failed' | 'cancelled'
export type TaskStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed'
export type TaskType = 'text_turn' | 'voice_turn'

export interface SttConfig {
  id: string
  name: string
  kind: SttProvider
  enabled: boolean
  model: string
  language: string
  apiKey?: string
  baseUrl?: string
  region?: string
  extra?: Record<string, string>
}

export interface TtsConfig {
  id: string
  name: string
  kind: TtsProvider
  enabled: boolean
  model: string
  voice: string
  format?: string
  apiKey?: string
  baseUrl?: string
  region?: string
  extra?: Record<string, string>
}

export interface DesktopSettings {
  openAiApiKey: string
  developerTool: DeveloperTool
  developerToolPath: string
  developerToolPaths: Partial<Record<DeveloperTool, string>>
  onboardingCompleted: boolean
  executionMode: ExecutionMode
  workingDirectory: string
  transcriptionModel: string
  transcriptionLanguage: string
  sttProvider: SttProvider
  ttsProvider: TtsProvider
  ttsModel: string
  ttsVoice: string
  workingLanguage: WorkingLanguage
  voiceInputMode: VoiceInputMode
  themePreset: ThemePreset
  autoStartListening: boolean
  audioMuted: boolean
  bypassCodexSandbox: boolean
  globalTaskConcurrency: number
  testMode: boolean
  codexPath?: string
  codexProvider?: CodexProvider
  sttConfigs: SttConfig[]
  ttsConfigs: TtsConfig[]
  selectedSttConfigId: string
  selectedTtsConfigId: string
}

export interface DeveloperToolDetectionResult {
  tool: DeveloperTool
  found: boolean
  supported: boolean
  command: string
  resolvedPath: string
  detail: string
}

export interface ProjectProfile {
  id: string
  name: string
  workingDirectory: string
  developerTool: DeveloperTool | null
  defaultPromptContext: string
  usageNotes: string
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
}

export interface SessionRecord {
  id: string
  title: string
  titleSource: 'auto' | 'manual'
  createdAt: string
  updatedAt: string
  lastActivityAt: string
  boundProfileId: string | null
  codexThreadId: string | null
  pinnedAt: string | null
  lastMessagePreview: string
  unreadEventCount: number
  archivedAt: string | null
  developerToolThreads?: Partial<Record<DeveloperTool, string>>
  boundProfileName?: string | null
  boundWorkingDirectory?: string | null
}

export interface SessionSummary extends SessionRecord {
  activeTaskCount: number
  lastTaskStatus: TaskStatus | null
  isActive: boolean
}

export interface ChatMessage {
  id: string
  sessionId: string
  taskId: string | null
  role: 'user' | 'assistant' | 'system'
  text: string
  detail: string
  createdAt: string
}

export interface TaskRecord {
  id: string
  sessionId: string
  type: TaskType
  status: TaskStatus
  provider: string
  inputPreview: string
  queueOrder: number
  startedAt: string | null
  finishedAt: string | null
  summary: string
  errorMessage: string
  codexThreadId: string | null
  workingDirectory: string
  createdAt: string
}

export interface EventLogRecord {
  id: string
  sessionId: string | null
  taskId: string | null
  kind: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface SessionDetail {
  session: SessionRecord
  boundProfile: ProjectProfile | null
  messages: ChatMessage[]
  tasks: TaskRecord[]
  events: EventLogRecord[]
}

export interface AppBootstrapState {
  settings: DesktopSettings
  sessions: SessionSummary[]
  profiles: ProjectProfile[]
  activeSessionId: string | null
}

export interface AppMeta {
  name: string
  version: string
}

export interface SynthesisRequest {
  text: string
  model?: string
  voice?: string
}

export interface SynthesisResult {
  mimeType: string
  audioBase64: string
  provider: BackendKind | string
}

export interface SpeechConfigTestInput {
  settings: DesktopSettings
  configId?: string
}

export interface SpeechConfigTestResult {
  ok: boolean
  capability: 'stt' | 'tts'
  provider: string
  configId: string
  configName: string
  detail: string
  latencyMs: number
  transcript?: string
  synthesis?: SynthesisResult
}

export type AcknowledgementCue =
  | {
      type: 'file'
      language: 'zh' | 'en'
      filePath: string
      mimeType: string
      audioBase64: string
    }
  | {
      type: 'text'
      language: 'zh' | 'en'
      text: string
    }

export interface SessionCreateInput {
  title?: string
  boundProfileId?: string | null
  activate?: boolean
}

export interface SessionRenameInput {
  sessionId: string
  title: string
}

export interface SessionActivateInput {
  sessionId: string
}

export interface SessionPinInput {
  sessionId: string
  pinned: boolean
}

export interface SessionArchiveInput {
  sessionId: string
}

export interface ProfileSaveInput {
  id?: string
  name?: string
  workingDirectory?: string
  developerTool?: DeveloperTool | null
  defaultPromptContext?: string
  usageNotes?: string
}

export interface ProfileBindInput {
  sessionId: string
  profileId: string | null
}

export interface ProfileRemoveInput {
  profileId: string
}

export interface ProfileRemoveResult {
  removed: boolean
  affectedSessionCount: number
}

export interface WorkingDirectoryInspection {
  input: string
  normalizedPath: string
  exists: boolean
  isAbsolute: boolean
  isDirectory: boolean
  isValid: boolean
  message: string
}

export interface SubmitTextTurnInput {
  sessionId: string
  text: string
  pendingText?: string
}

export interface PastedImageInput {
  fileName?: string
  mimeType: string
  base64: string
}

export interface SavePastedImagesInput {
  sessionId?: string | null
  images: PastedImageInput[]
}

export interface SavedPastedImage {
  path: string
  mimeType: string
  sizeBytes: number
}

export interface SubmitVoiceTurnInput {
  sessionId: string
  audioBase64: string
  mimeType: string
  pendingText?: string
  captureMode?: VoiceInputMode
}

export interface CancelSessionTaskResult {
  cancelled: boolean
  target: 'queued' | 'running' | null
}

export interface MoveQueuedTaskInput {
  sessionId: string
  taskId: string
  direction: 'up' | 'down'
}

export interface MergeQueuedTaskInput {
  sessionId: string
  taskId: string
}

export interface QueueTaskMutationResult {
  ok: boolean
  sessionId: string
  taskId: string
  action: 'move' | 'merge'
  fromOrder?: number
  toOrder?: number
  targetTaskId?: string | null
}

export interface TurnExecutionResult {
  sessionId: string
  taskId: string
  status: TurnStatus
  backend: BackendKind | string
  feedbackTone?: 'error' | null
  spokenReply: string
  uiReply: string
  nextActionHint?: string
  transcriptText?: string
  debugAudioPath?: string
  needTextContext?: boolean
  activeSessionId?: string
  threadId?: string | null
  toolPath?: string
  workingDirectory?: string
  rawLogs?: string[]
}
