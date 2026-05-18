import { appointmentRepository } from './appointmentRepository.js'
import { patientRepository } from './patientRepository.js'
import { professionalRepository } from './professionalRepository.js'
import {
  getNoShowStats,
  isAttendanceDueAppointment,
  isCancelledStatus,
  isCompletedStatus,
  parseAppointmentDateTime,
} from '../utils/appointmentMetrics.js'

const INSURANCE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6']

export const analyticsRepository = {
  async getDashboardData(options = {}) {
    const normalizedOptions = typeof options === 'string'
      ? { absenteeismPeriod: options, consultationsPeriod: options }
      : options || {}
    const absenteeismPeriod = normalizePeriod(normalizedOptions.absenteeismPeriod)
    const consultationsPeriod = normalizePeriod(normalizedOptions.consultationsPeriod)
    const now = normalizeNow(normalizedOptions.now)

    const [appointments, patients, professionals] = await Promise.all([
      appointmentRepository.getAll().catch(() => []),
      patientRepository.getDirectoryRows().catch(() => []),
      professionalRepository.getAll().catch(() => []),
    ])

    const consultationsBuckets = buildPeriodBuckets(consultationsPeriod, now)
    const consultationsAppointments = appointments.filter((appointment) =>
      isInsideAnyBucket(parseAppointmentDate(appointment), consultationsBuckets),
    )
    const completedConsultations = consultationsAppointments.filter((appointment) => isCompletedStatus(appointment.status))
    const noShowStats = getNoShowStats(consultationsAppointments, now)

    return {
      absenteeismData: buildAbsenteeismSeries(appointments, absenteeismPeriod, now),
      consultationsData: buildConsultationsSeries(appointments, consultationsPeriod, now),
      doctorPerformance: buildDoctorPerformance(appointments, professionals, now),
      insuranceData: buildInsuranceData(patients),
      attendanceMetrics: {
        scheduled: consultationsAppointments.length,
        completed: completedConsultations.length,
        cancelled: consultationsAppointments.filter((appointment) => isCancelledStatus(appointment.status)).length,
        noShow: noShowStats.count,
        noShowRate: noShowStats.rate,
      },
      kpis: [
        { label: 'Consultas Realizadas', value: String(completedConsultations.length), change: `${consultationsAppointments.length} agendadas`, up: true, icon: 'calendar' },
        { label: 'Taxa de Absenteísmo', value: `${noShowStats.rate}%`, change: `${noShowStats.count} ausências`, up: false, icon: 'activity' },
        { label: 'Pacientes Ativos', value: String(patients.length), change: 'cadastro atual', up: true, icon: 'users' },
        { label: 'Convênios', value: String(countDistinctInsurances(patients)), change: 'pacientes cadastrados', up: true, icon: 'building' },
      ],
      topPatients: buildTopPatients(consultationsAppointments),
    }
  },
}

function buildAbsenteeismSeries(appointments, period, now) {
  return buildPeriodBuckets(period, now).map((bucket) => {
    const bucketAppointments = appointments.filter((appointment) => isInsideBucket(parseAppointmentDate(appointment), bucket))
    const noShowStats = getNoShowStats(bucketAppointments, now)

    return {
      month: bucket.label,
      taxa: noShowStats.rate,
      meta: 15,
    }
  })
}

function buildConsultationsSeries(appointments, period, now = new Date()) {
  return buildPeriodBuckets(period, now).map((bucket) => {
    const bucketAppointments = appointments.filter((appointment) => isInsideBucket(parseAppointmentDate(appointment), bucket))

    return {
      month: bucket.label,
      total: bucketAppointments.length,
      realizadas: bucketAppointments.filter((appointment) => isCompletedStatus(appointment.status)).length,
    }
  })
}

function buildDoctorPerformance(appointments, professionals, now) {
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
    if (!isAttendanceDueAppointment(appointment, now)) continue

    const professionalName =
      namesById.get(normalizeId(appointment.professionalId)) ||
      appointment.professional ||
      'Profissional não informado'

    const current = groups.get(professionalName) || { name: professionalName, consultas: 0, noShow: 0 }
    current.consultas += 1
    if (!isCompletedStatus(appointment.status)) current.noShow += 1
    groups.set(professionalName, current)
  }

  return [...groups.values()]
    .sort((a, b) => b.consultas - a.consultas)
    .slice(0, 8)
}

function buildInsuranceData(patients) {
  const counts = new Map()

  for (const patient of patients) {
    const insurance = normalizeInsuranceName(patient.insurance || patient.plan)
    counts.set(insurance, (counts.get(insurance) || 0) + 1)
  }

  const total = Math.max(patients.length, 1)

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count], index) => ({
      count,
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
    }

    current.visits += 1
    groups.set(id, current)
  }

  return [...groups.values()]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 5)
}

function buildPeriodBuckets(period, now = new Date()) {
  const today = startOfDay(now)

  if (period === 'week') {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(today, index - 6)
      return {
        start: startOfDay(date),
        end: endOfDay(date),
        label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date),
      }
    })
  }

  if (period === 'month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    const lastDay = endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0))
    const buckets = []
    let cursor = startOfDay(firstDay)
    let week = 1

    while (cursor <= lastDay) {
      const end = endOfDay(addDays(cursor, 6))
      buckets.push({
        start: cursor,
        end: end > lastDay ? lastDay : end,
        label: `Sem ${week}`,
      })
      cursor = startOfDay(addDays(end, 1))
      week += 1
    }

    return buckets
  }

  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(currentMonth)
    date.setMonth(currentMonth.getMonth() - (5 - index))

    return {
      start: startOfDay(new Date(date.getFullYear(), date.getMonth(), 1)),
      end: endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
      label: new Intl.DateTimeFormat('pt-BR', { month: 'short' })
        .format(date)
        .replace('.', ''),
    }
  })
}

function isInsideAnyBucket(date, buckets) {
  return Boolean(date && buckets.some((bucket) => isInsideBucket(date, bucket)))
}

function isInsideBucket(date, bucket) {
  return Boolean(date && date >= bucket.start && date <= bucket.end)
}

function parseAppointmentDate(appointment) {
  return parseAppointmentDateTime(appointment)
}

function startOfDay(date) {
  const nextDate = new Date(date)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

function endOfDay(date) {
  const nextDate = new Date(date)
  nextDate.setHours(23, 59, 59, 999)
  return nextDate
}

function addDays(date, amount) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + amount)
  return nextDate
}

function countDistinctInsurances(patients) {
  return new Set(patients.map((patient) => normalizeInsuranceName(patient.insurance || patient.plan))).size
}

function normalizeInsuranceName(value) {
  return String(value || '').trim() || 'Não informado'
}

function normalizePeriod(period) {
  if (period === '1m' || period === 'month') return 'month'
  if (period === '6m' || period === 'six_months') return 'six_months'
  if (period === 'week') return 'week'
  return 'six_months'
}

function normalizeId(value) {
  return String(value || '').trim()
}

function normalizeNow(value) {
  if (!value) return new Date()

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}
