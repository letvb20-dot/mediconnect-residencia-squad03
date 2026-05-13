import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { appointmentMapper } from '../mappers/appointmentMapper.js'
import { getResponseError, normalizeItem } from './repositoryUtils.js'

export const appointmentRepository = {
  async getAll({ doctorId } = {}) {
    const doctorFilter = doctorId ? `&doctor_id=eq.${encodeURIComponent(doctorId)}` : ''

    const response = await fetch(`${apiConfig.restUrl}/appointments?select=*,patients(full_name),doctors(full_name)${doctorFilter}`, {
      headers: getAuthenticatedHeaders()
    })
    
    if (!response.ok) throw new Error(await getResponseError(response, 'Erro ao buscar agendamentos.'))
    
    const data = await response.json()
    return (Array.isArray(data) ? data : []).map(appointmentMapper.toUi)
  },

  async create(uiData) {
    const response = await fetch(`${apiConfig.restUrl}/appointments`, {
      method: 'POST',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(appointmentMapper.toApi(uiData, 'supabase')),
    })

    if (!response.ok) throw new Error(await getResponseError(response, 'Falha ao criar o agendamento.'))

    const data = await response.json()
    return appointmentMapper.toUi(normalizeItem(data))
  },

  async update(id, uiData) {
    const response = await fetch(`${apiConfig.restUrl}/appointments?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(appointmentMapper.toApi(uiData, 'supabase')),
    })

    if (!response.ok) throw new Error(await getResponseError(response, 'Falha ao atualizar o agendamento.'))

    const data = await response.json()
    return appointmentMapper.toUi(normalizeItem(data))
  },

  async cancel(id, uiData) {
    return this.update(id, { ...uiData, status: 'Cancelada' })
  },
}
