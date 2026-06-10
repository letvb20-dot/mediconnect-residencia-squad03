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
  const technicalTranslation = translateTechnicalMessage(rawMessage)
  if (technicalTranslation) return technicalTranslation
  if (isPortugueseMessage(rawMessage)) return rawMessage

  const translations = [
    // Rede e conectividade
    [/failed to fetch|networkerror|load failed|network request failed/, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'],
    [/fetch failed|failed sending request|connection refused|timeout|timed out|aborted/, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'],
    [/too many connections|connection pool|pool exhausted/, 'O servidor está sobrecarregado. Tente novamente em alguns instantes.'],
    [/service.?unavailable/, 'Serviço temporariamente indisponível. Tente novamente em alguns instantes.'],

    // Autenticação e login
    [/invalid login credentials|invalid credentials/, 'E-mail ou senha inválidos.'],
    [/signup requires a valid password|password should be at least|weak password|invalid password/, 'Informe uma senha válida para continuar.'],
    [/new password should be different|same.*password/, 'A nova senha deve ser diferente da senha atual.'],
    [/password does not match|incorrect.*password/, 'Senha incorreta.'],
    [/email rate limit exceeded|rate limit exceeded|too many requests|for security purposes.*request this after/, 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'],
    [/invalid email|email address.*invalid|unable to validate email address/, 'Informe um e-mail válido.'],
    [/email not confirmed/, 'E-mail ainda não confirmado. Verifique sua caixa de entrada.'],
    [/email link.*invalid|email link.*expired|confirmation link.*expired/, 'O link de confirmação é inválido ou expirou. Solicite um novo.'],
    [/user already registered|already registered/, 'Este e-mail já está cadastrado.'],
    [/user not found/, 'Usuário não encontrado.'],
    [/account.*banned|user.*banned/, 'Esta conta foi suspensa. Entre em contato com o suporte.'],
    [/user.*locked|account.*locked/, 'Esta conta está bloqueada. Tente novamente mais tarde ou contate o suporte.'],
    [/signup.*disabled|signups not allowed|user signups are disabled/, 'O cadastro de novos usuários está desabilitado no momento.'],
    [/otp.*expired|otp.*invalid|invalid otp/, 'O código de verificação expirou ou é inválido. Solicite um novo.'],
    [/phone.*invalid|invalid.*phone/, 'Informe um número de telefone válido.'],
    [/sessions?.*revoked|all.*sessions/, 'Todas as sessões foram encerradas. Faça login novamente.'],

    // Sessão e token
    [/jwt expired|invalid jwt|jwt malformed|invalid token|token is expired|token.*invalid/, 'Sessão expirada. Faça login novamente.'],
    [/jwt secret|jwt.*invalid.*secret/, 'Erro de configuração do servidor. Contate o suporte.'],
    [/refresh token.*expired|refresh.*token.*invalid/, 'Sessão expirada. Faça login novamente.'],

    // Banco de dados e usuários
    [/database error saving new user|database error.*user/, 'Não foi possível salvar o usuário. Tente novamente ou contate o suporte.'],
    [/database error|unexpected failure|internal server error|server error/, 'A API encontrou um erro interno. Tente novamente ou contate o suporte.'],
    [/unable to process|could not process/, 'Não foi possível processar a solicitação. Tente novamente.'],

    // Validação de campos
    [/missing required parameters?/, 'Parâmetros obrigatórios não foram enviados.'],
    [/required field|field .* is required|required parameter|missing .* field/, 'Campo obrigatório não preenchido.'],
    [/duplicate key value violates unique constraint/, 'Já existe um registro com essas informações.'],
    [/unique.*violation|already exists.*unique/, 'Já existe um registro com essas informações.'],

    // Permissões e segurança (RLS)
    [/new row violates row-level security policy|row-level security policy|permission denied|insufficient privileges|not authorized|unauthorized|forbidden/, 'Você não tem permissão para realizar esta ação.'],
    [/permission denied for table/, 'Você não tem permissão para acessar este recurso.'],

    // Constraints do banco
    [/violates foreign key constraint/, 'Não foi possível salvar porque há um vínculo obrigatório ausente ou inválido.'],
    [/violates check constraint/, 'Os dados enviados não atendem às regras de validação.'],
    [/null value in column "([^"]+)".*violates not-null constraint/, 'Campo obrigatório não preenchido.'],

    // Tipos e valores inválidos
    [/invalid input value for enum ([^:]+): "([^"]+)"/, 'Valor inválido para uma opção do sistema.'],
    [/invalid input syntax for type uuid/, 'Identificador inválido enviado para a API.'],
    [/invalid input syntax for type (integer|bigint|numeric|date|timestamp|boolean)/, 'Valor inválido enviado para a API.'],
    [/value too long for type|too long/, 'Um dos campos excede o tamanho permitido.'],
    [/out of range|value.*overflow/, 'O valor informado está fora do intervalo permitido.'],

    // PostgREST (PGRST)
    [/relation .* does not exist/, 'Recurso da API não encontrado.'],
    [/function .* does not exist/, 'Endpoint da API não encontrado.'],
    [/column .* does not exist/, 'Campo não reconhecido pela API.'],
    [/could not find a relationship|no relationship found/, 'Erro de configuração da API. Contate o suporte.'],
    [/operator does not exist/, 'Filtro inválido enviado para a API.'],
    [/schema .* not found/, 'Recurso da API não encontrado.'],
    [/no api key found|missing api key|apikey.*required/, 'Chave de acesso à API não encontrada. Recarregue a página.'],
    [/pgrst\d+/, 'Erro na comunicação com a API. Tente novamente.'],

    // Storage (avatares e anexos)
    [/bucket not found|bucket.*does not exist/, 'Armazenamento não encontrado. Contate o suporte.'],
    [/object not found|file not found|resource not found/, 'Arquivo não encontrado.'],
    [/resource already exists|object already exists/, 'Este arquivo já existe.'],
    [/mime type.*not allowed|invalid.*mime|file type.*not allowed/, 'Tipo de arquivo não permitido.'],
    [/payload too large|file.*too large|request entity too large|exceeds.*size/, 'O arquivo excede o tamanho máximo permitido.'],
    [/storage error/, 'Erro no armazenamento de arquivos. Tente novamente.'],

    // Edge Functions
    [/function.*invocation.*timeout|function.*timeout|execution.*timeout/, 'A operação demorou demais. Tente novamente.'],
    [/boot error|worker error|function.*boot/, 'Erro interno da API. Tente novamente ou contate o suporte.'],

    // Genéricos
    [/endpoint.*not found|not found/, 'Recurso da API não encontrado.'],
    [/cors|preflight/, 'A API bloqueou a requisição por configuração de CORS.'],
    [/conflict/, 'Conflito ao salvar os dados. Verifique e tente novamente.'],
    [/bad gateway|gateway timeout/, 'O servidor está temporariamente inacessível. Tente novamente.'],
  ]

  for (const [pattern, translation] of translations) {
    if (pattern.test(normalized)) return translation
  }

  return isLikelyEnglishMessage(rawMessage) ? fallbackMessage : rawMessage
}

function translateTechnicalMessage(message) {
  if (/patients_cpf_key|duplicate key value violates unique constraint ["']?patients_cpf_key["']?|unique constraint ["']?patients_cpf_key["']?/i.test(message)) {
    return 'Já existe um paciente cadastrado com este CPF.'
  }

  if (/doctors?_crm|crm.*unique|unique.*crm/i.test(message)) {
    return 'Já existe um médico cadastrado com este CRM nesta UF.'
  }

  if (/duplicate.*email|email.*exist|email.*registrado|users?_email|email_key/i.test(message)) {
    return 'Este e-mail já está cadastrado no sistema.'
  }

  if (/duplicate.*cpf|cpf.*exist|cpf.*registrado/i.test(message)) {
    return 'Este CPF já está cadastrado no sistema.'
  }

  if (/password|senha.*curta|weak.*password|short.*password/i.test(message)) {
    return 'A senha precisa ter no mínimo 8 caracteres.'
  }

  return ''
}

function getErrorMessage(error, text) {
  const problemDetails = formatProblemDetails(error)

  return error.error_description ||
    error.msg ||
    error.message ||
    error.error ||
    problemDetails ||
    error.detail ||
    error.details ||
    error.hint ||
    formatFieldErrors(error.errors) ||
    formatFieldErrors(error.invalid_params) ||
    text
}

function formatProblemDetails(error) {
  if (!error || typeof error !== 'object') return ''

  const parts = [
    typeof error.title === 'string' ? error.title : '',
    typeof error.detail === 'string' ? error.detail : '',
    formatFieldErrors(error.errors),
    formatFieldErrors(error.invalid_params),
    typeof error.instance === 'string' ? error.instance : '',
  ].filter(Boolean)

  return parts.join(' - ')
}

function formatFieldErrors(errors) {
  if (!errors || typeof errors !== 'object') return ''

  if (Array.isArray(errors)) {
    return errors
      .map((error) => {
        if (typeof error === 'string') return error
        return [error.name || error.field || error.param, error.reason || error.message || error.detail]
          .filter(Boolean)
          .join(': ')
      })
      .filter(Boolean)
      .join('; ')
  }

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
