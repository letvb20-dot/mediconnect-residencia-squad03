import { apiConfig, getAuthenticatedHeaders, getAuthSession } from '../config/api.js'
import { getResponseError, normalizeCollection, normalizeItem } from './repositoryUtils.js'

const availabilityBaseUrl = `${apiConfig.restUrl}/doctor_availability`
const exceptionsBaseUrl = `${apiConfig.restUrl}/doctor_exceptions`

export const availabilityRepository = {
  async getAll(filters = {}) {
    const rows = await fetchAvailabilityRows(filters)
    return filterAvailabilityRows(rows.map(mapAvailability), filters)
  },

  async create(data) {
    let lastResponse = null

    for (const payload of buildAvailabilityPayloads(data)) {
      const response = await fetch(availabilityBaseUrl, {
        method: 'POST',
        headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        return mapAvailability(normalizeItem(await response.json()))
      }

      lastResponse = response
      if (response.status !== 400) break
    }

    throw new Error(await getResponseError(lastResponse, 'Falha ao criar disponibilidade.'))
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
    let lastResponse = null

    for (const payload of buildExceptionPayloads(data)) {
      const response = await fetch(exceptionsBaseUrl, {
        method: 'POST',
        headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        return mapException(normalizeItem(await response.json()))
      }

      lastResponse = response
      if (response.status !== 400) break
    }

    throw new Error(await getResponseError(lastResponse, 'Falha ao criar exceção de agenda.'))
  },

  async getAvailableSlots({ appointmentType, date, doctorId }) {
    if (!doctorId || !date) {
      throw new Error('Selecione médico e data para calcular os horários disponíveis.')
    }

    const payload = {
      doctor_id: doctorId,
      start_date: date,
      end_date: date,
      appointment_type: normalizeAppointmentType(appointmentType),
    }

    const data = await fetchSlotsWithFallback([
      {
        url: `${apiConfig.functionsUrl.replace(/\/+$/, '')}/get-available-slots`,
        body: {
          doctor_id: payload.doctor_id,
          start_date: payload.start_date,
          end_date: payload.end_date,
          appointment_type: payload.appointment_type,
        },
      },
      {
        url: `${apiConfig.apiUrl.replace(/\/+$/, '')}/get-available-slots`,
        body: payload,
      },
    ])

    return normalizeCollection(data, ['slots']).map(mapSlot)
  },
}

async function fetchSlotsWithFallback(requests) {
  let lastResponse = null

  for (const request of requests) {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(request.body),
    }).catch(() => null)

    if (!response) continue
    lastResponse = response
    if (response.ok) return response.json()
    if (![400, 404, 405].includes(response.status)) break
  }

  throw new Error(await getResponseError(lastResponse, 'Falha ao calcular slots disponíveis.'))
}

function buildRestQuery(filters) {
  const query = new URLSearchParams()
  query.set('select', filters.select || '*')

  if (filters.doctorId) query.set('doctor_id', `eq.${filters.doctorId}`)
  if (filters.weekday !== undefined) query.set('weekday', `eq.${filters.weekday}`)
  if (filters.active !== undefined) query.set('active', `eq.${filters.active}`)
  if (filters.appointmentType) query.set('appointment_type', `eq.${filters.appointmentType}`)
  if (filters.date) query.set('date', `eq.${filters.date}`)
  if (filters.kind) query.set('kind', `eq.${filters.kind}`)
  if (filters.order) query.set('order', filters.order)

  return query
}

async function fetchAvailabilityRows(filters) {
  const queries = [
    buildRestQuery(filters),
    buildRestQuery({
      doctorId: filters.doctorId,
      select: '*',
    }),
    buildRestQuery({ select: '*' }),
  ]
  let lastResponse = null

  for (const query of queries) {
    const response = await fetch(`${availabilityBaseUrl}?${query.toString()}`, {
      headers: getAuthenticatedHeaders(),
    }).catch(() => null)

    if (!response) continue
    lastResponse = response

    if (response.ok) {
      return normalizeCollection(await response.json(), [])
    }

    if (![400, 404, 406].includes(response.status)) break
  }

  throw new Error(await getResponseError(lastResponse, 'Falha ao listar disponibilidades.'))
}

function filterAvailabilityRows(rows, filters) {
  const normalizedType = normalizeAppointmentType(filters.appointmentType)

  return rows.filter((row) => {
    if (filters.doctorId && String(row.doctorId) !== String(filters.doctorId)) return false
    if (filters.weekday !== undefined && Number(row.weekday) !== Number(filters.weekday)) return false
    if (filters.active !== undefined && Boolean(row.active) !== Boolean(filters.active)) return false
    if (filters.appointmentType && normalizeAppointmentType(row.appointmentType) !== normalizedType) return false

    return true
  })
}

function toAvailabilityPayload(data, { withSeconds = false } = {}) {
  return cleanPayload({
    doctor_id: data.doctorId,
    weekday: Number(data.weekday),
    start_time: formatTimeForApi(data.startTime, { withSeconds }),
    end_time: formatTimeForApi(data.endTime, { withSeconds }),
    slot_minutes: Number(data.slotMinutes) || 30,
    appointment_type: normalizeAppointmentType(data.appointmentType),
    active: data.active,
  })
}

function buildAvailabilityPayloads(data) {
  const fullPayload = toAvailabilityPayload(data)
  const payloadWithSeconds = toAvailabilityPayload(data, { withSeconds: true })

  return uniquePayloads([
    fullPayload,
    omitFields(fullPayload, ['appointment_type']),
    omitFields(fullPayload, ['active']),
    omitFields(fullPayload, ['appointment_type', 'active']),
    payloadWithSeconds,
    omitFields(payloadWithSeconds, ['appointment_type']),
    omitFields(payloadWithSeconds, ['active']),
    omitFields(payloadWithSeconds, ['appointment_type', 'active']),
  ])
}

function toExceptionPayload(data) {
  return cleanPayload({
    doctor_id: data.doctorId,
    date: data.date,
    kind: data.kind,
    start_time: data.startTime || null,
    end_time: data.endTime || null,
    reason: data.reason,
    created_by: data.createdBy || getCurrentUserId(),
  })
}

function buildExceptionPayloads(data) {
  const fullPayload = toExceptionPayload(data)

  return uniquePayloads([
    fullPayload,
    omitFields(fullPayload, ['start_time', 'end_time']),
    omitFields(fullPayload, ['start_time', 'end_time', 'reason']),
  ])
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

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  )
}

function formatTimeForApi(value, { withSeconds = false } = {}) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return value

  return withSeconds ? `${match[1]}:${match[2]}:${match[3] || '00'}` : `${match[1]}:${match[2]}`
}

function omitFields(payload, fields) {
  return Object.fromEntries(
    Object.entries(payload).filter(([field]) => !fields.includes(field)),
  )
}

function uniquePayloads(payloads) {
  const seen = new Set()

  return payloads.filter((payload) => {
    const signature = JSON.stringify(payload)
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}

function getCurrentUserId() {
  const session = getAuthSession()
  return session?.user?.id || session?.user_id || session?.sub || undefined
}
