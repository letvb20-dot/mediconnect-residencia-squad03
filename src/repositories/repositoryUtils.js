export async function fetchJsonWithFallback(requests, fallbackMessage) {
  let lastResponse = null
  let lastError = null

  for (const request of requests) {
    let response

    try {
      response = await fetch(request.url, request.options)
      lastResponse = response
    } catch (error) {
      lastError = error
      continue
    }

    if (response.ok) {
      return parseJsonResponse(response)
    }

    if (!shouldFallback(response)) {
      throw new Error(await getResponseError(response, fallbackMessage))
    }
  }

  if (lastError && !lastResponse) {
    throw new Error(translateErrorMessage(lastError.message || fallbackMessage, fallbackMessage))
  }

  throw new Error(await getResponseError(lastResponse, fallbackMessage))
}

export function normalizeCollection(data, keys = []) {
  if (Array.isArray(data)) return data

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }

  return []
}

export function normalizeItem(data, keys = []) {
  if (Array.isArray(data)) return data[0] || null

  for (const key of keys) {
    if (data?.[key]) return data[key]
  }

  return data || null
}

export async function getResponseError(response, fallbackMessage = 'Erro inesperado.') {
  if (!response) return translateErrorMessage(fallbackMessage)

  const text = await response.text().catch(() => '')
  const error = parseErrorBody(text)
  const message = translateErrorMessage(
    getErrorMessage(error, text) || fallbackMessage,
    fallbackMessage,
  )

  return response.status ? `${fallbackMessage} (${response.status}): ${message}` : message
}

export function translateErrorMessage(message, fallbackMessage = 'Erro inesperado.') {
  const rawMessage = String(message || '').trim()
  const normalized = rawMessage.toLowerCase()

  if (!rawMessage) return fallbackMessage
  if (isPortugueseMessage(rawMessage)) return rawMessage

  const translations = [
    [/failed to fetch|networkerror|load failed|network request failed/, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'],
    [/fetch failed|failed sending request|connection refused|timeout|timed out/, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'],
    [/invalid login credentials|invalid credentials/, 'E-mail ou senha inválidos.'],
    [/signup requires a valid password|password should be at least|weak password|invalid password/, 'Informe uma senha válida para continuar.'],
    [/email rate limit exceeded|rate limit exceeded|too many requests|for security purposes.*request this after/, 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'],
    [/invalid email|email address.*invalid|unable to validate email address/, 'Informe um e-mail válido.'],
    [/email not confirmed/, 'E-mail ainda não confirmado. Verifique sua caixa de entrada.'],
    [/user already registered|already registered/, 'Este e-mail já está cadastrado.'],
    [/user not found/, 'Usuário não encontrado.'],
    [/signup.*disabled|signups not allowed|user signups are disabled/, 'O cadastro de novos usuários está desabilitado no momento.'],
    [/database error saving new user|database error.*user/, 'Não foi possível salvar o usuário. Tente novamente ou contate o suporte.'],
    [/database error|unexpected failure|internal server error|server error/, 'A API encontrou um erro interno. Tente novamente ou contate o suporte.'],
    [/jwt expired|invalid jwt|jwt malformed|invalid token|token is expired/, 'Sessão expirada. Faça login novamente.'],
    [/missing required parameters?/, 'Parâmetros obrigatórios não foram enviados.'],
    [/required field|field .* is required|required parameter|missing .* field/, 'Campo obrigatório não preenchido.'],
    [/duplicate key value violates unique constraint/, 'Já existe um registro com essas informações.'],
    [/new row violates row-level security policy|row-level security policy|permission denied|insufficient privileges|not authorized|unauthorized|forbidden/, 'Você não tem permissão para realizar esta ação.'],
    [/violates foreign key constraint/, 'Não foi possível salvar porque há um vínculo obrigatório ausente ou inválido.'],
    [/violates check constraint/, 'Os dados enviados não atendem às regras de validação.'],
    [/null value in column "([^"]+)".*violates not-null constraint/, 'Campo obrigatório não preenchido.'],
    [/invalid input value for enum ([^:]+): "([^"]+)"/, 'Valor inválido para uma opção do sistema.'],
    [/invalid input syntax for type uuid/, 'Identificador inválido enviado para a API.'],
    [/invalid input syntax for type (integer|bigint|numeric|date|timestamp|boolean)/, 'Valor inválido enviado para a API.'],
    [/value too long for type|too long/, 'Um dos campos excede o tamanho permitido.'],
    [/relation .* does not exist/, 'Recurso da API não encontrado.'],
    [/function .* does not exist/, 'Endpoint da API não encontrado.'],
    [/endpoint.*not found|not found/, 'Recurso da API não encontrado.'],
    [/cors|preflight/, 'A API bloqueou a requisição por configuração de CORS.'],
  ]

  for (const [pattern, translation] of translations) {
    if (pattern.test(normalized)) return translation
  }

  return isLikelyEnglishMessage(rawMessage) ? fallbackMessage : rawMessage
}

function getErrorMessage(error, text) {
  return error.error_description ||
    error.msg ||
    error.message ||
    error.error ||
    error.detail ||
    error.details ||
    error.hint ||
    formatFieldErrors(error.errors) ||
    text
}

function formatFieldErrors(errors) {
  if (!errors || typeof errors !== 'object') return ''

  const messages = Object.entries(errors)
    .flatMap(([field, fieldErrors]) => {
      const values = Array.isArray(fieldErrors) ? fieldErrors : [fieldErrors]
      return values.filter(Boolean).map((message) => `${field}: ${message}`)
    })

  return messages.join('; ')
}

function isPortugueseMessage(message) {
  return /[ãõáéíóúâêôç]/i.test(message) ||
    /\b(erro|falha|não|nao|usuário|usuario|senha|campo|obrigatório|obrigatorio|sessão|sessao)\b/i.test(message)
}

function isLikelyEnglishMessage(message) {
  return /[a-z]/i.test(message) && !/[ãõáéíóúâêôç]/i.test(message)
}

function shouldFallback(response) {
  return [404, 405].includes(response.status)
}

async function parseJsonResponse(response) {
  if (response.status === 204) return null

  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function parseErrorBody(text) {
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}
