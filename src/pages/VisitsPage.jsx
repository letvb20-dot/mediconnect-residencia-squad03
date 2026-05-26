import { useEffect, useMemo, useState } from 'react'

import {
  CONSULTATION_QUEUE_CHANGED_EVENT,
  isFinalizedQueueItem,
  visitRepository,
} from '../repositories/visitRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'

const tabs = [
  { label: 'Fila ativa', value: 'ativa' },
  { label: 'Alta prioridade', value: 'prioridade' },
  { label: 'Finalizadas', value: 'finalizadas' },
]

const cardClass = 'rounded-2xl border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-sm'

export function VisitsPage({ navigate }) {
  const stages = useMemo(() => visitRepository.getStages(), [])
  const [careQueue, setCareQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('ativa')

  useEffect(() => {
    let active = true

    async function loadQueue() {
      try {
        setError('')
        const data = await visitRepository.getCareQueue()
        if (active) setCareQueue(data || [])
      } catch (loadError) {
        if (active) setError(translateErrorMessage(loadError.message, 'Erro ao carregar fila de consultas.'))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadQueue()
    window.addEventListener(CONSULTATION_QUEUE_CHANGED_EVENT, loadQueue)
    window.addEventListener('storage', loadQueue)

    return () => {
      active = false
      window.removeEventListener(CONSULTATION_QUEUE_CHANGED_EVENT, loadQueue)
      window.removeEventListener('storage', loadQueue)
    }
  }, [])

  const activeQueue = useMemo(() => careQueue.filter((item) => !isFinalizedQueueItem(item)), [careQueue])
  const highPriorityQueue = useMemo(() => activeQueue.filter((item) => item.priority === 'Alta'), [activeQueue])
  const finalizedQueue = useMemo(() => careQueue.filter((item) => isFinalizedQueueItem(item)), [careQueue])

  const visibleQueue = useMemo(() => {
    if (activeTab === 'finalizadas') return finalizedQueue
    if (activeTab === 'prioridade') return highPriorityQueue
    return activeQueue
  }, [activeQueue, activeTab, finalizedQueue, highPriorityQueue])

  const summary = [
    { label: 'Na fila', value: activeQueue.length, tone: 'text-[#3b82f6]', tab: 'ativa' },
    { label: 'Alta prioridade', value: highPriorityQueue.length, tone: 'text-red-400', tab: 'prioridade' },
    { label: 'Finalizadas', value: finalizedQueue.length, tone: 'text-emerald-400', tab: 'finalizadas' },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight text-[var(--text-primary)]">Fila de Consultas</h1>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <button
            className="min-h-10 shrink-0 rounded-sm border border-[var(--border-default)] bg-[var(--surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:brightness-110"
            onClick={() => navigate('/agenda')}
            type="button"
          >
            Abrir agenda
          </button>
        </div>
      </header>

      {loading ? (
        <p className={`${cardClass} p-8 text-center text-sm text-text-muted-v2`}>Carregando fila de consultas...</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <section className="grid gap-4 md:grid-cols-3" aria-label="Resumo da fila">
          {summary.map((item) => (
            <button
              aria-pressed={activeTab === item.tab}
              className={`${cardClass} p-5 text-left transition hover:border-[#3b82f6]/60 hover:brightness-110 ${
                activeTab === item.tab ? 'ring-2 ring-[#3b82f6]/40' : ''
              }`}
              key={item.label}
              onClick={() => setActiveTab(item.tab)}
              type="button"
            >
              <span className="block text-sm text-text-muted-v2">{item.label}</span>
              <span className={`mt-2 block text-3xl font-bold leading-none ${item.tone}`}>{item.value}</span>
            </button>
          ))}
        </section>
      ) : null}

      {!loading && !error ? (
        <section className={`${cardClass} p-5`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2 rounded-sm border border-[var(--border-default)] bg-[var(--surface-elevated)] p-1">
              {tabs.map((tab) => (
                <button
                  className={`min-h-9 shrink-0 rounded-sm px-3 py-1.5 text-sm font-semibold transition ${
                    activeTab === tab.value ? 'bg-[#3b82f6] text-white' : 'text-[var(--text-muted)] hover:brightness-110'
                  }`}
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-[var(--text-muted)]">{visibleQueue.length} registros no filtro atual</p>
          </div>

          <div className="mt-5 grid gap-3">
            {visibleQueue.map((item) => (
              <article
                className="grid gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] xl:items-center"
                key={item.id}
              >
                <div className="min-w-0">
                  <button
                    className="block w-full truncate text-left text-lg font-bold text-[var(--text-primary)] transition hover:text-[#3b82f6]"
                    onClick={() => navigate(`/pacientes/${item.patientId}`)}
                    type="button"
                  >
                    {item.patient}
                  </button>
                  <p className="mt-1 truncate text-sm text-[var(--text-muted)]">{item.reason}</p>
                </div>
                <div className="shrink-0">
                  <Info label="Horário" value={formatQueueSchedule(item)} />
                </div>
                <div className="shrink-0">
                  <Info label="Médico" value={item.professional} />
                </div>
                <div className="shrink-0">
                  <Info label="Status" value={item.status} />
                </div>
                <div className="flex shrink-0 flex-wrap items-start gap-2 xl:justify-end">
                  <PriorityPill priority={item.priority} />
                </div>
              </article>
            ))}

            {visibleQueue.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-default-v2 bg-surface-inset p-8 text-center">
                <h2 className="text-lg font-bold text-text-heading">Fila vazia</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted-v2">
                  Nenhuma consulta encontrada neste filtro.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="grid gap-6 lg:grid-cols-3">
          {stages.map((stage, index) => (
            <article className={`${cardClass} p-5`} key={stage.title}>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#3b82f6]">Etapa {index + 1}</p>
              <h2 className="mt-2 text-xl font-bold text-text-heading">{stage.title}</h2>
              <p className="mt-3 text-sm leading-6 text-text-muted-v2">{stage.description}</p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-bold uppercase tracking-[0.16em] text-text-muted-v2">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  )
}

function PriorityPill({ priority }) {
  const className =
    priority === 'Alta'
      ? 'bg-red-500/20 text-red-400'
      : priority === 'Baixa'
        ? 'bg-emerald-500/20 text-emerald-400'
        : 'bg-amber-500/20 text-amber-400'

  return <span className={`rounded px-2.5 py-1 text-xs font-bold ${className}`}>{priority}</span>
}

function formatQueueSchedule(item) {
  const date = formatDate(item.date)
  return [date, item.time].filter(Boolean).join(' às ') || 'Horário não informado'
}

function formatDate(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}
