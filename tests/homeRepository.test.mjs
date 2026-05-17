import assert from 'node:assert/strict'
import test from 'node:test'

import { buildWeeklyAppointmentSeries } from '../src/repositories/homeRepository.js'

test('buildWeeklyAppointmentSeries conta consultas dos ultimos 7 dias sem canceladas', () => {
  const series = buildWeeklyAppointmentSeries(
    [
      { date: '2026-05-10', status: 'Agendado' },
      { date: '2026-05-11', status: 'Confirmado' },
      { date: '2026-05-11', status: 'Cancelado' },
      { date: '2026-05-12', status: 'Realizado' },
      { date: '2026-05-16', status: 'Agendado' },
      { date: '2026-05-09', status: 'Agendado' },
    ],
    new Date('2026-05-16T12:00:00'),
  )

  assert.deepEqual(series.days.map((day) => day.date), [
    '2026-05-10',
    '2026-05-11',
    '2026-05-12',
    '2026-05-13',
    '2026-05-14',
    '2026-05-15',
    '2026-05-16',
  ])
  assert.deepEqual(series.days.map((day) => day.count), [1, 1, 1, 0, 0, 0, 1])
  assert.equal(series.total, 4)
})
