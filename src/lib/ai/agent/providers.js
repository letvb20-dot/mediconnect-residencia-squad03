import { geminiGenerateContent } from '../aiClient.js'

// =============================================================================
// Camada de provider do agente. O loop (runAgent) é agnóstico: trabalha com um
// histórico NEUTRO e chama agentGenerate(), que despacha para o Gemini ou para
// a OpenAI conforme VITE_AI_PROVIDER. Cada adaptador converte o histórico
// neutro para o formato do seu provider e normaliza a resposta para
// { text, functionCalls: [{ id, name, args }] }.
//
// Histórico neutro (turnos):
//   { role: 'user', text }
//   { role: 'assistant', text, toolCalls: [{ id, name, args }] }
//   { role: 'toolResults', results: [{ id, name, result }] }
// =============================================================================

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-nano'

export function getProvider() {
  return (readEnv('VITE_AI_PROVIDER') || 'gemini').toLowerCase()
}

// O agente está "ligado" se a chave do provider ativo existe.
export function agentIsLive() {
  return getProvider() === 'openai'
    ? Boolean(readEnv('VITE_OPENAI_API_KEY'))
    : Boolean(readEnv('VITE_GEMINI_API_KEY'))
}

// Gera a próxima resposta do modelo a partir do histórico neutro.
export async function agentGenerate({ system, history = [], tools = [] }) {
  if (getProvider() === 'openai') {
    return openaiGenerateContent({ system, messages: toOpenAIMessages(history), tools })
  }
  const contents = toGeminiContents(history)
  const { text, functionCalls } = await geminiGenerateContent({ system, contents, tools })
  // Gemini não devolve id de chamada — sintetizamos um (único dentro do turno).
  return {
    text,
    functionCalls: (functionCalls || []).map((call, index) => ({
      id: `g_${index}_${call.name}`,
      name: call.name,
      args: call.args || {},
    })),
  }
}

// --- OpenAI (Chat Completions) ---------------------------------------------

async function openaiGenerateContent({ system, messages, tools }) {
  const apiKey = readEnv('VITE_OPENAI_API_KEY')
  if (!apiKey) throw new Error('Chave da OpenAI ausente (VITE_OPENAI_API_KEY) — agente indisponível.')
  const model = readEnv('VITE_OPENAI_MODEL') || DEFAULT_OPENAI_MODEL

  const body = {
    model,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
  }
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools.map((declaration) => ({ type: 'function', function: declaration }))
    body.tool_choice = 'auto'
  }

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Falha na chamada à API da OpenAI (${response.status}). ${detail.slice(0, 200)}`)
  }

  const payload = await response.json()
  const message = payload?.choices?.[0]?.message || {}
  const text = typeof message.content === 'string' ? message.content.trim() : ''
  const functionCalls = (message.tool_calls || [])
    .filter((call) => call?.function?.name)
    .map((call) => ({
      id: call.id,
      name: call.function.name,
      args: safeParseArgs(call.function.arguments),
    }))
  return { text, functionCalls }
}

function safeParseArgs(raw) {
  if (!raw || typeof raw !== 'string') return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

// --- Conversão de histórico neutro -> formato do provider -------------------

function toOpenAIMessages(history) {
  const out = []
  for (const turn of history) {
    if (turn.role === 'user') {
      out.push({ role: 'user', content: turn.text || '' })
    } else if (turn.role === 'assistant') {
      const message = { role: 'assistant', content: turn.text || '' }
      if (turn.toolCalls?.length) {
        message.tool_calls = turn.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.args || {}) },
        }))
      }
      out.push(message)
    } else if (turn.role === 'toolResults') {
      for (const result of turn.results || []) {
        out.push({ role: 'tool', tool_call_id: result.id, content: JSON.stringify(result.result ?? {}) })
      }
    }
  }
  return out
}

function toGeminiContents(history) {
  const out = []
  for (const turn of history) {
    if (turn.role === 'user') {
      out.push({ role: 'user', parts: [{ text: turn.text || '' }] })
    } else if (turn.role === 'assistant') {
      const parts = []
      if (turn.text) parts.push({ text: turn.text })
      for (const call of turn.toolCalls || []) {
        parts.push({ functionCall: { name: call.name, args: call.args || {} } })
      }
      if (!parts.length) parts.push({ text: '' })
      out.push({ role: 'model', parts })
    } else if (turn.role === 'toolResults') {
      out.push({
        role: 'user',
        parts: (turn.results || []).map((result) => ({
          functionResponse: { name: result.name, response: { result: result.result } },
        })),
      })
    }
  }
  return out
}

function readEnv(name) {
  const env = import.meta.env ?? {}
  const processEnv = typeof process !== 'undefined' ? process.env : {}
  return env[name] || processEnv[name] || ''
}
