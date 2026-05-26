import { runChatEngine } from './chatEngine.js'
import { buildReportDraft } from './reportGenerator.js'
import { predictCancellations as predictLocal, rankWaitlistForSlot } from './waitlistEngine.js'

// Camada de abstração de IA.
// Se houver VITE_GEMINI_API_KEY, usa a API do Google Gemini direto do navegador.
// Caso contrário, usa os motores heurísticos locais (padrão atual).

const API_KEY = readEnv('VITE_GEMINI_API_KEY')
const MODEL = readEnv('VITE_GEMINI_MODEL') || 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

export const aiClient = {
  isLive() {
    return Boolean(API_KEY)
  },

  // Conversa do chatbot. Retorna { text, route? }.
  async chat({ messages = [], role, data = {} } = {}) {
    const local = runChatEngine({ messages, role, data })

    if (!API_KEY) return local

    try {
      const system =
        `Você é o assistente do MediConnect, um sistema de gestão de clínica. ` +
        `O usuário tem o perfil "${role}". Responda em português do Brasil, de forma curta e objetiva. ` +
        `Use estes dados de contexto quando úteis: ${JSON.stringify(data).slice(0, 4000)}. ` +
        `Não invente dados que não estejam no contexto.`
      const text = await callGemini({ system, messages })
      return { text, route: local.route }
    } catch {
      return local
    }
  },

  // Geração de laudo. Retorna { exam, cidCode, diagnosis, conclusion, contentHtml }.
  async generateReport(context = {}) {
    const local = buildReportDraft(context)

    if (!API_KEY) return local

    try {
      const system =
        `Você gera rascunhos de laudos médicos em português do Brasil. ` +
        `Responda SOMENTE com um JSON válido com as chaves: exam, cidCode, diagnosis, conclusion. ` +
        `Seja clínico, conservador e deixe claro que é um rascunho a ser revisado pelo médico.`
      const prompt =
        `Paciente: ${context.patientName || 'não informado'}. ` +
        `Exame/modelo: ${context.exam || context.templateTitle || 'consulta'}. ` +
        `Queixa/observações: ${context.complaint || 'não informado'}.`
      const text = await callGemini({ system, messages: [{ role: 'user', content: prompt }] })
      const parsed = safeParseJson(text)
      if (parsed && parsed.diagnosis) {
        return { ...local, ...parsed }
      }
      return local
    } catch {
      return local
    }
  },

  // Ranqueia a lista de espera para um horário liberado. Síncrono local (sem custo).
  rankWaitlist({ waitlist = [], slot = {} } = {}) {
    return rankWaitlistForSlot({ waitlist, slot })
  },

  // Predição heurística de cancelamentos. Síncrono local.
  predictCancellations({ appointments = [] } = {}) {
    return predictLocal({ appointments })
  },
}

async function callGemini({ system, messages }) {
  const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(API_KEY)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: messages.map((message) => ({
        role: message.role === 'assistant' || message.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(message.content || message.text || '') }],
      })),
      generationConfig: { maxOutputTokens: 1024 },
    }),
  })

  if (!response.ok) throw new Error('Falha na chamada à API do Gemini.')

  const payload = await response.json()
  const parts = payload?.candidates?.[0]?.content?.parts
  const text = Array.isArray(parts) ? parts.map((part) => part.text || '').join('').trim() : ''
  if (!text) throw new Error('Resposta vazia da API.')
  return text
}

function safeParseJson(text) {
  try {
    const match = String(text || '').match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : null
  } catch {
    return null
  }
}

function readEnv(name) {
  const env = import.meta.env ?? {}
  return env[name] || ''
}
