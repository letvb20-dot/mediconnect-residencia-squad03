export const reportMapper = {
  toUi(apiData) {
    if (!apiData) return null

    return {
      id: String(apiData.id || ''),
      orderNumber: apiData.order_number || '',
      patientId: apiData.patient_id || '',
      status: normalizeStatus(apiData.status),
      exam: apiData.exam || '',
      requestedBy: apiData.requested_by || '',
      requestedById: apiData.requested_by_id || '',
      cidCode: apiData.cid_code || '',
      diagnosis: apiData.diagnosis || '',
      conclusion: apiData.conclusion || '',
      contentHtml: apiData.content_html || '',
      contentJson: apiData.content_json ?? null,
      hideDate: Boolean(apiData.hide_date),
      hideSignature: Boolean(apiData.hide_signature),
      dueAt: apiData.due_at || '',
      createdBy: apiData.created_by || '',
      updatedBy: apiData.updated_by || '',
      createdAt: apiData.created_at || '',
      updatedAt: apiData.updated_at || '',
    }
  },

  toApi(uiData) {
    // ReportInput (campos documentados):
    // patient_id*, status, exam, requested_by, cid_code, diagnosis, conclusion,
    // content_html, content_json, hide_date, hide_signature, due_at
    // Não envia: id, order_number, created_by, updated_by, created_at, updated_at (geridos pelo banco)
    return cleanPayload({
      patient_id: uiData.patientId,
      status: normalizeApiStatus(uiData.status),
      exam: emptyToUndefined(uiData.exam),
      requested_by: emptyToUndefined(uiData.requestedBy),
      cid_code: emptyToUndefined(uiData.cidCode),
      diagnosis: emptyToUndefined(uiData.diagnosis),
      conclusion: emptyToUndefined(uiData.conclusion),
      content_html: emptyToUndefined(uiData.contentHtml),
      content_json: uiData.contentJson === undefined ? undefined : uiData.contentJson,
      hide_date: uiData.hideDate === undefined ? undefined : Boolean(uiData.hideDate),
      hide_signature: uiData.hideSignature === undefined ? undefined : Boolean(uiData.hideSignature),
      due_at: emptyToUndefined(uiData.dueAt),
    })
  },
}

function normalizeStatus(status) {
  // Enum API: draft | completed
  // UI usa 'finalized' como alias de 'completed' (retrocompat).
  const normalized = String(status || '').toLowerCase()

  if (['finalized', 'finalizado', 'finished', 'completed', 'complete', 'done', 'sent', 'enviado'].includes(normalized)) {
    return 'finalized'
  }

  return 'draft'
}

function normalizeApiStatus(status) {
  // Enum documentado: draft | completed
  if (status === 'finalized' || status === 'completed' || status === 'sent') return 'completed'
  return 'draft'
}

function emptyToUndefined(value) {
  return value === '' || value === null ? undefined : value
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  )
}
