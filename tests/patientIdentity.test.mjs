import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPatientFromProfile, resolveCurrentPatient } from '../src/utils/patientIdentity.js'

test('resolveCurrentPatient encontra paciente por patient_id em metadados', () => {
  const patient = resolveCurrentPatient(
    {
      isPatient: true,
      user_metadata: {
        patient_id: 'patient-1',
      },
    },
    [
      { id: 'patient-2', full_name: 'Outro Paciente' },
      { id: 'patient-1', full_name: 'Maria Paciente' },
    ],
  )

  assert.equal(patient?.id, 'patient-1')
})

test('resolveCurrentPatient cruza usuario_id do paciente com authUserId do perfil', () => {
  const patient = resolveCurrentPatient(
    {
      authUserId: 'auth-user-1',
      isPatient: true,
    },
    [
      { id: 'patient-1', full_name: 'Maria Paciente', usuario_id: 'auth-user-1' },
    ],
  )

  assert.equal(patient?.id, 'patient-1')
})

test('resolveCurrentPatient cruza CPF aninhado no perfil com documento do paciente', () => {
  const patient = resolveCurrentPatient(
    {
      isPatient: true,
      raw_user_meta_data: {
        cpf: '987.654.321-00',
      },
    },
    [
      {
        id: 'patient-1',
        full_name: 'Maria Paciente',
        patient_data: {
          document_number: '98765432100',
        },
      },
    ],
  )

  assert.equal(patient?.id, 'patient-1')
})

test('buildPatientFromProfile entende paciente retornado em array', () => {
  const patient = buildPatientFromProfile({
    email: 'maria@exemplo.com',
    full_name: 'Maria Paciente',
    patients: [
      {
        id: 'patient-1',
        cpf: '98765432100',
      },
    ],
  })

  assert.equal(patient?.id, 'patient-1')
  assert.equal(patient?.email, 'maria@exemplo.com')
})

test('resolveCurrentPatient usa paciente do perfil quando lista de pacientes vem vazia', () => {
  const patient = resolveCurrentPatient(
    {
      patient_id: 'patient-1',
      email: 'maria@exemplo.com',
      full_name: 'Maria Paciente',
    },
    [],
  )

  assert.equal(patient?.id, 'patient-1')
  assert.equal(patient?.full_name, 'Maria Paciente')
})
