import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { normalizeRole } from '../config/permissions.js'
import { getResponseError, normalizeCollection } from './repositoryUtils.js'

const USER_PROFILE_TABLES = ['user_info', 'profiles', 'user_profiles']
const USER_LIST_KEYS = ['users', 'usuarios', 'data', 'items', 'results']

export const userRepository = {
  async getAll() {
    let lastResponse = null

    for (const table of USER_PROFILE_TABLES) {
      const query = new URLSearchParams({
        select: '*',
      })
      const response = await fetch(`${apiConfig.restUrl}/${table}?${query.toString()}`, {
        headers: getAuthenticatedHeaders(),
      }).catch(() => null)

      if (!response) continue
      lastResponse = response

      if (response.ok) {
        const data = await response.json().catch(() => null)
        const users = normalizeCollection(data, USER_LIST_KEYS).map(normalizeListedUser)
        const rolesByUserId = await getUserRolesById().catch(() => new Map())

        return users.map((user) => mergeUserRoles(user, rolesByUserId))
      }

      if (![404, 406].includes(response.status)) {
        throw new Error(await getResponseError(response, 'Erro ao listar usuários.'))
      }
    }

    throw new Error(await getResponseError(lastResponse, 'Tabela de perfis de usuários não encontrada.'))
  },

  async getById(userId) {
    const response = await fetch(`${apiConfig.functionsUrl}/user-info-by-id/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao buscar usuário.'))
    }

    return response.json()
  },

  async create(data) {
    const response = await fetch(`${apiConfig.functionsUrl}/create-user`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(buildCreateUserBody(data)),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao criar usuário.'))
    }

    return response.json()
  },

  async createWithPassword(data) {
    const body = {
      ...buildCreateUserBody(data),
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

    return response.json()
  },

  async update(userId, data) {
    let lastResponse = null
    const body = cleanPayload({
      email: data.email?.trim(),
      full_name: data.full_name?.trim(),
      phone: data.phone?.trim(),
      phone_mobile: data.phone?.trim(),
      cpf: data.cpf?.trim(),
      role: data.role,
      crm: data.crm?.trim(),
      crm_uf: data.crm_uf?.trim() || data.crmUf?.trim(),
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
        const data = await response.json().catch(() => null)
        return normalizeListedUser(normalizeCollection(data)[0] || data || body)
      }

      if (![404, 406].includes(response.status)) {
        throw new Error(await getResponseError(response, 'Erro ao atualizar usuário.'))
      }
    }

    throw new Error(await getResponseError(lastResponse, 'Tabela de perfis de usuários não encontrada.'))
  },

  async remove(userId) {
    const response = await fetch(`${apiConfig.functionsUrl}/delete-user`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify({ userId, user_id: userId }),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao deletar usuário.'))
    }

    return true
  },
}

function buildCreateUserBody(data) {
  const body = {
    email: data.email?.trim(),
    full_name: data.full_name?.trim(),
    phone: data.phone?.trim(),
    cpf: data.cpf?.trim(),
    role: data.role,
    crm: data.crm?.trim(),
    crm_uf: data.crm_uf?.trim() || data.crmUf?.trim(),
  }

  if (data.create_patient_record) {
    body.create_patient_record = true
    body.phone_mobile = data.phone_mobile?.trim() || data.phone?.trim()
  }

  return body
}

function normalizeListedUser(user) {
  const role = resolveUserRole(user)
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
    role,
    roles: role ? [role] : [],
    status: resolveUserStatus(user, emailConfirmedAt),
    email_confirmed_at: emailConfirmedAt,
    crm: user.crm || '',
    crm_uf: user.crm_uf || user.crmUf || '',
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
  if (emailConfirmedAt || user.email_confirmed || user.confirmed || user.active || user.is_active) return 'active'

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

function firstValue(source, keys) {
  for (const key of keys) {
    if (source?.[key]) return source[key]
  }

  return ''
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}
