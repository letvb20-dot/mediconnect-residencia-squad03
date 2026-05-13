import { authRepository } from './authRepository.js'
import { normalizeRole, ROLE_LABELS } from '../config/permissions.js'
import { apiConfig, apiEndpoint, getAuthenticatedHeaders } from '../config/api.js'
import { getResponseError } from './repositoryUtils.js'

export const profileRepository = {
  async getCurrentUserProfile() {
    const data = await authRepository.getUser()
    const profile = data?.profile || data?.perfil || {}
    const user = data?.user || data?.usuario || profile || data
    const meta = user?.user_metadata || user?.metadata || user?.app_metadata || {}
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
      id: profile?.id || user?.id || user?.user_id || user?.uid || '',
      email: profile?.email || user?.email || meta.email || '',
      name: profile?.full_name || user?.name || user?.nome || user?.full_name || meta.full_name || meta.name || 'Usuário',
      phone: profile?.phone || user?.phone || user?.telefone || meta.phone || meta.telefone || '',
      role: ROLE_LABELS[normalizedRole] || user?.role || user?.cargo || meta.role || meta.cargo || 'Usuário do Sistema',
      unit: profile?.unit || user?.unit || user?.unidade || meta.unit || meta.unidade || 'Clínica Boa Vista',
      avatarUrl: getAvatarUrl(avatarUrl),
      doctorId: data?.doctor_id || data?.doctorId || null,
      patientId: data?.patient_id || data?.patientId || null,
      roles,
      permissions,
      isDoctor: normalizedRole === 'medico',
      isAdmin: normalizedRole === 'admin',
      isManager: normalizedRole === 'gestor',
      isSecretary: normalizedRole === 'secretaria',
    }
  },

  async updateAvatar(file) {
    const profile = await this.getCurrentUserProfile()
    const formData = new FormData()
    formData.append('avatar', file)
    formData.append('file', file)

    const apiResponse = await fetch(apiEndpoint('/upload-avatar'), {
      method: 'POST',
      headers: getAuthenticatedHeaders({ 'Content-Type': undefined }),
      body: formData,
    }).catch(() => null)

    if (apiResponse?.ok) {
      return normalizeAvatarResponse(await apiResponse.json().catch(() => ({})))
    }

    if (apiResponse && ![404, 405].includes(apiResponse.status)) {
      throw new Error(await getResponseError(apiResponse, 'Falha ao enviar avatar.'))
    }

    if (!profile.id) {
      throw new Error('Não foi possível identificar o usuário para enviar o avatar.')
    }

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

    return {
      avatarUrl: getAvatarUrl(objectPath),
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

function normalizeAvatarResponse(data) {
  const path = data.path || data.key || ''
  return {
    avatarUrl: data.avatarUrl || data.avatar_url || data.publicUrl || data.public_url || data.url || getAvatarUrl(path),
    path,
  }
}

function getAvatarUrl(path) {
  const objectPath = String(path || '').replace(/^\/+/, '')
  if (!objectPath) return ''
  if (/^https?:\/\//i.test(objectPath)) return objectPath
  return `${apiConfig.storageUrl}/object/avatars/${objectPath}`
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
