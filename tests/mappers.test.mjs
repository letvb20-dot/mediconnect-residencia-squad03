import assert from 'node:assert/strict'
import test from 'node:test'

import { appointmentMapper } from '../src/mappers/appointmentMapper.js'
import { reportMapper } from '../src/mappers/reportMapper.js'

test('appointmentMapper envia valores aceitos pela API Supabase', () => {
  const payload = appointmentMapper.toApi(
    {
      patientId: 'patient-1',
      professionalId: 'doctor-1',
      date: '2026-05-11',
      time: '10:30',
      mode: 'Teleconsulta',
      status: 'Em triagem',
      notes: '',
    },
    'supabase',
  )

  assert.equal(payload.patient_id, 'patient-1')
  assert.equal(payload.doctor_id, 'doctor-1')
  assert.equal(payload.appointment_type, 'telemedicina')
  assert.equal(payload.status, 'checked_in')
  assert.equal(payload.duration_minutes, 30)
  assert.equal('notes' in payload, true)
})

test('appointmentMapper converte resposta da API para labels da agenda', () => {
  const appointment = appointmentMapper.toUi({
    id: 'appt-1',
    status: 'confirmed',
    appointment_type: 'telemedicina',
    scheduled_at: '2026-05-11T13:30:00.000Z',
    patients: { id: 'patient-1', full_name: 'Ana Souza' },
    doctors: { id: 'doctor-1', full_name: 'Dra. Leticia' },
  })

  assert.equal(appointment.id, 'appt-1')
  assert.equal(appointment.status, 'Confirmada')
  assert.equal(appointment.mode, 'Teleconsulta')
  assert.equal(appointment.patient, 'Ana Souza')
  assert.equal(appointment.professional, 'Dra. Leticia')
})

test('reportMapper remove campos vazios e normaliza status', () => {
  const payload = reportMapper.toApi({
    patientId: 'patient-1',
    status: 'finalized',
    exam: '',
    requestedBy: 'Dra. Leticia',
    contentHtml: '<p>Conclusao clinica</p>',
  })

  assert.equal(payload.patient_id, 'patient-1')
  assert.equal(payload.status, 'finalized')
  assert.equal(payload.requested_by, 'Dra. Leticia')
  assert.equal(payload.content_html, '<p>Conclusao clinica</p>')
  assert.equal('exam' in payload, false)
})
