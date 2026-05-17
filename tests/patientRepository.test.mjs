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
        user: { id: 'user-1' },
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

test('patientRepository.getDirectoryRows lista todos os pacientes mesmo com doctorId', async () => {
  const calls = []

  globalThis.fetch = async (url) => {
    const requestUrl = String(url)
    calls.push(requestUrl)

    if (requestUrl.includes('/patients?')) {
      return Response.json([
        { id: 'patient-1', full_name: 'Ana Souza', cpf: '12345678900' },
        { id: 'patient-2', full_name: 'Bruno Lima', cpf: '98765432100' },
      ])
    }

    if (requestUrl.includes('/appointments?')) {
      return Response.json([
        {
          id: 'appointment-1',
          doctor_id: 'doctor-1',
          patient_id: 'patient-1',
          scheduled_at: '2026-05-14T10:00:00Z',
        },
      ])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { patientRepository } = await import('../src/repositories/patientRepository.js')
  const rows = await patientRepository.getDirectoryRows({ doctorId: 'doctor-1' })

  assert.deepEqual(rows.map((patient) => patient.id), ['patient-1', 'patient-2'])
  assert.ok(calls.some((url) => url.includes('/appointments?') && url.includes('doctor_id=eq.doctor-1')))
})

test('patientRepository.registerPublicWithPassword usa endpoint publico com payload documentado', async () => {
  let captured

  globalThis.fetch = async (url, options = {}) => {
    captured = { url: String(url), options }
    return Response.json({ id: 'patient-1' })
  }

  const { patientRepository } = await import('../src/repositories/patientRepository.js')
  await patientRepository.registerPublicWithPassword({
    cpf: '123.456.789-01',
    email: 'paciente@exemplo.com',
    full_name: 'Joao da Silva',
    password: 'SenhaForte123',
    phone_mobile: '(11) 99999-8888',
  })

  assert.match(captured.url, /\/functions\/v1\/register-patient-with-password$/)
  assert.equal(captured.options.headers.apikey, 'anon-key')
  assert.equal('Authorization' in captured.options.headers, false)
  assert.deepEqual(JSON.parse(captured.options.body), {
    email: 'paciente@exemplo.com',
    password: 'SenhaForte123',
    full_name: 'Joao da Silva',
    cpf: '12345678901',
    phone_mobile: '11999998888',
  })
})

test('patientRepository.create envia apenas campos aceitos pelo create-patient', async () => {
  let body

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/create-patient')) {
      body = JSON.parse(options.body)
      return Response.json({ id: 'patient-1', full_name: body.full_name })
    }

    throw new Error(`URL inesperada: ${url}`)
  }

  const { patientRepository } = await import('../src/repositories/patientRepository.js')
  await patientRepository.create({
    cpf: '123.456.789-01',
    email: 'ana@exemplo.com',
    full_name: 'Ana Souza',
    phone: '(11) 99999-8888',
    insurance: 'Unimed',
    plan: 'Basico',
    cns: '123',
    motherName: 'Maria Souza',
    responsibleCpf: '111.222.333-44',
    responsibleName: 'Carlos Souza',
    lgpdOptIn: true,
  })

  assert.equal(body.cpf, '12345678901')
  assert.equal(body.phone_mobile, '11999998888')
  assert.equal(body.mother_name, 'Maria Souza')
  assert.equal(body.guardian_name, 'Carlos Souza')
  assert.equal(body.guardian_cpf, '11122233344')
  assert.equal('insurance' in body, false)
  assert.equal('plan' in body, false)
  assert.equal('cns' in body, false)
  assert.equal('lgpd_opt_in' in body, false)
})

test('patientRepository.update tenta payload menor quando a API recusa coluna opcional', async () => {
  const bodies = []

  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/patients\?id=eq.patient-1$/)
    bodies.push(JSON.parse(options.body))

    if (bodies.length === 1) {
      return Response.json({ message: 'bad request' }, { status: 400 })
    }

    return Response.json([{ id: 'patient-1', full_name: bodies.at(-1).full_name }])
  }

  const { patientRepository } = await import('../src/repositories/patientRepository.js')
  await patientRepository.update('patient-1', {
    email: 'ana@exemplo.com',
    name: 'Ana Souza',
    phone: '(11) 99999-8888',
    lgpdOptIn: true,
  })

  assert.deepEqual(bodies[0], {
    email: 'ana@exemplo.com',
    full_name: 'Ana Souza',
    phone_mobile: '11999998888',
  })
  assert.deepEqual(bodies[1], {
    full_name: 'Ana Souza',
    phone_mobile: '11999998888',
  })
  assert.equal(bodies.some((body) => 'lgpd_opt_in' in body), false)
})

test('availabilityRepository.getAvailableSlots usa a disponibilidade cadastrada do medico', async () => {
  const calls = []

  globalThis.fetch = async (url) => {
    const requestUrl = String(url)
    calls.push(requestUrl)

    if (requestUrl.includes('/doctor_availability?')) {
      assert.match(requestUrl, /doctor_id=eq.doctor-1/)
      return Response.json([
        {
          active: true,
          doctor_id: 'doctor-1',
          end_time: '11:00',
          id: 'availability-1',
          slot_minutes: 30,
          start_time: '10:00',
          weekday: 'monday',
        },
      ])
    }

    if (requestUrl.includes('/doctor_exceptions?')) {
      assert.match(requestUrl, /doctor_id=eq.doctor-1/)
      assert.match(requestUrl, /date=eq.2026-05-18/)
      return Response.json([])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { availabilityRepository } = await import('../src/repositories/availabilityRepository.js')
  const slots = await availabilityRepository.getAvailableSlots({
    date: '2026-05-18',
    doctorId: 'doctor-1',
    appointmentType: 'Teleconsulta',
  })

  assert.deepEqual(slots.map((slot) => slot.time), ['10:00', '10:30', '11:00'])
  assert.equal(calls.some((url) => url.includes('/functions/v1/get-available-slots')), false)
})

test('availabilityRepository.create bloqueia intervalo invalido antes do POST', async () => {
  let called = false
  globalThis.fetch = async () => {
    called = true
    return Response.json({})
  }

  const { availabilityRepository } = await import('../src/repositories/availabilityRepository.js')
  await assert.rejects(
    () => availabilityRepository.create({
      appointmentType: 'presencial',
      doctorId: 'doctor-1',
      endTime: '08:00',
      startTime: '18:00',
      weekday: 1,
    }),
    /horário inicial/,
  )
  assert.equal(called, false)
})

test('userRepository.createWithPassword envia CPF e dados de medico exigidos pela API', async () => {
  let body

  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/functions\/v1\/create-user-with-password$/)
    body = JSON.parse(options.body)
    return Response.json({ id: 'user-1' })
  }

  const { userRepository } = await import('../src/repositories/userRepository.js')
  await userRepository.createWithPassword({
    cpf: '123.456.789-01',
    crm: 'CRM 12345',
    crm_uf: 'sp',
    email: 'medico@exemplo.com',
    full_name: 'Dra Ana Souza',
    password: 'SenhaForte123',
    phone: '(11) 99999-8888',
    role: 'medico',
    specialty: 'Cardiologia',
  })

  assert.equal(body.cpf, '12345678901')
  assert.equal(body.crm, '12345')
  assert.equal(body.crm_uf, 'SP')
  assert.equal(body.role, 'medico')
  assert.equal(body.specialty, 'Cardiologia')
  assert.equal(body.password, 'SenhaForte123')
})
