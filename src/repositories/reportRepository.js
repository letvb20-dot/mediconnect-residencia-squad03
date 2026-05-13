import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { reportMapper } from '../mappers/reportMapper.js'
import { getResponseError, normalizeItem } from './repositoryUtils.js'

export const reportRepository = {
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
      query.set('status', `eq.${filters.status}`)
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
    const doctorNameById = await getDoctorNameMap().catch(() => new Map())

    return reports.map((report) => reportMapper.toUi(resolveRequester(report, doctorNameById)))
  },

  async create(uiData) {
    let lastResponse = null

    for (const payload of buildCreatePayloads(reportMapper.toApi(uiData))) {
      const response = await fetch(`${apiConfig.restUrl}/reports`, {
        method: 'POST',
        headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const data = await response.json()
        return reportMapper.toUi(normalizeItem(data))
      }

      lastResponse = response

      if (response.status !== 400) {
        break
      }
    }

    throw new Error(await getResponseError(lastResponse, 'Falha ao criar relatório médico.'))
  },

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
    return reportMapper.toUi(normalizeItem(data))
  },
}

async function getDoctorNameMap() {
  const response = await fetch(`${apiConfig.restUrl}/doctors?select=id,user_id,auth_user_id,full_name,name,nome,email`, {
    headers: getAuthenticatedHeaders(),
  })

  if (!response.ok) return new Map()

  const doctors = await response.json()
  const entries = []

  for (const doctor of Array.isArray(doctors) ? doctors : []) {
    const name = doctor.full_name || doctor.name || doctor.nome || doctor.email
    if (!name) continue

    for (const id of [doctor.id, doctor.user_id, doctor.auth_user_id]) {
      if (id) entries.push([String(id), name])
    }
  }

  return new Map(entries)
}

function resolveRequester(report, doctorNameById) {
  const requesterId = String(report.requested_by || '').trim()
  const requesterName =
    report.requested_by_name ||
    report.requester_name ||
    report.doctor_name ||
    report.doctors?.full_name ||
    report.doctor?.full_name ||
    doctorNameById.get(requesterId)

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

function buildCreatePayloads(payload) {
  return uniquePayloads([
    omitFields(payload, ['order_number', 'created_by', 'updated_by']),
    omitFields(payload, ['order_number', 'created_by', 'updated_by', 'content_json']),
    omitFields(payload, ['order_number', 'created_by', 'updated_by', 'content_json', 'hide_date', 'hide_signature', 'due_at']),
    pickFields(payload, ['patient_id', 'status', 'exam', 'requested_by', 'cid_code', 'diagnosis', 'conclusion', 'content_html']),
    payload,
  ])
}

function omitFields(payload, fields) {
  return Object.fromEntries(
    Object.entries(payload).filter(([field]) => !fields.includes(field)),
  )
}

function pickFields(payload, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => payload[field] !== undefined)
      .map((field) => [field, payload[field]]),
  )
}

function uniquePayloads(payloads) {
  const seen = new Set()

  return payloads.filter((payload) => {
    const signature = JSON.stringify(payload)
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}
