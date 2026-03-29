export const MIN_VOICE_TRANSCRIPT_CHARS = 10

const WORKSPACE_INTENT_PATTERNS = [
  /^(?:新建会话|创建会话)\s+(.+)$/i,
  /^(?:切换会话|切到会话|打开会话|switch session to|switch to session)\s+(.+)$/i,
]

const LOCAL_SHORTCUT_PATTERNS = [
  /开放了哪些端口|开放哪些端口|开放端口|监听端口|list (open )?ports|open ports|listening ports/i,
  /打开浏览器|open browser|launch browser|open chrome/i,
  /打开链接|打开网址|open link|open url/i,
  /打开目录|打开文件夹|open folder|open directory/i,
]

export function isLikelyWorkspaceIntentText(text) {
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }

  return WORKSPACE_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export function isLikelyLocalShortcutText(spokenText = '', pendingText = '') {
  const combined = [spokenText, pendingText].filter(Boolean).join('\n').trim()
  if (!combined) {
    return false
  }

  return LOCAL_SHORTCUT_PATTERNS.some((pattern) => pattern.test(combined))
}

export function isLikelyImmediateVoiceCommand(text, pendingText = '') {
  return (
    isLikelyWorkspaceIntentText(text) ||
    isLikelyLocalShortcutText(text, pendingText)
  )
}

export function evaluateVoiceTranscript(text, pendingText = '') {
  const trimmed = text.trim()
  const normalizedPendingText = pendingText.trim()

  if (!trimmed) {
    return {
      accepted: false,
      reason: 'empty',
      route: null,
      chars: 0,
    }
  }

  const route = isLikelyImmediateVoiceCommand(trimmed, normalizedPendingText)
    ? 'local'
    : 'codex'

  if (normalizedPendingText) {
    return {
      accepted: true,
      reason: route === 'local' ? 'local_command' : 'has_pending_text',
      route,
      chars: trimmed.length,
    }
  }

  if (trimmed.length <= MIN_VOICE_TRANSCRIPT_CHARS && route !== 'local') {
    return {
      accepted: false,
      reason: 'too_short',
      route: null,
      chars: trimmed.length,
    }
  }

  return {
    accepted: true,
    reason: route === 'local' ? 'local_command' : 'ready',
    route,
    chars: trimmed.length,
  }
}
