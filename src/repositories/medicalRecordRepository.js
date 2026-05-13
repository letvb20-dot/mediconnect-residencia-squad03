import { apiConfig, getAuthenticatedHeaders } from '../config/api.js'
import { getResponseError, normalizeItem } from './repositoryUtils.js'

const MEDICAL_RECORD_TABLES = ['medical_records', 'patient_records', 'records']

export const medicalRecordRepository = {
  getRecordTypes() {
    return ['Consulta Retorno', 'Primeira Consulta', 'Exame', 'Avaliação Pré-Op']
  },

  async getInitialRecords(filters = {}) {
    let lastResponse = null

    for (const table of MEDICAL_RECORD_TABLES) {
      const query = new URLSearchParams()
      query.set('select', '*,patients(full_name),doctors(full_name)')
      query.set('order', filters.order || 'created_at.desc')

      if (filters.patientId) {
        query.set('patient_id', `eq.${filters.patientId}`)
      }

      const response = await fetch(`${apiConfig.restUrl}/${table}?${query.toString()}`, {
        headers: getAuthenticatedHeaders(),
      }).catch(() => null)

      if (!response) continue
      lastResponse = response

      if (response.ok) {
        const data = await response.json()
        return (Array.isArray(data) ? data : []).map(mapMedicalRecord)
      }

      if (![400, 404, 406].includes(response.status)) {
        throw new Error(await getResponseError(response, 'Erro ao buscar prontuários.'))
      }
    }

    if (lastResponse) {
      return []
    }

    throw new Error('Não foi possível conectar à API de prontuários.')
  },

  async create(data) {
    let lastResponse = null

    for (const table of MEDICAL_RECORD_TABLES) {
      for (const payload of buildCreatePayloads(data)) {
        const response = await fetch(`${apiConfig.restUrl}/${table}`, {
          method: 'POST',
          headers: getAuthenticatedHeaders({ Prefer: 'return=representation' }),
          body: JSON.stringify(payload),
        }).catch(() => null)

        if (!response) continue
        lastResponse = response

        if (response.ok) {
          const created = normalizeItem(await response.json())
          return mapMedicalRecord(created)
        }

        if (![400, 404, 406].includes(response.status)) {
          throw new Error(await getResponseError(response, 'Erro ao criar prontuário.'))
        }
      }
    }

    throw new Error(await getResponseError(lastResponse, 'API de prontuários não encontrada.'))
  },
}

function buildCreatePayloads(data) {
  const basePayload = cleanPayload({
    patient_id: data.patientId,
    consultation_date: data.date || null,
    record_type: data.type,
    cid_code: data.cid,
    anamnesis: data.anamnesis,
    physical_exam: data.physicalExam,
    conduct: data.conduct,
    prescriptions: data.prescriptions,
    return_date: data.returnDate || null,
    status: toApiStatus(data.status),
    summary: data.conduct || data.anamnesis,
  })

  return uniquePayloads([
    basePayload,
    renameFields(basePayload, {
      consultation_date: 'date',
      record_type: 'type',
      cid_code: 'cid',
      physical_exam: 'physical_exam_notes',
      return_date: 'follow_up_date',
    }),
    pickFields(basePayload, ['patient_id', 'consultation_date', 'record_type', 'cid_code', 'summary', 'status']),
  ])
}

function mapMedicalRecord(record) {
  const date = record.consultation_date || record.date || record.created_at || ''
  const status = normalizeStatus(record.status)

  return {
    id: String(record.id || record.record_id || ''),
    patientId: record.patient_id || record.patientId || '',
    patient:
      record.patient_name ||
      record.patients?.full_name ||
      record.patient?.full_name ||
      record.patient ||
      'Paciente não identificado',
    date: formatDisplayDate(date),
    doctor:
      record.doctor_name ||
      record.doctors?.full_name ||
      record.doctor?.full_name ||
      record.created_by_name ||
      'Profissional não informado',
    type: record.record_type || record.type || record.tipo || 'Consulta',
    cid: record.cid_code || record.cid || 'CID não informado',
    status,
    summary:
      record.summary ||
      record.conduct ||
      record.anamnesis ||
      record.description ||
      'Registro sem resumo clínico.',
  }
}

function normalizeStatus(status) {
  const normalized = String(status || '').toLowerCase()
  if (['complete', 'completed', 'finalized', 'finalizado', 'completo'].includes(normalized)) {
    return 'completo'
  }

  return 'rascunho'
}

function toApiStatus(status) {
  return status === 'completo' ? 'completed' : 'draft'
}

function formatDisplayDate(value) {
  if (!value) return 'Data não informada'

  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('pt-BR').format(date)
  }

  const [year, month, day] = String(value).split('-')
  return year && month && day ? `${day}/${month}/${year}` : String(value)
}

function renameFields(payload, fieldMap) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [fieldMap[key] || key, value]),
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

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}
