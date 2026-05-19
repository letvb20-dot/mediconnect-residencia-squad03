import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { normalizeRole } from '../config/permissions.js'
import { getResponseError, normalizeCollection } from './repositoryUtils.js'
import { patientRepository } from './patientRepository.js'
import { storeProfessionalOverride } from '../utils/professionalOverrides.js'

const USER_PROFILE_TABLES = ['profiles', 'user_profiles']
const USER_DOCTOR_TABLES = ['doctors', 'medicos']
const USER_LIST_KEYS = ['users', 'usuarios', 'data', 'items', 'results']

export const userRepository = {
  // GET /rest/v1/profiles - listagem indireta (não está no contrato; é uma necessidade da UI)
  async getAll() {
    let lastResponse = null

    for (const table of USER_PROFILE_TABLES) {
      const query = new URLSearchParams({ select: '*' })
      const response = await fetch(`${apiConfig.restUrl}/${table}?${query.toString()}`, {
        headers: getAuthenticatedHeaders(),
      }).catch(() => null)

      if (!response) continue
      lastResponse = response

      if (response.ok) {
        const data = await response.json().catch(() => null)
        const users = normalizeCollection(data, USER_LIST_KEYS).map(normalizeListedUser)
        const [rolesByUserId, doctors] = await Promise.all([
          getUserRolesById().catch(() => new Map()),
          getDoctorUsers().catch(() => []),
        ])

        return users
          .map((user) => mergeUserRoles(user, rolesByUserId))
          .map((user) => mergeUserDoctor(user, doctors))
      }

      // 404/406 -> próxima tabela; outros erros estouram
      if (![404, 406].includes(response.status)) {
        throw new Error(await getResponseError(response, 'Erro ao listar usuários.'))
      }
    }

    throw new Error(await getResponseError(lastResponse, 'Tabela de perfis de usuários não encontrada.'))
  },

  // POST /functions/v1/user-info-by-id
  // Body: { user_id }
  async getById(userId) {
    const response = await fetch(`${apiConfig.functionsUrl}/user-info-by-id`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify({ user_id: userId }),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao buscar usuário.'))
    }

    return response.json()
  },

  // POST /functions/v1/create-user
  // Body documentado: email*, full_name*, role*, phone?, create_patient_record?, cpf?, phone_mobile?
  async create(data) {
    const body = buildCreateUserBody(data)
    const response = await fetch(`${apiConfig.functionsUrl}/create-user`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao criar usuário.'))
    }

    const createdUser = await response.json()
    return ensurePatientRecordForCreatedUser(createdUser, data, body)
  },

  // POST /functions/v1/create-user-with-password
  // Body documentado: email*, password*, full_name*, phone?, role?, roles?, create_patient_record?, cpf?, phone_mobile?
  async createWithPassword(data) {
    const body = {
      ...buildCreateUserWithPasswordBody(data),
      password: data.password,
    }

    const response = await fetch(`${apiConfig.functionsUrl}/create-user-with-password`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao criar usuário com senha.'))
    }

    const createdUser = await response.json()
    return ensurePatientRecordForCreatedUser(createdUser, data, body)
  },

  // PATCH /rest/v1/{profiles|user_profiles}?id=eq.{id}
  // Atualização direta da tabela de perfis (não há endpoint dedicado na API)
  async update(userId, data) {
    let lastResponse = null
    const profileReference = await getProfileReference(userId).catch(() => null)
    const body = cleanPayload({
      email: data.email?.trim(),
      full_name: data.full_name?.trim(),
      phone: data.phone?.trim(),
    })

    for (const table of USER_PROFILE_TABLES) {
      const response = await fetch(`${apiConfig.restUrl}/${table}?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(body),
      }).catch(() => null)

      if (!response) continue
      lastResponse = response

      if (response.ok) {
        const responseData = await response.json().catch(() => null)
        const updatedProfileRow = getUpdatedProfileRow(responseData, body, data, userId, profileReference)
        const updatedUser = normalizeListedUser(updatedProfileRow)
        const syncFormData = { ...(profileReference || {}), ...data }
        const userWithPatient = await ensurePatientRecordForCreatedUser(updatedUser, syncFormData, { ...updatedUser, ...syncFormData })
        const syncedDoctor = await syncDoctorUser({ ...(profileReference || {}), ...userWithPatient, id: userId }, syncFormData).catch((error) => {
          if (isIgnorableDoctorSyncError(error)) return null
          throw error
        })
        if (syncedDoctor) storeDoctorNameOverride({ formData: data, syncedDoctor, updatedUser: userWithPatient, userId })
        return syncedDoctor ? mergeUserDoctor(userWithPatient, [syncedDoctor]) : userWithPatient
      }

      if (![404, 406].includes(response.status)) {
        throw new Error(await getResponseError(response, 'Erro ao atualizar usuário.'))
      }
    }

    throw new Error(await getResponseError(lastResponse, 'Tabela de perfis de usuários não encontrada.'))
  },

  // POST /functions/v1/delete-user
  // Body: { userId }
  async remove(userId) {
    const response = await fetch(`${apiConfig.functionsUrl}/delete-user`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify({ userId }),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao deletar usuário.'))
    }

    return true
  },
}

async function ensurePatientRecordForCreatedUser(createdUser, formData = {}, requestBody = {}) {
  if (!shouldCreatePatientRecord(requestBody.role || formData.role, formData)) return createdUser

  let patient = getPatientFromCreatedUser(createdUser) || await findExistingPatientForUser(formData, requestBody)

  if (!patient) {
    patient = await createPatientRecordForUser(formData, requestBody)
  }

  if (!getPatientIdentifier(patient)) {
    patient = await findExistingPatientForUser(formData, requestBody) || patient
  }

  const userWithPatient = mergeCreatedUserPatient(createdUser, patient)
  await persistPatientLinkOnProfile(userWithPatient, formData, patient).catch(() => false)

  return userWithPatient
}

async function findExistingPatientForUser(formData = {}, requestBody = {}) {
  const cpf = onlyDigits(formData.cpf || requestBody.cpf)
  if (cpf) {
    const byCpf = normalizeCollection(await patientRepository.getAll({ cpf }).catch(() => []))
    const exactCpf = byCpf.find((patient) => onlyDigits(patient.cpf || patient.document || patient.documento) === cpf)
    if (exactCpf || byCpf[0]) return exactCpf || byCpf[0]
  }

  const email = normalizeEmail(formData.email || requestBody.email)
  if (!email) return null

  const patients = normalizeCollection(await patientRepository.getAll().catch(() => []))
  return patients.find((patient) => normalizeEmail(patient.email || patient.user_email || patient.mail) === email) || null
}

async function createPatientRecordForUser(formData = {}, requestBody = {}) {
  const payload = buildPatientPayloadFromUser(formData, requestBody)

  try {
    return normalizeReturnedRow(await patientRepository.create(payload)) || null
  } catch (error) {
    const existingPatient = isDuplicatePatientError(error)
      ? await findExistingPatientForUser(formData, requestBody).catch(() => null)
      : null

    if (existingPatient) return existingPatient

    throw new Error(`Usuario criado, mas nao foi possivel criar o registro de paciente correspondente. ${error.message || ''}`.trim())
  }
}

function buildPatientPayloadFromUser(formData = {}, requestBody = {}) {
  return cleanPayload({
    email: formData.email || requestBody.email,
    full_name: formData.full_name || requestBody.full_name,
    cpf: formData.cpf || requestBody.cpf,
    phone: formData.phone || requestBody.phone,
    phone_mobile: formData.phone_mobile || requestBody.phone_mobile,
    birthDate: formData.birthDate || formData.birth_date || requestBody.birth_date,
    birth_date: formData.birth_date || formData.birthDate || requestBody.birth_date,
  })
}

function getPatientFromCreatedUser(createdUser) {
  return firstObjectFromSources([createdUser], ['patient', 'patients', 'paciente', 'patientData', 'patient_data'])
}

function mergeCreatedUserPatient(createdUser, patient) {
  if (!createdUser || typeof createdUser !== 'object') return createdUser

  const patientId = getPatientIdentifier(patient)
  if (!patientId) return createdUser

  return {
    ...createdUser,
    patient,
    patient_id: createdUser.patient_id || patientId,
    patientId: createdUser.patientId || patientId,
  }
}

async function persistPatientLinkOnProfile(createdUser, formData = {}, patient = null) {
  const patientId = getPatientIdentifier(patient)
  if (!patientId) return false

  const identifiers = uniqueIdentifiers([
    ['id', firstValueFromSources([createdUser, formData], ['id', 'profile_id', 'profileId'])],
    ['user_id', firstValueFromSources([createdUser, formData], ['user_id', 'userId'])],
    ['auth_user_id', firstValueFromSources([createdUser, formData], ['auth_user_id', 'authUserId', 'id'])],
    ['email', createdUser?.email || formData.email],
  ])

  for (const table of USER_PROFILE_TABLES) {
    for (const [field, value] of identifiers) {
      const response = await fetch(`${apiConfig.restUrl}/${table}?${field}=eq.${encodeURIComponent(value)}`, {
        method: 'PATCH',
        headers: getAuthenticatedHeaders({ Prefer: 'return=representation,count=exact' }),
        body: JSON.stringify({ patient_id: patientId }),
      }).catch(() => null)

      if (!response) continue
      if (response.ok) {
        const data = await response.json().catch(() => null)
        if (normalizeReturnedRow(data) || getAffectedRowCount(response) !== 0) return true
        continue
      }

      const text = await response.text().catch(() => '')
      if (isUnsupportedProfilePatientLink(response.status, text)) break
    }
  }

  return false
}

function getPatientIdentifier(patient) {
  return firstValueFromSources([patient, patient?.patient, patient?.paciente], ['id', 'patient_id', 'patientId', 'paciente_id'])
}

function firstObjectFromSources(sources, keys) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue

    for (const key of keys) {
      const value = source[key]
      if (value && typeof value === 'object' && !Array.isArray(value)) return value
    }
  }

  return null
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function isDuplicatePatientError(error) {
  return /duplicate|unique|already exists|ja existe|jÃ¡ existe|patients_cpf_key|patients_email/i.test(String(error?.message || error || ''))
}

function isUnsupportedProfilePatientLink(status, text) {
  return [400, 404, 406].includes(status) && /column|schema cache|relationship|not found|does not exist|pgrst/i.test(String(text || ''))
}

async function syncDoctorUser(user, formData = {}) {
  const role = normalizeRole(formData.role || user.role)
  const hasDoctorFields = ['crm', 'crm_uf', 'crmUf', 'specialty', 'specialidade'].some((field) => formData[field])
  if (role !== 'medico' && !hasDoctorFields && !user.doctorId) return null

  const payload = buildDoctorSyncBody(user, formData)
  const attempts = uniquePayloads([
    payload,
    pickPayload(payload, ['full_name', 'phone_mobile', 'cpf', 'crm', 'crm_uf', 'specialty']),
    pickPayload(payload, ['full_name', 'crm', 'crm_uf', 'specialty']),
    pickPayload(payload, ['full_name']),
  ])
  const doctorId = firstValueFromSources([formData, user], ['doctorId', 'doctor_id', 'medico_id'])
  const profileId = firstValueFromSources([formData, user], ['profileId', 'profile_id', 'id', 'userId', 'user_id', 'authUserId', 'auth_user_id'])
  const identifiers = uniqueIdentifiers([
    ['id', doctorId, { allowEmptySuccess: true }],
    ['id', doctorId ? '' : profileId],
    ['user_id', formData.userId || formData.user_id || user.userId || user.user_id || user.id || user.auth_user_id || user.profile_id],
    ['auth_user_id', formData.authUserId || formData.auth_user_id || user.authUserId || user.auth_user_id || user.id],
    ['email', formData.email || user.email],
    ['cpf', onlyDigits(formData.cpf || user.cpf)],
  ])

  if (!attempts.length || !identifiers.length) return null

  if (doctorId) {
    const syncedById = await patchDoctorByIdentifiers({
      attempts,
      identifiers: [['id', doctorId, { allowEmptySuccess: true }]],
      requireUpdatedRow: true,
    })
    if (syncedById) return syncedById
  }

  const fallbackIdentifiers = doctorId ? identifiers.filter(([field]) => field !== 'id') : identifiers
  if (!fallbackIdentifiers.length) return null

  return patchDoctorByIdentifiers({ attempts, identifiers: fallbackIdentifiers })
}

async function patchDoctorByIdentifiers({ attempts, identifiers, requireUpdatedRow = false }) {
  for (const table of USER_DOCTOR_TABLES) {
    for (const [field, value, options = {}] of identifiers) {
      for (const attempt of attempts) {
        const response = await fetch(`${apiConfig.restUrl}/${table}?${field}=eq.${encodeURIComponent(value)}`, {
          method: 'PATCH',
          headers: getAuthenticatedHeaders({ Prefer: 'return=representation,count=exact' }),
          body: JSON.stringify(attempt),
        }).catch(() => null)

        if (!response) continue
        if (response.ok) {
          const data = await response.json().catch(() => null)
          const row = normalizeReturnedRow(data)
          if (row) return normalizeDoctorUser(row)
          if (options.allowEmptySuccess && getAffectedRowCount(response) !== 0) {
            return normalizeDoctorUser(buildSyntheticDoctorRow(field, value, attempt))
          }
          break
        }

        const text = await response.text().catch(() => '')
        if (isMissingDoctorTable(response.status, text)) break
        if (isUnsupportedDoctorPatch(response.status, text)) continue
        throw new Error(await getResponseError(cloneTextResponse(response, text), 'Erro ao atualizar dados do medico.'))
      }
    }
  }

  if (requireUpdatedRow) {
    throw new Error('Nao foi possivel sincronizar o cadastro do medico correspondente. Verifique permissoes para atualizar doctors.')
  }

  return null
}

async function getProfileReference(userId) {
  for (const table of USER_PROFILE_TABLES) {
    const response = await fetch(`${apiConfig.restUrl}/${table}?id=eq.${encodeURIComponent(userId)}&select=*`, {
      headers: getAuthenticatedHeaders(),
    }).catch(() => null)

    if (!response) continue

    if (response.ok) {
      const data = await response.json().catch(() => null)
      const row = normalizeReturnedRow(data)
      if (row) return row
      continue
    }

    if (![404, 406].includes(response.status)) return null
  }

  return null
}

function getUpdatedProfileRow(responseData, body, formData, userId, profileReference = null) {
  const returnedRow = normalizeCollection(responseData)[0] || normalizeReturnedRow(responseData) || {}
  const doctorId = firstValueFromSources([returnedRow, profileReference, formData], ['doctorId', 'doctor_id', 'medico_id'])

  return {
    ...(profileReference || {}),
    ...returnedRow,
    ...formData,
    ...body,
    id: returnedRow.id || profileReference?.id || formData.id || userId,
    doctor_id: doctorId,
    doctorId,
  }
}

function storeDoctorNameOverride({ formData = {}, syncedDoctor = null, updatedUser = {}, userId }) {
  const role = normalizeRole(formData.role || updatedUser.role)
  const hasDoctorFields = ['doctorId', 'doctor_id', 'crm', 'crm_uf', 'crmUf', 'specialty', 'specialidade'].some((field) => formData[field] || updatedUser[field])
  if (role !== 'medico' && !hasDoctorFields) return

  storeProfessionalOverride({
    ...(syncedDoctor || {}),
    id: syncedDoctor?.id || formData.doctorId || formData.doctor_id || updatedUser.doctorId || updatedUser.doctor_id,
    doctorId: formData.doctorId || formData.doctor_id || updatedUser.doctorId || updatedUser.doctor_id,
    userId: syncedDoctor?.userId || formData.userId || formData.user_id || updatedUser.userId || updatedUser.user_id || userId,
    authUserId: formData.authUserId || formData.auth_user_id || updatedUser.authUserId || updatedUser.auth_user_id || userId,
    email: formData.email || updatedUser.email || syncedDoctor?.email,
    cpf: formData.cpf || updatedUser.cpf || syncedDoctor?.cpf,
    full_name: formData.full_name || updatedUser.full_name || syncedDoctor?.full_name,
    phone: formData.phone || formData.phone_mobile || updatedUser.phone || updatedUser.phone_mobile || syncedDoctor?.phone,
  })
}

function normalizeReturnedRow(data) {
  const rows = normalizeCollection(data)
  if (rows.length) return rows[0]
  if (data && !Array.isArray(data) && typeof data === 'object' && Object.keys(data).length) return data
  return null
}

function buildSyntheticDoctorRow(field, value, attempt) {
  return cleanPayload({
    ...attempt,
    id: field === 'id' ? value : attempt.id,
    user_id: field === 'user_id' ? value : attempt.user_id,
    auth_user_id: field === 'auth_user_id' ? value : attempt.auth_user_id,
    email: field === 'email' ? value : attempt.email,
    cpf: field === 'cpf' ? value : attempt.cpf,
  })
}

function getAffectedRowCount(response) {
  const contentRange = response.headers?.get?.('content-range')
  if (!contentRange) return null

  const match = contentRange.match(/\/(\d+)$/)
  return match ? Number(match[1]) : null
}

function buildDoctorSyncBody(user, data) {
  const fullName = data.full_name?.trim() || user.full_name || user.name
  const phone = data.phone || data.phone_mobile || user.phone || user.phone_mobile
  const specialty = data.specialty || data.specialidade || user.specialty || user.specialidade

  return cleanPayload({
    email: data.email?.trim() || user.email,
    full_name: fullName,
    phone_mobile: onlyDigits(phone),
    cpf: onlyDigits(data.cpf || user.cpf),
    crm: onlyDigits(data.crm || user.crm),
    crm_uf: String(data.crm_uf || data.crmUf || user.crm_uf || user.crmUf || '').trim().toUpperCase(),
    specialty: specialty?.trim(),
  })
}

function uniqueIdentifiers(identifiers) {
  const seen = new Set()
  return identifiers
    .map(([field, value, options = {}]) => [field, String(value || '').trim(), options])
    .filter(([, value]) => value)
    .filter(([field, value]) => {
      const key = `${field}:${value.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
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

function isMissingDoctorTable(status, text) {
  return [404, 406].includes(status) || /relation .* does not exist|not found|schema cache/i.test(String(text || ''))
}

function isUnsupportedDoctorPatch(status, text) {
  return [400, 404, 406].includes(status) && /column|schema cache|does not exist|pgrst/i.test(String(text || ''))
}

function isIgnorableDoctorSyncError(error) {
  return /Tabela|doctors|medicos|not found|does not exist|schema cache/i.test(String(error?.message || ''))
}

function cloneTextResponse(response, text) {
  return new Response(text, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function buildCreateUserBody(data) {
  const role = normalizeRole(data.role) || data.role
  const createPatientRecord = shouldCreatePatientRecord(role, data)
  const isDoctor = role === 'medico'
  const body = {
    email: data.email?.trim(),
    full_name: data.full_name?.trim(),
    phone: data.phone?.trim(),
    role,
    create_patient_record: createPatientRecord,
    cpf: onlyDigits(data.cpf),
    phone_mobile: onlyDigits(data.phone_mobile || data.phone),
    crm: isDoctor ? onlyDigits(data.crm) : undefined,
    crm_uf: isDoctor ? String(data.crm_uf || data.crmUf || '').trim().toUpperCase() : undefined,
    specialty: isDoctor ? data.specialty?.trim() : undefined,
  }

  return cleanPayload(body)
}

function buildCreateUserWithPasswordBody(data) {
  const role = normalizeRole(data.role) || data.role
  const createPatientRecord = shouldCreatePatientRecord(role, data)
  const isDoctor = role === 'medico'
  const body = {
    email: data.email?.trim(),
    full_name: data.full_name?.trim(),
    phone: data.phone?.trim(),
    role,
    create_patient_record: createPatientRecord,
    cpf: onlyDigits(data.cpf),
    phone_mobile: createPatientRecord
      ? onlyDigits(data.phone_mobile || data.phone)
      : undefined,
    crm: isDoctor ? onlyDigits(data.crm) : undefined,
    crm_uf: isDoctor ? String(data.crm_uf || data.crmUf || '').trim().toUpperCase() : undefined,
    specialty: isDoctor ? data.specialty?.trim() : undefined,
  }

  return cleanPayload(body)
}

function shouldCreatePatientRecord(role, data = {}) {
  return normalizeRole(role) === 'paciente' || Boolean(data.create_patient_record)
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '') || undefined
}

function normalizeListedUser(user) {
  const role = resolveUserRole(user)
  const metadata = getUserMetadata(user)
  const emailConfirmedAt = firstValue(user, [
    'email_confirmed_at',
    'confirmed_at',
    'email_verified_at',
    'verified_at',
    'last_sign_in_at',
  ])

  return {
    ...user,
    id: user.id || user.user_id || user.auth_user_id || user.profile_id,
    email: user.email || user.user_email || '',
    full_name: user.full_name || user.name || user.nome || '',
    phone: firstValueFromSources([user, metadata], ['phone', 'phone_mobile', 'celular', 'telefone']),
    phone_mobile: firstValueFromSources([user, metadata], ['phone_mobile', 'phone', 'celular', 'telefone']),
    cpf: formatCpf(firstValueFromSources([user, metadata], ['cpf', 'document', 'documento'])),
    role,
    roles: role ? [role] : [],
    status: resolveUserStatus(user, emailConfirmedAt),
    email_confirmed_at: emailConfirmedAt,
    doctorId: firstValueFromSources([user, metadata], ['doctor_id', 'doctorId', 'medico_id']),
    patientId: firstValueFromSources([user, metadata], ['patient_id', 'patientId', 'paciente_id']),
    crm: firstValueFromSources([user, metadata], ['crm']),
    crm_uf: String(firstValueFromSources([user, metadata], ['crm_uf', 'crmUf', 'uf_crm']) || '').toUpperCase(),
    specialty: firstValueFromSources([user, metadata], ['specialty', 'specialidade', 'especialidade', 'speciality']),
  }
}

function resolveUserRole(user) {
  const candidates = [
    user.role,
    user.cargo,
    user.perfil,
    user.profile,
    user.profile_name,
    user.profile_slug,
    user.access_profile,
    user.access_level,
    user.user_role,
    user.tipo_usuario,
    user.user_type,
    user.roles,
    user.user_roles,
    user.profile_roles,
    user.role_data,
    user.profile_data,
  ]

  if (user.is_admin || user.admin) candidates.push('admin')
  if (user.is_manager || user.manager || user.gestor) candidates.push('gestor')
  if (user.is_doctor || user.doctor_id || user.crm) candidates.push('medico')
  if (user.is_secretary || user.secretary) candidates.push('secretaria')
  if (user.is_patient || user.patient_id) candidates.push('paciente')

  for (const candidate of flattenRoleCandidates(candidates)) {
    const role = normalizeRole(candidate)
    if (role) return role
  }

  return ''
}

function flattenRoleCandidates(candidates) {
  return candidates.flatMap((candidate) => {
    if (!candidate) return []
    if (Array.isArray(candidate)) return flattenRoleCandidates(candidate)

    if (typeof candidate === 'object') {
      return flattenRoleCandidates([
        candidate.role,
        candidate.role_name,
        candidate.name,
        candidate.slug,
        candidate.label,
        candidate.cargo,
        candidate.perfil,
        candidate.profile,
      ])
    }

    return [candidate]
  })
}

function resolveUserStatus(user, emailConfirmedAt) {
  if (user.deleted_at || user.blocked_at || user.banned_until) return 'blocked'
  if (emailConfirmedAt || user.email_confirmed === true || user.confirmed === true || user.active === true || user.is_active === true) return 'active'

  const rawStatus = String(
    firstValue(user, ['status', 'situacao', 'account_status', 'invite_status']) || '',
  )
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  if (['active', 'ativo', 'confirmed', 'confirmado', 'enabled', 'habilitado'].includes(rawStatus)) {
    return 'active'
  }

  if (['blocked', 'bloqueado', 'inactive', 'inativo', 'disabled', 'desabilitado'].includes(rawStatus)) {
    return 'blocked'
  }

  if (['pending', 'pendente', 'invited', 'convidado'].includes(rawStatus)) {
    return 'pending'
  }

  return 'active'
}

async function getUserRolesById() {
  const query = new URLSearchParams({ select: '*' })
  const response = await fetch(`${apiConfig.restUrl}/user_roles?${query.toString()}`, {
    headers: getAuthenticatedHeaders(),
  })

  if (!response.ok) {
    if ([404, 406].includes(response.status)) return new Map()
    throw new Error(await getResponseError(response, 'Erro ao listar papéis de usuários.'))
  }

  const roles = normalizeCollection(await response.json().catch(() => null), ['roles', 'user_roles', 'data'])
  const rolesByUserId = new Map()

  for (const item of roles) {
    const userId = String(item.user_id || item.userId || item.auth_user_id || item.profile_id || item.profileId || '')
    const role = normalizeRole(item.role || item.role_name || item.name || item.slug)
    if (!userId || !role) continue

    rolesByUserId.set(userId, [...(rolesByUserId.get(userId) || []), role])
  }

  return rolesByUserId
}

function mergeUserRoles(user, rolesByUserId) {
  const userIds = [
    user.id,
    user.user_id,
    user.auth_user_id,
    user.profile_id,
  ]
    .map((id) => String(id || ''))
    .filter(Boolean)
  const roles = userIds.flatMap((id) => rolesByUserId.get(id) || [])
  const uniqueRoles = [...new Set(roles)]

  if (!uniqueRoles.length) return user

  return {
    ...user,
    role: uniqueRoles[0],
    roles: uniqueRoles,
  }
}

async function getDoctorUsers() {
  let lastResponse = null

  for (const table of USER_DOCTOR_TABLES) {
    const query = new URLSearchParams({ select: '*' })
    const response = await fetch(`${apiConfig.restUrl}/${table}?${query.toString()}`, {
      headers: getAuthenticatedHeaders(),
    }).catch(() => null)

    if (!response) continue
    lastResponse = response

    if (response.ok) {
      const data = await response.json().catch(() => null)
      return normalizeCollection(data, ['doctors', 'medicos', 'data']).map(normalizeDoctorUser)
    }

    if (![404, 406].includes(response.status)) {
      throw new Error(await getResponseError(response, 'Erro ao listar mÃ©dicos.'))
    }
  }

  if (lastResponse) return []
  return []
}

function normalizeDoctorUser(doctor) {
  const metadata = getUserMetadata(doctor)
  const specialty = firstValueFromSources([doctor, metadata], ['specialty', 'speciality', 'specialidade', 'especialidade'])

  return {
    ...doctor,
    id: firstValueFromSources([doctor, metadata], ['id', 'doctor_id', 'medico_id']),
    userId: firstValueFromSources([doctor, metadata], ['user_id', 'userId', 'auth_user_id', 'profile_id', 'usuario_id']),
    email: firstValueFromSources([doctor, metadata], ['email', 'user_email', 'usuario_email']),
    full_name: firstValueFromSources([doctor, metadata], ['full_name', 'name', 'nome']),
    phone: firstValueFromSources([doctor, metadata], ['phone', 'phone_mobile', 'celular', 'telefone']),
    cpf: formatCpf(firstValueFromSources([doctor, metadata], ['cpf', 'document', 'documento'])),
    crm: firstValueFromSources([doctor, metadata], ['crm']),
    crm_uf: String(firstValueFromSources([doctor, metadata], ['crm_uf', 'crmUf', 'uf_crm']) || '').toUpperCase(),
    specialty,
  }
}

function mergeUserDoctor(user, doctors) {
  const userKeys = buildLookupKeys([
    user.id,
    user.user_id,
    user.auth_user_id,
    user.profile_id,
    user.doctorId,
    user.doctor_id,
    user.email,
    user.cpf,
  ])
  const doctor = doctors.find((item) =>
    buildLookupKeys([
      item.id,
      item.userId,
      item.user_id,
      item.auth_user_id,
      item.profile_id,
      item.email,
      item.cpf,
    ]).some((key) => userKeys.includes(key)),
  )

  if (!doctor) return user

  return {
    ...user,
    role: normalizeRole(user.role) || 'medico',
    roles: user.roles?.length ? user.roles : ['medico'],
    doctorId: user.doctorId || doctor.id,
    cpf: user.cpf || doctor.cpf,
    phone: user.phone || doctor.phone,
    phone_mobile: user.phone_mobile || doctor.phone,
    crm: user.crm || doctor.crm,
    crm_uf: user.crm_uf || doctor.crm_uf,
    specialty: user.specialty || doctor.specialty,
    specialidade: user.specialidade || doctor.specialty,
  }
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

function firstValueFromSources(sources, keys) {
  for (const source of sources) {
    const value = firstValue(source, keys)
    if (value) return value
  }

  return ''
}

function firstValue(source, keys) {
  for (const key of keys) {
    if (source?.[key]) return source[key]
  }

  return ''
}

function getUserMetadata(user) {
  return {
    ...(user?.raw_user_meta_data || {}),
    ...(user?.user_metadata || {}),
    ...(user?.app_metadata || {}),
    ...(user?.metadata || {}),
    ...(user?.profile_metadata || {}),
    ...(user?.doctor || {}),
    ...(user?.doctor_data || {}),
    ...(user?.medico || {}),
  }
}

function formatCpf(value) {
  const digits = onlyDigits(value)
  if (!digits) return ''
  if (digits.length !== 11) return String(value || '')
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}
