import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'

const storage = new Map()

globalThis.localStorage = {
  clear() {
    storage.clear()
  },
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null
  },
  removeItem(key) {
    storage.delete(key)
  },
  setItem(key, value) {
    storage.set(key, String(value))
  },
}

class TestEvent {
  constructor(type) {
    this.type = type
  }
}

globalThis.window = {
  CustomEvent: TestEvent,
  Event: TestEvent,
  dispatchEvent() {},
  localStorage: globalThis.localStorage,
}

const { isFinalizedQueueItem, visitRepository } = await import('../src/repositories/visitRepository.js')

beforeEach(() => {
  localStorage.clear()
})

const basePayload = {
  patientId: 'patient-1',
  professionalId: 'doctor-1',
  date: '2026-05-20',
  time: '09:00',
  type: 'Retorno',
  mode: 'Presencial',
  durationMinutes: 30,
  status: 'Agendado',
  highPriority: false,
  priority: 'Média',
  notes: 'Preferencia pela manha',
  room: 'Consultório 1',
  createdBy: 'user-1',
  createdByName: 'Secretaria',
}

test('visitRepository armazena solicitacao na fila de consultas', async () => {
  const queued = visitRepository.enqueue(basePayload, {
    conflictingAppointment: { id: 'appointment-1', patient: 'Carlos Lima' },
    patients: [{ id: 'patient-1', name: 'Ana Souza' }],
    professionals: [{ id: 'doctor-1', name: 'Dra. Maria' }],
  })

  const queue = await visitRepository.getCareQueue()

  assert.equal(queue.length, 1)
  assert.equal(queue[0].id, queued.id)
  assert.equal(queue[0].patient, 'Ana Souza')
  assert.equal(queue[0].professional, 'Dra. Maria')
  assert.equal(queue[0].status, 'Na fila')
  assert.equal(queue[0].priority, 'Média')
})

test('visitRepository evita duplicar paciente na mesma fila de horario', async () => {
  const first = visitRepository.enqueue(basePayload)
  const second = visitRepository.enqueue(basePayload)
  const queue = await visitRepository.getCareQueue()

  assert.equal(first.id, second.id)
  assert.equal(queue.length, 1)
})

test('visitRepository encontra prioridade e finaliza item promovido', async () => {
  visitRepository.enqueue(basePayload)
  const highPriority = visitRepository.enqueue({
    ...basePayload,
    patientId: 'patient-2',
    highPriority: true,
    priority: 'Alta',
  })

  const next = visitRepository.findNextForSlot(basePayload)
  assert.equal(next.id, highPriority.id)

  const scheduled = visitRepository.markScheduled(next.id, { id: 'appointment-2' })
  const queue = await visitRepository.getCareQueue()

  assert.equal(scheduled.status, 'Finalizada')
  assert.equal(scheduled.scheduledAppointmentId, 'appointment-2')
  assert.equal(isFinalizedQueueItem(scheduled), true)
  assert.equal(queue.filter((item) => isFinalizedQueueItem(item)).length, 1)
  assert.equal(queue.filter((item) => !isFinalizedQueueItem(item)).length, 1)
})
