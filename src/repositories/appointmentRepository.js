import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { appointmentMapper } from '../mappers/appointmentMapper.js'
import { getResponseError, normalizeItem } from './repositoryUtils.js'

export const appointmentRepository = {
  // GET /rest/v1/appointments
  // Filtros documentados: doctor_id, patient_id, status (requested|confirmed|completed|cancelled)
  async getAll({ doctorId, patientId, status } = {}) {
    const query = new URLSearchParams({
      select: '*,patients(full_name),doctors(full_name)',
    })
    if (doctorId) query.set('doctor_id', `eq.${doctorId}`)
    if (patientId) query.set('patient_id', `eq.${patientId}`)
    if (status) query.set('status', `eq.${toApiStatus(status)}`)

    const response = await fetch(`${apiConfig.restUrl}/appointments?${query.toString()}`, {
      headers: getAuthenticatedHeaders()
    })

    if (!response.ok) throw new Error(await getResponseError(response, 'Erro ao buscar agendamentos.'))

    const data = await response.json()
    return (Array.isArray(data) ? data : []).map(appointmentMapper.toUi)
  },

  // POST /rest/v1/appointments
  // Body documentado: doctor_id*, patient_id*, scheduled_at*, created_by*, duration_minutes?, status?
  async create(uiData) {
    const payload = buildAppointmentPayload(uiData)

    const response = await fetch(`${apiConfig.restUrl}/appointments`, {
      method: 'POST',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao criar o agendamento.'))
    }

    const data = await response.json()
    return appointmentMapper.toUi(normalizeItem(data))
  },

  // PATCH /rest/v1/appointments?id=eq.{id}
  async update(id, uiData) {
    const payload = buildAppointmentPayload(uiData)

    const response = await fetch(`${apiConfig.restUrl}/appointments?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao atualizar o agendamento.'))
    }

    const data = await response.json()
    return appointmentMapper.toUi(normalizeItem(data))
  },

  async cancel(id, uiData) {
    // 'cancelled' = valor canônico do enum (em inglês). O mapper já normaliza,
    // mas passamos direto para evitar ambiguidade.
    return this.update(id, { ...uiData, status: 'cancelled' })
  },
}

// Constrói apenas com os campos documentados no contrato OpenAPI
function buildAppointmentPayload(uiData) {
  const fullPayload = appointmentMapper.toApi(uiData, 'supabase')
  return pickFields(fullPayload, [
    'doctor_id',
    'patient_id',
    'scheduled_at',
    'duration_minutes',
    'status',
    'appointment_type',
    'created_by',
  ])
}

function pickFields(payload, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => payload[field] !== undefined && payload[field] !== null)
      .map((field) => [field, payload[field]]),
  )
}

// Converte status pt-BR -> enum API (requested|confirmed|completed|cancelled)
function toApiStatus(status) {
  const normalized = String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  const map = {
    agendado: 'requested',
    agendada: 'requested',
    requested: 'requested',
    confirmado: 'confirmed',
    confirmada: 'confirmed',
    confirmed: 'confirmed',
    realizado: 'completed',
    realizada: 'completed',
    completed: 'completed',
    cancelado: 'cancelled',
    cancelada: 'cancelled',
    cancelled: 'cancelled',
  }

  return map[normalized] || status
}
