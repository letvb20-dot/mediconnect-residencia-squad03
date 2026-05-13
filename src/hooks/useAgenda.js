import { useEffect, useMemo, useState } from 'react'
import { isSameDay } from 'date-fns'

import { appointmentRepository } from '../repositories/appointmentRepository.js'
import { availabilityRepository } from '../repositories/availabilityRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { formatLocalDateInput, parseLocalDate, sortAppointmentsByTime } from '../utils/agendaDate.js'

const initialForm = {
  patientId: '',
  professionalId: '',
  type: 'Retorno',
  time: '',
  mode: 'Teleconsulta',
  status: 'Aguardando',
  notes: '',
}

export function useAgenda() {
  const [patients, setPatients] = useState([])
  const [professionals, setProfessionals] = useState([])
  const [currentProfessional, setCurrentProfessional] = useState(null)
  const [viewerProfile, setViewerProfile] = useState(null)
  const [localAppointments, setLocalAppointments] = useState([])
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

        const [patientsData, professionalsData, currentProfile] = await Promise.all([
          patientRepository.getAll(),
          professionalRepository.getAll(),
          profileRepository.getCurrentUserProfile(),
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

        setLocalAppointments(
          currentScope === 'doctor' && resolvedProfessional
            ? filterAppointmentsByProfessional(appointmentsData || [], resolvedProfessional.id)
            : sortAppointmentsByTime(appointmentsData || []),
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

  const visibleAppointments = useMemo(() => {
    let filtered = localAppointments

    if (status !== 'Todos') {
      filtered = filtered.filter((appointment) => appointment.status === status)
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

    if (activeView === 'Dia') {
      filtered = filtered.filter((appointment) => {
        if (!appointment.date) return false

        const appointmentDate = parseLocalDate(appointment.date)
        if (!appointmentDate) return false

        return isSameDay(appointmentDate, baseDate)
      })
    }

    return sortAppointmentsByTime(filtered)
  }, [activeView, agendaScope, baseDate, doctorFilter, doctorSearch, localAppointments, professionals, status, unitFilter])

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function openCreateModal({ date, time } = {}) {
    if (date) {
      const parsedDate = parseLocalDate(date)
      if (parsedDate) setBaseDate(parsedDate)
    }

    setEditingAppointment(null)
    setAvailableSlots([])
    setSlotsError('')
    setForm((current) => ({
      ...initialForm,
      patientId: current.patientId || patients[0]?.id || '',
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
      mode: appointment.mode || initialForm.mode,
      status: appointment.status || initialForm.status,
      notes: appointment.notes || '',
    })
    setModalOpen(true)
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

    try {
      const created = await appointmentRepository.create(payload)
      setLocalAppointments((current) => sortAppointmentsByTime([...current, enrichAppointment(created, payload, patients, professionals)]))
      closeAppointmentModal()
    } catch (createError) {
      alert(createError.message || 'Erro ao criar agendamento.')
    }
  }

  async function updateAppointment() {
    if (!editingAppointment) return

    const payload = buildPayload()
    if (!payload) return

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
      closeAppointmentModal()
    } catch (updateError) {
      alert(updateError.message || 'Erro ao atualizar agendamento.')
    }
  }

  async function handleCancelAppointment() {
    if (!editingAppointment) return
    if (!window.confirm('Tem certeza que deseja cancelar este agendamento?')) return

    const payload = buildPayload({ status: 'Cancelada' })
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

    return {
      patientId: form.patientId,
      date: formatLocalDateInput(baseDate),
      time: form.time,
      type: form.type,
      mode: form.mode,
      status: form.status,
      notes: form.notes,
      room: form.mode === 'Teleconsulta' ? 'Virtual' : 'Consultório 1',
      professionalId: targetProfessionalId,
      createdBy: editingAppointment?.createdBy || viewerProfile?.id || '',
      createdByName: editingAppointment?.createdByName || viewerProfile?.name || viewerProfile?.email || '',
      ...overrides,
    }
  }

  return {
    patients,
    professionals,
    currentProfessional,
    viewerProfile,
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
    closeAppointmentModal,
    handleSubmitAppointment,
    handleCancelAppointment,
    visibleAppointments,
    availableSlots,
    slotsLoading,
    slotsError,
  }
}

function filterAppointmentsByProfessional(appointments, professionalId) {
  const normalizedProfessionalId = normalizeValue(professionalId)

  return sortAppointmentsByTime(
    appointments.filter((appointment) => normalizeValue(appointment.professionalId) === normalizedProfessionalId),
  )
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
    status: payload.status,
    notes: payload.notes,
    room: payload.room,
    createdBy: appointment.createdBy || payload.createdBy,
    createdByName: appointment.createdByName || payload.createdByName,
  }
}

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase()
}
