export const appointmentMapper = {
  toUi(apiData) {
    if (!apiData) return null

    const patient = apiData.patient || apiData.paciente || apiData.patients || {}
    const professional = apiData.doctor || apiData.medico || apiData.professional || apiData.doctors || {}

    // Tratamento de data e hora do campo scheduled_at
    let dateStr = apiData.date || apiData.data || apiData.appointment_date || apiData.data_agendamento || ''
    let timeStr = apiData.time || apiData.hora || apiData.appointment_time || apiData.horario || ''

    if (apiData.scheduled_at) {
      const d = new Date(apiData.scheduled_at)
      if (!isNaN(d)) {
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        dateStr = `${yyyy}-${mm}-${dd}`
        
        const hh = String(d.getHours()).padStart(2, '0')
        const mins = String(d.getMinutes()).padStart(2, '0')
        timeStr = `${hh}:${mins}`
      }
    }

    // Tradução de status do banco (inglês) para UI (português)
    const statusMap = {
      requested: 'Aguardando',
      confirmed: 'Confirmada',
      checked_in: 'Em triagem',
      completed: 'Concluída',
      cancelled: 'Cancelada',
    }

    const rawStatus = String(apiData.status || '').toLowerCase()
    const mappedStatus = statusMap[rawStatus] || apiData.situacao || 'Aguardando'

    // Modalidade
    let mode = apiData.mode || apiData.modalidade || apiData.formato || 'Presencial'
    if (apiData.appointment_type) {
      mode = apiData.appointment_type === 'telemedicina' ? 'Teleconsulta' : 'Presencial'
    }

    const notes = apiData.notes || apiData.observations || apiData.observacoes || apiData.observacao || apiData.description || ''
    const highPriority = Boolean(
      apiData.highPriority ||
      apiData.high_priority ||
      normalizePriority(apiData.priority) === 'Alta' ||
      /urgente|alta|risco|prioridade/i.test(removeAccents(notes)),
    )

    return {
      id: apiData.id || apiData.agendamento_id,
      patientId: apiData.patientId || apiData.patient_id || apiData.paciente_id || patient.id,
      professionalId:
        apiData.professionalId ||
        apiData.doctor_id ||
        apiData.medico_id ||
        apiData.professional_id ||
        professional.id ||
        null,
      patient: apiData.patientName || apiData.patient_name || patient.full_name || patient.nome || patient.name || 'Paciente',
      professional:
        apiData.professional ||
        apiData.professionalName ||
        apiData.doctor_name ||
        apiData.medico_nome ||
        professional.full_name ||
        professional.name ||
        professional.nome ||
        'Médico(a)',
      date: dateStr,
      time: timeStr,
      type: apiData.type || apiData.tipo || apiData.tipo_consulta || 'Consulta',
      mode: mode,
      status: mappedStatus,
      highPriority,
      priority: highPriority ? 'Alta' : normalizePriority(apiData.priority) || 'Média',
      notes,
      room: apiData.room || apiData.sala || apiData.local || 'Consultório 1',
      createdBy: apiData.createdBy || apiData.created_by || '',
      createdByName:
        apiData.createdByName ||
        apiData.created_by_name ||
        apiData.created_by_profile?.full_name ||
        apiData.created_by_profile?.name ||
        apiData.created_by_profile?.email ||
        '',
    }
  },

  toApi(uiData, dialect = 'api') {
    if (dialect === 'supabase') {
      // Monta o scheduled_at no formato ISO assumindo fuso local
      const scheduledAt = new Date(`${uiData.date}T${uiData.time}:00`).toISOString()
      const highPriority = Boolean(uiData.highPriority)
      const notes = withPriorityMarker(uiData.notes, highPriority)

      return {
        patient_id: uiData.patientId,
        doctor_id: uiData.professionalId || null,
        scheduled_at: scheduledAt,
        appointment_type: uiData.mode === 'Teleconsulta' ? 'telemedicina' : 'presencial',
        status: toApiStatus(uiData.status),
        notes: emptyToUndefined(notes),
        observations: emptyToUndefined(notes),
        duration_minutes: 30, // Padrao
        created_by: emptyToUndefined(uiData.createdBy),
      }
    }

    const highPriority = Boolean(uiData.highPriority)
    const notes = withPriorityMarker(uiData.notes, highPriority)

    return {
      patient_id: uiData.patientId,
      doctor_id: uiData.professionalId || null,
      appointment_date: uiData.date,
      appointment_time: uiData.time,
      type: uiData.type,
      mode: uiData.mode,
      status: uiData.status || 'Confirmada',
      room: uiData.room,
      high_priority: highPriority,
      priority: highPriority ? 'Alta' : uiData.priority,
      notes,
      created_by: uiData.createdBy,
    }
  },
}

function emptyToUndefined(value) {
  return value === '' || value === null ? undefined : value
}

function withPriorityMarker(notes, highPriority) {
  const cleanNotes = String(notes || '').replace(/^\[Prioridade alta\]\s*/i, '').trim()
  if (!highPriority) return cleanNotes
  return cleanNotes ? `[Prioridade alta] ${cleanNotes}` : '[Prioridade alta]'
}

function normalizePriority(value) {
  const normalized = removeAccents(value).toLowerCase()
  if (!normalized) return ''
  if (normalized.includes('alta') || normalized.includes('urgente')) return 'Alta'
  if (normalized.includes('baixa')) return 'Baixa'
  if (normalized.includes('media') || normalized.includes('normal')) return 'Média'
  return ''
}

function removeAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function toApiStatus(status) {
  const normalized = String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  const statusMap = {
    confirmada: 'confirmed',
    confirmado: 'confirmed',
    em_triagem: 'checked_in',
    triagem: 'checked_in',
    aguardando: 'requested',
    solicitada: 'requested',
    solicitacao: 'requested',
    cancelada: 'cancelled',
    cancelado: 'cancelled',
    concluida: 'completed',
    concluido: 'completed',
    finalizada: 'completed',
    finalizado: 'completed',
  }

  return statusMap[normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')] || 'requested'
}
