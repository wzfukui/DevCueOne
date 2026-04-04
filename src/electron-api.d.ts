import type {
  AcknowledgementCue,
  AppMeta,
  AppBootstrapState,
  CancelSessionTaskResult,
  DeveloperToolDetectionResult,
  DesktopSettings,
  MergeQueuedTaskInput,
  MoveQueuedTaskInput,
  ProfileBindInput,
  ProfileRemoveInput,
  ProfileRemoveResult,
  ProfileSaveInput,
  ProjectProfile,
  QueueTaskMutationResult,
  SavePastedImagesInput,
  SavedPastedImage,
  SpeechConfigTestInput,
  SpeechConfigTestResult,
  SessionActivateInput,
  SessionArchiveInput,
  SessionCreateInput,
  SessionDetail,
  SessionPinInput,
  SessionRecord,
  SessionRenameInput,
  SubmitTextTurnInput,
  SubmitVoiceTurnInput,
  SynthesisRequest,
  SynthesisResult,
  TurnExecutionResult,
  WorkingDirectoryInspection,
} from './types'

interface DesktopAgentApi {
  getAppMeta: () => Promise<AppMeta>
  getAppState: () => Promise<AppBootstrapState>
  getSessionDetail: (sessionId?: string) => Promise<SessionDetail | null>
  saveSettings: (settings: DesktopSettings) => Promise<DesktopSettings>
  createSession: (payload?: SessionCreateInput) => Promise<SessionRecord>
  renameSession: (payload: SessionRenameInput) => Promise<SessionRecord | null>
  activateSession: (payload: SessionActivateInput) => Promise<SessionRecord | null>
  setSessionPinned: (payload: SessionPinInput) => Promise<SessionRecord | null>
  archiveSession: (payload: SessionArchiveInput) => Promise<SessionRecord | null>
  saveProfile: (payload: ProfileSaveInput) => Promise<ProjectProfile>
  bindProfile: (payload: ProfileBindInput) => Promise<SessionRecord | null>
  removeProfile: (payload: ProfileRemoveInput) => Promise<ProfileRemoveResult>
  inspectWorkingDirectory: (directory: string) => Promise<WorkingDirectoryInspection>
  pickDirectory: (payload?: { defaultPath?: string }) => Promise<string | null>
  detectDeveloperTool: (payload: {
    tool: DesktopSettings['developerTool']
    executablePath?: string
  }) => Promise<DeveloperToolDetectionResult>
  openExternal: (target: string) => Promise<boolean>
  copyText: (text: string) => Promise<boolean>
  savePastedImages: (payload: SavePastedImagesInput) => Promise<SavedPastedImage[]>
  logClientEvent: (payload: {
    sessionId?: string | null
    taskId?: string | null
    kind: string
    payload?: Record<string, unknown>
  }) => Promise<boolean>
  submitTextTurn: (payload: SubmitTextTurnInput) => Promise<TurnExecutionResult>
  queueTextTurn: (payload: SubmitTextTurnInput) => Promise<TurnExecutionResult>
  moveQueuedTask: (payload: MoveQueuedTaskInput) => Promise<QueueTaskMutationResult>
  mergeQueuedTask: (payload: MergeQueuedTaskInput) => Promise<QueueTaskMutationResult>
  submitVoiceTurn: (payload: SubmitVoiceTurnInput) => Promise<TurnExecutionResult>
  cancelSessionTask: (sessionId: string) => Promise<CancelSessionTaskResult>
  synthesizeSpeech: (payload: SynthesisRequest) => Promise<SynthesisResult>
  testSttConfig: (payload: SpeechConfigTestInput) => Promise<SpeechConfigTestResult>
  testTtsConfig: (payload: SpeechConfigTestInput) => Promise<SpeechConfigTestResult>
  getAcknowledgementCue: (language?: string) => Promise<AcknowledgementCue>
  onStateChanged: (callback: () => void) => () => void
}

declare global {
  interface Window {
    desktopAgent: DesktopAgentApi
  }
}

export {}
