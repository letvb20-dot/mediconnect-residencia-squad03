import { apiConfig, getAuthenticatedHeaders, getAuthSession } from '../config/api.js'
import { getResponseError, normalizeCollection, normalizeItem } from './repositoryUtils.js'

const availabilityBaseUrl = `${apiConfig.restUrl}/doctor_availability`
const exceptionsBaseUrl = `${apiConfig.restUrl}/doctor_exceptions`

export const availabilityRepository = {
  // GET /rest/v1/doctor_availability
  // Filtros documentados: doctor_id, weekday (0-6), active, appointment_type, select
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
  // Body documentado: doctor_id*, weekday* (0-6), start_time*, end_time*, slot_minutes?, appointment_type?, active?
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
  // Body documentado: start_time?, end_time?, slot_minutes?, active?, appointment_type?
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
  // Filtros documentados: doctor_id, date, kind (bloqueio|disponibilidade_extra)
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
  // Body documentado: doctor_id*, date*, kind* (bloqueio|disponibilidade_extra), created_by*, start_time?, end_time?, reason?
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

  // POST /functions/v1/get-available-slots
  // Body documentado: doctor_id*, date* (YYYY-MM-DD)
  async getAvailableSlots({ date, doctorId }) {
    if (!doctorId || !date) {
      throw new Error('Selecione médico e data para calcular os horários disponíveis.')
    }

    const response = await fetch(`${apiConfig.functionsUrl}/get-available-slots`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify({
        doctor_id: doctorId,
        date,
      }),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao calcular slots disponíveis.'))
    }

    const data = await response.json()
    return normalizeCollection(data, ['slots']).map(mapSlot)
  },
}

function buildAvailabilityQuery(filters) {
  const query = new URLSearchParams()
  query.set('select', filters.select || '*')
  if (filters.doctorId) query.set('doctor_id', `eq.${filters.doctorId}`)
  if (filters.weekday !== undefined && filters.weekday !== null) {
    query.set('weekday', `eq.${Number(filters.weekday)}`)
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
  return cleanPayload({
    doctor_id: data.doctorId,
    weekday: Number(data.weekday),
    start_time: formatTimeForApi(data.startTime),
    end_time: formatTimeForApi(data.endTime),
    slot_minutes: data.slotMinutes !== undefined ? Number(data.slotMinutes) : 30,
    appointment_type: normalizeAppointmentType(data.appointmentType),
    active: data.active === undefined ? true : Boolean(data.active),
  })
}

function toAvailabilityUpdatePayload(data) {
  // PATCH: enviar somente campos que vieram explicitamente (não incluir doctor_id nem weekday)
  return cleanPayload({
    start_time: data.startTime !== undefined ? formatTimeForApi(data.startTime) : undefined,
    end_time: data.endTime !== undefined ? formatTimeForApi(data.endTime) : undefined,
    slot_minutes: data.slotMinutes !== undefined ? Number(data.slotMinutes) : undefined,
    active: data.active !== undefined ? Boolean(data.active) : undefined,
    appointment_type: data.appointmentType !== undefined
      ? normalizeAppointmentType(data.appointmentType)
      : undefined,
  })
}

function toExceptionPayload(data) {
  return cleanPayload({
    doctor_id: data.doctorId,
    date: data.date,
    kind: data.kind,
    start_time: data.startTime || null,
    end_time: data.endTime || null,
    reason: data.reason || null,
    created_by: data.createdBy || getCurrentUserId(),
  }, { keepNull: true })
}

function mapAvailability(item) {
  return {
    id: item.id,
    doctorId: item.doctor_id,
    weekday: item.weekday,
    startTime: item.start_time,
    endTime: item.end_time,
    slotMinutes: item.slot_minutes,
    appointmentType: item.appointment_type,
    active: item.active,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }
}

function mapException(item) {
  return {
    id: item.id,
    doctorId: item.doctor_id,
    date: item.date,
    kind: item.kind,
    startTime: item.start_time,
    endTime: item.end_time,
    reason: item.reason,
    createdBy: item.created_by,
  }
}

function mapSlot(slot) {
  return {
    date: slot.date,
    datetime: slot.datetime,
    time: slot.time,
    available: Boolean(slot.available),
  }
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
  // API aceita HH:MM. Aceita também HH:MM:SS (formato 'time'), mas HH:MM é suficiente.
  const match = String(value || '').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return value
  return `${match[1]}:${match[2]}`
}

function getCurrentUserId() {
  const session = getAuthSession()
  return session?.user?.id || session?.user_id || session?.sub || undefined
}
