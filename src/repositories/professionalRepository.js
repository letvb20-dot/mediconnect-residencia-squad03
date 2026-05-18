import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { getResponseError, normalizeItem } from './repositoryUtils.js'

const PROFILE_TABLES = ['profiles', 'user_profiles']

export const professionalRepository = {
  // GET /rest/v1/doctors
  // Filtros documentados: select, active, specialty
  async getAll(filters = {}) {
    const query = new URLSearchParams()
    query.set('select', filters.select || '*')
    if (filters.active !== undefined) query.set('active', `eq.${filters.active}`)
    if (filters.specialty) query.set('specialty', `eq.${filters.specialty}`)

    const response = await fetch(`${apiConfig.restUrl}/doctors?${query.toString()}`, {
      headers: getAuthenticatedHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao buscar medicos.'))
    }

    const data = await response.json()
    const profiles = await getProfiles().catch(() => [])
    return (Array.isArray(data) ? data : [])
      .map(mapProfessional)
      .map((professional) => mergeProfessionalProfile(professional, profiles))
  },

  // POST /functions/v1/create-doctor
  // Body documentado: email*, full_name*, cpf* (^\d{11}$), crm*, crm_uf* (^[A-Z]{2}$), specialty?, phone_mobile?
  async create(data) {
    const body = cleanPayload({
      email: data.email?.trim(),
      full_name: String(data.fullName || data.full_name || data.name || '').trim(),
      cpf: onlyDigits(data.cpf),
      crm: onlyDigits(data.crm),
      crm_uf: (data.crmUf || data.crm_uf || '').toString().trim().toUpperCase(),
      specialty: String(data.specialty || data.specialidade || '').trim(),
      phone_mobile: onlyDigits(data.phoneMobile || data.phone_mobile || data.phone),
    })

    const response = await fetch(`${apiConfig.functionsUrl}/create-doctor`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao criar medico.'))
    }

    const result = await response.json()
    return mapProfessional(normalizeItem(result, ['doctor']))
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
  const specialty = doctor.specialty || doctor.speciality || doctor.especialidade || doctor.specialidade

  return {
    id: String(doctor.id || doctor.medico_id || doctor.user_id || doctor.name || doctor.nome),
    userId: doctor.user_id || doctor.userId || doctor.usuario_id || doctor.auth_user_id || null,
    name: doctor.full_name || doctor.name || doctor.nome || 'Medico(a)',
    full_name: doctor.full_name || doctor.name || doctor.nome || '',
    email: doctor.email || doctor.user_email || doctor.usuario_email || '',
    cpf: doctor.cpf || doctor.document || doctor.documento || '',
    crm: doctor.crm || '',
    crm_uf: doctor.crm_uf || doctor.crmUf || doctor.uf_crm || '',
    specialty,
    unit: doctor.unit || doctor.unidade || doctor.clinic_unit || doctor.clinica || doctor.location || '',
    role: specialty || doctor.role || 'Medico(a)',
    schedule: doctor.schedule || doctor.agenda || doctor.disponibilidade || 'Seg a Sex, 08h as 18h',
    nextSlot: doctor.nextSlot || doctor.proximo_horario || doctor.next_slot || 'Consulta pendente',
    patients: doctor.patients || doctor.pacientes_ativos || doctor.active_patients || 0,
    status: doctor.status || doctor.situacao || 'Disponivel',
  }
}

async function getProfiles() {
  for (const table of PROFILE_TABLES) {
    const query = new URLSearchParams({ select: '*' })
    const response = await fetch(`${apiConfig.restUrl}/${table}?${query.toString()}`, {
      headers: getAuthenticatedHeaders(),
    }).catch(() => null)

    if (!response) continue
    if (response.ok) {
      const data = await response.json().catch(() => [])
      return Array.isArray(data) ? data : []
    }
    if (![404, 406].includes(response.status)) {
      throw new Error(await getResponseError(response, 'Erro ao buscar perfis de usuarios.'))
    }
  }

  return []
}

function mergeProfessionalProfile(professional, profiles) {
  const professionalKeys = buildLookupKeys([
    professional.id,
    professional.userId,
    professional.email,
    professional.cpf,
  ])
  const profile = profiles.find((item) =>
    buildLookupKeys([
      item.id,
      item.user_id,
      item.auth_user_id,
      item.profile_id,
      item.doctor_id,
      item.medico_id,
      item.email,
      item.cpf,
    ]).some((key) => professionalKeys.includes(key)),
  )

  if (!profile) return professional

  const name = profile.full_name || profile.name || profile.nome || professional.name
  const phone = profile.phone || profile.phone_mobile || profile.telefone || professional.phone || ''

  return {
    ...professional,
    name,
    full_name: name,
    email: professional.email || profile.email || '',
    phone,
    unit: profile.unit || profile.unidade || professional.unit,
  }
}

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase()
}

function buildLookupKeys(values) {
  return [...new Set(values.map((value) => normalizeLookupValue(value)).filter(Boolean))]
}

function normalizeLookupValue(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 ? digits : raw
}

function onlyDigits(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits || undefined
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}
