import { useEffect, useMemo, useState } from 'react'
import { isSameDay } from 'date-fns'

import { appointmentRepository } from '../repositories/appointmentRepository.js'
import { AGENDA_EXCEPTIONS_CHANGED_EVENT, availabilityRepository } from '../repositories/availabilityRepository.js'
import { communicationRepository } from '../repositories/communicationRepository.js'
import { notificationRepository } from '../repositories/notificationRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import { visitRepository } from '../repositories/visitRepository.js'
import { waitlistRepository } from '../repositories/waitlistRepository.js'
import { aiClient } from '../lib/ai/aiClient.js'
import { formatLocalDateInput, parseLocalDate, sortAppointmentsByTime } from '../utils/agendaDate.js'
import { isCommunicationEligiblePatient } from '../utils/communicationEligibility.js'
import { buildPatientFromProfile, resolveCurrentPatient } from '../utils/patientIdentity.js'

const BOOKING_DAY_START = '07:00'
const BOOKING_DAY_END = '18:00'
const BOOKING_SLOT_MINUTES = 30

const initialForm = {
  patientId: '',
  professionalId: '',
  type: 'Retorno',
  time: '',
  durationMinutes: 30,
  mode: 'Teleconsulta',
  status: 'Agendado',
  highPriority: false,
  notes: '',
}

export function useAgenda() {
  const [patients, setPatients] = useState([])
  const [professionals, setProfessionals] = useState([])
  const [users, setUsers] = useState([])
  const [currentProfessional, setCurrentProfessional] = useState(null)
  const [currentPatient, setCurrentPatient] = useState(null)
  const [viewerProfile, setViewerProfile] = useState(null)
  const [localAppointments, setLocalAppointments] = useState([])
  const [agendaExceptions, setAgendaExceptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState('')

  const [activeView, setActiveView] = useState('Dia')
  const [baseDate, setBaseDate] = useState(new Date())
  const [status, setStatus] = useState('Todos')
  const [doctorFilter, setDoctorFilter] = useState('Todos')
  const [doctorSearch, setDoctorSearch] = useState('')
  const [unitFilter, setUnitFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState(null)
  const [form, setForm] = useState(initialForm)

  const agendaScope = viewerProfile?.isPatient ? 'patient' : viewerProfile?.isDoctor ? 'doctor' : 'global'
  const canManageAppointment = agendaScope !== 'patient'
  const canCreateAppointment = canManageAppointment && (agendaScope === 'doctor'
    ? Boolean(currentProfessional?.id)
    : professionals.length > 0)

  useEffect(() => {
    let active = true

    async function loadAgendaContext() {
      try {
        setError('')

        const [professionalsData, currentProfile, usersData] = await Promise.all([
          professionalRepository.getAll(),
          profileRepository.getCurrentUserProfile(),
          userRepository.getAll().catch(() => []),
        ])
        const currentScope = currentProfile?.isPatient ? 'patient' : currentProfile?.isDoctor ? 'doctor' : 'global'
        const patientsData = await patientRepository.getAll().catch((patientLoadError) => {
          if (currentScope === 'patient') return []
          throw patientLoadError
        })

        if (!active) return

        const resolvedProfessional = professionalRepository.resolveCurrentProfessional(currentProfile, professionalsData)
        const resolvedPatient = currentScope === 'patient'
          ? await recoverCurrentPatient(currentProfile, patientsData || [], usersData || [])
          : null
        const initialProfessionalId =
          currentScope === 'doctor'
            ? resolvedProfessional?.id || ''
            : professionalsData?.[0]?.id || ''
        const scopedPatients = currentScope === 'patient'
          ? (resolvedPatient ? [resolvedPatient] : [])
          : patientsData || []

        setViewerProfile(currentProfile)
        setPatients(scopedPatients)
        setUsers(usersData || [])
        setCurrentProfessional(resolvedProfessional)
        setCurrentPatient(resolvedPatient)
        setProfessionals(professionalsData || [])
        setForm((current) => ({
          ...current,
          patientId: resolvedPatient?.id || (scopedPatients?.length ? scopedPatients[0].id : ''),
          professionalId: initialProfessionalId,
        }))

        if (currentScope === 'doctor' && !resolvedProfessional) {
          setLocalAppointments([])
          setError('Não foi possível vincular o médico logado a um profissional da base.')
          return
        }

        if (currentScope === 'patient' && !resolvedPatient?.id) {
          setLocalAppointments([])
          setError('Não foi possível vincular o usuário logado a um paciente da base.')
          return
        }

        const appointmentsData = await appointmentRepository.getAll({
          doctorId: currentScope === 'doctor' ? resolvedProfessional?.id : undefined,
          patientId: currentScope === 'patient' ? resolvedPatient?.id : undefined,
        })

        if (!active) return

        const appointmentsWithCreatorNames = resolveAppointmentCreatorNames(
          appointmentsData || [],
          usersData || [],
          currentProfile,
          professionalsData || [],
        )
        const appointmentsWithDisplayNames = resolveAppointmentDisplayNames(
          appointmentsWithCreatorNames,
          scopedPatients,
          professionalsData || [],
        )

        setLocalAppointments(
          currentScope === 'doctor' && resolvedProfessional
            ? filterAppointmentsByProfessional(appointmentsWithDisplayNames, resolvedProfessional.id)
            : currentScope === 'patient' && resolvedPatient
              ? filterAppointmentsByPatient(appointmentsWithDisplayNames, resolvedPatient.id)
            : sortAppointmentsByTime(appointmentsWithDisplayNames),
        )
      } catch (loadError) {
        if (!active) return

        console.error(loadError)
        setError(loadError.message || 'Erro ao carregar agenda.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadAgendaContext()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!modalOpen) return

    const targetProfessionalId = agendaScope === 'doctor'
      ? currentProfessional?.id
      : form.professionalId

    let active = true

    async function loadAvailableSlots() {
      if (!targetProfessionalId) {
        setAvailableSlots([])
        setSlotsError('')
        setForm((current) => current.time ? { ...current, time: '' } : current)
        return
      }

      setSlotsLoading(true)
      setSlotsError('')

      try {
        const slots = await availabilityRepository.getAvailableSlots({
          doctorId: targetProfessionalId,
          date: formatLocalDateInput(baseDate),
        })

        if (!active) return

        const activeSlots = filterBookableAvailableSlots(slots, {
          appointments: localAppointments,
          date: formatLocalDateInput(baseDate),
          doctorId: targetProfessionalId,
          ignoredAppointmentId: editingAppointment?.id,
        })
        setAvailableSlots(activeSlots)

        if (activeSlots.length) {
          setForm((current) =>
            current.time
              ? current
              : { ...current, time: activeSlots[0].time },
          )
        } else {
          setForm((current) => current)
        }
      } catch (loadError) {
        if (!active) return
        setAvailableSlots([])
        setSlotsError(loadError.message || 'Não foi possível calcular horários disponíveis.')
      } finally {
        if (active) setSlotsLoading(false)
      }
    }

    loadAvailableSlots()

    return () => {
      active = false
    }
  }, [agendaScope, baseDate, currentProfessional?.id, editingAppointment, form.mode, form.professionalId, localAppointments, modalOpen])

  useEffect(() => {
    let active = true

    async function loadAgendaExceptions() {
      const targetDoctorId = agendaScope === 'doctor'
        ? currentProfessional?.id
        : doctorFilter !== 'Todos'
          ? doctorFilter
          : ''

      if (!targetDoctorId) {
        setAgendaExceptions([])
        return
      }

      try {
        const exceptions = await availabilityRepository.getExceptions({ doctorId: targetDoctorId })
        if (active) setAgendaExceptions(exceptions)
      } catch {
        if (active) setAgendaExceptions([])
      }
    }

    loadAgendaExceptions()
    window.addEventListener(AGENDA_EXCEPTIONS_CHANGED_EVENT, loadAgendaExceptions)

    return () => {
      active = false
      window.removeEventListener(AGENDA_EXCEPTIONS_CHANGED_EVENT, loadAgendaExceptions)
    }
  }, [agendaScope, currentProfessional?.id, doctorFilter])

  const scopedAppointments = useMemo(() => {
    let filtered = localAppointments

    if (agendaScope === 'patient') {
      return sortAppointmentsByTime(filtered)
    }

    if (agendaScope !== 'doctor' && doctorFilter !== 'Todos') {
      filtered = filterAppointmentsByProfessional(filtered, doctorFilter)
    }

    if (agendaScope !== 'doctor') {
      const normalizedDoctorSearch = normalizeValue(doctorSearch)
      const normalizedUnit = normalizeValue(unitFilter)

      if (normalizedDoctorSearch || normalizedUnit) {
        filtered = filtered.filter((appointment) => {
          const professional = professionals.find(
            (item) => normalizeValue(item.id) === normalizeValue(appointment.professionalId),
          )
          const professionalName = normalizeValue(professional?.name || appointment.professional)
          const professionalUnit = normalizeValue(professional?.unit || appointment.unit)

          return (
            (!normalizedDoctorSearch || professionalName.includes(normalizedDoctorSearch)) &&
            (!normalizedUnit || professionalUnit === normalizedUnit)
          )
        })
      }
    }

    return sortAppointmentsByTime(filtered)
  }, [agendaScope, doctorFilter, doctorSearch, localAppointments, professionals, unitFilter])

  const scopedExceptionMarkers = useMemo(
    () => buildExceptionMarkers(agendaExceptions, professionals),
    [agendaExceptions, professionals],
  )

  const visibleAppointments = useMemo(() => {
    let filtered = [...scopedAppointments, ...scopedExceptionMarkers]

    if (status === 'Prioridade') {
      filtered = filtered.filter(isHighPriorityAppointment)
    } else if (status !== 'Todos') {
      filtered = filtered.filter((appointment) => appointment.status === status)
    }

    if (activeView === 'Dia') {
      filtered = filtered.filter((appointment) => {
        if (!appointment.date) return false

        const appointmentDate = parseLocalDate(appointment.date)
        if (!appointmentDate) return false

        return isSameDay(appointmentDate, baseDate)
      })
    }

    return sortAppointmentsByTime(filtered)
  }, [activeView, baseDate, scopedAppointments, scopedExceptionMarkers, status])

  const dailyOccupancyAppointments = useMemo(
    () =>
      sortAppointmentsByTime(
        [...scopedAppointments, ...buildExceptionOccupancy(agendaExceptions, professionals)].filter((appointment) => {
          if (!appointment.date) return false

          const appointmentDate = parseLocalDate(appointment.date)
          if (!appointmentDate) return false

          return isSameDay(appointmentDate, baseDate)
        }),
      ),
    [agendaExceptions, baseDate, professionals, scopedAppointments],
  )

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (['professionalId', 'mode'].includes(field)) next.time = ''
      return next
    })
  }

  function openCreateModal({ date, patientId, time } = {}) {
    if (!canCreateAppointment) return

    if (date) {
      const parsedDate = parseLocalDate(date)
      if (parsedDate) setBaseDate(parsedDate)
    }

    setEditingAppointment(null)
    setAvailableSlots([])
    setSlotsError('')
    setForm((current) => ({
      ...initialForm,
      patientId: patientId || current.patientId || patients[0]?.id || '',
      professionalId:
        agendaScope === 'doctor'
          ? currentProfessional?.id || ''
          : current.professionalId || professionals[0]?.id || '',
      time: time ?? initialForm.time,
    }))
    setModalOpen(true)
  }

  function openAppointmentModal(appointment) {
    const parsedDate = parseLocalDate(appointment.date)
    if (parsedDate) setBaseDate(parsedDate)

    setEditingAppointment(appointment)
    setAvailableSlots([])
    setSlotsError('')
    setForm({
      patientId: appointment.patientId || '',
      professionalId: appointment.professionalId || '',
      type: appointment.type || initialForm.type,
      time: appointment.time || initialForm.time,
      durationMinutes: appointment.durationMinutes || initialForm.durationMinutes,
      mode: appointment.mode || initialForm.mode,
      status: appointment.status || initialForm.status,
      highPriority: Boolean(appointment.highPriority || appointment.priority === 'Alta'),
      notes: appointment.notes || '',
    })
    setModalOpen(true)
  }

  function openAppointmentById(appointmentId) {
    const appointment = localAppointments.find((item) => String(item.id) === String(appointmentId))
    if (!appointment) return false

    openAppointmentModal(appointment)
    return true
  }

  function closeAppointmentModal() {
    setModalOpen(false)
    setEditingAppointment(null)
  }

  async function handleSubmitAppointment(event) {
    event.preventDefault()
    if (!canManageAppointment) return

    if (editingAppointment) {
      await updateAppointment()
      return
    }

    await createAppointment()
  }

  async function createAppointment() {
    const payload = buildPayload()
    if (!payload) return

    if (isAppointmentInPast(payload.date, payload.time)) {
      alert('Não é possível agendar consultas em horários anteriores ao horário atual.')
      return
    }

    if (!isBookableTimeSlot(payload.time)) {
      alert('Selecione um horário entre 07:00 e 18:00, em intervalos de 30 minutos.')
      return
    }

    if (await patientHasAppointmentOnDate(payload)) {
      alert('Este paciente já possui um agendamento neste dia.')
      return
    }

    if (slotsLoading) {
      alert('Aguarde o cálculo de horários disponíveis antes de salvar.')
      return
    }

    const conflictingAppointment = findConflictingAppointment(payload, localAppointments)
    const slotAvailable = availableSlots.some((slot) => slot.time === normalizeTime(payload.time))

    if (conflictingAppointment || !slotAvailable) {
      const queued = visitRepository.enqueue(payload, { conflictingAppointment, patients, professionals })
      notifyAppointmentAction(
        'Paciente na fila de consultas',
        `${getPatientName(payload.patientId, patients)} entrou na fila para ${formatAppointmentDate(payload.date)} às ${normalizeTime(payload.time)}.`,
        payload,
      )
      alert(`Horário indisponível. ${queued.patient} foi adicionado(a) à fila de consultas e será agendado(a) automaticamente se houver cancelamento nesse horário.`)
      closeAppointmentModal()
      return
    }

    try {
      const created = await appointmentRepository.create(payload)
      setLocalAppointments((current) => sortAppointmentsByTime([...current, enrichAppointment(created, payload, patients, professionals)]))
      notifyAppointmentAction('Consulta marcada', `Consulta de ${getPatientName(payload.patientId, patients)} marcada para ${formatAppointmentDate(payload.date)} as ${payload.time}.`, payload, created)
      queueAppointmentConfirmationMessages(payload)
      closeAppointmentModal()
    } catch (createError) {
      alert(createError.message || 'Erro ao criar agendamento.')
    }
  }

  async function updateAppointment() {
    if (!editingAppointment) return

    const payload = buildPayload()
    if (!payload) return

    if (isAppointmentInPast(payload.date, payload.time) && !isStatusOnlyPastUpdate(payload, editingAppointment)) {
      alert('Não é possível agendar consultas em horários anteriores ao horário atual.')
      return
    }

    if (!isBookableTimeSlot(payload.time)) {
      alert('Selecione um horário entre 07:00 e 18:00, em intervalos de 30 minutos.')
      return
    }

    if (!isDoctorSlotAvailable(payload, localAppointments, editingAppointment.id)) {
      alert('Este médico já possui outro agendamento nesse horário.')
      return
    }

    if (await patientHasAppointmentOnDate(payload, editingAppointment.id)) {
      alert('Este paciente já possui outro agendamento neste dia.')
      return
    }

    try {
      const updated = await appointmentRepository.update(editingAppointment.id, payload)
      setLocalAppointments((current) =>
        sortAppointmentsByTime(
          current.map((appointment) =>
            appointment.id === editingAppointment.id
              ? enrichAppointment(updated, payload, patients, professionals)
              : appointment,
          ),
        ),
      )
      notifyAppointmentAction('Agendamento atualizado', getAppointmentUpdateNotificationDetail(payload, editingAppointment, patients), payload, updated)
      closeAppointmentModal()
    } catch (updateError) {
      alert(updateError.message || 'Erro ao atualizar agendamento.')
    }
  }

  async function handleCancelAppointment() {
    if (!canManageAppointment) return
    if (!editingAppointment) return
    if (!window.confirm('Tem certeza que deseja cancelar este agendamento?')) return

    const payload = buildPayload({ status: 'Cancelado' })
    if (!payload) return

    try {
      const cancelled = await appointmentRepository.cancel(editingAppointment.id, payload)
      const queuedAppointment = visitRepository.findNextForSlot(payload)
      let promotedAppointment = null
      let promotedPayload = null
      let promotionErrorMessage = ''

      if (queuedAppointment) {
        promotedPayload = buildAppointmentPayloadFromQueueItem(queuedAppointment, payload)
        try {
          promotedAppointment = await appointmentRepository.create(promotedPayload)
          visitRepository.markScheduled(queuedAppointment.id, promotedAppointment)
        } catch (promotionError) {
          console.error(promotionError)
          promotedPayload = null
          promotionErrorMessage = promotionError.message || 'Não foi possível chamar o próximo paciente da fila.'
        }
      }

      setLocalAppointments((current) =>
        sortAppointmentsByTime(
          [
            ...current.map((appointment) =>
              appointment.id === editingAppointment.id
                ? enrichAppointment(cancelled, payload, patients, professionals)
                : appointment,
            ),
            promotedAppointment
              ? enrichAppointment(promotedAppointment, promotedPayload, patients, professionals)
              : null,
          ].filter(Boolean),
        ),
      )
      notifyAppointmentAction('Consulta cancelada', `Consulta de ${getPatientName(payload.patientId, patients)} foi cancelada. Status atualizado para Cancelado.`, payload, cancelled)
      if (promotedAppointment && promotedPayload) {
        notifyAppointmentAction(
          'Paciente chamado da fila',
          `${getPatientName(promotedPayload.patientId, patients)} foi agendado para ${formatAppointmentDate(promotedPayload.date)} às ${promotedPayload.time}.`,
          promotedPayload,
          promotedAppointment,
        )
        queueAppointmentConfirmationMessages(promotedPayload)
      }
      if (promotionErrorMessage) {
        alert(`O cancelamento foi salvo, mas não foi possível agendar automaticamente o próximo paciente da fila. ${promotionErrorMessage}`)
      }
      if (!promotedAppointment) {
        offerSlotToWaitlist(payload)
      }
      closeAppointmentModal()
    } catch (cancelError) {
      alert(cancelError.message || 'Erro ao cancelar agendamento.')
    }
  }

  async function handleConfirmArrival() {
    if (!canManageAppointment) return
    if (!editingAppointment) return

    const payload = buildPayload({ status: 'Aguardando' })
    if (!payload) return

    try {
      const updated = await appointmentRepository.update(editingAppointment.id, { ...payload, status: 'Aguardando' })
      setLocalAppointments((current) =>
        sortAppointmentsByTime(
          current.map((appointment) =>
            appointment.id === editingAppointment.id
              ? enrichAppointment(updated, { ...payload, status: 'Aguardando' }, patients, professionals)
              : appointment,
          ),
        ),
      )
      notifyAppointmentAction(
        'Paciente em sala de espera',
        `${getPatientName(payload.patientId, patients)} confirmou presença e aguarda atendimento.`,
        { ...payload, status: 'Aguardando' },
        updated,
      )
      closeAppointmentModal()
    } catch (arrivalError) {
      alert(arrivalError.message || 'Erro ao confirmar a chegada do paciente.')
    }
  }

  function queueAppointmentConfirmationMessages(payload) {
    sendAppointmentConfirmationMessages(payload, { patients, professionals }).catch((sendError) => {
      console.warn('Falha ao enviar comunicacao automatica de agendamento.', sendError)
    })
  }

  function offerSlotToWaitlist(payload) {
    try {
      const waitlist = waitlistRepository.getAll().filter((entry) => entry.status === 'aguardando')
      if (!waitlist.length) return

      const slot = { doctorId: payload.professionalId, type: payload.mode, date: payload.date, time: payload.time }
      const [best] = aiClient.rankWaitlist({ waitlist, slot })
      if (!best) return

      notificationRepository.notifyCurrentUser({
        domain: 'agenda',
        channel: best.channel,
        title: 'Encaixe disponível na lista de espera',
        detail: `Horário liberado em ${formatAppointmentDate(payload.date)} às ${payload.time}. ${best.patientName} é o melhor encaixe (prioridade ${best.matchScore}).`,
        route: '/lista-espera',
      }).catch(() => null)
      waitlistRepository.markNotified(best.id, best.channel)
    } catch (waitlistError) {
      console.error(waitlistError)
    }
  }

  function buildPayload(overrides = {}) {
    if (!form.patientId) {
      alert('Selecione um paciente para salvar o agendamento.')
      return null
    }

    const targetProfessionalId = agendaScope === 'doctor'
      ? currentProfessional?.id
      : form.professionalId

    if (!targetProfessionalId) {
      alert('Não foi possível identificar o profissional da consulta.')
      return null
    }

    const highPriority = Boolean(form.highPriority)
    const notes = formatPriorityNotes(form.notes, highPriority)

    return {
      patientId: form.patientId,
      date: formatLocalDateInput(baseDate),
      time: form.time,
      type: form.type,
      mode: form.mode,
      durationMinutes: Number(form.durationMinutes) || 30,
      status: form.status,
      highPriority,
      priority: highPriority ? 'Alta' : 'Média',
      notes,
      room: form.mode === 'Teleconsulta' ? 'Virtual' : 'Consultório 1',
      professionalId: targetProfessionalId,
      createdBy: editingAppointment?.createdBy || viewerProfile?.id || '',
      createdByName: editingAppointment?.createdByName || viewerProfile?.name || viewerProfile?.email || '',
      ...overrides,
    }
  }

  function buildAppointmentPayloadFromQueueItem(queueItem, cancelledSlotPayload) {
    return {
      patientId: queueItem.patientId,
      date: queueItem.date || cancelledSlotPayload.date,
      time: queueItem.time || cancelledSlotPayload.time,
      type: queueItem.type || 'Retorno',
      mode: queueItem.mode || 'Teleconsulta',
      durationMinutes: queueItem.durationMinutes || cancelledSlotPayload.durationMinutes || 30,
      status: 'Agendado',
      highPriority: Boolean(queueItem.highPriority),
      priority: queueItem.priority || (queueItem.highPriority ? 'Alta' : 'Média'),
      notes: queueItem.notes || '',
      room: queueItem.room || (queueItem.mode === 'Teleconsulta' ? 'Virtual' : 'Consultório 1'),
      professionalId: queueItem.professionalId || cancelledSlotPayload.professionalId,
      createdBy: queueItem.createdBy || viewerProfile?.id || '',
      createdByName: queueItem.createdByName || viewerProfile?.name || viewerProfile?.email || '',
    }
  }

  async function patientHasAppointmentOnDate(payload, ignoredAppointmentId = null) {
    if (hasPatientAppointmentOnDate(localAppointments, payload.patientId, payload.date, ignoredAppointmentId)) {
      return true
    }

    const patientAppointments = await appointmentRepository
      .getAll({ patientId: payload.patientId })
      .catch(() => [])

    return hasPatientAppointmentOnDate(patientAppointments, payload.patientId, payload.date, ignoredAppointmentId)
  }

  return {
    patients,
    professionals,
    currentProfessional,
    currentPatient,
    viewerProfile,
    users,
    agendaScope,
    canManageAppointment,
    loading,
    error,
    canCreateAppointment,
    activeView,
    setActiveView,
    baseDate,
    setBaseDate,
    status,
    setStatus,
    doctorFilter,
    setDoctorFilter,
    doctorSearch,
    setDoctorSearch,
    unitFilter,
    setUnitFilter,
    modalOpen,
    editingAppointment,
    form,
    updateForm,
    openCreateModal,
    openAppointmentModal,
    openAppointmentById,
    closeAppointmentModal,
    handleSubmitAppointment,
    handleCancelAppointment,
    handleConfirmArrival,
    visibleAppointments,
    dailyOccupancyAppointments,
    availableSlots,
    slotsLoading,
    slotsError,
  }
}

function notifyAppointmentAction(title, detail, payload, appointment = null) {
  const appointmentId = appointment?.id || payload.id || ''

  notificationRepository.notifyCurrentUser({
    action: appointmentId
      ? {
          type: 'agenda:openAppointment',
          appointmentId,
        }
      : null,
    domain: 'agenda',
    title,
    detail,
    patientId: payload.patientId,
    route: '/agenda',
    relatedUserIds: [payload.professionalId, payload.createdBy],
  }).catch(() => null)
}

export async function sendAppointmentConfirmationMessages(payload, { patients = [], professionals = [] } = {}) {
  const patient = findPatientById(payload.patientId, patients)
  if (!patient || !isCommunicationEligiblePatient(patient)) {
    return { failed: [], sent: [], skipped: true }
  }

  const phone = getPatientPhone(patient)
  const patientName = getPatientDisplayName(patient)
  const content = buildAppointmentConfirmationContent(payload, {
    professional: findProfessionalById(payload.professionalId, professionals),
  })
  const template = 'Confirmacao e lembrete de agendamento'

  if (!phone) {
    await Promise.all(['whatsapp', 'sms'].map((channel) =>
      communicationRepository.registerMessage({
        channel,
        content,
        patientId: payload.patientId,
        patientName,
        response: 'Telefone ausente',
        status: 'falha',
        template,
      }).catch(() => null),
    ))
    return { failed: ['whatsapp', 'sms'], sent: [], skipped: true }
  }

  const deliveries = [
    {
      channel: 'whatsapp',
      promise: Promise.resolve().then(() => communicationRepository.sendWhatsApp({
        content,
        fallbackSms: false,
        patientId: payload.patientId,
        patientName,
        phone,
      })),
    },
    {
      channel: 'sms',
      promise: Promise.resolve().then(() => communicationRepository.sendSms({
        content,
        patientId: payload.patientId,
        patientName,
        phone,
      })),
    },
  ]

  const results = await Promise.allSettled(deliveries.map((delivery) => delivery.promise))
  const failed = deliveries
    .map((delivery, index) => ({ ...delivery, result: results[index] }))
    .filter((delivery) => delivery.result.status === 'rejected')

  await Promise.all(failed.map((delivery) =>
    communicationRepository.registerMessage({
      channel: delivery.channel,
      content,
      patientId: payload.patientId,
      patientName,
      response: delivery.result.reason?.message || 'Falha no envio automatico.',
      status: 'falha',
      template,
    }).catch(() => null),
  ))

  return {
    failed: failed.map((delivery) => delivery.channel),
    sent: deliveries
      .filter((delivery, index) => results[index].status === 'fulfilled')
      .map((delivery) => delivery.channel),
    skipped: false,
  }
}

export function buildAppointmentConfirmationContent(payload, { professional = null } = {}) {
  const time = normalizeTime(payload.time) || payload.time || ''
  const mode = payload.mode ? ` ${payload.mode}` : ''
  const professionalName = getProfessionalName(professional)
  const professionalPart = professionalName ? ` com ${professionalName}` : ''

  return `sua consulta${mode} foi agendada para ${formatAppointmentDate(payload.date)} as ${time}${professionalPart}. Este e um lembrete da sua consulta. Responda SIM para confirmar sua presenca ou fale com nossa equipe para reagendar.`
}

function filterAppointmentsByProfessional(appointments, professionalId) {
  const normalizedProfessionalId = normalizeValue(professionalId)

  return sortAppointmentsByTime(
    appointments.filter((appointment) => normalizeValue(appointment.professionalId) === normalizedProfessionalId),
  )
}

function filterAppointmentsByPatient(appointments, patientId) {
  const normalizedPatientId = normalizeValue(patientId)

  return sortAppointmentsByTime(
    appointments.filter((appointment) => normalizeValue(appointment.patientId) === normalizedPatientId),
  )
}

export async function recoverCurrentPatient(profile, patientsData = [], usersData = []) {
  const enrichedProfile = mergeProfileWithListedUser(profile, usersData)

  const resolved = resolveCurrentPatient(enrichedProfile, patientsData)
  if (resolved?.id) return normalizeRecoveredPatient(resolved, enrichedProfile)

  const profilePatient = buildPatientFromProfile(enrichedProfile)
  if (profilePatient?.id) return normalizeRecoveredPatient(profilePatient, enrichedProfile)

  const patientByCpf = await findCurrentPatientByCpf(enrichedProfile)
  if (patientByCpf?.id) return normalizeRecoveredPatient(patientByCpf, enrichedProfile)

  const createdPatient = await createCurrentPatientRecord(enrichedProfile)
  if (createdPatient?.id) return normalizeRecoveredPatient(createdPatient, enrichedProfile)

  return buildScopedPatientFromProfile(enrichedProfile)
}

function mergeProfileWithListedUser(profile, usersData = []) {
  const user = findMatchingListedUser(profile, usersData)
  if (!user) return profile

  return {
    ...user,
    ...profile,
    patientId: profile?.patientId || user.patientId || user.patient_id || user.paciente_id,
    patient_id: profile?.patient_id || user.patient_id || user.patientId || user.paciente_id,
    email: profile?.email || user.email,
    name: profile?.name || profile?.full_name || user.full_name || user.name || user.nome,
    full_name: profile?.full_name || profile?.name || user.full_name || user.name || user.nome,
    phone: profile?.phone || user.phone || user.phone_mobile || user.telefone || user.celular,
    cpf: profile?.cpf || user.cpf || user.document || user.documento,
  }
}

function findMatchingListedUser(profile, usersData = []) {
  const profileIds = [
    profile?.id,
    profile?.userId,
    profile?.user_id,
    profile?.authUserId,
    profile?.auth_user_id,
    profile?.email,
  ].map(normalizeValue).filter(Boolean)
  const profileCpf = onlyDigits(profile?.cpf || profile?.document || profile?.documento)

  return usersData.find((user) => {
    const userIds = [
      user.id,
      user.userId,
      user.user_id,
      user.authUserId,
      user.auth_user_id,
      user.profileId,
      user.profile_id,
      user.email,
    ].map(normalizeValue).filter(Boolean)

    if (userIds.some((id) => profileIds.includes(id))) return true
    return profileCpf && onlyDigits(user.cpf || user.document || user.documento) === profileCpf
  }) || null
}

async function findCurrentPatientByCpf(profile) {
  const cpf = onlyDigits(profile?.cpf || profile?.document || profile?.documento)
  if (cpf.length !== 11) return null

  const patients = await patientRepository.getAll({ cpf }).catch(() => [])
  return resolveCurrentPatient(profile, patients || []) || patients?.[0] || null
}

async function createCurrentPatientRecord(profile) {
  const cpf = onlyDigits(profile?.cpf || profile?.document || profile?.documento)
  const phone = onlyDigits(profile?.phone || profile?.phone_mobile || profile?.telefone || profile?.celular)
  const payload = {
    email: profile?.email,
    full_name: profile?.name || profile?.full_name || profile?.nome,
    cpf,
    phone,
  }

  if (!payload.email || !payload.full_name || cpf.length !== 11 || !/^\d{10,11}$/.test(phone)) {
    return null
  }

  try {
    const created = await patientRepository.create(payload)
    return normalizeReturnedPatient(created)
  } catch {
    return findCurrentPatientByCpf(profile)
  }
}

function normalizeRecoveredPatient(patient, profile) {
  if (!patient?.id) return patient

  const name = patient.name || patient.full_name || patient.nome || profile?.name || profile?.full_name || profile?.email || 'Paciente'
  return {
    ...patient,
    id: patient.id,
    patient_id: patient.patient_id || patient.id,
    patientId: patient.patientId || patient.id,
    name,
    full_name: patient.full_name || name,
    email: patient.email || profile?.email || '',
    cpf: patient.cpf || profile?.cpf || '',
    phone: patient.phone || patient.phone_mobile || profile?.phone || '',
  }
}

function normalizeReturnedPatient(data) {
  if (Array.isArray(data)) return data[0] || null
  if (data?.patient) return data.patient
  if (data?.paciente) return data.paciente
  return data && typeof data === 'object' ? data : null
}

function buildScopedPatientFromProfile(profile) {
  const id = [
    profile?.patientId,
    profile?.patient_id,
    profile?.paciente_id,
    profile?.id,
    profile?.userId,
    profile?.authUserId,
    profile?.email,
  ].find(Boolean)

  if (!id) return null

  const name = profile?.name || profile?.full_name || profile?.nome || profile?.email || 'Paciente'
  return {
    id,
    patient_id: id,
    patientId: id,
    name,
    full_name: name,
    email: profile?.email || '',
    cpf: profile?.cpf || '',
    phone: profile?.phone || '',
    isScopedFallback: true,
  }
}

export function filterBookableAvailableSlots(slots, { appointments, date, doctorId, ignoredAppointmentId = null }) {
  const allowedTimes = new Set(generateTimesInclusive(BOOKING_DAY_START, BOOKING_DAY_END, BOOKING_SLOT_MINUTES))

  return slots
    .map((slot) => ({ ...slot, time: normalizeTime(slot.time) }))
    .filter((slot) =>
      slot.available &&
      allowedTimes.has(slot.time) &&
      isDoctorSlotAvailable({ date, professionalId: doctorId, time: slot.time }, appointments, ignoredAppointmentId),
    )
}

function resolveAppointmentCreatorNames(appointments, users, viewerProfile, professionals) {
  return appointments.map((appointment) => ({
    ...appointment,
    createdByName: appointment.createdByName || resolveCreatorName(appointment.createdBy, users, viewerProfile, professionals),
  }))
}

function resolveAppointmentDisplayNames(appointments, patients, professionals) {
  return appointments.map((appointment) => {
    const patient = patients.find((item) =>
      [
        item.id,
        item.patient_id,
        item.patientId,
        item.detailId,
      ].map(normalizeValue).includes(normalizeValue(appointment.patientId)),
    )
    const professional = professionals.find((item) =>
      [
        item.id,
        item.userId,
        item.user_id,
        item.auth_user_id,
      ].map(normalizeValue).includes(normalizeValue(appointment.professionalId)),
    )

    return {
      ...appointment,
      patient: patient?.name || patient?.full_name || patient?.nome || appointment.patient,
      professional: professional?.name || professional?.full_name || professional?.nome || appointment.professional,
    }
  })
}

function resolveCreatorName(createdBy, users, viewerProfile, professionals) {
  const creatorId = normalizeValue(createdBy)
  if (!creatorId) return ''

  const viewerIds = [
    viewerProfile?.id,
    viewerProfile?.userId,
    viewerProfile?.authUserId,
    viewerProfile?.doctorId,
    viewerProfile?.email,
  ].map(normalizeValue)

  if (viewerIds.includes(creatorId)) {
    return viewerProfile?.name || viewerProfile?.full_name || viewerProfile?.email || ''
  }

  const user = users.find((item) =>
    [
      item.id,
      item.user_id,
      item.auth_user_id,
      item.profile_id,
      item.email,
    ].map(normalizeValue).includes(creatorId),
  )

  if (user) return user.full_name || user.name || user.nome || user.email || ''

  const professional = professionals.find((item) =>
    [
      item.id,
      item.userId,
      item.authUserId,
      item.email,
    ].map(normalizeValue).includes(creatorId),
  )

  return professional?.name || ''
}

function hasPatientAppointmentOnDate(appointments, patientId, date, ignoredAppointmentId = null) {
  return appointments.some((appointment) => {
    if (ignoredAppointmentId && String(appointment.id) === String(ignoredAppointmentId)) return false
    if (String(appointment.patientId || '') !== String(patientId || '')) return false
    if (['cancelada', 'cancelado'].includes(String(appointment.status || '').toLowerCase())) return false

    return appointment.date === date
  })
}

function isDoctorSlotAvailable(payload, appointments, ignoredAppointmentId = null) {
  return !findConflictingAppointment(payload, appointments, ignoredAppointmentId)
}

function findConflictingAppointment(payload, appointments, ignoredAppointmentId = null) {
  const targetDoctorId = normalizeValue(payload.professionalId)
  const targetTime = normalizeTime(payload.time)
  if (!targetDoctorId || !payload.date || !targetTime) return null

  return appointments.find((appointment) => {
    if (ignoredAppointmentId && String(appointment.id) === String(ignoredAppointmentId)) return false
    if (normalizeValue(appointment.professionalId) !== targetDoctorId) return false
    if (appointment.date !== payload.date) return false
    if (normalizeTime(appointment.time) !== targetTime) return false
    return !['cancelada', 'cancelado', 'cancelled'].includes(normalizeStatus(appointment.status))
  }) || null
}

function isBookableTimeSlot(time) {
  const minutes = minutesFromTime(time)
  const start = minutesFromTime(BOOKING_DAY_START)
  const end = minutesFromTime(BOOKING_DAY_END)
  if (minutes === null || start === null || end === null) return false
  return minutes >= start && minutes <= end && (minutes - start) % BOOKING_SLOT_MINUTES === 0
}

function isHighPriorityAppointment(appointment) {
  return Boolean(appointment.highPriority) ||
    String(appointment.priority || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'alta' ||
    /^\[Prioridade alta\]/i.test(String(appointment.notes || ''))
}

function isAppointmentInPast(date, time) {
  if (!date || !time) return false

  const [year, month, day] = String(date).split('-').map(Number)
  const [hours, minutes] = String(time).split(':').map(Number)
  if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) return false

  return new Date(year, month - 1, day, hours, minutes).getTime() < Date.now()
}

function isStatusOnlyPastUpdate(payload, appointment) {
  if (!appointment) return false

  const unchangedAppointment = [
    normalizeValue(payload.patientId) === normalizeValue(appointment.patientId),
    normalizeValue(payload.professionalId) === normalizeValue(appointment.professionalId),
    normalizeValue(payload.date) === normalizeValue(appointment.date),
    normalizeTime(payload.time) === normalizeTime(appointment.time),
    normalizeValue(payload.type) === normalizeValue(appointment.type),
    normalizeValue(payload.mode) === normalizeValue(appointment.mode),
    Number(payload.durationMinutes || 30) === Number(appointment.durationMinutes || 30),
    Boolean(payload.highPriority) === Boolean(appointment.highPriority || appointment.priority === 'Alta'),
    normalizeValue(payload.notes) === normalizeValue(formatPriorityNotes(appointment.notes, Boolean(appointment.highPriority || appointment.priority === 'Alta'))),
  ].every(Boolean)

  return unchangedAppointment && normalizeStatus(payload.status) !== normalizeStatus(appointment.status)
}

function enrichAppointment(appointment, payload, patients, professionals) {
  const patient = patients.find((item) => String(item.id) === String(payload.patientId))
  const professional = professionals.find((item) => String(item.id) === String(payload.professionalId))

  return {
    ...appointment,
    patientId: payload.patientId,
    professionalId: payload.professionalId,
    patient: patient?.name || patient?.full_name || patient?.nome || appointment.patient,
    professional: professional?.name || professional?.full_name || professional?.nome || appointment.professional,
    date: payload.date,
    time: payload.time,
    type: payload.type,
    mode: payload.mode,
    durationMinutes: payload.durationMinutes,
    status: payload.status,
    highPriority: payload.highPriority,
    priority: payload.priority,
    notes: payload.notes,
    room: payload.room,
    createdBy: appointment.createdBy || payload.createdBy,
    createdByName: appointment.createdByName || payload.createdByName,
  }
}

function buildExceptionMarkers(exceptions, professionals) {
  return exceptions.map((exception) => exceptionToAppointment(exception, professionals, exception.startTime || '00:00'))
}

function buildExceptionOccupancy(exceptions, professionals) {
  return exceptions.flatMap((exception) => {
    if (exception.kind !== 'bloqueio') {
      return []
    }

    const start = normalizeTime(exception.startTime) || BOOKING_DAY_START
    const end = normalizeTime(exception.endTime) || '18:30'
    return generateTimes(start, end, 30).map((time) => exceptionToAppointment(exception, professionals, time))
  })
}

function exceptionToAppointment(exception, professionals, time) {
  const professional = professionals.find((item) => normalizeValue(item.id) === normalizeValue(exception.doctorId))
  const isBlock = exception.kind === 'bloqueio'
  const timeRange = [normalizeTime(exception.startTime), normalizeTime(exception.endTime)].filter(Boolean).join(' - ')

  return {
    id: `exception-${exception.id}-${time}`,
    isException: true,
    exceptionKind: exception.kind,
    exceptionId: exception.id,
    patient: isBlock ? 'Bloqueio de agenda' : 'Disponibilidade extra',
    patientId: '',
    professional: professional?.name || 'Médico(a)',
    professionalId: exception.doctorId,
    date: exception.date,
    time: normalizeTime(time) || '00:00',
    type: isBlock ? 'Exceção de disponibilidade' : 'Disponibilidade extra',
    mode: timeRange || 'Dia inteiro',
    durationMinutes: 30,
    status: isBlock ? 'Bloqueado' : 'Confirmado',
    notes: exception.reason || '',
    room: isBlock ? 'Agenda bloqueada' : 'Agenda liberada',
  }
}

function generateTimes(start, end, intervalMinutes) {
  const startMinutes = minutesFromTime(start)
  const endMinutes = minutesFromTime(end)
  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) return [start]

  const times = []
  for (let cursor = startMinutes; cursor < endMinutes; cursor += intervalMinutes) {
    times.push(formatMinutes(cursor))
  }
  return times
}

function generateTimesInclusive(start, end, intervalMinutes) {
  const startMinutes = minutesFromTime(start)
  const endMinutes = minutesFromTime(end)
  if (startMinutes === null || endMinutes === null || startMinutes > endMinutes) return []

  const times = []
  for (let cursor = startMinutes; cursor <= endMinutes; cursor += intervalMinutes) {
    times.push(formatMinutes(cursor))
  }
  return times
}

function normalizeTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function minutesFromTime(value) {
  const time = normalizeTime(value)
  if (!time) return null
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function formatMinutes(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const minutes = String(totalMinutes % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

function getPatientName(patientId, patients) {
  const patient = patients.find((item) => String(item.id) === String(patientId))
  return patient?.name || patient?.full_name || patient?.nome || 'paciente selecionado'
}

function findPatientById(patientId, patients) {
  const normalizedPatientId = normalizeValue(patientId)
  return patients.find((item) =>
    [
      item.id,
      item.patientId,
      item.patient_id,
      item.paciente_id,
      item.detailId,
    ].map(normalizeValue).includes(normalizedPatientId),
  ) || null
}

function findProfessionalById(professionalId, professionals) {
  const normalizedProfessionalId = normalizeValue(professionalId)
  return professionals.find((item) =>
    [
      item.id,
      item.professionalId,
      item.professional_id,
      item.doctorId,
      item.doctor_id,
      item.userId,
      item.user_id,
    ].map(normalizeValue).includes(normalizedProfessionalId),
  ) || null
}

function getPatientPhone(patient) {
  return patient?.phone || patient?.phone_mobile || patient?.telefone || patient?.celular || ''
}

function getPatientDisplayName(patient) {
  return patient?.name || patient?.full_name || patient?.nome || 'Paciente'
}

function getProfessionalName(professional) {
  return professional?.name || professional?.full_name || professional?.nome || professional?.professional || professional?.doctor_name || ''
}

function formatAppointmentDate(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function getAppointmentUpdateNotificationDetail(payload, appointment, patients) {
  const baseDetail = `Consulta de ${getPatientName(payload.patientId, patients)} atualizada para ${formatAppointmentDate(payload.date)} as ${payload.time}.`
  if (normalizeStatus(payload.status) === normalizeStatus(appointment?.status)) return baseDetail
  return `${baseDetail} Status atualizado para ${payload.status}.`
}

function formatPriorityNotes(notes, highPriority) {
  const cleanNotes = String(notes || '').replace(/^\[Prioridade alta\]\s*/i, '').trim()
  if (!highPriority) return cleanNotes
  return cleanNotes ? `[Prioridade alta] ${cleanNotes}` : '[Prioridade alta]'
}

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase()
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeStatus(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}
