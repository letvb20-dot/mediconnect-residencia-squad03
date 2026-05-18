import assert from 'node:assert/strict'
import test from 'node:test'

import { getNoShowStats, isNoShowAppointment } from '../src/utils/appointmentMetrics.js'

test('getNoShowStats calcula apenas agendamentos vencidos e nao realizados', () => {
  const now = new Date('2026-05-18T12:00:00')
  const appointments = [
    { date: '2026-05-18', time: '08:00', status: 'Agendado' },
    { date: '2026-05-18', time: '09:00', status: 'Realizado' },
    { date: '2026-05-18', time: '16:00', status: 'Agendado' },
    { date: '2026-05-17', time: '10:00', status: 'Confirmado' },
    { date: '2026-05-16', time: '10:00', status: 'Cancelado' },
  ]

  const stats = getNoShowStats(appointments, now)

  assert.equal(stats.count, 2)
  assert.equal(stats.total, 3)
  assert.equal(stats.rate, 66.7)
  assert.equal(isNoShowAppointment(appointments[0], now), true)
  assert.equal(isNoShowAppointment(appointments[1], now), false)
  assert.equal(isNoShowAppointment(appointments[2], now), false)
  assert.equal(isNoShowAppointment(appointments[4], now), false)
})
