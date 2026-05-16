import { useEffect, useMemo, useState } from 'react'
import { isSameDay } from 'date-fns'

import { appointmentRepository } from '../repositories/appointmentRepository.js'
import { AGENDA_EXCEPTIONS_CHANGED_EVENT, availabilityRepository } from '../repositories/availabilityRepository.js'
import { notificationRepository } from '../repositories/notificationRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import { formatLocalDateInput, parseLocalDate, sortAppointmentsByTime } from '../utils/agendaDate.js'

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

  const agendaScope = viewerProfile?.isDoctor ? 'doctor' : 'global'
  const canCreateAppointment = agendaScope === 'doctor'
    ? Boolean(currentProfessional?.id)
    : professionals.length > 0

  useEffect(() => {
    let active = true

    async function loadAgendaContext() {
      try {
        setError('')

        const [patientsData, professionalsData, currentProfile, usersData] = await Promise.all([
          patientRepository.getAll(),
          professionalRepository.getAll(),
          profileRepository.getCurrentUserProfile(),
          userRepository.getAll().catch(() => []),
        ])

        if (!active) return

        const currentScope = currentProfile?.isDoctor ? 'doctor' : 'global'
        const resolvedProfessional = professionalRepository.resolveCurrentProfessional(currentProfile, professionalsData)
        const initialProfessionalId =
          currentScope === 'doctor'
            ? resolvedProfessional?.id || ''
            : professionalsData?.[0]?.id || ''

        setViewerProfile(currentProfile)
        setPatients(patientsData || [])
        setUsers(usersData || [])
        setCurrentProfessional(resolvedProfessional)
        setProfessionals(professionalsData || [])
        setForm((current) => ({
          ...current,
          patientId: patientsData?.length ? patientsData[0].id : '',
          professionalId: initialProfessionalId,
        }))

        if (currentScope === 'doctor' && !resolvedProfessional) {
          setLocalAppointments([])
          setError('Não foi possível vincular o médico logado a um profissional da base.')
          return
        }

        const appointmentsData = await appointmentRepository.getAll({
          doctorId: currentScope === 'doctor' ? resolvedProfessional?.id : undefined,
        })

        if (!active) return

        const appointmentsWithCreatorNames = resolveAppointmentCreatorNames(
          appointmentsData || [],
          usersData || [],
          currentProfile,
          professionalsData || [],
        )

        setLocalAppointments(
          currentScope === 'doctor' && resolvedProfessional
            ? filterAppointmentsByProfessional(appointmentsWithCreatorNames, resolvedProfessional.id)
            : sortAppointmentsByTime(appointmentsWithCreatorNames),
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
    if (!modalOpen || editingAppointment) return

    const targetProfessionalId = agendaScope === 'doctor'
      ? currentProfessional?.id
      : form.professionalId

    let active = true

    async function loadAvailableSlots() {
      if (!targetProfessionalId) {
        setAvailableSlots([])
        setSlotsError('')
        return
      }

      setSlotsLoading(true)
      setSlotsError('')

      try {
        const slots = await availabilityRepository.getAvailableSlots({
          doctorId: targetProfessionalId,
          date: formatLocalDateInput(baseDate),
          appointmentType: form.mode,
        })

        if (!active) return

        const activeSlots = slots.filter((slot) => slot.available)
        setAvailableSlots(activeSlots)

        if (activeSlots.length) {
          setForm((current) =>
            activeSlots.some((slot) => slot.time === current.time)
              ? current
              : { ...current, time: activeSlots[0].time },
          )
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
  }, [agendaScope, baseDate, currentProfessional?.id, editingAppointment, form.mode, form.professionalId, modalOpen])

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
    setForm((current) => ({ ...current, [field]: value }))
  }

  function openCreateModal({ date, patientId, time } = {}) {
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
      time: time ?? current.time ?? initialForm.time,
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

    if (await patientHasAppointmentOnDate(payload)) {
      alert('Este paciente já possui um agendamento neste dia.')
      return
    }

    try {
      const created = await appointmentRepository.create(payload)
      setLocalAppointments((current) => sortAppointmentsByTime([...current, enrichAppointment(created, payload, patients, professionals)]))
      notifyAppointmentAction('Consulta marcada', `Consulta de ${getPatientName(payload.patientId, patients)} marcada para ${formatAppointmentDate(payload.date)} as ${payload.time}.`, payload, created)
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
    if (!editingAppointment) return
    if (!window.confirm('Tem certeza que deseja cancelar este agendamento?')) return

    const payload = buildPayload({ status: 'Cancelado' })
    if (!payload) return

    try {
      const cancelled = await appointmentRepository.cancel(editingAppointment.id, payload)
      setLocalAppointments((current) =>
        sortAppointmentsByTime(
          current.map((appointment) =>
            appointment.id === editingAppointment.id
              ? enrichAppointment(cancelled, payload, patients, professionals)
              : appointment,
          ),
        ),
      )
      notifyAppointmentAction('Consulta cancelada', `Consulta de ${getPatientName(payload.patientId, patients)} foi cancelada. Status atualizado para Cancelado.`, payload, cancelled)
      closeAppointmentModal()
    } catch (cancelError) {
      alert(cancelError.message || 'Erro ao cancelar agendamento.')
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
    viewerProfile,
    users,
    agendaScope,
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

function filterAppointmentsByProfessional(appointments, professionalId) {
  const normalizedProfessionalId = normalizeValue(professionalId)

  return sortAppointmentsByTime(
    appointments.filter((appointment) => normalizeValue(appointment.professionalId) === normalizedProfessionalId),
  )
}

function resolveAppointmentCreatorNames(appointments, users, viewerProfile, professionals) {
  return appointments.map((appointment) => ({
    ...appointment,
    createdByName: appointment.createdByName || resolveCreatorName(appointment.createdBy, users, viewerProfile, professionals),
  }))
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

    const start = normalizeTime(exception.startTime) || '07:00'
    const end = normalizeTime(exception.endTime) || '19:00'
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

function normalizeStatus(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}
