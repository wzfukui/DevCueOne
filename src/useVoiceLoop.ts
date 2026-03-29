import { useEffect, useRef, useState } from 'react'

const SAMPLE_WINDOW_MS = 60
const NOISE_CALIBRATION_MS = 1500
const NOISE_FLOOR_ALPHA = 0.06
const FAST_NOISE_FLOOR_ALPHA = 0.18
const START_THRESHOLD_FLOOR = 0.04
const END_THRESHOLD_FLOOR = 0.024
const START_THRESHOLD_MARGIN = 0.018
const END_THRESHOLD_MARGIN = 0.01
const START_THRESHOLD_MULTIPLIER = 3
const END_THRESHOLD_MULTIPLIER = 2
const MIN_SPEECH_START_MS = 180
const SILENCE_AFTER_SPEECH_MS = 2000
const MIN_SEGMENT_MS = 500
const MIN_VOICED_MS = 320
const SPEECH_HOLD_MS = 220

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }

  return ''
}

function getRms(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(data)

  let sum = 0
  for (let index = 0; index < data.length; index += 1) {
    const centered = (data[index] - 128) / 128
    sum += centered * centered
  }

  return Math.sqrt(sum / data.length)
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

interface UseVoiceLoopOptions {
  enabled: boolean
  suspended: boolean
  onUtterance: (blob: Blob, mimeType: string) => Promise<void> | void
  onError: (message: string) => void
}

export type VoicePhase = 'idle' | 'speech_candidate' | 'capturing_utterance'

export function useVoiceLoop({
  enabled,
  suspended,
  onUtterance,
  onError,
}: UseVoiceLoopOptions) {
  const [level, setLevel] = useState(0)
  const [isSpeechDetected, setIsSpeechDetected] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle')

  const callbacksRef = useRef({ onUtterance, onError })
  const suspendedRef = useRef(suspended)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const intervalRef = useRef<number | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const lastSpeechAtRef = useRef(0)
  const segmentStartedAtRef = useRef(0)
  const mimeTypeRef = useRef('')
  const isStoppingRef = useRef(false)
  const speechCandidateStartedAtRef = useRef(0)
  const voicedDurationRef = useRef(0)
  const peakLevelRef = useRef(0)
  const triggerThresholdRef = useRef(START_THRESHOLD_FLOOR)
  const noiseFloorRef = useRef(0.01)
  const calibratingRef = useRef(false)
  const calibrationEndsAtRef = useRef(0)

  useEffect(() => {
    callbacksRef.current = { onUtterance, onError }
  }, [onUtterance, onError])

  useEffect(() => {
    suspendedRef.current = suspended
  }, [suspended])

  function stopRecordingSegment(emit: boolean) {
    const recorder = recorderRef.current

    if (!recorder || recorder.state === 'inactive' || isStoppingRef.current) {
      if (!emit) {
        chunksRef.current = []
      }
      return
    }

    if (!emit) {
      chunksRef.current = []
    }

    isStoppingRef.current = true
    recorder.stop()
  }

  function updateCalibrationState(calibrating: boolean) {
    if (calibratingRef.current !== calibrating) {
      calibratingRef.current = calibrating
      setIsCalibrating(calibrating)
    }
  }

  function updateNoiseFloor(rms: number, fast = false) {
    const clamped = Math.min(Math.max(rms, 0.003), 0.08)
    const current = noiseFloorRef.current || clamped
    const alpha = fast ? FAST_NOISE_FLOOR_ALPHA : NOISE_FLOOR_ALPHA
    noiseFloorRef.current = current * (1 - alpha) + clamped * alpha
  }

  function startRecordingSegment(stream: MediaStream, triggerThreshold: number) {
    const mimeType = mimeTypeRef.current

    try {
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      chunksRef.current = []
      isStoppingRef.current = false
      segmentStartedAtRef.current = Date.now()
      lastSpeechAtRef.current = Date.now()
      voicedDurationRef.current = 0
      peakLevelRef.current = 0
      triggerThresholdRef.current = triggerThreshold
      recorderRef.current = recorder

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      })

      recorder.addEventListener('stop', () => {
        const durationMs = Date.now() - segmentStartedAtRef.current
        const shouldEmit =
          durationMs >= MIN_SEGMENT_MS &&
          voicedDurationRef.current >= MIN_VOICED_MS &&
          peakLevelRef.current >= Math.max(triggerThresholdRef.current, START_THRESHOLD_FLOOR) &&
          chunksRef.current.length > 0
        const blob = shouldEmit
          ? new Blob(chunksRef.current, {
              type: recorder.mimeType || mimeTypeRef.current || 'audio/webm',
            })
          : null

        chunksRef.current = []
        recorderRef.current = null
        isStoppingRef.current = false
        speechCandidateStartedAtRef.current = 0
        voicedDurationRef.current = 0
        peakLevelRef.current = 0
        setIsSpeechDetected(false)
        setVoicePhase('idle')

        if (blob) {
          void callbacksRef.current.onUtterance(blob, blob.type || 'audio/webm')
        }
      })

      recorder.start(200)
      setVoicePhase('capturing_utterance')
    } catch (error) {
      recorderRef.current = null
      setVoicePhase('idle')
      callbacksRef.current.onError(
        error instanceof Error ? error.message : '无法启动录音分段。',
      )
    }
  }

  function cancelCurrentUtterance() {
    speechCandidateStartedAtRef.current = 0
    voicedDurationRef.current = 0
    peakLevelRef.current = 0
    lastSpeechAtRef.current = 0
    setIsSpeechDetected(false)
    setVoicePhase('idle')

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      stopRecordingSegment(false)
    }
  }

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

        streamRef.current = stream
        setHasPermission(true)
        noiseFloorRef.current = 0.01
        calibrationEndsAtRef.current = Date.now() + NOISE_CALIBRATION_MS
        updateCalibrationState(true)

        const audioContext = new AudioContext()
        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 2048
        source.connect(analyser)

        audioContextRef.current = audioContext
        analyserRef.current = analyser
        dataRef.current = new Uint8Array(
          new ArrayBuffer(analyser.fftSize),
        ) as Uint8Array<ArrayBuffer>
        mimeTypeRef.current = pickMimeType()

        intervalRef.current = window.setInterval(() => {
          const currentAnalyser = analyserRef.current
          const currentData = dataRef.current

          if (!currentAnalyser || !currentData) {
            return
          }

          const rms = getRms(currentAnalyser, currentData)
          setLevel(rms)
          const now = Date.now()
          const isCalibratingNow = now < calibrationEndsAtRef.current
          updateCalibrationState(isCalibratingNow)
          const { start, end } = computeThresholds(noiseFloorRef.current)

          if (suspendedRef.current) {
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
              stopRecordingSegment(false)
            }
            speechCandidateStartedAtRef.current = 0
            setIsSpeechDetected(false)
            setVoicePhase('idle')
            return
          }

          const recorder = recorderRef.current
          if (recorder && recorder.state !== 'inactive') {
            if (rms >= end) {
              lastSpeechAtRef.current = now
              voicedDurationRef.current += SAMPLE_WINDOW_MS
              peakLevelRef.current = Math.max(peakLevelRef.current, rms)
              setIsSpeechDetected(true)
              return
            }

            if (now - lastSpeechAtRef.current <= SPEECH_HOLD_MS) {
              setIsSpeechDetected(true)
              return
            }

            if (now - lastSpeechAtRef.current > SILENCE_AFTER_SPEECH_MS) {
              stopRecordingSegment(true)
            } else {
              setIsSpeechDetected(false)
            }

            return
          }

          if (rms >= start) {
            if (!speechCandidateStartedAtRef.current) {
              speechCandidateStartedAtRef.current = now
            }

            setIsSpeechDetected(true)
            setVoicePhase('speech_candidate')

            if (now - speechCandidateStartedAtRef.current >= MIN_SPEECH_START_MS) {
              startRecordingSegment(stream, start)
              lastSpeechAtRef.current = now
              voicedDurationRef.current = MIN_SPEECH_START_MS
              peakLevelRef.current = rms
              speechCandidateStartedAtRef.current = 0
            }

            return
          }

          speechCandidateStartedAtRef.current = 0
          if (isCalibratingNow || rms < start) {
            updateNoiseFloor(rms, isCalibratingNow)
          }

          if (!recorder || recorder.state === 'inactive') {
            setIsSpeechDetected(false)
            setVoicePhase('idle')
          }
        }, SAMPLE_WINDOW_MS)
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

      if (intervalRef.current) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      stopRecordingSegment(false)
      recorderRef.current = null

      if (audioContextRef.current) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      analyserRef.current = null
      dataRef.current = null
      updateCalibrationState(false)
      setLevel(0)
      setIsSpeechDetected(false)
      setVoicePhase('idle')
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
