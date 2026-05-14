import { useEffect, useState } from 'react'

import loginClinicImage from '../assets/figma/login-clinic.png'
import { hasCapability } from '../config/permissions.js'
import { homeRepository } from '../repositories/homeRepository.js'
import { UsersPage } from './UsersPage.jsx'

export function HomePage({ navigate, profile, role, user }) {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true

    homeRepository
      .getDashboardOverview({ profile, role, user })
      .then((data) => {
        if (active) setOverview(data)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Erro ao carregar painel.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [profile, role, user])

  if (loading) {
    return <p className="p-8 text-center text-sm text-[#a3a3a3]">Carregando painel...</p>
  }

  const { appointmentsToday = [], metrics = [], predictiveAlert = '', reportCards = [] } = overview || {}
  const displayName = getDisplayName(profile, user)
  const canManageUsers = hasCapability(role, 'manageUsers')

  return (
    <div className={`mx-auto w-full text-[#e5e5e5] ${canManageUsers ? 'grid max-w-none gap-8 2xl:grid-cols-[minmax(0,1fr)_560px]' : 'flex max-w-[1180px] flex-col gap-8'}`}>
      <div className="min-w-0 space-y-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[32px] font-bold leading-8 tracking-[-0.02em] text-[#e5e5e5]">
            Visão Geral da Clínica
          </h1>
          <p className="mt-2 text-sm leading-5 text-[#a3a3a3]">
            Bem-vindo, {displayName}. Aqui está o resumo da sua clínica hoje.
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.7fr_0.9fr]">
        <div className="rounded-2xl border border-[#404040] bg-[#262626] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-md bg-[#3b82f6] text-white">
                <SparkLineIcon className="size-6" />
              </div>
              <div>
                <h2 className="text-base font-bold leading-6 text-[#3b82f6]">Insights da agenda</h2>
                <p className="mt-1 text-sm font-medium leading-5 text-[#a3a3a3]">
                  Indicadores calculados a partir dos agendamentos reais
                </p>
              </div>
            </div>
            <span className="grid size-8 place-items-center rounded-full bg-[#2a2a2a] text-[#a3a3a3]">
              <ChevronRightIcon className="size-5" />
            </span>
          </div>

          <div className="mt-6 h-[260px] rounded-lg bg-[#1f1f1f] px-4 py-5">
            <LineChart />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl border border-[#404040] bg-[#262626] p-5">
            <h2 className="text-base font-bold text-[#e5e5e5]">Pacientes de hoje</h2>
            <div className="mt-4 grid gap-3">
              {appointmentsToday.length ? appointmentsToday.map((item) => (
                <button
                  className="flex items-center justify-between gap-4 rounded-md bg-[#2a2a2a] px-4 py-3 text-left transition hover:bg-[#303030]"
                  key={`${item.time}-${item.name}`}
                  onClick={() => item.patientId && navigate(`/pacientes/${item.patientId}`)}
                  type="button"
                >
                  <span>
                    <span className="block text-sm font-semibold text-[#e5e5e5]">{item.name}</span>
                    <span className="mt-1 block text-xs text-[#a3a3a3]">{item.status}</span>
                  </span>
                  <span className="text-sm font-bold text-[#3b82f6]">{item.time}</span>
                </button>
              )) : (
                <p className="rounded-md bg-[#2a2a2a] px-4 py-3 text-sm text-[#a3a3a3]">
                  Nenhum paciente agendado para hoje.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#404040] bg-[#262626] p-5">
            <h2 className="text-base font-bold text-[#e5e5e5]">Alerta preditivo</h2>
            <p className="mt-3 text-sm leading-6 text-[#a3a3a3]">
              {predictiveAlert}
            </p>
            <button
              className="mt-5 h-9 rounded-sm border border-[#404040] bg-[#303030] px-4 text-sm font-semibold text-[#e5e5e5] transition hover:border-[#3b82f6] hover:text-[#3b82f6]"
              onClick={() => navigate('/mensagens')}
              type="button"
            >
              Abrir comunicação
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4" id="relatorios">
        <h2 className="text-base font-bold text-[#e5e5e5]">Analytics</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <button
            className="relative min-h-[164px] overflow-hidden rounded-2xl border border-[#3b82f6] bg-[#262626] p-5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
            onClick={() => navigate('/relatorios')}
            type="button"
          >
            <img alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" src={loginClinicImage} />
            <span className="absolute inset-0 bg-[#0a1628]/60" aria-hidden="true" />
            <span className="relative flex items-start gap-4">
              <span className="grid size-12 place-items-center rounded-md bg-[#3b82f6] text-white">
                <SparkLineIcon className="size-6" />
              </span>
              <span>
                <span className="block text-base font-bold text-[#3b82f6]">Evolução do Absenteísmo</span>
                <span className="mt-1 block text-sm font-medium text-[#d4d4d4]">
                  Taxa de faltas calculada a partir da agenda
                </span>
              </span>
            </span>
          </button>

          <div className="grid gap-4">
            {reportCards.slice(0, 2).map((card) => (
              <ReportAction key={card.title} card={card} navigate={navigate} />
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {reportCards.slice(2).map((card) => (
            <ReportAction key={card.title} card={card} navigate={navigate} />
          ))}
        </div>
      </section>
      </div>
      {canManageUsers ? (
        <aside className="min-w-0 self-start 2xl:sticky 2xl:top-6 2xl:pt-[104px]">
          <UsersPage embedded navigate={navigate} role={role} />
        </aside>
      ) : null}
    </div>
  )
}

function MetricCard({ metric }) {
  return (
    <article
      className={`rounded-2xl border bg-[#262626] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.2)] ${
        metric.tone === 'violet' ? 'border-[#5b4b75]' : 'border-[#404040]'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium leading-5 text-[#a3a3a3]">{metric.label}</p>
          <p className="mt-3 text-[32px] font-bold leading-8 text-[#e5e5e5]">{metric.value}</p>
        </div>
        <span className={`metric-tone-icon grid size-9 place-items-center rounded-md ${metricTone(metric.tone)}`}>
          <SparkLineIcon className="size-5" />
        </span>
      </div>
      <p className="mt-4 text-sm font-semibold text-[#10b981]">{metric.change}</p>
    </article>
  )
}

function ReportAction({ card, navigate }) {
  return (
    <button
      className="flex min-h-[90px] items-center justify-between gap-4 rounded-2xl border border-[#404040] bg-[#262626] px-5 py-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition hover:border-[#3b82f6]"
      onClick={() => navigate(card.icon === 'calendar' ? '/agenda' : card.icon === 'users' ? '/pacientes' : '/relatorios')}
      type="button"
    >
      <span className="flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-md bg-[#2a2a2a] text-[#3b82f6]">
          <ReportIcon className="size-6" name={card.icon} />
        </span>
        <span>
          <span className="block text-base font-bold leading-6 text-[#e5e5e5]">{card.title}</span>
          <span className="mt-0.5 block text-sm font-medium leading-5 text-[#a3a3a3]">{card.description}</span>
        </span>
      </span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#2a2a2a] text-[#a3a3a3]">
        <ChevronRightIcon className="size-5" />
      </span>
    </button>
  )
}

function LineChart() {
  return (
    <svg aria-label="Indicador visual de absenteísmo" className="h-full w-full" role="img" viewBox="0 0 732 260">
      <defs>
        <linearGradient id="home-chart-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[48, 112, 176, 232].map((y) => (
        <line key={y} stroke="#1d4ed8" strokeDasharray="3 5" strokeOpacity="0.45" x1="40" x2="710" y1={y} y2={y} />
      ))}
      <path
        d="M40 128 C120 78 164 112 220 108 C290 104 302 34 360 34 C425 34 418 134 482 156 C560 182 610 154 710 188"
        fill="none"
        stroke="#3b82f6"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path
        d="M40 128 C120 78 164 112 220 108 C290 104 302 34 360 34 C425 34 418 134 482 156 C560 182 610 154 710 188 L710 244 L40 244 Z"
        fill="url(#home-chart-fill)"
      />
    </svg>
  )
}

function metricTone(tone) {
  if (tone === 'violet') return 'metric-tone-violet'
  if (tone === 'green') return 'metric-tone-green'
  return 'metric-tone-blue'
}

function getDisplayName(profile, user) {
  return profile?.full_name || profile?.name || user?.user_metadata?.full_name || user?.email || 'usuário'
}

function ReportIcon({ className = 'size-6', name }) {
  if (name === 'users') {
    return (
      <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M16 19a4 4 0 0 0-8 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 19a3 3 0 0 0-3-3M4 19a3 3 0 0 1 3-3" />
      </svg>
    )
  }

  if (name === 'building') {
    return (
      <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M4 21V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v16M8 8h1M8 12h1M8 16h1M15 8h1M15 12h1M15 16h1M3 21h18" />
      </svg>
    )
  }

  if (name === 'brand') {
    return (
      <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M6 4H5a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V6a2 2 0 0 0-2-2h-1M3 9a6 6 0 0 0 12 0V4M18 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
      </svg>
    )
  }

  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

function SparkLineIcon({ className = 'size-6' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M4 17 9 11l4 4 7-9" />
      <path d="M15 6h5v5" />
    </svg>
  )
}

function ChevronRightIcon({ className = 'size-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
