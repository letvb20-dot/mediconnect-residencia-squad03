import { useEffect, useState } from 'react'

import { hasCapability } from '../config/permissions.js'
import { homeRepository } from '../repositories/homeRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'
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
        if (active) setError(translateErrorMessage(loadError.message, 'Erro ao carregar painel.'))
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

  const {
    appointmentsToday = [],
    metrics = [],
    predictiveAlert = '',
    weeklyAppointments = null,
  } = overview || {}
  const displayName = getDisplayName(profile, user)
  const canManageUsers = hasCapability(role, 'manageUsers')

  return (
    <div className={`mx-auto w-full text-[#e5e5e5] ${canManageUsers ? 'grid max-w-none gap-8 2xl:grid-cols-[minmax(0,1fr)_620px]' : 'flex max-w-[1280px] flex-col gap-8'}`}>
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

        <section className="grid items-stretch gap-6 xl:grid-cols-[1.45fr_1fr]">
        <div className="rounded-2xl border border-[#404040] bg-[#262626] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-md bg-[#3b82f6] text-white">
                <SparkLineIcon className="size-6" />
              </div>
              <div>
                <h2 className="text-base font-bold leading-6 text-[#3b82f6]">Consultas agendadas</h2>
                <p className="mt-1 text-sm font-medium leading-5 text-[#a3a3a3]">
                  Quantidade de consultas agendadas nos ultimos 7 dias
                </p>
              </div>
            </div>
            <span className="rounded-full bg-[#2a2a2a] px-3 py-1 text-sm font-bold text-[#3b82f6]">
              {weeklyAppointments?.total ?? 0}
            </span>
          </div>

          <div className="mt-6 h-[360px] rounded-lg bg-[#1f1f1f] px-4 py-5">
            <WeeklyAppointmentsChart weeklyAppointments={weeklyAppointments} />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-rows-2">
          <div className="flex min-h-[246px] flex-col rounded-2xl border border-[#404040] bg-[#262626] p-6">
            <h2 className="text-base font-bold text-[#e5e5e5]">Pacientes de hoje</h2>
            <div className="mt-5 grid flex-1 content-start gap-3">
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

          <div className="flex min-h-[246px] flex-col rounded-2xl border border-[#404040] bg-[#262626] p-6">
            <h2 className="text-base font-bold text-[#e5e5e5]">Alerta preditivo</h2>
            <p className="mt-4 flex-1 text-sm leading-6 text-[#a3a3a3]">
              {predictiveAlert}
            </p>
            <button
              className="mt-6 h-9 self-start rounded-sm border border-[#404040] bg-[#303030] px-4 text-sm font-semibold text-[#e5e5e5] transition hover:border-[#3b82f6] hover:text-[#3b82f6]"
              onClick={() => navigate('/mensagens')}
              type="button"
            >
              Abrir comunicação
            </button>
          </div>
        </div>
      </section>

      </div>
      {canManageUsers ? (
        <aside className="min-w-0 self-start 2xl:sticky 2xl:top-6 2xl:pt-[96px]">
          <UsersPage embedded navigate={navigate} role={role} />
        </aside>
      ) : null}
    </div>
  )
}

function MetricCard({ metric }) {
  return (
    <article
      className={`min-h-[150px] rounded-2xl border bg-[#262626] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.2)] ${
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

function WeeklyAppointmentsChart({ weeklyAppointments }) {
  const days = weeklyAppointments?.days || []
  const maxCount = Math.max(1, ...days.map((day) => day.count))
  const hasAppointments = days.some((day) => day.count > 0)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#737373]">Total da semana</p>
          <p className="mt-1 text-3xl font-bold leading-none text-[#e5e5e5]">{weeklyAppointments?.total ?? 0}</p>
        </div>
        <p className="text-right text-xs font-medium text-[#a3a3a3]">Baseado na data da agenda</p>
      </div>

      {hasAppointments ? (
        <div className="grid min-h-0 flex-1 grid-cols-7 items-end gap-3">
          {days.map((day, index) => {
            const height = Math.max(10, Math.round((day.count / maxCount) * 100))

            return (
              <div className="flex h-full min-w-0 flex-col justify-end gap-2" key={day.date}>
                <div className="flex min-h-0 flex-1 items-end">
                  <div
                    aria-label={`${day.count} consultas em ${day.date}`}
                    className="home-weekly-chart-bar w-full rounded-t-md bg-[#3b82f6] shadow-[0_8px_20px_rgba(59,130,246,0.18)]"
                    role="img"
                    style={{ animationDelay: `${index * 70}ms`, height: `${height}%` }}
                    title={`${day.count} consultas em ${day.date}`}
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold leading-4 text-[#e5e5e5]">{day.count}</p>
                  <p className="mt-1 truncate text-[11px] font-medium uppercase text-[#a3a3a3]">{day.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-[#404040] px-4 text-center">
          <p className="max-w-sm text-sm leading-6 text-[#a3a3a3]">Nenhuma consulta encontrada nos ultimos 7 dias.</p>
        </div>
      )}
    </div>
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

function SparkLineIcon({ className = 'size-6' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M4 17 9 11l4 4 7-9" />
      <path d="M15 6h5v5" />
    </svg>
  )
}

