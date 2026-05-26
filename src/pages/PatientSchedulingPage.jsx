import { useEffect, useMemo, useState } from 'react'

import { StethoscopeIcon } from '../components/Brand.jsx'
import { filterBookableAvailableSlots, recoverCurrentPatient } from '../hooks/useAgenda.js'
import { appointmentRepository } from '../repositories/appointmentRepository.js'
import {
  AGENDA_EXCEPTIONS_CHANGED_EVENT,
  availabilityRepository,
} from '../repositories/availabilityRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'
import { userRepository } from '../repositories/userRepository.js'
import { formatLocalDateInput, parseLocalDate } from '../utils/agendaDate.js'

const PROFESSIONALS_PER_PAGE = 12
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
const appointmentTypeOptions = ['Retorno', 'Primeira consulta', 'Exame', 'Avaliacao pre-op']
const initialBookingForm = {
  date: formatLocalDateInput(new Date()),
  durationMinutes: 30,
  mode: 'Teleconsulta',
  notes: '',
  time: '',
  type: 'Retorno',
}

export function PatientSchedulingPage({ navigate }) {
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
          <h1 className="text-[32px] font-bold leading-8 tracking-[-0.02em] text-text-heading">Agendamento</h1>
          <p className="mt-1 text-sm text-text-muted-v2">Escolha um profissional para solicitar sua consulta.</p>
        </div>
      </div>

      <section className="grid gap-3 border-y border-border-default-v2 bg-surface-card px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(13rem,0.36fr)]">
        <label className="grid gap-1.5 text-xs font-semibold text-text-muted-v2">
          <span>Pesquisa</span>
          <div className="relative">
            <SchedulingIcon className="absolute left-3 top-3.5 size-4 text-text-muted-v2" name="search" />
            <input
              className="h-11 w-full rounded-lg border border-border-default-v2 bg-surface-card-hover py-2.5 pl-10 pr-4 text-sm text-text-heading outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
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
            className="h-11 w-full rounded-lg border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-heading outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
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
                onClick={() => navigate(`/agendamento/${encodeURIComponent(professional.id)}`)}
                type="button"
              >
                <span className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full border border-[#60a5fa]/35 bg-[#3b82f6]/20 text-[var(--professional-blue-text)]">
                    <SchedulingIcon className="size-6" name="user" />
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words text-base font-bold text-text-heading">{professional.name}</span>
                    <span className="mt-1 block break-words text-sm text-text-muted-v2">{getSpecialty(professional) || 'Especialidade nao informada'}</span>
                    <span className="mt-3 inline-flex rounded-full bg-[#3b82f6]/15 px-2.5 py-1 text-xs font-semibold text-[var(--professional-blue-text)]">
                      {professional.crm ? `CRM ${professional.crm}${professional.crm_uf ? `-${professional.crm_uf}` : ''}` : 'CRM nao informado'}
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
                  Proxima
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

export function PatientSchedulingDetailPage({ navigate, professionalId }) {
  const [professionals, setProfessionals] = useState([])
  const [viewerProfile, setViewerProfile] = useState(null)
  const [currentPatient, setCurrentPatient] = useState(null)
  const [availabilityRows, setAvailabilityRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [error, setError] = useState('')
  const [availabilityError, setAvailabilityError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [bookingForm, setBookingForm] = useState(initialBookingForm)
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const decodedProfessionalId = decodeURIComponent(professionalId || '')

  useEffect(() => {
    let active = true

    async function loadDetail() {
      setLoading(true)
      setError('')

      try {
        const [professionalsData, currentProfile, usersData, patientsData] = await Promise.all([
          professionalRepository.getAll(),
          profileRepository.getCurrentUserProfile().catch(() => null),
          userRepository.getAll().catch(() => []),
          patientRepository.getAll().catch(() => []),
        ])
        const resolvedPatient = await recoverCurrentPatient(currentProfile, patientsData || [], usersData || [])

        if (!active) return
        setProfessionals(professionalsData || [])
        setViewerProfile(currentProfile)
        setCurrentPatient(resolvedPatient)
      } catch (err) {
        if (active) setError(translateErrorMessage(err.message, 'Erro ao carregar agendamento.'))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadDetail()

    return () => {
      active = false
    }
  }, [])

  const professional = useMemo(
    () => professionals.find((item) => getProfessionalIdCandidates(item).some((id) => sameIdentifier(id, decodedProfessionalId))) || null,
    [decodedProfessionalId, professionals],
  )

  const doctorIdCandidates = useMemo(
    () => getProfessionalIdCandidates(professional),
    [professional],
  )

  useEffect(() => {
    if (!professional?.id) return undefined

    let active = true

    async function loadAvailability() {
      setAvailabilityLoading(true)
      setAvailabilityError('')

      try {
        const rows = await getFirstAvailableRowsForDoctor(doctorIdCandidates)
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
  }, [doctorIdCandidates, professional?.id])

  useEffect(() => {
    if (!modalOpen || !professional?.id) return undefined

    let active = true

    async function loadSlots() {
      setSlotsLoading(true)
      setSlotsError('')

      try {
        const date = bookingForm.date
        const resolvedDoctorId = resolveDoctorIdForDate(availabilityRows, doctorIdCandidates) || doctorIdCandidates[0] || professional.id
        const [slots, doctorAppointments, patientAppointments] = await Promise.all([
          getFirstAvailableSlotsForDoctor(doctorIdCandidates, {
            appointmentType: bookingForm.mode,
            date,
            preferredDoctorId: resolvedDoctorId,
          }),
          getAppointmentsForDoctorCandidates(doctorIdCandidates),
          currentPatient?.id ? appointmentRepository.getAll({ patientId: currentPatient.id }).catch(() => []) : [],
        ])
        if (!active) return

        const slotDoctorId = slots.find((slot) => slot.doctorId)?.doctorId || resolvedDoctorId
        const bookableSlots = filterBookableAvailableSlots(slots, {
          appointments: uniqueAppointments([...doctorAppointments, ...patientAppointments]),
          date,
          doctorId: slotDoctorId,
        })
        setAvailableSlots(bookableSlots)
        setBookingForm((current) => {
          if (current.time && bookableSlots.some((slot) => slot.time === current.time)) return current
          return { ...current, time: bookableSlots[0]?.time || '' }
        })
      } catch (err) {
        if (active) {
          setAvailableSlots([])
          setSlotsError(translateErrorMessage(err.message, 'Nao foi possivel calcular horarios disponiveis.'))
          setBookingForm((current) => ({ ...current, time: '' }))
        }
      } finally {
        if (active) setSlotsLoading(false)
      }
    }

    loadSlots()

    return () => {
      active = false
    }
  }, [availabilityRows, bookingForm.date, bookingForm.mode, currentPatient?.id, doctorIdCandidates, modalOpen, professional?.id])

  if (loading) {
    return <p className="p-8 text-center text-text-muted-v2">Carregando agendamento...</p>
  }

  if (error) {
    return <p className="p-8 text-center text-red-400">Erro ao carregar agendamento: {error}</p>
  }

  if (!professional) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-border-default-v2 bg-surface-card p-8 text-center text-text-heading">
        <h1 className="text-xl font-bold">Profissional nao encontrado</h1>
        <button
          className="mt-6 rounded-lg bg-accent-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover"
          onClick={() => navigate('/agendamento')}
          type="button"
        >
          Voltar
        </button>
      </div>
    )
  }

  const specialty = getSpecialty(professional)
  const canOpenBooking = Boolean(currentPatient?.id)
  const timeOptions = getTimeOptions(bookingForm.time, availableSlots)
  const bookingModeOptions = getBookingModeOptions(availabilityRows, bookingForm.date)

  function updateBookingForm(field, value) {
    setSubmitError('')
    setBookingForm((current) => {
      const next = {
        ...current,
        [field]: value,
      }

      if (field === 'date') {
        const modeForDate = getPreferredBookingMode(availabilityRows, value)
        next.time = ''
        if (modeForDate && !isBookingModeAvailableOnDate(availabilityRows, value, current.mode)) {
          next.mode = modeForDate
        }
      }

      if (field === 'mode') {
        next.time = ''
      }

      return next
    })
  }

  function openBookingModal() {
    const date = getInitialBookingDate(availabilityRows)
    const mode = getPreferredBookingMode(availabilityRows, date) || initialBookingForm.mode

    setSubmitError('')
    setSlotsError('')
    setAvailableSlots([])
    setBookingForm({ ...initialBookingForm, date, mode })
    setModalOpen(true)
  }

  function closeBookingModal() {
    if (submitting) return
    setModalOpen(false)
    setSubmitError('')
  }

  async function submitBooking(event) {
    event.preventDefault()
    if (!professional?.id || !currentPatient?.id) {
      setSubmitError('Nao foi possivel identificar o paciente ou o medico selecionado.')
      return
    }
    if (!bookingForm.time) {
      setSubmitError('Selecione um horario disponivel para concluir o agendamento.')
      return
    }

    const payload = {
      createdBy: viewerProfile?.id || viewerProfile?.userId || viewerProfile?.authUserId || '',
      date: bookingForm.date,
      durationMinutes: Number(bookingForm.durationMinutes) || 30,
      highPriority: false,
      mode: bookingForm.mode,
      notes: bookingForm.notes,
      patientId: currentPatient.id,
      professionalId: professional.id,
      room: bookingForm.mode === 'Teleconsulta' ? 'Virtual' : 'Consultorio 1',
      status: 'Agendado',
      time: bookingForm.time,
      type: bookingForm.type,
    }

    if (isAppointmentInPast(payload.date, payload.time)) {
      setSubmitError('Nao e possivel agendar consultas em horarios anteriores ao horario atual.')
      return
    }

    if (!availableSlots.some((slot) => slot.time === payload.time)) {
      setSubmitError('O horario selecionado nao esta mais disponivel. Escolha outro horario.')
      return
    }

    setSubmitting(true)
    try {
      const patientAppointments = await appointmentRepository
        .getAll({ patientId: currentPatient.id })
        .catch(() => [])

      if (hasPatientAppointmentOnDate(patientAppointments, currentPatient.id, payload.date)) {
        setSubmitError('Voce ja possui um agendamento nesta data.')
        return
      }

      await appointmentRepository.create(payload)
      window.alert('Consulta agendada com sucesso.')
      setModalOpen(false)
    } catch (err) {
      setSubmitError(translateErrorMessage(err.message, 'Erro ao criar agendamento.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-text-heading">
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border-default-v2 pb-6 md:flex-row md:items-center">
        <div className="flex items-start gap-4">
          <button
            className="mt-1 grid size-10 place-items-center rounded-lg border border-border-default-v2 bg-surface-card text-text-heading transition hover:bg-surface-card-hover"
            onClick={() => navigate('/agendamento')}
            type="button"
          >
            <SchedulingIcon className="size-5" name="arrow-left" />
          </button>
          <div>
            <h1 className="text-[32px] font-bold leading-8 tracking-[-0.02em] text-text-heading">{professional.name}</h1>
            <p className="mt-1 text-sm text-text-muted-v2">{specialty || 'Especialidade nao informada'}</p>
          </div>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center rounded-lg bg-accent-primary px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-55"
          disabled={!canOpenBooking}
          onClick={openBookingModal}
          type="button"
        >
          Novo Agendamento
        </button>
      </div>

      {!canOpenBooking ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Nao foi possivel vincular seu usuario a um cadastro de paciente. Atualize seu perfil antes de agendar.
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(18rem,0.5fr)_minmax(0,1fr)] lg:items-start">
        <div className="rounded-2xl border border-[#60a5fa]/20 bg-[#3b82f6]/5 p-5 shadow-sm shadow-[#3b82f6]/5">
          <div className="flex items-start gap-5">
            <div className="grid size-16 shrink-0 place-items-center rounded-full border border-[#60a5fa]/35 bg-[#3b82f6]/20 text-[var(--professional-blue-text)]">
              <SchedulingIcon className="size-10" name="user" />
            </div>
            <div className="min-w-0">
              <p className="break-words text-xl font-bold text-text-heading">{professional.name}</p>
              <p className="mt-1 break-words text-sm text-text-muted-v2">{specialty || 'Especialidade nao informada'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#3b82f6]/15 px-3 py-1 text-xs font-bold text-[var(--professional-blue-text)]">
                  {professional.crm ? `CRM ${professional.crm}${professional.crm_uf ? `-${professional.crm_uf}` : ''}` : 'CRM nao informado'}
                </span>
                <span className="rounded-full border border-[#60a5fa]/20 bg-[#3b82f6]/10 px-3 py-1 text-xs font-bold text-text-muted-v2">
                  {professional.unit || 'Unidade nao informada'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 md:grid-cols-2">
            {[
              ['Nome', professional.name || 'Nao informado'],
              ['Especialidade', specialty || 'Nao informada'],
              ['CRM', professional.crm ? `${professional.crm}${professional.crm_uf ? `-${professional.crm_uf}` : ''}` : 'Nao informado'],
              ['Unidade', professional.unit || 'Nao informada'],
              ['E-mail', professional.email || 'Nao informado'],
              ['Telefone', professional.phone || 'Nao informado'],
            ].map(([label, value]) => (
              <div className="rounded-lg border border-[#60a5fa]/15 bg-surface-card/70 px-3 py-2" key={label}>
                <p className="text-[11px] font-semibold uppercase text-text-muted-v2">{label}</p>
                <p className="mt-1 break-words text-sm font-semibold leading-5 text-text-heading">{value}</p>
              </div>
            ))}
          </div>
        </div>

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
      </section>

      <PatientBookingModal
        currentPatient={currentPatient}
        form={bookingForm}
        onClose={closeBookingModal}
        onSubmit={submitBooking}
        onUpdate={updateBookingForm}
        open={modalOpen}
        professional={professional}
        slotsError={slotsError}
        slotsLoading={slotsLoading}
        submitError={submitError}
        submitting={submitting}
        modeOptions={bookingModeOptions}
        timeOptions={timeOptions}
      />
    </div>
  )
}

function PatientBookingModal({
  currentPatient,
  form,
  onClose,
  onSubmit,
  onUpdate,
  open,
  professional,
  slotsError,
  slotsLoading,
  submitError,
  submitting,
  modeOptions = ['Presencial', 'Teleconsulta'],
  timeOptions,
}) {
  if (!open) return null
  const visibleModeOptions = modeOptions.includes(form.mode)
    ? modeOptions
    : [form.mode, ...modeOptions].filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="agenda-modal-shell flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border-default-v2 bg-surface-card shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border-default-v2 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-sm bg-accent-primary text-white">
              <StethoscopeIcon className="size-5" />
            </span>
            <h2 className="text-lg font-bold text-text-body">Novo Agendamento</h2>
          </div>
          <button
            aria-label="Fechar"
            className="grid size-8 place-items-center rounded-sm text-xl leading-none text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-body"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        <form className="min-h-0 overflow-y-auto p-5" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <DarkField label="Paciente">
              <input
                className="h-11 rounded-md border border-border-default-v2 bg-surface-card px-3 text-sm text-text-muted-v2 outline-none"
                disabled
                readOnly
                value={getPatientLabel(currentPatient) || 'Paciente nao vinculado'}
              />
            </DarkField>

            <DarkField label="Profissional">
              <input
                className="h-11 rounded-md border border-border-default-v2 bg-surface-card px-3 text-sm text-text-muted-v2 outline-none"
                disabled
                readOnly
                value={professional?.name || 'Medico nao informado'}
              />
            </DarkField>

            <DarkField label="Dia">
              <input
                className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none [color-scheme:dark] focus:border-accent-primary"
                min={formatLocalDateInput(new Date())}
                onChange={(event) => onUpdate('date', event.target.value)}
                type="date"
                value={form.date}
              />
            </DarkField>

            <DarkField label="Formato">
              <select
                className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary"
                onChange={(event) => onUpdate('mode', event.target.value)}
                value={form.mode}
              >
                {visibleModeOptions.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </DarkField>

            <DarkField label="Horario">
              <select
                className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary disabled:cursor-not-allowed disabled:text-text-muted-v2"
                disabled={slotsLoading || !timeOptions.length}
                onChange={(event) => onUpdate('time', event.target.value)}
                required
                value={form.time}
              >
                <option value="">
                  {slotsLoading ? 'Calculando horarios...' : 'Selecione um horario disponivel'}
                </option>
                {timeOptions.map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
              {slotsLoading ? <span className="text-xs font-normal text-text-muted-v2">Calculando horarios...</span> : null}
              {slotsError ? <span className="text-xs font-normal text-amber-400">{slotsError}</span> : null}
              {!slotsLoading && !timeOptions.length ? (
                <span className="text-xs font-normal text-amber-400">Nenhum horario disponivel para este medico nesta data.</span>
              ) : null}
            </DarkField>

            <DarkField label="Tipo de consulta">
              <select
                className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary"
                onChange={(event) => onUpdate('type', event.target.value)}
                value={form.type}
              >
                {appointmentTypeOptions.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </DarkField>

            <DarkField label="Duracao">
              <input
                className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary"
                max="240"
                min="15"
                onChange={(event) => onUpdate('durationMinutes', event.target.value)}
                step="15"
                type="number"
                value={form.durationMinutes}
              />
            </DarkField>

            <DarkField className="md:col-span-2" label="Observacoes">
              <textarea
                className="min-h-28 w-full resize-y rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-5 text-text-body outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary"
                onChange={(event) => onUpdate('notes', event.target.value)}
                placeholder="Observacoes sobre o agendamento"
                value={form.notes}
              />
            </DarkField>
          </div>

          {submitError ? (
            <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{submitError}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button
              className="h-10 rounded-sm border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card-hover"
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              Fechar
            </button>
            <button
              className="h-10 rounded-sm border border-accent-primary bg-accent-primary px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:border-border-default-v2 disabled:bg-surface-card-hover disabled:text-text-muted-v2"
              disabled={submitting || slotsLoading || !form.time}
              type="submit"
            >
              {submitting ? 'Agendando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
                    title={`${formatProfessionalTimeRange(row)} - ${formatProfessionalAppointmentType(row.appointmentType)} - ${row.slotMinutes || 30} min`}
                  >
                    <p className="truncate font-bold">{formatProfessionalTimeRange(row)}</p>
                    <p className="truncate text-[10px] font-semibold text-[var(--professional-blue-text)]">
                      {formatProfessionalAppointmentType(row.appointmentType)} - {row.slotMinutes || 30} min
                    </p>
                  </div>
                ))
              ) : (
                <p className="flex min-h-12 items-center justify-center rounded-lg border border-dashed border-[#60a5fa]/15 px-2 py-2 text-center text-[11px] leading-4 text-text-muted-v2">
                  Sem horarios
                </p>
              )}
              {dayRows.length > visibleRows.length ? (
                <span className="truncate text-[10px] font-bold text-[var(--professional-blue-text)]">+ {dayRows.length - visibleRows.length} horarios</span>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function DarkField({ children, className = '', label }) {
  return (
    <label className={`grid gap-2 text-sm font-semibold text-text-muted-v2 ${className}`}>
      <span>{label}</span>
      {children}
    </label>
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

function getTimeOptions(selectedTime, slots) {
  return [
    ...new Set([
      selectedTime,
      ...slots.map((slot) => slot.time),
    ].filter(Boolean)),
  ].sort()
}

function getInitialBookingDate(availabilityRows) {
  const today = parseLocalDate(formatLocalDateInput(new Date()))
  const activeRows = getActiveAvailabilityRows(availabilityRows)
  if (!today || !activeRows.length) return formatLocalDateInput(new Date())

  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(today)
    candidate.setDate(today.getDate() + offset)
    const weekday = candidate.getDay()

    if (activeRows.some((row) => Number(row.weekday) === weekday)) {
      return formatLocalDateInput(candidate)
    }
  }

  return formatLocalDateInput(new Date())
}

function getBookingModeOptions(availabilityRows, date) {
  const activeRows = getActiveAvailabilityRows(availabilityRows)
  const dayRows = getAvailabilityRowsForDate(activeRows, date)
  const sourceRows = dayRows.length ? dayRows : activeRows
  const modes = [
    ...new Set(sourceRows.map((row) => toBookingMode(row.appointmentType)).filter(Boolean)),
  ]

  return modes.length ? modes : ['Presencial', 'Teleconsulta']
}

function getPreferredBookingMode(availabilityRows, date) {
  return getBookingModeOptions(availabilityRows, date)[0] || ''
}

function isBookingModeAvailableOnDate(availabilityRows, date, mode) {
  const normalizedMode = normalizeAppointmentTypeKey(mode)
  const dayRows = getAvailabilityRowsForDate(getActiveAvailabilityRows(availabilityRows), date)
  if (!dayRows.length || !normalizedMode) return false

  return dayRows.some((row) => normalizeAppointmentTypeKey(row.appointmentType) === normalizedMode)
}

function getAvailabilityRowsForDate(rows, date) {
  const weekday = parseLocalDate(date)?.getDay()
  if (!Number.isInteger(weekday)) return []
  return rows.filter((row) => Number(row.weekday) === weekday)
}

function getActiveAvailabilityRows(rows) {
  return (rows || []).filter((row) => {
    const weekday = Number(row.weekday)
    return row.active !== false && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
  })
}

function toBookingMode(type) {
  return normalizeAppointmentTypeKey(type) === 'telemedicina' ? 'Teleconsulta' : 'Presencial'
}

function normalizeAppointmentTypeKey(type) {
  const normalized = normalizeSearch(type)
  if (!normalized) return ''
  return normalized.includes('tele') ? 'telemedicina' : 'presencial'
}

function hasPatientAppointmentOnDate(appointments, patientId, date) {
  return appointments.some((appointment) => {
    if (String(appointment.patientId || '') !== String(patientId || '')) return false
    if (['cancelada', 'cancelado', 'cancelled'].includes(normalizeSearch(appointment.status))) return false
    return appointment.date === date
  })
}

function uniqueAppointments(appointments) {
  const seen = new Set()
  return appointments.filter((appointment) => {
    const key = appointment.id || `${appointment.patientId}-${appointment.professionalId}-${appointment.date}-${appointment.time}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isAppointmentInPast(date, time) {
  const parsedDate = parseLocalDate(date)
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})/)
  if (!parsedDate || !match) return false
  parsedDate.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return parsedDate.getTime() < Date.now()
}

function getPatientLabel(patient) {
  return patient?.name || patient?.full_name || patient?.nome || ''
}

function getSpecialty(professional) {
  return professional?.specialty || professional?.specialidade || professional?.role || ''
}

function sameIdentifier(first, second) {
  return normalizeIdentifier(first) === normalizeIdentifier(second)
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

// Funções auxiliares para disponibilidades múltiplas
function getProfessionalIdCandidates(professional) {
  if (!professional) return []

  const candidates = [
    professional.id,
    professional.doctorId,
    professional.doctor_id,
    professional.medicoId,
    professional.medico_id,
    professional.userId,
    professional.user_id,
    professional.authUserId,
    professional.auth_user_id,
    professional.profileId,
    professional.profile_id,
  ]

  return candidates.filter((id, index) =>
    id && candidates.findIndex((candidate) => sameIdentifier(candidate, id)) === index,
  )
}

async function getFirstAvailableRowsForDoctor(doctorIdCandidates) {
  if (!doctorIdCandidates || doctorIdCandidates.length === 0) return []

  try {
    // Tenta buscar disponibilidades para o primeiro candidato
    // Se não encontrar, tenta os próximos
    for (const doctorId of doctorIdCandidates) {
      try {
        const rows = await availabilityRepository.getAll({
          doctorId,
          order: 'weekday.asc,start_time.asc',
        })
        if (rows && rows.length > 0) {
          return rows
        }
      } catch {
        // Continua com o próximo candidato
        continue
      }
    }
    // Se nenhum candidato tiver disponibilidades, tenta o primeiro
    return await availabilityRepository.getAll({
      doctorId: doctorIdCandidates[0],
      order: 'weekday.asc,start_time.asc',
    })
  } catch {
    return []
  }
}

async function getFirstAvailableSlotsForDoctor(doctorIdCandidates, options) {
  if (!doctorIdCandidates || doctorIdCandidates.length === 0) return []

  const { date, appointmentType, preferredDoctorId } = options

  try {
    // Tenta usar o doctorId preferido primeiro
    if (preferredDoctorId && doctorIdCandidates.includes(preferredDoctorId)) {
      try {
        const slots = await availabilityRepository.getAvailableSlots({
          appointmentType,
          date,
          doctorId: preferredDoctorId,
        })
        if (slots && slots.length > 0) {
          return slots
        }
      } catch {
        // Continua com outro candidato
      }
    }

    // Tenta os outros candidatos
    for (const doctorId of doctorIdCandidates) {
      if (doctorId === preferredDoctorId) continue // Já tentou este
      try {
        const slots = await availabilityRepository.getAvailableSlots({
          appointmentType,
          date,
          doctorId,
        })
        if (slots && slots.length > 0) {
          return slots
        }
      } catch {
        // Continua com o próximo candidato
        continue
      }
    }

    // Se nenhum candidato funcionou, tenta o preferido ou o primeiro
    return await availabilityRepository.getAvailableSlots({
      appointmentType,
      date,
      doctorId: preferredDoctorId || doctorIdCandidates[0],
    })
  } catch {
    return []
  }
}

async function getAppointmentsForDoctorCandidates(doctorIdCandidates) {
  if (!doctorIdCandidates || doctorIdCandidates.length === 0) return []

  try {
    // Coleta agendamentos de todos os candidatos
    const allAppointments = []
    for (const doctorId of doctorIdCandidates) {
      try {
        const appointments = await appointmentRepository.getAll({ doctorId }).catch(() => [])
        if (appointments && appointments.length > 0) {
          allAppointments.push(...appointments)
        }
      } catch {
        // Continua com o próximo candidato
        continue
      }
    }
    return uniqueAppointments(allAppointments)
  } catch {
    return []
  }
}

function resolveDoctorIdForDate(availabilityRows, doctorIdCandidates) {
  if (!availabilityRows || !doctorIdCandidates) return null

  // Se houver apenas um candidato, retorna ele
  if (doctorIdCandidates.length === 1) {
    return doctorIdCandidates[0]
  }

  // Tenta encontrar o melhor candidato baseado nas disponibilidades
  // Retorna o ID mais comum nas linhas de disponibilidade
  const doctorIdCount = {}
  availabilityRows.forEach((row) => {
    if (row.doctorId) {
      doctorIdCount[row.doctorId] = (doctorIdCount[row.doctorId] || 0) + 1
    }
  })

  // Se algum doctorId foi contado, retorna o mais frequente
  const bestDoctorId = Object.keys(doctorIdCount).sort((a, b) => doctorIdCount[b] - doctorIdCount[a])[0]
  if (bestDoctorId && doctorIdCandidates.includes(bestDoctorId)) {
    return bestDoctorId
  }

  // Se não encontrou, retorna o primeiro candidato
  return doctorIdCandidates[0]
}

function SchedulingIcon({ className = 'size-4', name }) {
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
