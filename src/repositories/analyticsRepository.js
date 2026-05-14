import { appointmentRepository } from './appointmentRepository.js'
import { patientRepository } from './patientRepository.js'
import { professionalRepository } from './professionalRepository.js'

const PERIOD_MONTHS = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1a': 12,
}

const INSURANCE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6']

export const analyticsRepository = {
  async getDashboardData(period = '6m') {
    const [appointments, patients, professionals] = await Promise.all([
      appointmentRepository.getAll().catch(() => []),
      patientRepository.getDirectoryRows().catch(() => []),
      professionalRepository.getAll().catch(() => []),
    ])

    const months = getPeriodMonths(period)
    const appointmentsInPeriod = appointments.filter((appointment) => {
      const date = parseAppointmentDate(appointment)
      return date && months.some((month) => month.key === getMonthKey(date))
    })

    const completedAppointments = appointmentsInPeriod.filter((appointment) => isCompletedStatus(appointment.status))
    const noShowAppointments = appointmentsInPeriod.filter((appointment) => isNoShowStatus(appointment.status))
    const revenue = appointmentsInPeriod.reduce((total, appointment) => total + getAppointmentRevenue(appointment), 0)
    const annualRevenue = appointments
      .filter((appointment) => {
        const date = parseAppointmentDate(appointment)
        return date && date.getFullYear() === new Date().getFullYear()
      })
      .reduce((total, appointment) => total + getAppointmentRevenue(appointment), 0)
    const noShowRate = appointmentsInPeriod.length
      ? roundPercent(noShowAppointments.length, appointmentsInPeriod.length)
      : 0

    return {
      absenteeismData: months.map((month) => {
        const monthAppointments = appointmentsInPeriod.filter((appointment) => getMonthKey(parseAppointmentDate(appointment)) === month.key)
        const monthNoShows = monthAppointments.filter((appointment) => isNoShowStatus(appointment.status))

        return {
          month: month.label,
          taxa: monthAppointments.length ? roundPercent(monthNoShows.length, monthAppointments.length) : 0,
          meta: 15,
        }
      }),
      consultationsData: months.map((month) => {
        const monthAppointments = appointmentsInPeriod.filter((appointment) => getMonthKey(parseAppointmentDate(appointment)) === month.key)

        return {
          month: month.label,
          total: monthAppointments.length,
          realizadas: monthAppointments.filter((appointment) => isCompletedStatus(appointment.status)).length,
        }
      }),
      doctorPerformance: buildDoctorPerformance(appointmentsInPeriod, professionals),
      insuranceData: buildInsuranceData(patients),
      attendanceMetrics: {
        scheduled: appointmentsInPeriod.length,
        completed: completedAppointments.length,
        cancelled: appointmentsInPeriod.filter((appointment) => isCancelledStatus(appointment.status)).length,
        noShow: noShowAppointments.length,
        noShowRate,
      },
      annualRevenue,
      satisfactionIndicators: buildSatisfactionIndicators(appointmentsInPeriod),
      kpis: [
        { label: 'Consultas Realizadas', value: String(completedAppointments.length), change: `${appointmentsInPeriod.length} agendadas`, up: true, icon: 'calendar' },
        { label: 'Taxa de No-Show', value: `${noShowRate}%`, change: `${noShowAppointments.length} faltas`, up: false, icon: 'activity' },
        { label: 'Faturamento', value: formatCurrency(revenue), change: revenue ? 'somado da agenda' : 'sem valor financeiro', up: revenue > 0, icon: 'dollar' },
        { label: 'Pacientes Ativos', value: String(patients.length), change: 'cadastro atual', up: true, icon: 'users' },
      ],
      revenueData: months.map((month) => {
        const monthAppointments = appointmentsInPeriod.filter((appointment) => getMonthKey(parseAppointmentDate(appointment)) === month.key)

        return {
          month: month.label,
          valor: monthAppointments.reduce((total, appointment) => total + getAppointmentRevenue(appointment), 0),
        }
      }),
      topPatients: buildTopPatients(appointmentsInPeriod),
    }
  },
}

function getPeriodMonths(period) {
  const count = PERIOD_MONTHS[period] || PERIOD_MONTHS['6m']
  const current = new Date()
  current.setDate(1)

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(current)
    date.setMonth(current.getMonth() - (count - index - 1))

    return {
      key: getMonthKey(date),
      label: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' })
        .format(date)
        .replace('.', ''),
    }
  })
}

function buildDoctorPerformance(appointments, professionals) {
  const namesById = new Map(
    professionals
      .flatMap((professional) => [
        [normalizeId(professional.id), professional.name],
        [normalizeId(professional.userId), professional.name],
      ])
      .filter(([id, name]) => id && name),
  )
  const groups = new Map()

  for (const appointment of appointments) {
    const professionalName =
      namesById.get(normalizeId(appointment.professionalId)) ||
      appointment.professional ||
      'Profissional não informado'

    const current = groups.get(professionalName) || { name: professionalName, consultas: 0, noShow: 0, satisfacao: null }
    current.consultas += 1
    if (isNoShowStatus(appointment.status)) current.noShow += 1
    groups.set(professionalName, current)
  }

  return [...groups.values()]
    .sort((a, b) => b.consultas - a.consultas)
    .slice(0, 8)
}

function buildInsuranceData(patients) {
  const counts = new Map()

  for (const patient of patients) {
    const insurance = String(patient.insurance || patient.plan || 'Não informado').trim() || 'Não informado'
    counts.set(insurance, (counts.get(insurance) || 0) + 1)
  }

  const total = Math.max(patients.length, 1)

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count], index) => ({
      name,
      value: Math.round((count / total) * 100),
      color: INSURANCE_COLORS[index % INSURANCE_COLORS.length],
    }))
}

function buildTopPatients(appointments) {
  const groups = new Map()

  for (const appointment of appointments) {
    const id = normalizeId(appointment.patientId) || appointment.patient || 'paciente'
    const current = groups.get(id) || {
      id,
      name: appointment.patient || 'Paciente não identificado',
      visits: 0,
      revenue: 0,
    }

    current.visits += 1
    current.revenue += getAppointmentRevenue(appointment)
    groups.set(id, current)
  }

  return [...groups.values()]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 5)
}

function parseAppointmentDate(appointment) {
  if (!appointment?.date) return null

  const date = new Date(`${appointment.date}T${appointment.time || '00:00'}:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function getMonthKey(date) {
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function normalizeStatus(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function isCompletedStatus(status) {
  return ['realizado', 'realizada', 'concluida', 'concluido', 'completed', 'finalizada', 'finalizado'].includes(normalizeStatus(status))
}

function isNoShowStatus(status) {
  return ['no_show', 'no-show', 'falta', 'ausente', 'faltou'].includes(normalizeStatus(status).replace(/\s+/g, '_'))
}

function isCancelledStatus(status) {
  return ['cancelada', 'cancelado', 'cancelled'].includes(normalizeStatus(status))
}

function buildSatisfactionIndicators(appointments) {
  const ratedAppointments = appointments
    .map((appointment) => Number(appointment.satisfaction || appointment.satisfacao || appointment.rating || 0))
    .filter((rating) => Number.isFinite(rating) && rating > 0)

  if (!ratedAppointments.length) {
    return {
      average: 0,
      responses: 0,
      label: 'Sem avaliaÃ§Ãµes registradas',
    }
  }

  const average = ratedAppointments.reduce((total, rating) => total + rating, 0) / ratedAppointments.length
  return {
    average: Math.round(average * 10) / 10,
    responses: ratedAppointments.length,
    label: `${ratedAppointments.length} avaliaÃ§Ãµes`,
  }
}

function getAppointmentRevenue(appointment) {
  return Number(appointment?.revenue || appointment?.amount || appointment?.price || appointment?.valor || 0) || 0
}

function roundPercent(part, total) {
  return Math.round((part / Math.max(total, 1)) * 1000) / 10
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    currency: 'BRL',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value)
}

function normalizeId(value) {
  return String(value || '').trim()
}
