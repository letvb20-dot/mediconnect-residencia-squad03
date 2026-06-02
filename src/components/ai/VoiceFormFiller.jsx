import { useCallback, useEffect, useRef, useState } from 'react'

import { aiClient } from '../../lib/ai/aiClient.js'

/**
 * Botão de microfone que grava áudio, envia para o Gemini junto com o schema
 * dos campos e devolve um objeto { campo: valor } via onFill.
 *
 * Props:
 *  - schema: array de { name, label, type?, options?, example? }
 *  - onFill: function(values) — recebe o objeto extraído pela IA
 *  - hint: string opcional com contexto extra para o modelo
 *  - className: string opcional para o container
 */
export function VoiceFormFiller({ schema = [], onFill, hint = '', className = '' }) {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])

  const supported =
    typeof window !== 'undefined' &&
    Boolean(window.MediaRecorder) &&
    Boolean(navigator?.mediaDevices?.getUserMedia) &&
    aiClient.isLive()

  useEffect(() => {
    return () => {
      stopRecorderInstance(recorderRef.current, streamRef.current)
      recorderRef.current = null
      streamRef.current = null
    }
  }, [])

  const toggle = useCallback(async () => {
    if (!supported) {
      setError(
        !aiClient.isLive()
          ? 'Configure VITE_GEMINI_API_KEY no .env para habilitar o ditado.'
          : 'Este navegador não suporta gravação de áudio.',
      )
      return
    }

    if (recording && recorderRef.current) {
      try { recorderRef.current.stop() } catch { /* ignora */ }
      return
    }

    if (busy) return

    setError('')
    setStatus('')

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const message = err?.name === 'NotAllowedError'
        ? 'Permissão de microfone negada pelo navegador.'
        : `Não foi possível acessar o microfone: ${err?.message || 'erro desconhecido'}`
      setError(message)
      return
    }

    const mimeType = pickRecorderMimeType()
    let recorder
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop())
      setError(`Não foi possível iniciar o gravador: ${err?.message || 'erro desconhecido'}`)
      return
    }

    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstart = () => {
      setRecording(true)
      setStatus('Gravando... clique de novo para parar e enviar.')
    }
    recorder.onerror = (event) => {
      setError(`Erro na gravação: ${event?.error?.message || 'desconhecido'}`)
    }
    recorder.onstop = async () => {
      setRecording(false)
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      recorderRef.current = null

      const chunks = chunksRef.current
      chunksRef.current = []
      if (!chunks.length) {
        setStatus('')
        return
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
      setBusy(true)
      setStatus('Analisando áudio com IA...')
      try {
        const values = await aiClient.extractFormFromAudio({
          blob,
          mimeType: blob.type,
          schema,
          hint,
        })
        const filled = Object.keys(values || {}).filter((key) => {
          const value = values[key]
          return value !== undefined && value !== null && String(value).trim() !== ''
        })
        if (!filled.length) {
          setStatus('')
          setError('Não consegui identificar nenhum campo no áudio. Tente novamente.')
          return
        }
        onFill?.(values)
        setStatus(`Campos preenchidos: ${filled.join(', ')}.`)
      } catch (err) {
        setStatus('')
        setError(err?.message || 'Falha ao processar o áudio.')
      } finally {
        setBusy(false)
      }
    }

    recorderRef.current = recorder
    streamRef.current = stream
    try {
      recorder.start()
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      streamRef.current = null
      setError(`Não foi possível iniciar a gravação: ${err?.message || 'erro desconhecido'}`)
    }
  }, [busy, hint, onFill, recording, schema, supported])

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-3">
        <button
          aria-label={recording ? 'Parar gravação' : 'Preencher campos por voz'}
          className={`grid size-11 shrink-0 place-items-center rounded-full border transition disabled:opacity-50 ${
            recording
              ? 'border-red-500 bg-red-500 text-white animate-pulse'
              : 'border-border-default-v2 bg-surface-inset text-text-heading hover:bg-surface-card-hover'
          }`}
          disabled={busy}
          onClick={toggle}
          type="button"
        >
          <MicIcon />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-heading">Preencher por voz</p>
          <p className="text-xs text-text-muted-v2">
            {recording
              ? 'Gravando... fale os campos no formato "nome José Antonio, telefone 11 99999 0000, cidade São Paulo".'
              : busy
                ? 'Aguarde a IA analisar o áudio...'
                : 'Clique no microfone, diga todos os campos de uma vez e clique de novo para enviar.'}
          </p>
        </div>
      </div>
      {status ? <p className="text-xs text-accent-primary">{status}</p> : null}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  )
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

function stopRecorderInstance(recorder, stream) {
  if (recorder && recorder.state !== 'inactive') {
    try { recorder.stop() } catch { /* ignora */ }
  }
  if (stream) {
    try { stream.getTracks().forEach((track) => track.stop()) } catch { /* ignora */ }
  }
}

function MicIcon() {
  return (
    <svg className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  )
}
