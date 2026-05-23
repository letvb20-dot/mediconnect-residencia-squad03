import { authRepository } from './authRepository.js'
import { apiConfig, getAuthenticatedHeaders, getAuthSession, saveAuthSession } from '../config/api.js'
import { normalizeRole, ROLE_LABELS } from '../config/permissions.js'
import { getResponseError } from './repositoryUtils.js'

const USER_PROFILE_TABLES = ['profiles', 'user_profiles']
export const PROFILE_CHANGED_EVENT = 'mediconnect:profile-changed'
export const PROFILE_AVATAR_CHANGED_EVENT = PROFILE_CHANGED_EVENT

export const profileRepository = {
  async getCurrentUserProfile() {
    const data = await authRepository.getUser()
    const session = getAuthSession()
    const sessionUser = session?.user || session?.usuario || null
    const sessionMeta = sessionUser?.user_metadata || sessionUser?.metadata || sessionUser?.app_metadata || {}
    const profile = data?.profile || data?.perfil || {}
    const user = data?.user || data?.usuario || sessionUser || profile || data
    const meta = {
      ...sessionMeta,
      ...(user?.user_metadata || {}),
      ...(user?.metadata || {}),
      ...(user?.app_metadata || {}),
    }
    const patient = firstObjectFromSources([data, profile, user, meta, sessionUser, sessionMeta], [
      'patient',
      'patients',
      'patientData',
      'patient_data',
      'paciente',
      'dados_paciente',
    ])
    const patientSources = [patient, patient?.profile, patient?.perfil, patient?.user, patient?.usuario]
    const permissions = data?.permissions || {}
    const roles = collectRoles({ data, meta, profile, user })
    const normalizedRole = resolveNormalizedRole({ permissions, roles, user, meta })
    const avatarUrl =
      profile?.avatar_url ||
      profile?.avatarUrl ||
      user?.avatarUrl ||
      user?.avatar_url ||
      profile?.avatar_path ||
      user?.avatar_path ||
      meta.avatar_url ||
      meta.avatar_path ||
      meta.picture ||
      ''

    return {
      id: profile?.id || user?.id || user?.user_id || user?.uid || sessionUser?.id || sessionUser?.uid || '',
      userId: profile?.user_id || user?.user_id || user?.id || sessionUser?.user_id || sessionUser?.id || '',
      authUserId: profile?.auth_user_id || user?.auth_user_id || user?.id || user?.uid || sessionUser?.auth_user_id || sessionUser?.id || sessionUser?.uid || '',
      email: profile?.email || user?.email || sessionUser?.email || meta.email || firstValueFromSources(patientSources, ['email', 'user_email']) || '',
      name: profile?.full_name || user?.name || user?.nome || user?.full_name || meta.full_name || meta.name || 'Usuário',
      phone: profile?.phone || user?.phone || user?.telefone || sessionUser?.phone || sessionUser?.telefone || meta.phone || meta.telefone || '',
      cpf: profile?.cpf || user?.cpf || sessionUser?.cpf || meta.cpf || firstValueFromSources(patientSources, ['cpf', 'document', 'documento']) || '',
      role: ROLE_LABELS[normalizedRole] || user?.role || user?.cargo || meta.role || meta.cargo || 'Usuário do Sistema',
      unit: profile?.unit || user?.unit || user?.unidade || meta.unit || meta.unidade || 'Clínica Boa Vista',
      avatarUrl: getAvatarUrl(avatarUrl),
      doctorId: firstValueFromSources([data, profile, user, meta, sessionUser, sessionMeta], ['doctor_id', 'doctorId', 'medico_id']) || null,
      patientId:
        firstValueFromSources([data, profile, user, meta, sessionUser, sessionMeta], ['patient_id', 'patientId', 'paciente_id']) ||
        firstValueFromSources(patientSources, ['id', 'patient_id', 'patientId', 'paciente_id']) ||
        null,
      patient,
      roles,
      permissions,
      isDoctor: normalizedRole === 'medico',
      isAdmin: normalizedRole === 'admin',
      isManager: normalizedRole === 'gestor',
      isSecretary: normalizedRole === 'secretaria',
      isPatient: normalizedRole === 'paciente',
    }
  },

  async updateCurrentUserProfile(data) {
    const profile = await this.getCurrentUserProfile()
    const payload = getChangedProfilePayload(profile, buildProfileUpdatePayload(data))

    if (!Object.keys(payload).length) return profile
    if (!getProfileIdentifiers(profile).length) {
      throw new Error('Não foi possível identificar o usuário para salvar o perfil.')
    }

    const updatedRow = await persistProfileFields(profile, payload, 'Falha ao salvar perfil.')
    const updatedProfile = mergeProfileUpdate(profile, updatedRow, payload)
    updateStoredSessionProfile(updatedProfile, payload)
    notifyProfileChanged({ profile: updatedProfile })

    return updatedProfile
  },

  async updateAvatar(file) {
    const profile = await this.getCurrentUserProfile()

    if (!profile.id) {
      throw new Error('Não foi possível identificar o usuário para enviar o avatar.')
    }

    if (profile.isPatient && !profile.patientId) {
      throw new Error('Não foi possível identificar o paciente vinculado para salvar o avatar.')
    }

    // POST /storage/v1/object/avatars/{path}
    const extension = file.name?.split('.').pop() || 'jpg'
    const objectPath = `${profile.id}/avatar.${extension}`
    const response = await fetch(`${apiConfig.storageUrl}/object/avatars/${objectPath}`, {
      method: 'POST',
      headers: getAuthenticatedHeaders({
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      }),
      body: file,
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao enviar avatar.'))
    }

    const avatarUrl = getAvatarUrl(objectPath)
    await persistProfileAvatar(profile, avatarUrl)
    await persistPatientAvatar(profile, avatarUrl)
    updateStoredSessionAvatar(avatarUrl, objectPath)
    notifyProfileChanged({ avatarUrl, path: objectPath })

    return {
      avatarUrl,
      path: objectPath,
    }
  },

  async downloadAvatar(path) {
    const objectPath = String(path || '').replace(/^\/+/, '')
    const response = await fetch(`${apiConfig.storageUrl}/object/avatars/${objectPath}`, {
      method: 'GET',
      headers: getAuthenticatedHeaders({ 'Content-Type': undefined }),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao baixar avatar.'))
    }

    return {
      blob: await response.blob(),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      path: objectPath,
    }
  },
}

function getAvatarUrl(path) {
  const objectPath = String(path || '').replace(/^\/+/, '')
  if (!objectPath) return ''
  if (/^https?:\/\//i.test(objectPath)) return objectPath
  return `${apiConfig.storageUrl}/object/public/avatars/${objectPath}`
}

async function persistProfileAvatar(profile, avatarUrl) {
  return persistProfileFields(profile, { avatar_url: avatarUrl }, 'Falha ao salvar avatar no perfil.', (row) => {
    return getAvatarUrl(row?.avatar_url || row?.avatarUrl || row?.avatar_path) === avatarUrl
  })
}

async function persistPatientAvatar(profile, avatarUrl) {
  if (!profile.isPatient) return null

  const response = await fetch(`${apiConfig.restUrl}/patients?id=eq.${encodeURIComponent(profile.patientId)}`, {
    method: 'PATCH',
    headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ avatar_url: avatarUrl }),
  })

  if (!response.ok) {
    throw new Error(await getResponseError(response, 'Falha ao salvar avatar no perfil do paciente.'))
  }

  const data = await response.json().catch(() => null)
  const rows = Array.isArray(data) ? data : data ? [data] : []
  const confirmedRow = rows.find((row) => getAvatarUrl(row?.avatar_url || row?.avatarUrl || row?.avatar_path) === avatarUrl)

  if (!confirmedRow) {
    throw new Error('Falha ao salvar avatar no perfil do paciente. A API nao retornou confirmacao da alteracao.')
  }

  return confirmedRow
}

async function persistProfileFields(profile, payload, fallbackMessage, isConfirmed = () => true) {
  const identifiers = [
    ['id', profile?.id],
    ['user_id', profile?.userId],
    ['auth_user_id', profile?.authUserId],
    ['email', profile?.email],
  ].filter(([, value]) => value)
  let lastError = null

  for (const table of USER_PROFILE_TABLES) {
    for (const [field, value] of identifiers) {
      const response = await fetch(`${apiConfig.restUrl}/${table}?${field}=eq.${encodeURIComponent(value)}`, {
        method: 'PATCH',
        headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(payload),
      }).catch((error) => {
        lastError = error
        return null
      })

      if (!response) continue
      if (response.ok) {
        const data = await response.json().catch(() => null)
        const rows = Array.isArray(data) ? data : data ? [data] : []
        const confirmedRow = rows.find((row) => isConfirmed(row))
        if (confirmedRow) return confirmedRow
        continue
      }
      lastError = new Error(await getResponseError(response, fallbackMessage))
    }
  }

  if (lastError) throw lastError
  throw new Error(`${fallbackMessage} A API nao retornou confirmacao da alteracao.`)
}

function updateStoredSessionAvatar(avatarUrl, avatarPath) {
  const session = getAuthSession()
  if (!session) return

  const profile = {
    ...(session.profile || session.perfil || {}),
    avatar_url: avatarUrl,
    avatar_path: avatarPath,
  }
  const user = {
    ...(session.user || session.usuario || {}),
    avatar_url: avatarUrl,
    avatar_path: avatarPath,
  }

  saveAuthSession({
    ...session,
    profile,
    perfil: session.perfil ? profile : session.perfil,
    user,
    usuario: session.usuario ? user : session.usuario,
  })
}

function updateStoredSessionProfile(profile, payload = {}) {
  const session = getAuthSession()
  if (!session) return

  const nextProfile = {
    ...(session.profile || session.perfil || {}),
    ...payload,
    email: profile.email,
    full_name: profile.name,
    phone: profile.phone,
    unit: profile.unit,
  }
  const nextUser = {
    ...(session.user || session.usuario || {}),
    email: profile.email,
    full_name: profile.name,
    name: profile.name,
    phone: profile.phone,
    unit: profile.unit,
  }

  saveAuthSession({
    ...session,
    profile: nextProfile,
    perfil: session.perfil ? nextProfile : session.perfil,
    user: nextUser,
    usuario: session.usuario ? nextUser : session.usuario,
  })
}

function notifyProfileChanged(detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return

  const EventConstructor = typeof window.CustomEvent === 'function' ? window.CustomEvent : Event
  window.dispatchEvent(new EventConstructor(PROFILE_CHANGED_EVENT, { detail }))
}

function buildProfileUpdatePayload(data = {}) {
  return cleanProfilePayload({
    full_name: data.name ?? data.full_name,
    email: data.email,
    phone: data.phone,
    unit: data.unit,
  })
}

function getChangedProfilePayload(profile, payload) {
  const currentValues = {
    email: profile.email,
    full_name: profile.name,
    phone: profile.phone,
    unit: profile.unit,
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([field, value]) => !sameProfileValue(value, currentValues[field])),
  )
}

function sameProfileValue(a, b) {
  return String(a ?? '').trim() === String(b ?? '').trim()
}

function cleanProfilePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
  )
}

function getProfileIdentifiers(profile) {
  return [
    ['id', profile?.id],
    ['user_id', profile?.userId],
    ['auth_user_id', profile?.authUserId],
    ['email', profile?.email],
  ].filter(([, value]) => value)
}

function mergeProfileUpdate(profile, row = {}, payload = {}) {
  return {
    ...profile,
    email: pickValue(row.email, payload.email, profile.email),
    name: pickValue(row.full_name, row.name, row.nome, payload.full_name, profile.name),
    phone: pickValue(row.phone, row.phone_mobile, row.telefone, payload.phone, profile.phone),
    unit: pickValue(row.unit, row.unidade, payload.unit, profile.unit),
  }
}

function pickValue(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? ''
}

function collectRoles({ data, meta, profile, user }) {
  return [
    ...(Array.isArray(data?.roles) ? data.roles : []),
    ...(Array.isArray(user?.roles) ? user.roles : []),
    data?.role,
    data?.cargo,
    profile?.role,
    profile?.cargo,
    user?.role,
    user?.cargo,
    meta.role,
    meta.cargo,
  ].filter(Boolean)
}

function firstObjectFromSources(sources, keys) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue

    for (const key of keys) {
      const value = source[key]
      if (Array.isArray(value)) {
        const item = value.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        if (item) return item
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) return value
    }
  }

  return null
}

function firstValueFromSources(sources, keys, fallback = '') {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue

    for (const key of keys) {
      const value = source[key]
      if (value !== undefined && value !== null && value !== '') return value
    }
  }

  return fallback
}

function resolveNormalizedRole({ permissions, roles, user, meta }) {
  for (const role of roles) {
    const normalized = normalizeRole(role)
    if (normalized) return normalized
  }

  if (permissions.isAdmin) return 'admin'
  if (permissions.isManager) return 'gestor'
  if (permissions.isDoctor) return 'medico'
  if (permissions.isSecretary) return 'secretaria'

  return normalizeRole(user?.role || user?.cargo || meta.role || meta.cargo)
}
