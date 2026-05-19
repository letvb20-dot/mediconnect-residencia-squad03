export function resolveCurrentPatient(profile, patients = []) {
  const profileSources = getIdentitySources(profile)
  const explicitPatientIds = collectNormalizedValues(profileSources, PATIENT_ID_KEYS)
  const explicitIdentityIds = collectNormalizedValues(profileSources, IDENTITY_ID_KEYS)
  const explicitIds = [...new Set([...explicitPatientIds, ...explicitIdentityIds])]
  const profilePatient = buildPatientFromProfile(profile)

  if (profilePatient?.id && !patients.length) return profilePatient

  const byPatientId = patients.find((patient) => {
    const patientIds = collectNormalizedValues(getIdentitySources(patient), PATIENT_ID_KEYS)
    return hasIntersection(patientIds, explicitPatientIds)
  })
  if (byPatientId) return byPatientId

  const byId = patients.find((patient) => {
    const patientIds = collectNormalizedValues(getIdentitySources(patient), PATIENT_MATCH_ID_KEYS)
    return hasIntersection(patientIds, explicitIds)
  })
  if (byId) return byId

  const profileEmails = collectNormalizedValues(profileSources, EMAIL_KEYS)
  if (profileEmails.length) {
    const byEmail = patients.find((patient) => {
      const patientEmails = collectNormalizedValues(getIdentitySources(patient), EMAIL_KEYS)
      return hasIntersection(patientEmails, profileEmails)
    })
    if (byEmail) return byEmail
  }

  const profileCpfs = collectDigitValues(profileSources, CPF_KEYS)
  if (profileCpfs.length) {
    const byCpf = patients.find((patient) => {
      const patientCpfs = collectDigitValues(getIdentitySources(patient), CPF_KEYS)
      return hasIntersection(patientCpfs, profileCpfs)
    })
    if (byCpf) return byCpf
  }

  return null
}

export function buildPatientFromProfile(profile) {
  const profilePatient = firstNestedObject(profile, PROFILE_PATIENT_KEYS)
  const patientId =
    firstValueFromSources([profile], EXPLICIT_PROFILE_PATIENT_ID_KEYS) ||
    firstValueFromSources(getIdentitySources(profilePatient), PATIENT_ID_KEYS)

  if (!patientId) return null

  const patientSources = getIdentitySources(profilePatient)
  const profileSources = getIdentitySources(profile)

  return {
    ...(profilePatient || {}),
    id: patientId,
    patient_id: profilePatient?.patient_id || profile?.patient_id || patientId,
    patientId: profilePatient?.patientId || profile?.patientId || patientId,
    name: firstValueFromSources(patientSources, NAME_KEYS) || firstValueFromSources(profileSources, NAME_KEYS),
    full_name: firstValueFromSources(patientSources, NAME_KEYS) || firstValueFromSources(profileSources, NAME_KEYS),
    email: firstValueFromSources(patientSources, EMAIL_KEYS) || firstValueFromSources(profileSources, EMAIL_KEYS),
    cpf: firstValueFromSources(patientSources, CPF_KEYS) || firstValueFromSources(profileSources, CPF_KEYS),
    phone: firstValueFromSources(patientSources, PHONE_KEYS) || firstValueFromSources(profileSources, PHONE_KEYS),
  }
}

const EXPLICIT_PROFILE_PATIENT_ID_KEYS = [
  'patientId',
  'patient_id',
  'patient_uuid',
  'pacienteId',
  'paciente_id',
  'id_paciente',
]

const PATIENT_ID_KEYS = [
  'id',
  'patientId',
  'patient_id',
  'patient_uuid',
  'pacienteId',
  'paciente_id',
  'id_paciente',
]

const IDENTITY_ID_KEYS = [
  'id',
  'userId',
  'user_id',
  'authUserId',
  'auth_user_id',
  'auth_id',
  'profileId',
  'profile_id',
  'usuarioId',
  'usuario_id',
  'uid',
  'sub',
]

const PATIENT_MATCH_ID_KEYS = [
  ...PATIENT_ID_KEYS,
  ...IDENTITY_ID_KEYS,
  'owner_id',
  'account_id',
]

const EMAIL_KEYS = [
  'email',
  'mail',
  'userEmail',
  'user_email',
  'patientEmail',
  'patient_email',
  'usuario_email',
]

const CPF_KEYS = [
  'cpf',
  'document',
  'documento',
  'documentNumber',
  'document_number',
  'numero_documento',
]

const NAME_KEYS = [
  'name',
  'full_name',
  'nome',
  'patientName',
  'patient_name',
]

const PHONE_KEYS = [
  'phone',
  'phone_mobile',
  'telefone',
  'celular',
]

const PROFILE_PATIENT_KEYS = [
  'patient',
  'patients',
  'patientData',
  'patient_data',
  'patient_metadata',
  'paciente',
  'dados_paciente',
]

const NESTED_SOURCE_KEYS = [
  'app_metadata',
  'contact',
  'contato',
  'dados',
  'dados_paciente',
  'metadata',
  'patient',
  'patients',
  'patientData',
  'patient_data',
  'patient_metadata',
  'perfil',
  'profile',
  'raw_user_meta_data',
  'user',
  'user_metadata',
  'usuario',
  'paciente',
]

function getIdentitySources(root) {
  const sources = []
  const queue = [root]
  const seen = new Set()

  while (queue.length) {
    const source = queue.shift()
    if (Array.isArray(source)) {
      queue.push(...source.filter((item) => item && typeof item === 'object'))
      continue
    }

    if (!source || typeof source !== 'object' || seen.has(source)) continue

    seen.add(source)
    sources.push(source)

    for (const key of NESTED_SOURCE_KEYS) {
      const nested = source[key]
      if (nested && typeof nested === 'object') queue.push(nested)
    }
  }

  return sources
}

function firstNestedObject(source, keys) {
  for (const key of keys) {
    const value = source?.[key]
    if (Array.isArray(value)) {
      const item = value.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      if (item) return item
    }
    if (value && typeof value === 'object') return value
  }

  return null
}

function firstValueFromSources(sources, keys) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    for (const key of keys) {
      const value = source[key]
      if (value !== undefined && value !== null && value !== '') return value
    }
  }

  return ''
}

function collectNormalizedValues(sources, keys) {
  const values = []

  for (const source of sources) {
    for (const key of keys) {
      const normalized = normalizeIdentifier(source?.[key])
      if (normalized && !values.includes(normalized)) values.push(normalized)
    }
  }

  return values
}

function collectDigitValues(sources, keys) {
  const values = []

  for (const source of sources) {
    for (const key of keys) {
      const normalized = normalizeDigits(source?.[key])
      if (normalized && !values.includes(normalized)) values.push(normalized)
    }
  }

  return values
}

function hasIntersection(left, right) {
  if (!left.length || !right.length) return false
  return left.some((value) => right.includes(value))
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '')
}
