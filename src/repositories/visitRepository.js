const CONSULTATION_QUEUE_STORAGE_KEY = 'mediconnect.consultationQueue.v1'

export const CONSULTATION_QUEUE_CHANGED_EVENT = 'mediconnect:consultation-queue-changed'

let memoryQueue = []

export const visitRepository = {
  async getCareQueue() {
    return sortQueueItems(readQueue().map(normalizeQueueItem))
  },

  enqueue(payload, { conflictingAppointment = null, patients = [], professionals = [] } = {}) {
    const queue = readQueue()
    const duplicate = queue.find((item) =>
      isActiveQueueItem(item) &&
      normalizeValue(item.patientId) === normalizeValue(payload.patientId) &&
      isSameQueueSlot(item, payload),
    )

    if (duplicate) return normalizeQueueItem(duplicate)

    const item = normalizeQueueItem({
      id: createQueueId(),
      patientId: payload.patientId,
      patient: getPatientName(payload.patientId, patients),
      professionalId: payload.professionalId,
      professional: getProfessionalName(payload.professionalId, professionals),
      date: payload.date,
      time: normalizeTime(payload.time),
      type: payload.type,
      mode: payload.mode,
      durationMinutes: payload.durationMinutes,
      status: 'Na fila',
      highPriority: Boolean(payload.highPriority),
      priority: payload.priority || (payload.highPriority ? 'Alta' : 'Média'),
      notes: payload.notes || '',
      reason: buildQueueReason(payload, conflictingAppointment),
      room: payload.room,
      createdBy: payload.createdBy || '',
      createdByName: payload.createdByName || '',
      requestedAt: new Date().toISOString(),
      conflictingAppointmentId: conflictingAppointment?.id || '',
    })

    writeQueue([item, ...queue])
    return item
  },

  findNextForSlot(payload) {
    const matchingItems = readQueue()
      .filter(isActiveQueueItem)
      .filter((item) => isSameQueueSlot(item, payload))
      .sort(sortActiveQueueItems)

    return matchingItems.length ? normalizeQueueItem(matchingItems[0]) : null
  },

  markScheduled(queueItemId, appointment = {}) {
    let scheduledItem = null

    const queue = readQueue().map((item) => {
      if (String(item.id) !== String(queueItemId)) return item

      scheduledItem = normalizeQueueItem({
        ...item,
        status: 'Finalizada',
        scheduledAppointmentId: appointment.id || item.scheduledAppointmentId || '',
        scheduledAt: new Date().toISOString(),
      })
      return scheduledItem
    })

    writeQueue(queue)
    return scheduledItem
  },

  remove(queueItemId) {
    writeQueue(readQueue().filter((item) => String(item.id) !== String(queueItemId)))
  },

  getStages() {
    return [
      {
        title: 'Solicitação de encaixe',
        description: 'Ao tentar marcar em um horário ocupado, o paciente entra na fila daquele médico, dia e horário.',
      },
      {
        title: 'Aguardando desistência',
        description: 'A fila acompanha quem deve ser chamado caso o agendamento original seja cancelado.',
      },
      {
        title: 'Promoção automática',
        description: 'Quando o horário é liberado por cancelamento, o primeiro paciente da fila vira agendamento com status Agendado.',
      },
    ]
  },
}

function readQueue() {
  const storage = getStorage()
  if (!storage) return [...memoryQueue]

  try {
    const data = JSON.parse(storage.getItem(CONSULTATION_QUEUE_STORAGE_KEY) || '[]')
    return Array.isArray(data) ? data : []
  } catch {
    storage.removeItem(CONSULTATION_QUEUE_STORAGE_KEY)
    return []
  }
}

function writeQueue(queue) {
  const normalizedQueue = queue.map(normalizeQueueItem)
  const storage = getStorage()

  if (storage) {
    storage.setItem(CONSULTATION_QUEUE_STORAGE_KEY, JSON.stringify(normalizedQueue))
  } else {
    memoryQueue = normalizedQueue
  }

  notifyQueueChanged()
}

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage
  return null
}

function notifyQueueChanged() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return

  const EventConstructor = typeof window.CustomEvent === 'function' ? window.CustomEvent : window.Event
  if (typeof EventConstructor !== 'function') return

  window.dispatchEvent(new EventConstructor(CONSULTATION_QUEUE_CHANGED_EVENT))
}

function normalizeQueueItem(item) {
  const priority = normalizePriority(item.priority || (item.highPriority ? 'Alta' : 'Média'))

  return {
    id: item.id || createQueueId(),
    patientId: item.patientId || '',
    patient: item.patient || 'Paciente não informado',
    professionalId: item.professionalId || '',
    professional: item.professional || 'Médico(a) não informado',
    date: item.date || '',
    time: normalizeTime(item.time),
    type: item.type || 'Consulta',
    mode: item.mode || '',
    durationMinutes: Number(item.durationMinutes) || 30,
    status: item.status || 'Na fila',
    highPriority: Boolean(item.highPriority || priority === 'Alta'),
    priority,
    notes: item.notes || '',
    reason: item.reason || buildQueueReason(item),
    room: item.room || '',
    createdBy: item.createdBy || '',
    createdByName: item.createdByName || '',
    requestedAt: item.requestedAt || new Date().toISOString(),
    scheduledAt: item.scheduledAt || '',
    scheduledAppointmentId: item.scheduledAppointmentId || '',
    conflictingAppointmentId: item.conflictingAppointmentId || '',
    wait: calculateWait(item),
    startedAt: `${item.date || ''}T${normalizeTime(item.time) || '00:00'}`,
  }
}

function sortQueueItems(items) {
  return [...items].sort((first, second) => {
    const activeDelta = Number(isFinalizedQueueItem(first)) - Number(isFinalizedQueueItem(second))
    if (activeDelta) return activeDelta

    if (!isFinalizedQueueItem(first) && !isFinalizedQueueItem(second)) {
      return sortActiveQueueItems(first, second)
    }

    return getTimestamp(second.scheduledAt || second.requestedAt) - getTimestamp(first.scheduledAt || first.requestedAt)
  })
}

function sortActiveQueueItems(first, second) {
  return (
    priorityWeight(second.priority) - priorityWeight(first.priority) ||
    String(first.date || '').localeCompare(String(second.date || '')) ||
    normalizeTime(first.time).localeCompare(normalizeTime(second.time)) ||
    getTimestamp(first.requestedAt) - getTimestamp(second.requestedAt)
  )
}

function buildQueueReason(payload, conflictingAppointment = null) {
  const parts = [
    payload.type || 'Consulta',
    payload.date && payload.time ? `${formatDate(payload.date)} às ${normalizeTime(payload.time)}` : '',
  ].filter(Boolean)
  const conflictDetail = conflictingAppointment?.patient
    ? ` aguardando cancelamento de ${conflictingAppointment.patient}`
    : ' aguardando cancelamento do horário'

  return `${parts.join(' - ')}${conflictDetail}.`
}

function isSameQueueSlot(item, payload) {
  return (
    normalizeValue(item.professionalId) === normalizeValue(payload.professionalId) &&
    String(item.date || '') === String(payload.date || '') &&
    normalizeTime(item.time) === normalizeTime(payload.time)
  )
}

function isActiveQueueItem(item) {
  return !isFinalizedQueueItem(item)
}

export function isFinalizedQueueItem(item) {
  const normalized = normalizeStatus(typeof item === 'string' ? item : item?.status)
  return ['finalizada', 'finalizado', 'agendada', 'agendado', 'chamado', 'chamada'].includes(normalized)
}

function calculateWait(item) {
  if (isFinalizedQueueItem(item)) {
    return item.scheduledAt ? `Chamado em ${formatDateTime(item.scheduledAt)}` : 'Chamado'
  }

  const timestamp = getTimestamp(item.requestedAt)
  if (!timestamp) return 'Entrada recente'

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (diffMinutes < 1) return 'Agora'
  if (diffMinutes < 60) return `${diffMinutes} min`

  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`
}

function getPatientName(patientId, patients) {
  const patient = patients.find((item) => normalizeValue(item.id) === normalizeValue(patientId))
  return patient?.name || patient?.full_name || patient?.nome || 'Paciente não informado'
}

function getProfessionalName(professionalId, professionals) {
  const professional = professionals.find((item) => normalizeValue(item.id) === normalizeValue(professionalId))
  return professional?.name || professional?.full_name || professional?.nome || 'Médico(a) não informado'
}

function normalizePriority(priority) {
  const normalized = normalizeStatus(priority)
  if (normalized.includes('alta') || normalized.includes('urgente')) return 'Alta'
  if (normalized.includes('baixa')) return 'Baixa'
  return 'Média'
}

function priorityWeight(priority) {
  return { Alta: 3, Média: 2, Baixa: 1 }[priority] || 0
}

function createQueueId() {
  return globalThis.crypto?.randomUUID?.() || `queue-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getTimestamp(value) {
  const timestamp = new Date(value || '').getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function formatDate(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function normalizeTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function normalizeStatus(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase()
}
