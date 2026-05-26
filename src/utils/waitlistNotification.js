import { communicationRepository } from '../repositories/communicationRepository.js'

export async function sendWaitlistNotification(entry, { patients = [] } = {}) {
  const channel = normalizeWaitlistChannel(entry.channel)
  if (!['whatsapp', 'sms'].includes(channel)) {
    throw new Error('Envio por e-mail ainda nao esta conectado.')
  }

  const patient = findWaitlistPatient(entry.patientId, patients)
  const phone = entry.patientPhone || getWaitlistPatientPhone(patient)
  const patientName = entry.patientName || getWaitlistPatientName(patient)
  const content = buildWaitlistNotificationContent(entry)

  if (!phone) {
    await communicationRepository.registerMessage({
      channel,
      content,
      patientId: entry.patientId,
      patientName,
      response: 'Telefone ausente',
      status: 'falha',
      template: 'Lista de espera',
    }).catch(() => null)
    throw new Error('Paciente sem telefone cadastrado para envio.')
  }

  if (channel === 'sms') {
    return communicationRepository.sendSms({
      content,
      patientId: entry.patientId,
      patientName,
      phone,
    })
  }

  return communicationRepository.sendWhatsApp({
    content,
    fallbackSms: false,
    patientId: entry.patientId,
    patientName,
    phone,
  })
}

export function buildWaitlistNotificationContent(entry = {}) {
  const doctorPart = entry.doctorName ? ` com ${entry.doctorName}` : ''
  const typePart = formatWaitlistType(entry.preferredType)
  const reasonPart = entry.reason ? ` Observacao: ${String(entry.reason).trim()}.` : ''

  return `temos uma possibilidade de encaixe para sua consulta${typePart}${doctorPart}. Responda esta mensagem ou entre em contato com a clinica para confirmar.${reasonPart}`
}

export function findWaitlistPatient(patientId, patients = []) {
  const normalizedPatientId = normalizeValue(patientId)
  return patients.find((patient) =>
    [
      patient.id,
      patient.patientId,
      patient.patient_id,
      patient.paciente_id,
      patient.detailId,
    ].map(normalizeValue).includes(normalizedPatientId),
  ) || null
}

export function getWaitlistPatientPhone(patient) {
  return patient?.phone || patient?.phone_mobile || patient?.telefone || patient?.celular || ''
}

export function getWaitlistPatientEmail(patient) {
  return patient?.email || patient?.mail || ''
}

function getWaitlistPatientName(patient) {
  return patient?.name || patient?.full_name || patient?.nome || 'Paciente'
}

function normalizeWaitlistChannel(channel) {
  return String(channel || 'whatsapp')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function formatWaitlistType(type) {
  const normalized = normalizeWaitlistChannel(type)
  if (!normalized) return ''
  if (normalized.includes('tele')) return ' por teleconsulta'
  if (normalized.includes('presencial')) return ' presencial'
  return ''
}

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase()
}
