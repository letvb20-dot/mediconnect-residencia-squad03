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
          profile: {
            avatar_path: 'patients/patient-1/avatar.jpg',
          },
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
  assert.match(patient.avatarUrl, /\/object\/public\/avatars\/patients\/patient-1\/avatar\.jpg$/)
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

test('patientRepository.getDirectoryRows calcula idade pela data de nascimento', async () => {
  globalThis.fetch = async (url) => {
    const requestUrl = String(url)

    if (requestUrl.includes('/patients?')) {
      return Response.json([
        { id: 'patient-1', birth_date: '2000-01-01', full_name: 'Ana Souza' },
        { id: 'patient-2', age: 42, birth_date: '1980-01-01', full_name: 'Bruno Lima' },
      ])
    }

    if (requestUrl.includes('/appointments?')) {
      return Response.json([])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { patientRepository } = await import('../src/repositories/patientRepository.js')
  const rows = await patientRepository.getDirectoryRows()

  assert.equal(rows[0].age, calculateExpectedAge('2000-01-01'))
  assert.equal(rows[1].age, 42)
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

test('patientRepository.uploadAttachment tenta buckets de anexos antes de avatars', async () => {
  const calls = []
  const file = new Blob(['conteudo'], { type: 'application/pdf' })
  file.name = 'exame.pdf'

  globalThis.fetch = async (url) => {
    const requestUrl = String(url)
    calls.push(requestUrl)

    if (requestUrl.includes('/object/patient-attachments/')) {
      return Response.json({ message: 'bucket not found' }, { status: 404 })
    }

    if (requestUrl.includes('/object/attachments/')) {
      return Response.json({ Key: 'ok' })
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { patientRepository } = await import('../src/repositories/patientRepository.js')
  const upload = await patientRepository.uploadAttachment('patient-1', file)

  assert.equal(upload.bucket, 'attachments')
  assert.match(upload.url, /\/object\/public\/attachments\/patients\/patient-1\/attachments\//)
  assert.equal(calls.length, 2)
})

test('patientRepository.uploadAvatar salva avatar do paciente com confirmacao da API', async () => {
  const calls = []
  const file = new Blob(['avatar'], { type: 'image/png' })
  file.name = 'foto.png'

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    calls.push({ body: options.body, headers: options.headers, method: options.method, url: requestUrl })

    if (requestUrl.includes('/storage/v1/object/avatars/patients/patient-1/avatar.png')) {
      return Response.json({ Key: 'ok' })
    }

    if (requestUrl.includes('/rest/v1/patients?id=eq.patient-1') && options.method === 'PATCH') {
      const body = JSON.parse(options.body)
      assert.equal(options.headers.Prefer, 'return=representation')
      return Response.json([{ id: 'patient-1', avatar_url: body.avatar_url }])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { patientRepository } = await import('../src/repositories/patientRepository.js')
  const result = await patientRepository.uploadAvatar('patient-1', file)

  assert.match(result.avatarUrl, /\/object\/public\/avatars\/patients\/patient-1\/avatar\.png$/)
  assert.equal(calls.length, 2)
})

test('patientRepository.uploadAvatar falha quando a API nao confirma avatar do paciente', async () => {
  const file = new Blob(['avatar'], { type: 'image/png' })
  file.name = 'foto.png'

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)

    if (requestUrl.includes('/storage/v1/object/avatars/patients/patient-1/avatar.png')) {
      return Response.json({ Key: 'ok' })
    }

    if (requestUrl.includes('/rest/v1/patients?id=eq.patient-1') && options.method === 'PATCH') {
      return Response.json([])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { patientRepository } = await import('../src/repositories/patientRepository.js')

  await assert.rejects(
    () => patientRepository.uploadAvatar('patient-1', file),
    /API nao confirmou/,
  )
})

test('patientRepository.update salva campos suportados quando API recusa campo do paciente', async () => {
  const bodies = []

  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/patients\?id=eq.patient-1$/)
    const body = JSON.parse(options.body)
    bodies.push(body)

    if ('email' in body) {
      return Response.json({ message: "Could not find the 'email' column of 'patients' in the schema cache" }, { status: 400 })
    }

    return Response.json([{ id: 'patient-1', ...body }])
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
  assert.ok(bodies.some((body) => body.lgpd_opt_in === true))
})

test('patientRepository.update persiste campos estendidos quando a API suporta', async () => {
  const bodies = []

  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/patients\?id=eq.patient-1$/)
    const body = JSON.parse(options.body)
    bodies.push(body)
    return Response.json([{ id: 'patient-1', ...body }])
  }

  const { patientRepository } = await import('../src/repositories/patientRepository.js')
  await patientRepository.update('patient-1', {
    addressNumber: '123',
    addressStreet: 'Rua A',
    birthDate: '1990-01-01',
    bloodType: 'O+',
    city: 'Recife',
    cns: '1234567',
    cpf: '123.456.789-01',
    email: 'ana@exemplo.com',
    height: '1,70',
    insurance: 'Unimed',
    insuranceNumber: 'ABC123',
    lgpdOptIn: false,
    motherName: 'Maria Souza',
    name: 'Ana Souza',
    phone: '(81) 99999-8888',
    plan: 'Basico',
    state: 'PE',
    weight: '70,5',
  })

  assert.deepEqual(bodies[0], {
    email: 'ana@exemplo.com',
    full_name: 'Ana Souza',
    phone_mobile: '81999998888',
  })
  assert.ok(bodies.some((body) => body.cpf === '12345678901' && body.birth_date === '1990-01-01'))
  assert.ok(bodies.some((body) => body.street === 'Rua A' && body.number === '123' && body.city === 'Recife'))
  assert.ok(bodies.some((body) => body.blood_type === 'O+' && body.weight_kg === 70.5 && body.height_m === 1.7))
  assert.ok(bodies.some((body) => body.insurance === 'Unimed' && body.plan === 'Basico' && body.insurance_number === 'ABC123'))
  assert.ok(bodies.some((body) => body.lgpd_opt_in === false))
})

test('patientRepository normaliza aliases completos retornados pela API', async () => {
  globalThis.fetch = async (url) => {
    const requestUrl = String(url)

    if (requestUrl.includes('/patients?')) {
      return Response.json([
        {
          id: 'patient-1',
          full_name: 'Ana Souza',
          cpf: '12345678900',
          phone_mobile: '81999998888',
          birth_date: '1990-01-01',
          cep: '50000000',
          street: 'Rua A',
          number: '123',
          complement: 'Apto 4',
          city: 'Recife',
          state: 'PE',
          health_insurance: 'Unimed',
          insurance_plan: 'Basico',
          insurance_number: 'ABC123',
          weight_kg: 70.5,
          height_m: 1.7,
          cns: '1234567',
        },
      ])
    }

    if (requestUrl.includes('/appointments?')) {
      return Response.json([])
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { patientRepository } = await import('../src/repositories/patientRepository.js')
  const [patient] = await patientRepository.getDirectoryRows()

  assert.equal(patient.phone, '(81) 99999-8888')
  assert.equal(patient.addressStreet, 'Rua A')
  assert.equal(patient.addressNumber, '123')
  assert.equal(patient.addressComplement, 'Apto 4')
  assert.equal(patient.insurance, 'Unimed')
  assert.equal(patient.plan, 'Basico')
  assert.equal(patient.insuranceNumber, 'ABC123')
  assert.equal(patient.weight, 70.5)
  assert.equal(patient.height, 1.7)
  assert.equal(patient.cns, '1234567')
})

test('availabilityRepository.getAvailableSlots usa a edge function documentada', async () => {
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url)
    calls.push({ body: options.body ? JSON.parse(options.body) : null, method: options.method || 'GET', url: requestUrl })

    if (requestUrl.includes('/functions/v1/get-available-slots')) {
      return Response.json({
        slots: [
          { available: true, time: '09:00' },
          { available: true, time: '09:30' },
        ],
      })
    }

    throw new Error(`URL inesperada: ${requestUrl}`)
  }

  const { availabilityRepository } = await import('../src/repositories/availabilityRepository.js')
  const slots = await availabilityRepository.getAvailableSlots({
    date: '2026-05-18',
    doctorId: 'doctor-1',
  })

  assert.deepEqual(slots.map((slot) => slot.time), ['09:00', '09:30'])
  assert.equal(calls[0].method, 'POST')
  assert.match(calls[0].url, /\/functions\/v1\/get-available-slots$/)
  assert.deepEqual(calls[0].body, {
    appointment_type: 'presencial',
    doctor_id: 'doctor-1',
    end_date: '2026-05-18',
    start_date: '2026-05-18',
  })
})

test('availabilityRepository.getAvailableSlots usa disponibilidade cadastrada quando funcao volta vazia', async () => {
  const calls = []

  globalThis.fetch = async (url) => {
    const requestUrl = String(url)
    calls.push(requestUrl)

    if (requestUrl.includes('/functions/v1/get-available-slots')) {
      return Response.json({ slots: [] })
    }

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
        {
          active: true,
          doctor_id: 'doctor-1',
          end_time: '15:00',
          id: 'availability-2',
          slot_minutes: 30,
          start_time: '14:00',
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

  assert.deepEqual(slots.map((slot) => slot.time), ['10:00', '10:30', '11:00', '14:00', '14:30', '15:00'])
  assert.equal(calls.some((url) => url.includes('/functions/v1/get-available-slots')), true)
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

function calculateExpectedAge(value) {
  const [year, month, day] = value.split('-').map(Number)
  const birthDate = new Date(year, month - 1, day)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}
