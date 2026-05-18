export function getNoShowStats(appointments = [], now = new Date()) {
  const dueAppointments = appointments.filter((appointment) => isAttendanceDueAppointment(appointment, now))
  const noShowAppointments = dueAppointments.filter((appointment) => !isCompletedStatus(appointment.status))

  return {
    appointments: noShowAppointments,
    count: noShowAppointments.length,
    rate: dueAppointments.length ? roundPercent(noShowAppointments.length, dueAppointments.length) : 0,
    total: dueAppointments.length,
  }
}

export function isAttendanceDueAppointment(appointment, now = new Date()) {
  return isPastAppointment(appointment, now) && !isCancelledStatus(appointment.status)
}

export function isNoShowAppointment(appointment, now = new Date()) {
  return isAttendanceDueAppointment(appointment, now) && !isCompletedStatus(appointment.status)
}

export function isPastAppointment(appointment, now = new Date()) {
  const date = parseAppointmentDateTime(appointment)
  return Boolean(date && date.getTime() < now.getTime())
}

export function parseAppointmentDateTime(appointment) {
  if (!appointment) return null

  const scheduledAt = appointment.scheduledAt || appointment.scheduled_at
  if (scheduledAt) {
    const scheduledDate = new Date(scheduledAt)
    if (!Number.isNaN(scheduledDate.getTime())) return scheduledDate
  }

  if (!appointment.date) return null

  const [year, month, day] = String(appointment.date).split('-').map(Number)
  const [hours = 0, minutes = 0] = String(appointment.time || '00:00').split(':').map(Number)
  if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) return null

  const date = new Date(year, month - 1, day, hours, minutes)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isCompletedStatus(status) {
  return ['realizado', 'realizada', 'concluida', 'concluido', 'completed', 'finalizada', 'finalizado'].includes(normalizeStatus(status))
}

export function isCancelledStatus(status) {
  return ['cancelada', 'cancelado', 'cancelled'].includes(normalizeStatus(status))
}

export function normalizeStatus(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function roundPercent(part, total) {
  return Math.round((part / Math.max(total, 1)) * 1000) / 10
}
