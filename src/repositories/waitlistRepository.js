const STORAGE_KEY = 'mediconnect.waitlist.v1'
export const WAITLIST_CHANGED_EVENT = 'mediconnect:waitlist-changed'

let memoryStore = []

export const waitlistRepository = {
  getAll() {
    return readAll().map(normalizeEntry)
  },

  add(data = {}) {
    const entry = normalizeEntry({
      id: createId(),
      patientId: data.patientId || '',
      patientName: data.patientName || 'Paciente',
      patientPhone: data.patientPhone || '',
      patientEmail: data.patientEmail || '',
      doctorId: data.doctorId || '',
      doctorName: data.doctorName || '',
      preferredType: data.preferredType || 'presencial',
      urgency: clampUrgency(data.urgency),
      reason: data.reason || '',
      channel: data.channel || 'whatsapp',
      status: 'aguardando',
      createdAt: new Date().toISOString(),
      notifiedAt: '',
    })

    writeAll([entry, ...readAll()])
    return entry
  },

  update(id, patch = {}) {
    let updated = null
    const next = readAll().map((entry) => {
      if (String(entry.id) !== String(id)) return entry
      updated = normalizeEntry({ ...entry, ...patch })
      return updated
    })
    writeAll(next)
    return updated
  },

  markNotified(id, channel) {
    return this.update(id, { status: 'notificado', notifiedAt: new Date().toISOString(), channel: channel || undefined })
  },

  remove(id) {
    writeAll(readAll().filter((entry) => String(entry.id) !== String(id)))
  },
}

function readAll() {
  const storage = getStorage()
  if (!storage) return [...memoryStore]

  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(data) ? data : []
  } catch {
    storage.removeItem(STORAGE_KEY)
    return []
  }
}

function writeAll(entries) {
  const normalized = entries.map(normalizeEntry)
  const storage = getStorage()
  if (storage) {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  } else {
    memoryStore = normalized
  }
  notifyChanged()
}

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage
  return null
}

function notifyChanged() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  const EventConstructor = typeof window.CustomEvent === 'function' ? window.CustomEvent : window.Event
  if (typeof EventConstructor !== 'function') return
  window.dispatchEvent(new EventConstructor(WAITLIST_CHANGED_EVENT))
}

function normalizeEntry(entry = {}) {
  return {
    id: entry.id || createId(),
    patientId: entry.patientId || '',
    patientName: entry.patientName || 'Paciente',
    patientPhone: entry.patientPhone || '',
    patientEmail: entry.patientEmail || '',
    doctorId: entry.doctorId || '',
    doctorName: entry.doctorName || '',
    preferredType: entry.preferredType || 'presencial',
    urgency: clampUrgency(entry.urgency),
    reason: entry.reason || '',
    channel: entry.channel || 'whatsapp',
    status: entry.status || 'aguardando',
    createdAt: entry.createdAt || new Date().toISOString(),
    notifiedAt: entry.notifiedAt || '',
  }
}

function clampUrgency(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 3
  return Math.max(1, Math.min(5, Math.round(number)))
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `wl-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
