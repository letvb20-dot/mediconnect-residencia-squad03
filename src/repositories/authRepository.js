import {
  apiConfig,
  clearAuthSession,
  getAnonHeaders,
  getAuthenticatedHeaders,
  getAuthSession,
  getPublicHeaders,
  hasAuthenticatedSession,
  saveAuthSession,
} from '../config/api.js'
import { getResponseError } from './repositoryUtils.js'

export const authRepository = {
  // POST /auth/v1/token?grant_type=password
  async login({ email, password }) {
    const response = await fetch(`${apiConfig.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: getAnonHeaders(),
      body: JSON.stringify({ email: email?.trim(), password }),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro de autenticação.'))
    }

    const session = await response.json()
    if (!session?.access_token) {
      throw new Error('Falha no login. Token não recebido.')
    }

    saveAuthSession(session)
    return session
  },

  // POST /functions/v1/request-password-reset
  async requestPasswordReset(email) {
    const payload = {
      email: email?.trim(),
      redirect_url: getDefaultRedirectUrl('/login'),
    }
    const response = await fetch(`${apiConfig.functionsUrl}/request-password-reset`, {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao solicitar reset de senha.'))
    }

    return true
  },

  // POST /auth/v1/otp
  async sendMagicLink(email) {
    const response = await fetch(`${apiConfig.supabaseUrl}/auth/v1/otp`, {
      method: 'POST',
      headers: getAnonHeaders(),
      body: JSON.stringify({ email: email?.trim() }),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao enviar Magic Link.'))
    }

    return true
  },

  // POST /functions/v1/user-info com fallback para GET /auth/v1/user
  async getUser() {
    const response = await fetch(`${apiConfig.functionsUrl}/user-info`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
    })

    if (response.ok) {
      return response.json()
    }

    if (!canFallbackToSupabaseUser(response.status)) {
      throw new Error(await getResponseError(response, 'Erro ao resgatar perfil de usuário.'))
    }

    const authResponse = await fetch(`${apiConfig.supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: getAuthenticatedHeaders(),
    })

    if (!authResponse.ok) {
      throw new Error(await getResponseError(authResponse, 'Erro ao resgatar perfil de usuário.'))
    }

    return authResponse.json()
  },

  getSession() {
    return getAuthSession()
  },

  isAuthenticated() {
    return hasAuthenticatedSession()
  },

  // POST /auth/v1/logout
  async logout() {
    try {
      await fetch(`${apiConfig.supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: getAuthenticatedHeaders(),
      })
    } catch {
      // A sessão local precisa ser removida mesmo quando o backend não responde.
    } finally {
      clearAuthSession()
    }
  },
}

function canFallbackToSupabaseUser(status) {
  return [404, 405, 500, 502, 503, 504].includes(Number(status))
}

function getDefaultRedirectUrl(path) {
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}${path}`
}
