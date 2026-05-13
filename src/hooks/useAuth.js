import { useEffect, useState } from 'react'

import { AUTH_SESSION_CHANGED_EVENT, getAuthSession, saveAuthSession } from '../config/api.js'
import { normalizeRole } from '../config/permissions.js'
import { authRepository } from '../repositories/authRepository.js'

export function useAuth() {
  const [state, setState] = useState(() => getStateFromSession(getAuthSession()))

  useEffect(() => {
    function syncSession() {
      setState(getStateFromSession(getAuthSession()))
    }

    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession)
    return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession)
  }, [])

  useEffect(() => {
    if (!state.isAuthenticated || state.role) {
      return
    }

    let cancelled = false

    authRepository
      .getUser()
      .then((data) => {
        if (cancelled || !data) return

        const profile = data.profile ?? data.perfil ?? null
        const user = data.user ?? data.usuario ?? data ?? null
        const role = resolveRole(data)
        const session = getAuthSession()

        saveAuthSession({ ...session, role, profile, user: user || session?.user })
        setState((current) => ({ ...current, role, profile, user: user || current.user, loading: false }))
      })
      .catch(() => {
        if (!cancelled) setState((current) => ({ ...current, loading: false }))
      })

    return () => {
      cancelled = true
    }
  }, [state.isAuthenticated, state.role])

  return state
}

function getStateFromSession(session) {
  const role = normalizeRole(session?.role)

  return {
    user: session?.user ?? null,
    role,
    profile: session?.profile ?? null,
    isAuthenticated: !!session?.access_token,
    loading: !!session?.access_token && !role,
  }
}

function resolveRole(data) {
  const user = data?.user ?? data?.usuario ?? {}
  const profile = data?.profile ?? data?.perfil ?? {}
  const metadata = {
    ...user?.user_metadata,
    ...user?.app_metadata,
    ...user?.metadata,
    ...data?.user_metadata,
    ...data?.app_metadata,
    ...data?.metadata,
  }

  const candidates = [
    ...(Array.isArray(data?.roles) ? data.roles : []),
    ...(Array.isArray(user?.roles) ? user.roles : []),
    data?.role,
    data?.cargo,
    profile?.role,
    profile?.cargo,
    user?.role,
    user?.cargo,
    metadata.role,
    metadata.cargo,
  ]

  for (const candidate of candidates) {
    const role = normalizeRole(candidate)
    if (role) return role
  }

  const permissions = data?.permissions ?? data?.permissoes ?? {}
  if (permissions.isAdmin) return 'admin'
  if (permissions.isManager) return 'gestor'
  if (permissions.isDoctor) return 'medico'
  if (permissions.isSecretary) return 'secretaria'
  if (permissions.isPatient) return 'paciente'

  return null
}
