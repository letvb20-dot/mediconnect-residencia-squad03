import assert from 'node:assert/strict'
import test from 'node:test'

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'

function mockWindow(t) {
  const originalWindow = globalThis.window
  const storage = new Map()

  globalThis.Event = globalThis.Event || class Event {
    constructor(type) {
      this.type = type
    }
  }

  globalThis.window = {
    dispatchEvent() {},
    location: { origin: 'http://localhost:5173' },
    sessionStorage: {
      getItem(key) {
        return storage.get(key) || null
      },
      removeItem(key) {
        storage.delete(key)
      },
      setItem(key, value) {
        storage.set(key, value)
      },
    },
  }

  t.after(() => {
    globalThis.window = originalWindow
  })

  return storage
}

test('authRepository.login usa /auth/v1/token com grant_type=password', async (t) => {
  const storage = mockWindow(t)
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    calls.push({
      body: JSON.parse(options.body),
      headers: options.headers,
      method: options.method,
      url: String(url),
    })

    return Response.json({
      access_token: 'access-token',
      expires_in: 3600,
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      user: { email: 'user@example.com', id: 'user-1' },
    })
  }

  const { authRepository } = await import('../src/repositories/authRepository.js')
  const session = await authRepository.login({ email: ' user@example.com ', password: 'secret' })

  assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=password$/)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].headers.apikey, 'anon-key')
  assert.equal(calls[0].headers.Authorization, 'Bearer anon-key')
  assert.deepEqual(calls[0].body, { email: 'user@example.com', password: 'secret' })
  assert.equal(session.access_token, 'access-token')
  assert.match(storage.get('mediconnect.auth.session'), /access-token/)
})

test('authRepository.requestPasswordReset usa endpoint publico sem bearer anon', async (t) => {
  mockWindow(t)
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    calls.push({
      body: JSON.parse(options.body),
      headers: options.headers,
      method: options.method,
      url: String(url),
    })

    return Response.json({ success: true })
  }

  const { authRepository } = await import('../src/repositories/authRepository.js')
  await authRepository.requestPasswordReset('reset@example.com')

  assert.match(calls[0].url, /\/functions\/v1\/request-password-reset$/)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].headers.apikey, 'anon-key')
  assert.equal(calls[0].headers.Authorization, undefined)
  assert.deepEqual(calls[0].body, {
    email: 'reset@example.com',
    redirect_url: 'http://localhost:5173/login',
  })
})

test('authRepository.getUser cai para /auth/v1/user quando user-info indisponivel', async (t) => {
  const storage = mockWindow(t)
  storage.set('mediconnect.auth.session', JSON.stringify({
    access_token: 'access-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  }))
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ headers: options.headers, method: options.method || 'GET', url: String(url) })

    if (String(url).includes('/functions/v1/user-info')) {
      return Response.json({ error: 'not found' }, { status: 404 })
    }

    if (String(url).includes('/auth/v1/user')) {
      return Response.json({ email: 'user@example.com', id: 'user-1' })
    }

    throw new Error(`URL inesperada: ${url}`)
  }

  const { authRepository } = await import('../src/repositories/authRepository.js')
  const user = await authRepository.getUser()

  assert.match(calls[0].url, /\/functions\/v1\/user-info$/)
  assert.equal(calls[0].method, 'POST')
  assert.match(calls[1].url, /\/auth\/v1\/user$/)
  assert.equal(calls[1].method, 'GET')
  assert.equal(calls[1].headers.Authorization, 'Bearer access-token')
  assert.deepEqual(user, { email: 'user@example.com', id: 'user-1' })
})
