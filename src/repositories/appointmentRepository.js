import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { appointmentMapper } from '../mappers/appointmentMapper.js'
import { getResponseError, normalizeItem } from './repositoryUtils.js'

export const appointmentRepository = {
  async getAll({ doctorId, patientId, status } = {}) {
    const query = new URLSearchParams({
      select: '*,patients(full_name),doctors(full_name)',
    })
    if (doctorId) query.set('doctor_id', `eq.${doctorId}`)
    if (patientId) query.set('patient_id', `eq.${patientId}`)
    if (status) query.set('status', `eq.${status}`)

    const response = await fetch(`${apiConfig.restUrl}/appointments?${query.toString()}`, {
      headers: getAuthenticatedHeaders()
    })
    
    if (!response.ok) throw new Error(await getResponseError(response, 'Erro ao buscar agendamentos.'))
    
    const data = await response.json()
    return (Array.isArray(data) ? data : []).map(appointmentMapper.toUi)
  },

  async create(uiData) {
    let lastResponse = null

    for (const payload of buildAppointmentPayloads(uiData)) {
      const response = await fetch(`${apiConfig.restUrl}/appointments`, {
        method: 'POST',
        headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const data = await response.json()
        return appointmentMapper.toUi(normalizeItem(data))
      }

      lastResponse = response
      if (response.status !== 400) break
    }

    throw new Error(await getResponseError(lastResponse, 'Falha ao criar o agendamento.'))
  },

  async update(id, uiData) {
    let lastResponse = null

    for (const payload of buildAppointmentPayloads(uiData)) {
      const response = await fetch(`${apiConfig.restUrl}/appointments?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const data = await response.json()
        return appointmentMapper.toUi(normalizeItem(data))
      }

      lastResponse = response
      if (response.status !== 400) break
    }

    throw new Error(await getResponseError(lastResponse, 'Falha ao atualizar o agendamento.'))
  },

  async cancel(id, uiData) {
    return this.update(id, { ...uiData, status: 'Cancelado' })
  },
}

function buildAppointmentPayloads(uiData) {
  const fullPayload = appointmentMapper.toApi(uiData, 'supabase')
  const documentedPayload = pickFields(fullPayload, [
    'doctor_id',
    'patient_id',
    'scheduled_at',
    'created_by',
    'duration_minutes',
    'status',
  ])

  return uniquePayloads([fullPayload, documentedPayload])
}

function pickFields(payload, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => payload[field] !== undefined)
      .map((field) => [field, payload[field]]),
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
