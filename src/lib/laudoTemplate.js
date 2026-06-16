// Template HTML do laudo médico MediConnect.
// Compartilhado entre AtendimentoPage (ConsultaPage) e ReportsPage.

import { formatLocalDateInput } from '../utils/agendaDate.js'

export const CLINIC_FOOTER = 'MediConnect · Centro Médico Integrado · Av. Iguaçu, 1236 — Curitiba/PR · contato@mediconnect.com.br'

function todayIso() {
  return formatLocalDateInput(new Date())
}

export function formatBrDate(value) {
  if (!value) return '___/___/______'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function paragraphsFromText(text) {
  return String(text || '')
    .split(/\n{2,}|\r\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p style="text-align: justify">${escapeHtml(chunk).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * Monta o HTML completo do laudo no padrão MediConnect.
 *
 * @param {object} options
 * @param {object} options.patient        Paciente { name, cpf, birthDate, ... }
 * @param {object} options.appointment    Consulta { date, time, type, patient }
 * @param {object} options.doctor         Médico { name, crm, specialty }
 * @param {object} options.draft          Rascunho { exam, cidCode, diagnosis, conclusion }
 * @param {string} [options.transcript]   Transcrição opcional do áudio
 * @param {boolean} [options.signDigitally=true]  Quando true, o nome do médico aparece
 *                                                 abaixo da linha de assinatura. Quando
 *                                                 false, a linha fica vazia para o médico
 *                                                 assinar manualmente após imprimir.
 */
export function buildMediConnectLaudoHtml({
  patient,
  appointment,
  doctor,
  draft,
  transcript,
  signDigitally = true,
}) {
  const patientName = (patient?.name || appointment?.patient || 'Paciente não informado').toUpperCase()
  const patientDoc = patient?.cpf || patient?.document || 'Não informado'
  const patientBirth = formatBrDate(patient?.birthDate || patient?.birth_date)
  const visitDate = formatBrDate(appointment?.date || todayIso())
  const visitTime = appointment?.time || new Date().toTimeString().slice(0, 5)
  const exam = draft?.exam || appointment?.type || 'Consulta médica'
  const diagnosis = draft?.diagnosis || ''
  const conclusion = draft?.conclusion || ''
  const cid = draft?.cidCode || ''
  const doctorName = doctor?.name || 'Médico Responsável'
  const doctorCrm = doctor?.crm ? `CRM ${doctor.crm}` : ''
  const doctorSpecialty = doctor?.specialty || ''

  const findingsSource = [diagnosis, conclusion, transcript].filter(Boolean).join('\n\n').trim()
  const findingsBlock = findingsSource
    ? paragraphsFromText(findingsSource)
    : '<p style="text-align: justify">Paciente avaliado conforme queixa apresentada. Conduta orientada após exame clínico.</p>'

  const signatureBlock = signDigitally
    ? [
        '<p style="text-align: center">_______________________________________</p>',
        `<p style="text-align: center"><em>${escapeHtml(doctorName)}</em></p>`,
        doctorCrm ? `<p style="text-align: center"><em>${escapeHtml(doctorCrm)}</em></p>` : '',
      ]
    : [
        '<p style="text-align: center">&nbsp;</p>',
        '<p style="text-align: center">_______________________________________</p>',
        '<p style="text-align: center"><em>Assinatura do médico</em></p>',
      ]

  return [
    '<h2 style="text-align: center"><strong>MEDICONNECT</strong></h2>',
    '<p style="text-align: center"><em>Centro Médico Integrado</em></p>',
    '<p style="text-align: center">&nbsp;</p>',
    '<h2 style="text-align: center"><strong>LAUDO MÉDICO</strong></h2>',
    '<p style="text-align: center">&nbsp;</p>',
    `<p style="text-align: justify">DECLARO PARA OS DEVIDOS FINS, A PEDIDO, QUE O(A) SR.(A) <u><strong>${escapeHtml(patientName)}</strong></u></p>`,
    `<p style="text-align: justify"><strong>DOCUMENTO:</strong> ${escapeHtml(patientDoc)} &nbsp;&nbsp; <strong>NASC:</strong> ${escapeHtml(patientBirth)}</p>`,
    `<p style="text-align: justify"><strong>FOI ATENDIDO(A) NO DIA ${escapeHtml(visitDate)}</strong>, às <strong>${escapeHtml(visitTime)}</strong>.</p>`,
    `<p style="text-align: justify"><strong>Motivo / Exame:</strong> ${escapeHtml(exam)}</p>`,
    '<p>&nbsp;</p>',
    findingsBlock,
    cid ? `<p style="text-align: justify"><strong>CID ${escapeHtml(cid)}</strong></p>` : '',
    '<p>&nbsp;</p>',
    `<p style="text-align: justify"><strong>MÉDICO RESPONSÁVEL:</strong> ${escapeHtml(doctorName)}${doctorSpecialty ? ` — ${escapeHtml(doctorSpecialty)}` : ''}${doctorCrm ? ` — ${escapeHtml(doctorCrm)}` : ''}</p>`,
    '<p>&nbsp;</p>',
    '<p>&nbsp;</p>',
    ...signatureBlock,
    '<p>&nbsp;</p>',
    '<hr>',
    `<p style="text-align: center"><em>${escapeHtml(CLINIC_FOOTER)}</em></p>`,
  ].filter(Boolean).join('\n')
}

export function buildVideoBlockHtml(videoUrl, patientName) {
  if (!videoUrl) return ''
  const safeUrl = escapeHtml(videoUrl)
  const safeName = escapeHtml(patientName || 'Paciente')
  return [
    '<hr>',
    '<h3 style="text-align: center"><strong>Mensagem em vídeo</strong></h3>',
    `<p style="text-align: center"><em>Gravado pelo médico para ${safeName}.</em></p>`,
    `<p style="text-align: center"><video controls preload="metadata" style="max-width: 100%; border-radius: 8px" src="${safeUrl}"></video></p>`,
    `<p style="text-align: center"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Abrir vídeo em uma nova aba</a></p>`,
  ].join('\n')
}
