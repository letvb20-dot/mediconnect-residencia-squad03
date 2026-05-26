import assert from 'node:assert/strict'
import test from 'node:test'

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'

const session = {
  access_token: 'access-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
}

function mockAuthenticatedWindow(t) {
  const originalWindow = globalThis.window

  globalThis.window = {
    dispatchEvent() {},
    sessionStorage: {
      getItem() {
        return JSON.stringify(session)
      },
      removeItem() {},
      setItem() {},
    },
  }

  t.after(() => {
    globalThis.window = originalWindow
  })
}

function mockFetch(t, handler) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = handler
  t.after(() => {
    globalThis.fetch = originalFetch
  })
}

test('normalizeSmsPhone formata telefones para o contrato do Twilio', async () => {
  const { buildSmsMessage, normalizeSmsPhone } = await import('../src/repositories/communicationRepository.js')

  assert.equal(normalizeSmsPhone('(11) 99999-9999'), '+5511999999999')
  assert.equal(normalizeSmsPhone('5511988887777'), '+5511988887777')
  assert.equal(normalizeSmsPhone('+12125550199'), '+12125550199')
  assert.equal(normalizeSmsPhone('12345'), '')
  assert.match(buildSmsMessage({ patientName: 'Maria', content: 'Consulta amanha' }), /Ol\u00e1 Maria/)
})

test('sendSms chama /functions/v1/send-sms com headers autenticados e payload documentado', async (t) => {
  mockAuthenticatedWindow(t)

  const calls = []
  mockFetch(t, async (url, options = {}) => {
    const call = {
      body: options.body ? JSON.parse(options.body) : null,
      headers: options.headers || {},
      method: options.method || 'GET',
      url: String(url),
    }
    calls.push(call)

    if (call.url.endsWith('/functions/v1/send-sms')) {
      return Response.json({ message: 'SMS enviado', sid: 'SM123', success: true })
    }

    if (call.url.includes('/rest/v1/communication_logs')) {
      return new Response(null, { status: 201 })
    }

    throw new Error(`URL inesperada: ${call.url}`)
  })

  const { communicationRepository } = await import('../src/repositories/communicationRepository.js')
  const patientId = '123e4567-e89b-42d3-a456-426614174000'
  const result = await communicationRepository.sendSms({
    content: 'Consulta amanha as 14h',
    patientId,
    patientName: 'Maria',
    phone: '(11) 99999-9999',
  })

  assert.equal(calls[0].method, 'POST')
  assert.match(calls[0].url, /\/functions\/v1\/send-sms$/)
  assert.equal(calls[0].headers.apikey, 'anon-key')
  assert.equal(calls[0].headers.Authorization, 'Bearer access-token')
  assert.equal(calls[0].body.patient_id, patientId)
  assert.equal(calls[0].body.phone_number, '+5511999999999')
  assert.match(calls[0].body.message, /^\[MediConnect\] Ol\u00e1 Maria/)
  assert.equal(result.sid, 'SM123')

  assert.match(calls[1].url, /\/rest\/v1\/communication_logs$/)
  assert.equal(calls[1].body.content, calls[0].body.message)
  assert.equal(calls[1].body.response, 'Twilio SID: SM123')
  assert.equal(calls[1].body.status, 'entregue')
})

test('sendSms rejeita telefone invalido antes de chamar a API', async (t) => {
  mockAuthenticatedWindow(t)

  let fetchCalls = 0
  mockFetch(t, async () => {
    fetchCalls += 1
    return Response.json({})
  })

  const { communicationRepository } = await import('../src/repositories/communicationRepository.js')

  await assert.rejects(
    () => communicationRepository.sendSms({
      content: 'Mensagem',
      patientId: 'patient-1',
      patientName: 'Maria',
      phone: '12345',
    }),
    /telefone inválido/,
  )
  assert.equal(fetchCalls, 0)
})

test('sendSms preserva erro 503 de servico SMS desabilitado', async (t) => {
  mockAuthenticatedWindow(t)

  mockFetch(t, async () => Response.json(
    {
      detail: 'O servico de envio de SMS esta temporariamente desabilitado.',
      status: 503,
      title: 'Servico Desabilitado',
      type: 'https://docs.mediconnectai.com/errors/service-disabled',
    },
    { status: 503 },
  ))

  const { communicationRepository } = await import('../src/repositories/communicationRepository.js')

  await assert.rejects(
    () => communicationRepository.sendSms({
      content: 'Mensagem',
      patientId: '123e4567-e89b-42d3-a456-426614174000',
      patientName: 'Maria',
      phone: '(11) 99999-9999',
    }),
    /503/,
  )
})

test('getInitialMessages le historico vindo de sms_logs', async (t) => {
  mockAuthenticatedWindow(t)

  mockFetch(t, async (url) => {
    assert.match(String(url), /\/rest\/v1\/sms_logs\?/)

    return Response.json([
      {
        created_at: '2026-05-26T12:00:00Z',
        id: 'log-1',
        patients: { full_name: 'Maria' },
        phone_number: '+5511999999999',
        sid: 'SM123',
        status: 'sent',
      },
    ])
  })

  const { communicationRepository } = await import('../src/repositories/communicationRepository.js')
  const messages = await communicationRepository.getInitialMessages()

  assert.equal(messages[0].channel, 'sms')
  assert.equal(messages[0].patient, 'Maria')
  assert.equal(messages[0].response, 'SM123')
  assert.equal(messages[0].status, 'entregue')
  assert.equal(messages[0].template, 'SMS Twilio')
})
