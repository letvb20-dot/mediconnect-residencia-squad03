import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { onlyDigits } from '../utils/brFormatters.js'
import { getResponseError, normalizeCollection } from './repositoryUtils.js'

const HISTORY_TABLES = ['sms_logs', 'communication_logs', 'message_logs', 'messages']
const MESSAGE_LOG_TABLES = ['communication_logs', 'message_logs', 'messages']
const TEMPLATE_TABLES = ['communication_templates', 'message_templates']
const SMS_MAX_LENGTH = 1000
const WHATSAPP_MAX_LENGTH = 4000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const communicationRepository = {
  async sendSms({ patientId, patientName, phone, content }) {
    const message = buildSmsMessage({ content, patientName })
    const payload = {
      phone_number: normalizeSmsPhone(phone),
      message,
      patient_id: normalizeSmsPatientId(patientId),
    }

    if (!payload.phone_number) {
      throw new Error('Falha: telefone inválido para SMS.')
    }

    const response = await fetch(`${apiConfig.functionsUrl}/send-sms`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(cleanPayload(payload)),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha no envio de SMS via Twilio.'))
    }

    const result = await parseJsonResponse(response)
    if (result?.success === false) {
      throw new Error(result.message || 'Falha no envio de SMS via Twilio.')
    }

    await createMessageLog({
      patientId,
      patientName,
      channel: 'sms',
      template: 'Mensagem avulsa',
      content: message,
      response: result?.sid ? `Twilio SID: ${result.sid}` : result?.message || '',
      status: 'entregue',
    }).catch(() => null)

    return {
      message: result?.message || '',
      sid: result?.sid || '',
      success: result?.success !== false,
    }
  },

  async sendWhatsApp({ patientId, patientName, phone, content, fallbackSms = false }) {
    const message = buildWhatsAppMessage({ content, patientName })
    const payload = {
      phone_number: normalizeWhatsAppPhone(phone),
      message,
      fallback_sms: Boolean(fallbackSms),
    }

    if (!payload.phone_number) {
      throw new Error('Falha: telefone inválido para WhatsApp.')
    }

    const response = await fetch(`${apiConfig.functionsUrl}/send-whatsapp`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(cleanPayload(payload)),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha no envio de WhatsApp.'))
    }

    const result = await parseJsonResponse(response)
    if (result?.success === false) {
      throw new Error(result.message || 'Falha no envio de WhatsApp.')
    }

    const externalId = getWhatsAppExternalId(result)
    await createMessageLog({
      patientId,
      patientName,
      channel: 'whatsapp',
      template: 'Mensagem avulsa',
      content: message,
      response: externalId ? `WhatsApp ID: ${externalId}` : result?.message || '',
      status: 'entregue',
    }).catch(() => null)

    return {
      id: externalId,
      message: result?.message || '',
      success: result?.success !== false,
    }
  },

  async registerMessage(data) {
    return createMessageLog(data)
  },

  getCampaigns({ patients = [] } = {}) {
    const patientsWithPhone = patients.filter((patient) => patient.phone)
    const patientsWithoutNextVisit = patients.filter((patient) => !patient.nextVisit)

    return [
      {
        title: 'Lembretes Anti-Falta',
        desc: 'Enviar confirmação para pacientes com telefone cadastrado',
        count: `${patientsWithPhone.length} pacientes elegíveis`,
      },
      {
        title: 'Retorno Pendente',
        desc: 'Pacientes sem próximo atendimento registrado',
        count: `${patientsWithoutNextVisit.length} pacientes elegíveis`,
      },
      {
        title: 'Atualização Cadastral',
        desc: 'Revisar telefone e e-mail antes do próximo contato',
        count: `${patients.length} pacientes na base`,
      },
    ]
  },

  async getInitialMessages() {
    let lastResponse = null

    for (const table of HISTORY_TABLES) {
      const query = new URLSearchParams()
      query.set('select', '*,patients(full_name,phone_mobile,email)')
      query.set('order', 'created_at.desc')
      query.set('limit', '100')

      const response = await fetch(`${apiConfig.restUrl}/${table}?${query.toString()}`, {
        headers: getAuthenticatedHeaders(),
      }).catch(() => null)

      if (!response) continue
      lastResponse = response

      if (response.ok) {
        return normalizeCollection(await response.json(), ['messages', 'data', 'items']).map(mapMessage)
      }

      if (![400, 404, 406].includes(response.status)) {
        throw new Error(await getResponseError(response, 'Erro ao carregar histórico de comunicação.'))
      }
    }

    if (lastResponse) return []
    throw new Error('Não foi possível conectar à API de comunicação.')
  },

  async getInitialTemplates() {
    let lastResponse = null

    for (const table of TEMPLATE_TABLES) {
      const query = new URLSearchParams()
      query.set('select', '*')
      query.set('order', 'created_at.desc')

      const response = await fetch(`${apiConfig.restUrl}/${table}?${query.toString()}`, {
        headers: getAuthenticatedHeaders(),
      }).catch(() => null)

      if (!response) continue
      lastResponse = response

      if (response.ok) {
        return normalizeCollection(await response.json(), ['templates', 'data', 'items']).map(mapTemplate)
      }

      if (![400, 404, 406].includes(response.status)) {
        throw new Error(await getResponseError(response, 'Erro ao carregar templates de comunicação.'))
      }
    }

    if (lastResponse) return []
    throw new Error('Não foi possível conectar à API de templates.')
  },
}

async function createMessageLog(data) {
  const body = cleanPayload({
    patient_id: data.patientId,
    patient_name: data.patientName,
    channel: data.channel,
    template: data.template,
    content: data.content,
    response: data.response,
    status: data.status,
    sent_at: new Date().toISOString(),
  })

  for (const table of MESSAGE_LOG_TABLES) {
    const response = await fetch(`${apiConfig.restUrl}/${table}`, {
      method: 'POST',
      headers: getAuthenticatedHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify(body),
    }).catch(() => null)

    if (response?.ok) return true
    if (response && ![400, 404, 406].includes(response.status)) {
      throw new Error(await getResponseError(response, 'Erro ao registrar comunicação.'))
    }
  }

  return false
}

function mapMessage(message) {
  return {
    id: String(message.id || message.message_id || message.log_id || globalThis.crypto?.randomUUID?.() || Date.now()),
    patient:
      message.patient_name ||
      message.patient ||
      message.patients?.full_name ||
      'Paciente não identificado',
    channel: normalizeChannel(message.channel || message.canal),
    template: message.template || message.template_name || message.subject || (message.phone_number ? 'SMS Twilio' : 'Mensagem avulsa'),
    sentAt: formatDateTime(message.sent_at || message.created_at || message.updated_at),
    status: normalizeStatus(message.status || message.delivery_status),
    response: message.response || message.reply || message.sid || message.twilio_sid || message.message_id || message.messageId || '',
  }
}

function mapTemplate(template) {
  return {
    id: String(template.id || template.template_id || template.name),
    name: template.name || template.title || 'Template',
    channel: normalizeChannel(template.channel || template.canal),
    content: template.content || template.body || template.message || '',
    category: template.category || template.tipo || 'Personalizado',
  }
}

function normalizeChannel(channel) {
  const normalized = String(channel || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  if (['sms', 'whatsapp', 'email'].includes(normalized)) return normalized
  if (normalized === 'e_mail' || normalized === 'mail') return 'email'
  return 'sms'
}

function normalizeStatus(status) {
  const normalized = String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  if (['read', 'lida', 'opened', 'aberta'].includes(normalized)) return 'lida'
  if (['sent', 'delivered', 'entregue', 'enviada', 'enviado'].includes(normalized)) return 'entregue'
  if (['failed', 'falha', 'erro', 'error'].includes(normalized)) return 'falha'
  return 'pendente'
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function buildSmsMessage({ patientName, content }) {
  return buildPatientMessage({
    content,
    emptyMessage: 'Falha: mensagem SMS vazia.',
    maxLength: SMS_MAX_LENGTH,
    maxLengthMessage: `Falha: mensagem SMS excede ${SMS_MAX_LENGTH} caracteres.`,
    patientName,
  })
}

export function buildWhatsAppMessage({ patientName, content }) {
  return buildPatientMessage({
    content,
    emptyMessage: 'Falha: mensagem WhatsApp vazia.',
    maxLength: WHATSAPP_MAX_LENGTH,
    maxLengthMessage: `Falha: mensagem WhatsApp excede ${WHATSAPP_MAX_LENGTH} caracteres.`,
    patientName,
  })
}

function buildPatientMessage({ patientName, content, maxLength, emptyMessage, maxLengthMessage }) {
  const body = String(content || '').trim()
  if (!body) {
    throw new Error(emptyMessage)
  }

  const name = String(patientName || '').trim()
  const message = name ? `[MediConnect] Olá ${name}, ${body}` : `[MediConnect] ${body}`

  if (message.length > maxLength) {
    throw new Error(maxLengthMessage)
  }

  return message
}

export function normalizeSmsPhone(phone) {
  const raw = String(phone || '').trim()
  const digits = onlyDigits(raw)
  if (!digits) return ''

  if (raw.startsWith('+') && isValidInternationalPhone(digits)) {
    return `+${digits}`
  }

  if (digits.startsWith('00') && isValidInternationalPhone(digits.slice(2))) {
    return `+${digits.slice(2)}`
  }

  const brazilianDigits = digits.startsWith('55') ? digits : `55${digits}`
  return isValidBrazilianPhone(brazilianDigits) ? `+${brazilianDigits}` : ''
}

export function normalizeWhatsAppPhone(phone) {
  return normalizeSmsPhone(phone)
}

function normalizeSmsPatientId(patientId) {
  const value = String(patientId || '').trim()
  return UUID_PATTERN.test(value) ? value : undefined
}

function getWhatsAppExternalId(result) {
  return String(
    result?.message_id ||
    result?.messageId ||
    result?.id ||
    result?.key?.id ||
    result?.data?.message_id ||
    result?.data?.messageId ||
    '',
  )
}

function isValidBrazilianPhone(digits) {
  return /^55\d{10,11}$/.test(digits)
}

function isValidInternationalPhone(digits) {
  return /^\d{10,15}$/.test(digits)
}

async function parseJsonResponse(response) {
  const text = await response.text().catch(() => '')
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}
