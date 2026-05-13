import assert from 'node:assert/strict'
import test from 'node:test'

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'

globalThis.Event = class Event {
  constructor(type) {
    this.type = type
  }
}

globalThis.window = {
  dispatchEvent() {},
  sessionStorage: {
    getItem() {
      return JSON.stringify({
        access_token: 'access-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      })
    },
    removeItem() {},
    setItem() {},
  },
}

test('patientRepository.getById busca o paciente direto por id', async () => {
  const calls = []

  globalThis.fetch = async (url) => {
    const requestUrl = String(url)
    calls.push(requestUrl)

    if (requestUrl.includes('/patients?')) {
      return Response.json([
        {
          id: 'patient-1',
          full_name: 'Ana Souza',
          cpf: '12345678900',
          birth_date: '1990-01-01',
        },
      ])
    }

    if (requestUrl.includes('/appointments?')) {
      return Response.json([])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { patientRepository } = await import('../src/repositories/patientRepository.js')
  const patient = await patientRepository.getById('patient-1')

  assert.equal(patient.id, 'patient-1')
  assert.equal(patient.name, 'Ana Souza')
  assert.ok(calls.some((url) => url.includes('/patients?') && url.includes('id=eq.patient-1')))
  assert.ok(calls.every((url) => !url.includes('/patients?select=*') || url.includes('id=eq.patient-1')))
})
