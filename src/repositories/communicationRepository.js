import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { getResponseError, normalizeCollection } from './repositoryUtils.js'

const MESSAGE_TABLES = ['communication_logs', 'message_logs', 'messages']
const TEMPLATE_TABLES = ['communication_templates', 'message_templates']

export const communicationRepository = {
  async sendSms({ patientId, patientName, phone, content }) {
    const message = `[MediConnect] Olá ${patientName}, ${content}`
    const payload = {
      phone_number: normalizePhone(phone),
      message,
      patient_id: patientId || undefined,
    }

    const response = await fetch(`${apiConfig.functionsUrl}/send-sms`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha no envio de SMS via Twilio.'))
    }

    await createMessageLog({
      patientId,
      patientName,
      channel: 'sms',
      template: 'Mensagem avulsa',
      content,
      status: 'entregue',
    }).catch(() => null)

    return true
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

    for (const table of MESSAGE_TABLES) {
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
    status: data.status,
    sent_at: new Date().toISOString(),
  })

  for (const table of MESSAGE_TABLES) {
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
    template: message.template || message.template_name || message.subject || 'Mensagem avulsa',
    sentAt: formatDateTime(message.sent_at || message.created_at || message.updated_at),
    status: normalizeStatus(message.status || message.delivery_status),
    response: message.response || message.reply || '',
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

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}
