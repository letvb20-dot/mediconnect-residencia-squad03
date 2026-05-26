// Motor heurístico da lista de espera inteligente.
// - rankWaitlistForSlot: casa pacientes da espera a um horário liberado.
// - predictCancellations: estima risco de cancelamento de agendamentos.
// - analyzeGaps / suggestFits: lacunas de agenda e encaixes sugeridos.

const TYPE_ALIASES = {
  teleconsulta: 'telemedicina',
  telemedicina: 'telemedicina',
  presencial: 'presencial',
}

export function rankWaitlistForSlot({ waitlist = [], slot = {} } = {}) {
  const active = waitlist.filter((entry) => normalize(entry.status) === 'aguardando' || !entry.status)

  return active
    .map((entry) => {
      let score = 0
      const reasons = []

      const urgency = clampUrgency(entry.urgency)
      score += urgency * 20
      reasons.push(`urgência ${urgency}/5`)

      if (slot.doctorId && entry.doctorId && String(slot.doctorId) === String(entry.doctorId)) {
        score += 40
        reasons.push('mesmo médico')
      } else if (slot.doctorId && entry.doctorId) {
        score -= 15
      }

      if (slot.type && entry.preferredType && sameType(slot.type, entry.preferredType)) {
        score += 15
        reasons.push('mesma modalidade')
      }

      const waitDays = daysSince(entry.createdAt)
      score += Math.min(waitDays * 3, 30)
      if (waitDays >= 1) reasons.push(`${waitDays} dia(s) na espera`)

      return { ...entry, matchScore: Math.round(score), matchReasons: reasons }
    })
    .sort((a, b) => b.matchScore - a.matchScore)
}

export function predictCancellations({ appointments = [], now = new Date() } = {}) {
  return appointments
    .filter((appointment) => !isCancelled(appointment.status) && !isCompleted(appointment.status))
    .map((appointment) => {
      let risk = 0
      const reasons = []

      if (normalize(appointment.status) === 'agendado') {
        risk += 35
        reasons.push('não confirmado')
      }

      const hour = parseHour(appointment.time)
      if (hour != null && (hour < 8 || hour >= 18)) {
        risk += 20
        reasons.push('horário de pico de faltas')
      }

      if (appointment.highPriority) {
        risk -= 15
      }

      if (normalize(appointment.mode).includes('tele')) {
        risk += 10
        reasons.push('teleconsulta')
      }

      const leadDays = daysUntil(appointment.date, now)
      if (leadDays != null && leadDays > 14) {
        risk += 15
        reasons.push('marcada com muita antecedência')
      }

      const score = Math.max(0, Math.min(100, risk))
      return {
        ...appointment,
        riskScore: score,
        riskLevel: score >= 55 ? 'alto' : score >= 30 ? 'médio' : 'baixo',
        riskReasons: reasons,
      }
    })
    .sort((a, b) => b.riskScore - a.riskScore)
}

// Calcula lacunas: slots livres = slots configurados não ocupados por agendamento ativo.
export function analyzeGaps({ slots = [], appointments = [] } = {}) {
  const occupied = new Set(
    appointments
      .filter((appointment) => !isCancelled(appointment.status))
      .map((appointment) => `${appointment.date}T${normalizeTime(appointment.time)}`),
  )

  return slots
    .filter((slot) => slot.available !== false)
    .filter((slot) => !occupied.has(`${slot.date}T${normalizeTime(slot.time)}`))
    .map((slot) => ({ date: slot.date, time: normalizeTime(slot.time), datetime: slot.datetime }))
}

// Para cada lacuna, sugere o melhor paciente da espera (mesmo médico).
export function suggestFits({ gaps = [], waitlist = [], doctorId } = {}) {
  return gaps
    .map((gap) => {
      const ranked = rankWaitlistForSlot({ waitlist, slot: { ...gap, doctorId } })
      return { gap, candidate: ranked[0] || null }
    })
    .filter((fit) => fit.candidate)
}

function clampUrgency(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 3
  return Math.max(1, Math.min(5, Math.round(number)))
}

function sameType(a, b) {
  return resolveType(a) === resolveType(b)
}

function resolveType(value) {
  const normalized = normalize(value)
  if (normalized.includes('tele')) return 'telemedicina'
  return TYPE_ALIASES[normalized] || 'presencial'
}

function daysSince(value) {
  const time = new Date(value || '').getTime()
  if (Number.isNaN(time)) return 0
  return Math.max(0, Math.floor((Date.now() - time) / 86400000))
}

function daysUntil(dateStr, now) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number)
  if (!year || !month || !day) return null
  const target = new Date(year, month - 1, day).getTime()
  return Math.round((target - now.getTime()) / 86400000)
}

function parseHour(time) {
  const match = String(time || '').match(/^(\d{1,2}):/)
  return match ? Number(match[1]) : null
}

function normalizeTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/)
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : ''
}

function isCancelled(status) {
  return ['cancelada', 'cancelado', 'cancelled'].includes(normalize(status))
}

function isCompleted(status) {
  return ['realizado', 'realizada', 'completed', 'concluida', 'concluido'].includes(normalize(status))
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
