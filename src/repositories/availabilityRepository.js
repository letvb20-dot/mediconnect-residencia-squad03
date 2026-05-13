import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { getResponseError, normalizeCollection, normalizeItem } from './repositoryUtils.js'

const availabilityBaseUrl = `${apiConfig.restUrl}/doctor_availability`
const exceptionsBaseUrl = `${apiConfig.restUrl}/doctor_exceptions`

export const availabilityRepository = {
  async getAll(filters = {}) {
    const query = buildRestQuery(filters)
    const response = await fetch(`${availabilityBaseUrl}?${query.toString()}`, {
      headers: getAuthenticatedHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao listar disponibilidades.'))
    }

    return normalizeCollection(await response.json(), []).map(mapAvailability)
  },

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

  async update(id, data) {
    const response = await fetch(`${availabilityBaseUrl}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(toAvailabilityPayload(data)),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao atualizar disponibilidade.'))
    }

    return mapAvailability(normalizeItem(await response.json()))
  },

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

  async getExceptions(filters = {}) {
    const query = buildRestQuery(filters)
    const response = await fetch(`${exceptionsBaseUrl}?${query.toString()}`, {
      headers: getAuthenticatedHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao listar excecoes de agenda.'))
    }

    return normalizeCollection(await response.json(), []).map(mapException)
  },

  async createException(data) {
    const response = await fetch(exceptionsBaseUrl, {
      method: 'POST',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(toExceptionPayload(data)),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao criar excecao de agenda.'))
    }

    return mapException(normalizeItem(await response.json()))
  },

  async getAvailableSlots({ appointmentType, date, doctorId }) {
    const payload = {
      doctor_id: doctorId,
      date,
      start_date: date,
      end_date: date,
      appointment_type: normalizeAppointmentType(appointmentType),
    }

    const response = await fetch(`${apiConfig.functionsUrl.replace(/\/+$/, '')}/get-available-slots`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao calcular slots disponíveis.'))
    }

    const data = await response.json()
    return normalizeCollection(data, ['slots']).map(mapSlot)
  },
}

function buildRestQuery(filters) {
  const query = new URLSearchParams()
  query.set('select', '*')

  if (filters.doctorId) query.set('doctor_id', `eq.${filters.doctorId}`)
  if (filters.weekday !== undefined) query.set('weekday', `eq.${filters.weekday}`)
  if (filters.active !== undefined) query.set('active', `eq.${filters.active}`)
  if (filters.appointmentType) query.set('appointment_type', `eq.${filters.appointmentType}`)
  if (filters.date) query.set('date', `eq.${filters.date}`)
  if (filters.kind) query.set('kind', `eq.${filters.kind}`)
  if (filters.order) query.set('order', filters.order)

  return query
}

function toAvailabilityPayload(data) {
  return cleanPayload({
    doctor_id: data.doctorId,
    weekday: data.weekday,
    start_time: data.startTime,
    end_time: data.endTime,
    slot_minutes: data.slotMinutes,
    appointment_type: data.appointmentType,
    active: data.active,
  })
}

function toExceptionPayload(data) {
  return cleanPayload({
    doctor_id: data.doctorId,
    date: data.date,
    kind: data.kind,
    start_time: data.startTime,
    end_time: data.endTime,
    reason: data.reason,
    created_by: data.createdBy,
  })
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
  // API enum documented for availability currently accepts "presencial".
  void type
  return 'presencial'
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  )
}
