import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { getResponseError, normalizeItem } from './repositoryUtils.js'

export const professionalRepository = {
  async getAll() {
    const response = await fetch(`${apiConfig.restUrl}/doctors`, {
      headers: getAuthenticatedHeaders()
    })
    
    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao buscar médicos.'))
    }
    
    const data = await response.json()
    return (Array.isArray(data) ? data : []).map(mapProfessional)
  },

  async create(data) {
    const response = await fetch(`${apiConfig.functionsUrl}/create-doctor`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(cleanPayload({
        full_name: data.fullName || data.full_name || data.name,
        email: data.email,
        cpf: data.cpf,
        crm: data.crm,
        crm_uf: data.crmUf || data.crm_uf,
        phone_mobile: data.phoneMobile || data.phone_mobile || data.phone,
        specialty: data.specialty || data.specialidade,
        birth_date: data.birthDate || data.birth_date,
      })),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao criar médico.'))
    }

    return mapProfessional(normalizeItem(await response.json(), ['doctor']))
  },

  getCoverageMap() {
    return {
      slots: ['08-12', '09-13', '10-15', '13-18', '08-14'],
      weekdays: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
    }
  },

  resolveCurrentProfessional(profile, professionals = []) {
    const doctorId = normalizeValue(profile?.doctorId)
    const userId = normalizeValue(profile?.id)
    const email = normalizeValue(profile?.email)

    return (
      professionals.find((professional) => normalizeValue(professional.id) === doctorId) ||
      professionals.find((professional) => normalizeValue(professional.userId) === userId) ||
      professionals.find((professional) => normalizeValue(professional.id) === userId) ||
      professionals.find((professional) => normalizeValue(professional.email) === email) ||
      null
    )
  },
}

function mapProfessional(doctor) {
  return {
    id: String(doctor.id || doctor.medico_id || doctor.user_id || doctor.name || doctor.nome),
    userId: doctor.user_id || doctor.userId || doctor.usuario_id || doctor.auth_user_id || null,
    name: doctor.name || doctor.nome || doctor.full_name || 'Médico(a)',
    email: doctor.email || doctor.user_email || doctor.usuario_email || '',
    unit: doctor.unit || doctor.unidade || doctor.clinic_unit || doctor.clinica || doctor.location || '',
    role: doctor.specialty || doctor.speciality || doctor.especialidade || doctor.role || 'Médico(a)',
    schedule: doctor.schedule || doctor.agenda || doctor.disponibilidade || 'Seg a Sex, 08h as 18h',
    nextSlot: doctor.nextSlot || doctor.proximo_horario || doctor.next_slot || 'Consulta pendente',
    patients: doctor.patients || doctor.pacientes_ativos || doctor.active_patients || 0,
    status: doctor.status || doctor.situacao || 'Disponivel',
  }
}

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase()
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}
