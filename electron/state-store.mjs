import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  DEVELOPER_TOOL_DEFINITIONS,
  normalizeDeveloperToolSettings,
} from './developer-tools.mjs'

const DEFAULT_SESSION_TITLE = '新会话'

function nowIso() {
  return new Date().toISOString()
}

function basenameLabel(filePath) {
  const normalized = filePath.trim().replace(/\/+$/, '')
  return path.basename(normalized) || '默认项目'
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item) => String(item))
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function deriveSessionTitle(text) {
  const normalized = text
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return DEFAULT_SESSION_TITLE
  }

  return normalized.length > 24 ? `${normalized.slice(0, 24)}…` : normalized
}

function normalizeProjectDeveloperTool(tool) {
  return DEVELOPER_TOOL_DEFINITIONS[tool] ? tool : null
}

export class AppStateStore {
  constructor({
    databasePath,
    legacySettingsPath,
    legacyDatabasePath = null,
    defaultSettings,
    seedProfiles = [],
  }) {
    this.databasePath = databasePath
    this.legacySettingsPath = legacySettingsPath
    this.legacyDatabasePath = legacyDatabasePath
    this.defaultSettings = { ...defaultSettings }
    this.seedProfiles = seedProfiles
    this.db = null
  }

  async init() {
    await fs.mkdir(path.dirname(this.databasePath), { recursive: true })
    this.db = new DatabaseSync(this.databasePath)
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        working_directory TEXT NOT NULL,
        default_prompt_context TEXT NOT NULL DEFAULT '',
        usage_notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        title_source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        bound_profile_id TEXT,
        codex_thread_id TEXT,
        last_message_preview TEXT NOT NULL DEFAULT '',
        unread_event_count INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT,
        pinned_at TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        task_id TEXT,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT '',
        input_preview TEXT NOT NULL DEFAULT '',
        started_at TEXT,
        finished_at TEXT,
        summary TEXT NOT NULL DEFAULT '',
        error_message TEXT NOT NULL DEFAULT '',
        codex_thread_id TEXT,
        working_directory TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS event_logs (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        task_id TEXT,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session_created
      ON messages(session_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_tasks_session_created
      ON tasks(session_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_event_logs_session_created
      ON event_logs(session_id, created_at);
    `)

    this.ensureColumn('project_profiles', 'developer_tool', 'TEXT')
    this.migrateProjectProfilesTable()
    this.ensureColumn('sessions', 'pinned_at', 'TEXT')
    this.ensureColumn('tasks', 'input_preview', "TEXT NOT NULL DEFAULT ''")
    this.importLegacyDatabase()
    this.deduplicateProfilesByWorkingDirectory()

    await this.bootstrap()
  }

  ensureColumn(tableName, columnName, columnDefinition) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all()
    const hasColumn = columns.some((column) => column.name === columnName)
    if (hasColumn) {
      return
    }

    this.db.exec(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`,
    )
  }

  migrateProjectProfilesTable() {
    const columns = this.db.prepare('PRAGMA table_info(project_profiles)').all()
    const hasLegacyVoiceAliasesColumn = columns.some((column) => column.name === 'voice_aliases_json')
    const hasLegacyKeywordsColumn = columns.some((column) => column.name === 'keywords_json')
    if (!hasLegacyVoiceAliasesColumn && !hasLegacyKeywordsColumn) {
      return
    }

    try {
      this.db.exec('BEGIN')
      this.db.exec(`
        CREATE TABLE project_profiles__new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          working_directory TEXT NOT NULL,
          developer_tool TEXT,
          default_prompt_context TEXT NOT NULL DEFAULT '',
          usage_notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_used_at TEXT
        );

        INSERT INTO project_profiles__new (
          id,
          name,
          working_directory,
          developer_tool,
          default_prompt_context,
          usage_notes,
          created_at,
          updated_at,
          last_used_at
        )
        SELECT
          id,
          name,
          working_directory,
          developer_tool,
          default_prompt_context,
          usage_notes,
          created_at,
          updated_at,
          last_used_at
        FROM project_profiles;

        DROP TABLE project_profiles;
        ALTER TABLE project_profiles__new RENAME TO project_profiles;
      `)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  hasTable(database, tableName) {
    return Boolean(
      database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(tableName),
    )
  }

  isCustomizedConfigList(configs, defaultConfigs) {
    if (!Array.isArray(configs)) {
      return false
    }

    const defaultConfigMap = new Map(
      (Array.isArray(defaultConfigs) ? defaultConfigs : []).map((config) => [config.id, config]),
    )
    const trackedKeys = [
      'name',
      'kind',
      'enabled',
      'model',
      'language',
      'voice',
      'format',
      'apiKey',
      'baseUrl',
      'region',
    ]
    const normalizeConfigValue = (key, value) => {
      if (key === 'apiKey' || key === 'baseUrl' || key === 'region') {
        return typeof value === 'string' ? value.trim() : ''
      }

      return value ?? null
    }

    return configs.some((config) => {
      const defaultConfig = defaultConfigMap.get(config.id)
      if (!defaultConfig) {
        return true
      }

      return trackedKeys.some(
        (key) =>
          JSON.stringify(normalizeConfigValue(key, config?.[key])) !==
          JSON.stringify(normalizeConfigValue(key, defaultConfig?.[key])),
      )
    })
  }

  hasCustomizedAppSettings(rawSettings) {
    const settings = parseJson(rawSettings, null)
    if (!settings || typeof settings !== 'object') {
      return false
    }

    const trackedKeys = [
      'openAiApiKey',
      'developerTool',
      'developerToolPath',
      'developerToolPaths',
      'onboardingCompleted',
      'executionMode',
      'codexPath',
      'workingDirectory',
      'transcriptionModel',
      'transcriptionLanguage',
      'sttProvider',
      'ttsProvider',
      'codexProvider',
      'ttsModel',
      'ttsVoice',
      'workingLanguage',
      'voiceInputMode',
      'themePreset',
      'autoStartListening',
      'audioMuted',
      'bypassCodexSandbox',
      'globalTaskConcurrency',
      'testMode',
      'selectedSttConfigId',
      'selectedTtsConfigId',
    ]

    if (
      trackedKeys.some(
        (key) => JSON.stringify(settings[key] ?? null) !== JSON.stringify(this.defaultSettings[key] ?? null),
      )
    ) {
      return true
    }

    return (
      this.isCustomizedConfigList(settings.sttConfigs, this.defaultSettings.sttConfigs) ||
      this.isCustomizedConfigList(settings.ttsConfigs, this.defaultSettings.ttsConfigs)
    )
  }

  shouldImportLegacyAppSettings(currentRawSettings, legacyRawSettings) {
    if (!legacyRawSettings) {
      return false
    }

    if (!currentRawSettings) {
      return true
    }

    return (
      !this.hasCustomizedAppSettings(currentRawSettings) &&
      this.hasCustomizedAppSettings(legacyRawSettings)
    )
  }

  importLegacyDatabase() {
    const legacyDatabasePath = this.legacyDatabasePath?.trim()
    if (!legacyDatabasePath) {
      return
    }

    const normalizedCurrentPath = path.resolve(this.databasePath)
    const normalizedLegacyPath = path.resolve(legacyDatabasePath)
    if (normalizedCurrentPath === normalizedLegacyPath || !existsSync(normalizedLegacyPath)) {
      return
    }

    const migrationMarkerKey = `legacy_database_imported:${normalizedLegacyPath}`
    if (this.getRawSetting(migrationMarkerKey)) {
      return
    }

    const legacyDb = new DatabaseSync(normalizedLegacyPath)
    const insertProfile = this.db.prepare(`
      INSERT OR IGNORE INTO project_profiles (
        id,
        name,
        working_directory,
        developer_tool,
        default_prompt_context,
        usage_notes,
        created_at,
        updated_at,
        last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertSession = this.db.prepare(`
      INSERT OR IGNORE INTO sessions (
        id,
        title,
        title_source,
        created_at,
        updated_at,
        last_activity_at,
        bound_profile_id,
        codex_thread_id,
        last_message_preview,
        unread_event_count,
        archived_at,
        pinned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertMessage = this.db.prepare(`
      INSERT OR IGNORE INTO messages (
        id,
        session_id,
        task_id,
        role,
        text,
        detail,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const insertTask = this.db.prepare(`
      INSERT OR IGNORE INTO tasks (
        id,
        session_id,
        type,
        status,
        provider,
        input_preview,
        started_at,
        finished_at,
        summary,
        error_message,
        codex_thread_id,
        working_directory,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertEvent = this.db.prepare(`
      INSERT OR IGNORE INTO event_logs (
        id,
        session_id,
        task_id,
        kind,
        payload_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)

    try {
      if (this.hasTable(legacyDb, 'project_profiles')) {
        for (const row of legacyDb.prepare('SELECT * FROM project_profiles').all()) {
          insertProfile.run(
            row.id,
            row.name,
            row.working_directory,
            row.developer_tool ?? null,
            row.default_prompt_context ?? '',
            row.usage_notes ?? '',
            row.created_at,
            row.updated_at,
            row.last_used_at ?? null,
          )
        }
      }

      if (this.hasTable(legacyDb, 'sessions')) {
        for (const row of legacyDb.prepare('SELECT * FROM sessions').all()) {
          insertSession.run(
            row.id,
            row.title,
            row.title_source,
            row.created_at,
            row.updated_at,
            row.last_activity_at,
            row.bound_profile_id ?? null,
            row.codex_thread_id ?? null,
            row.last_message_preview ?? '',
            Number(row.unread_event_count ?? 0),
            row.archived_at ?? null,
            row.pinned_at ?? null,
          )
        }
      }

      if (this.hasTable(legacyDb, 'messages')) {
        for (const row of legacyDb.prepare('SELECT * FROM messages').all()) {
          insertMessage.run(
            row.id,
            row.session_id,
            row.task_id ?? null,
            row.role,
            row.text,
            row.detail ?? null,
            row.created_at,
          )
        }
      }

      if (this.hasTable(legacyDb, 'tasks')) {
        for (const row of legacyDb.prepare('SELECT * FROM tasks').all()) {
          insertTask.run(
            row.id,
            row.session_id,
            row.type,
            row.status,
            row.provider ?? '',
            row.input_preview ?? '',
            row.started_at ?? null,
            row.finished_at ?? null,
            row.summary ?? '',
            row.error_message ?? '',
            row.codex_thread_id ?? null,
            row.working_directory ?? '',
            row.created_at,
          )
        }
      }

      if (this.hasTable(legacyDb, 'event_logs')) {
        for (const row of legacyDb.prepare('SELECT * FROM event_logs').all()) {
          insertEvent.run(
            row.id,
            row.session_id ?? null,
            row.task_id ?? null,
            row.kind,
            row.payload_json ?? '{}',
            row.created_at,
          )
        }
      }

      if (this.hasTable(legacyDb, 'settings')) {
        const currentActiveSessionId = this.getRawSetting('active_session_id')
        const currentAppSettings = this.getRawSetting('app_settings')
        for (const row of legacyDb.prepare('SELECT key, value FROM settings').all()) {
          if (row.key === 'active_session_id') {
            if (!currentActiveSessionId && row.value) {
              this.setRawSetting(row.key, row.value)
            }
            continue
          }

          if (row.key === 'app_settings') {
            if (this.shouldImportLegacyAppSettings(currentAppSettings, row.value)) {
              this.setRawSetting(row.key, row.value)
            }
            continue
          }

          if (!this.getRawSetting(row.key)) {
            this.setRawSetting(row.key, row.value)
          }
        }
      }
    } finally {
      if (typeof legacyDb.close === 'function') {
        legacyDb.close()
      }
    }

    this.setRawSetting(migrationMarkerKey, nowIso())
  }

  async bootstrap() {
    const hasSettings = this.getRawSetting('app_settings')
    const hasSessions = this.count('sessions') > 0
    const hasProfiles = this.count('project_profiles') > 0

    if (!hasSettings) {
      const legacySettings = await this.readLegacySettings()
      const mergedSettings = {
        ...this.defaultSettings,
        ...legacySettings,
      }
      this.saveSettings(mergedSettings)
    }

    const rawSettings = parseJson(this.getRawSetting('app_settings'), {})
    const hasExplicitOnboardingCompleted =
      rawSettings &&
      typeof rawSettings === 'object' &&
      Object.prototype.hasOwnProperty.call(rawSettings, 'onboardingCompleted')

    if (!hasExplicitOnboardingCompleted && (hasSettings || hasSessions || hasProfiles)) {
      this.saveSettings({
        ...this.getSettings(),
        onboardingCompleted: true,
      })
    }

    if (!hasProfiles) {
      const settings = this.getSettings()
      const seedCandidates = [
        settings.workingDirectory,
        ...this.seedProfiles,
      ]
      const inserted = new Set()

      for (const candidate of seedCandidates) {
        if (!candidate || inserted.has(candidate)) {
          continue
        }

        inserted.add(candidate)
        if (!existsSync(candidate)) {
          continue
        }

        this.createProfile({
          name: basenameLabel(candidate),
          workingDirectory: candidate,
          defaultPromptContext: '',
          usageNotes: '',
        })
      }
    }

    if (!hasSessions) {
      const profiles = this.listProfiles()
      const initialProfileId = profiles[0]?.id ?? null
      const session = this.createSession({
        title: DEFAULT_SESSION_TITLE,
        titleSource: 'auto',
        boundProfileId: initialProfileId,
        activate: true,
      })

      this.addMessage({
        sessionId: session.id,
        role: 'system',
        text: '桌面语音代理原型已启动。先保存配置，再开始监听。',
        detail: '语音结束后会自动转写，并和右侧补充文本一起发给当前开发工具。',
      })
    } else if (!this.getActiveSessionId()) {
      const fallback = this.listSessions()[0]
      if (fallback) {
        this.setActiveSession(fallback.id)
      }
    }
  }

  async readLegacySettings() {
    try {
      const raw = await fs.readFile(this.legacySettingsPath, 'utf8')
      return parseJson(raw, {})
    } catch {
      return {}
    }
  }

  count(tableName) {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get()
    return Number(row?.count ?? 0)
  }

  getRawSetting(key) {
    return this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key)?.value
  }

  setRawSetting(key, value) {
    this.db
      .prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      .run(key, value)
  }

  getSettings() {
    return normalizeDeveloperToolSettings({
      ...this.defaultSettings,
      ...parseJson(this.getRawSetting('app_settings'), {}),
    }, this.defaultSettings)
  }

  saveSettings(settings) {
    const normalizedToolSettings = normalizeDeveloperToolSettings(settings, this.defaultSettings)
    const normalized = {
      ...this.defaultSettings,
      ...settings,
      ...normalizedToolSettings,
      workingDirectory:
        settings.workingDirectory?.trim() || this.defaultSettings.workingDirectory,
      audioMuted:
        settings.audioMuted == null
          ? this.defaultSettings.audioMuted === true
          : settings.audioMuted === true,
      globalTaskConcurrency: Math.max(
        1,
        Number(settings.globalTaskConcurrency ?? this.defaultSettings.globalTaskConcurrency ?? 2),
      ),
    }

    this.setRawSetting('app_settings', JSON.stringify(normalized))
    return normalized
  }

  getActiveSessionId() {
    return this.getRawSetting('active_session_id') || null
  }

  setActiveSession(sessionId) {
    this.setRawSetting('active_session_id', sessionId)
  }

  listProfiles() {
    return this.db
      .prepare(`
        SELECT
          id,
          name,
          working_directory AS workingDirectory,
          developer_tool AS developerTool,
          default_prompt_context AS defaultPromptContext,
          usage_notes AS usageNotes,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_used_at AS lastUsedAt
        FROM project_profiles
        ORDER BY COALESCE(last_used_at, updated_at) DESC, name COLLATE NOCASE ASC
      `)
      .all()
  }

  normalizeWorkingDirectoryKey(workingDirectory) {
    return workingDirectory?.trim() || ''
  }

  findProfileByWorkingDirectory(workingDirectory, excludeProfileId = null) {
    const normalizedWorkingDirectory = this.normalizeWorkingDirectoryKey(workingDirectory)
    if (!normalizedWorkingDirectory) {
      return null
    }

    const query = excludeProfileId
      ? `
        SELECT id
        FROM project_profiles
        WHERE working_directory = ? AND id != ?
        ORDER BY COALESCE(last_used_at, updated_at) DESC, created_at DESC
        LIMIT 1
      `
      : `
        SELECT id
        FROM project_profiles
        WHERE working_directory = ?
        ORDER BY COALESCE(last_used_at, updated_at) DESC, created_at DESC
        LIMIT 1
      `
    const row = excludeProfileId
      ? this.db.prepare(query).get(normalizedWorkingDirectory, excludeProfileId)
      : this.db.prepare(query).get(normalizedWorkingDirectory)

    return row?.id ? this.getProfile(row.id) : null
  }

  mergeProfileRecords(canonicalProfile, duplicateProfile) {
    const pickFirstNonEmpty = (...values) =>
      values.find((value) => typeof value === 'string' && value.trim())?.trim() || ''

    return {
      ...canonicalProfile,
      name:
        pickFirstNonEmpty(canonicalProfile.name, duplicateProfile.name) ||
        basenameLabel(canonicalProfile.workingDirectory || duplicateProfile.workingDirectory),
      developerTool: canonicalProfile.developerTool || duplicateProfile.developerTool || null,
      defaultPromptContext: pickFirstNonEmpty(
        canonicalProfile.defaultPromptContext,
        duplicateProfile.defaultPromptContext,
      ),
      usageNotes: pickFirstNonEmpty(canonicalProfile.usageNotes, duplicateProfile.usageNotes),
      updatedAt:
        [canonicalProfile.updatedAt, duplicateProfile.updatedAt].filter(Boolean).sort().at(-1) ||
        nowIso(),
      lastUsedAt:
        [canonicalProfile.lastUsedAt, duplicateProfile.lastUsedAt].filter(Boolean).sort().at(-1) ||
        canonicalProfile.lastUsedAt ||
        duplicateProfile.lastUsedAt ||
        null,
    }
  }

  rebindSessionsToProfile(targetProfileId, sourceProfileId) {
    if (!targetProfileId || !sourceProfileId || targetProfileId === sourceProfileId) {
      return
    }

    this.db
      .prepare('UPDATE sessions SET bound_profile_id = ?, updated_at = ? WHERE bound_profile_id = ?')
      .run(targetProfileId, nowIso(), sourceProfileId)
  }

  deduplicateProfilesByWorkingDirectory() {
    const profilesByWorkingDirectory = new Map()
    for (const profile of this.listProfiles()) {
      const normalizedWorkingDirectory = this.normalizeWorkingDirectoryKey(profile.workingDirectory)
      if (!normalizedWorkingDirectory) {
        continue
      }

      const bucket = profilesByWorkingDirectory.get(normalizedWorkingDirectory) ?? []
      bucket.push(profile)
      profilesByWorkingDirectory.set(normalizedWorkingDirectory, bucket)
    }

    const updateProfile = this.db.prepare(`
      UPDATE project_profiles
      SET
        name = ?,
        working_directory = ?,
        developer_tool = ?,
        default_prompt_context = ?,
        usage_notes = ?,
        updated_at = ?,
        last_used_at = ?
      WHERE id = ?
    `)
    const deleteProfile = this.db.prepare('DELETE FROM project_profiles WHERE id = ?')

    for (const duplicateProfiles of profilesByWorkingDirectory.values()) {
      if (duplicateProfiles.length < 2) {
        continue
      }

      let canonicalProfile = duplicateProfiles[0]
      for (const duplicateProfile of duplicateProfiles.slice(1)) {
        const mergedProfile = this.mergeProfileRecords(canonicalProfile, duplicateProfile)
        updateProfile.run(
          mergedProfile.name,
          mergedProfile.workingDirectory,
          mergedProfile.developerTool,
          mergedProfile.defaultPromptContext,
          mergedProfile.usageNotes,
          mergedProfile.updatedAt,
          mergedProfile.lastUsedAt,
          canonicalProfile.id,
        )
        this.rebindSessionsToProfile(canonicalProfile.id, duplicateProfile.id)
        deleteProfile.run(duplicateProfile.id)
        canonicalProfile = this.getProfile(canonicalProfile.id) ?? mergedProfile
      }
    }
  }

  createProfile(profileInput) {
    const normalizedWorkingDirectory =
      profileInput.workingDirectory?.trim() || this.defaultSettings.workingDirectory
    const existingProfile = this.findProfileByWorkingDirectory(normalizedWorkingDirectory)
    if (existingProfile) {
      return this.updateProfile({
        ...profileInput,
        id: existingProfile.id,
        workingDirectory: normalizedWorkingDirectory,
      })
    }

    const timestamp = nowIso()
    const profile = {
      id: randomUUID(),
      name: profileInput.name?.trim() || basenameLabel(normalizedWorkingDirectory),
      workingDirectory: normalizedWorkingDirectory,
      developerTool: normalizeProjectDeveloperTool(profileInput.developerTool),
      defaultPromptContext: profileInput.defaultPromptContext?.trim() || '',
      usageNotes: profileInput.usageNotes?.trim() || '',
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: null,
    }

    this.db
      .prepare(`
        INSERT INTO project_profiles (
          id,
          name,
          working_directory,
          developer_tool,
          default_prompt_context,
          usage_notes,
          created_at,
          updated_at,
          last_used_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        profile.id,
        profile.name,
        profile.workingDirectory,
        profile.developerTool,
        profile.defaultPromptContext,
        profile.usageNotes,
        profile.createdAt,
        profile.updatedAt,
        profile.lastUsedAt,
      )

    return profile
  }

  updateProfile(profileInput) {
    const existing = this.getProfile(profileInput.id)
    if (!existing) {
      return this.createProfile(profileInput)
    }

    const updated = {
      ...existing,
      name: profileInput.name?.trim() || existing.name,
      workingDirectory: profileInput.workingDirectory?.trim() || existing.workingDirectory,
      developerTool:
        profileInput.developerTool === undefined
          ? existing.developerTool
          : normalizeProjectDeveloperTool(profileInput.developerTool),
      defaultPromptContext:
        profileInput.defaultPromptContext?.trim() ?? existing.defaultPromptContext,
      usageNotes: profileInput.usageNotes?.trim() ?? existing.usageNotes,
      updatedAt: nowIso(),
    }

    this.db
      .prepare(`
        UPDATE project_profiles
        SET
          name = ?,
          working_directory = ?,
          developer_tool = ?,
          default_prompt_context = ?,
          usage_notes = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        updated.name,
        updated.workingDirectory,
        updated.developerTool,
        updated.defaultPromptContext,
        updated.usageNotes,
        updated.updatedAt,
        updated.id,
      )

    return this.getProfile(updated.id)
  }

  saveProfile(profileInput) {
    if (profileInput.id) {
      return this.updateProfile(profileInput)
    }

    return this.createProfile(profileInput)
  }

  removeProfile(profileId) {
    if (!profileId) {
      return {
        removed: false,
        affectedSessionCount: 0,
      }
    }

    const existing = this.getProfile(profileId)
    if (!existing) {
      return {
        removed: false,
        affectedSessionCount: 0,
      }
    }

    const affectedSessionCount = Number(
      this.db
        .prepare('SELECT COUNT(*) AS count FROM sessions WHERE bound_profile_id = ?')
        .get(profileId)?.count ?? 0,
    )

    this.db
      .prepare('UPDATE sessions SET bound_profile_id = NULL, updated_at = ? WHERE bound_profile_id = ?')
      .run(nowIso(), profileId)

    this.db.prepare('DELETE FROM project_profiles WHERE id = ?').run(profileId)

    return {
      removed: true,
      affectedSessionCount,
    }
  }

  getProfile(profileId) {
    if (!profileId) {
      return null
    }

    const row = this.db
      .prepare(`
        SELECT
          id,
          name,
          working_directory AS workingDirectory,
          developer_tool AS developerTool,
          default_prompt_context AS defaultPromptContext,
          usage_notes AS usageNotes,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_used_at AS lastUsedAt
        FROM project_profiles
        WHERE id = ?
      `)
      .get(profileId)

    if (!row) {
      return null
    }

    return row
  }

  touchProfile(profileId) {
    if (!profileId) {
      return
    }

    this.db
      .prepare('UPDATE project_profiles SET last_used_at = ? WHERE id = ?')
      .run(nowIso(), profileId)
  }

  createSession({
    title,
    titleSource = 'auto',
    boundProfileId = null,
    activate = false,
  } = {}) {
    const timestamp = nowIso()
    const session = {
      id: randomUUID(),
      title: title?.trim() || DEFAULT_SESSION_TITLE,
      titleSource,
      boundProfileId,
      codexThreadId: null,
      pinnedAt: null,
      lastMessagePreview: '',
      unreadEventCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastActivityAt: timestamp,
      archivedAt: null,
    }

    this.db
      .prepare(`
        INSERT INTO sessions (
          id,
          title,
          title_source,
          created_at,
          updated_at,
          last_activity_at,
          bound_profile_id,
          codex_thread_id,
          last_message_preview,
          unread_event_count,
          archived_at,
          pinned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        session.id,
        session.title,
        session.titleSource,
        session.createdAt,
        session.updatedAt,
        session.lastActivityAt,
        session.boundProfileId,
        session.codexThreadId,
        session.lastMessagePreview,
        session.unreadEventCount,
        session.archivedAt,
        session.pinnedAt,
      )

    if (activate) {
      this.setActiveSession(session.id)
    }

    if (boundProfileId) {
      this.touchProfile(boundProfileId)
    }

    return this.getSession(session.id)
  }

  getSession(sessionId) {
    const row = this.db
      .prepare(`
        SELECT
          s.id,
          s.title,
          s.title_source AS titleSource,
          s.created_at AS createdAt,
          s.updated_at AS updatedAt,
          s.last_activity_at AS lastActivityAt,
          s.bound_profile_id AS boundProfileId,
          s.codex_thread_id AS codexThreadId,
          s.pinned_at AS pinnedAt,
          s.last_message_preview AS lastMessagePreview,
          s.unread_event_count AS unreadEventCount,
          s.archived_at AS archivedAt,
          p.name AS boundProfileName,
          p.working_directory AS boundWorkingDirectory
        FROM sessions s
        LEFT JOIN project_profiles p ON p.id = s.bound_profile_id
        WHERE s.id = ?
      `)
      .get(sessionId)

    return row ?? null
  }

  listSessions() {
    const activeSessionId = this.getActiveSessionId()
    return this.db
      .prepare(`
        SELECT
          s.id,
          s.title,
          s.title_source AS titleSource,
          s.created_at AS createdAt,
          s.updated_at AS updatedAt,
          s.last_activity_at AS lastActivityAt,
          s.bound_profile_id AS boundProfileId,
          s.codex_thread_id AS codexThreadId,
          s.pinned_at AS pinnedAt,
          s.last_message_preview AS lastMessagePreview,
          s.unread_event_count AS unreadEventCount,
          p.name AS boundProfileName,
          p.working_directory AS boundWorkingDirectory,
          COALESCE((
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.session_id = s.id AND t.status IN ('queued', 'running')
          ), 0) AS activeTaskCount,
          (
            SELECT t.status
            FROM tasks t
            WHERE t.session_id = s.id
            ORDER BY t.created_at DESC
            LIMIT 1
          ) AS lastTaskStatus
        FROM sessions s
        LEFT JOIN project_profiles p ON p.id = s.bound_profile_id
        WHERE s.archived_at IS NULL
        ORDER BY
          CASE WHEN s.pinned_at IS NULL THEN 1 ELSE 0 END ASC,
          s.pinned_at DESC,
          s.last_activity_at DESC,
          s.created_at DESC
      `)
      .all()
      .map((row) => ({
        ...row,
        isActive: row.id === activeSessionId,
      }))
  }

  renameSession(sessionId, title) {
    const normalizedTitle = title?.trim() || DEFAULT_SESSION_TITLE
    this.db
      .prepare(`
        UPDATE sessions
        SET title = ?, title_source = 'manual', updated_at = ?
        WHERE id = ?
      `)
      .run(normalizedTitle, nowIso(), sessionId)

    return this.getSession(sessionId)
  }

  bindProfileToSession(sessionId, profileId) {
    const timestamp = nowIso()
    this.db
      .prepare(`
        UPDATE sessions
        SET bound_profile_id = ?, updated_at = ?, last_activity_at = ?
        WHERE id = ?
      `)
      .run(profileId, timestamp, timestamp, sessionId)

    this.touchProfile(profileId)
    return this.getSession(sessionId)
  }

  updateSessionThread(sessionId, threadId) {
    this.db
      .prepare('UPDATE sessions SET codex_thread_id = ?, updated_at = ? WHERE id = ?')
      .run(threadId, nowIso(), sessionId)
  }

  setSessionPinned(sessionId, pinned) {
    this.db
      .prepare('UPDATE sessions SET pinned_at = ?, updated_at = ? WHERE id = ?')
      .run(pinned ? nowIso() : null, nowIso(), sessionId)

    return this.getSession(sessionId)
  }

  archiveSession(sessionId) {
    this.db
      .prepare('UPDATE sessions SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(nowIso(), nowIso(), sessionId)

    return this.getSession(sessionId)
  }

  bumpSessionActivity(sessionId, previewText) {
    const timestamp = nowIso()
    const preview = (previewText ?? '').trim()
    this.db
      .prepare(`
        UPDATE sessions
        SET
          updated_at = ?,
          last_activity_at = ?,
          last_message_preview = CASE
            WHEN ? = '' THEN last_message_preview
            ELSE ?
          END
        WHERE id = ?
      `)
      .run(timestamp, timestamp, preview, preview, sessionId)
  }

  maybeAutoRenameSession(sessionId, sourceText) {
    const session = this.getSession(sessionId)
    if (!session || session.titleSource !== 'auto') {
      return
    }

    const nextTitle = deriveSessionTitle(sourceText)
    this.db
      .prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
      .run(nextTitle, nowIso(), sessionId)
  }

  addMessage({
    sessionId,
    taskId = null,
    role,
    text,
    detail = '',
    createdAt = nowIso(),
  }) {
    const message = {
      id: randomUUID(),
      sessionId,
      taskId,
      role,
      text: text?.trim() || '',
      detail: detail?.trim() || '',
      createdAt,
    }

    this.db
      .prepare(`
        INSERT INTO messages (
          id,
          session_id,
          task_id,
          role,
          text,
          detail,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        message.id,
        message.sessionId,
        message.taskId,
        message.role,
        message.text,
        message.detail,
        message.createdAt,
      )

    this.bumpSessionActivity(sessionId, message.text)
    if (role === 'user') {
      this.maybeAutoRenameSession(sessionId, message.text)
    }

    return message
  }

  listMessages(sessionId) {
    return this.db
      .prepare(`
        SELECT
          id,
          session_id AS sessionId,
          task_id AS taskId,
          role,
          text,
          detail,
          created_at AS createdAt
        FROM messages
        WHERE session_id = ?
        ORDER BY created_at ASC
      `)
      .all(sessionId)
  }

  createTask({
    sessionId,
    type,
    provider = '',
    inputPreview = '',
    workingDirectory = '',
    status = 'queued',
  }) {
    const task = {
      id: randomUUID(),
      sessionId,
      type,
      provider,
      inputPreview,
      status,
      workingDirectory,
      createdAt: nowIso(),
      startedAt: status === 'running' ? nowIso() : null,
      finishedAt: null,
      summary: '',
      errorMessage: '',
      codexThreadId: null,
    }

    this.db
      .prepare(`
        INSERT INTO tasks (
          id,
          session_id,
          type,
          status,
          provider,
          input_preview,
          started_at,
          finished_at,
          summary,
          error_message,
          codex_thread_id,
          working_directory,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        task.id,
        task.sessionId,
        task.type,
        task.status,
        task.provider,
        task.inputPreview,
        task.startedAt,
        task.finishedAt,
        task.summary,
        task.errorMessage,
        task.codexThreadId,
        task.workingDirectory,
        task.createdAt,
      )

    return this.getTask(task.id)
  }

  updateTask(taskId, patch) {
    const existing = this.getTask(taskId)
    if (!existing) {
      return null
    }

    const next = {
      ...existing,
      ...patch,
    }

    this.db
      .prepare(`
        UPDATE tasks
        SET
          status = ?,
          provider = ?,
          started_at = ?,
          finished_at = ?,
          summary = ?,
          error_message = ?,
          codex_thread_id = ?,
          working_directory = ?
        WHERE id = ?
      `)
      .run(
        next.status,
        next.provider,
        next.startedAt,
        next.finishedAt,
        next.summary,
        next.errorMessage,
        next.codexThreadId,
        next.workingDirectory,
        taskId,
      )

    return this.getTask(taskId)
  }

  getTask(taskId) {
    return (
      this.db
        .prepare(`
          SELECT
            id,
            session_id AS sessionId,
            type,
            status,
            provider,
            input_preview AS inputPreview,
            started_at AS startedAt,
            finished_at AS finishedAt,
            summary,
            error_message AS errorMessage,
            codex_thread_id AS codexThreadId,
            working_directory AS workingDirectory,
            created_at AS createdAt
          FROM tasks
          WHERE id = ?
        `)
        .get(taskId) ?? null
    )
  }

  listSessionTasks(sessionId) {
    return this.db
      .prepare(`
        SELECT
          id,
          session_id AS sessionId,
            type,
            status,
            provider,
            input_preview AS inputPreview,
            started_at AS startedAt,
          finished_at AS finishedAt,
          summary,
          error_message AS errorMessage,
          codex_thread_id AS codexThreadId,
          working_directory AS workingDirectory,
          created_at AS createdAt
        FROM tasks
        WHERE session_id = ?
        ORDER BY created_at DESC
      `)
      .all(sessionId)
  }

  listActiveTasks() {
    return this.db
      .prepare(`
        SELECT
          id,
          session_id AS sessionId,
          type,
          status,
          provider,
          input_preview AS inputPreview,
          started_at AS startedAt,
          finished_at AS finishedAt,
          summary,
          error_message AS errorMessage,
          codex_thread_id AS codexThreadId,
          working_directory AS workingDirectory,
          created_at AS createdAt
        FROM tasks
        WHERE status IN ('queued', 'running')
        ORDER BY created_at DESC
      `)
      .all()
  }

  createEvent({
    sessionId = null,
    taskId = null,
    kind,
    payload = {},
  }) {
    this.db
      .prepare(`
        INSERT INTO event_logs (
          id,
          session_id,
          task_id,
          kind,
          payload_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        randomUUID(),
        sessionId,
        taskId,
        kind,
        JSON.stringify(payload),
        nowIso(),
      )
  }

  listRecentEvents(sessionId, limit = 30) {
    return this.db
      .prepare(`
        SELECT
          id,
          session_id AS sessionId,
          task_id AS taskId,
          kind,
          payload_json AS payloadJson,
          created_at AS createdAt
        FROM event_logs
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(sessionId, limit)
      .map((row) => ({
        ...row,
        payload: parseJson(row.payloadJson, {}),
      }))
  }

  getAppState() {
    const sessions = this.listSessions()
    const profiles = this.listProfiles()
    const settings = this.getSettings()
    const storedActiveSessionId = this.getActiveSessionId()
    const activeSessionId = sessions.some((session) => session.id === storedActiveSessionId)
      ? storedActiveSessionId
      : sessions[0]?.id ?? null

    if (activeSessionId && activeSessionId !== storedActiveSessionId) {
      this.setActiveSession(activeSessionId)
    }

    return {
      settings,
      sessions,
      profiles,
      activeSessionId,
    }
  }

  getSessionDetail(sessionId) {
    const session = this.getSession(sessionId)
    if (!session) {
      return null
    }

    const boundProfile = session.boundProfileId
      ? this.getProfile(session.boundProfileId)
      : null

    return {
      session,
      boundProfile,
      messages: this.listMessages(sessionId),
      tasks: this.listSessionTasks(sessionId),
      events: this.listRecentEvents(sessionId),
    }
  }
}
