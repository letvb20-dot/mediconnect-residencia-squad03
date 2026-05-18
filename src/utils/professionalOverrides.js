const PROFESSIONAL_OVERRIDES_KEY = 'mediconnect.professional.overrides.v1'

export const PROFESSIONAL_OVERRIDES_CHANGED_EVENT = 'mediconnect:professional-overrides-changed'

export function applyProfessionalOverrides(professionals = []) {
  const overrides = readProfessionalOverrides()
  if (!Object.keys(overrides).length) return professionals

  return professionals.map((professional) => {
    const override = getProfessionalOverride(professional, overrides)
    if (!override) return professional

    const name = override.full_name || override.name || professional.name

    return {
      ...professional,
      name,
      full_name: name,
      email: professional.email || override.email || '',
      phone: override.phone || professional.phone,
      unit: override.unit || professional.unit,
    }
  })
}

export function storeProfessionalOverride(data = {}) {
  const name = data.full_name || data.name || data.nome
  if (!name) return

  const keys = getProfessionalOverrideKeys(data)
  if (!keys.length) return

  const overrides = readProfessionalOverrides()
  const override = cleanPayload({
    full_name: name,
    name,
    email: data.email,
    phone: data.phone || data.phone_mobile,
    unit: data.unit || data.unidade,
    updatedAt: new Date().toISOString(),
  })

  keys.forEach((key) => {
    overrides[key] = override
  })
  writeProfessionalOverrides(overrides)
  notifyProfessionalOverridesChanged()
}

function getProfessionalOverride(professional, overrides) {
  for (const key of getProfessionalOverrideKeys(professional)) {
    if (overrides[key]) return overrides[key]
  }

  return null
}

function getProfessionalOverrideKeys(data = {}) {
  return [
    ['id', data.id],
    ['id', data.doctorId],
    ['id', data.doctor_id],
    ['id', data.medico_id],
    ['user', data.userId],
    ['user', data.user_id],
    ['user', data.authUserId],
    ['user', data.auth_user_id],
    ['user', data.profile_id],
    ['email', data.email],
    ['cpf', data.cpf],
    ['cpf', data.document],
    ['cpf', data.documento],
  ]
    .map(([type, value]) => {
      const normalized = normalizeLookupValue(value)
      return normalized ? `${type}:${normalized}` : ''
    })
    .filter(Boolean)
}

function readProfessionalOverrides() {
  if (typeof window === 'undefined' || !window.localStorage) return {}

  try {
    return JSON.parse(window.localStorage.getItem(PROFESSIONAL_OVERRIDES_KEY) || '{}') || {}
  } catch {
    window.localStorage.removeItem(PROFESSIONAL_OVERRIDES_KEY)
    return {}
  }
}

function writeProfessionalOverrides(overrides) {
  if (typeof window === 'undefined' || !window.localStorage) return
  window.localStorage.setItem(PROFESSIONAL_OVERRIDES_KEY, JSON.stringify(overrides))
}

function notifyProfessionalOverridesChanged() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return

  const EventConstructor = typeof window.CustomEvent === 'function' ? window.CustomEvent : Event
  window.dispatchEvent(new EventConstructor(PROFESSIONAL_OVERRIDES_CHANGED_EVENT))
}

function normalizeLookupValue(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 ? digits : raw
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}
