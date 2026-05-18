import assert from 'node:assert/strict'
import test from 'node:test'

import { filterBookableAvailableSlots } from '../src/hooks/useAgenda.js'

test('filterBookableAvailableSlots libera horario do proprio agendamento em edicao', () => {
  const slots = [
    { available: true, time: '09:00' },
    { available: true, time: '09:30' },
  ]
  const appointments = [
    {
      date: '2026-05-18',
      id: 'appointment-1',
      professionalId: 'doctor-1',
      status: 'Agendado',
      time: '09:00',
    },
    {
      date: '2026-05-18',
      id: 'appointment-2',
      professionalId: 'doctor-1',
      status: 'Agendado',
      time: '09:30',
    },
  ]

  const filtered = filterBookableAvailableSlots(slots, {
    appointments,
    date: '2026-05-18',
    doctorId: 'doctor-1',
    ignoredAppointmentId: 'appointment-1',
  })

  assert.deepEqual(filtered.map((slot) => slot.time), ['09:00'])
})
