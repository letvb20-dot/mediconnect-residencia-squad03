import assert from 'node:assert/strict'
import test from 'node:test'

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'

const localStorageData = new Map()

globalThis.Event = class Event {
  constructor(type) {
    this.type = type
  }
}

globalThis.window = {
  dispatchEvent() {},
  localStorage: {
    clear() {
      localStorageData.clear()
    },
    getItem(key) {
      return localStorageData.has(key) ? localStorageData.get(key) : null
    },
    removeItem(key) {
      localStorageData.delete(key)
    },
    setItem(key, value) {
      localStorageData.set(key, String(value))
    },
  },
  sessionStorage: {
    getItem() {
      return JSON.stringify({
        access_token: 'access-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'user-1' },
      })
    },
    removeItem() {},
    setItem() {},
  },
}

test('userRepository.create envia CPF e dados medicos mesmo sem criar paciente', async () => {
  let body

  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/functions\/v1\/create-user$/)
    body = JSON.parse(options.body)
    return Response.json({ id: 'user-1' })
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  await userRepository.create({
    cpf: '123.456.789-01',
    create_patient_record: false,
    crm: 'CRM 45678',
    crm_uf: 'rj',
    email: 'medico@exemplo.com',
    full_name: 'Dr Joao Lima',
    phone: '(21) 99999-8888',
    role: 'medico',
    specialty: 'Clinica medica',
  })

  assert.equal(body.create_patient_record, false)
  assert.equal(body.cpf, '12345678901')
  assert.equal(body.phone_mobile, '21999998888')
  assert.equal(body.crm, '45678')
  assert.equal(body.crm_uf, 'RJ')
  assert.equal(body.specialty, 'Clinica medica')
})

test('userRepository.create cria registro de paciente automaticamente para role paciente', async () => {
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    const method = options.method || 'GET'
    calls.push({ body: options.body ? JSON.parse(options.body) : null, method, url: requestUrl })

    if (requestUrl.includes('/functions/v1/create-user')) {
      return Response.json({ id: 'user-1', email: 'paciente@exemplo.com' })
    }

    if (requestUrl.includes('/rest/v1/patients?')) {
      return Response.json([])
    }

    if (requestUrl.includes('/functions/v1/create-patient')) {
      return Response.json({ id: 'patient-1', full_name: 'Maria Paciente', cpf: '98765432100' })
    }

    if (requestUrl.includes('/rest/v1/profiles?id=eq.user-1') && method === 'PATCH') {
      return Response.json([{ id: 'user-1', patient_id: 'patient-1' }])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  const user = await userRepository.create({
    cpf: '987.654.321-00',
    create_patient_record: false,
    email: 'paciente@exemplo.com',
    full_name: 'Maria Paciente',
    phone: '(11) 98888-7777',
    role: 'paciente',
  })

  const createUser = calls.find((call) => call.url.includes('/functions/v1/create-user'))
  const createPatient = calls.find((call) => call.url.includes('/functions/v1/create-patient'))
  const profilePatch = calls.find((call) => call.url.includes('/rest/v1/profiles?id=eq.user-1') && call.method === 'PATCH')

  assert.equal(createUser.body.create_patient_record, true)
  assert.equal(createUser.body.cpf, '98765432100')
  assert.equal(createUser.body.phone_mobile, '11988887777')
  assert.equal(createUser.body.role, 'paciente')
  assert.equal(createPatient.body.cpf, '98765432100')
  assert.equal(createPatient.body.phone_mobile, '11988887777')
  assert.equal(profilePatch.body.patient_id, 'patient-1')
  assert.equal(user.patientId, 'patient-1')
})

test('userRepository.create nao falha quando API nao suporta vinculo direto do paciente no perfil', async () => {
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    const method = options.method || 'GET'
    calls.push({ body: options.body ? JSON.parse(options.body) : null, method, url: requestUrl })

    if (requestUrl.includes('/functions/v1/create-user')) {
      return Response.json({ id: 'user-1', email: 'paciente@exemplo.com' })
    }

    if (requestUrl.includes('/rest/v1/patients?')) {
      return Response.json([])
    }

    if (requestUrl.includes('/functions/v1/create-patient')) {
      return Response.json({ id: 'patient-1', full_name: 'Maria Paciente', cpf: '98765432100' })
    }

    if (requestUrl.includes('/rest/v1/profiles?') && method === 'PATCH') {
      return Response.json({ message: "Could not find the 'patient_id' column of 'profiles' in the schema cache" }, { status: 400 })
    }

    if (requestUrl.includes('/rest/v1/user_profiles?') && method === 'PATCH') {
      return Response.json({ message: 'relation "user_profiles" does not exist' }, { status: 404 })
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  const user = await userRepository.create({
    cpf: '987.654.321-00',
    email: 'paciente@exemplo.com',
    full_name: 'Maria Paciente',
    phone: '(11) 98888-7777',
    role: 'paciente',
  })

  const profilePatch = calls.find((call) => call.url.includes('/rest/v1/profiles?') && call.method === 'PATCH')

  assert.equal(profilePatch.body.patient_id, 'patient-1')
  assert.equal(user.patientId, 'patient-1')
})

test('userRepository.createWithPassword cria registro de paciente automaticamente para role paciente', async () => {
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    const method = options.method || 'GET'
    calls.push({ body: options.body ? JSON.parse(options.body) : null, method, url: requestUrl })

    if (requestUrl.includes('/functions/v1/create-user-with-password')) {
      return Response.json({ id: 'user-1', email: 'paciente@exemplo.com' })
    }

    if (requestUrl.includes('/rest/v1/patients?')) {
      return Response.json([])
    }

    if (requestUrl.includes('/functions/v1/create-patient')) {
      return Response.json({ id: 'patient-1', full_name: 'Maria Paciente', cpf: '98765432100' })
    }

    if (requestUrl.includes('/rest/v1/profiles?id=eq.user-1') && method === 'PATCH') {
      return Response.json([{ id: 'user-1', patient_id: 'patient-1' }])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  const user = await userRepository.createWithPassword({
    cpf: '987.654.321-00',
    create_patient_record: false,
    email: 'paciente@exemplo.com',
    full_name: 'Maria Paciente',
    password: 'SenhaForte123',
    phone: '(11) 98888-7777',
    role: 'paciente',
  })

  const createUser = calls.find((call) => call.url.includes('/functions/v1/create-user-with-password'))
  const createPatient = calls.find((call) => call.url.includes('/functions/v1/create-patient'))

  assert.equal(createUser.body.create_patient_record, true)
  assert.equal(createUser.body.cpf, '98765432100')
  assert.equal(createUser.body.phone_mobile, '11988887777')
  assert.equal(createUser.body.role, 'paciente')
  assert.equal(createUser.body.password, 'SenhaForte123')
  assert.equal(createPatient.body.cpf, '98765432100')
  assert.equal(createPatient.body.phone_mobile, '11988887777')
  assert.equal(user.patientId, 'patient-1')
})

test('userRepository.create reaproveita paciente existente por CPF sem duplicar', async () => {
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    const method = options.method || 'GET'
    calls.push({ body: options.body ? JSON.parse(options.body) : null, method, url: requestUrl })

    if (requestUrl.includes('/functions/v1/create-user')) {
      return Response.json({ id: 'user-1', email: 'paciente@exemplo.com' })
    }

    if (requestUrl.includes('/rest/v1/patients?')) {
      return Response.json([{ id: 'patient-1', email: 'paciente@exemplo.com', cpf: '98765432100' }])
    }

    if (requestUrl.includes('/rest/v1/profiles?id=eq.user-1') && method === 'PATCH') {
      return Response.json([{ id: 'user-1', patient_id: 'patient-1' }])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  const user = await userRepository.create({
    cpf: '987.654.321-00',
    email: 'paciente@exemplo.com',
    full_name: 'Maria Paciente',
    phone: '(11) 98888-7777',
    role: 'paciente',
  })

  assert.equal(calls.some((call) => call.url.includes('/functions/v1/create-patient')), false)
  assert.equal(user.patientId, 'patient-1')
})

test('userRepository.update cria paciente ao salvar usuario paciente existente sem vinculo', async () => {
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    const method = options.method || 'GET'
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ body, method, url: requestUrl })

    if (requestUrl.includes('/profiles?id=eq.user-1&select=*') && method === 'GET') {
      return Response.json([{ id: 'user-1', email: 'paciente@exemplo.com', full_name: 'Maria Paciente', role: 'paciente' }])
    }

    if (requestUrl.includes('/profiles?id=eq.user-1') && method === 'PATCH' && !body.patient_id) {
      return Response.json([{ id: 'user-1', email: 'paciente@exemplo.com', full_name: 'Maria Paciente', role: 'paciente' }])
    }

    if (requestUrl.includes('/rest/v1/patients?')) {
      return Response.json([])
    }

    if (requestUrl.includes('/functions/v1/create-patient')) {
      return Response.json({ id: 'patient-1', email: 'paciente@exemplo.com', cpf: '98765432100' })
    }

    if (requestUrl.includes('/profiles?id=eq.user-1') && method === 'PATCH' && body.patient_id) {
      return Response.json([{ id: 'user-1', patient_id: 'patient-1' }])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  const user = await userRepository.update('user-1', {
    cpf: '987.654.321-00',
    email: 'paciente@exemplo.com',
    full_name: 'Maria Paciente',
    phone: '(11) 98888-7777',
    role: 'paciente',
  })

  const createPatient = calls.find((call) => call.url.includes('/functions/v1/create-patient'))
  const patientLinkPatch = calls.find((call) => call.method === 'PATCH' && call.body?.patient_id === 'patient-1')

  assert.equal(createPatient.body.cpf, '98765432100')
  assert.equal(patientLinkPatch.body.patient_id, 'patient-1')
  assert.equal(user.patientId, 'patient-1')
})

test('userRepository.getAll mescla dados de medico nos detalhes do usuario', async () => {
  globalThis.fetch = async (url) => {
    const requestUrl = String(url)

    if (requestUrl.includes('/profiles?')) {
      return Response.json([
        {
          avatar_url: 'users/user-1/avatar.png',
          id: 'user-1',
          email: 'medico@exemplo.com',
          full_name: 'Dr Joao Lima',
          role: 'medico',
        },
      ])
    }

    if (requestUrl.includes('/user_roles?')) {
      return Response.json([{ user_id: 'user-1', role: 'medico' }])
    }

    if (requestUrl.includes('/doctors?')) {
      return Response.json([
        {
          id: 'doctor-1',
          user_id: 'user-1',
          cpf: '12345678901',
          crm: '45678',
          crm_uf: 'RJ',
          specialty: 'Clinica medica',
        },
      ])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  const users = await userRepository.getAll()

  assert.equal(users[0].cpf, '123.456.789-01')
  assert.match(users[0].avatarUrl, /\/object\/public\/avatars\/users\/user-1\/avatar\.png$/)
  assert.equal(users[0].crm, '45678')
  assert.equal(users[0].crm_uf, 'RJ')
  assert.equal(users[0].specialty, 'Clinica medica')
})

test('userRepository.update sincroniza dados do medico na tabela doctors', async () => {
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    calls.push({ body: options.body ? JSON.parse(options.body) : null, method: options.method || 'GET', url: requestUrl })

    if (requestUrl.includes('/profiles?')) {
      return Response.json([{ id: 'user-1', email: 'novo@exemplo.com', full_name: 'Dra Nome Novo', role: 'medico' }])
    }

    if (requestUrl.includes('/doctors?')) {
      return Response.json([
        {
          id: 'doctor-1',
          user_id: 'user-1',
          cpf: '12345678901',
          crm: '45678',
          crm_uf: 'SP',
          full_name: 'Dra Nome Novo',
          specialty: 'Cardiologia',
        },
      ])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  const user = await userRepository.update('user-1', {
    cpf: '123.456.789-01',
    crm: 'CRM 45678',
    crm_uf: 'sp',
    email: 'novo@exemplo.com',
    full_name: 'Dra Nome Novo',
    doctorId: 'doctor-1',
    phone: '(11) 99999-8888',
    role: 'medico',
    specialty: 'Cardiologia',
  })

  const doctorPatch = calls.find((call) => call.url.includes('/doctors?') && call.method === 'PATCH')
  assert.ok(doctorPatch)
  assert.match(doctorPatch.url, /\/doctors\?id=eq.doctor-1/)
  assert.equal(doctorPatch.body.full_name, 'Dra Nome Novo')
  assert.equal(doctorPatch.body.crm, '45678')
  assert.equal(doctorPatch.body.crm_uf, 'SP')
  assert.equal(doctorPatch.body.specialty, 'Cardiologia')
  assert.equal(user.doctorId, 'doctor-1')
})

test('userRepository.update continua sincronizacao quando doctors nao retorna linha para um identificador', async () => {
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    calls.push({ body: options.body ? JSON.parse(options.body) : null, method: options.method || 'GET', url: requestUrl })

    if (requestUrl.includes('/profiles?')) {
      return Response.json([{ id: 'user-1', email: 'medico@exemplo.com', full_name: 'Dra Nome Atualizado', role: 'medico' }])
    }

    if (requestUrl.includes('/doctors?user_id=eq.user-1') || requestUrl.includes('/doctors?auth_user_id=eq.user-1')) {
      return Response.json([])
    }

    if (requestUrl.includes('/doctors?email=eq.medico%40exemplo.com')) {
      return Response.json([
        {
          id: 'doctor-1',
          user_id: 'auth-user-1',
          email: 'medico@exemplo.com',
          full_name: 'Dra Nome Atualizado',
          crm: '45678',
          crm_uf: 'SP',
          specialty: 'Cardiologia',
        },
      ])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  const user = await userRepository.update('user-1', {
    crm: '45678',
    crm_uf: 'SP',
    email: 'medico@exemplo.com',
    full_name: 'Dra Nome Atualizado',
    role: 'medico',
    specialty: 'Cardiologia',
  })

  assert.ok(calls.some((call) => call.url.includes('/doctors?user_id=eq.user-1') && call.method === 'PATCH'))
  assert.ok(calls.some((call) => call.url.includes('/doctors?email=eq.medico%40exemplo.com') && call.method === 'PATCH'))
  assert.equal(user.doctorId, 'doctor-1')
  assert.equal(user.full_name, 'Dra Nome Atualizado')
})

test('professionalRepository.getAll prefere nome atualizado do perfil vinculado', async () => {
  window.localStorage.clear()

  globalThis.fetch = async (url) => {
    const requestUrl = String(url)

    if (requestUrl.includes('/doctors?')) {
      return Response.json([{ id: 'doctor-1', user_id: 'user-1', full_name: 'Nome Antigo', email: 'medico@exemplo.com' }])
    }

    if (requestUrl.includes('/profiles?')) {
      return Response.json([{ id: 'user-1', full_name: 'Nome Atualizado', email: 'medico@exemplo.com' }])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { professionalRepository } = await import('../src/repositories/professionalRepository.js')
  const professionals = await professionalRepository.getAll()

  assert.equal(professionals[0].name, 'Nome Atualizado')
})

test('userRepository.update usa doctor_id de profiles para atualizar doctors correspondente', async () => {
  window.localStorage.clear()
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    const method = options.method || 'GET'
    calls.push({ body: options.body ? JSON.parse(options.body) : null, method, url: requestUrl })

    if (requestUrl.includes('/profiles?') && method === 'PATCH') {
      return Response.json([{ id: 'user-1', doctor_id: 'doctor-1', email: 'medico@exemplo.com', full_name: 'Nome Editado Pela Secretaria', role: 'medico' }])
    }

    if (requestUrl.includes('/doctors?id=eq.doctor-1') && method === 'PATCH') {
      return Response.json([{
        id: 'doctor-1',
        user_id: 'user-1',
        email: 'medico@exemplo.com',
        full_name: 'Nome Editado Pela Secretaria',
      }])
    }

    if (requestUrl.includes('/doctors?') && method === 'GET') {
      return Response.json([{ id: 'doctor-1', user_id: 'user-1', full_name: 'Nome Editado Pela Secretaria', email: 'medico@exemplo.com' }])
    }

    if (requestUrl.includes('/profiles?') && method === 'GET') {
      return Response.json([])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  await userRepository.update('user-1', {
    email: 'medico@exemplo.com',
    full_name: 'Nome Editado Pela Secretaria',
    role: 'medico',
  })

  const doctorPatch = calls.find((call) => call.url.includes('/doctors?id=eq.doctor-1') && call.method === 'PATCH')
  assert.ok(doctorPatch)
  assert.equal(doctorPatch.body.full_name, 'Nome Editado Pela Secretaria')

  const { professionalRepository } = await import('../src/repositories/professionalRepository.js')
  const professionals = await professionalRepository.getAll()

  assert.equal(professionals[0].name, 'Nome Editado Pela Secretaria')
})

test('userRepository.update nao mascara sincronizacao de doctors sem confirmacao', async () => {
  window.localStorage.clear()

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    const method = options.method || 'GET'

    if (requestUrl.includes('/profiles?id=eq.user-1') && method === 'GET') {
      return Response.json([{
        id: 'user-1',
        doctor_id: 'doctor-1',
        email: 'medico@exemplo.com',
        full_name: 'Nome Antigo',
        role: 'medico',
      }])
    }

    if (requestUrl.includes('/profiles?id=eq.user-1') && method === 'PATCH') {
      return Response.json([{
        id: 'user-1',
        doctor_id: 'doctor-1',
        email: 'medico@exemplo.com',
        full_name: 'Nome Atualizado',
        role: 'medico',
      }])
    }

    if (requestUrl.includes('/doctors?id=eq.doctor-1') && method === 'PATCH') {
      return Response.json([])
    }

    if (requestUrl.includes('/doctors?') && method === 'GET') {
      return Response.json([{ id: 'doctor-1', user_id: 'user-1', full_name: 'Nome Antigo', email: 'medico@exemplo.com' }])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  await assert.rejects(
    () => userRepository.update('user-1', {
      email: 'medico@exemplo.com',
      full_name: 'Nome Atualizado',
      role: 'medico',
    }),
    /Nao foi possivel sincronizar o cadastro do medico correspondente/
  )
})

test('userRepository.update preserva doctor_id existente quando secretária edita perfil médico', async () => {
  window.localStorage.clear()
  const calls = []
  const profileRow = {
    id: 'user-1',
    doctor_id: 'doctor-1',
    email: 'medico@exemplo.com',
    full_name: 'Nome Antigo',
    role: 'medico',
  }
  const doctorRow = {
    id: 'doctor-1',
    user_id: 'user-1',
    full_name: 'Nome Antigo',
    email: 'medico@exemplo.com',
  }

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    const method = options.method || 'GET'
    calls.push({ body: options.body ? JSON.parse(options.body) : null, method, url: requestUrl })

    if (requestUrl.includes('/profiles?') && requestUrl.includes('id=eq.user-1') && method === 'GET') {
      return Response.json([profileRow])
    }

    if (requestUrl.includes('/profiles?id=eq.user-1') && method === 'PATCH') {
      Object.assign(profileRow, options.body ? JSON.parse(options.body) : {})
      return Response.json([])
    }

    if (requestUrl.includes('/doctors?id=eq.doctor-1') && method === 'PATCH') {
      Object.assign(doctorRow, options.body ? JSON.parse(options.body) : {})
      return Response.json([])
    }

    if (requestUrl.includes('/doctors?') && method === 'GET') {
      return Response.json([doctorRow])
    }

    if (requestUrl.includes('/profiles?') && method === 'GET') {
      return Response.json([])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  const user = await userRepository.update('user-1', {
    email: 'medico@exemplo.com',
    full_name: 'Nome Editado Pela Secretaria',
    role: 'medico',
  })

  const doctorPatch = calls.find((call) => call.url.includes('/doctors?id=eq.doctor-1') && call.method === 'PATCH')
  assert.ok(doctorPatch)
  assert.equal(doctorPatch.body.full_name, 'Nome Editado Pela Secretaria')
  assert.equal(user.doctorId, 'doctor-1')
  assert.equal(user.full_name, 'Nome Editado Pela Secretaria')

  const { professionalRepository } = await import('../src/repositories/professionalRepository.js')
  window.localStorage.clear()
  const professionals = await professionalRepository.getAll()

  assert.equal(professionals[0].name, 'Nome Editado Pela Secretaria')
})
