// Letterhead MediConnect aplicado nos laudos.
// Usado tanto no fluxo de Atendimento (após a gravação da consulta) quanto na assistente
// IA do módulo de Relatórios.

const CLINIC_FOOTER = 'MediConnect · Centro Médico Integrado · Av. Iguaçu, 1236 — Curitiba/PR · contato@mediconnect.com.br'

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatBrDate(value) {
  if (!value) return '___/___/______'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    // tentar formato YYYY-MM-DD literal
    const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
    return String(value)
  }
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function todayIsoLocal() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function paragraphsFromText(text) {
  return String(text || '')
    .split(/\n{2,}|\r\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p style="text-align: justify">${escapeHtml(chunk).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function buildMediConnectLaudoHtml({ patient, appointment, doctor, draft, transcript } = {}) {
  const patientName = (patient?.name || appointment?.patient || 'Paciente não informado').toUpperCase()
  const patientDoc = patient?.cpf || patient?.document || 'Não informado'
  const patientBirth = formatBrDate(patient?.birthDate || patient?.birth_date)
  const visitDate = formatBrDate(appointment?.date || todayIsoLocal())
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
    '<p>&nbsp;</p>',
    `<p style="text-align: justify"><strong>MÉDICO RESPONSÁVEL:</strong> ${escapeHtml(doctorName)}${doctorSpecialty ? ` — ${escapeHtml(doctorSpecialty)}` : ''}${doctorCrm ? ` — ${escapeHtml(doctorCrm)}` : ''}</p>`,
    '<p>&nbsp;</p>',
    '<p>&nbsp;</p>',
    '<p style="text-align: center">_______________________________________</p>',
    `<p style="text-align: center"><em>${escapeHtml(doctorName)}</em></p>`,
    doctorCrm ? `<p style="text-align: center"><em>${escapeHtml(doctorCrm)}</em></p>` : '',
    '<p>&nbsp;</p>',
    '<hr>',
    `<p style="text-align: center"><em>${escapeHtml(CLINIC_FOOTER)}</em></p>`,
  ].filter(Boolean).join('\n')
}
