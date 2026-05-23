import assert from 'node:assert/strict'
import test from 'node:test'

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'

test('profileRepository expõe patientId vindo do paciente aninhado no perfil', async () => {
  const { authRepository } = await import('../src/repositories/authRepository.js')
  const { profileRepository } = await import('../src/repositories/profileRepository.js')
  const originalGetUser = authRepository.getUser

  authRepository.getUser = async () => ({
    profile: {
      id: 'profile-1',
      email: 'maria@exemplo.com',
      full_name: 'Maria Paciente',
      role: 'paciente',
      paciente: {
        id: 'patient-1',
        cpf: '98765432100',
      },
    },
    user: {
      id: 'auth-user-1',
    },
  })

  try {
    const profile = await profileRepository.getCurrentUserProfile()

    assert.equal(profile.isPatient, true)
    assert.equal(profile.patientId, 'patient-1')
    assert.equal(profile.patient.id, 'patient-1')
    assert.equal(profile.cpf, '98765432100')
  } finally {
    authRepository.getUser = originalGetUser
  }
})

test('profileRepository usa metadados da sessao quando user-info nao traz CPF e telefone', async () => {
  const { authRepository } = await import('../src/repositories/authRepository.js')
  const { profileRepository } = await import('../src/repositories/profileRepository.js')
  const originalGetUser = authRepository.getUser
  const originalWindow = globalThis.window

  globalThis.window = {
    localStorage: {
      getItem() {
        return null
      },
      removeItem() {},
      setItem() {},
    },
    sessionStorage: {
      getItem() {
        return JSON.stringify({
          user: {
            id: 'auth-user-1',
            email: 'maria@exemplo.com',
            user_metadata: {
              cpf: '98765432100',
              phone: '11988887777',
            },
          },
        })
      },
    },
  }

  authRepository.getUser = async () => ({
    profile: {
      id: 'auth-user-1',
      full_name: 'Maria Paciente',
      role: 'paciente',
    },
  })

  try {
    const profile = await profileRepository.getCurrentUserProfile()

    assert.equal(profile.isPatient, true)
    assert.equal(profile.email, 'maria@exemplo.com')
    assert.equal(profile.cpf, '98765432100')
    assert.equal(profile.phone, '11988887777')
  } finally {
    authRepository.getUser = originalGetUser
    globalThis.window = originalWindow
  }
})

test('profileRepository expoe patientId quando pacientes vem em array', async () => {
  const { authRepository } = await import('../src/repositories/authRepository.js')
  const { profileRepository } = await import('../src/repositories/profileRepository.js')
  const originalGetUser = authRepository.getUser

  authRepository.getUser = async () => ({
    profile: {
      id: 'profile-1',
      full_name: 'Maria Paciente',
      role: 'paciente',
      patients: [
        {
          id: 'patient-1',
          email: 'maria@exemplo.com',
        },
      ],
    },
    user: {
      id: 'auth-user-1',
    },
  })

  try {
    const profile = await profileRepository.getCurrentUserProfile()

    assert.equal(profile.isPatient, true)
    assert.equal(profile.patientId, 'patient-1')
    assert.equal(profile.email, 'maria@exemplo.com')
  } finally {
    authRepository.getUser = originalGetUser
  }
})

test('profileRepository expõe patientId vindo de aliases no usuario', async () => {
  const { authRepository } = await import('../src/repositories/authRepository.js')
  const { profileRepository } = await import('../src/repositories/profileRepository.js')
  const originalGetUser = authRepository.getUser

  authRepository.getUser = async () => ({
    profile: {
      id: 'profile-1',
      full_name: 'Maria Paciente',
      role: 'paciente',
    },
    user: {
      id: 'auth-user-1',
      email: 'maria@exemplo.com',
      patient_id: 'patient-1',
    },
  })

  try {
    const profile = await profileRepository.getCurrentUserProfile()

    assert.equal(profile.isPatient, true)
    assert.equal(profile.patientId, 'patient-1')
  } finally {
    authRepository.getUser = originalGetUser
  }
})

test('profileRepository.updateCurrentUserProfile salva dados do perfil na API', async () => {
  const { authRepository } = await import('../src/repositories/authRepository.js')
  const { profileRepository } = await import('../src/repositories/profileRepository.js')
  const originalGetUser = authRepository.getUser
  const originalWindow = globalThis.window
  const calls = []

  globalThis.window = {
    dispatchEvent() {},
    sessionStorage: {
      getItem() {
        return JSON.stringify({
          access_token: 'access-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: 'auth-user-1', email: 'maria@exemplo.com' },
        })
      },
      removeItem() {},
      setItem() {},
    },
  }

  authRepository.getUser = async () => ({
    profile: {
      id: 'profile-1',
      email: 'maria@exemplo.com',
      full_name: 'Maria Antiga',
      phone: '11988887777',
      role: 'paciente',
      unit: 'Unidade Centro',
    },
    user: {
      id: 'auth-user-1',
    },
  })

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    const body = JSON.parse(options.body)
    calls.push({ body, headers: options.headers, method: options.method, url: requestUrl })

    if (requestUrl.includes('/rest/v1/profiles?id=eq.profile-1') && options.method === 'PATCH') {
      assert.equal(options.headers.Prefer, 'return=representation')
      return Response.json([{ id: 'profile-1', role: 'paciente', ...body }])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  try {
    const updated = await profileRepository.updateCurrentUserProfile({
      email: 'maria.nova@exemplo.com',
      name: 'Maria Nova',
      phone: '11977776666',
      unit: 'Unidade Sul',
    })

    assert.deepEqual(calls[0].body, {
      email: 'maria.nova@exemplo.com',
      full_name: 'Maria Nova',
      phone: '11977776666',
      unit: 'Unidade Sul',
    })
    assert.equal(updated.name, 'Maria Nova')
    assert.equal(updated.email, 'maria.nova@exemplo.com')
    assert.equal(updated.unit, 'Unidade Sul')
  } finally {
    authRepository.getUser = originalGetUser
    globalThis.window = originalWindow
  }
})

test('profileRepository.updateCurrentUserProfile nao chama API quando nao ha alteracao', async () => {
  const { authRepository } = await import('../src/repositories/authRepository.js')
  const { profileRepository } = await import('../src/repositories/profileRepository.js')
  const originalGetUser = authRepository.getUser
  const originalFetch = globalThis.fetch

  authRepository.getUser = async () => ({
    profile: {
      id: 'profile-1',
      email: 'maria@exemplo.com',
      full_name: 'Maria Paciente',
      phone: '11988887777',
      role: 'paciente',
      unit: 'Unidade Centro',
    },
  })

  globalThis.fetch = async (url) => {
    throw new Error(`URL inesperada: ${url}`)
  }

  try {
    const updated = await profileRepository.updateCurrentUserProfile({
      email: 'maria@exemplo.com',
      name: 'Maria Paciente',
      phone: '11988887777',
      unit: 'Unidade Centro',
    })

    assert.equal(updated.name, 'Maria Paciente')
    assert.equal(updated.email, 'maria@exemplo.com')
  } finally {
    authRepository.getUser = originalGetUser
    globalThis.fetch = originalFetch
  }
})

test('profileRepository.updateAvatar sincroniza avatar do usuario paciente com patients', async () => {
  const { authRepository } = await import('../src/repositories/authRepository.js')
  const { profileRepository } = await import('../src/repositories/profileRepository.js')
  const originalGetUser = authRepository.getUser
  const originalWindow = globalThis.window
  const calls = []
  const file = new Blob(['avatar'], { type: 'image/png' })
  file.name = 'avatar.png'

  globalThis.window = {
    dispatchEvent() {},
    sessionStorage: {
      getItem() {
        return JSON.stringify({
          access_token: 'access-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: 'auth-user-1', email: 'maria@exemplo.com' },
        })
      },
      removeItem() {},
      setItem() {},
    },
  }

  authRepository.getUser = async () => ({
    profile: {
      id: 'profile-1',
      email: 'maria@exemplo.com',
      full_name: 'Maria Paciente',
      patient_id: 'patient-1',
      role: 'paciente',
    },
    user: {
      id: 'auth-user-1',
    },
  })

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    calls.push({
      body: typeof options.body === 'string' ? JSON.parse(options.body) : null,
      headers: options.headers,
      method: options.method || 'GET',
      url: requestUrl,
    })

    if (requestUrl.includes('/storage/v1/object/avatars/profile-1/avatar.png')) {
      return Response.json({ Key: 'ok' })
    }

    if (requestUrl.includes('/rest/v1/profiles?id=eq.profile-1') && options.method === 'PATCH') {
      assert.equal(options.headers.Prefer, 'return=representation')
      const body = JSON.parse(options.body)
      return Response.json([{ id: 'profile-1', avatar_url: body.avatar_url }])
    }

    if (requestUrl.includes('/rest/v1/patients?id=eq.patient-1') && options.method === 'PATCH') {
      assert.equal(options.headers.Prefer, 'return=representation')
      const body = JSON.parse(options.body)
      return Response.json([{ id: 'patient-1', avatar_url: body.avatar_url }])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  try {
    const result = await profileRepository.updateAvatar(file)
    const profilePatch = calls.find((call) => call.url.includes('/rest/v1/profiles?id=eq.profile-1'))
    const patientPatch = calls.find((call) => call.url.includes('/rest/v1/patients?id=eq.patient-1'))

    assert.match(result.avatarUrl, /\/object\/public\/avatars\/profile-1\/avatar\.png$/)
    assert.equal(profilePatch.body.avatar_url, result.avatarUrl)
    assert.equal(patientPatch.body.avatar_url, result.avatarUrl)
  } finally {
    authRepository.getUser = originalGetUser
    globalThis.window = originalWindow
  }
})

test('profileRepository.updateAvatar falha quando a API nao confirma avatar no perfil', async () => {
  const { authRepository } = await import('../src/repositories/authRepository.js')
  const { profileRepository } = await import('../src/repositories/profileRepository.js')
  const originalGetUser = authRepository.getUser
  const originalWindow = globalThis.window
  const file = new Blob(['avatar'], { type: 'image/png' })
  file.name = 'avatar.png'

  globalThis.window = {
    dispatchEvent() {},
    sessionStorage: {
      getItem() {
        return JSON.stringify({
          access_token: 'access-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: 'auth-user-1', email: 'maria@exemplo.com' },
        })
      },
      removeItem() {},
      setItem() {},
    },
  }

  authRepository.getUser = async () => ({
    profile: {
      id: 'profile-1',
      email: 'maria@exemplo.com',
      full_name: 'Maria Paciente',
      role: 'admin',
    },
    user: {
      id: 'auth-user-1',
    },
  })

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)

    if (requestUrl.includes('/storage/v1/object/avatars/profile-1/avatar.png')) {
      return Response.json({ Key: 'ok' })
    }

    if (requestUrl.includes('/rest/v1/profiles?') || requestUrl.includes('/rest/v1/user_profiles?')) {
      assert.equal(options.headers.Prefer, 'return=representation')
      return Response.json([])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  try {
    await assert.rejects(
      () => profileRepository.updateAvatar(file),
      /API nao retornou confirmacao/,
    )
  } finally {
    authRepository.getUser = originalGetUser
    globalThis.window = originalWindow
  }
})
