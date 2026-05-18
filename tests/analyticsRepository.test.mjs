import assert from 'node:assert/strict'
import test from 'node:test'

import { appointmentRepository } from '../src/repositories/appointmentRepository.js'
import { analyticsRepository } from '../src/repositories/analyticsRepository.js'
import { patientRepository } from '../src/repositories/patientRepository.js'
import { professionalRepository } from '../src/repositories/professionalRepository.js'

test('analytics usa o mesmo calculo de no-show e absenteismo baseado em vencidos', async (t) => {
  const originalAppointments = appointmentRepository.getAll
  const originalPatients = patientRepository.getDirectoryRows
  const originalProfessionals = professionalRepository.getAll

  t.after(() => {
    appointmentRepository.getAll = originalAppointments
    patientRepository.getDirectoryRows = originalPatients
    professionalRepository.getAll = originalProfessionals
  })

  appointmentRepository.getAll = async () => [
    { date: '2026-05-18', time: '08:00', status: 'Agendado', professionalId: 'doctor-1', patientId: 'p1', patient: 'Ana' },
    { date: '2026-05-18', time: '09:00', status: 'Realizado', professionalId: 'doctor-1', patientId: 'p2', patient: 'Bia' },
    { date: '2026-05-18', time: '16:00', status: 'Agendado', professionalId: 'doctor-1', patientId: 'p3', patient: 'Caio' },
    { date: '2026-05-17', time: '10:00', status: 'Confirmado', professionalId: 'doctor-2', patientId: 'p4', patient: 'Davi' },
    { date: '2026-05-16', time: '10:00', status: 'Cancelado', professionalId: 'doctor-1', patientId: 'p5', patient: 'Eva' },
  ]
  patientRepository.getDirectoryRows = async () => []
  professionalRepository.getAll = async () => [
    { id: 'doctor-1', name: 'Dra. Ana' },
    { id: 'doctor-2', name: 'Dr. Bruno' },
  ]

  const data = await analyticsRepository.getDashboardData({
    absenteeismPeriod: 'week',
    consultationsPeriod: 'week',
    now: new Date('2026-05-18T12:00:00'),
  })

  assert.equal(data.attendanceMetrics.scheduled, 5)
  assert.equal(data.attendanceMetrics.completed, 1)
  assert.equal(data.attendanceMetrics.cancelled, 1)
  assert.equal(data.attendanceMetrics.noShow, 2)
  assert.equal(data.attendanceMetrics.noShowRate, 66.7)
  assert.equal(data.kpis.find((kpi) => kpi.label === 'Taxa de Absenteísmo')?.value, '66.7%')
  assert.equal(data.absenteeismData.at(-1).taxa, 50)
  assert.deepEqual(data.doctorPerformance, [
    { name: 'Dra. Ana', consultas: 2, noShow: 1 },
    { name: 'Dr. Bruno', consultas: 1, noShow: 1 },
  ])
})
