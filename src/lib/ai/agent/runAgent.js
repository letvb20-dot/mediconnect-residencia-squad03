import { geminiGenerateContent } from '../aiClient.js'
import { normalizeRole } from '../../../config/permissions.js'
import { profileRepository } from '../../../repositories/profileRepository.js'
import { getToolsForRole } from './tools/index.js'

// Loop de orquestração do agente. O Gemini não tem estado: cada chamada é
// independente, então o loop (receber -> escolher ferramenta -> executar ->
// devolver resultado -> repetir) é nosso. Paramos quando o modelo devolve
// texto puro (sem functionCall) ou ao atingir MAX_TURNS (trava de segurança).
//
// Cada passo real do loop é registrado em `steps` e também emitido via onStep,
// para a UI conseguir expor o "raciocínio" do agente de forma transparente
// (sem inventar nada — é exatamente o que aconteceu).
const MAX_TURNS = 8

export async function runAgent({ system, messages = [], tools = [], ctx = {}, onStep } = {}) {
  const toolMap = Object.fromEntries(tools.map((tool) => [tool.declaration.name, tool]))
  const declarations = tools.map((tool) => tool.declaration)

  // Histórico inicial: só as mensagens user/assistant da conversa.
  const contents = messages.map(toContent)
  const steps = []

  const recordStep = (step) => {
    steps.push(step)
    if (onStep) onStep(step)
  }

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const { text, functionCalls } = await geminiGenerateContent({
      system,
      contents,
      tools: declarations,
    })

    // Texto puro = o modelo decidiu que já tem o suficiente. Fim.
    if (!functionCalls.length) {
      return { text: text || 'Não consegui formular uma resposta.', route: null, steps }
    }

    // Se o modelo narrou algo junto com a decisão de chamar a ferramenta,
    // isso é raciocínio genuíno dele — vale expor.
    if (text) recordStep({ kind: 'thought', text })

    // Registra a decisão do modelo no histórico.
    contents.push({
      role: 'model',
      parts: functionCalls.map((call) => ({ functionCall: { name: call.name, args: call.args } })),
    })

    // Executa cada ferramenta pedida e devolve o resultado ao modelo.
    const responseParts = []
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
      } else {
        try {
          result = await tool.execute(call.args || {}, ctx)
        } catch (error) {
          result = { error: error?.message || 'Falha ao executar a ferramenta.' }
        }
      }

      recordStep({ kind: 'result', tool: call.name, summary: describeResult(result) })
      responseParts.push({ functionResponse: { name: call.name, response: { result } } })
    }

    contents.push({ role: 'user', parts: responseParts })
  }

  return {
    text: 'Não consegui concluir a operação dentro do limite de passos. Tente reformular o pedido.',
    route: null,
    steps,
  }
}

// Conveniência usada pelo widget: monta ctx (perfil/escopo), ferramentas por
// papel e o system prompt, e dispara o loop. Mantém o widget enxuto.
export async function runAssistant({ messages = [], role, onStep } = {}) {
  const normalizedRole = normalizeRole(role) || 'paciente'
  const profile = await profileRepository.getCurrentUserProfile().catch(() => null)

  const ctx = {
    role: normalizedRole,
    currentDoctorId: profile?.doctorId || '',
    currentPatientId: profile?.patientId || '',
  }

  const tools = getToolsForRole(normalizedRole)
  const today = formatToday()

  const system =
    `Você é o assistente operacional do MediConnect, um sistema de gestão de clínica médica.\n` +
    `O usuário tem o perfil "${normalizedRole}". Hoje é ${today}.\n` +
    `Use as ferramentas disponíveis para consultar dados reais antes de responder — nunca invente números, nomes ou datas.\n` +
    `Quando o usuário falar em "hoje", "amanhã" etc., converta para a data ISO (AAAA-MM-DD) com base em hoje (${today}).\n` +
    `Responda em português do Brasil, de forma curta e objetiva.`

  return runAgent({ system, messages, tools, ctx, onStep })
}

// Resumo curto e genérico do resultado de uma ferramenta, para o trace.
// Genérico de propósito: serve para ferramentas futuras sem precisar de ajuste.
function describeResult(result) {
  if (result && result.error) return `erro: ${result.error}`
  if (result && typeof result.total === 'number') return `${result.total} resultado(s)`
  if (Array.isArray(result)) return `${result.length} item(ns)`
  return 'concluído'
}

// Mapeia mensagens da UI ({ role: 'user'|'assistant', content }) para o
// formato de conteúdo do Gemini (roles 'user'|'model').
function toContent(message) {
  const isModel = message.role === 'assistant' || message.role === 'model'
  return {
    role: isModel ? 'model' : 'user',
    parts: [{ text: String(message.content || message.text || '') }],
  }
}

function formatToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
