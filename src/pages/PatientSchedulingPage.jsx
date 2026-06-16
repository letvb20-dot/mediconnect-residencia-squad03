import { useEffect, useMemo, useState } from 'react'

import { StethoscopeIcon } from '../components/Brand.jsx'
import { filterBookableAvailableSlots, recoverCurrentPatient, sendAppointmentConfirmationMessages } from '../hooks/useAgenda.js'
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
const appointmentTypeOptions = ['Retorno', 'Primeira consulta', 'Exame', 'Avaliação pré-op']
const APPOINTMENT_REQUEST_TIMEOUT_MS = 15000
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
  const [myAppointments, setMyAppointments] = useState([])
  const [myAppointmentsLoading, setMyAppointmentsLoading] = useState(true)
  const [myAppointmentsError, setMyAppointmentsError] = useState('')
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

        if (resolvedPatient?.id) {
          setMyAppointmentsLoading(true)
          setMyAppointmentsError('')
          try {
            const patientAppointments = await appointmentRepository.getAll({ patientId: resolvedPatient.id })
            if (!active) return
            setMyAppointments(sortAppointmentsByDateTime(patientAppointments || []))
          } catch (appointmentsError) {
            if (!active) return
            setMyAppointments([])
            setMyAppointmentsError(translateErrorMessage(appointmentsError.message, 'Não foi possível carregar suas consultas.'))
          } finally {
            if (active) setMyAppointmentsLoading(false)
          }
        } else {
          setMyAppointments([])
          setMyAppointmentsLoading(false)
        }
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
    () => professionals.find((item) => sameIdentifier(item.id, decodedProfessionalId)) || null,
    [decodedProfessionalId, professionals],
  )

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

  useEffect(() => {
    if (!modalOpen || !professional?.id) return undefined

    let active = true

    async function loadSlots() {
      setSlotsLoading(true)
      setSlotsError('')

      try {
        const date = bookingForm.date
        const [slots, doctorAppointments, patientAppointments] = await Promise.all([
          availabilityRepository.getAvailableSlots({ doctorId: professional.id, date }),
          appointmentRepository.getAll({ doctorId: professional.id }).catch(() => []),
          currentPatient?.id ? appointmentRepository.getAll({ patientId: currentPatient.id }).catch(() => []) : [],
        ])
        if (!active) return

        const bookableSlots = filterBookableAvailableSlots(slots, {
          appointments: uniqueAppointments([...doctorAppointments, ...patientAppointments]),
          date,
          doctorId: professional.id,
        })
        setAvailableSlots(bookableSlots)
        setBookingForm((current) => {
          if (current.time && bookableSlots.some((slot) => slot.time === current.time)) return current
          return { ...current, time: bookableSlots[0]?.time || '' }
        })
      } catch (err) {
        if (active) {
          setAvailableSlots([])
          setSlotsError(translateErrorMessage(err.message, 'Não foi possível calcular horários disponíveis.'))
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
  }, [bookingForm.date, currentPatient?.id, modalOpen, professional?.id])

  if (loading) {
    return <p className="p-8 text-center text-text-muted-v2">Carregando agendamento...</p>
  }

  if (error) {
    return <p className="p-8 text-center text-red-400">Erro ao carregar agendamento: {error}</p>
  }

  if (!professional) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-border-default-v2 bg-surface-card p-8 text-center text-text-heading">
        <h1 className="text-xl font-bold">Profissional não encontrado</h1>
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

  function updateBookingForm(field, value) {
    setSubmitError('')
    setBookingForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'date' ? { time: '' } : {}),
    }))
  }

  function openBookingModal() {
    setSubmitError('')
    setSlotsError('')
    setAvailableSlots([])
    setBookingForm({ ...initialBookingForm, date: formatLocalDateInput(new Date()) })
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
      setSubmitError('Não foi possível identificar o paciente ou o médico selecionado.')
      return
    }
    if (!bookingForm.time) {
      setSubmitError('Selecione um horário disponível para concluir o agendamento.')
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
      room: bookingForm.mode === 'Teleconsulta' ? 'Virtual' : 'Consultório 1',
      status: 'Agendado',
      time: bookingForm.time,
      type: bookingForm.type,
    }

    if (isAppointmentInPast(payload.date, payload.time)) {
      setSubmitError('Não é possível agendar consultas em horários anteriores ao horário atual.')
      return
    }

    if (!availableSlots.some((slot) => slot.time === payload.time)) {
      setSubmitError('O horário selecionado não está mais disponível. Escolha outro horário.')
      return
    }

    setSubmitting(true)
    try {
      const patientAppointments = await withTimeout(
        appointmentRepository.getAll({ patientId: currentPatient.id }),
        APPOINTMENT_REQUEST_TIMEOUT_MS,
        'O servidor demorou para validar seus agendamentos. Tente novamente.',
      )

      if (hasPatientAppointmentOnDate(patientAppointments, currentPatient.id, payload.date)) {
        setSubmitError('Você já possui um agendamento nesta data.')
        return
      }

      const createdAppointment = await withTimeout(
        appointmentRepository.create(payload),
        APPOINTMENT_REQUEST_TIMEOUT_MS,
        'O servidor demorou para confirmar o agendamento. Tente novamente.',
      )

      // O POST não retorna o JOIN de doctors(full_name) — preenche manualmente com
      // o profissional e o paciente que já temos em memória para a UI não cair no
      // fallback "Médico" / "Paciente" do mapper.
      const enrichedAppointment = {
        ...createdAppointment,
        professional: createdAppointment.professional && createdAppointment.professional !== 'Médico'
          ? createdAppointment.professional
          : professional?.name || createdAppointment.professional,
        patient: createdAppointment.patient && createdAppointment.patient !== 'Paciente'
          ? createdAppointment.patient
          : currentPatient?.name || createdAppointment.patient,
      }

      setMyAppointments((current) => sortAppointmentsByDateTime([...current, enrichedAppointment]))
      sendAppointmentConfirmationMessages(payload, {
        patients: [currentPatient],
        professionals: [professional],
      }).catch((sendError) => {
        console.warn('Falha ao enviar comunicacao automatica de agendamento.', sendError)
      })
      showToast('Consulta agendada', 'Sua consulta foi salva com sucesso.', 'success')
      setModalOpen(false)
      setSubmitError('')
    } catch (err) {
      const message = translateErrorMessage(err.message, 'Erro ao criar agendamento.')
      setSubmitError(message)
      showToast('Falha ao agendar', message, 'error')
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
            <p className="mt-1 text-sm text-text-muted-v2">{specialty || 'Especialidade não informada'}</p>
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
          Não foi possível vincular seu usuário a um cadastro de paciente. Atualize seu perfil antes de agendar.
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
            {[
              ['Nome', professional.name || 'Não informado'],
              ['Especialidade', specialty || 'Não informada'],
              ['CRM', professional.crm ? `${professional.crm}${professional.crm_uf ? `-${professional.crm_uf}` : ''}` : 'Não informado'],
              ['Unidade', professional.unit || 'Não informada'],
              ['Telefone', professional.phone || 'Não informado'],
            ].map(([label, value]) => (
              <div className="rounded-lg border border-[#60a5fa]/15 bg-surface-card/70 px-3 py-2" key={label}>
                <p className="text-[11px] font-semibold uppercase text-text-muted-v2">{label}</p>
                <p className="mt-1 break-words text-sm font-semibold leading-5 text-text-heading">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <MyAppointmentsSection
          appointments={myAppointments}
          error={myAppointmentsError}
          loading={myAppointmentsLoading}
          patient={currentPatient}
        />

        <div className="rounded-2xl border border-[#60a5fa]/20 bg-[#3b82f6]/5 p-3 shadow-sm shadow-[#3b82f6]/5 lg:col-span-2">
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
  timeOptions,
}) {
  if (!open) return null

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
                value={getPatientLabel(currentPatient) || 'Paciente não vinculado'}
              />
            </DarkField>

            <DarkField label="Profissional">
              <input
                className="h-11 rounded-md border border-border-default-v2 bg-surface-card px-3 text-sm text-text-muted-v2 outline-none"
                disabled
                readOnly
                value={professional?.name || 'Médico não informado'}
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

            <DarkField label="Horário">
              <select
                className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary disabled:cursor-not-allowed disabled:text-text-muted-v2"
                disabled={slotsLoading || !timeOptions.length}
                onChange={(event) => onUpdate('time', event.target.value)}
                required
                value={form.time}
              >
                <option value="">
                  {slotsLoading ? 'Calculando horários...' : 'Selecione um horário disponível'}
                </option>
                {timeOptions.map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
              {slotsLoading ? <span className="text-xs font-normal text-text-muted-v2">Calculando horários...</span> : null}
              {slotsError ? <span className="text-xs font-normal text-amber-400">{slotsError}</span> : null}
              {!slotsLoading && !timeOptions.length ? (
                <span className="text-xs font-normal text-amber-400">Nenhum horário disponível para este médico nesta data.</span>
              ) : null}
            </DarkField>

            <DarkField label="Formato">
              <select
                className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary"
                onChange={(event) => onUpdate('mode', event.target.value)}
                value={form.mode}
              >
                <option>Teleconsulta</option>
                <option>Presencial</option>
              </select>
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

            <DarkField label="Duração">
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

            <DarkField className="md:col-span-2" label="Observações">
              <textarea
                className="min-h-28 w-full resize-y rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-5 text-text-body outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary"
                onChange={(event) => onUpdate('notes', event.target.value)}
                placeholder="Observações sobre o agendamento"
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

function MyAppointmentsSection({ appointments, error, loading, patient }) {
  const patientName = getPatientLabel(patient) || 'paciente'

  return (
    <div className="rounded-2xl border border-[#60a5fa]/20 bg-[#3b82f6]/5 p-5 shadow-sm shadow-[#3b82f6]/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-text-heading">Minhas consultas</h2>
          <p className="mt-1 text-sm text-text-muted-v2">Acompanhe aqui tudo o que está agendado para {patientName}.</p>
        </div>
        <span className="rounded-full bg-[#3b82f6]/15 px-3 py-1 text-xs font-semibold text-[var(--professional-blue-text)]">
          {appointments.length} registros
        </span>
      </div>

      <div className="mt-4 min-h-40 rounded-xl border border-[#60a5fa]/15 bg-surface-card/70 p-3">
        {loading ? (
          <p className="p-4 text-sm text-text-muted-v2">Carregando consultas...</p>
        ) : error ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{error}</p>
        ) : appointments.length ? (
          <div className="grid gap-3">
            {appointments.map((appointment) => (
              <article className="rounded-lg border border-border-default-v2 bg-surface-card px-4 py-3" key={appointment.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-text-heading">{appointment.type || 'Consulta'}</p>
                    <p className="mt-1 text-sm text-text-muted-v2">{appointment.professional || 'Médico não informado'}</p>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="text-sm font-semibold text-text-heading">{formatAppointmentDateTime(appointment)}</p>
                    <span className="mt-1 inline-flex rounded-full border border-border-default-v2 bg-surface-card-hover px-2.5 py-1 text-xs font-semibold text-text-body">
                      {appointment.status || 'Agendado'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-text-muted-v2">
                  {appointment.mode ? <span className="rounded-full bg-surface-card-hover px-2.5 py-1">{appointment.mode}</span> : null}
                  {appointment.room ? <span className="rounded-full bg-surface-card-hover px-2.5 py-1">{appointment.room}</span> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-text-muted-v2">Nenhuma consulta encontrada ainda.</p>
        )}
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

function sortAppointmentsByDateTime(appointments) {
  return [...appointments].sort((left, right) => getAppointmentDateTime(left) - getAppointmentDateTime(right))
}

function getAppointmentDateTime(appointment) {
  const value = `${appointment?.date || ''}T${appointment?.time || '00:00'}:00`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime()
}

function formatAppointmentDateTime(appointment) {
  const dateTime = new Date(`${appointment?.date || ''}T${appointment?.time || '00:00'}:00`)
  if (Number.isNaN(dateTime.getTime())) {
    return [appointment?.date, appointment?.time].filter(Boolean).join(' ') || 'Data não informada'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dateTime)
}

function showToast(title, description, type = 'default') {
  window.dispatchEvent(new CustomEvent('app:show_toast', {
    detail: { title, description, type },
  }))
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId = null
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  return Promise.race([
    promise.finally(() => {
      if (timeoutId) window.clearTimeout(timeoutId)
    }),
    timeoutPromise,
  ])
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
