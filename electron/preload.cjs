const { contextBridge, ipcRenderer } = require('electron')

function normalizeIpcError(error) {
  if (!(error instanceof Error)) {
    return error
  }

  const message = error.message.replace(
    /^Error invoking remote method '[^']+':\s*/,
    '',
  )
  return new Error(message || error.message)
}

async function invoke(channel, payload) {
  try {
    return await ipcRenderer.invoke(channel, payload)
  } catch (error) {
    throw normalizeIpcError(error)
  }
}

contextBridge.exposeInMainWorld('desktopAgent', {
  getAppMeta: () => invoke('app:get-meta'),
  getAppState: () => invoke('app:get-state'),
  getSessionDetail: (sessionId) => invoke('app:get-session-detail', sessionId),
  saveSettings: (settings) => invoke('settings:save', settings),
  createSession: (payload) => invoke('session:create', payload),
  renameSession: (payload) => invoke('session:rename', payload),
  activateSession: (payload) => invoke('session:activate', payload),
  setSessionPinned: (payload) => invoke('session:set-pinned', payload),
  archiveSession: (payload) => invoke('session:archive', payload),
  saveProfile: (payload) => invoke('profile:save', payload),
  bindProfile: (payload) => invoke('profile:bind', payload),
  removeProfile: (payload) => invoke('profile:remove', payload),
  inspectWorkingDirectory: (directory) =>
    invoke('path:inspect-working-directory', { directory }),
  pickDirectory: (payload) => invoke('dialog:pick-directory', payload),
  detectDeveloperTool: (payload) =>
    invoke('tool:detect-developer-tool', payload),
  openExternal: (target) => invoke('system:open-external', { target }),
  copyText: (text) => invoke('clipboard:write-text', { text }),
  savePastedImages: (payload) => invoke('clipboard:save-images', payload),
  logClientEvent: (payload) => invoke('event:log-client', payload),
  submitTextTurn: (payload) => invoke('agent:submit-text-turn', payload),
  queueTextTurn: (payload) => invoke('agent:queue-text-turn', payload),
  moveQueuedTask: (payload) => invoke('agent:move-queued-task', payload),
  mergeQueuedTask: (payload) => invoke('agent:merge-queued-task', payload),
  submitVoiceTurn: (payload) => invoke('agent:submit-voice-turn', payload),
  cancelSessionTask: (sessionId) =>
    invoke('agent:cancel-session-task', { sessionId }),
  synthesizeSpeech: (payload) => invoke('audio:speak', payload),
  testSttConfig: (payload) => invoke('speech:test-stt-config', payload),
  testTtsConfig: (payload) => invoke('speech:test-tts-config', payload),
  getAcknowledgementCue: (language) =>
    invoke('audio:get-ack-cue', { language }),
  onStateChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('app:state-changed', listener)
    return () => {
      ipcRenderer.removeListener('app:state-changed', listener)
    }
  },
})
