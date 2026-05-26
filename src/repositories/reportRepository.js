import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { reportMapper } from '../mappers/reportMapper.js'
import { getResponseError, normalizeCollection, normalizeItem } from './repositoryUtils.js'

const DOCTOR_TABLES = ['doctors', 'medicos']
const PROFILE_TABLES = ['profiles', 'user_profiles']

export const reportRepository = {
  // GET /rest/v1/reports
  // Filtros documentados: patient_id, status (draft|completed), created_by, order
  async getInitialReports(filters = {}) {
    const query = new URLSearchParams()
    query.set('select', '*')
    query.set('order', filters.order || 'created_at.desc')

    if (filters.patientId) {
      query.set('patient_id', `eq.${filters.patientId}`)
    } else if (filters.patientIds?.length) {
      query.set('patient_id', `in.(${filters.patientIds.join(',')})`)
    }

    if (filters.status) {
      query.set('status', `eq.${toApiReportStatus(filters.status)}`)
    }

    if (filters.createdBy) {
      query.set('created_by', `eq.${filters.createdBy}`)
    } else if (filters.createdByValues?.length === 1) {
      query.set('created_by', `eq.${filters.createdByValues[0]}`)
    } else if (filters.createdByValues?.length > 1) {
      query.set('created_by', `in.(${filters.createdByValues.join(',')})`)
    }

    const response = await fetch(`${apiConfig.restUrl}/reports?${query.toString()}`, {
      headers: getAuthenticatedHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao buscar relatórios médicos.'))
    }

    const data = await response.json()
    const reports = Array.isArray(data) ? data : []
    const requesterNameById = await getRequesterNameMap().catch(() => new Map())

    return reports.map((report) => reportMapper.toUi(resolveRequester(report, requesterNameById)))
  },

  // POST /rest/v1/reports
  async create(uiData) {
    const payload = reportMapper.toApi(uiData)

    const response = await fetch(`${apiConfig.restUrl}/reports`, {
      method: 'POST',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao criar relatório médico.'))
    }

    const data = await response.json()
    return reportMapper.toUi(requireReturnedItem(data, 'Falha ao criar relatorio medico. A API nao retornou confirmacao da alteracao.'))
  },

  // PATCH /rest/v1/reports?id=eq.{uuid}
  async update(id, uiData) {
    const response = await fetch(`${apiConfig.restUrl}/reports?id=eq.${id}`, {
      method: 'PATCH',
      headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(reportMapper.toApi(uiData)),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao atualizar relatório médico.'))
    }

    const data = await response.json()
    return reportMapper.toUi(requireReturnedItem(data, 'Falha ao atualizar relatorio medico. A API nao retornou confirmacao da alteracao.'))
  },

  // DELETE /rest/v1/reports?id=eq.{uuid} (não documentado mas é DELETE padrão PostgREST)
  async remove(id) {
    const response = await fetch(`${apiConfig.restUrl}/reports?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthenticatedHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, 'Falha ao excluir relatório médico.'))
    }

    return true
  },
}

function requireReturnedItem(data, message) {
  const item = normalizeItem(data)
  if (!item) throw new Error(message)
  return item
}

async function getRequesterNameMap() {
  const entries = []
  await appendRequesterEntries(entries, DOCTOR_TABLES, ['doctors', 'medicos', 'data'])
  await appendRequesterEntries(entries, PROFILE_TABLES, ['profiles', 'user_profiles', 'data'])
  return new Map(entries)
}

async function appendRequesterEntries(entries, tables, collectionKeys) {
  for (const table of tables) {
    const response = await fetch(`${apiConfig.restUrl}/${table}?select=*`, {
      headers: getAuthenticatedHeaders(),
    }).catch(() => null)

    if (!response?.ok) continue

    const rows = normalizeCollection(await response.json().catch(() => null), collectionKeys)
    for (const row of rows) {
      appendRequesterEntry(entries, row)
    }
  }
}

function appendRequesterEntry(entries, row) {
  const name = row.full_name || row.name || row.nome || row.email
  if (!name) return

  for (const id of [
    row.id,
    row.user_id,
    row.userId,
    row.auth_user_id,
    row.authUserId,
    row.profile_id,
    row.profileId,
    row.doctor_id,
    row.doctorId,
    row.medico_id,
    row.email,
  ]) {
    if (id) entries.push([String(id), name])
  }
}

function resolveRequester(report, requesterNameById) {
  const requesterId = String(report.requested_by || '').trim()
  const requesterName =
    report.requested_by_name ||
    report.requester_name ||
    report.doctor_name ||
    report.doctors?.full_name ||
    report.doctor?.full_name ||
    requesterNameById.get(requesterId) ||
    requesterNameById.get(String(report.created_by || '').trim())

  if (requesterName) {
    return { ...report, requested_by: requesterName, requested_by_id: requesterId }
  }

  if (isUuid(requesterId)) {
    return { ...report, requested_by: 'Solicitante não identificado', requested_by_id: requesterId }
  }

  return report
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function toApiReportStatus(status) {
  const normalized = String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  if (['finalized', 'finalizado', 'completed', 'complete', 'done', 'sent', 'enviado', 'delivered'].includes(normalized)) return 'delivered'
  return 'draft'
}
