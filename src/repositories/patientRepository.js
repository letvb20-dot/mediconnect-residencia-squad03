import { apiConfig, getAnonHeaders, getAuthenticatedHeaders, getAuthSession } from '../config/api.js'
import { cleanPersonName, formatBrazilianPhone, formatCpf, isValidPersonName, onlyDigits } from '../utils/brFormatters.js'
import { getResponseError } from './repositoryUtils.js'

export const patientRepository = {
  // GET /rest/v1/patients
  // Filtros documentados: select, limit, offset, order, full_name, cpf
  async getAll(filters = {}) {
    const query = new URLSearchParams()
    query.set('select', filters.select || '*')
    if (filters.limit) query.set('limit', String(filters.limit))
    if (filters.offset) query.set('offset', String(filters.offset))
    if (filters.order) query.set('order', filters.order)
    if (filters.fullName) query.set('full_name', `ilike.*${filters.fullName}*`)
    if (filters.cpf) query.set('cpf', `eq.${onlyDigits(filters.cpf)}`)

    const response = await fetch(`${apiConfig.restUrl}/patients?${query.toString()}`, { headers: getAuthenticatedHeaders() })
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

  // POST /functions/v1/create-patient
  // Cria paciente como usuário autenticado (admin/secretária) com validação de CPF.
  // Body documentado: email*, full_name*, cpf* (^\d{11}$), phone_mobile*, birth_date?
  async create(data) {
    validatePatientPayload(data)
    const body = buildCreatePatientBody(data)

    const response = await fetch(`${apiConfig.functionsUrl}/create-patient`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao criar paciente.'))
    }

    return response.json()
  },

  // POST /functions/v1/create-patient (alias mais explícito)
  // Mesmo endpoint que `create`, mantido como método separado para retrocompatibilidade.
  async createWithValidation(data) {
    return this.create(data)
  },

  // POST /functions/v1/register-patient
  // Auto-cadastro PÚBLICO (sem auth Bearer). phone_mobile deve ser ^\d{10,11}$
  // Body documentado: email*, full_name* (min 3), phone_mobile* (^\d{10,11}$), cpf* (^\d{11}$), birth_date?, redirect_url?
  async registerPublic(data) {
    validatePatientPayload(data)
    const body = buildRegisterPatientPayload(data)

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

  // PATCH /rest/v1/patients?id=eq.{id}
  // Body documentado: full_name?, phone_mobile?, email?
  async update(patientId, data) {
    validatePatientPayload(data)
    const body = buildUpdatePatientBody(data)

    const response = await fetch(`${apiConfig.restUrl}/patients?id=eq.${patientId}`, {
      method: 'PATCH',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao atualizar paciente.'))
    }

    return response.json()
  },

  // POST /storage/v1/object/avatars/{path}
  async uploadAvatar(patientId, file) {
    if (!patientId) {
      throw new Error('Não foi possível identificar o paciente para enviar o avatar.')
    }

    const extension = file.name?.split('.').pop() || 'jpg'
    const objectPath = `patients/${patientId}/avatar.${extension}`
    const uploadUrl = `${apiConfig.storageUrl}/object/avatars/${objectPath}`
    const avatarUrl = getPublicAvatarUrl(objectPath)
    const response = await fetch(uploadUrl, {
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

  // POST /storage/v1/object/avatars/{path} (reaproveita bucket de avatars)
  async uploadAttachment(patientId, file) {
    if (!patientId) {
      throw new Error('Não foi possível identificar o paciente para enviar o anexo.')
    }

    const safeName = sanitizeFileName(file.name || `anexo-${Date.now()}`)
    const objectPath = `patients/${patientId}/attachments/${Date.now()}-${safeName}`
    const response = await fetch(`${apiConfig.storageUrl}/object/avatars/${objectPath}`, {
      method: 'POST',
      headers: getAuthenticatedHeaders({
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      }),
      body: file,
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao enviar anexo do paciente.'))
    }

    return {
      name: file.name || safeName,
      path: objectPath,
      url: getPublicAvatarUrl(objectPath),
    }
  },

  // DELETE /rest/v1/patients?id=eq.{id}
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
  const address = getAddressObject(patient)
  const city = getFirstValue(patient, ['city', 'cidade', 'address_city', 'municipio', 'municipality', 'address_municipality'], getFirstValue(address, ['city', 'cidade', 'municipio', 'municipality']))
  const state = getFirstValue(patient, ['state', 'uf', 'address_state', 'address_uf', 'estado'], getFirstValue(address, ['state', 'uf', 'estado']))
  const insurance = getFirstValue(patient, ['insurance', 'convenio', 'health_insurance', 'insurance_name'])
  const name = cleanPersonName(patient.name, patient.full_name, patient.nome)
  const cpf = formatCpf(patient.cpf || patient.document || patient.documento)

  return {
    ...patient,
    name: name || 'Paciente sem nome',
    cpf,
    document: cpf || patient.document || patient.documento || '',
    socialName: patient.socialName || patient.social_name || patient.nome_social || '',
    rg: patient.rg || '',
    otherDocuments: patient.otherDocuments || patient.other_documents || patient.outros_documentos || '',
    documentNumber: patient.documentNumber || patient.document_number || patient.numero_documento || '',
    sex: patient.sex || patient.sexo || patient.gender || '',
    race: patient.race || patient.raca || patient.raça || '',
    naturality: patient.naturality || patient.naturalidade || '',
    nationality: patient.nationality || patient.nacionalidade || '',
    profession: patient.profession || patient.profissao || patient.profissão || '',
    motherProfession: patient.motherProfession || patient.mother_profession || patient.profissao_mae || '',
    fatherProfession: patient.fatherProfession || patient.father_profession || patient.profissao_pai || '',
    responsibleName: patient.responsibleName || patient.responsible_name || patient.nome_responsavel || '',
    responsibleCpf: formatCpf(patient.responsibleCpf || patient.responsible_cpf || patient.cpf_responsavel || ''),
    spouseName: patient.spouseName || patient.spouse_name || patient.nome_conjuge || patient.nome_esposo || '',
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
    phoneLandline: formatBrazilianPhone(patient.phoneLandline || patient.phone_landline || patient.phone1 || patient.tel1 || patient.telefone1 || ''),
    phoneSecondary: formatBrazilianPhone(patient.phoneSecondary || patient.phone_secondary || patient.phone2 || patient.tel2 || patient.telefone2 || patient.phone_home || ''),
    zipCode: patient.zipCode || patient.zip_code || patient.cep || '',
    addressStreet: patient.addressStreet || patient.address_street || patient.street || patient.logradouro || address?.street || address?.logradouro || '',
    addressNumber: patient.addressNumber || patient.address_number || patient.numero || '',
    addressComplement: patient.addressComplement || patient.address_complement || patient.complemento || '',
    plan: patient.plan || patient.plano || patient.insurance_plan || '',
    bloodType: patient.bloodType || patient.blood_type || patient.tipo_sanguineo || '',
    weight: patient.weight || patient.peso || '',
    height: patient.height || patient.altura || '',
    bmi: patient.bmi || patient.imc || '',
    allergies: patient.allergies || patient.alergias || '',
    insuranceNumber: patient.insuranceNumber || patient.insurance_number || patient.numero_matricula || '',
    insuranceCardValidUntil: patient.insuranceCardValidUntil || patient.insurance_card_valid_until || patient.validade_carteira || '',
    insuranceIndefiniteValidity: Boolean(patient.insuranceIndefiniteValidity || patient.insurance_indefinite_validity || patient.validade_indeterminada),
    cns: patient.cns || patient.sus_card || patient.cartao_sus || '',
    lgpdOptIn: Boolean(patient.lgpdOptIn ?? patient.lgpd_opt_in ?? patient.accepts_messages ?? patient.opt_in_messages ?? patient.receber_mensagens),
    attachments: normalizeAttachments(patient.attachments || patient.anexos || patient.documents || patient.documentos),
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
    address: formatAddress(directory) || formatObjectAddress(patient.address) || patient.endereco || 'Endereço não informado',
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
      scheduledAt: parseScheduledAt(appointment),
    }))
    .filter((appointment) => appointment.scheduledAt instanceof Date && !Number.isNaN(appointment.scheduledAt.getTime()))

  const past = patientAppointments
    .filter((appointment) => appointment.scheduledAt <= now)
    .sort((a, b) => b.scheduledAt - a.scheduledAt)

  const future = patientAppointments
    .filter((appointment) => appointment.scheduledAt > now)
    .sort((a, b) => a.scheduledAt - b.scheduledAt)

  const lastVisitDate = past[0]?.scheduledAt
  const nextVisitDate = future[0]?.scheduledAt

  return {
    lastVisitIso: lastVisitDate ? lastVisitDate.toISOString() : null,
    lastVisit: lastVisitDate ? formatRelativeDate(lastVisitDate) : '',
    nextVisit: nextVisitDate ? formatScheduledDate(nextVisitDate) : '',
  }
}

function parseScheduledAt(appointment) {
  const value = appointment.scheduled_at || appointment.scheduledAt || appointment.appointment_date || appointment.date
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatRelativeDate(date) {
  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return 'Hoje'
  if (diffDays === 1) return 'Há 1 dia'
  if (diffDays < 30) return `Há ${diffDays} dias`
  const months = Math.floor(diffDays / 30)
  return months === 1 ? 'Há 1 mês' : `Há ${months} meses`
}

function formatScheduledDate(date) {
  const formatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return formatter.format(date)
}

function normalizeId(value) {
  return value === null || value === undefined ? '' : String(value)
}

function normalizeCondition(value) {
  if (!value) return 'Sem condição principal'
  return String(value).trim() || 'Sem condição principal'
}

function getAddressObject(patient) {
  if (!patient.address) return {}
  if (typeof patient.address === 'object') return patient.address
  return {}
}

function getFirstValue(source, keys, fallback = '') {
  if (!source) return fallback
  for (const key of keys) {
    if (source[key]) return source[key]
  }
  return fallback
}

function formatAddress(directory) {
  const parts = [
    directory.addressStreet,
    directory.addressNumber,
    directory.addressComplement,
    directory.city,
    directory.state,
  ].filter(Boolean)
  return parts.join(', ')
}

function formatObjectAddress(address) {
  if (!address || typeof address !== 'object') return ''
  return [address.street || address.logradouro, address.number || address.numero, address.city || address.cidade, address.state || address.uf].filter(Boolean).join(', ')
}

function normalizeNotes(notes) {
  if (!notes) return []
  if (Array.isArray(notes)) return notes
  return [{ text: String(notes) }]
}

function normalizeAttachments(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'object') return [value]
  return []
}

function normalizeDecimal(value) {
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(String(value).replace(',', '.'))
  return Number.isFinite(number) ? number : undefined
}

function sanitizeFileName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || `arquivo-${Date.now()}`
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
  return getPublicAvatarUrl(avatar)
}

function getPublicAvatarUrl(path) {
  return `${apiConfig.storageUrl}/object/public/avatars/${String(path || '').replace(/^\/+/, '')}`
}

// =============================================================================
// Payloads para os endpoints documentados
// =============================================================================

// /functions/v1/create-patient: email*, full_name*, cpf*, phone_mobile*, birth_date?
function buildCreatePatientBody(data) {
  return cleanPayload({
    email: data.email?.trim(),
    full_name: cleanPersonName(data.name, data.full_name),
    cpf: onlyDigits(data.cpf),
    phone_mobile: onlyDigits(data.phone || data.phone_mobile),
    birth_date: data.birthDate || data.birth_date || undefined,
  })
}

// /functions/v1/register-patient: phone_mobile DEVE ser ^\d{10,11}$ (somente dígitos)
function buildRegisterPatientPayload(data) {
  return cleanPayload({
    email: data.email?.trim(),
    full_name: cleanPersonName(data.name, data.full_name),
    cpf: onlyDigits(data.cpf),
    phone_mobile: onlyDigits(data.phone || data.phone_mobile),
    birth_date: data.birthDate || data.birth_date || undefined,
    redirect_url: data.redirectUrl || data.redirect_url || getDefaultRedirectUrl('/auth'),
  })
}

// PATCH /rest/v1/patients: campos documentados são full_name, phone_mobile, email
function buildUpdatePatientBody(data) {
  return cleanPayload({
    full_name: cleanPersonName(data.name, data.full_name) || undefined,
    phone_mobile: data.phone || data.phone_mobile ? onlyDigits(data.phone || data.phone_mobile) : undefined,
    email: data.email?.trim() || undefined,
  })
}

function validatePatientPayload(data) {
  const name = cleanPersonName(data?.name, data?.full_name)

  // Para update parcial sem nome novo, não valida
  if (!name && (data?.name === undefined && data?.full_name === undefined)) {
    return
  }

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

function getDefaultRedirectUrl(path) {
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}${path}`
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}
