import { appointmentRepository } from './appointmentRepository.js'
import { patientRepository } from './patientRepository.js'
import { normalizeRole } from '../config/permissions.js'

export const homeRepository = {
  async getDashboardOverview({ now = new Date(), profile, role, user } = {}) {
    const normalizedRole = normalizeRole(role)
    const [allAppointments, allPatients] = await Promise.all([
      appointmentRepository.getAll().catch(() => []),
      patientRepository.getDirectoryRows().catch(() => []),
    ])
    const appointments = normalizedRole === 'medico'
      ? allAppointments.filter((appointment) => isDoctorAppointment(appointment, { profile, user }))
      : allAppointments
    const patientIds = new Set(appointments.map((appointment) => String(appointment.patientId || '')).filter(Boolean))
    const patients = normalizedRole === 'medico'
      ? allPatients.filter((patient) => patientIds.has(String(patient.detailId || patient.id || '')))
      : allPatients

    const todayKey = formatDateKey(now)
    const todayAppointments = appointments
      .filter((appointment) => appointment.date === todayKey)
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))

    const completedAppointments = appointments.filter((appointment) => isCompletedStatus(appointment.status))
    const noShowAppointments = appointments.filter((appointment) => isNoShowStatus(appointment.status))
    const pendingToday = todayAppointments.filter((appointment) => isPendingStatus(appointment.status))
    const occupancyRate = Math.min(100, Math.round((todayAppointments.length / 24) * 1000) / 10)
    const noShowRate = appointments.length
      ? Math.round((noShowAppointments.length / appointments.length) * 1000) / 10
      : 0
    const weeklyAppointments = buildWeeklyAppointmentSeries(appointments, now)

    return {
      appointmentsToday: todayAppointments.slice(0, 6).map((appointment) => ({
        time: appointment.time || '--:--',
        name: appointment.patient || 'Paciente',
        patientId: appointment.patientId,
        status: appointment.status || 'Agendado',
      })),
      metrics: [
        { label: 'Consultas Hoje', value: String(todayAppointments.length), change: `${completedAppointments.length} concluídas`, tone: 'blue' },
        { label: 'Taxa de Ocupação', value: `${occupancyRate}%`, change: `${todayAppointments.length}/24 slots`, tone: 'violet' },
        { label: 'No-show', value: `${noShowRate}%`, change: `${noShowAppointments.length} registros`, tone: 'green' },
      ],
      predictiveAlert: pendingToday.length
        ? `${pendingToday.length} pacientes de hoje ainda aguardam confirmação. Recomenda-se confirmar presença antes do horário.`
        : 'Nenhum paciente de hoje pendente de confirmação.',
      weeklyAppointments,
      reportCards: [
        { title: 'Próximos Pacientes', description: `${todayAppointments.length} consultas agendadas hoje`, icon: 'calendar' },
        { title: 'Pacientes Ativos', description: `${patients.length} pacientes cadastrados`, icon: 'users' },
        { title: 'Produtividade Médica', description: `${completedAppointments.length} consultas concluídas`, icon: 'brand' },
        { title: 'Análise de Convênios', description: 'Distribuição baseada no cadastro de pacientes', icon: 'building' },
      ],
    }
  },
}

export function buildWeeklyAppointmentSeries(appointments = [], now = new Date()) {
  const today = startOfDay(now)
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index - 6)
    return {
      count: 0,
      date: formatDateKey(date),
      label: formatWeekdayLabel(date),
    }
  })
  const dayByDate = new Map(days.map((day) => [day.date, day]))

  appointments.forEach((appointment) => {
    if (isCancelledStatus(appointment.status)) return

    const day = dayByDate.get(String(appointment.date || ''))
    if (day) day.count += 1
  })

  return {
    days,
    total: days.reduce((sum, day) => sum + day.count, 0),
  }
}

function isDoctorAppointment(appointment, { profile, user }) {
  const candidates = [
    profile?.doctorId,
    profile?.doctor_id,
    profile?.id,
    profile?.email,
    user?.id,
    user?.user_id,
    user?.email,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())

  if (!candidates.length) return false

  const appointmentCandidates = [
    appointment.professionalId,
    appointment.doctorId,
    appointment.doctor_id,
    appointment.medico_id,
    appointment.professional_id,
    appointment.user_id,
    appointment.doctorEmail,
    appointment.doctor_email,
    appointment.professionalEmail,
    appointment.professional_email,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())

  return appointmentCandidates.some((value) => candidates.includes(value))
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfDay(date) {
  const nextDate = new Date(date)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

function addDays(date, amount) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + amount)
  return nextDate
}

function formatWeekdayLabel(date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
    .format(date)
    .replace('.', '')
}

function normalizeStatus(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function isCompletedStatus(status) {
  return ['concluida', 'concluido', 'completed', 'finalizada', 'finalizado'].includes(normalizeStatus(status))
}

function isNoShowStatus(status) {
  return ['no_show', 'no-show', 'falta', 'ausente', 'faltou'].includes(normalizeStatus(status).replace(/\s+/g, '_'))
}

function isCancelledStatus(status) {
  return ['cancelada', 'cancelado', 'cancelled'].includes(normalizeStatus(status))
}

function isPendingStatus(status) {
  return ['aguardando', 'requested', 'solicitada', 'pendente'].includes(normalizeStatus(status))
}
