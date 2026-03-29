import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { AppStateStore } from '../electron/state-store.mjs'
import { createDefaultSttConfigs, createDefaultTtsConfigs } from '../electron/speech-config.mjs'

const defaultSettings = {
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
  codexPath: 'codex',
  workingDirectory: '/tmp/default-project',
  transcriptionModel: 'gpt-4o-mini-transcribe',
  transcriptionLanguage: 'zh',
  sttProvider: 'openai',
  ttsProvider: 'browser',
  codexProvider: 'codex',
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
  sttConfigs: createDefaultSttConfigs(),
  ttsConfigs: createDefaultTtsConfigs(),
  selectedSttConfigId: 'stt-openai-default',
  selectedTtsConfigId: 'tts-browser-default',
}

async function createStoreFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'voice-agent-store-'))
  const profileA = path.join(root, 'ProjectA')
  const profileB = path.join(root, 'ProjectB')
  await mkdir(profileA, { recursive: true })
  await mkdir(profileB, { recursive: true })

  const legacySettingsPath = path.join(root, 'settings.json')
  await writeFile(
    legacySettingsPath,
    JSON.stringify({
      ...defaultSettings,
      workingDirectory: profileA,
      useOpenAiTts: true,
    }),
    'utf8',
  )

  const databasePath = path.join(root, 'app-state.sqlite')
  const store = new AppStateStore({
    databasePath,
    legacySettingsPath,
    defaultSettings,
    seedProfiles: [profileA, profileB],
  })

  await store.init()
  return { store, root, profileA, profileB, databasePath }
}

async function createBareStoreFixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'voice-agent-legacy-store-'))
  const legacySettingsPath = path.join(root, 'settings.json')
  await writeFile(
    legacySettingsPath,
    JSON.stringify(options.settings ?? defaultSettings),
    'utf8',
  )

  const databasePath = path.join(root, 'app-state.sqlite')
  const store = new AppStateStore({
    databasePath,
    legacySettingsPath,
    legacyDatabasePath: options.legacyDatabasePath ?? null,
    defaultSettings,
    seedProfiles: options.seedProfiles ?? [],
  })

  await store.init()
  return { store, root, databasePath, legacySettingsPath }
}

function withEmptySpeechSecrets(configs) {
  return configs.map((config) => ({
    ...config,
    apiKey: '',
    baseUrl: '',
    region: '',
  }))
}

test('bootstrap migrates settings and seeds profiles/session', async () => {
  const { store, profileA, profileB, databasePath } = await createStoreFixture()
  assert.equal(existsSync(databasePath), true)

  const state = store.getAppState()
  assert.equal(state.settings.workingDirectory, profileA)
  assert.equal(state.settings.ttsProvider, 'browser')
  assert.equal(state.settings.voiceInputMode, 'classic')
  assert.equal(state.profiles.length, 2)
  assert.deepEqual(
    state.profiles.map((profile) => profile.workingDirectory).sort(),
    [profileA, profileB].sort(),
  )
  assert.equal(state.sessions.length, 1)
  assert.ok(state.activeSessionId)

  const detail = store.getSessionDetail(state.activeSessionId)
  assert.ok(detail)
  assert.equal(detail.messages.length, 1)
  assert.equal(detail.messages[0].role, 'system')
})

test('user message auto-renames session title', async () => {
  const { store } = await createStoreFixture()
  const activeSessionId = store.getAppState().activeSessionId
  assert.ok(activeSessionId)

  store.addMessage({
    sessionId: activeSessionId,
    role: 'user',
    text: '帮我看下项目代码提交状态，并检查当前分支。',
  })

  const session = store.getSession(activeSessionId)
  assert.ok(session)
  assert.match(session.title, /^帮我看下项目代码提交状态/)
  assert.equal(session.titleSource, 'auto')
})

test('manual rename sticks after later user input', async () => {
  const { store } = await createStoreFixture()
  const activeSessionId = store.getAppState().activeSessionId
  assert.ok(activeSessionId)

  store.renameSession(activeSessionId, '订单服务巡检')
  store.addMessage({
    sessionId: activeSessionId,
    role: 'user',
    text: '这条消息不应该覆盖手动名称。',
  })

  const session = store.getSession(activeSessionId)
  assert.ok(session)
  assert.equal(session.title, '订单服务巡检')
  assert.equal(session.titleSource, 'manual')
})

test('profile binding and task records are reflected in session detail', async () => {
  const { store } = await createStoreFixture()
  const state = store.getAppState()
  const activeSessionId = state.activeSessionId
  assert.ok(activeSessionId)
  const targetProfile = state.profiles[1]

  store.bindProfileToSession(activeSessionId, targetProfile.id)
  const task = store.createTask({
    sessionId: activeSessionId,
    type: 'text_turn',
    provider: 'fake',
    workingDirectory: targetProfile.workingDirectory,
    status: 'queued',
  })
  store.createEvent({
    sessionId: activeSessionId,
    taskId: task.id,
    kind: 'task_queued',
    payload: { source: 'text' },
  })

  const detail = store.getSessionDetail(activeSessionId)
  assert.ok(detail)
  assert.equal(detail.boundProfile?.id, targetProfile.id)
  assert.equal(detail.tasks.length, 1)
  assert.equal(detail.tasks[0].status, 'queued')
  assert.equal(detail.events[0].kind, 'task_queued')
})

test('creating a profile with an existing working directory reuses the original profile', async () => {
  const { store, profileA } = await createStoreFixture()
  const existingProfile = store.getAppState().profiles.find(
    (profile) => profile.workingDirectory === profileA,
  )
  assert.ok(existingProfile)

  const savedProfile = store.saveProfile({
    name: 'ProjectA renamed',
    workingDirectory: profileA,
    developerTool: 'gemini_cli',
  })

  assert.equal(savedProfile.id, existingProfile.id)
  assert.equal(savedProfile.name, 'ProjectA renamed')
  assert.equal(savedProfile.developerTool, 'gemini_cli')
  assert.equal(
    store.getAppState().profiles.filter((profile) => profile.workingDirectory === profileA).length,
    1,
  )
})

test('listActiveTasks only returns queued and running tasks', async () => {
  const { store } = await createStoreFixture()
  const activeSessionId = store.getAppState().activeSessionId
  assert.ok(activeSessionId)

  store.createTask({
    sessionId: activeSessionId,
    type: 'text_turn',
    provider: 'fake',
    workingDirectory: '/tmp/queued-task',
    status: 'queued',
  })
  store.createTask({
    sessionId: activeSessionId,
    type: 'text_turn',
    provider: 'fake',
    workingDirectory: '/tmp/running-task',
    status: 'running',
  })
  const completedTask = store.createTask({
    sessionId: activeSessionId,
    type: 'text_turn',
    provider: 'fake',
    workingDirectory: '/tmp/completed-task',
    status: 'completed',
  })
  store.updateTask(completedTask.id, {
    finishedAt: new Date().toISOString(),
    summary: 'done',
  })

  const activeTasks = store.listActiveTasks()
  assert.equal(activeTasks.length, 2)
  assert.deepEqual(
    activeTasks.map((task) => task.status).sort(),
    ['queued', 'running'],
  )
})

test('removing a profile unbinds linked sessions without deleting directories', async () => {
  const { store, profileB } = await createStoreFixture()
  const state = store.getAppState()
  const activeSessionId = state.activeSessionId
  assert.ok(activeSessionId)
  const targetProfile = state.profiles.find(
    (profile) => profile.workingDirectory === profileB,
  )
  assert.ok(targetProfile)

  store.bindProfileToSession(activeSessionId, targetProfile.id)
  const result = store.removeProfile(targetProfile.id)

  assert.equal(result.removed, true)
  assert.equal(result.affectedSessionCount, 1)
  assert.equal(existsSync(profileB), true)

  const detail = store.getSessionDetail(activeSessionId)
  assert.ok(detail)
  assert.equal(detail.boundProfile, null)
  assert.equal(store.getProfile(targetProfile.id), null)
})

test('pinning a session floats it above non-pinned sessions until unpinned', async () => {
  const { store } = await createStoreFixture()
  const state = store.getAppState()
  const activeSessionId = state.activeSessionId
  assert.ok(activeSessionId)

  const secondarySession = store.createSession({
    title: 'Pinned session',
    titleSource: 'manual',
    activate: false,
  })

  store.setSessionPinned(secondarySession.id, true)
  const pinnedSessions = store.listSessions()
  assert.equal(pinnedSessions[0].id, secondarySession.id)
  assert.ok(pinnedSessions[0].pinnedAt)

  store.setSessionPinned(secondarySession.id, false)
  const unpinnedSession = store.getSession(secondarySession.id)
  assert.equal(unpinnedSession.pinnedAt, null)
})

test('default speech configs with empty secrets are not treated as customized settings', async () => {
  const { store } = await createBareStoreFixture()

  const defaultLikeSettings = {
    ...defaultSettings,
    sttConfigs: withEmptySpeechSecrets(createDefaultSttConfigs()),
    ttsConfigs: withEmptySpeechSecrets(createDefaultTtsConfigs()),
    selectedSttConfigId: 'stt-openai-default',
    selectedTtsConfigId: 'tts-browser-default',
  }

  assert.equal(store.hasCustomizedAppSettings(JSON.stringify(defaultLikeSettings)), false)
})

test('voice input mode, audio mute, and test mode persist through settings save and count as customized', async () => {
  const { store } = await createBareStoreFixture()

  const updatedSettings = {
    ...defaultSettings,
    voiceInputMode: 'vad_beta',
    audioMuted: true,
    testMode: true,
  }

  store.saveSettings(updatedSettings)

  const savedSettings = store.getSettings()
  assert.equal(savedSettings.voiceInputMode, 'vad_beta')
  assert.equal(savedSettings.audioMuted, true)
  assert.equal(savedSettings.testMode, true)
  assert.equal(store.hasCustomizedAppSettings(JSON.stringify(updatedSettings)), true)
})

test('legacy Electron database is merged into the renamed app database', async () => {
  const legacyFixture = await createStoreFixture()
  const legacyActiveSessionId = legacyFixture.store.getAppState().activeSessionId
  assert.ok(legacyActiveSessionId)
  const legacyPrimaryProfile = legacyFixture.store.getAppState().profiles.find(
    (profile) => profile.workingDirectory === legacyFixture.profileA,
  )
  assert.ok(legacyPrimaryProfile)

  const importedSession = legacyFixture.store.createSession({
    title: 'Legacy imported session',
    titleSource: 'manual',
    activate: false,
  })
  legacyFixture.store.bindProfileToSession(importedSession.id, legacyPrimaryProfile.id)
  legacyFixture.store.addMessage({
    sessionId: importedSession.id,
    role: 'user',
    text: 'legacy message',
  })
  legacyFixture.store.saveSettings({
    ...defaultSettings,
    sttProvider: 'alibaba_model_studio',
    ttsProvider: 'alibaba_model_studio',
    globalTaskConcurrency: 5,
  })

  const currentFixture = await createBareStoreFixture({
    seedProfiles: [legacyFixture.profileA],
  })
  const currentSession = currentFixture.store.createSession({
    title: 'Current app session',
    titleSource: 'manual',
    activate: true,
  })

  if (typeof legacyFixture.store.db?.close === 'function') {
    legacyFixture.store.db.close()
  }
  if (typeof currentFixture.store.db?.close === 'function') {
    currentFixture.store.db.close()
  }

  const migratedStore = new AppStateStore({
    databasePath: currentFixture.databasePath,
    legacySettingsPath: currentFixture.legacySettingsPath,
    legacyDatabasePath: legacyFixture.databasePath,
    defaultSettings,
    seedProfiles: [],
  })
  await migratedStore.init()

  const migratedState = migratedStore.getAppState()
  assert.equal(
    migratedState.sessions.some((session) => session.id === importedSession.id),
    true,
  )
  assert.equal(
    migratedState.sessions.some((session) => session.id === currentSession.id),
    true,
  )
  assert.equal(migratedState.activeSessionId, currentSession.id)
  assert.equal(migratedStore.getSettings().sttProvider, 'alibaba_model_studio')
  assert.equal(migratedStore.getSettings().ttsProvider, 'alibaba_model_studio')
  assert.equal(
    migratedState.profiles.filter((profile) => profile.workingDirectory === legacyFixture.profileA).length,
    1,
  )

  const migratedDetail = migratedStore.getSessionDetail(importedSession.id)
  assert.ok(migratedDetail)
  assert.equal(migratedDetail.messages.some((message) => message.text === 'legacy message'), true)
  assert.equal(migratedDetail.boundProfile?.workingDirectory, legacyFixture.profileA)
})

test('archiving the active session hides it from the session list', async () => {
  const { store } = await createStoreFixture()
  const state = store.getAppState()
  const activeSessionId = state.activeSessionId
  assert.ok(activeSessionId)

  const secondarySession = store.createSession({
    title: 'Archive target',
    titleSource: 'manual',
    activate: false,
  })

  const archivedSession = store.archiveSession(activeSessionId)
  assert.ok(archivedSession.archivedAt)
  assert.equal(store.listSessions().some((session) => session.id === activeSessionId), false)
  assert.equal(store.listSessions().some((session) => session.id === secondarySession.id), true)
})
