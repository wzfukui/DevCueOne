import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { VoicePhase } from './useVoiceLoop'

const TARGET_SAMPLE_RATE = 16000
const SCRIPT_PROCESSOR_BUFFER_SIZE = 2048
const NOISE_CALIBRATION_MS = 1500
const NOISE_FLOOR_ALPHA = 0.04
const FAST_NOISE_FLOOR_ALPHA = 0.14
const START_THRESHOLD_FLOOR = 0.042
const END_THRESHOLD_FLOOR = 0.025
const START_THRESHOLD_MARGIN = 0.018
const END_THRESHOLD_MARGIN = 0.01
const START_THRESHOLD_MULTIPLIER = 3.1
const END_THRESHOLD_MULTIPLIER = 2
const PRE_ROLL_MS = 420
const MIN_SPEECH_START_MS = 220
const SILENCE_AFTER_SPEECH_MS = 1600
const MIN_SEGMENT_MS = 520
const MIN_VOICED_MS = 320
const SPEECH_HOLD_MS = 260

interface UseVadVoiceLoopOptions {
  enabled: boolean
  suspended: boolean
  onUtterance: (blob: Blob, mimeType: string) => Promise<void> | void
  onError: (message: string) => void
}

interface BufferedChunk {
  samples: Float32Array
  durationMs: number
}

function computeRms(samples: Float32Array): number {
  if (!samples.length) {
    return 0
  }

  let sum = 0
  for (let index = 0; index < samples.length; index += 1) {
    sum += samples[index] * samples[index]
  }

  return Math.sqrt(sum / samples.length)
}

function computeThresholds(noiseFloor: number) {
  return {
    start: Math.max(
      START_THRESHOLD_FLOOR,
      noiseFloor * START_THRESHOLD_MULTIPLIER,
      noiseFloor + START_THRESHOLD_MARGIN,
    ),
    end: Math.max(
      END_THRESHOLD_FLOOR,
      noiseFloor * END_THRESHOLD_MULTIPLIER,
      noiseFloor + END_THRESHOLD_MARGIN,
    ),
  }
}

function resampleToTarget(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number,
) {
  if (!input.length) {
    return new Float32Array(0)
  }

  if (inputSampleRate === targetSampleRate) {
    return input.slice()
  }

  const ratio = inputSampleRate / targetSampleRate
  const outputLength = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(outputLength)

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio
    const leftIndex = Math.floor(position)
    const rightIndex = Math.min(leftIndex + 1, input.length - 1)
    const mix = position - leftIndex
    const leftValue = input[leftIndex] ?? 0
    const rightValue = input[rightIndex] ?? leftValue
    output[index] = leftValue + (rightValue - leftValue) * mix
  }

  return output
}

function concatFloat32Chunks(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Float32Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }

  return output
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const byteLength = 44 + samples.length * 2
  const buffer = new ArrayBuffer(byteLength)
  const view = new DataView(buffer)

  function writeAscii(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    view.setInt16(offset, value, true)
    offset += 2
  }

  return buffer
}

export function useVadVoiceLoop({
  enabled,
  suspended,
  onUtterance,
  onError,
}: UseVadVoiceLoopOptions) {
  const [level, setLevel] = useState(0)
  const [isSpeechDetected, setIsSpeechDetected] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle')

  const callbacksRef = useRef({ onUtterance, onError })
  const suspendedRef = useRef(suspended)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const muteGainRef = useRef<GainNode | null>(null)
  const preRollChunksRef = useRef<BufferedChunk[]>([])
  const utteranceChunksRef = useRef<Float32Array[]>([])
  const utteranceDurationRef = useRef(0)
  const candidateStartedAtRef = useRef(0)
  const candidateVoicedMsRef = useRef(0)
  const lastSpeechAtRef = useRef(0)
  const voicedDurationRef = useRef(0)
  const peakLevelRef = useRef(0)
  const noiseFloorRef = useRef(0.01)
  const calibratingRef = useRef(false)
  const calibrationEndsAtRef = useRef(0)
  const captureActiveRef = useRef(false)

  useEffect(() => {
    callbacksRef.current = { onUtterance, onError }
  }, [onUtterance, onError])

  useEffect(() => {
    suspendedRef.current = suspended
  }, [suspended])

  function updateCalibrationState(calibrating: boolean) {
    if (calibratingRef.current !== calibrating) {
      calibratingRef.current = calibrating
      setIsCalibrating(calibrating)
    }
  }

  function updateNoiseFloor(rms: number, fast = false) {
    const clamped = Math.min(Math.max(rms, 0.002), 0.08)
    const current = noiseFloorRef.current || clamped
    const alpha = fast ? FAST_NOISE_FLOOR_ALPHA : NOISE_FLOOR_ALPHA
    noiseFloorRef.current = current * (1 - alpha) + clamped * alpha
  }

  function clearPreRollBuffer() {
    preRollChunksRef.current = []
  }

  function resetUtteranceState(resetPreRoll = false) {
    captureActiveRef.current = false
    utteranceChunksRef.current = []
    utteranceDurationRef.current = 0
    candidateStartedAtRef.current = 0
    candidateVoicedMsRef.current = 0
    lastSpeechAtRef.current = 0
    voicedDurationRef.current = 0
    peakLevelRef.current = 0
    if (resetPreRoll) {
      clearPreRollBuffer()
    }
    setIsSpeechDetected(false)
    setVoicePhase('idle')
  }

  function pushPreRollChunk(samples: Float32Array, durationMs: number) {
    preRollChunksRef.current.push({
      samples: samples.slice(),
      durationMs,
    })

    let totalDurationMs = preRollChunksRef.current.reduce((sum, chunk) => sum + chunk.durationMs, 0)
    while (totalDurationMs > PRE_ROLL_MS && preRollChunksRef.current.length > 1) {
      const removed = preRollChunksRef.current.shift()
      totalDurationMs -= removed?.durationMs || 0
    }
  }

  function beginUtterance(now: number) {
    captureActiveRef.current = true
    utteranceChunksRef.current = preRollChunksRef.current.map((chunk) => chunk.samples.slice())
    utteranceDurationRef.current = preRollChunksRef.current.reduce(
      (sum, chunk) => sum + chunk.durationMs,
      0,
    )
    voicedDurationRef.current = candidateVoicedMsRef.current
    lastSpeechAtRef.current = now
    candidateStartedAtRef.current = 0
    candidateVoicedMsRef.current = 0
    clearPreRollBuffer()
    setIsSpeechDetected(true)
    setVoicePhase('capturing_utterance')
  }

  function appendUtteranceChunk(samples: Float32Array, durationMs: number) {
    utteranceChunksRef.current.push(samples.slice())
    utteranceDurationRef.current += durationMs
  }

  async function finalizeUtterance() {
    const shouldEmit =
      utteranceDurationRef.current >= MIN_SEGMENT_MS &&
      voicedDurationRef.current >= MIN_VOICED_MS &&
      peakLevelRef.current >= START_THRESHOLD_FLOOR &&
      utteranceChunksRef.current.length > 0

    const blob = shouldEmit
      ? new Blob(
          [encodeWav(concatFloat32Chunks(utteranceChunksRef.current), TARGET_SAMPLE_RATE)],
          { type: 'audio/wav' },
        )
      : null

    resetUtteranceState(true)

    if (blob) {
      await callbacksRef.current.onUtterance(blob, 'audio/wav')
    }
  }

  function cancelCurrentUtterance() {
    resetUtteranceState(true)
  }

  const resetUtteranceStateEvent = useEffectEvent((resetPreRoll = false) => {
    resetUtteranceState(resetPreRoll)
  })

  const beginUtteranceEvent = useEffectEvent((now: number) => {
    beginUtterance(now)
  })

  const finalizeUtteranceEvent = useEffectEvent(async () => {
    await finalizeUtterance()
  })

  useEffect(() => {
    let disposed = false

    async function ensureLoop() {
      if (!enabled) {
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        const audioContext = new AudioContext()
        const sourceNode = audioContext.createMediaStreamSource(stream)
        const processor = audioContext.createScriptProcessor(
          SCRIPT_PROCESSOR_BUFFER_SIZE,
          1,
          1,
        )
        const muteGain = audioContext.createGain()
        muteGain.gain.value = 0

        sourceNode.connect(processor)
        processor.connect(muteGain)
        muteGain.connect(audioContext.destination)

        streamRef.current = stream
        audioContextRef.current = audioContext
        sourceNodeRef.current = sourceNode
        processorRef.current = processor
        muteGainRef.current = muteGain
        setHasPermission(true)
        noiseFloorRef.current = 0.01
        calibrationEndsAtRef.current = Date.now() + NOISE_CALIBRATION_MS
        updateCalibrationState(true)

        processor.onaudioprocess = (event) => {
          if (disposed) {
            return
          }

          const inputSamples = event.inputBuffer.getChannelData(0)
          const resampled = resampleToTarget(
            inputSamples,
            audioContext.sampleRate,
            TARGET_SAMPLE_RATE,
          )

          if (!resampled.length) {
            return
          }

          const durationMs = (resampled.length / TARGET_SAMPLE_RATE) * 1000
          const rms = computeRms(resampled)
          const now = Date.now()
          const isCalibratingNow = now < calibrationEndsAtRef.current
          const { start, end } = computeThresholds(noiseFloorRef.current)

          setLevel(rms)
          updateCalibrationState(isCalibratingNow)

          if (suspendedRef.current) {
            resetUtteranceStateEvent(true)
            return
          }

          if (captureActiveRef.current) {
            appendUtteranceChunk(resampled, durationMs)

            if (rms >= end) {
              lastSpeechAtRef.current = now
              voicedDurationRef.current += durationMs
              peakLevelRef.current = Math.max(peakLevelRef.current, rms)
              setIsSpeechDetected(true)
            } else if (now - lastSpeechAtRef.current <= SPEECH_HOLD_MS) {
              setIsSpeechDetected(true)
            } else {
              setIsSpeechDetected(false)
            }

            if (now - lastSpeechAtRef.current > SILENCE_AFTER_SPEECH_MS) {
              void finalizeUtteranceEvent()
            }

            return
          }

          pushPreRollChunk(resampled, durationMs)

          if (rms >= start) {
            if (!candidateStartedAtRef.current) {
              candidateStartedAtRef.current = now
              candidateVoicedMsRef.current = 0
              peakLevelRef.current = 0
            }

            candidateVoicedMsRef.current += durationMs
            peakLevelRef.current = Math.max(peakLevelRef.current, rms)
            setIsSpeechDetected(true)
            setVoicePhase('speech_candidate')

            if (now - candidateStartedAtRef.current >= MIN_SPEECH_START_MS) {
              beginUtteranceEvent(now)
            }

            return
          }

          candidateStartedAtRef.current = 0
          candidateVoicedMsRef.current = 0
          peakLevelRef.current = 0
          if (isCalibratingNow || rms < start) {
            updateNoiseFloor(rms, isCalibratingNow)
          }
          setIsSpeechDetected(false)
          setVoicePhase('idle')
        }
      } catch (error) {
        setHasPermission(false)
        setVoicePhase('idle')
        callbacksRef.current.onError(
          error instanceof Error ? error.message : '无法获取麦克风权限。',
        )
      }
    }

    ensureLoop()

    return () => {
      disposed = true

      if (processorRef.current) {
        processorRef.current.onaudioprocess = null
        processorRef.current.disconnect()
        processorRef.current = null
      }

      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect()
        sourceNodeRef.current = null
      }

      if (muteGainRef.current) {
        muteGainRef.current.disconnect()
        muteGainRef.current = null
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      clearPreRollBuffer()
      resetUtteranceStateEvent(true)
      updateCalibrationState(false)
      setLevel(0)
    }
  }, [enabled])

  return {
    cancelCurrentUtterance,
    hasPermission,
    isCalibrating,
    isSpeechDetected,
    level,
    voicePhase,
  }
}
