import { normalizeRole, ROLE_CAPABILITIES } from '../config/permissions.js'
import { appointmentRepository } from '../repositories/appointmentRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { waitlistRepository } from '../repositories/waitlistRepository.js'
import { reportRepository } from '../repositories/reportRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { isCancelledStatus } from './appointmentMetrics.js'

export async function buildContext(role) {
  const normalizedRole = normalizeRole(role) || 'paciente'
  const capabilities = ROLE_CAPABILITIES[normalizedRole] || {}
  const data = {}

  const profile = await profileRepository.getCurrentUserProfile().catch(() => null)
  const doctorId = profile?.doctorId || ''
  const patientId = profile?.patientId || ''

  // 1. Appointments securely queried based on role
  let appointments = []
  if (normalizedRole === 'medico') {
    appointments = await appointmentRepository
      .getAll(doctorId ? { doctorId } : { doctorId: 'non-existent' })
      .catch(() => [])
  } else if (normalizedRole === 'paciente') {
    appointments = await appointmentRepository
      .getAll(patientId ? { patientId } : { patientId: 'non-existent' })
      .catch(() => [])
  } else {
    // admin, gestor, secretaria
    appointments = await appointmentRepository.getAll().catch(() => [])
  }

  const today = formatToday()
  data.appointmentsTotal = appointments.length
  data.appointmentsToday = appointments.filter((appointment) => appointment.date === today && !isCancelledStatus(appointment.status)).length

  const cancelled = appointments.filter((appointment) => isCancelledStatus(appointment.status)).length
  data.cancelRate = appointments.length ? Math.round((cancelled / appointments.length) * 1000) / 10 : 0

  // Compact appointment list
  data.todayAppointmentsList = appointments
    .filter((app) => app.date === today && !isCancelledStatus(app.status))
    .slice(0, 5)
    .map((app) => ({
      time: app.time || app.scheduledAt || app.hour,
      patient: app.patientName || app.patient?.full_name || app.patient?.name || 'Paciente',
      status: app.status,
    }))

  // 2. Reports securely queried if canViewReports is true
  const canViewReports = capabilities.canViewReports === true
  let reports = []
  if (canViewReports) {
    if (normalizedRole === 'medico') {
      const doctorPatients = await patientRepository.getDirectoryRows({ doctorId }).catch(() => [])
      const doctorPatientIds = doctorPatients.map((p) => p.id).filter(Boolean)
      const createdByValues = [profile?.id, profile?.doctorId, profile?.userId].filter(Boolean)
      
      const filters = {}
      if (doctorPatientIds.length) {
        filters.patientIds = doctorPatientIds
      } else if (createdByValues.length) {
        filters.createdByValues = createdByValues
      } else {
        filters.createdByValues = ['non-existent']
      }
      reports = await reportRepository.getInitialReports(filters).catch(() => [])
    } else if (normalizedRole === 'paciente') {
      reports = await reportRepository.getInitialReports(patientId ? { patientId } : { patientId: 'non-existent' }).catch(() => [])
    } else {
      // admin, gestor
      reports = await reportRepository.getInitialReports().catch(() => [])
    }
  }

  data.reportsCount = reports.length
  data.draftReportsCount = reports.filter((r) => r.status === 'draft').length
  data.recentReportsList = reports.slice(0, 5).map((r) => ({
    exam: r.exam,
    patient: r.patientName || r.patient_name || 'Paciente',
    status: r.status,
  }))

  // 3. Waitlist securely queried
  const canViewWaitlist = ['admin', 'gestor', 'medico', 'secretaria'].includes(normalizedRole)
  if (canViewWaitlist) {
    const waitlist = waitlistRepository.getAll() || []
    if (normalizedRole === 'medico') {
      data.waitlistCount = waitlist.filter((entry) => entry.status === 'aguardando' && String(entry.doctorId) === String(doctorId)).length
    } else {
      data.waitlistCount = waitlist.filter((entry) => entry.status === 'aguardando').length
    }
  } else {
    data.waitlistCount = 0
  }

  // 4. Patients and Professionals lists queried securely
  let patientsList = []
  if (['admin', 'gestor', 'medico', 'secretaria'].includes(normalizedRole)) {
    const allPatients = await patientRepository.getAll().catch(() => [])
    patientsList = allPatients.map((p) => ({ id: p.id, name: p.name || p.full_name }))
  } else if (normalizedRole === 'paciente') {
    patientsList = [{ id: patientId, name: profile?.name || 'Paciente' }]
  }

  const allProfessionals = await professionalRepository.getAll().catch(() => [])
  const professionalsList = allProfessionals.map((d) => ({ id: d.id, name: d.name }))

  data.patients = patientsList
  data.professionals = professionalsList

  return data
}

function formatToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
