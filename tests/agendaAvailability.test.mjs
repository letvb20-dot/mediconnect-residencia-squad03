import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAppointmentConfirmationContent,
  filterBookableAvailableSlots,
  recoverCurrentPatient,
  sendAppointmentConfirmationMessages,
} from '../src/hooks/useAgenda.js'
import { communicationRepository } from '../src/repositories/communicationRepository.js'
import { patientRepository } from '../src/repositories/patientRepository.js'

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

test('sendAppointmentConfirmationMessages dispara WhatsApp e SMS para agendamento criado', async () => {
  const originalSendSms = communicationRepository.sendSms
  const originalSendWhatsApp = communicationRepository.sendWhatsApp
  const originalRegisterMessage = communicationRepository.registerMessage
  const calls = []

  communicationRepository.sendSms = async (payload) => {
    calls.push({ channel: 'sms', ...payload })
    return { sid: 'SM123', success: true }
  }
  communicationRepository.sendWhatsApp = async (payload) => {
    calls.push({ channel: 'whatsapp', ...payload })
    return { id: 'WA123', success: true }
  }
  communicationRepository.registerMessage = async (payload) => {
    calls.push({ channel: payload.channel, log: true, ...payload })
    return true
  }

  try {
    const payload = {
      date: '2026-05-30',
      mode: 'Presencial',
      patientId: 'patient-1',
      professionalId: 'doctor-1',
      time: '14:00',
    }

    const result = await sendAppointmentConfirmationMessages(payload, {
      patients: [{ id: 'patient-1', lgpdOptIn: true, name: 'Maria', phone: '(79) 99114-8174' }],
      professionals: [{ id: 'doctor-1', name: 'Dra. Ana' }],
    })

    assert.deepEqual(result.sent.sort(), ['sms', 'whatsapp'])
    assert.equal(calls.length, 2)
    assert.equal(calls[0].channel, 'whatsapp')
    assert.equal(calls[0].fallbackSms, false)
    assert.equal(calls[0].phone, '(79) 99114-8174')
    assert.equal(calls[1].channel, 'sms')
    assert.equal(calls[1].patientName, 'Maria')
    assert.equal(
      buildAppointmentConfirmationContent(payload, { professional: { name: 'Dra. Ana' } }),
      'sua consulta Presencial foi agendada para 30/05/2026 \u00e0s 14:00 com Dra. Ana.',
    )
  } finally {
    communicationRepository.sendSms = originalSendSms
    communicationRepository.sendWhatsApp = originalSendWhatsApp
    communicationRepository.registerMessage = originalRegisterMessage
  }
})

test('recoverCurrentPatient usa patientId do perfil mesmo sem lista de pacientes', async () => {
  const patient = await recoverCurrentPatient(
    {
      email: 'maria@exemplo.com',
      full_name: 'Maria Paciente',
      isPatient: true,
      patient_id: 'patient-1',
    },
    [],
  )

  assert.equal(patient?.id, 'patient-1')
  assert.equal(patient?.email, 'maria@exemplo.com')
})

test('recoverCurrentPatient cria paciente quando perfil paciente ainda nao tem registro legivel', async () => {
  const originalGetAll = patientRepository.getAll
  const originalCreate = patientRepository.create
  const calls = []

  patientRepository.getAll = async () => []
  patientRepository.create = async (payload) => {
    calls.push(payload)
    return { id: 'patient-1', ...payload }
  }

  try {
    const patient = await recoverCurrentPatient(
      {
        cpf: '987.654.321-00',
        email: 'maria@exemplo.com',
        isPatient: true,
        name: 'Maria Paciente',
        phone: '(11) 98888-7777',
      },
      [],
    )

    assert.equal(patient?.id, 'patient-1')
    assert.equal(calls[0].cpf, '98765432100')
    assert.equal(calls[0].phone, '11988887777')
  } finally {
    patientRepository.getAll = originalGetAll
    patientRepository.create = originalCreate
  }
})

test('recoverCurrentPatient enriquece perfil com dados da listagem de usuarios', async () => {
  const originalGetAll = patientRepository.getAll
  const originalCreate = patientRepository.create
  const calls = []

  patientRepository.getAll = async () => []
  patientRepository.create = async (payload) => {
    calls.push(payload)
    return { id: 'patient-1', ...payload }
  }

  try {
    const patient = await recoverCurrentPatient(
      {
        email: 'maria@exemplo.com',
        id: 'user-1',
        isPatient: true,
        name: 'Maria Paciente',
      },
      [],
      [
        {
          cpf: '987.654.321-00',
          email: 'maria@exemplo.com',
          id: 'user-1',
          phone: '(11) 98888-7777',
        },
      ],
    )

    assert.equal(patient?.id, 'patient-1')
    assert.equal(calls[0].cpf, '98765432100')
  } finally {
    patientRepository.getAll = originalGetAll
    patientRepository.create = originalCreate
  }
})

test('recoverCurrentPatient desbloqueia agenda com escopo do proprio usuario quando nao ha vinculo', async () => {
  const patient = await recoverCurrentPatient(
    {
      email: 'maria@exemplo.com',
      id: 'auth-user-1',
      isPatient: true,
      name: 'Maria Paciente',
    },
    [],
  )

  assert.equal(patient?.id, 'auth-user-1')
  assert.equal(patient?.isScopedFallback, true)
})
