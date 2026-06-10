import { useEffect, useMemo, useState } from 'react'

import { AvailabilityPanel } from '../components/availability/AvailabilityPanel.jsx'
import { normalizeRole } from '../config/permissions.js'
import {
  AGENDA_EXCEPTIONS_CHANGED_EVENT,
  availabilityRepository,
} from '../repositories/availabilityRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'

const PROFESSIONALS_PER_PAGE = 12
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function ProfessionalsPage({ navigate }) {
  const [professionals, setProfessionals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [specialtyFilter, setSpecialtyFilter] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let active = true

    professionalRepository
      .getAll()
      .then((data) => {
        if (active) setProfessionals(data)
      })
      .catch((err) => {
        if (active) setError(translateErrorMessage(err.message, 'Erro ao carregar profissionais.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const specialties = useMemo(
    () =>
      [...new Set(professionals.map((professional) => getSpecialty(professional)).filter(Boolean))]
        .sort((first, second) => first.localeCompare(second, 'pt-BR')),
    [professionals],
  )
  const filteredProfessionals = useMemo(() => {
    const query = normalizeSearch(search)

    return professionals.filter((professional) => {
      const specialty = getSpecialty(professional)
      const matchesSpecialty = !specialtyFilter || specialty === specialtyFilter
      const matchesSearch = !query || [
        professional.name,
        professional.full_name,
        professional.email,
        specialty,
        professional.crm,
        professional.unit,
      ]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(query)

      return matchesSpecialty && matchesSearch
    })
  }, [professionals, search, specialtyFilter])
  const totalPages = Math.max(1, Math.ceil(filteredProfessionals.length / PROFESSIONALS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const visibleProfessionals = filteredProfessionals.slice(
    (currentPage - 1) * PROFESSIONALS_PER_PAGE,
    currentPage * PROFESSIONALS_PER_PAGE,
  )

  if (loading) {
    return <p className="p-8 text-center text-text-muted-v2">Carregando profissionais...</p>
  }

  if (error) {
    return <p className="p-8 text-center text-red-400">Erro ao carregar profissionais: {error}</p>
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-text-heading">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-[32px] font-bold leading-8 tracking-[-0.02em] text-text-heading">Profissionais</h1>
          <p className="mt-1 text-sm text-text-muted-v2">Médicos cadastrados no sistema</p>
        </div>
      </div>

      <section className="grid gap-3 border-y border-border-default-v2 bg-surface-card px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(13rem,0.36fr)]">
        <label className="grid gap-1.5 text-xs font-semibold text-text-muted-v2">
          <span>Pesquisa</span>
          <div className="relative">
            <ProfessionalIcon className="absolute left-3 top-3.5 size-4 text-text-muted-v2" name="search" />
            <input
              className="h-11 w-full rounded-lg border border-border-default-v2 bg-surface-card-hover py-2.5 pl-10 pr-4 text-sm text-text-heading outline-none transition placeholder:text-text-muted-v2 focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20"
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Nome, CRM ou especialidade"
              type="search"
              value={search}
            />
          </div>
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-text-muted-v2">
          <span>Especialidade</span>
          <select
            className="h-11 w-full rounded-lg border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-heading outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20"
            onChange={(event) => {
              setSpecialtyFilter(event.target.value)
              setPage(1)
            }}
            value={specialtyFilter}
          >
            <option value="">Todas</option>
            {specialties.map((specialty) => (
              <option key={specialty} value={specialty}>{specialty}</option>
            ))}
          </select>
        </label>
      </section>

      {filteredProfessionals.length ? (
        <div className="space-y-4">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleProfessionals.map((professional) => (
              <button
                className="rounded-2xl border border-[#60a5fa]/25 bg-[#3b82f6]/10 p-5 text-left shadow-sm shadow-[#3b82f6]/5 transition hover:-translate-y-0.5 hover:border-[#60a5fa]/55 hover:bg-[#3b82f6]/15"
                key={professional.id}
                onClick={() => navigate(`/profissionais/${encodeURIComponent(professional.id)}`)}
                type="button"
              >
                <span className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full border border-[#60a5fa]/35 bg-[#3b82f6]/20 text-[var(--professional-blue-text)]">
                    <ProfessionalIcon className="size-6" name="user" />
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words text-base font-bold text-text-heading">{professional.name}</span>
                    <span className="mt-1 block break-words text-sm text-text-muted-v2">{getSpecialty(professional) || 'Especialidade não informada'}</span>
                    <span className="mt-3 inline-flex rounded-full bg-[#3b82f6]/15 px-2.5 py-1 text-xs font-semibold text-[var(--professional-blue-text)]">
                      {professional.crm ? `CRM ${professional.crm}${professional.crm_uf ? `-${professional.crm_uf}` : ''}` : 'CRM não informado'}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </section>

          {totalPages > 1 ? (
            <nav className="flex flex-col items-center justify-between gap-3 rounded-xl border border-[#60a5fa]/20 bg-[#3b82f6]/5 px-4 py-3 text-sm text-text-muted-v2 sm:flex-row">
              <span>
                Mostrando {visibleProfessionals.length} de {filteredProfessionals.length} profissionais
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border border-[#60a5fa]/25 px-3 py-1.5 font-semibold text-text-heading transition hover:bg-[#3b82f6]/15 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={currentPage === 1}
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                  type="button"
                >
                  Anterior
                </button>
                <span className="min-w-16 text-center text-xs font-bold text-[var(--professional-blue-text)]">
                  {currentPage} / {totalPages}
                </span>
                <button
                  className="rounded-lg border border-[#60a5fa]/25 px-3 py-1.5 font-semibold text-text-heading transition hover:bg-[#3b82f6]/15 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
                  type="button"
                >
                  Próxima
                </button>
              </div>
            </nav>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-border-default-v2 bg-surface-card p-8 text-center text-sm text-text-muted-v2">
          Nenhum profissional encontrado.
        </div>
      )}
    </div>
  )
}

export function ProfessionalDetailPage({ navigate, professionalId, role, selfProfile = false }) {
  const [professionals, setProfessionals] = useState([])
  const [viewerProfile, setViewerProfile] = useState(null)
  const [availabilityRows, setAvailabilityRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [error, setError] = useState('')
  const [availabilityError, setAvailabilityError] = useState('')
  const decodedProfessionalId = decodeURIComponent(professionalId || '')

  useEffect(() => {
    let active = true

    async function loadDetail() {
      setLoading(true)
      setError('')

      try {
        const [professionalsData, currentProfile] = await Promise.all([
          professionalRepository.getAll(),
          profileRepository.getCurrentUserProfile().catch(() => null),
        ])
        if (!active) return
        setProfessionals(professionalsData || [])
        setViewerProfile(currentProfile)
      } catch (err) {
        if (active) setError(translateErrorMessage(err.message, 'Erro ao carregar profissional.'))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadDetail()

    return () => {
      active = false
    }
  }, [])

  const currentProfessional = useMemo(
    () => professionalRepository.resolveCurrentProfessional(viewerProfile, professionals),
    [professionals, viewerProfile],
  )
  const professional = useMemo(
    () => selfProfile
      ? currentProfessional
      : professionals.find((item) => sameProfessionalId(item.id, decodedProfessionalId)) || null,
    [currentProfessional, decodedProfessionalId, professionals, selfProfile],
  )
  const canEditAvailability = useMemo(
    () => canEditProfessionalAvailability(role, viewerProfile, currentProfessional, professional),
    [currentProfessional, professional, role, viewerProfile],
  )
  const isPatientRole = normalizeRole(role) === 'paciente' || viewerProfile?.isPatient

  useEffect(() => {
    if (!professional?.id) return undefined

    let active = true

    async function loadAvailability() {
      setAvailabilityLoading(true)
      setAvailabilityError('')

      try {
        const rows = await availabilityRepository.getAll({
          doctorId: professional.id,
          order: 'weekday.asc,start_time.asc',
        })
        if (active) setAvailabilityRows(rows)
      } catch (err) {
        if (active) {
          setAvailabilityRows([])
          setAvailabilityError(translateErrorMessage(err.message, 'Falha ao carregar disponibilidade.'))
        }
      } finally {
        if (active) setAvailabilityLoading(false)
      }
    }

    loadAvailability()
    window.addEventListener(AGENDA_EXCEPTIONS_CHANGED_EVENT, loadAvailability)

    return () => {
      active = false
      window.removeEventListener(AGENDA_EXCEPTIONS_CHANGED_EVENT, loadAvailability)
    }
  }, [professional?.id])

  if (loading) {
    return <p className="p-8 text-center text-text-muted-v2">Carregando profissional...</p>
  }

  if (error) {
    return <p className="p-8 text-center text-red-400">Erro ao carregar profissional: {error}</p>
  }

  if (!professional) {
    const notFoundAction = selfProfile ? '/inicio' : '/profissionais'

    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-border-default-v2 bg-surface-card p-8 text-center text-text-heading">
        <h1 className="text-xl font-bold">{selfProfile ? 'Perfil profissional não encontrado' : 'Profissional não encontrado'}</h1>
        <button
          className="mt-6 rounded-lg bg-[#3b82f6] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2563eb]"
          onClick={() => navigate(notFoundAction)}
          type="button"
        >
          Voltar
        </button>
      </div>
    )
  }

  const specialty = getSpecialty(professional)
  const details = [
    ['Nome', professional.name || 'Não informado'],
    ['Especialidade', specialty || 'Não informada'],
    ['CRM', professional.crm ? `${professional.crm}${professional.crm_uf ? `-${professional.crm_uf}` : ''}` : 'Não informado'],
    ['Unidade', professional.unit || 'Não informada'],
    ['E-mail', professional.email || 'Não informado'],
    ['Telefone', professional.phone || 'Não informado'],
    ['Status', professional.status || 'Disponível'],
    ['Próximo horário', professional.nextSlot || 'Consulta pendente'],
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-text-heading">
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border-default-v2 pb-6 md:flex-row md:items-center">
        <div className="flex items-start gap-4">
          {!selfProfile ? (
            <button
              className="mt-1 grid size-10 place-items-center rounded-lg border border-border-default-v2 bg-surface-card text-text-heading transition hover:bg-surface-card-hover"
              onClick={() => navigate('/profissionais')}
              type="button"
            >
              <ProfessionalIcon className="size-5" name="arrow-left" />
            </button>
          ) : null}
          <div>
            <h1 className="text-[32px] font-bold leading-8 tracking-[-0.02em] text-text-heading">{professional.name}</h1>
            <p className="mt-1 text-sm text-text-muted-v2">{specialty || 'Especialidade não informada'}</p>
          </div>
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(18rem,0.5fr)_minmax(0,1fr)] lg:items-start">
        <div className="rounded-2xl border border-[#60a5fa]/20 bg-[#3b82f6]/5 p-5 shadow-sm shadow-[#3b82f6]/5">
          <div className="flex items-start gap-5">
            <div className="grid size-16 shrink-0 place-items-center rounded-full border border-[#60a5fa]/35 bg-[#3b82f6]/20 text-[var(--professional-blue-text)]">
              <ProfessionalIcon className="size-10" name="user" />
            </div>
            <div className="min-w-0">
              <p className="break-words text-xl font-bold text-text-heading">{professional.name}</p>
              <p className="mt-1 break-words text-sm text-text-muted-v2">{specialty || 'Especialidade não informada'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#3b82f6]/15 px-3 py-1 text-xs font-bold text-[var(--professional-blue-text)]">
                  {professional.crm ? `CRM ${professional.crm}${professional.crm_uf ? `-${professional.crm_uf}` : ''}` : 'CRM não informado'}
                </span>
                <span className="rounded-full border border-[#60a5fa]/20 bg-[#3b82f6]/10 px-3 py-1 text-xs font-bold text-text-muted-v2">
                  {professional.unit || 'Unidade não informada'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 md:grid-cols-2">
            {details.map(([label, value]) => (
              <div className="rounded-lg border border-[#60a5fa]/15 bg-surface-card/70 px-3 py-2" key={label}>
                <p className="text-[11px] font-semibold uppercase text-text-muted-v2">{label}</p>
                <p className="mt-1 break-words text-sm font-semibold leading-5 text-text-heading">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 self-start">
          <div className="rounded-2xl border border-[#60a5fa]/20 bg-[#3b82f6]/5 p-3 shadow-sm shadow-[#3b82f6]/5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-text-heading">Agenda Semanal</h2>
              {availabilityLoading ? <span className="text-xs font-semibold text-text-muted-v2">Carregando...</span> : null}
            </div>
            {availabilityError ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">{availabilityError}</p>
            ) : (
              <ProfessionalWeeklyAgenda rows={availabilityRows} />
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <SummaryTile label="Pacientes ativos" value={professional.patients || 0} />
            <SummaryTile label="Status" value={professional.status || 'Disponível'} />
            <SummaryTile label="Horário padrão" value={professional.schedule || 'Seg a Sex, 08h às 18h'} />
          </div>
        </div>
      </section>

      {!isPatientRole ? (
        <section>
          <div className="flex gap-2 border-b border-border-default-v2">
            <span className="border-b-2 border-[#3b82f6] px-4 py-3 text-sm font-semibold text-[var(--professional-blue-text)]">
              Disponibilidade
            </span>
          </div>

          <div className="py-6">
            <AvailabilityPanel
              canEditAvailability={canEditAvailability}
              currentProfessional={currentProfessional}
              lockDoctorSelection
              professionals={professionals}
              selectedProfessionalId={professional.id}
              showDoctorFilter
              showExceptionManagement
              title="Disponibilidade Médica"
              viewerProfile={viewerProfile}
            />
          </div>
        </section>
      ) : null}
    </div>
  )
}

function SummaryTile({ label, value }) {
  return (
    <article className="rounded-2xl border border-[#60a5fa]/20 bg-[#3b82f6]/5 p-4 shadow-sm shadow-[#3b82f6]/5">
      <p className="text-sm font-medium text-text-muted-v2">{label}</p>
      <p className="mt-3 break-words text-xl font-bold text-text-heading">{value}</p>
    </article>
  )
}

function ProfessionalWeeklyAgenda({ rows }) {
  const groupedRows = groupAvailabilityRowsByWeekday(rows)

  return (
    <div className="grid gap-2 md:grid-cols-7">
      {WEEKDAY_LABELS.map((label, weekday) => {
        const dayRows = groupedRows[weekday] || []
        const visibleRows = dayRows.slice(0, 2)

        return (
          <article className="min-w-0 rounded-xl border border-[#60a5fa]/20 bg-surface-card/70 px-2.5 py-2" key={label}>
            <h3 className="truncate text-xs font-bold text-[var(--professional-blue-text)]">{label}</h3>
            <div className="mt-2 grid gap-1.5">
              {visibleRows.length ? (
                visibleRows.map((row) => (
                  <div
                    className="flex min-h-12 min-w-0 flex-col justify-center rounded-lg border border-[#60a5fa]/15 bg-[#3b82f6]/15 px-2 py-1.5 text-[11px] leading-4 text-text-heading"
                    key={row.id || `${row.weekday}-${row.startTime}-${row.endTime}-${row.appointmentType}`}
                    title={`${formatProfessionalTimeRange(row)} · ${formatProfessionalAppointmentType(row.appointmentType)} · ${row.slotMinutes || 30} min`}
                  >
                    <p className="truncate font-bold">{formatProfessionalTimeRange(row)}</p>
                    <p className="truncate text-[10px] font-semibold text-[var(--professional-blue-text)]">
                      {formatProfessionalAppointmentType(row.appointmentType)} · {row.slotMinutes || 30} min
                    </p>
                  </div>
                ))
              ) : (
                <p className="flex min-h-12 items-center justify-center rounded-lg border border-dashed border-[#60a5fa]/15 px-2 py-2 text-center text-[11px] leading-4 text-text-muted-v2">
                  Sem horários
                </p>
              )}
              {dayRows.length > visibleRows.length ? (
                <span className="truncate text-[10px] font-bold text-[var(--professional-blue-text)]">+ {dayRows.length - visibleRows.length} horários</span>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function groupAvailabilityRowsByWeekday(rows) {
  return (rows || [])
    .filter((row) => row.active !== false)
    .reduce((accumulator, row) => {
      const weekday = Number(row.weekday)
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return accumulator
      accumulator[weekday] = [...(accumulator[weekday] || []), row].sort(compareAvailabilityRows)
      return accumulator
    }, {})
}

function compareAvailabilityRows(first, second) {
  return normalizeProfessionalTime(first.startTime).localeCompare(normalizeProfessionalTime(second.startTime))
}

function formatProfessionalTimeRange(row) {
  return `${normalizeProfessionalTime(row.startTime)}-${normalizeProfessionalTime(row.endTime)}`
}

function normalizeProfessionalTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/)
  if (!match) return '--:--'
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function formatProfessionalAppointmentType(type) {
  const normalized = normalizeSearch(type)
  return normalized.includes('tele') ? 'Telemedicina' : 'Presencial'
}

function canEditProfessionalAvailability(role, viewerProfile, currentProfessional, professional) {
  const normalizedRole = normalizeRole(role) || (viewerProfile?.isAdmin ? 'admin' : viewerProfile?.isManager ? 'gestor' : viewerProfile?.isDoctor ? 'medico' : null)

  if (normalizedRole === 'admin' || normalizedRole === 'gestor') return true
  if (normalizedRole !== 'medico') return false
  if (!professional || !currentProfessional) return false

  return [
    [currentProfessional.id, professional.id],
    [currentProfessional.userId, professional.userId],
    [currentProfessional.email, professional.email],
    [viewerProfile?.doctorId, professional.id],
    [viewerProfile?.id, professional.userId],
    [viewerProfile?.authUserId, professional.userId],
  ].some(([first, second]) => normalizeIdentifier(first) && normalizeIdentifier(first) === normalizeIdentifier(second))
}

function getSpecialty(professional) {
  return professional?.specialty || professional?.specialidade || professional?.role || ''
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase()
}

function sameProfessionalId(first, second) {
  return normalizeIdentifier(first) === normalizeIdentifier(second)
}

function ProfessionalIcon({ className = 'size-4', name }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
  }

  if (name === 'search') {
    return (
      <svg {...common}>
        <path d="m21 21-4.3-4.3" />
        <circle cx="11" cy="11" r="7" />
      </svg>
    )
  }

  if (name === 'arrow-left') {
    return (
      <svg {...common}>
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
      <path d="M17.5 11.5h3M19 10v3" />
    </svg>
  )
}
