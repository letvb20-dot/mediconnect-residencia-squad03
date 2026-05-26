import assert from 'node:assert/strict'
import test from 'node:test'

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'

globalThis.window = {
  dispatchEvent() {},
  sessionStorage: {
    getItem() {
      return JSON.stringify({
        access_token: 'access-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'auth-user-1' },
      })
    },
    removeItem() {},
    setItem() {},
  },
}

test('appointmentRepository.create usa auth.uid da sessao como created_by', async () => {
  let requestBody

  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/rest\/v1\/appointments$/)
    requestBody = JSON.parse(options.body)

    return Response.json([
      {
        id: 'appointment-1',
        created_by: requestBody.created_by,
        doctor_id: requestBody.doctor_id,
        patient_id: requestBody.patient_id,
        scheduled_at: requestBody.scheduled_at,
        status: requestBody.status,
      },
    ])
  }

  const { appointmentRepository } = await import('../src/repositories/appointmentRepository.js')
  await appointmentRepository.create({
    createdBy: 'profile-row-1',
    date: '2026-05-27',
    patientId: 'patient-1',
    professionalId: 'doctor-1',
    status: 'Agendado',
    time: '09:00',
  })

  assert.equal(requestBody.created_by, 'auth-user-1')
  assert.equal(requestBody.patient_id, 'patient-1')
  assert.equal(requestBody.doctor_id, 'doctor-1')
})
