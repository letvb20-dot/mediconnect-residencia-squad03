// Armazena a observação ("notes") do agendamento em localStorage, indexada por id.
// A tabela `appointments` no Supabase deste projeto não expõe coluna de notes no contrato
// REST documentado, então persistimos localmente para não perder a observação que a
// secretária preenche no momento do agendamento. Quando a fila/consulta é carregada,
// a appointmentRepository.getAll() mescla esses valores em cima dos retornados pela API.

const STORAGE_KEY = 'mediconnect.appointmentNotes.v1'
export const APPOINTMENT_NOTES_CHANGED_EVENT = 'mediconnect:appointment-notes-changed'

function readMap() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    window.dispatchEvent(new CustomEvent(APPOINTMENT_NOTES_CHANGED_EVENT))
  } catch {
    /* ignora quota / disabled storage */
  }
}

export const appointmentNotesRepository = {
  get(appointmentId) {
    if (!appointmentId) return ''
    return readMap()[String(appointmentId)] || ''
  },

  set(appointmentId, notes) {
    if (!appointmentId) return
    const map = readMap()
    const key = String(appointmentId)
    const value = String(notes || '').trim()
    if (value) {
      map[key] = value
    } else {
      delete map[key]
    }
    writeMap(map)
  },

  getAll() {
    return readMap()
  },

  clear(appointmentId) {
    if (!appointmentId) return
    const map = readMap()
    delete map[String(appointmentId)]
    writeMap(map)
  },
}
