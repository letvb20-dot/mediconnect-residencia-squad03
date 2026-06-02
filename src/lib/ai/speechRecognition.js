// Abstração de speech-to-text que tenta a Web Speech API nativa (de graça)
// e cai para MediaRecorder + Gemini quando a nativa não está disponível ou falha.
//
// Uso:
//   const recognizer = createSpeechRecognizer()
//   recognizer.start({
//     onTranscript: (text) => { ... },
//     onError: (code) => { ... },
//     onStart: () => { ... },
//   })
//   recognizer.stop()   // para a gravação e dispara onTranscript com o texto
//   recognizer.abort()  // cancela sem disparar onTranscript

import { aiClient } from './aiClient.js'

// Após uma falha "network" / "service-not-allowed" da Web Speech, mudamos para
// Gemini definitivamente nesta sessão para não ficar errando de novo no mesmo PC.
let preferGemini = false

export function createSpeechRecognizer() {
  if (!preferGemini && hasNativeRecognition()) {
    return createNativeRecognizer()
  }
  return createGeminiRecognizer()
}

export function isVoiceCaptureAvailable() {
  if (typeof window === 'undefined') return false
  if (hasNativeRecognition()) return true
  return Boolean(window.MediaRecorder) && Boolean(navigator?.mediaDevices?.getUserMedia) && aiClient.isLive()
}

function hasNativeRecognition() {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

function createNativeRecognizer() {
  const NativeSR = window.SpeechRecognition || window.webkitSpeechRecognition
  let recognition = null
  let finalTranscript = ''
  let finished = false

  return {
    backend: 'native',

    start({ onTranscript, onError, onStart } = {}) {
      finished = false
      finalTranscript = ''
      recognition = new NativeSR()
      recognition.lang = 'pt-BR'
      recognition.interimResults = true
      recognition.continuous = true
      recognition.maxAlternatives = 1

      recognition.onstart = () => onStart?.()

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i]
          if (result.isFinal) {
            finalTranscript += `${result[0]?.transcript || ''} `
          }
        }
      }

      recognition.onerror = (event) => {
        const code = event?.error || 'unknown'
        // Se for problema de rede / serviço bloqueado, descarta a nativa pelo resto da sessão.
        if (code === 'network' || code === 'service-not-allowed' || code === 'audio-capture') {
          preferGemini = true
        }
        if (!finished) {
          finished = true
          onError?.(code)
        }
      }

      recognition.onend = () => {
        if (finished) return
        finished = true
        onTranscript?.(finalTranscript.trim())
      }

      try {
        recognition.start()
      } catch (error) {
        finished = true
        onError?.(error?.message || 'start-failed')
      }
    },

    stop() {
      if (recognition) {
        try { recognition.stop() } catch { /* ignora */ }
      }
    },

    abort() {
      finished = true
      if (recognition) {
        try { recognition.abort() } catch { /* ignora */ }
        recognition = null
      }
    },
  }
}

function createGeminiRecognizer() {
  let recorder = null
  let stream = null
  let chunks = []
  let pendingCallbacks = { onTranscript: null, onError: null }
  let aborted = false

  function cleanup() {
    if (stream) {
      try { stream.getTracks().forEach((track) => track.stop()) } catch { /* ignora */ }
    }
    stream = null
    recorder = null
    chunks = []
  }

  return {
    backend: 'gemini',

    async start({ onTranscript, onError, onStart } = {}) {
      aborted = false
      pendingCallbacks = { onTranscript, onError }
      chunks = []

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (error) {
        cleanup()
        onError?.(error?.name === 'NotAllowedError' ? 'not-allowed' : error?.message || 'getUserMedia-failed')
        return
      }

      const mimeType = pickRecorderMimeType()
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      } catch (error) {
        cleanup()
        onError?.(error?.message || 'recorder-failed')
        return
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstart = () => onStart?.()
      recorder.onstop = async () => {
        const collected = chunks
        const recorderMime = recorder?.mimeType || mimeType || 'audio/webm'
        cleanup()
        if (aborted) return
        if (!collected.length) {
          pendingCallbacks.onTranscript?.('')
          return
        }
        const blob = new Blob(collected, { type: recorderMime })
        try {
          const text = await aiClient.transcribeAudio({ blob, mimeType: blob.type })
          pendingCallbacks.onTranscript?.(text || '')
        } catch (error) {
          pendingCallbacks.onError?.(error?.message || 'transcribe-failed')
        }
      }

      try {
        recorder.start()
      } catch (error) {
        cleanup()
        onError?.(error?.message || 'start-failed')
      }
    },

    stop() {
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop() } catch { /* ignora */ }
      }
    },

    abort() {
      aborted = true
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop() } catch { /* ignora */ }
      }
      cleanup()
    },
  }
}

function pickRecorderMimeType() {
  if (typeof window === 'undefined' || !window.MediaRecorder) return ''
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ]
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported?.(candidate)) return candidate
  }
  return ''
}
