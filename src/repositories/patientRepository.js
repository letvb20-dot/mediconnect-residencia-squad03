import { apiConfig, getAuthenticatedHeaders, getPublicHeaders } from '../config/api.js'
import { cleanPersonName, formatBrazilianPhone, formatCpf, isValidPersonName, onlyDigits } from '../utils/brFormatters.js'
import { getResponseError } from './repositoryUtils.js'

const PATIENT_ATTACHMENT_BUCKETS = ['patient-attachments', 'attachments', 'avatars']

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

    return patients.map((patient) => mapPatientToDirectory(patient, appointments))
  },

  // POST /functions/v1/create-patient
  // Cria paciente como usuário autenticado (admin/secretária) com validação de CPF.
  // Body documentado: email*, full_name*, cpf* (^\d{11}$), phone_mobile*, birth_date?
  async create(data) {
    validatePatientPayload(data, { requireRegistrationFields: true })
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
    validatePatientPayload(data, { requireRegistrationFields: true })
    const body = buildRegisterPatientPayload(data)

    const response = await fetch(`${apiConfig.functionsUrl}/register-patient`, {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao realizar auto-cadastro de paciente.'))
    }

    return response.json()
  },

  // POST /functions/v1/register-patient-with-password
  // Auto-cadastro publico com senha. Mesmo contrato do register-patient, acrescido de password*.
  async registerPublicWithPassword(data) {
    validatePatientPayload(data, { requireRegistrationFields: true, requirePassword: true })
    const body = buildRegisterPatientWithPasswordPayload(data)

    const response = await fetch(`${apiConfig.functionsUrl}/register-patient-with-password`, {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao realizar auto-cadastro de paciente com senha.'))
    }

    return response.json()
  },

  // PATCH /rest/v1/patients?id=eq.{id}
  // Primeiro salva o nucleo documentado e, em seguida, tenta grupos estendidos.
  // Se a API ainda nao tiver alguma coluna opcional, o grupo e ignorado sem
  // impedir que os campos principais sejam persistidos.
  async update(patientId, data) {
    validatePatientPayload(data)
    const body = buildUpdatePatientBody(data)
    const groups = buildUpdateGroups(body)
    let representation = []

    if (!groups.core.length && !groups.optional.length) return []

    representation = await patchRequiredPatientGroup(patientId, groups.core)

    for (const attempt of groups.optional) {
      const nextRepresentation = await patchPatient(patientId, attempt, { required: false })
      if (nextRepresentation) representation = nextRepresentation
    }

    return representation
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
    let lastError = null

    for (const bucket of PATIENT_ATTACHMENT_BUCKETS) {
      const response = await fetch(`${apiConfig.storageUrl}/object/${bucket}/${objectPath}`, {
        method: 'POST',
        headers: getAuthenticatedHeaders({
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'true',
        }),
        body: file,
      })

      if (response.ok) {
        return {
          bucket,
          name: file.name || safeName,
          path: objectPath,
          url: getPublicStorageUrl(bucket, objectPath),
        }
      }

      lastError = await getResponseError(response, 'Falha ao enviar anexo do paciente.')
      if ([401, 403, 413].includes(response.status)) break
    }

    throw new Error(lastError || 'Falha ao enviar anexo do paciente.')
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
  const sources = getPatientSources(patient)
  const value = (keys, fallback = '') => getFirstValueFromSources(sources, keys, fallback)
  const patientId = value(['id', 'patient_id', 'patientId', 'paciente_id']) || patient.id
  const appointmentSummary = summarizeAppointments(patientId, appointments)
  const city = value(['city', 'cidade', 'address_city', 'municipio', 'municipality', 'address_municipality'])
  const state = value(['state', 'uf', 'address_state', 'address_uf', 'estado'])
  const insurance = value(['insurance', 'convenio', 'health_insurance', 'insurance_name', 'convenio_nome'])
  const name = cleanPersonName(value(['name']), value(['full_name']), value(['nome']))
  const cpf = formatCpf(value(['cpf', 'document', 'documento', 'document_number']))
  const birthDate = value(['birthDate', 'birth_date', 'data_nascimento', 'date_of_birth', 'dataNascimento'])

  return {
    ...patient,
    id: patientId,
    name: name || 'Paciente sem nome',
    cpf,
    document: cpf || patient.document || patient.documento || '',
    socialName: value(['socialName', 'social_name', 'nome_social']),
    rg: value(['rg']),
    otherDocuments: value(['otherDocuments', 'other_documents', 'document_type', 'tipo_documento', 'outros_documentos']),
    documentNumber: value(['documentNumber', 'document_number', 'numero_documento', 'documento_numero']),
    sex: value(['sex', 'sexo', 'gender']),
    race: patient.race || patient.raca || patient.raça || '',
    naturality: value(['naturality', 'naturalidade']),
    nationality: value(['nationality', 'nacionalidade']),
    profession: patient.profession || patient.profissao || patient.profissão || '',
    motherProfession: value(['motherProfession', 'mother_profession', 'profissao_mae']),
    fatherProfession: value(['fatherProfession', 'father_profession', 'profissao_pai']),
    responsibleName: value(['responsibleName', 'responsible_name', 'guardian_name', 'nome_responsavel']),
    responsibleCpf: formatCpf(value(['responsibleCpf', 'responsible_cpf', 'guardian_cpf', 'cpf_responsavel'])),
    spouseName: value(['spouseName', 'spouse_name', 'nome_conjuge', 'nome_esposo']),
    phone: formatBrazilianPhone(value(['phone', 'phone_mobile', 'telefone', 'celular'])),
    avatarUrl: normalizeAvatarUrl(patient.avatarUrl || patient.avatar_url || patient.avatar_path),
    detailId: patientId,
    insurance: normalizeInsurance(insurance),
    city,
    state,
    vip: Boolean(patient.vip),
    birthDate,
    age: resolvePatientAge(patient, birthDate),
    motherName: value(['motherName', 'mother_name', 'nome_mae']),
    fatherName: value(['fatherName', 'father_name', 'nome_pai']),
    ethnicity: value(['ethnicity', 'etnia']),
    maritalStatus: value(['maritalStatus', 'marital_status', 'estado_civil']),
    phoneLandline: formatBrazilianPhone(value(['phoneLandline', 'phone_landline', 'phone1', 'tel1', 'telefone1'])),
    phoneSecondary: formatBrazilianPhone(value(['phoneSecondary', 'phone_secondary', 'phone2', 'tel2', 'telefone2', 'phone_home'])),
    zipCode: value(['zipCode', 'zip_code', 'cep', 'postal_code']),
    addressStreet: value(['addressStreet', 'address_street', 'street', 'logradouro']),
    addressNumber: value(['addressNumber', 'address_number', 'number', 'numero']),
    addressComplement: value(['addressComplement', 'address_complement', 'complement', 'complemento']),
    plan: value(['plan', 'plano', 'insurance_plan']),
    bloodType: value(['bloodType', 'blood_type', 'tipo_sanguineo']),
    weight: value(['weight', 'peso', 'weight_kg']),
    height: value(['height', 'altura', 'height_m']),
    bmi: value(['bmi', 'imc']),
    allergies: value(['allergies', 'alergias']),
    insuranceNumber: value(['insuranceNumber', 'insurance_number', 'numero_matricula', 'member_number']),
    insuranceCardValidUntil: value(['insuranceCardValidUntil', 'insurance_card_valid_until', 'validade_carteira', 'insurance_valid_until']),
    insuranceIndefiniteValidity: Boolean(value(['insuranceIndefiniteValidity', 'insurance_indefinite_validity', 'validade_indeterminada'], false)),
    cns: value(['cns', 'sus_card', 'cartao_sus']),
    lgpdOptIn: Boolean(value(['lgpdOptIn', 'lgpd_opt_in', 'accepts_messages', 'opt_in_messages', 'receber_mensagens'], true)),
    attachments: normalizeAttachments(value(['attachments', 'anexos', 'documents', 'documentos'], [])),
    notesText: value(['notesText', 'notes_text', 'observations', 'observacoes', 'notes']),
    lastVisitIso: patient.lastVisitIso || patient.last_visit_iso || appointmentSummary.lastVisitIso || null,
    lastVisit: patient.lastVisit || patient.last_visit || appointmentSummary.lastVisit || '',
    nextVisit: patient.nextVisit || patient.next_visit || appointmentSummary.nextVisit || '',
  }
}

function mapPatientToDetail(patient, appointments = []) {
  const directory = mapPatientToDirectory(patient, appointments)
  const sources = getPatientSources(patient)
  const value = (keys, fallback = '') => getFirstValueFromSources(sources, keys, fallback)

  return {
    ...directory,
    age: resolvePatientAge(patient, directory.birthDate),
    document: directory.cpf || 'CPF não informado',
    plan: directory.plan || directory.insurance,
    condition: normalizeCondition(patient.condition || patient.condicao || 'Sem condição principal'),
    status: value(['status', 'situacao'], 'Acompanhamento'),
    risk: value(['risk', 'risco'], 'Baixo'),
    email: value(['email']),
    avatarUrl: directory.avatarUrl,
    address: formatAddress(directory) || formatObjectAddress(patient.address) || patient.endereco || 'Endereço não informado',
    team: value(['team', 'equipe'], []),
    notes: normalizeNotes(value(['notes', 'observacoes'], directory.notesText)),
    exams: value(['exams', 'exames'], []),
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

function normalizeCondition(value) {
  if (!value) return 'Sem condição principal'
  return String(value).trim() || 'Sem condição principal'
}

function getAddressObject(patient) {
  if (!patient.address) return {}
  if (typeof patient.address === 'object') return patient.address
  return {}
}

function getPatientSources(patient) {
  const address = getAddressObject(patient)
  return [
    patient,
    patient?.profile,
    patient?.patient,
    patient?.patient_data,
    patient?.dados,
    patient?.personal_data,
    patient?.demographics,
    patient?.contact,
    patient?.contato,
    address,
    patient?.address_data,
    patient?.endereco,
    patient?.medical,
    patient?.medical_info,
    patient?.health,
    patient?.insurance_data,
    patient?.insurance_info,
  ].filter((source) => source && typeof source === 'object')
}

function getFirstValueFromSources(sources, keys, fallback = '') {
  for (const source of sources) {
    const value = getFirstValue(source, keys, undefined)
    if (value !== undefined && value !== null && value !== '') return value
  }

  return fallback
}

function getFirstValue(source, keys, fallback = '') {
  if (!source) return fallback
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key]
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
  return getPublicStorageUrl('avatars', path)
}

function getPublicStorageUrl(bucket, path) {
  return `${apiConfig.storageUrl}/object/public/${bucket}/${String(path || '').replace(/^\/+/, '')}`
}

// =============================================================================
// Payloads para os endpoints documentados
// =============================================================================

// /functions/v1/create-patient: email*, full_name*, cpf*, phone_mobile*, birth_date?
function buildCreatePatientBody(data) {
  return cleanPayload({
    email: data.email?.trim(),
    full_name: cleanPersonName(data.name, data.full_name),
    social_name: cleanText(data.socialName || data.social_name),
    cpf: onlyDigits(data.cpf),
    rg: cleanText(data.rg),
    document_type: cleanText(data.otherDocuments || data.documentType || data.document_type),
    document_number: cleanText(data.documentNumber || data.document_number),
    birth_date: data.birthDate || data.birth_date || undefined,
    phone_mobile: onlyDigits(data.phone || data.phone_mobile),
    phone1: onlyDigits(data.phoneLandline || data.phone1),
    phone2: onlyDigits(data.phoneSecondary || data.phone2),
    sex: normalizePatientSex(data.sex || data.sexo),
    race: normalizePatientRace(data.race || data.raca),
    ethnicity: cleanText(data.ethnicity),
    nationality: cleanText(data.nationality),
    naturality: cleanText(data.naturality),
    profession: cleanText(data.profession),
    marital_status: cleanText(data.maritalStatus || data.marital_status),
    mother_name: cleanPersonName(data.motherName, data.mother_name),
    mother_profession: cleanText(data.motherProfession || data.mother_profession),
    father_name: cleanPersonName(data.fatherName, data.father_name),
    father_profession: cleanText(data.fatherProfession || data.father_profession),
    guardian_name: cleanPersonName(data.responsibleName, data.guardian_name, data.responsible_name),
    guardian_cpf: onlyDigits(data.responsibleCpf || data.guardian_cpf || data.responsible_cpf),
    spouse_name: cleanPersonName(data.spouseName, data.spouse_name),
    cep: onlyDigits(data.zipCode || data.cep),
    street: cleanText(data.addressStreet || data.street),
    number: cleanText(data.addressNumber || data.number),
    complement: cleanText(data.addressComplement || data.complement),
    neighborhood: cleanText(data.neighborhood),
    city: cleanText(data.city),
    state: normalizeState(data.state),
    blood_type: cleanText(data.bloodType || data.blood_type),
    weight_kg: normalizeDecimal(data.weight || data.weight_kg),
    height_m: normalizeHeight(data.height || data.height_m),
    bmi: normalizeDecimal(data.bmi),
    legacy_code: cleanText(data.legacyCode || data.legacy_code),
    rn_in_insurance: data.rnInInsurance ?? data.rn_in_insurance,
    vip: data.vip === undefined ? undefined : Boolean(data.vip),
    notes: cleanText(data.notesText || data.notes_text || data.notes),
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
    social_name: cleanText(data.socialName || data.social_name),
    cpf: onlyDigits(data.cpf),
    rg: cleanText(data.rg),
    document_type: cleanText(data.otherDocuments || data.documentType || data.document_type),
    document_number: cleanText(data.documentNumber || data.document_number),
    birth_date: data.birthDate || data.birth_date || undefined,
    sex: normalizePatientSex(data.sex || data.sexo),
    race: normalizePatientRace(data.race || data.raca),
    ethnicity: cleanText(data.ethnicity || data.etnia),
    nationality: cleanText(data.nationality || data.nacionalidade),
    naturality: cleanText(data.naturality || data.naturalidade),
    profession: cleanText(data.profession || data.profissao),
    marital_status: cleanText(data.maritalStatus || data.marital_status),
    mother_name: cleanPersonName(data.motherName, data.mother_name),
    mother_profession: cleanText(data.motherProfession || data.mother_profession),
    father_name: cleanPersonName(data.fatherName, data.father_name),
    father_profession: cleanText(data.fatherProfession || data.father_profession),
    guardian_name: cleanPersonName(data.responsibleName, data.guardian_name, data.responsible_name),
    guardian_cpf: onlyDigits(data.responsibleCpf || data.guardian_cpf || data.responsible_cpf),
    spouse_name: cleanPersonName(data.spouseName, data.spouse_name),
    phone1: onlyDigits(data.phoneLandline || data.phone1),
    phone2: onlyDigits(data.phoneSecondary || data.phone2),
    cep: onlyDigits(data.zipCode || data.cep),
    street: cleanText(data.addressStreet || data.street),
    number: cleanText(data.addressNumber || data.number),
    complement: cleanText(data.addressComplement || data.complement),
    neighborhood: cleanText(data.neighborhood || data.bairro),
    city: cleanText(data.city || data.cidade),
    state: normalizeState(data.state || data.uf),
    insurance: cleanText(data.insurance || data.convenio),
    health_insurance: cleanText(data.insurance || data.convenio),
    plan: cleanText(data.plan || data.plano),
    insurance_plan: cleanText(data.plan || data.plano),
    insurance_number: cleanText(data.insuranceNumber || data.insurance_number || data.numero_matricula),
    insurance_card_valid_until: data.insuranceCardValidUntil || data.insurance_card_valid_until || undefined,
    insurance_indefinite_validity: data.insuranceIndefiniteValidity ?? data.insurance_indefinite_validity,
    blood_type: cleanText(data.bloodType || data.blood_type),
    weight_kg: normalizeDecimal(data.weight || data.weight_kg),
    height_m: normalizeHeight(data.height || data.height_m),
    bmi: normalizeDecimal(data.bmi),
    allergies: cleanText(data.allergies || data.alergias),
    condition: cleanText(data.condition || data.condicao),
    cns: cleanText(data.cns || data.sus_card || data.cartao_sus),
    lgpd_opt_in: data.lgpdOptIn ?? data.lgpd_opt_in,
    vip: data.vip === undefined ? undefined : Boolean(data.vip),
    notes: cleanText(data.notesText || data.notes_text || data.notes),
    attachments: Array.isArray(data.attachments) && data.attachments.length ? data.attachments : undefined,
  })
}

function buildUpdateGroups(body) {
  return {
    core: uniquePayloads([
      pickPayload(body, ['full_name', 'phone_mobile', 'email']),
      pickPayload(body, ['full_name', 'phone_mobile']),
      pickPayload(body, ['full_name', 'email']),
      pickPayload(body, ['full_name']),
      pickPayload(body, ['phone_mobile']),
      pickPayload(body, ['email']),
    ]),
    optional: uniquePayloads([
      pickPayload(body, [
        'cpf',
        'social_name',
        'rg',
        'document_type',
        'document_number',
        'birth_date',
        'sex',
        'race',
        'ethnicity',
        'nationality',
        'naturality',
        'profession',
        'marital_status',
        'mother_name',
        'mother_profession',
        'father_name',
        'father_profession',
        'guardian_name',
        'guardian_cpf',
        'spouse_name',
      ]),
      pickPayload(body, ['phone1', 'phone2', 'cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state']),
      pickPayload(body, ['blood_type', 'weight_kg', 'height_m', 'bmi', 'allergies', 'condition', 'cns']),
      pickPayload(body, ['insurance', 'plan', 'insurance_number', 'insurance_card_valid_until', 'insurance_indefinite_validity']),
      pickPayload(body, ['health_insurance', 'insurance_plan']),
      pickPayload(body, ['lgpd_opt_in', 'vip', 'notes', 'attachments']),
    ]),
  }
}

function pickPayload(source, fields) {
  return cleanPayload(Object.fromEntries(fields.map((field) => [field, source[field]])))
}

function uniquePayloads(payloads) {
  const seen = new Set()

  return payloads.filter((payload) => {
    const entries = Object.entries(payload)
    if (!entries.length) return false

    const key = JSON.stringify(payload)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function patchPatient(patientId, payload, { required }) {
  const response = await fetch(`${apiConfig.restUrl}/patients?id=eq.${encodeURIComponent(patientId)}`, {
    method: 'PATCH',
    headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(payload),
  })

  if (response.ok) {
    return response.json()
  }

  const text = await response.text().catch(() => '')

  if (!required && isUnsupportedOptionalPatch(response.status, text)) {
    return null
  }

  throw new Error(await getResponseError(cloneTextResponse(response, text), 'Erro ao atualizar paciente.'))
}

async function patchRequiredPatientGroup(patientId, attempts) {
  let lastSkipped = null

  for (const attempt of attempts) {
    const result = await patchPatient(patientId, attempt, { required: false })
    if (result) return result
    lastSkipped = attempt
  }

  if (lastSkipped) {
    throw new Error('Erro ao atualizar paciente. A API recusou os campos principais do paciente.')
  }

  return []
}

function isUnsupportedOptionalPatch(status, text) {
  if (![400, 404, 406].includes(status)) return false
  return /column|schema cache|relationship|not found|does not exist|pgrst/i.test(String(text || ''))
}

function cloneTextResponse(response, text) {
  return new Response(text, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function buildRegisterPatientWithPasswordPayload(data) {
  return cleanPayload({
    email: data.email?.trim(),
    password: data.password,
    full_name: cleanPersonName(data.name, data.full_name),
    cpf: onlyDigits(data.cpf),
    phone_mobile: onlyDigits(data.phone || data.phone_mobile),
    birth_date: data.birthDate || data.birth_date || undefined,
  })
}

function validatePatientPayload(data, { requireRegistrationFields = false, requirePassword = false } = {}) {
  const name = cleanPersonName(data?.name, data?.full_name)

  // Para update parcial sem nome novo, não valida
  if (!name && (data?.name === undefined && data?.full_name === undefined)) {
    return
  }

  if (!isValidPersonName(name)) {
    throw new Error('Informe um nome de paciente válido. O campo nome não pode ser um e-mail.')
  }
  if (!requireRegistrationFields) return

  if (onlyDigits(data?.cpf).length !== 11) {
    throw new Error('Informe um CPF valido com 11 digitos.')
  }

  const phone = onlyDigits(data?.phone || data?.phone_mobile)
  if (!/^\d{10,11}$/.test(phone)) {
    throw new Error('Informe um celular valido com DDD e 10 ou 11 digitos.')
  }

  if (requirePassword && String(data?.password || '').length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.')
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
  if (!birthDate) return null

  const birth = parseBirthDate(birthDate)
  if (Number.isNaN(birth.getTime())) return null

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }

  return age
}

function parseBirthDate(value) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  }

  return new Date(value)
}

function resolvePatientAge(patient, birthDate) {
  const rawAge = patient.age ?? patient.idade
  if (rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== '') {
    const age = Number(rawAge)
    if (Number.isFinite(age) && age >= 0) return age
  }

  return calculateAge(birthDate)
}

function getDefaultRedirectUrl(path) {
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}${path}`
}

function cleanText(value) {
  return String(value || '').trim() || undefined
}

function normalizeDecimal(value) {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = Number(String(value).replace(',', '.'))
  return Number.isFinite(normalized) ? normalized : undefined
}

function normalizeHeight(value) {
  const height = normalizeDecimal(value)
  if (height === undefined) return undefined
  return height > 3 ? height / 100 : height
}

function normalizeState(value) {
  const state = String(value || '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(state) ? state : undefined
}

function normalizePatientSex(value) {
  const raw = String(value || '').trim()
  if (!raw) return undefined
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  if (normalized.startsWith('masc')) return 'Masculino'
  if (normalized.startsWith('fem')) return 'Feminino'
  if (normalized.includes('outro')) return 'Outro'
  if (normalized.includes('nao')) return 'Não informar'
  return raw
}

function normalizePatientRace(value) {
  const raw = String(value || '').trim()
  if (!raw) return undefined
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const map = {
    branca: 'Branca',
    preta: 'Preta',
    parda: 'Parda',
    amarela: 'Amarela',
    indigena: 'Indígena',
  }

  if (map[normalized]) return map[normalized]
  if (normalized.includes('nao')) return 'Não declarada'
  return raw
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}
