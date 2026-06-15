import { normalizeRole } from '../../../config/permissions.js'
import { profileRepository } from '../../../repositories/profileRepository.js'
import { getToolsForRole } from './tools/index.js'
import { agentGenerate, getProvider } from './providers.js'

// Loop de orquestração do agente, AGNÓSTICO de provider: trabalha com um
// histórico neutro e chama agentGenerate(), que despacha para Gemini ou OpenAI
// (ver providers.js). O Gemini não tem estado — o loop (receber -> escolher
// ferramenta -> executar -> devolver resultado -> repetir) é nosso.
//
// Escrita: tools com requiresConfirmation só rodam após onConfirm() retornar
// true (o widget mostra o ConfirmationCard). Sem onConfirm, a escrita é
// recusada (fail-closed) — nada muta sem confirmação.
//
// Resiliência:
//   - PROATIVO: throttle com intervalo mínimo entre chamadas (só no Gemini, que
//     tem RPM baixo no free tier). Configurável via VITE_GEMINI_MIN_INTERVAL_MS.
//   - REATIVO: retry com backoff em erros transitórios (503/500/529/429/rede).
//   Ambos envolvem APENAS a chamada ao modelo — nunca o execute() de uma tool.
const MAX_TURNS = 8
const RETRY_DELAYS_MS = [800, 2000] // nº de tentativas extras = tamanho do array
const MIN_GEMINI_INTERVAL_MS = readMinInterval()
let lastGeminiCallAt = 0

export async function runAgent({ system, messages = [], tools = [], ctx = {}, onStep, onConfirm } = {}) {
  const declarations = tools.map((tool) => tool.declaration)
  const toolMap = Object.fromEntries(tools.map((tool) => [tool.declaration.name, tool]))

  // Histórico neutro inicial: só as mensagens user/assistant da conversa.
  const history = messages.map((message) => ({
    role: message.role === 'assistant' || message.role === 'model' ? 'assistant' : 'user',
    text: String(message.content || message.text || ''),
  }))
  const steps = []

  const recordStep = (step) => {
    steps.push(step)
    if (onStep) onStep(step)
  }

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    let text
    let functionCalls
    try {
      ;({ text, functionCalls } = await callModelWithRetry({ system, history, tools: declarations }, recordStep))
    } catch (error) {
      // Falha da própria API do modelo (mesmo após os retries). Mensagem legível.
      return { text: describeApiError(error), route: null, steps }
    }

    // Texto puro = o modelo decidiu que já tem o suficiente. Fim.
    if (!functionCalls.length) {
      return { text: text || 'Não consegui formular uma resposta.', route: null, steps }
    }

    // Se o modelo narrou algo junto com a decisão de chamar a ferramenta, expõe.
    if (text) recordStep({ kind: 'thought', text })

    // Registra a decisão do modelo no histórico neutro.
    history.push({ role: 'assistant', text, toolCalls: functionCalls })

    // Executa cada ferramenta pedida e coleta os resultados.
    const results = []
    let sessionError = null
    for (const call of functionCalls) {
      const tool = toolMap[call.name]
      recordStep({
        kind: 'call',
        tool: call.name,
        label: tool?.runningLabel || 'Processando…',
        args: call.args || {},
      })

      let result
      if (!tool) {
        result = { error: `Ferramenta desconhecida: ${call.name}` }
      } else if (tool.requiresConfirmation) {
        // Escrita: pausa para confirmação do usuário antes de mutar.
        result = await runWithConfirmation(tool, call.args || {}, ctx, onConfirm, recordStep)
      } else {
        try {
          result = await tool.execute(call.args || {}, ctx)
        } catch (error) {
          result = { error: error?.message || 'Falha ao executar a ferramenta.' }
        }
      }

      const erroMsg = result && (result.error || result.erro)
      if (erroMsg && isSessionError(erroMsg)) {
        sessionError = erroMsg
      }

      recordStep({ kind: 'result', tool: call.name, summary: describeResult(result) })
      results.push({ id: call.id, name: call.name, result })
    }

    history.push({ role: 'toolResults', results })

    if (sessionError) {
      return {
        text:
          'Sua sessão expirou ou não consegui acessar os dados do sistema. ' +
          'Faça login novamente e tente outra vez.',
        route: null,
        steps,
      }
    }
  }

  return {
    text: 'Não consegui concluir a operação dentro do limite de passos. Tente reformular o pedido.',
    route: null,
    steps,
  }
}

// Chama o modelo com throttle (antes) + retry/backoff (em transitórios). Erros
// definitivos (400/401/403/404) falham na hora — retry não ajudaria.
async function callModelWithRetry(params, recordStep) {
  let lastError
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    await throttle()
    try {
      return await agentGenerate(params)
    } catch (error) {
      lastError = error
      const podeRetentar = attempt < RETRY_DELAYS_MS.length && isTransientError(error)
      if (!podeRetentar) throw error
      const espera = RETRY_DELAYS_MS[attempt] + Math.floor(Math.random() * 400)
      recordStep({ kind: 'retry', attempt: attempt + 1, waitMs: espera })
      await sleep(espera)
    }
  }
  throw lastError
}

// Espaça as chamadas em pelo menos MIN_GEMINI_INTERVAL_MS. Só no Gemini — a
// OpenAI tem RPM alto e não precisa de throttle.
async function throttle() {
  if (getProvider() === 'openai') return
  if (MIN_GEMINI_INTERVAL_MS <= 0) return
  const wait = lastGeminiCallAt + MIN_GEMINI_INTERVAL_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastGeminiCallAt = Date.now()
}

function readMinInterval() {
  const env = import.meta.env ?? {}
  const raw = Number(env.VITE_GEMINI_MIN_INTERVAL_MS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 3000
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Transitório = vale repetir. Cobre sobrecarga (503/500/529), rate limit (429),
// timeouts (408/504) e rede (sem status). Definitivos NÃO são retentados.
function isTransientError(error) {
  const message = String(error?.message || '')
  if (/\((?:400|401|403|404)\)/.test(message)) return false
  if (/\((?:408|429|500|502|503|504|529)\)/.test(message)) return true
  if (/RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|deadline|timeout/i.test(message)) return true
  if (!/\(\d{3}\)/.test(message)) return true
  return false
}

// Executa uma tool de escrita atrás do card de confirmação.
async function runWithConfirmation(tool, args, ctx, onConfirm, recordStep) {
  if (!onConfirm) {
    return { erro: 'Confirmação indisponível nesta interface — ação não executada.' }
  }
  let resumo
  try {
    resumo = tool.summarize ? tool.summarize(args, ctx) : `Confirmar ${tool.declaration.name}?`
  } catch {
    resumo = `Confirmar ${tool.declaration.name}?`
  }
  recordStep({ kind: 'confirm', tool: tool.declaration.name, resumo })

  let aceito = false
  try {
    aceito = await onConfirm({ tool: tool.declaration.name, label: tool.runningLabel, args, resumo })
  } catch {
    aceito = false
  }
  if (!aceito) {
    return { recusado: true, mensagem: 'O usuário recusou a ação. Nada foi alterado.' }
  }

  try {
    return await tool.execute(args, ctx)
  } catch (error) {
    return { error: error?.message || 'Falha ao executar a ferramenta.' }
  }
}

// Conveniência usada pelo widget: monta ctx (perfil/escopo), ferramentas por
// papel e o system prompt, e dispara o loop.
export async function runAssistant({ messages = [], role, onStep, onConfirm } = {}) {
  const normalizedRole = normalizeRole(role) || 'paciente'
  const profile = await profileRepository.getCurrentUserProfile().catch(() => null)

  const ctx = {
    role: normalizedRole,
    currentDoctorId: profile?.doctorId || '',
    currentPatientId: profile?.patientId || '',
    profile,
  }

  const tools = getToolsForRole(normalizedRole)
  const today = formatToday()

  const system =
    `Você é o assistente operacional do MediConnect, um sistema de gestão de clínica médica.\n` +
    `O usuário tem o perfil "${normalizedRole}". Hoje é ${today}.\n` +
    `Use as ferramentas disponíveis para consultar dados reais antes de responder — nunca invente números, nomes ou datas.\n` +
    `Para agir (agendar, cancelar, remarcar, cadastrar, editar, remover...), primeiro resolva os ids pelas ferramentas de busca; ` +
    `as ações que alteram dados pedem confirmação do usuário automaticamente antes de executar.\n` +
    `Quando o usuário falar em "hoje", "amanhã" etc., converta para a data ISO (AAAA-MM-DD) com base em hoje (${today}).\n` +
    `Responda em português do Brasil, de forma objetiva, clara e bem formatada.\n` +
    `TOM: caloroso, simpático e prestativo — você atende a equipe da clínica (médicos, secretárias, gestores), ` +
    `então fale de um jeito humano e acolhedor, nunca robótico ou formal demais. Retribua cumprimentos com simpatia, ` +
    `reconheça brevemente o pedido e, ao final, ofereça ajuda com algo mais quando fizer sentido. Um emoji ocasional e ` +
    `discreto é bem-vindo quando combinar (ex.: ✅ numa confirmação), sem exagero. Continue sempre objetivo e preciso.\n` +
    `FORMATAÇÃO (proativa, sem o usuário precisar pedir): suas respostas são renderizadas em Markdown, ` +
    `então formate-as para ficarem visuais e fáceis de ler. Use **negrito** para destacar valores-chave ` +
    `(nomes, datas, horários, totais, status); listas com marcadores ("- ") quando houver vários itens; ` +
    `e TABELAS Markdown quando os dados tiverem colunas naturais (ex.: várias consultas com colunas ` +
    `Data | Hora | Paciente | Profissional | Status). Prefira tabela/lista a um parágrafo corrido ao apresentar 2+ ` +
    `registros. Não exagere: uma resposta de uma linha pode ser texto simples; evite títulos grandes e blocos de ` +
    `código para texto comum. Nunca escreva a palavra "markdown" nem mostre a sintaxe crua.`

  return runAgent({ system, messages, tools, ctx, onStep, onConfirm })
}

// Resumo curto e genérico do resultado de uma ferramenta, para o trace.
function describeResult(result) {
  if (result && result.recusado) return 'recusado pelo usuário'
  if (result && (result.error || result.erro)) return `erro: ${result.error || result.erro}`
  if (result && result.ok) return 'concluído'
  if (result && typeof result.total === 'number') return `${result.total} resultado(s)`
  if (Array.isArray(result)) return `${result.length} item(ns)`
  return 'concluído'
}

// Mensagem legível para falhas da PRÓPRIA API do modelo, após os retries.
function describeApiError(error) {
  const message = String(error?.message || '')
  if (/\((?:429)\)/.test(message) || /RESOURCE_EXHAUSTED/i.test(message)) {
    return 'O limite de requisições da IA foi atingido por enquanto. Aguarde alguns instantes e tente novamente.'
  }
  if (/\((?:500|502|503|504|529)\)/.test(message) || /UNAVAILABLE|overloaded/i.test(message)) {
    return 'A IA está sobrecarregada no momento (tentei algumas vezes sem sucesso). Tente novamente em instantes.'
  }
  if (/\((?:401|403)\)/.test(message)) {
    return 'Não consegui autenticar na IA. Verifique a chave configurada (VITE_OPENAI_API_KEY ou VITE_GEMINI_API_KEY).'
  }
  return 'Tive um problema para falar com a IA agora. Tente novamente em instantes.'
}

// Detecta erro de sessão/autenticação vindo da camada de dados (repositórios),
// como o 401 "Sessão expirada. Faça login novamente." do Supabase.
function isSessionError(message) {
  const text = String(message || '').toLowerCase()
  return (
    text.includes('(401)') ||
    text.includes('(403)') ||
    text.includes('sessão') ||
    text.includes('sessao') ||
    text.includes('expirad') ||
    text.includes('faça login') ||
    text.includes('faca login')
  )
}

function formatToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
