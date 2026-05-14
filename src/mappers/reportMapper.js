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
    return cleanPayload({
      patient_id: uiData.patientId,
      order_number: emptyToUndefined(uiData.orderNumber),
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
      created_by: emptyToUndefined(uiData.createdBy),
      updated_by: emptyToUndefined(uiData.updatedBy),
    })
  },
}

function normalizeStatus(status) {
  const normalized = String(status || '').toLowerCase()
  if (['finalized', 'finalizado', 'finished', 'completed', 'complete', 'done'].includes(normalized)) {
    return 'finalized'
  }

  return 'draft'
}

function normalizeApiStatus(status) {
  return status === 'finalized' || status === 'completed' ? 'completed' : 'draft'
}

function emptyToUndefined(value) {
  return value === '' || value === null ? undefined : value
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  )
}
