import assert from 'node:assert/strict'
import test from 'node:test'

import { appointmentMapper } from '../src/mappers/appointmentMapper.js'
import { reportMapper } from '../src/mappers/reportMapper.js'

test('appointmentMapper envia apenas campos aceitos pelo contrato da API', () => {
  const payload = appointmentMapper.toApi(
    {
      patientId: 'patient-1',
      professionalId: 'doctor-1',
      date: '2026-05-11',
      time: '10:30',
      mode: 'Teleconsulta',
      status: 'Agendado',
      notes: 'algumas anotacoes',
    },
    'supabase',
  )

  assert.equal(payload.patient_id, 'patient-1')
  assert.equal(payload.doctor_id, 'doctor-1')
  assert.equal(payload.appointment_type, 'telemedicina')
  assert.equal(payload.status, 'requested')
  assert.equal(payload.duration_minutes, 30)
  // Contrato OpenAPI: doctor_id, patient_id, scheduled_at, duration_minutes, status, created_by
  // (appointment_type aceito pela tabela). `notes` e `observations` não fazem parte do contrato.
  assert.equal('notes' in payload, false)
  assert.equal('observations' in payload, false)
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
  assert.equal(appointment.status, 'Confirmado')
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
  assert.equal(payload.status, 'completed')
  assert.equal(payload.requested_by, 'Dra. Leticia')
  assert.equal(payload.content_html, '<p>Conclusao clinica</p>')
  assert.equal('exam' in payload, false)
})
