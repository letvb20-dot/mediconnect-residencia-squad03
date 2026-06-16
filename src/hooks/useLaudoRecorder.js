import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { aiClient } from '../lib/ai/aiClient.js'

function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || ''
}

function stopRecorderInstance(recorder, stream) {
  if (recorder) {
    try { recorder.stop() } catch { /* ignora */ }
  }
  if (stream) {
    try { stream.getTracks().forEach((track) => track.stop()) } catch { /* ignora */ }
  }
}

/**
 * Hook para gravação de áudio + transcrição + geração de rascunho de laudo via IA.
 * Compartilhado entre a tela de Atendimento (ConsultaPage) e a aba Novo relatório
 * (ReportsPage editor).
 *
 * @param {object} options
 * @param {() => { patientName?: string, complaint?: string, exam?: string }} options.getReportContext
 *   Função que devolve o contexto usado para alimentar aiClient.generateReport
 *   (queixa, nome do paciente, exame). É uma função para que o hook leia o
 *   contexto mais recente no momento da gravação, sem precisar recriar o
 *   callback toda vez que o paciente muda.
 * @param {(draft: { exam, cidCode, diagnosis, conclusion, transcript }) => void} options.onDraftReady
 *   Chamado quando a IA termina de gerar o rascunho. O consumidor decide
 *   o que fazer (preencher campos, construir HTML, etc.).
 */
export function useLaudoRecorder({ getReportContext, onDraftReady }) {
  const [recordingState, setRecordingState] = useState('idle') // idle | recording | transcribing | ready | error
  const [recordingError, setRecordingError] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [transcript, setTranscript] = useState('')

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const tickerRef = useRef(0)

  // Mantém a função de contexto atualizada sem precisar recriar o callback
  const getReportContextRef = useRef(getReportContext)
  useEffect(() => { getReportContextRef.current = getReportContext }, [getReportContext])
  const onDraftReadyRef = useRef(onDraftReady)
  useEffect(() => { onDraftReadyRef.current = onDraftReady }, [onDraftReady])

  useEffect(() => () => {
    stopRecorderInstance(recorderRef.current, streamRef.current)
    if (tickerRef.current) {
      window.clearInterval(tickerRef.current)
      tickerRef.current = 0
    }
  }, [])

  const recordingSupported = useMemo(
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.MediaRecorder) &&
      Boolean(navigator?.mediaDevices?.getUserMedia) &&
      aiClient.isLive(),
    [],
  )

  const startRecording = useCallback(async () => {
    if (!recordingSupported) {
      setRecordingError(
        !aiClient.isLive()
          ? 'Gravação indisponível: a chave VITE_GEMINI_API_KEY não está configurada no .env. Sem ela a IA não consegue transcrever o áudio.'
          : 'Este navegador não suporta gravação de áudio. Tente em uma versão recente do Chrome, Edge ou Firefox.',
      )
      return
    }
    setRecordingError('')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (mediaError) {
      let message
      if (mediaError?.name === 'NotAllowedError') {
        message = 'Permissão de microfone negada pelo navegador. Libere o acesso ao microfone nas configurações do site e tente de novo.'
      } else if (mediaError?.name === 'NotFoundError') {
        message = 'Nenhum microfone foi encontrado neste computador. Conecte um dispositivo de áudio e tente novamente.'
      } else if (mediaError?.name === 'NotReadableError') {
        message = 'O microfone está sendo usado por outro programa. Feche o aplicativo que está com ele aberto e tente novamente.'
      } else {
        message = `Não foi possível acessar o microfone: ${mediaError?.message || 'erro desconhecido do navegador'}.`
      }
      setRecordingError(message)
      return
    }

    const mimeType = pickRecorderMimeType()
    let recorder
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    } catch (recorderError) {
      stream.getTracks().forEach((track) => track.stop())
      setRecordingError(`Não foi possível iniciar o gravador de áudio do navegador: ${recorderError?.message || 'erro desconhecido'}.`)
      return
    }

    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstart = () => {
      startedAtRef.current = Date.now()
      setElapsedMs(0)
      if (tickerRef.current) window.clearInterval(tickerRef.current)
      tickerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current)
      }, 500)
      setRecordingState('recording')
    }
    recorder.onerror = (event) => {
      setRecordingError(`Falha durante a gravação do áudio: ${event?.error?.message || 'erro desconhecido do gravador'}.`)
    }
    recorder.onstop = async () => {
      if (tickerRef.current) {
        window.clearInterval(tickerRef.current)
        tickerRef.current = 0
      }
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      recorderRef.current = null

      const chunks = chunksRef.current
      chunksRef.current = []
      if (!chunks.length) {
        setRecordingState('idle')
        return
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
      setRecordingState('transcribing')

      let text
      try {
        text = await aiClient.transcribeLongAudio({ blob, mimeType: blob.type })
      } catch (transcribeError) {
        setRecordingError(`Etapa de transcrição falhou. ${transcribeError?.message || 'A IA não conseguiu converter o áudio em texto.'}`)
        setRecordingState('error')
        return
      }

      setTranscript(text || '')

      const ctx = getReportContextRef.current?.() || {}
      let draft
      try {
        draft = await aiClient.generateReport({
          patientName: ctx.patientName || '',
          complaint: text || ctx.complaint || '',
          exam: ctx.exam || 'Consulta',
        })
      } catch (draftError) {
        setRecordingError(`O áudio foi transcrito, mas o rascunho do laudo falhou. ${draftError?.message || 'A IA não conseguiu gerar o rascunho.'}`)
        setRecordingState('error')
        return
      }

      const resolvedDraft = {
        exam: draft?.exam || ctx.exam || 'Consulta',
        cidCode: draft?.cidCode || '',
        diagnosis: draft?.diagnosis || '',
        conclusion: draft?.conclusion || '',
        transcript: text,
      }
      try {
        onDraftReadyRef.current?.(resolvedDraft)
      } catch (callbackError) {
        // Falha no callback do consumidor não derruba o estado da gravação
        console.warn('useLaudoRecorder onDraftReady error:', callbackError)
      }
      setRecordingState('ready')
    }

    streamRef.current = stream
    recorderRef.current = recorder
    try {
      recorder.start()
    } catch (startError) {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      recorderRef.current = null
      setRecordingError(`Não foi possível iniciar a gravação: ${startError?.message || 'erro desconhecido do navegador'}.`)
    }
  }, [recordingSupported])

  const stopRecording = useCallback(() => {
    if (recorderRef.current) {
      try { recorderRef.current.stop() } catch { /* ignora */ }
    }
  }, [])

  const resetRecording = useCallback(() => {
    setRecordingState('idle')
    setRecordingError('')
    setTranscript('')
    setElapsedMs(0)
  }, [])

  return {
    recordingState,
    recordingError,
    elapsedMs,
    transcript,
    recordingSupported,
    startRecording,
    stopRecording,
    resetRecording,
  }
}
