import { useEffect, useMemo, useState } from 'react'

import { visitRepository } from '../repositories/visitRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'

const tabs = [
  { label: 'Fila ativa', value: 'ativa' },
  { label: 'Em atendimento', value: 'atendimento' },
  { label: 'Finalizadas', value: 'finalizadas' },
]

const cardClass = 'rounded-2xl border border-[#404040] bg-[#262626] shadow-sm'

export function VisitsPage({ navigate }) {
  const stages = useMemo(() => visitRepository.getStages(), [])
  const [careQueue, setCareQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('ativa')

  useEffect(() => {
    let active = true

    visitRepository
      .getCareQueue()
      .then((data) => {
        if (active) setCareQueue(data || [])
      })
      .catch((loadError) => {
        if (active) setError(translateErrorMessage(loadError.message, 'Erro ao carregar consultas.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const visibleQueue = useMemo(() => {
    if (activeTab === 'finalizadas') {
      return careQueue.filter((item) => isFinalizedStatus(item.status))
    }

    if (activeTab === 'atendimento') {
      return careQueue.filter((item) => !isFinalizedStatus(item.status) && !isWaitingDoctorStatus(item.status))
    }

    return careQueue.filter((item) => !isFinalizedStatus(item.status))
  }, [activeTab, careQueue])

  const summary = [
    { label: 'Na fila', value: careQueue.filter((item) => !isFinalizedStatus(item.status)).length, tone: 'text-[#3b82f6]' },
    { label: 'Alta prioridade', value: careQueue.filter((item) => item.priority === 'Alta').length, tone: 'text-red-400' },
    { label: 'Finalizadas', value: careQueue.filter((item) => isFinalizedStatus(item.status)).length, tone: 'text-emerald-400' },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#f5f5f5]">Consultas</h1>
          <p className="mt-1 text-sm text-[#b8b8b8]">Fila de atendimento derivada dos agendamentos da API.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="h-10 rounded-sm border border-[#404040] bg-[#262626] px-4 text-sm font-semibold text-[#e5e5e5] transition hover:bg-[#303030]"
            onClick={() => navigate('/agenda')}
            type="button"
          >
            Abrir agenda
          </button>
          <button
            className="h-10 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
            onClick={() => navigate('/prontuario')}
            type="button"
          >
            Novo registro
          </button>
        </div>
      </header>

      {loading ? (
        <p className={`${cardClass} p-8 text-center text-sm text-[#a3a3a3]`}>Carregando consultas...</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!loading && !error ? <section className="grid gap-4 md:grid-cols-3" aria-label="Resumo da fila">
        {summary.map((item) => (
          <article className={`${cardClass} p-5`} key={item.label}>
            <p className="text-sm text-[#a3a3a3]">{item.label}</p>
            <p className={`mt-2 text-3xl font-bold leading-none ${item.tone}`}>{item.value}</p>
          </article>
        ))}
      </section> : null}

      {!loading && !error ? <section className={`${cardClass} p-5`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2 rounded-sm border border-[#404040] bg-[#171717] p-1">
            {tabs.map((tab) => (
              <button
                className={`h-9 rounded-sm px-3 text-sm font-semibold transition ${
                  activeTab === tab.value ? 'bg-[#3b82f6] text-white' : 'text-[#b8b8b8] hover:bg-[#303030] hover:text-[#e5e5e5]'
                }`}
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-[#a3a3a3]">{visibleQueue.length} registros no filtro atual</p>
        </div>

        <div className="mt-5 grid gap-3">
          {visibleQueue.map((item) => (
            <article
              className="grid gap-4 rounded-xl border border-[#404040] bg-[#171717] p-4 lg:grid-cols-[1fr_180px_160px_auto]"
              key={item.id}
            >
              <div>
                <button
                  className="text-left text-lg font-bold text-[#f5f5f5] transition hover:text-[#3b82f6]"
                  onClick={() => navigate(`/pacientes/${item.patientId}`)}
                  type="button"
                >
                  {item.patient}
                </button>
                <p className="mt-1 text-sm text-[#a3a3a3]">{item.reason}</p>
              </div>
              <Info label="Status" value={item.status} />
              <Info label="Espera" value={item.wait} />
              <div className="flex items-start lg:justify-end">
                <PriorityPill priority={item.priority} />
              </div>
            </article>
          ))}

          {visibleQueue.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#404040] bg-[#171717] p-8 text-center">
              <h2 className="text-lg font-bold text-[#f5f5f5]">Fila vazia</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#a3a3a3]">
                Nenhuma consulta encontrada neste estado.
              </p>
            </div>
          ) : null}
        </div>
      </section> : null}

      {!loading && !error ? <section className="grid gap-6 lg:grid-cols-3">
        {stages.map((stage, index) => (
          <article className={`${cardClass} p-5`} key={stage.title}>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#3b82f6]">Etapa {index + 1}</p>
            <h2 className="mt-2 text-xl font-bold text-[#f5f5f5]">{stage.title}</h2>
            <p className="mt-3 text-sm leading-6 text-[#a3a3a3]">{stage.description}</p>
          </article>
        ))}
      </section> : null}
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#737373]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[#e5e5e5]">{value}</p>
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

function isFinalizedStatus(status) {
  return normalizeStatus(status) === 'finalizada'
}

function isWaitingDoctorStatus(status) {
  return normalizeStatus(status) === 'aguardando_medico'
}

function normalizeStatus(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
