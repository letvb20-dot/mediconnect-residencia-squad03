import assert from 'node:assert/strict'
import test from 'node:test'

import { communicationRepository } from '../src/repositories/communicationRepository.js'
import {
  buildWaitlistNotificationContent,
  sendWaitlistNotification,
} from '../src/utils/waitlistNotification.js'

test('sendWaitlistNotification envia WhatsApp para o paciente da lista de espera', async () => {
  const originalSendWhatsApp = communicationRepository.sendWhatsApp
  const originalSendSms = communicationRepository.sendSms
  const calls = []

  communicationRepository.sendWhatsApp = async (payload) => {
    calls.push({ channel: 'whatsapp', ...payload })
    return { id: 'WA123', success: true }
  }
  communicationRepository.sendSms = async (payload) => {
    calls.push({ channel: 'sms', ...payload })
    return { sid: 'SM123', success: true }
  }

  try {
    await sendWaitlistNotification(
      {
        channel: 'whatsapp',
        doctorName: 'Dra. Ana',
        patientId: 'patient-1',
        patientName: 'Maria',
        preferredType: 'presencial',
        reason: 'Pode vir no fim da tarde',
      },
      {
        patients: [{ id: 'patient-1', phone: '(79) 99114-8174' }],
      },
    )

    assert.equal(calls.length, 1)
    assert.equal(calls[0].channel, 'whatsapp')
    assert.equal(calls[0].fallbackSms, false)
    assert.equal(calls[0].phone, '(79) 99114-8174')
    assert.equal(calls[0].patientName, 'Maria')
    assert.match(calls[0].content, /possibilidade de encaixe/)
  } finally {
    communicationRepository.sendWhatsApp = originalSendWhatsApp
    communicationRepository.sendSms = originalSendSms
  }
})

test('sendWaitlistNotification usa SMS quando o canal escolhido for SMS', async () => {
  const originalSendSms = communicationRepository.sendSms
  const calls = []

  communicationRepository.sendSms = async (payload) => {
    calls.push(payload)
    return { sid: 'SM123', success: true }
  }

  try {
    await sendWaitlistNotification(
      {
        channel: 'sms',
        patientId: 'patient-1',
        patientName: 'Maria',
        patientPhone: '(11) 99999-8888',
      },
      { patients: [] },
    )

    assert.equal(calls.length, 1)
    assert.equal(calls[0].phone, '(11) 99999-8888')
  } finally {
    communicationRepository.sendSms = originalSendSms
  }
})

test('sendWaitlistNotification nao marca sucesso sem telefone', async () => {
  const originalRegisterMessage = communicationRepository.registerMessage
  const logs = []

  communicationRepository.registerMessage = async (payload) => {
    logs.push(payload)
    return true
  }

  try {
    await assert.rejects(
      () => sendWaitlistNotification(
        {
          channel: 'whatsapp',
          patientId: 'patient-1',
          patientName: 'Maria',
        },
        { patients: [{ id: 'patient-1' }] },
      ),
      /telefone cadastrado/,
    )

    assert.equal(logs.length, 1)
    assert.equal(logs[0].channel, 'whatsapp')
    assert.equal(logs[0].status, 'falha')
  } finally {
    communicationRepository.registerMessage = originalRegisterMessage
  }
})

test('buildWaitlistNotificationContent inclui medico e modalidade', () => {
  assert.equal(
    buildWaitlistNotificationContent({
      doctorName: 'Dra. Ana',
      preferredType: 'telemedicina',
    }),
    'temos uma possibilidade de encaixe para sua consulta por teleconsulta com Dra. Ana. Responda esta mensagem ou entre em contato com a clinica para confirmar.',
  )
})
