import { apiConfig, getAuthenticatedHeaders, getAuthSession } from '../config/api.js'
import { getResponseError, normalizeCollection, normalizeItem } from './repositoryUtils.js'

const availabilityBaseUrl = `${apiConfig.restUrl}/doctor_availability`
const exceptionsBaseUrl = `${apiConfig.restUrl}/doctor_exceptions`
export const AGENDA_EXCEPTIONS_CHANGED_EVENT = 'mediconnect:agenda-exceptions-changed'
const DEFAULT_SLOT_MINUTES = 30

export const availabilityRepository = {
  // GET /rest/v1/doctor_availability
  async getAll(filters = {}) {
    const query = buildAvailabilityQuery(filters)
    const response = await fetch(`${availabilityBaseUrl}?${query.toString()}`, {
      headers: getAuthenticatedHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao listar disponibilidades.'))
    }

    return normalizeCollection(await response.json(), []).map(mapAvailability)
  },

  // POST /rest/v1/doctor_availability
  async create(data) {
    const response = await fetch(availabilityBaseUrl, {
      method: 'POST',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(toAvailabilityPayload(data)),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao criar disponibilidade.'))
    }

    return mapAvailability(normalizeItem(await response.json()))
  },

  // PATCH /rest/v1/doctor_availability?id=eq.{uuid}
  async update(id, data) {
    const response = await fetch(`${availabilityBaseUrl}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(toAvailabilityUpdatePayload(data)),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao atualizar disponibilidade.'))
    }

    return mapAvailability(normalizeItem(await response.json()))
  },

  // DELETE /rest/v1/doctor_availability?id=eq.{uuid}
  async remove(id) {
    const response = await fetch(`${availabilityBaseUrl}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthenticatedHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao deletar disponibilidade.'))
    }

    return true
  },

  // GET /rest/v1/doctor_exceptions
  async getExceptions(filters = {}) {
    const query = new URLSearchParams()
    query.set('select', filters.select || '*')
    if (filters.doctorId) query.set('doctor_id', `eq.${filters.doctorId}`)
    if (filters.date) query.set('date', `eq.${filters.date}`)
    if (filters.kind) query.set('kind', `eq.${filters.kind}`)

    const response = await fetch(`${exceptionsBaseUrl}?${query.toString()}`, {
      headers: getAuthenticatedHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao listar exceções de agenda.'))
    }

    return normalizeCollection(await response.json(), []).map(mapException)
  },

  // POST /rest/v1/doctor_exceptions
  async createException(data) {
    const response = await fetch(exceptionsBaseUrl, {
      method: 'POST',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(toExceptionPayload(data)),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao criar exceção de agenda.'))
    }

    return mapException(normalizeItem(await response.json()))
  },

  // O modal de novo agendamento deve refletir somente a disponibilidade cadastrada.
  async getAvailableSlots({ date, startDate, endDate, doctorId }) {
    const rangeStart = startDate || date
    const rangeEnd = endDate || date || startDate

    if (!doctorId || !rangeStart || !rangeEnd) {
      throw new Error('Selecione médico e data para calcular os horários disponíveis.')
    }

    return buildSlotsFromConfiguredAvailability({
      doctorId,
      endDate: rangeEnd,
      startDate: rangeStart,
    })
  },
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const PORTUGUESE_WEEKDAYS = {
  domingo: 0,
  dom: 0,
  segunda: 1,
  segunda_feira: 1,
  seg: 1,
  terca: 2,
  terca_feira: 2,
  ter: 2,
  quarta: 3,
  quarta_feira: 3,
  qua: 3,
  quinta: 4,
  quinta_feira: 4,
  qui: 4,
  sexta: 5,
  sexta_feira: 5,
  sex: 5,
  sabado: 6,
  sab: 6,
}

function weekdayToApi(value) {
  const num = Number(value)
  if (Number.isInteger(num) && num >= 0 && num <= 6) return WEEKDAY_NAMES[num]
  const name = String(value || '').toLowerCase()
  if (WEEKDAY_NAMES.includes(name)) return name
  return value
}

function weekdayToUi(value) {
  const englishIndex = WEEKDAY_NAMES.indexOf(String(value || '').toLowerCase())
  if (englishIndex >= 0) return englishIndex

  const num = Number(value)
  if (Number.isInteger(num) && num >= 0 && num <= 6) return num

  const normalized = normalizeKey(value)
  return PORTUGUESE_WEEKDAYS[normalized] ?? value
}

function buildAvailabilityQuery(filters) {
  const query = new URLSearchParams()
  query.set('select', filters.select || '*')
  if (filters.doctorId) query.set('doctor_id', `eq.${filters.doctorId}`)
  if (filters.weekday !== undefined && filters.weekday !== null) {
    query.set('weekday', `eq.${weekdayToApi(filters.weekday)}`)
  }
  if (filters.active !== undefined && filters.active !== null) {
    query.set('active', `eq.${Boolean(filters.active)}`)
  }
  if (filters.appointmentType) {
    query.set('appointment_type', `eq.${normalizeAppointmentType(filters.appointmentType)}`)
  }
  if (filters.order) query.set('order', filters.order)
  return query
}

function toAvailabilityPayload(data) {
  const startTime = formatTimeForApi(data.startTime)
  const endTime = formatTimeForApi(data.endTime)
  validateAvailabilityPayload({ ...data, startTime, endTime })

  return cleanPayload({
    active: data.active === undefined ? true : Boolean(data.active),
    appointment_type: normalizeAppointmentType(data.appointmentType),
    doctor_id: data.doctorId,
    end_time: endTime,
    slot_minutes: data.slotMinutes !== undefined ? Number(data.slotMinutes) : DEFAULT_SLOT_MINUTES,
    start_time: startTime,
    weekday: weekdayToApi(data.weekday),
  })
}

function toAvailabilityUpdatePayload(data) {
  return cleanPayload({
    active: data.active !== undefined ? Boolean(data.active) : undefined,
    appointment_type: data.appointmentType !== undefined
      ? normalizeAppointmentType(data.appointmentType)
      : undefined,
    end_time: data.endTime !== undefined ? formatTimeForApi(data.endTime) : undefined,
    slot_minutes: data.slotMinutes !== undefined ? Number(data.slotMinutes) : undefined,
    start_time: data.startTime !== undefined ? formatTimeForApi(data.startTime) : undefined,
  })
}

function toExceptionPayload(data) {
  return cleanPayload({
    created_by: data.createdBy || getCurrentUserId(),
    date: data.date,
    doctor_id: data.doctorId,
    end_time: data.endTime ? formatTimeForApi(data.endTime) : null,
    kind: data.kind,
    reason: data.reason || null,
    start_time: data.startTime ? formatTimeForApi(data.startTime) : null,
  }, { keepNull: true })
}

function mapAvailability(item) {
  return {
    active: parseAvailabilityActive(item.active),
    appointmentType: item.appointment_type,
    createdAt: item.created_at,
    doctorId: item.doctor_id,
    endTime: item.end_time,
    id: item.id,
    slotMinutes: item.slot_minutes,
    startTime: item.start_time,
    updatedAt: item.updated_at,
    weekday: weekdayToUi(item.weekday),
  }
}

function mapException(item) {
  return {
    createdBy: item.created_by,
    date: item.date,
    doctorId: item.doctor_id,
    endTime: item.end_time,
    id: item.id,
    kind: item.kind,
    reason: item.reason,
    startTime: item.start_time,
  }
}

async function buildSlotsFromConfiguredAvailability({ doctorId, startDate, endDate }) {
  const dates = buildDateRange(startDate, endDate)
  if (!dates.length) return []

  const [availabilities, exceptionsByDate] = await Promise.all([
    availabilityRepository.getAll({ doctorId, order: 'weekday.asc,start_time.asc' }),
    Promise.all(dates.map((date) =>
      availabilityRepository.getExceptions({ date, doctorId }).catch(() => []),
    )),
  ])

  return dates.flatMap((date, index) => {
    const weekday = parseLocalDate(date)?.getDay()
    const dayExceptions = exceptionsByDate[index] || []
    const regularSlots = availabilities
      .filter((availability) =>
        Number(availability.weekday) === weekday &&
        availability.active !== false,
      )
      .flatMap((availability) =>
        buildSlotsForRange({
          date,
          endTime: availability.endTime,
          slotMinutes: Number(availability.slotMinutes) || DEFAULT_SLOT_MINUTES,
          startTime: availability.startTime,
        }),
      )
    const extraSlots = dayExceptions
      .filter((exception) => exception.kind === 'disponibilidade_extra')
      .flatMap((exception) =>
        buildSlotsForRange({
          date,
          endTime: exception.endTime,
          slotMinutes: DEFAULT_SLOT_MINUTES,
          startTime: exception.startTime,
        }),
      )

    return uniqueSlotsByDateTime([...regularSlots, ...extraSlots])
      .filter((slot) => !isBlockedByException(slot.time, dayExceptions))
  })
}

function buildDateRange(startDate, endDate) {
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)
  if (!start || !end || start.getTime() > end.getTime()) return []

  const dates = []
  const cursor = new Date(start)
  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function buildSlotsForRange({ date, endTime, slotMinutes, startTime }) {
  const start = minutesFromTime(normalizeTime(startTime))
  const end = minutesFromTime(normalizeTime(endTime))
  const interval = Number(slotMinutes) || DEFAULT_SLOT_MINUTES
  if (start === null || end === null || start > end || interval <= 0) return []

  const slots = []
  for (let cursor = start; cursor <= end; cursor += interval) {
    const time = formatMinutes(cursor)
    slots.push({
      available: true,
      date,
      datetime: `${date}T${time}:00`,
      time,
    })
  }
  return slots
}

function uniqueSlotsByDateTime(slots) {
  const seen = new Set()
  return slots
    .filter((slot) => {
      const key = `${slot.date}-${slot.time}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((first, second) => minutesFromTime(first.time) - minutesFromTime(second.time))
}

function isBlockedByException(time, exceptions) {
  const target = minutesFromTime(time)
  if (target === null) return true

  return exceptions.some((exception) => {
    if (exception.kind !== 'bloqueio') return false
    if (!exception.startTime && !exception.endTime) return true

    const start = minutesFromTime(normalizeTime(exception.startTime))
    const end = minutesFromTime(normalizeTime(exception.endTime))
    if (start === null && end === null) return true
    if (start !== null && end !== null) return target >= start && target < end
    if (start !== null) return target >= start
    return target < end
  })
}

function parseAvailabilityActive(value) {
  if (value === undefined || value === null) return true
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0

  return !['false', '0', 'no', 'nao', 'não', 'inactive', 'inativo'].includes(
    String(value).trim().toLowerCase(),
  )
}

function normalizeAppointmentType(type) {
  const normalized = String(type || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  return normalized.includes('tele') ? 'telemedicina' : 'presencial'
}

function cleanPayload(payload, { keepNull = false } = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (value === undefined) return false
      if (!keepNull && value === null) return false
      return true
    }),
  )
}

function formatTimeForApi(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return value
  return `${match[1]}:${match[2]}`
}

function validateAvailabilityPayload(data) {
  if (!data.doctorId) {
    throw new Error('Selecione um médico para criar disponibilidade.')
  }

  const weekday = Number(data.weekday)
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error('Selecione um dia da semana válido para a disponibilidade.')
  }

  const startMinutes = minutesFromTime(data.startTime)
  const endMinutes = minutesFromTime(data.endTime)
  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    throw new Error('O horário inicial da disponibilidade deve ser menor que o horário final.')
  }

  const slotMinutes = Number(data.slotMinutes ?? DEFAULT_SLOT_MINUTES)
  if (!Number.isFinite(slotMinutes) || slotMinutes < 5 || slotMinutes > 240) {
    throw new Error('Informe um intervalo de slot válido.')
  }
}

function normalizeTime(value) {
  const raw = String(value || '')
  const directMatch = raw.match(/(\d{1,2}):(\d{2})/)
  if (directMatch) {
    return `${directMatch[1].padStart(2, '0')}:${directMatch[2]}`
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function minutesFromTime(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function formatMinutes(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const minutes = String(totalMinutes % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

function parseLocalDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getCurrentUserId() {
  const session = getAuthSession()
  return session?.user?.id || session?.user_id || session?.sub || undefined
}
