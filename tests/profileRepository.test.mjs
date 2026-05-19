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
