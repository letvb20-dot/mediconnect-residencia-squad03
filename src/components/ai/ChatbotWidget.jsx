import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { aiClient } from '../../lib/ai/aiClient.js'
import { runAssistant } from '../../lib/ai/agent/runAgent.js'
import { AUTH_SESSION_CHANGED_EVENT, getAuthSession } from '../../config/api.js'
import { canAccess, normalizeRole } from '../../config/permissions.js'
import { createSpeechRecognizer, isVoiceCaptureAvailable } from '../../lib/ai/speechRecognition.js'

const SESSION_KEY_PREFIX = 'mediconnect.chatbot.history.v1'
const ANON_SCOPE = 'anon'

// Ações rápidas exibidas como chips no chat, por perfil.
const QUICK_ACTIONS = {
  admin: [
    { label: 'Ver agenda', route: '/agenda' },
    { label: 'Pacientes', route: '/pacientes' },
    { label: 'Lista de espera', route: '/lista-espera' },
    { label: 'Relatórios', route: '/laudos' },
  ],
  gestor: [
    { label: 'Painel', route: '/inicio' },
    { label: 'Agenda', route: '/agenda' },
    { label: 'Analytics', route: '/relatorios' },
    { label: 'Lista de espera', route: '/lista-espera' },
  ],
  medico: [
    { label: 'Minha agenda', route: '/agenda' },
    { label: 'Pacientes', route: '/pacientes' },
    { label: 'Lista de espera', route: '/lista-espera' },
    { label: 'Relatórios', route: '/laudos' },
  ],
  secretaria: [
    { label: 'Cadastrar paciente', route: '/pacientes?new=1' },
    { label: 'Agenda', route: '/agenda' },
    { label: 'Pacientes', route: '/pacientes' },
    { label: 'Lista de espera', route: '/lista-espera' },
  ],
  paciente: [
    { label: 'Agendar consulta', route: '/agendamento' },
    { label: 'Meus laudos', route: '/laudos' },
    { label: 'Meu perfil', route: '/perfil' },
  ],
}

export function ChatbotWidget({ navigate, role }) {
  const normalizedRole = normalizeRole(role)
  const [userScope, setUserScope] = useState(() => resolveUserScope())
  const sessionKey = useMemo(() => `${SESSION_KEY_PREFIX}.${userScope}`, [userScope])

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(() => readHistory(sessionKey))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [agentStatus, setAgentStatus] = useState('')
  const scrollRef = useRef(null)

  // Reage a troca de usuário recarregando o histórico isolado por perfil.
  useEffect(() => {
    function handleSessionChange() {
      const nextScope = resolveUserScope()
      setUserScope((current) => (current === nextScope ? current : nextScope))
    }
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChange)
    return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChange)
  }, [])

  useEffect(() => {
    setMessages(readHistory(sessionKey))
  }, [sessionKey])

  useEffect(() => {
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(messages.slice(-30)))
    } catch {
      // ignora indisponibilidade de storage
    }
  }, [messages, sessionKey])

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open, loading])

  const quickActions = QUICK_ACTIONS[normalizedRole] || []

  const send = useCallback(async (overrideText) => {
    const trimmed = (overrideText ?? input).trim()
    if (!trimmed || loading) return

    const nextMessages = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')

    // Agente 100% function calling. Sem API key não há fallback de contexto estático.
    if (!aiClient.isLive()) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: 'Assistente de IA indisponível: configure a VITE_GEMINI_API_KEY no .env e reinicie o servidor.',
        },
      ])
      return
    }

    setLoading(true)
    try {
      // O modelo decide quais ferramentas chamar; nós executamos nos repositórios.
      // onStep alimenta o status ao vivo enquanto o loop roda.
      const reply = await runAssistant({
        messages: nextMessages,
        role,
        onStep: (step) => {
          if (step.kind === 'call') setAgentStatus(step.label)
        },
      })
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: reply.text, route: reply.route || '', steps: reply.steps || [] },
      ])
    } catch {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: 'Desculpe, não consegui responder agora. Tente novamente.' },
      ])
    } finally {
      setLoading(false)
      setAgentStatus('')
    }
  }, [input, loading, messages, role])

  const voiceAvailable = useMemo(() => isVoiceCaptureAvailable(), [])
  const [recording, setRecording] = useState(false)
  const recognizerRef = useRef(null)

  const toggleRecording = useCallback(() => {
    if (recording) {
      if (recognizerRef.current) {
        recognizerRef.current.stop()
      }
      setRecording(false)
    } else {
      const recognizer = createSpeechRecognizer()
      recognizerRef.current = recognizer
      recognizer.start({
        onStart: () => {
          setRecording(true)
        },
        onTranscript: (text) => {
          setRecording(false)
          if (text) {
            setInput((prev) => (prev ? prev + ' ' + text : text))
          }
        },
        onError: (err) => {
          setRecording(false)
          console.error('Erro de reconhecimento de voz:', err)
          alert('Não foi possível capturar sua voz ou transcrever o áudio.')
        }
      })
    }
  }, [recording])

  const handleNavigation = useCallback((route) => {
    const authorized = canAccess(role, route)
    if (!authorized) {
      alert('Você não tem permissão para acessar esta funcionalidade.')
      return
    }

    setOpen(false)
    navigate(route)
  }, [role, navigate])

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  function handleQuickAction(action) {
    handleNavigation(action.route)
  }

  return (
    <>
      {open ? (
        <div className="fixed bottom-24 right-4 z-50 flex h-[30rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-elevated">
          <div className="flex items-center justify-between border-b border-border-default-v2 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-text-heading">Assistente MediConnect</p>
              <p className="text-[11px] text-text-muted-v2">{aiClient.isLive() ? 'IA conectada' : 'Modo assistente'}</p>
            </div>
            <button
              aria-label="Fechar assistente"
              className="grid size-8 place-items-center rounded-lg text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-heading"
              onClick={() => setOpen(false)}
              type="button"
            >
              ✕
            </button>
          </div>

          {quickActions.length ? (
            <div className="border-b border-border-default-v2 px-3 py-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted-v2">
                Ações rápidas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quickActions.map((action) => (
                  <button
                    className="rounded-full border border-accent-primary/40 bg-accent-primary/10 px-2.5 py-1 text-xs font-semibold text-accent-primary transition hover:bg-accent-primary/20"
                    key={action.route}
                    onClick={() => handleQuickAction(action)}
                    type="button"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" ref={scrollRef}>
            {messages.length === 0 ? (
              <p className="text-sm leading-6 text-text-muted-v2">
                Olá! Posso ajudar com agenda, lista de espera, relatórios e navegação. Use os atalhos acima ou escreva sua dúvida.
              </p>
            ) : null}

            {messages.map((message, index) => (
              <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'bg-accent-primary text-white'
                      : 'border border-border-default-v2 bg-surface-inset text-text-body'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.steps?.length ? (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer select-none list-none text-[10px] text-text-muted-v2 opacity-50 transition-opacity duration-150 hover:!opacity-100">
                        Como cheguei nisso · {message.steps.length} {message.steps.length === 1 ? 'passo' : 'passos'}
                      </summary>
                      <ol className="mt-1 space-y-0.5 border-l border-border-default-v2 pl-2 text-[10px] text-text-muted-v2">
                        {message.steps.map((step, stepIndex) => (
                          <li key={stepIndex} className="leading-4">
                            {renderStep(step)}
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                  {message.route ? (
                    <button
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-accent-primary/10 px-2.5 py-1 text-xs font-semibold text-accent-primary transition hover:bg-accent-primary/20"
                      onClick={() => handleNavigation(message.route)}
                      type="button"
                    >
                      Abrir →
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

            {loading ? <p className="text-xs text-text-muted-v2">{agentStatus || 'Pensando...'}</p> : null}
          </div>

          <div className="flex items-end gap-2 border-t border-border-default-v2 p-3">
            <textarea
              className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-border-default-v2 bg-surface-inset px-3 py-2 text-sm text-text-body outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escreva sua pergunta..."
              rows={1}
              value={input}
            />
            {voiceAvailable ? (
              <button
                className={`grid size-10 shrink-0 place-items-center rounded-lg transition disabled:opacity-50 ${
                  recording
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-surface-inset border border-border-default-v2 text-text-muted-v2 hover:text-text-body'
                }`}
                disabled={loading}
                onClick={toggleRecording}
                type="button"
                aria-label={recording ? 'Parar gravação' : 'Gravar voz'}
              >
                {recording ? <MicOffIcon /> : <MicIcon />}
              </button>
            ) : null}
            <button
              className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-primary text-white transition hover:bg-accent-hover disabled:opacity-50"
              disabled={loading || !input.trim()}
              onClick={() => send()}
              type="button"
            >
              ➤
            </button>
          </div>
        </div>
      ) : null}

      <button
        aria-label="Abrir assistente"
        className="app-chatbot-toggle fixed bottom-5 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary text-white shadow-elevated transition hover:bg-accent-hover"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <ChatIcon />
      </button>
    </>
  )
}

// Renderiza um passo do trace do agente (raciocínio / chamada / resultado).
// Discreto, sem emoji — o tipo do passo é indicado por estilo/prefixo textual.
function renderStep(step) {
  if (step.kind === 'thought') {
    return <span className="italic">{step.text}</span>
  }
  if (step.kind === 'call') {
    const argsText = formatArgs(step.args)
    return (
      <span>
        <span className="text-text-body">{step.label || step.tool}</span>
        {argsText ? <span> — {argsText}</span> : null}
      </span>
    )
  }
  if (step.kind === 'result') {
    return <span>→ {step.summary}</span>
  }
  return null
}

// Transforma os argumentos da ferramenta em "chave: valor" legível.
function formatArgs(args) {
  if (!args || typeof args !== 'object') return ''
  const entries = Object.entries(args).filter(([, value]) => value !== undefined && value !== '')
  if (!entries.length) return 'sem filtros'
  return entries.map(([key, value]) => `${key}: ${value}`).join(', ')
}

function readHistory(key) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

function resolveUserScope() {
  if (typeof window === 'undefined') return ANON_SCOPE
  const session = getAuthSession()
  const user = session?.user || {}
  const profile = session?.profile || {}
  return (
    user.id ||
    user.email ||
    profile.id ||
    profile.email ||
    ANON_SCOPE
  )
}

function ChatIcon() {
  return (
    <svg className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  )
}

function MicOffIcon() {
  return (
    <svg className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 11v-1" />
      <path d="M9 9a3 3 0 0 0 3 3" />
      <path d="M17 10a3 3 0 0 0-3-3" />
      <path d="M5 10v1a7 7 0 0 0 10.84 5.84" />
      <path d="M12 18v4" />
      <path d="M8 22h8" />
      <path d="M10.39 4.39A3 3 0 0 1 12 4v0a3 3 0 0 1 3 3v2.61" />
    </svg>
  )
}
