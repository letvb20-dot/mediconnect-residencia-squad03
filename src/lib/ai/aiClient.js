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

  // Conversa do chatbot. Retorna { text, route?, action?, appointmentData? }.
  async chat({ messages = [], role, data = {} } = {}) {
    const local = runChatEngine({ messages, role, data })

    if (local.matched || !API_KEY) return local

    try {
      const system =
        `Você é o assistente do MediConnect, um sistema de gestão de clínica.\n` +
        `O usuário tem o perfil "${role}". Responda em português do Brasil, de forma curta e objetiva.\n` +
        `Use estes dados de contexto quando úteis: ${JSON.stringify(data).slice(0, 4000)}.\n` +
        `Não invente dados que não estejam no contexto.\n\n` +
        `Sua resposta deve ser obrigatoriamente um JSON válido contendo as seguintes chaves:\n` +
        `- "text": A resposta de texto curta e amigável para o usuário.\n` +
        `- "action": Uma string indicando uma ação a ser realizada, ou null. Ação suportada: "confirm_appointment" (somente quando todos os dados obrigatórios para agendamento estiverem preenchidos e forem válidos).\n` +
        `- "appointmentData": Um objeto com os dados da consulta ou null. Se action for "confirm_appointment", este objeto deve conter: "patientId" (string), "doctorId" (string), "scheduledAt" (data/hora ISO string formatada no fuso local/UTC YYYY-MM-DDTHH:mm:ss).\n\n` +
        `Regras importantes:\n` +
        `1. Se o perfil do usuário for 'paciente', o patientId do agendamento deve ser obrigatoriamente o ID do próprio paciente (fornecido em data.patients[0].id). Se ele tentar agendar para outra pessoa, informe no "text" que ele só pode agendar consultas para si mesmo.\n` +
        `2. Se o usuário pedir para agendar mas faltar alguma informação (como médico, paciente, data ou hora), ou se a informação for ambígua, peça os dados restantes no campo "text", deixe "action" como null e "appointmentData" como null.\n` +
        `3. Se houver mais de um paciente ou médico com o mesmo nome na pesquisa, peça para o usuário especificar.\n\n` +
        `Exemplo de resposta de confirmação de agendamento:\n` +
        `{\n` +
        `  "text": "Perfeito! Posso agendar a consulta de João Silva com o Dr. Pedro para amanhã às 14:00. Deseja confirmar?",\n` +
        `  "action": "confirm_appointment",\n` +
        `  "appointmentData": {\n` +
        `    "patientId": "p-1",\n` +
        `    "doctorId": "d-2",\n` +
        `    "scheduledAt": "2026-06-10T14:00:00"\n` +
        `  }\n` +
        `}`
      const text = await callGemini({ system, messages, responseMimeType: 'application/json' })
      const parsed = safeParseJson(text) || {}
      return {
        text: parsed.text || text,
        route: local.route,
        action: parsed.action || null,
        appointmentData: parsed.appointmentData || null,
      }
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

  // Extrai dados estruturados a partir de um áudio + descrição dos campos.
  // schema: [{ name, label, type?: 'text'|'number'|'date'|'enum', options?: string[], example? }]
  // Retorna um objeto { campo: valor } só com os campos que o Gemini conseguiu inferir.
  async extractFormFromAudio({ blob, mimeType, schema = [], hint = '' } = {}) {
    if (!API_KEY) throw new Error('Preenchimento por voz indisponível: VITE_GEMINI_API_KEY não configurada.')
    if (!blob) throw new Error('Áudio vazio.')
    if (!Array.isArray(schema) || schema.length === 0) throw new Error('Schema do formulário vazio.')

    const base64 = await blobToBase64(blob)
    const effectiveMime = mimeType || blob.type || 'audio/webm'

    const schemaDescription = schema.map((field) => {
      const parts = [`- name: ${field.name}`, `  label: ${field.label}`]
      if (field.type) parts.push(`  type: ${field.type}`)
      if (Array.isArray(field.options) && field.options.length) {
        parts.push(`  options: [${field.options.join(', ')}]`)
      }
      if (field.example) parts.push(`  example: ${field.example}`)
      return parts.join('\n')
    }).join('\n')

    const system =
      'Você recebe um áudio em português do Brasil onde um operador dita os dados de um formulário.\n' +
      'Sua tarefa é extrair APENAS os campos que foram realmente mencionados e devolver um JSON.\n' +
      'Regras estritas:\n' +
      '1. Devolva SOMENTE JSON válido, sem markdown e sem comentários.\n' +
      '2. As chaves devem ser exatamente os "name" listados no schema.\n' +
      '3. Não invente valores. Se um campo não foi mencionado, omita a chave.\n' +
      '4. Para campos do tipo "enum", escolha o valor mais próximo da lista de options. Se nenhum servir, omita.\n' +
      '5. Para "date", devolva no formato YYYY-MM-DD.\n' +
      '6. Para "number", devolva apenas dígitos (números ou números com vírgula decimal).\n' +
      '7. Preserve acentuação natural dos nomes próprios.\n' +
      (hint ? `Contexto adicional: ${hint}\n` : '') +
      'Schema dos campos disponíveis:\n' +
      schemaDescription

    const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{
          role: 'user',
          parts: [
            { text: 'Extraia os campos preenchidos a partir deste áudio. Devolva apenas o JSON.' },
            { inlineData: { mimeType: effectiveMime, data: base64 } },
          ],
        }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Falha na extração por voz (${response.status}): ${detail.slice(0, 200)}`)
    }

    const payload = await response.json()
    const parts = payload?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts) ? parts.map((part) => part.text || '').join('').trim() : ''
    const parsed = safeParseJson(text)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Resposta da IA não veio em JSON válido.')
    }
    return parsed
  },

  // Transcreve áudio (Blob) usando o Gemini. Cross-browser, não depende da Web Speech API.
  async transcribeAudio({ blob, mimeType } = {}) {
    if (!API_KEY) throw new Error('Reconhecimento de voz indisponível: VITE_GEMINI_API_KEY não configurada.')
    if (!blob) throw new Error('Áudio vazio.')

    const base64 = await blobToBase64(blob)
    const effectiveMime = mimeType || blob.type || 'audio/webm'

    const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text:
              'Você é um transcritor. Receba um áudio curto em português do Brasil e devolva APENAS o texto literal falado, sem pontuação extra, sem comentários e sem aspas. Se não houver fala audível, devolva uma string vazia.',
          }],
        },
        contents: [{
          role: 'user',
          parts: [
            { text: 'Transcreva exatamente o que foi falado.' },
            { inlineData: { mimeType: effectiveMime, data: base64 } },
          ],
        }],
        generationConfig: { maxOutputTokens: 256, temperature: 0 },
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Falha na transcrição (${response.status}): ${detail.slice(0, 200)}`)
    }

    const payload = await response.json()
    const parts = payload?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts) ? parts.map((part) => part.text || '').join('').trim() : ''
    return text
  },

  // Transcreve áudios mais longos (consultas inteiras). Usa maxOutputTokens maior e
  // pede pontuação/parágrafos para o texto ficar pronto para alimentar generateReport.
  async transcribeLongAudio({ blob, mimeType } = {}) {
    if (!API_KEY) throw new Error('Transcrição indisponível: VITE_GEMINI_API_KEY não configurada.')
    if (!blob) throw new Error('Áudio vazio.')

    const base64 = await blobToBase64(blob)
    const effectiveMime = mimeType || blob.type || 'audio/webm'

    const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text:
              'Você é um transcritor de consultas médicas em português do Brasil. ' +
              'Devolva APENAS o texto literal falado, com pontuação natural e quebras de parágrafo onde fizer sentido. ' +
              'Não resuma, não adicione comentários, não use markdown e não rotule falantes. ' +
              'Se houver trechos inaudíveis, marque-os como [inaudível]. ' +
              'Se não houver fala audível, devolva uma string vazia.',
          }],
        },
        contents: [{
          role: 'user',
          parts: [
            { text: 'Transcreva literalmente o áudio desta consulta.' },
            { inlineData: { mimeType: effectiveMime, data: base64 } },
          ],
        }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0 },
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Falha na transcrição (${response.status}): ${detail.slice(0, 200)}`)
    }

    const payload = await response.json()
    const parts = payload?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts) ? parts.map((part) => part.text || '').join('').trim() : ''
    return text
  },

  // Normaliza um transcrito curto para um campo tipado (date/enum). Não tenta engenheirar
  // texto livre — usa Gemini só pra casos onde regex local não resolve.
  async normalizeViaGemini({ transcript, field } = {}) {
    if (!API_KEY) return transcript
    if (!transcript || !field) return transcript

    let instruction
    if (field.type === 'date') {
      instruction =
        'Converta a frase em português para uma data no formato ISO YYYY-MM-DD. ' +
        'Devolva APENAS a data, sem texto adicional. Se for impossível identificar uma data, devolva uma string vazia.'
    } else if (field.type === 'enum') {
      const options = Array.isArray(field.options) ? field.options : []
      instruction =
        'Escolha o item da lista que melhor representa a frase falada. Devolva APENAS o item escolhido, exatamente como aparece na lista. ' +
        `Se nenhum item servir, devolva uma string vazia. Lista: ${JSON.stringify(options)}.`
    } else {
      return transcript
    }

    try {
      const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(API_KEY)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: instruction }] },
          contents: [{ role: 'user', parts: [{ text: transcript }] }],
          generationConfig: { maxOutputTokens: 64, temperature: 0 },
        }),
      })
      if (!response.ok) return transcript
      const payload = await response.json()
      const parts = payload?.candidates?.[0]?.content?.parts
      const text = Array.isArray(parts) ? parts.map((part) => part.text || '').join('').trim() : ''
      return text || transcript
    } catch {
      return transcript
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

async function callGemini({ system, messages, responseMimeType }) {
  const generationConfig = { maxOutputTokens: 1024 }
  if (responseMimeType) {
    generationConfig.responseMimeType = responseMimeType
  }

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
      generationConfig,
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
  const processEnv = typeof process !== 'undefined' ? process.env : {}
  return env[name] || processEnv[name] || ''
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler áudio.'))
    reader.readAsDataURL(blob)
  })
}
