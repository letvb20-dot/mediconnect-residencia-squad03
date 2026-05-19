import { authRepository } from './authRepository.js'
import { apiConfig, getAuthenticatedHeaders, getAuthSession, saveAuthSession } from '../config/api.js'
import { normalizeRole, ROLE_LABELS } from '../config/permissions.js'
import { getResponseError } from './repositoryUtils.js'

const USER_PROFILE_TABLES = ['profiles', 'user_profiles']
const PROFILE_AVATAR_OVERRIDES_KEY = 'mediconnect.profile.avatar.overrides'

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
      avatarUrl: getStoredAvatarOverride(profile, user) || getAvatarUrl(avatarUrl),
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

  async updateAvatar(file) {
    const profile = await this.getCurrentUserProfile()

    if (!profile.id) {
      throw new Error('Não foi possível identificar o usuário para enviar o avatar.')
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
    await persistProfileAvatar(profile, avatarUrl).catch(() => false)
    storeAvatarOverride(profile, avatarUrl)
    updateStoredSessionAvatar(avatarUrl, objectPath)

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
  const identifiers = [
    ['id', profile?.id],
    ['user_id', profile?.userId],
    ['auth_user_id', profile?.authUserId],
    ['email', profile?.email],
  ].filter(([, value]) => value)
  const payload = { avatar_url: avatarUrl }
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
        if (rows.length) return true
        continue
      }
      lastError = new Error(await getResponseError(response, 'Falha ao salvar avatar no perfil.'))
    }
  }

  if (lastError) throw lastError
  return false
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

function getStoredAvatarOverride(profile, user) {
  const overrides = readAvatarOverrides()
  for (const key of getProfileAvatarKeys(profile, user)) {
    if (overrides[key]) return overrides[key]
  }
  return ''
}

function storeAvatarOverride(profile, avatarUrl) {
  if (typeof window === 'undefined' || !avatarUrl) return
  const overrides = readAvatarOverrides()
  for (const key of getProfileAvatarKeys(profile)) {
    overrides[key] = avatarUrl
  }
  window.localStorage.setItem(PROFILE_AVATAR_OVERRIDES_KEY, JSON.stringify(overrides))
}

function readAvatarOverrides() {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(PROFILE_AVATAR_OVERRIDES_KEY) || '{}') || {}
  } catch {
    window.localStorage.removeItem(PROFILE_AVATAR_OVERRIDES_KEY)
    return {}
  }
}

function getProfileAvatarKeys(profile, user = {}) {
  return [
    profile?.id,
    profile?.userId,
    profile?.user_id,
    profile?.authUserId,
    profile?.auth_user_id,
    profile?.email,
    user?.id,
    user?.user_id,
    user?.auth_user_id,
    user?.email,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
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
