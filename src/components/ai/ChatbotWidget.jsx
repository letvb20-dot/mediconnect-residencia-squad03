import { useCallback, useEffect, useRef, useState } from 'react'

import { aiClient } from '../../lib/ai/aiClient.js'
import { normalizeRole } from '../../config/permissions.js'
import { appointmentRepository } from '../../repositories/appointmentRepository.js'
import { profileRepository } from '../../repositories/profileRepository.js'
import { waitlistRepository } from '../../repositories/waitlistRepository.js'
import { isCancelledStatus } from '../../utils/appointmentMetrics.js'

const SESSION_KEY = 'mediconnect.chatbot.history.v1'

export function ChatbotWidget({ navigate, role }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(() => readHistory())
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages.slice(-30)))
    } catch {
      // ignora indisponibilidade de storage
    }
  }, [messages])

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open, loading])

  const send = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const nextMessages = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const data = await buildContext(role)
      const reply = await aiClient.chat({ messages: nextMessages, role, data })
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: reply.text, route: reply.route || '' },
      ])
    } catch {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: 'Desculpe, não consegui responder agora. Tente novamente.' },
      ])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, role])

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return (
    <>
      {open ? (
        <div className="fixed bottom-24 right-4 z-50 flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-elevated">
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

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" ref={scrollRef}>
            {messages.length === 0 ? (
              <p className="text-sm leading-6 text-text-muted-v2">
                Olá! Posso ajudar com agenda, lista de espera, relatórios e navegação. O que você precisa?
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
                  {message.route ? (
                    <button
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-accent-primary/10 px-2.5 py-1 text-xs font-semibold text-accent-primary transition hover:bg-accent-primary/20"
                      onClick={() => {
                        setOpen(false)
                        navigate(message.route)
                      }}
                      type="button"
                    >
                      Abrir →
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

            {loading ? <p className="text-xs text-text-muted-v2">Pensando...</p> : null}
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
            <button
              className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-primary text-white transition hover:bg-accent-hover disabled:opacity-50"
              disabled={loading || !input.trim()}
              onClick={send}
              type="button"
            >
              ➤
            </button>
          </div>
        </div>
      ) : null}

      <button
        aria-label="Abrir assistente"
        className="fixed bottom-5 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary text-white shadow-elevated transition hover:bg-accent-hover"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <ChatIcon />
      </button>
    </>
  )
}

async function buildContext(role) {
  const normalizedRole = normalizeRole(role)
  const data = {}

  let doctorId = ''
  if (normalizedRole === 'medico') {
    const profile = await profileRepository.getCurrentUserProfile().catch(() => null)
    doctorId = profile?.doctorId || ''
  }

  const appointments = await appointmentRepository
    .getAll(doctorId ? { doctorId } : {})
    .catch(() => [])

  const today = formatToday()
  data.appointmentsTotal = appointments.length
  data.appointmentsToday = appointments.filter((appointment) => appointment.date === today && !isCancelledStatus(appointment.status)).length

  const cancelled = appointments.filter((appointment) => isCancelledStatus(appointment.status)).length
  data.cancelRate = appointments.length ? Math.round((cancelled / appointments.length) * 1000) / 10 : 0

  const waitlist = waitlistRepository.getAll()
  data.waitlistCount = waitlist.filter((entry) => entry.status === 'aguardando').length

  return data
}

function readHistory() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

function formatToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function ChatIcon() {
  return (
    <svg className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
