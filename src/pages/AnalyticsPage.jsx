import { useEffect, useMemo, useState } from 'react'

import { analyticsRepository } from '../repositories/analyticsRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'

const chartPeriods = [
  ['week', 'Semana'],
  ['month', 'Mês'],
  ['six_months', '6 meses'],
]

const cardClass = 'rounded-2xl border border-border-default-v2 bg-surface-card shadow-card'

export function AnalyticsPage() {
  const [absenteeismPeriod, setAbsenteeismPeriod] = useState('week')
  const [consultationsPeriod, setConsultationsPeriod] = useState('week')
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const {
    absenteeismData = [],
    consultationsData = [],
    doctorPerformance = [],
    insuranceData = [],
    kpis = [],
    attendanceMetrics = {},
    topPatients = [],
  } = dashboard || {}
  const topPatientMaxVisits = useMemo(
    () => Math.max(...topPatients.map((patient) => patient.visits), 1),
    [topPatients],
  )

  useEffect(() => {
    let active = true

    analyticsRepository
      .getDashboardData({ absenteeismPeriod, consultationsPeriod })
      .then((data) => {
        if (active) setDashboard(data)
      })
      .catch((loadError) => {
        if (active) {
          setError(translateErrorMessage(loadError.message, 'Erro ao carregar analytics.'))
          setDashboard(null)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [absenteeismPeriod, consultationsPeriod])

  function handleChartPeriodChange(setter, nextPeriod) {
    setter(nextPeriod)
    setLoading(true)
    setError('')
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-[32px] font-bold leading-8 tracking-[-0.02em] text-text-heading">Analytics</h1>
        </div>
      </section>

      {loading ? (
        <p className="rounded-2xl border border-border-default-v2 bg-surface-card p-8 text-center text-sm text-text-muted-v2">
          Carregando analytics...
        </p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!loading && !error ? <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Indicadores principais">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </section> : null}

      {!loading && !error ? <section className="grid gap-4 md:grid-cols-3" aria-label="Métricas de atendimento">
        <MiniMetric title="Métricas de atendimento" value={`${attendanceMetrics.completed || 0}/${attendanceMetrics.scheduled || 0}`} detail="realizadas sobre agendadas" />
        <MiniMetric title="Taxa de no-show" value={`${attendanceMetrics.noShowRate || 0}%`} detail={`${attendanceMetrics.noShow || 0} ausências`} />
        <MiniMetric title="Canceladas" value={attendanceMetrics.cancelled || 0} detail="consultas canceladas" />
      </section> : null}

      {!loading && !error ? <section className="grid gap-6 lg:grid-cols-2" aria-label="Gráficos principais">
        <ChartCard
          actions={(
            <PeriodToggle
              onChange={(nextPeriod) => handleChartPeriodChange(setAbsenteeismPeriod, nextPeriod)}
              value={absenteeismPeriod}
            />
          )}
          description="Consultas não realizadas vs meta"
          title="Taxa de Absenteísmo"
        >
          <AreaMetricChart data={absenteeismData} />
        </ChartCard>

        <ChartCard
          actions={(
            <PeriodToggle
              onChange={(nextPeriod) => handleChartPeriodChange(setConsultationsPeriod, nextPeriod)}
              value={consultationsPeriod}
            />
          )}
          description="Agendadas vs realizadas"
          title="Consultas por Período"
        >
          <GroupedBarChart data={consultationsData} />
        </ChartCard>
      </section> : null}

      {!loading && !error ? <section className="grid gap-6 lg:grid-cols-2" aria-label="Analytics complementares">
        <ChartCard description="Distribuição de atendimentos" title="Convênios">
          <InsuranceBreakdown insuranceData={insuranceData} />
        </ChartCard>

        <ChartCard description="Mais atendidos no período" title="Top Pacientes">
          <div className="space-y-3 pt-1">
            {topPatients.length ? topPatients.map((patient, index) => (
              <div className="flex items-center gap-3" key={patient.name}>
                <span className="w-4 text-xs font-bold text-text-muted-v2">{index + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-text-heading">{patient.name}</p>
                  <p className="mt-0.5 text-[10px] text-text-muted-v2">
                    {patient.visits} visitas
                  </p>
                </div>
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-card-hover">
                  <div
                    className="analytics-chart-progress h-full rounded-full bg-[#3b82f6]"
                    style={{ animationDelay: `${index * 80}ms`, width: `${(patient.visits / topPatientMaxVisits) * 100}%` }}
                  />
                </div>
              </div>
            )) : (
              <p className="text-sm text-text-muted-v2">Nenhum atendimento encontrado no período.</p>
            )}
          </div>
        </ChartCard>
      </section> : null}

      {!loading && !error ? <section className={`${cardClass} p-6`} aria-label="Performance por médico">
        <h2 className="mb-4 text-sm font-bold text-text-heading">Performance por Médico</h2>
        <div className="overflow-x-auto rounded-sm border border-border-default-v2">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-surface-inset text-xs font-semibold uppercase tracking-[0.02em] text-text-muted-v2">
              <tr>
                <th className="px-4 py-3">Profissional</th>
                <th className="px-4 py-3">Consultas</th>
                <th className="px-4 py-3">No-Show</th>
                <th className="px-4 py-3">Taxa No-Show</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default-v2 bg-surface-card">
              {doctorPerformance.length ? doctorPerformance.map((doctor) => {
                const noShowRate = doctor.consultas > 0 ? (doctor.noShow / doctor.consultas) * 100 : 0
                return (
                  <tr className="transition hover:bg-surface-card-hover" key={doctor.name}>
                    <td className="px-4 py-3 font-semibold text-text-heading">{doctor.name}</td>
                    <td className="px-4 py-3 text-text-body">{doctor.consultas}</td>
                    <td className="px-4 py-3 text-text-muted-v2">{doctor.noShow}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${rateClass(noShowRate)}`}>{noShowRate.toFixed(1)}%</span>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td className="px-4 py-8 text-center text-text-muted-v2" colSpan={4}>
                    Nenhum atendimento encontrado para calcular performance médica.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section> : null}
    </div>
  )
}

function KpiCard({ kpi }) {
  return (
    <article className={`${cardClass} border-t-[3px] border-t-accent-primary p-5 transition-all hover:-translate-y-0.5 hover:shadow-card-hover`}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-medium text-text-muted-v2">{kpi.label}</p>
        <AnalyticsIcon className="size-4 text-accent-primary" name={kpi.icon} />
      </div>
      <p className="mt-2 text-2xl font-bold leading-none text-text-heading">{kpi.value}</p>
      <span className={`mt-2 flex items-center gap-1 text-xs font-semibold ${kpi.up ? 'text-emerald-400' : 'text-red-400'}`}>
        <AnalyticsIcon className="size-3.5" name={kpi.up ? 'arrow-up' : 'arrow-down'} />
        {kpi.change}
      </span>
    </article>
  )
}

function MiniMetric({ detail, title, value }) {
  return (
    <article className={`${cardClass} p-4`}>
      <p className="text-xs font-semibold text-text-muted-v2">{title}</p>
      <p className="mt-2 text-xl font-bold text-text-heading">{value}</p>
      <p className="mt-1 text-xs text-text-muted-v2">{detail}</p>
    </article>
  )
}

function ChartCard({ actions = null, children, description, title }) {
  return (
    <article className={`${cardClass} p-6`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-text-heading">{title}</h2>
          <p className="mt-1 text-xs text-text-muted-v2">{description}</p>
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </article>
  )
}

function PeriodToggle({ onChange, value }) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-sm border border-border-default-v2 bg-surface-inset">
      {chartPeriods.map(([key, label]) => (
        <button
          className={`h-8 px-3 text-[11px] font-semibold transition ${
            value === key ? 'bg-[#3b82f6] text-white' : 'text-text-muted-v2 hover:bg-surface-card-hover hover:text-text-body'
          }`}
          key={key}
          onClick={() => {
            if (value !== key) onChange(key)
          }}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function AreaMetricChart({ data }) {
  const maxRate = Math.max(30, ...data.flatMap((item) => [item.taxa, item.meta]))
  const points = getLinePoints(data.map((item) => item.taxa), 0, maxRate)
  const metaPoints = getLinePoints(data.map((item) => item.meta), 0, maxRate)
  const area = `${points} 600,260 42,260`
  const labelStep = 558 / Math.max(data.length - 1, 1)

  return (
    <svg className="h-[250px] w-full overflow-visible" role="img" viewBox="0 0 640 300">
      <ChartGrid labels={[maxRate, Math.round(maxRate * 0.75), Math.round(maxRate * 0.5), Math.round(maxRate * 0.25), 0]} />
      <polygon className="analytics-chart-area" fill="#3b82f6" opacity="0.12" points={area} />
      <polyline className="analytics-chart-line-fade" fill="none" points={metaPoints} stroke="#64748b" strokeDasharray="6 8" strokeWidth="2" />
      <polyline className="analytics-chart-line-draw" fill="none" pathLength="1" points={points} stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      {data.map((item, index) => (
        <text className="fill-[#94a3b8] text-[13px]" key={item.month} x={42 + index * labelStep} y="285" textAnchor="middle">
          {item.month}
        </text>
      ))}
    </svg>
  )
}

function GroupedBarChart({ data }) {
  const maxValue = Math.max(...data.flatMap((item) => [item.total, item.realizadas]), 1)
  const chartLeft = 54
  const chartWidth = 540
  const slotWidth = chartWidth / Math.max(data.length, 1)
  const barWidth = Math.min(30, Math.max(14, slotWidth * 0.28))
  const barGap = Math.min(10, Math.max(5, slotWidth * 0.08))

  return (
    <svg className="h-[250px] w-full overflow-visible" role="img" viewBox="0 0 640 300">
      <ChartGrid labels={[maxValue, Math.round(maxValue * 0.75), Math.round(maxValue * 0.5), Math.round(maxValue * 0.25), 0]} />
      {data.map((item, index) => {
        const x = chartLeft + index * slotWidth + (slotWidth - (barWidth * 2 + barGap)) / 2
        const labelX = chartLeft + index * slotWidth + slotWidth / 2
        const totalHeight = (item.total / maxValue) * 220
        const doneHeight = (item.realizadas / maxValue) * 220
        return (
          <g key={item.month}>
            <rect
              className="analytics-chart-bar"
              fill="#475569"
              height={totalHeight}
              rx="5"
              style={{ animationDelay: `${index * 70}ms` }}
              width={barWidth}
              x={x}
              y={260 - totalHeight}
            />
            <rect
              className="analytics-chart-bar"
              fill="#3b82f6"
              height={doneHeight}
              rx="5"
              style={{ animationDelay: `${index * 70 + 90}ms` }}
              width={barWidth}
              x={x + barWidth + barGap}
              y={260 - doneHeight}
            />
            <text className="fill-[#94a3b8] text-[13px]" textAnchor="middle" x={labelX} y="285">
              {item.month}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function InsuranceBreakdown({ insuranceData }) {
  if (!insuranceData.length) {
    return <p className="py-8 text-center text-sm text-text-muted-v2">Nenhum convênio encontrado nos pacientes.</p>
  }

  const radius = 42
  const circumference = 2 * Math.PI * radius
  const segments = insuranceData.reduce((items, item) => {
    const dash = (item.value / 100) * circumference
    const previous = items.at(-1)
    const offset = previous ? previous.offset + previous.dash + 4 : 0

    return [...items, { ...item, dash, offset }]
  }, [])

  return (
    <div>
      <div className="flex justify-center">
        <svg className="h-[160px] w-[160px]" viewBox="0 0 120 120">
          <circle cx="60" cy="60" fill="none" r={radius} stroke="var(--border-subtle)" strokeWidth="18" />
          {segments.map((item, index) => (
            <circle
              className="analytics-chart-donut-segment"
              cx="60"
              cy="60"
              fill="none"
              key={item.name}
              r={radius}
              stroke={item.color}
              strokeDasharray={`${item.dash} ${circumference - item.dash}`}
              strokeDashoffset={-item.offset}
              strokeLinecap="round"
              strokeWidth="18"
              style={{ animationDelay: `${index * 90}ms` }}
              transform="rotate(-90 60 60)"
            />
          ))}
          <circle cx="60" cy="60" fill="var(--surface-card)" r="25" />
        </svg>
      </div>
      <div className="mt-2 space-y-1.5">
        {insuranceData.map((item) => (
          <div className="flex items-center justify-between text-xs" key={item.name}>
            <span className="flex items-center gap-2 text-text-body">
              <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="text-text-muted-v2">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChartGrid({ labels }) {
  return (
    <>
      {labels.map((label, index) => {
        const y = 20 + index * 60
        return (
          <g key={label}>
            <line stroke="#1e3a5f" strokeDasharray="3 5" x1="42" x2="600" y1={y} y2={y} />
            <text className="fill-[#94a3b8] text-[13px]" textAnchor="end" x="24" y={y + 4}>
              {label}
            </text>
          </g>
        )
      })}
    </>
  )
}

function getLinePoints(values, min, max, box = { left: 42, top: 20, width: 558, height: 240 }) {
  const range = Math.max(max - min, 1)

  return values
    .map((value, index) => {
      const x = box.left + (index / Math.max(values.length - 1, 1)) * box.width
      const y = box.top + ((max - value) / range) * box.height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function rateClass(rate) {
  if (rate > 15) {
    return 'text-red-400'
  }

  if (rate > 10) {
    return 'text-amber-400'
  }

  return 'text-emerald-400'
}

function AnalyticsIcon({ className = 'size-4', name }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.9,
    viewBox: '0 0 24 24',
  }

  if (name === 'calendar') {
    return (
      <svg {...common}>
        <path d="M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      </svg>
    )
  }

  if (name === 'activity') {
    return (
      <svg {...common}>
        <path d="M3 12h4l2-6 4 12 2-6h6" />
      </svg>
    )
  }

  if (name === 'dollar') {
    return (
      <svg {...common}>
        <path d="M12 2v20M17 6.5C15.8 5.4 14.2 5 12.5 5 9.9 5 8 6.2 8 8s1.6 2.7 4.2 3.3C15 12 17 13 17 15.5S14.8 19 12 19c-2 0-3.8-.6-5-1.8" />
      </svg>
    )
  }

  if (name === 'users') {
    return (
      <svg {...common}>
        <path d="M16 19a4 4 0 0 0-8 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 19a3 3 0 0 0-3-3M4 19a3 3 0 0 1 3-3" />
      </svg>
    )
  }

  if (name === 'building') {
    return (
      <svg {...common}>
        <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
        <path d="M16 8h2a2 2 0 0 1 2 2v11M8 7h4M8 11h4M8 15h4M3 21h18" />
      </svg>
    )
  }

  if (name === 'arrow-up') {
    return (
      <svg {...common}>
        <path d="M7 17 17 7M8 7h9v9" />
      </svg>
    )
  }

  if (name === 'arrow-down') {
    return (
      <svg {...common}>
        <path d="M7 7 17 17M17 8v9H8" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M4 17 9 11l4 4 7-9" />
      <path d="M4 20h16" />
    </svg>
  )
}
