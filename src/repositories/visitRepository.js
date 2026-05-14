import { appointmentRepository } from './appointmentRepository.js'

export const visitRepository = {
  async getCareQueue() {
    const appointments = await appointmentRepository.getAll()

    return appointments
      .filter((appointment) => shouldShowInQueue(appointment.status))
      .map(mapAppointmentToQueueItem)
      .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || a.startedAt.localeCompare(b.startedAt))
  },

  getStages() {
    return [
      { title: 'Triagem', description: 'Sinais vitais, queixa principal e alerta de risco antes da chamada médica.' },
      { title: 'Atendimento médico', description: 'Consulta em andamento, conduta, prescrição e solicitação de exames.' },
      { title: 'Pós-consulta', description: 'Orientações finais, documentos emitidos e retorno sugerido pela equipe.' },
    ]
  },
}

function mapAppointmentToQueueItem(appointment) {
  return {
    id: appointment.id,
    patientId: appointment.patientId,
    patient: appointment.patient,
    reason: appointment.notes || appointment.type || 'Consulta agendada',
    status: mapQueueStatus(appointment.status),
    wait: calculateWait(appointment),
    priority: inferPriority(appointment),
    startedAt: `${appointment.date || ''}T${appointment.time || '00:00'}`,
  }
}

function shouldShowInQueue(status) {
  const normalized = normalizeStatus(status)
  return !['cancelada', 'cancelado'].includes(normalized)
}

function mapQueueStatus(status) {
  const normalized = normalizeStatus(status)
  if (['concluida', 'concluido', 'finalizada', 'finalizado'].includes(normalized)) return 'Finalizada'
  if (['em_triagem', 'triagem', 'checked_in'].includes(normalized)) return 'Em triagem'
  if (['em_atendimento', 'atendimento'].includes(normalized)) return 'Em atendimento'
  return 'Aguardando médico'
}

function inferPriority(appointment) {
  if (appointment.highPriority) return 'Alta'

  const explicitPriority = normalizePriority(appointment.priority)
  if (explicitPriority) return explicitPriority

  const text = [appointment.status, appointment.notes, appointment.type]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (/urgente|alta|risco|prioridade/.test(text)) return 'Alta'
  if (/retorno|rotina|baixa/.test(text)) return 'Baixa'
  return 'Média'
}

function normalizePriority(priority) {
  const normalized = String(priority || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (!normalized) return ''
  if (normalized.includes('alta') || normalized.includes('urgente')) return 'Alta'
  if (normalized.includes('baixa')) return 'Baixa'
  if (normalized.includes('media') || normalized.includes('normal')) return 'Média'
  return ''
}

function calculateWait(appointment) {
  const date = new Date(`${appointment.date}T${appointment.time || '00:00'}:00`)
  if (Number.isNaN(date.getTime())) return 'Horário não informado'

  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000)
  if (diffMinutes <= 0) return 'No horário'
  if (diffMinutes < 60) return `${diffMinutes} min`

  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`
}

function priorityWeight(priority) {
  return { Alta: 3, Média: 2, Baixa: 1 }[priority] || 0
}

function normalizeStatus(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
