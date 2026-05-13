const env = import.meta.env ?? {}
const SUPABASE_URL = readEnv('VITE_SUPABASE_URL')
const SUPABASE_ANON_KEY = readEnv('VITE_SUPABASE_ANON_KEY')
const SUPABASE_FUNCTIONS_URL = readEnv('VITE_SUPABASE_FUNCTIONS_URL')
const SUPABASE_REST_URL = readEnv('VITE_SUPABASE_REST_URL')
const SUPABASE_STORAGE_URL = readEnv('VITE_SUPABASE_STORAGE_URL')
const API_BASE_URL = readEnv('VITE_API_BASE_URL')

const AUTH_SESSION_KEY = 'mediconnect.auth.session'
export const AUTH_SESSION_CHANGED_EVENT = 'mediconnect:auth-session-changed'

export const apiConfig = {
  apiUrl: API_BASE_URL || SUPABASE_FUNCTIONS_URL || joinUrl(SUPABASE_URL, '/functions/v1'),
  supabaseUrl: SUPABASE_URL,
  restUrl: SUPABASE_REST_URL || joinUrl(SUPABASE_URL, '/rest/v1'),
  functionsUrl: SUPABASE_FUNCTIONS_URL || joinUrl(SUPABASE_URL, '/functions/v1'),
  storageUrl: SUPABASE_STORAGE_URL || joinUrl(SUPABASE_URL, '/storage/v1'),
  anonKey: SUPABASE_ANON_KEY,
}

export function getMissingApiConfig() {
  return [
    ['VITE_SUPABASE_URL', apiConfig.supabaseUrl],
    ['VITE_SUPABASE_ANON_KEY', apiConfig.anonKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)
}

export function assertApiConfig() {
  const missing = getMissingApiConfig()

  if (missing.length) {
    throw new Error(
      `Configuração da API incompleta. Defina ${missing.join(' e ')} no ambiente.`,
    )
  }
}

export function apiEndpoint(path, baseUrl = apiConfig.apiUrl) {
  assertApiConfig()

  if (!baseUrl) {
    throw new Error('URL da API não configurada.')
  }

  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

export function getAuthSession() {
  if (typeof window === 'undefined') return null
  const rawSession = window.sessionStorage.getItem(AUTH_SESSION_KEY)
  if (!rawSession) return null

  try {
    return JSON.parse(rawSession)
  } catch {
    clearAuthSession()
    return null
  }
}

export function saveAuthSession(session) {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
    notifyAuthSessionChanged()
  }
}

export function clearAuthSession() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY)
    notifyAuthSessionChanged()
  }
}

export function hasAuthenticatedSession() {
  const session = getAuthSession()
  if (!session?.access_token) return false

  if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
    clearAuthSession()
    return false
  }

  return true
}

export function getAnonHeaders(extraHeaders = {}) {
  assertApiConfig()

  return cleanHeaders({
    apikey: apiConfig.anonKey,
    'Content-Type': 'application/json',
    ...extraHeaders,
  })
}

export function getAuthenticatedHeaders(extraHeaders = {}) {
  assertApiConfig()

  const session = getAuthSession()
  const accessToken = session?.access_token

  if (!accessToken) {
    throw new Error('Sessão expirada. Faça login novamente.')
  }

  return cleanHeaders({
    apikey: apiConfig.anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  })
}

function cleanHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value !== undefined && value !== null),
  )
}

function notifyAuthSessionChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT))
  }
}

function readEnv(name) {
  if (env[name]) return env[name]

  if (typeof process !== 'undefined' && process.env?.[name]) {
    return process.env[name]
  }

  return ''
}

function joinUrl(baseUrl, path) {
  if (!baseUrl) return ''
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}
