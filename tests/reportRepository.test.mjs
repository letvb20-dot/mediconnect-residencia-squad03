import assert from 'node:assert/strict'
import test from 'node:test'

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'

function mockAuthenticatedWindow(t) {
  const originalWindow = globalThis.window

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

  t.after(() => {
    globalThis.window = originalWindow
  })
}

test('reportRepository resolve solicitante por profiles quando reports traz UUID', async (t) => {
  mockAuthenticatedWindow(t)

  globalThis.fetch = async (url) => {
    const requestUrl = String(url)

    if (requestUrl.includes('/rest/v1/reports?')) {
      return Response.json([
        {
          created_at: '2026-05-26T12:00:00Z',
          id: 'report-1',
          patient_id: 'patient-1',
          requested_by: 'profile-1',
          status: 'draft',
        },
      ])
    }

    if (requestUrl.includes('/rest/v1/doctors?') || requestUrl.includes('/rest/v1/medicos?')) {
      return Response.json([])
    }

    if (requestUrl.includes('/rest/v1/profiles?')) {
      return Response.json([{ full_name: 'Dra. Ana Souza', id: 'profile-1' }])
    }

    if (requestUrl.includes('/rest/v1/user_profiles?')) {
      return Response.json([], { status: 404 })
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { reportRepository } = await import('../src/repositories/reportRepository.js')
  const reports = await reportRepository.getInitialReports()

  assert.equal(reports[0].requestedBy, 'Dra. Ana Souza')
  assert.equal(reports[0].requestedById, 'profile-1')
})
