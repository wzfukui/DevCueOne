import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPrintModeSpawnArgs,
  buildCursorCliArgs,
  normalizeDeveloperToolSettings,
  parseStructuredDeveloperToolOutput,
  supportsDeveloperToolResume,
} from '../electron/developer-tools.mjs'

test('legacy codex-only settings migrate into the generic developer tool model', () => {
  const settings = normalizeDeveloperToolSettings({
    codexPath: '/usr/local/bin/codex',
    codexProvider: 'codex',
  })

  assert.equal(settings.developerTool, 'codex')
  assert.equal(settings.developerToolPath, '/usr/local/bin/codex')
  assert.equal(settings.developerToolPaths.codex, '/usr/local/bin/codex')
  assert.equal(settings.executionMode, 'real')
})

test('developer tool paths stay remembered per tool when switching selection', () => {
  const settings = normalizeDeveloperToolSettings({
    developerTool: 'claude_code',
    developerToolPaths: {
      codex: '/usr/local/bin/codex',
      claude_code: '/usr/local/bin/claude',
      cursor_cli: '/usr/local/bin/cursor-agent',
    },
    developerToolPath: '/usr/local/bin/claude',
  })

  assert.equal(settings.developerToolPath, '/usr/local/bin/claude')
  assert.equal(settings.developerToolPaths.codex, '/usr/local/bin/codex')

  const switched = normalizeDeveloperToolSettings({
    ...settings,
    developerTool: 'codex',
  })

  assert.equal(switched.developerToolPath, '/usr/local/bin/codex')
  assert.equal(switched.developerToolPaths.claude_code, '/usr/local/bin/claude')
})

test('gemini cli is resumable in the runtime matrix', () => {
  assert.equal(supportsDeveloperToolResume('gemini_cli'), true)
})

test('qwen cli is resumable in the runtime matrix', () => {
  assert.equal(supportsDeveloperToolResume('qwen_cli'), true)
})

test('cursor cli args always trust the workspace and map bypass mode explicitly', () => {
  assert.deepEqual(
    buildCursorCliArgs({
      sessionThreadId: 'cursor-session-1',
      bypassPermissions: true,
    }),
    ['--print', '--output-format', 'json', '--trust', '--resume', 'cursor-session-1', '--force'],
  )

  assert.deepEqual(
    buildCursorCliArgs({
      sessionThreadId: 'cursor-session-2',
      bypassPermissions: false,
    }),
    ['--print', '--output-format', 'json', '--trust', '--resume', 'cursor-session-2', '--sandbox', 'enabled'],
  )
})

test('claude code prompt args terminate variadic options before the prompt', () => {
  assert.deepEqual(
    buildPrintModeSpawnArgs({
      backend: 'claude_code',
      args: ['-p', '--add-dir', '/workspace'],
      prompt: 'hello',
    }),
    ['-p', '--add-dir', '/workspace', '--', 'hello'],
  )

  assert.deepEqual(
    buildPrintModeSpawnArgs({
      backend: 'cursor_cli',
      args: ['--print'],
      prompt: 'hello',
    }),
    ['--print', 'hello'],
  )
})

test('cursor cli result envelope is parsed into the shared schema payload', () => {
  const parsed = parseStructuredDeveloperToolOutput(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: 'cursor-session-1',
      result: '\n{"spokenReply":"done","uiReply":"done","status":"done","needTextContext":false,"nextActionHint":"next"}',
    }),
    'cursor_cli',
  )

  assert.deepEqual(parsed, {
    threadId: 'cursor-session-1',
    backend: 'cursor_cli',
    spokenReply: 'done',
    uiReply: 'done',
    status: 'done',
    needTextContext: false,
    nextActionHint: 'next',
  })
})

test('claude code prefers structured_output over display-oriented result text', () => {
  const parsed = parseStructuredDeveloperToolOutput(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      session_id: 'claude-session-1',
      result: '```json\n{"status":"done"}\n```',
      structured_output: {
        spokenReply: 'done',
        uiReply: 'done',
        status: 'done',
        needTextContext: false,
        nextActionHint: 'next',
      },
    }),
    'claude_code',
  )

  assert.deepEqual(parsed, {
    threadId: 'claude-session-1',
    backend: 'claude_code',
    spokenReply: 'done',
    uiReply: 'done',
    status: 'done',
    needTextContext: false,
    nextActionHint: 'next',
  })
})

test('gemini json wrapper is parsed into the shared schema payload', () => {
  const parsed = parseStructuredDeveloperToolOutput(
    JSON.stringify({
      session_id: 'gemini-session-1',
      response: JSON.stringify({
        spokenReply: 'done',
        uiReply: 'done',
        status: 'done',
        needTextContext: false,
        nextActionHint: 'next',
      }),
      stats: {
        tools: {
          totalCalls: 0,
        },
      },
    }),
    'gemini_cli',
  )

  assert.deepEqual(parsed, {
    threadId: 'gemini-session-1',
    backend: 'gemini_cli',
    spokenReply: 'done',
    uiReply: 'done',
    status: 'done',
    needTextContext: false,
    nextActionHint: 'next',
  })
})

test('qwen event-array json wrapper is parsed into the shared schema payload', () => {
  const parsed = parseStructuredDeveloperToolOutput(
    JSON.stringify([
      {
        type: 'system',
        session_id: 'qwen-session-1',
      },
      {
        type: 'assistant',
        session_id: 'qwen-session-1',
        message: {
          content: [
            {
              type: 'text',
              text: `\`\`\`json
{"spokenReply":"done","uiReply":"done","status":"done","needTextContext":false,"nextActionHint":"next"}
\`\`\``,
            },
          ],
        },
      },
      {
        type: 'result',
        session_id: 'qwen-session-1',
        result: `\`\`\`json
{"spokenReply":"done","uiReply":"done","status":"done","needTextContext":false,"nextActionHint":"next"}
\`\`\``,
      },
    ]),
    'qwen_cli',
  )

  assert.deepEqual(parsed, {
    threadId: 'qwen-session-1',
    backend: 'qwen_cli',
    spokenReply: 'done',
    uiReply: 'done',
    status: 'done',
    needTextContext: false,
    nextActionHint: 'next',
  })
})
