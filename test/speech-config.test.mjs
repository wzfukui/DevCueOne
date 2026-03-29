import test from 'node:test'
import assert from 'node:assert/strict'

import {
  migrateLegacyGlobalOpenAiApiKey,
  normalizeSpeechSettings,
  resolveSpeechApiKey,
  resolveSpeechBaseUrl,
  resolveSelectedSttConfig,
  resolveSelectedTtsConfig,
  resolveSynthesizerTtsConfig,
} from '../electron/speech-config.mjs'

test('legacy flat settings migrate into selected speech configs', () => {
  const settings = normalizeSpeechSettings({
    sttProvider: 'openai',
    transcriptionModel: 'gpt-4o-transcribe',
    transcriptionLanguage: 'en',
    ttsProvider: 'browser',
    ttsModel: 'gpt-4o-mini-tts',
    ttsVoice: 'coral',
  })

  const selectedSttConfig = resolveSelectedSttConfig(settings)
  const selectedTtsConfig = resolveSelectedTtsConfig(settings)

  assert.equal(settings.selectedSttConfigId, selectedSttConfig.id)
  assert.equal(settings.selectedTtsConfigId, selectedTtsConfig.id)
  assert.equal(selectedSttConfig.kind, 'openai')
  assert.equal(selectedSttConfig.model, 'gpt-4o-transcribe')
  assert.equal(selectedSttConfig.language, 'en')
  assert.equal(selectedTtsConfig.kind, 'browser')
  assert.equal(selectedTtsConfig.model, 'gpt-4o-mini-tts')
  assert.equal(selectedTtsConfig.voice, 'coral')
})

test('stored config selection wins over legacy provider fields', () => {
  const settings = normalizeSpeechSettings({
    sttProvider: 'openai',
    selectedSttConfigId: 'stt-groq-custom',
    sttConfigs: [
      {
        id: 'stt-groq-custom',
        name: 'Groq Turbo',
        kind: 'groq',
        enabled: true,
        model: 'whisper-large-v3-turbo',
        language: 'zh',
      },
    ],
    ttsProvider: 'openai',
    selectedTtsConfigId: 'tts-openai-custom',
    ttsConfigs: [
      {
        id: 'tts-openai-custom',
        name: 'OpenAI Warm',
        kind: 'openai',
        enabled: true,
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
      },
    ],
  })

  const selectedSttConfig = resolveSelectedSttConfig(settings)

  assert.equal(selectedSttConfig.id, 'stt-groq-custom')
  assert.equal(settings.sttProvider, 'groq')
  assert.equal(settings.transcriptionModel, 'whisper-large-v3-turbo')
})

test('legacy zhipu configs are removed from normalized speech settings', () => {
  const settings = normalizeSpeechSettings({
    sttProvider: 'zhipu',
    ttsProvider: 'zhipu',
    sttConfigs: [
      {
        id: 'stt-zhipu-custom',
        name: 'Zhipu STT',
        kind: 'zhipu',
        enabled: true,
        model: 'glm-asr',
        language: 'zh',
        apiKey: 'zhipu-key',
      },
    ],
    ttsConfigs: [
      {
        id: 'tts-zhipu-custom',
        name: 'Zhipu TTS',
        kind: 'zhipu',
        enabled: true,
        model: 'glm-tts',
        voice: 'warm',
        format: 'mp3',
        apiKey: 'zhipu-key',
      },
    ],
  })

  assert.equal(settings.sttProvider, 'openai')
  assert.equal(settings.ttsProvider, 'browser')
  assert.ok(settings.sttConfigs.every((config) => config.kind !== 'zhipu'))
  assert.ok(settings.ttsConfigs.every((config) => config.kind !== 'zhipu'))
})

test('browser tts falls back to first enabled cloud synthesizer config', () => {
  const settings = normalizeSpeechSettings({
    selectedTtsConfigId: 'tts-browser-default',
    ttsConfigs: [
      {
        id: 'tts-browser-default',
        name: 'Browser',
        kind: 'browser',
        enabled: true,
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        format: 'mp3',
      },
      {
        id: 'tts-groq-custom',
        name: 'Groq Voice',
        kind: 'groq',
        enabled: true,
        model: 'canopylabs/orpheus-v1-english',
        voice: 'austin',
        format: 'wav',
        apiKey: 'groq-key',
      },
    ],
  })

  const config = resolveSynthesizerTtsConfig(settings)

  assert.ok(config)
  assert.equal(config.id, 'tts-groq-custom')
})

test('browser tts can fall back to alibaba model studio config', () => {
  const settings = normalizeSpeechSettings({
    selectedTtsConfigId: 'tts-browser-default',
    ttsConfigs: [
      {
        id: 'tts-browser-default',
        name: 'Browser',
        kind: 'browser',
        enabled: true,
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        format: 'mp3',
      },
      {
        id: 'tts-alibaba-custom',
        name: 'Alibaba CN',
        kind: 'alibaba_model_studio',
        enabled: true,
        model: 'qwen3-tts-flash',
        voice: 'Cherry',
        format: 'wav',
        apiKey: 'dashscope-key',
        region: 'beijing',
      },
    ],
  })

  const config = resolveSynthesizerTtsConfig(settings)

  assert.ok(config)
  assert.equal(config.id, 'tts-alibaba-custom')
})

test('provider credentials and base url resolve from config first', () => {
  const settings = normalizeSpeechSettings({
    sttConfigs: [
      {
        id: 'stt-groq-custom',
        name: 'Groq Turbo',
        kind: 'groq',
        enabled: true,
        model: 'whisper-large-v3-turbo',
        language: 'zh',
        apiKey: 'groq-key',
      },
    ],
    selectedSttConfigId: 'stt-groq-custom',
  })

  const config = resolveSelectedSttConfig(settings)

  assert.equal(resolveSpeechApiKey(settings, config), 'groq-key')
  assert.equal(resolveSpeechBaseUrl(config), 'https://api.groq.com/openai/v1')
})

test('legacy global openai api key is migrated into openai configs', () => {
  const settings = migrateLegacyGlobalOpenAiApiKey(normalizeSpeechSettings({
    openAiApiKey: 'legacy-openai-key',
    sttConfigs: [
      {
        id: 'stt-openai-custom',
        name: 'OpenAI Custom',
        kind: 'openai',
        enabled: true,
        model: 'gpt-4o-mini-transcribe',
        language: 'zh',
      },
    ],
    ttsConfigs: [
      {
        id: 'tts-openai-custom',
        name: 'OpenAI Voice',
        kind: 'openai',
        enabled: true,
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
      },
    ],
    selectedSttConfigId: 'stt-openai-custom',
    selectedTtsConfigId: 'tts-openai-custom',
  }))

  const sttConfig = resolveSelectedSttConfig(settings)
  const ttsConfig = resolveSelectedTtsConfig(settings)

  assert.equal(sttConfig.apiKey, 'legacy-openai-key')
  assert.equal(ttsConfig.apiKey, 'legacy-openai-key')
  assert.equal(resolveSpeechApiKey(settings, sttConfig), 'legacy-openai-key')
  assert.equal(settings.openAiApiKey, '')
})

test('alibaba model studio resolves region-aware default base urls', () => {
  const beijingSttConfig = resolveSelectedSttConfig(
    normalizeSpeechSettings({
      sttConfigs: [
        {
          id: 'stt-alibaba-bj',
          name: 'Alibaba BJ',
          kind: 'alibaba_model_studio',
          enabled: true,
          model: 'qwen3-asr-flash',
          language: 'zh',
          region: 'beijing',
        },
      ],
      selectedSttConfigId: 'stt-alibaba-bj',
    }),
  )

  const singaporeTtsConfig = resolveSelectedTtsConfig(
    normalizeSpeechSettings({
      ttsConfigs: [
        {
          id: 'tts-alibaba-sg',
          name: 'Alibaba SG',
          kind: 'alibaba_model_studio',
          enabled: true,
          model: 'qwen3-tts-flash',
          voice: 'Cherry',
          format: 'wav',
          region: 'singapore',
        },
      ],
      selectedTtsConfigId: 'tts-alibaba-sg',
    }),
  )

  assert.equal(
    resolveSpeechBaseUrl(beijingSttConfig, 'stt'),
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
  )
  assert.equal(
    resolveSpeechBaseUrl(singaporeTtsConfig, 'tts'),
    'https://dashscope-intl.aliyuncs.com/api/v1',
  )
})

test('volcengine speech resolves default base urls', () => {
  const sttConfig = resolveSelectedSttConfig(
    normalizeSpeechSettings({
      sttConfigs: [
        {
          id: 'stt-volc-custom',
          name: 'Volcengine STT',
          kind: 'volcengine_speech',
          enabled: true,
          model: 'volc.bigasr.auc_turbo',
          language: 'zh',
          apiKey: 'volc-token',
          extra: {
            appId: 'volc-app-id',
          },
        },
      ],
      selectedSttConfigId: 'stt-volc-custom',
    }),
  )

  const ttsConfig = resolveSelectedTtsConfig(
    normalizeSpeechSettings({
      ttsConfigs: [
        {
          id: 'tts-volc-custom',
          name: 'Volcengine TTS',
          kind: 'volcengine_speech',
          enabled: true,
          model: 'seed-tts-2.0',
          voice: 'zh_female_shuangkuaisisi_uranus_bigtts',
          format: 'mp3',
          apiKey: 'volc-token',
        },
      ],
      selectedTtsConfigId: 'tts-volc-custom',
    }),
  )

  assert.equal(
    resolveSpeechBaseUrl(sttConfig, 'stt'),
    'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash',
  )
  assert.equal(
    resolveSpeechBaseUrl(ttsConfig, 'tts'),
    'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse',
  )
})

test('browser tts can fall back to volcengine config with api key only', () => {
  const settings = normalizeSpeechSettings({
    selectedTtsConfigId: 'tts-browser-default',
    ttsConfigs: [
      {
        id: 'tts-browser-default',
        name: 'Browser',
        kind: 'browser',
        enabled: true,
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        format: 'mp3',
      },
      {
        id: 'tts-volc-custom',
        name: 'Volcengine Voice',
        kind: 'volcengine_speech',
        enabled: true,
        model: 'seed-tts-2.0',
        voice: 'zh_female_shuangkuaisisi_uranus_bigtts',
        format: 'mp3',
        apiKey: 'volc-token',
      },
    ],
  })

  const config = resolveSynthesizerTtsConfig(settings)

  assert.ok(config)
  assert.equal(config.id, 'tts-volc-custom')
})

test('browser tts can fall back to complete volcengine config', () => {
  const settings = normalizeSpeechSettings({
    selectedTtsConfigId: 'tts-browser-default',
    ttsConfigs: [
      {
        id: 'tts-browser-default',
        name: 'Browser',
        kind: 'browser',
        enabled: true,
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        format: 'mp3',
      },
      {
        id: 'tts-volc-custom',
        name: 'Volcengine Voice',
        kind: 'volcengine_speech',
        enabled: true,
        model: 'seed-tts-2.0',
        voice: 'zh_female_shuangkuaisisi_uranus_bigtts',
        format: 'mp3',
        apiKey: 'volc-token',
        extra: {
          appId: 'volc-app-id',
        },
      },
    ],
  })

  const config = resolveSynthesizerTtsConfig(settings)

  assert.ok(config)
  assert.equal(config.id, 'tts-volc-custom')
})
