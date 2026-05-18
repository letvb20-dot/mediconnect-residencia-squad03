import assert from 'node:assert/strict'
import test from 'node:test'

import { appointmentRepository } from '../src/repositories/appointmentRepository.js'
import { homeRepository, buildWeeklyAppointmentSeries } from '../src/repositories/homeRepository.js'
import { patientRepository } from '../src/repositories/patientRepository.js'
import { professionalRepository } from '../src/repositories/professionalRepository.js'

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

test('painel exibe no-show total para todos os perfis com acesso', async (t) => {
  const originalAppointments = appointmentRepository.getAll
  const originalPatients = patientRepository.getDirectoryRows
  const originalProfessionals = professionalRepository.getAll

  t.after(() => {
    appointmentRepository.getAll = originalAppointments
    patientRepository.getDirectoryRows = originalPatients
    professionalRepository.getAll = originalProfessionals
  })

  appointmentRepository.getAll = async () => [
    { date: '2026-05-17', time: '09:00', status: 'Agendado', professionalId: 'doctor-1', patientId: 'p1' },
    { date: '2026-05-17', time: '10:00', status: 'Realizado', professionalId: 'doctor-1', patientId: 'p2' },
    { date: '2026-05-18', time: '08:00', status: 'Confirmado', professionalId: 'doctor-2', patientId: 'p3' },
    { date: '2026-05-18', time: '16:00', status: 'Agendado', professionalId: 'doctor-1', patientId: 'p4' },
    { date: '2026-05-16', time: '10:00', status: 'Cancelado', professionalId: 'doctor-2', patientId: 'p5' },
    { date: '2026-05-15', time: '10:00', status: 'Agendado', professionalId: 'doctor-2', patientId: 'p6' },
  ]
  patientRepository.getDirectoryRows = async () => []
  professionalRepository.getAll = async () => [
    { id: 'doctor-1', userId: 'user-doctor-1', email: 'medico@exemplo.com', name: 'Dra. Ana' },
    { id: 'doctor-2', userId: 'user-doctor-2', email: 'outro@exemplo.com', name: 'Dr. Bruno' },
  ]

  for (const role of ['admin', 'gestor', 'secretaria']) {
    const overview = await homeRepository.getDashboardOverview({
      now: new Date('2026-05-18T12:00:00'),
      role,
    })
    const noShowMetric = findMetric(overview.metrics, 'No-show')

    assert.equal(noShowMetric.value, '75%')
    assert.equal(noShowMetric.change, '3 de 4 agendamentos vencidos')
  }

  const doctorOverview = await homeRepository.getDashboardOverview({
    now: new Date('2026-05-18T12:00:00'),
    profile: { doctorId: 'doctor-1', email: 'medico@exemplo.com', id: 'user-doctor-1' },
    role: 'medico',
    user: { id: 'user-doctor-1', email: 'medico@exemplo.com' },
  })
  const doctorNoShowMetric = findMetric(doctorOverview.metrics, 'No-show')

  assert.equal(doctorNoShowMetric.value, '50%')
  assert.equal(doctorNoShowMetric.change, '1 de 2 agendamentos vencidos')
})

function findMetric(metrics, label) {
  return metrics.find((metric) => metric.label === label)
}
