import { useCallback, useEffect, useRef, useState } from 'react'

import { normalizeFieldValue } from '../../lib/ai/fieldNormalizer.js'
import { createSpeechRecognizer } from '../../lib/ai/speechRecognition.js'

/**
 * Painel fixo no rodapé que conduz a secretária por uma sequência de campos.
 * - destaca/foca o campo atual no formulário (via document.querySelector pelo name)
 * - inicia o reconhecimento de voz automaticamente
 * - Enter (ou botão "Próximo") finaliza a captura, normaliza e avança
 * - Esc cancela
 *
 * Props:
 *  - fields: array de { name, label, type, options?, help? }
 *  - onFieldFilled(name, value): chamado a cada campo com o valor pronto
 *  - onFinish(): chamado quando termina o último campo
 *  - onCancel(): chamado quando a secretária cancela
 */
export function GuidedVoiceFlow({ fields = [], onFieldFilled, onFinish, onCancel }) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState('idle') // idle | listening | processing | error
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [backend, setBackend] = useState('')

  const recognizerRef = useRef(null)
  const finalizingRef = useRef(false)
  const transcriptRef = useRef('')
  const phaseRef = useRef('idle')

  // Mantém um espelho síncrono do phase pra checagens em callbacks.
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const currentField = fields[index] || null
  const isLastField = index >= fields.length - 1

  // Foca/scrolla o input do campo atual.
  useEffect(() => {
    if (!currentField) return
    const element = findInputForField(currentField.name)
    if (element) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' })
      try { element.focus({ preventScroll: true }) } catch { element.focus?.() }
    }
  }, [currentField])

  const processAndAdvance = useCallback(async (text) => {
    if (!currentField) return
    setPhase('processing')
    try {
      const normalized = await normalizeFieldValue({ transcript: text, field: currentField })
      onFieldFilled?.(currentField.name, normalized)
    } catch (err) {
      setError(err?.message || 'Erro ao processar valor.')
      setPhase('error')
      return
    }
    if (isLastField) {
      setPhase('idle')
      onFinish?.()
      return
    }
    setIndex((current) => current + 1)
  }, [currentField, isLastField, onFieldFilled, onFinish])

  const startListening = useCallback(() => {
    if (!currentField) return

    setError('')
    setTranscript('')
    transcriptRef.current = ''
    finalizingRef.current = false
    setPhase('listening')

    const recognizer = createSpeechRecognizer()
    recognizerRef.current = recognizer
    setBackend(recognizer.backend)

    recognizer.start({
      onTranscript: (text) => {
        transcriptRef.current = text
        setTranscript(text)
        if (finalizingRef.current) {
          finalizingRef.current = false
          processAndAdvance(text)
        }
      },
      onError: (code) => {
        setError(translateRecognizerError(code))
        setPhase('error')
      },
    })
  }, [currentField, processAndAdvance])

  // Inicia o reconhecimento sempre que muda de campo (depois de avançar).
  useEffect(() => {
    if (!currentField) return undefined
    startListening()
    return () => {
      if (recognizerRef.current) {
        try { recognizerRef.current.abort() } catch { /* ignora */ }
        recognizerRef.current = null
      }
    }
  }, [currentField, startListening])

  const finalizeCurrent = useCallback(() => {
    if (phaseRef.current === 'processing') return
    if (phaseRef.current === 'error') {
      // Permite retry imediato.
      startListening()
      return
    }
    const recognizer = recognizerRef.current
    if (recognizer && phaseRef.current === 'listening') {
      finalizingRef.current = true
      try { recognizer.stop() } catch { /* ignora */ }
    } else {
      // Sem recognizer ativo — usa transcript já capturado.
      processAndAdvance(transcriptRef.current)
    }
  }, [processAndAdvance, startListening])

  const cancelFlow = useCallback(() => {
    if (recognizerRef.current) {
      try { recognizerRef.current.abort() } catch { /* ignora */ }
      recognizerRef.current = null
    }
    onCancel?.()
  }, [onCancel])

  const skipCurrent = useCallback(() => {
    if (recognizerRef.current) {
      try { recognizerRef.current.abort() } catch { /* ignora */ }
      recognizerRef.current = null
    }
    if (isLastField) {
      onFinish?.()
      return
    }
    setIndex((current) => current + 1)
  }, [isLastField, onFinish])

  // Atalho global: Enter avança, Esc cancela.
  useEffect(() => {
    function handleKeyDown(event) {
      // Ignora se o foco estiver num textarea (Enter quebra linha) ou em algum modal acima.
      const target = event.target
      const isTextarea = target instanceof HTMLTextAreaElement
      if (event.key === 'Enter' && !event.shiftKey && !isTextarea) {
        event.preventDefault()
        finalizeCurrent()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        cancelFlow()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cancelFlow, finalizeCurrent])

  if (!currentField) return null

  const progress = `${index + 1} / ${fields.length}`

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default-v2 bg-surface-card/95 shadow-elevated backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted-v2">
              Modo guiado · {progress}
            </p>
            <p className="truncate text-base font-bold text-text-heading">{currentField.label}</p>
            {currentField.help ? (
              <p className="mt-0.5 text-xs text-text-muted-v2">{currentField.help}</p>
            ) : null}
          </div>
          <button
            className="rounded-lg border border-border-default-v2 px-3 py-1.5 text-xs font-semibold text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-heading"
            onClick={cancelFlow}
            type="button"
          >
            Cancelar (Esc)
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border-default-v2 bg-surface-inset px-4 py-3">
          <MicIndicator phase={phase} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-muted-v2">
              {phase === 'listening'
                ? 'Gravando... fale o valor e pressione Enter para avançar.'
                : phase === 'processing'
                  ? 'Processando...'
                  : phase === 'error'
                    ? error || 'Erro no reconhecimento.'
                    : 'Aguardando...'}
              {backend === 'gemini' && phase === 'listening' ? ' (via Gemini)' : null}
            </p>
            <p className="truncate text-sm font-semibold text-text-heading">
              {transcript || <span className="text-text-muted-v2">—</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {phase === 'error' ? (
            <button
              className="rounded-lg border border-border-default-v2 px-4 py-2 text-sm font-semibold text-text-heading transition hover:bg-surface-card-hover"
              onClick={startListening}
              type="button"
            >
              Tentar de novo
            </button>
          ) : null}
          <button
            className="rounded-lg border border-border-default-v2 px-4 py-2 text-sm font-semibold text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-heading"
            onClick={skipCurrent}
            type="button"
          >
            Pular
          </button>
          <button
            className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50"
            disabled={phase === 'processing'}
            onClick={finalizeCurrent}
            type="button"
          >
            {isLastField ? 'Revisar e salvar (Enter)' : 'Próximo (Enter)'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MicIndicator({ phase }) {
  const isRecording = phase === 'listening'
  const isBusy = phase === 'processing'

  return (
    <div
      className={`grid size-10 shrink-0 place-items-center rounded-full ${
        isRecording
          ? 'animate-pulse bg-red-500 text-white'
          : isBusy
            ? 'bg-accent-primary/20 text-accent-primary'
            : 'bg-surface-card text-text-muted-v2'
      }`}
    >
      <svg className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
        <path d="M9 21h6" />
      </svg>
    </div>
  )
}

function findInputForField(name) {
  if (typeof document === 'undefined') return null
  return document.querySelector(
    `input[name="${name}"], select[name="${name}"], textarea[name="${name}"]`,
  )
}

function translateRecognizerError(code) {
  if (code === 'not-allowed') return 'Permissão de microfone negada pelo navegador.'
  if (code === 'no-speech') return 'Não detectei fala. Tente novamente.'
  if (code === 'audio-capture') return 'Microfone indisponível.'
  if (code === 'network') return 'Falha de rede no reconhecimento. Vou tentar via Gemini.'
  if (code === 'service-not-allowed') return 'Serviço de voz bloqueado. Vou tentar via Gemini.'
  return `Erro: ${code}`
}
