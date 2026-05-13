import {
  apiConfig,
  apiEndpoint,
  clearAuthSession,
  getAnonHeaders,
  getAuthenticatedHeaders,
  getAuthSession,
  hasAuthenticatedSession,
  saveAuthSession,
} from '../config/api.js'
import { getResponseError } from './repositoryUtils.js'

export const authRepository = {
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

  async requestPasswordReset(email) {
    const payload = { email: email?.trim() }
    const apiResponse = await fetch(apiEndpoint('/request-password-reset'), {
      method: 'POST',
      headers: getAnonHeaders(),
      body: JSON.stringify(payload),
    }).catch(() => null)

    if (apiResponse?.ok) {
      return true
    }

    if (apiResponse && !shouldFallback(apiResponse)) {
      throw new Error(await getResponseError(apiResponse, 'Erro ao solicitar reset de senha.'))
    }

    const supabaseResponse = await fetch(`${apiConfig.supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: getAnonHeaders(),
      body: JSON.stringify(payload),
    })

    if (!supabaseResponse.ok) {
      throw new Error(await getResponseError(supabaseResponse, 'Erro ao enviar link de recuperacao.'))
    }

    return true
  },

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

  async getUser() {
    const apiResponse = await fetch(`${apiConfig.functionsUrl.replace(/\/+$/, '')}/user-info`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
    }).catch(() => null)

    if (apiResponse?.ok) {
      return apiResponse.json()
    }

    if (apiResponse && !shouldFallback(apiResponse)) {
      throw new Error(await getResponseError(apiResponse, 'Erro ao resgatar perfil de usuário.'))
    }

    const response = await fetch(`${apiConfig.supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: getAuthenticatedHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Erro ao resgatar perfil de usuário.'))
    }

    return response.json()
  },

  getSession() {
    return getAuthSession()
  },

  isAuthenticated() {
    return hasAuthenticatedSession()
  },

  async logout() {
    try {
      const apiResponse = await fetch(apiEndpoint('/logout'), {
        method: 'POST',
        headers: getAuthenticatedHeaders(),
      }).catch(() => null)

      if (apiResponse?.ok || (apiResponse && !shouldFallback(apiResponse))) return

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

function shouldFallback(response) {
  return [404, 405].includes(response.status)
}
