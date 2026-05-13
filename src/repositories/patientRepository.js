import { apiConfig, getAnonHeaders, getAuthenticatedHeaders } from '../config/api.js'
import { cleanPersonName, formatBrazilianPhone, formatCpf, isValidPersonName, onlyDigits } from '../utils/brFormatters.js'
import { getResponseError } from './repositoryUtils.js'

export const patientRepository = {
  // 1. Listar pacientes
  async getAll() {
    const response = await fetch(`${apiConfig.restUrl}/patients?select=*`, { headers: getAuthenticatedHeaders() })
    if (!response.ok) throw new Error(await getResponseError(response, 'Erro ao buscar pacientes.'))
    return response.json()
  },

  async getById(patientId) {
    const [patient, appointments] = await Promise.all([
      getPatientById(patientId),
      getAppointments().catch(() => []),
    ])
    return patient ? mapPatientToDetail(patient, appointments) : null
  },

  async getDirectoryRows({ doctorId } = {}) {
    const [patients, appointments] = await Promise.all([
      this.getAll(),
      getAppointments({ doctorId }).catch(() => []),
    ])

    const visiblePatients = doctorId
      ? getPatientsFromDoctorAppointments(patients, appointments)
      : patients

    return visiblePatients.map((patient) => mapPatientToDirectory(patient, appointments))
  },

  // 2. Criar paciente (direto)
  async create(data) {
    validatePatientPayload(data)
    let lastResponse = null

    for (const body of buildPatientPayloads(data, { includeCreatedBy: true })) {
      const response = await fetch(`${apiConfig.restUrl}/patients`, {
        method: 'POST',
        headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(body),
      })

      if ([401, 403].includes(response.status)) {
        return this.createWithValidation(data)
      }

      if (response.ok) return response.json()

      lastResponse = response
      if (response.status !== 400) break
    }

    throw new Error(await getResponseError(lastResponse, 'Erro ao criar paciente.'))
  },

  // 3. Criar paciente com validação de CPF (Edge Function)
  async createWithValidation(data) {
    validatePatientPayload(data)
    const body = buildPatientBody(data, { includeCreatedBy: true })

    const response = await fetch(`${apiConfig.functionsUrl}/create-patient`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao criar paciente com validação.'))
    }

    return response.json()
  },

  async registerPublic(data) {
    validatePatientPayload(data)
    const body = cleanPayload({
      full_name: cleanPersonName(data.name, data.full_name),
      cpf: onlyDigits(data.cpf),
      email: data.email,
      phone_mobile: onlyDigits(data.phone || data.phone_mobile),
      birth_date: data.birthDate || data.birth_date || null,
      redirect_url: data.redirectUrl || data.redirect_url,
    })

    const response = await fetch(`${apiConfig.functionsUrl}/register-patient`, {
      method: 'POST',
      headers: getAnonHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao realizar auto-cadastro de paciente.'))
    }

    return response.json()
  },

  // 4. Atualizar paciente
  async update(patientId, data) {
    validatePatientPayload(data)
    let lastResponse = null

    for (const body of buildPatientPayloads(data)) {
      const response = await fetch(`${apiConfig.restUrl}/patients?id=eq.${patientId}`, {
        method: 'PATCH',
        headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(body),
      })

      if (response.ok) return response.json()

      lastResponse = response
      if (response.status !== 400) break
    }

    throw new Error(await getResponseError(lastResponse, 'Erro ao atualizar paciente.'))
  },

  async uploadAvatar(patientId, file) {
    if (!patientId) {
      throw new Error('Não foi possível identificar o paciente para enviar o avatar.')
    }

    const extension = file.name?.split('.').pop() || 'jpg'
    const objectPath = `patients/${patientId}/avatar.${extension}`
    const avatarUrl = `${apiConfig.storageUrl}/object/avatars/${objectPath}`
    const response = await fetch(avatarUrl, {
      method: 'POST',
      headers: getAuthenticatedHeaders({
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      }),
      body: file,
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao enviar avatar do paciente.'))
    }

    await updatePatientAvatarUrl(patientId, avatarUrl).catch(() => null)

    return {
      avatarUrl,
      path: objectPath,
    }
  },

  // 5. Deletar paciente
  async remove(patientId) {
    const response = await fetch(`${apiConfig.restUrl}/patients?id=eq.${patientId}`, {
      method: 'DELETE',
      headers: getAuthenticatedHeaders(),
    })

    if (!response.ok) throw new Error(await getResponseError(response, 'Erro ao deletar paciente.'))
    return true
  },
}

async function getPatientById(patientId) {
  const query = new URLSearchParams({
    select: '*',
    id: `eq.${patientId}`,
    limit: '1',
  })

  const response = await fetch(`${apiConfig.restUrl}/patients?${query.toString()}`, { headers: getAuthenticatedHeaders() })
  if (!response.ok) throw new Error(await getResponseError(response, 'Erro ao buscar paciente.'))

  const data = await response.json()
  return Array.isArray(data) ? data[0] || null : data
}

function mapPatientToDirectory(patient, appointments = []) {
  const appointmentSummary = summarizeAppointments(patient.id, appointments)
  const city = getFirstValue(patient, ['city', 'cidade', 'address_city', 'municipio'], patient.address?.city)
  const state = getFirstValue(patient, ['state', 'uf', 'address_state', 'estado'], patient.address?.state)
  const insurance = getFirstValue(patient, ['insurance', 'convenio', 'health_insurance', 'insurance_name'])
  const name = cleanPersonName(patient.name, patient.full_name, patient.nome)
  const cpf = formatCpf(patient.cpf || patient.document || patient.documento)

  return {
    ...patient,
    name: name || 'Paciente sem nome',
    cpf,
    document: cpf || patient.document || patient.documento || '',
    phone: formatBrazilianPhone(patient.phone || patient.phone_mobile || patient.telefone || ''),
    avatarUrl: normalizeAvatarUrl(patient.avatarUrl || patient.avatar_url || patient.avatar_path),
    detailId: patient.id,
    insurance: normalizeInsurance(insurance),
    city,
    state,
    vip: Boolean(patient.vip),
    birthDate: patient.birthDate || patient.birth_date || '',
    motherName: patient.motherName || patient.mother_name || patient.nome_mae || '',
    fatherName: patient.fatherName || patient.father_name || patient.nome_pai || '',
    ethnicity: patient.ethnicity || patient.etnia || '',
    maritalStatus: patient.maritalStatus || patient.marital_status || patient.estado_civil || '',
    phoneSecondary: formatBrazilianPhone(patient.phoneSecondary || patient.phone_secondary || patient.phone_home || ''),
    zipCode: patient.zipCode || patient.zip_code || patient.cep || '',
    addressStreet: patient.addressStreet || patient.address_street || patient.street || patient.logradouro || patient.address || '',
    addressNumber: patient.addressNumber || patient.address_number || patient.numero || '',
    addressComplement: patient.addressComplement || patient.address_complement || patient.complemento || '',
    plan: patient.plan || patient.plano || patient.insurance_plan || '',
    notesText: patient.notesText || patient.notes_text || patient.observations || patient.observacoes || '',
    lastVisitIso: patient.lastVisitIso || patient.last_visit_iso || appointmentSummary.lastVisitIso || null,
    lastVisit: patient.lastVisit || patient.last_visit || appointmentSummary.lastVisit || '',
    nextVisit: patient.nextVisit || patient.next_visit || appointmentSummary.nextVisit || '',
  }
}

function mapPatientToDetail(patient, appointments = []) {
  const directory = mapPatientToDirectory(patient, appointments)

  return {
    ...directory,
    age: patient.age || patient.idade || calculateAge(patient.birth_date),
    document: directory.cpf || 'CPF não informado',
    plan: directory.plan || directory.insurance,
    condition: normalizeCondition(patient.condition || patient.condicao || 'Sem condição principal'),
    status: patient.status || 'Acompanhamento',
    risk: patient.risk || patient.risco || 'Baixo',
    email: patient.email || '',
    avatarUrl: directory.avatarUrl,
    address: formatAddress(directory) || patient.address || patient.endereco || 'Endereço não informado',
    team: patient.team || patient.equipe || [],
    notes: normalizeNotes(patient.notes || patient.observacoes || directory.notesText),
    exams: patient.exams || patient.exames || [],
  }
}

async function getAppointments({ doctorId } = {}) {
  const query = new URLSearchParams()
  query.set('select', '*,patients(*)')
  if (doctorId) {
    query.set('doctor_id', `eq.${doctorId}`)
  }

  const response = await fetch(`${apiConfig.restUrl}/appointments?${query.toString()}`, {
    headers: getAuthenticatedHeaders(),
  })

  if (!response.ok) return []
  return response.json()
}

function getPatientsFromDoctorAppointments(patients, appointments) {
  const patientById = new Map(
    patients
      .map((patient) => [normalizeId(patient.id), patient])
      .filter(([id]) => id),
  )
  const visibleIds = new Set()

  for (const appointment of appointments) {
    const patientId = normalizeId(
      appointment.patient_id ||
      appointment.patientId ||
      appointment.paciente_id ||
      appointment.patients?.id ||
      appointment.patient?.id ||
      appointment.paciente?.id,
    )

    if (!patientId) continue

    visibleIds.add(patientId)

    if (!patientById.has(patientId)) {
      const embeddedPatient = appointment.patients || appointment.patient || appointment.paciente
      if (embeddedPatient) {
        patientById.set(patientId, { ...embeddedPatient, id: embeddedPatient.id || patientId })
      }
    }
  }

  return [...visibleIds]
    .map((patientId) => patientById.get(patientId))
    .filter(Boolean)
}

function summarizeAppointments(patientId, appointments) {
  const now = new Date()
  const normalizedPatientId = String(patientId)
  const patientAppointments = appointments
    .filter((appointment) => String(appointment.patient_id || appointment.patientId || appointment.paciente_id || '') === normalizedPatientId)
    .map((appointment) => ({
      ...appointment,
      date: getAppointmentDate(appointment),
    }))
    .filter((appointment) => appointment.date)
    .sort((a, b) => a.date - b.date)

  const past = patientAppointments.filter((appointment) => appointment.date < now)
  const future = patientAppointments.filter((appointment) => appointment.date >= now)
  const last = past.at(-1)
  const next = future[0]

  return {
    lastVisitIso: last ? formatDateInput(last.date) : null,
    lastVisit: last ? formatAppointmentLabel(last.date) : '',
    nextVisit: next ? formatAppointmentLabel(next.date) : '',
  }
}

function getAppointmentDate(appointment) {
  if (appointment.scheduled_at) {
    const date = new Date(appointment.scheduled_at)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const dateValue = appointment.date || appointment.appointment_date || appointment.data
  const timeValue = appointment.time || appointment.appointment_time || appointment.hora || '00:00'
  if (!dateValue) return null

  const date = new Date(`${dateValue}T${timeValue}`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatAppointmentLabel(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getFirstValue(source, keys, fallback = '') {
  for (const key of keys) {
    if (source?.[key]) return source[key]
  }

  return fallback || ''
}

function normalizeId(value) {
  return String(value || '').trim()
}

function formatAddress(patient) {
  return [
    patient.addressStreet,
    patient.addressNumber,
    patient.addressComplement,
    patient.city,
    patient.state,
    patient.zipCode,
  ]
    .filter(Boolean)
    .join(', ')
}

function normalizeNotes(notes) {
  if (Array.isArray(notes)) return notes
  if (!notes) return []
  return [String(notes)]
}

function normalizeCondition(value) {
  const input = String(value || '').trim()
  if (!input) return 'Sem condição principal'

  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  if (normalized === 'sem condicao principal' || normalized === 'sem condição principal') {
    return 'Sem condição principal'
  }

  return input
}

function normalizeInsurance(value) {
  const normalized = String(value || '').trim()
  if (normalized.toLowerCase() === 'bradesco saude') return 'Bradesco Saúde'
  return normalized
}

function normalizeAvatarUrl(value) {
  const avatar = String(value || '').trim()
  if (!avatar) return ''
  if (/^https?:\/\//i.test(avatar)) return avatar
  return `${apiConfig.storageUrl}/object/avatars/${avatar.replace(/^\/+/, '')}`
}

function buildPatientBody(data, { includeCreatedBy = false } = {}) {
  const body = {
    full_name: cleanPersonName(data.name, data.full_name),
    cpf: onlyDigits(data.cpf),
    email: data.email?.trim(),
    phone_mobile: onlyDigits(data.phone || data.phone_mobile),
    birth_date: data.birthDate || data.birth_date || null,
    city: data.city,
    state: data.state,
    zip_code: onlyDigits(data.zipCode || data.zip_code),
    address_street: data.addressStreet || data.address_street,
    address_number: data.addressNumber || data.address_number,
    address_complement: data.addressComplement || data.address_complement,
    phone_secondary: onlyDigits(data.phoneSecondary || data.phone_secondary),
    insurance: data.insurance,
    insurance_plan: data.plan || data.insurance_plan,
    observations: data.notesText || data.notes_text || data.notes,
    mother_name: data.motherName || data.mother_name,
    father_name: data.fatherName || data.father_name,
    ethnicity: data.ethnicity,
    marital_status: data.maritalStatus || data.marital_status,
    vip: data.vip === undefined ? undefined : Boolean(data.vip),
  }

  if (includeCreatedBy) {
    body.created_by = data.createdBy || '00000000-0000-0000-0000-000000000000'
  }

  return cleanPayload(body)
}

function buildPatientPayloads(data, options = {}) {
  const fullPayload = buildPatientBody(data, options)
  const corePayload = pickFields(fullPayload, [
    'full_name',
    'cpf',
    'email',
    'phone_mobile',
    'birth_date',
    'created_by',
  ])

  return uniquePayloads([fullPayload, corePayload])
}

function validatePatientPayload(data) {
  const name = cleanPersonName(data?.name, data?.full_name)

  if (!isValidPersonName(name)) {
    throw new Error('Informe um nome de paciente válido. O campo nome não pode ser um e-mail.')
  }
}

async function updatePatientAvatarUrl(patientId, avatarUrl) {
  const response = await fetch(`${apiConfig.restUrl}/patients?id=eq.${patientId}`, {
    method: 'PATCH',
    headers: getAuthenticatedHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ avatar_url: avatarUrl }),
  })

  if (!response.ok) {
    throw new Error(await getResponseError(response, 'Falha ao salvar avatar do paciente.'))
  }
}

function calculateAge(birthDate) {
  if (!birthDate) return 0

  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return 0

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }

  return age
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
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

