import assert from 'node:assert/strict'
import test from 'node:test'

// Configure environment variable for testing
process.env.VITE_GEMINI_API_KEY = 'test-api-key'

// Import repositories so we can mock them
import { profileRepository } from '../src/repositories/profileRepository.js'
import { appointmentRepository } from '../src/repositories/appointmentRepository.js'
import { patientRepository } from '../src/repositories/patientRepository.js'
import { reportRepository } from '../src/repositories/reportRepository.js'
import { waitlistRepository } from '../src/repositories/waitlistRepository.js'
import { professionalRepository } from '../src/repositories/professionalRepository.js'
import { buildContext } from '../src/utils/chatbotContext.js'

test('ChatbotWidget buildContext resolves permissions correctly for a doctor', async () => {
  // Save original methods
  const origProfile = profileRepository.getCurrentUserProfile
  const origApp = appointmentRepository.getAll
  const origPat = patientRepository.getDirectoryRows
  const origPatAll = patientRepository.getAll
  const origProfAll = professionalRepository.getAll
  const origRep = reportRepository.getInitialReports
  const origWait = waitlistRepository.getAll

  let appointmentsQueryFilters = null
  let reportsQueryFilters = null

  // Mock repositories
  profileRepository.getCurrentUserProfile = async () => ({
    doctorId: 'doc-123',
    userId: 'user-456',
    id: 'prof-789',
  })

  appointmentRepository.getAll = async (filters) => {
    appointmentsQueryFilters = filters
    return [
      { date: '2026-06-09', status: 'requested', patientName: 'João Silva' },
      { date: '2026-06-09', status: 'cancelled', patientName: 'Maria Cruz' },
    ]
  }

  patientRepository.getDirectoryRows = async ({ doctorId }) => {
    assert.equal(doctorId, 'doc-123')
    return [{ id: 'pat-1' }]
  }

  patientRepository.getAll = async () => [{ id: 'pat-1', name: 'João Silva' }]
  professionalRepository.getAll = async () => [{ id: 'doc-123', name: 'Dr. Pedro' }]

  reportRepository.getInitialReports = async (filters) => {
    reportsQueryFilters = filters
    return [
      { exam: 'Hemograma', patientName: 'João Silva', status: 'draft' },
      { exam: 'Raio X', patientName: 'João Silva', status: 'finalized' },
    ]
  }

  waitlistRepository.getAll = () => [
    { status: 'aguardando', doctorId: 'doc-123' },
    { status: 'aguardando', doctorId: 'other-doc' },
    { status: 'atendido', doctorId: 'doc-123' },
  ]

  try {
    const data = await buildContext('medico')

    // Verify correct queries were performed
    assert.deepEqual(appointmentsQueryFilters, { doctorId: 'doc-123' })
    assert.deepEqual(reportsQueryFilters, { patientIds: ['pat-1'] })

    // Verify correct metrics
    assert.equal(data.appointmentsTotal, 2)
    assert.equal(data.appointmentsToday, 1) // cancelled not counted in appointmentsToday
    assert.equal(data.reportsCount, 2)
    assert.equal(data.draftReportsCount, 1)
    assert.equal(data.waitlistCount, 1) // only 'aguardando' and matching doctorId

    // Verify lists
    assert.deepEqual(data.patients, [{ id: 'pat-1', name: 'João Silva' }])
    assert.deepEqual(data.professionals, [{ id: 'doc-123', name: 'Dr. Pedro' }])

    // Verify compact lists
    assert.equal(data.todayAppointmentsList.length, 1)
    assert.equal(data.todayAppointmentsList[0].patient, 'João Silva')
    assert.equal(data.recentReportsList.length, 2)
    assert.equal(data.recentReportsList[0].exam, 'Hemograma')
  } finally {
    // Restore originals
    profileRepository.getCurrentUserProfile = origProfile
    appointmentRepository.getAll = origApp
    patientRepository.getDirectoryRows = origPat
    patientRepository.getAll = origPatAll
    professionalRepository.getAll = origProfAll
    reportRepository.getInitialReports = origRep
    waitlistRepository.getAll = origWait
  }
})

test('ChatbotWidget buildContext resolves permissions correctly for a patient', async () => {
  const origProfile = profileRepository.getCurrentUserProfile
  const origApp = appointmentRepository.getAll
  const origRep = reportRepository.getInitialReports
  const origWait = waitlistRepository.getAll
  const origProfAll = professionalRepository.getAll

  let appointmentsQueryFilters = null
  let reportsQueryFilters = null

  profileRepository.getCurrentUserProfile = async () => ({
    patientId: 'pat-999',
    name: 'Paciente Teste',
  })

  appointmentRepository.getAll = async (filters) => {
    appointmentsQueryFilters = filters
    return []
  }

  reportRepository.getInitialReports = async (filters) => {
    reportsQueryFilters = filters
    return []
  }

  waitlistRepository.getAll = () => [
    { status: 'aguardando', patientId: 'pat-999' },
  ]

  professionalRepository.getAll = async () => [{ id: 'doc-123', name: 'Dr. Pedro' }]

  try {
    const data = await buildContext('paciente')

    assert.deepEqual(appointmentsQueryFilters, { patientId: 'pat-999' })
    assert.deepEqual(reportsQueryFilters, { patientId: 'pat-999' })
    assert.equal(data.waitlistCount, 0) // Patient cannot view waitlist

    // Verify patient can only see themselves in patient list, but can see professional
    assert.deepEqual(data.patients, [{ id: 'pat-999', name: 'Paciente Teste' }])
    assert.deepEqual(data.professionals, [{ id: 'doc-123', name: 'Dr. Pedro' }])
  } finally {
    profileRepository.getCurrentUserProfile = origProfile
    appointmentRepository.getAll = origApp
    reportRepository.getInitialReports = origRep
    waitlistRepository.getAll = origWait
    professionalRepository.getAll = origProfAll
  }
})

test('ChatbotWidget buildContext resolves permissions correctly for a secretary', async () => {
  const origProfile = profileRepository.getCurrentUserProfile
  const origApp = appointmentRepository.getAll
  const origRep = reportRepository.getInitialReports
  const origWait = waitlistRepository.getAll
  const origPatAll = patientRepository.getAll
  const origProfAll = professionalRepository.getAll

  let reportsQueried = false

  profileRepository.getCurrentUserProfile = async () => ({})

  appointmentRepository.getAll = async () => []

  reportRepository.getInitialReports = async () => {
    reportsQueried = true
    return []
  }

  waitlistRepository.getAll = () => [
    { status: 'aguardando', doctorId: 'doc-123' },
  ]

  patientRepository.getAll = async () => [{ id: 'pat-1', name: 'João Silva' }]
  professionalRepository.getAll = async () => [{ id: 'doc-123', name: 'Dr. Pedro' }]

  try {
    const data = await buildContext('secretaria')

    assert.equal(reportsQueried, false) // Secretary has no permission to view reports
    assert.equal(data.reportsCount, 0)
    assert.equal(data.waitlistCount, 1) // Secretary can see waitlist

    // Verify lists are present
    assert.deepEqual(data.patients, [{ id: 'pat-1', name: 'João Silva' }])
    assert.deepEqual(data.professionals, [{ id: 'doc-123', name: 'Dr. Pedro' }])
  } finally {
    profileRepository.getCurrentUserProfile = origProfile
    appointmentRepository.getAll = origApp
    reportRepository.getInitialReports = origRep
    waitlistRepository.getAll = origWait
    patientRepository.getAll = origPatAll
    professionalRepository.getAll = origProfAll
  }
})

test('aiClient.chat token optimization: local heuristic match skips Gemini API', async () => {
  const { aiClient } = await import('../src/lib/ai/aiClient.js')
  let geminiCalled = false
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => {
    geminiCalled = true
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Gemini Response' }] } }],
      }),
    }
  }

  try {
    // 1. Simple greeting matches heuristic
    const reply1 = await aiClient.chat({
      messages: [{ role: 'user', content: 'olá' }],
      role: 'paciente',
    })

    assert.equal(geminiCalled, false)
    assert.match(reply1.text, /Olá!/i)

    // 2. Unmatched query calls Gemini API
    const reply2 = await aiClient.chat({
      messages: [{ role: 'user', content: 'Qual a gravidade do meu caso?' }],
      role: 'paciente',
    })

    assert.equal(geminiCalled, true)
    assert.equal(reply2.text, 'Gemini Response')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('aiClient.chat JSON response parsing: parses action and appointmentData', async () => {
  const { aiClient } = await import('../src/lib/ai/aiClient.js')
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => {
    return {
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                text: 'Confirmar agendamento de João Silva com o Dr. Pedro para amanhã às 14:00?',
                action: 'confirm_appointment',
                appointmentData: {
                  patientId: 'pat-1',
                  doctorId: 'doc-123',
                  scheduledAt: '2026-06-10T14:00:00'
                }
              })
            }]
          }
        }]
      }),
    }
  }

  try {
    const reply = await aiClient.chat({
      messages: [{ role: 'user', content: 'agendar João Silva amanhã às 14:00' }],
      role: 'secretaria',
    })

    assert.equal(reply.text, 'Confirmar agendamento de João Silva com o Dr. Pedro para amanhã às 14:00?')
    assert.equal(reply.action, 'confirm_appointment')
    assert.deepEqual(reply.appointmentData, {
      patientId: 'pat-1',
      doctorId: 'doc-123',
      scheduledAt: '2026-06-10T14:00:00'
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
