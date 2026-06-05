import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { RichTextEditor } from '../components/RichTextEditor.jsx'
import { aiClient } from '../lib/ai/aiClient.js'
import { appointmentRepository } from '../repositories/appointmentRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'
import { formatLocalDateInput } from '../utils/agendaDate.js'

const DRAFT_REPORT_STORAGE_KEY = 'mediconnect.atendimento.draftReport'
const DEMO_APPOINTMENT_ID = 'demo-bot-001'

const DEMO_APPOINTMENT = {
  id: DEMO_APPOINTMENT_ID,
  patientId: 'demo-patient-001',
  patient: 'Paciente Bot (demonstração)',
  professional: 'Médico de plantão',
  date: '',
  time: '09:00',
  type: 'Consulta de demonstração',
  mode: 'Presencial',
  durationMinutes: 30,
  status: 'Aguardando',
  highPriority: false,
  priority: 'Média',
  notes: 'Paciente fictício para demonstração do fluxo de atendimento. Relata cefaleia há 3 dias, sem febre, alivia com hidratação.',
  room: 'Consultório 1',
  isDemo: true,
}

const DEMO_PATIENT = {
  id: 'demo-patient-001',
  name: 'Paciente Bot (demonstração)',
  birthDate: '1990-05-12',
  birth_date: '1990-05-12',
  cpf: '000.000.000-00',
  age: null, // calculado em runtime
}

const CLINIC_FOOTER = 'MediConnect · Centro Médico Integrado · Av. Iguaçu, 1236 — Curitiba/PR · contato@mediconnect.com.br'

function todayIso() {
  return formatLocalDateInput(new Date())
}

function formatBrDate(value) {
  if (!value) return '___/___/______'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function paragraphsFromText(text) {
  return String(text || '')
    .split(/\n{2,}|\r\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p style="text-align: justify">${escapeHtml(chunk).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function buildMediConnectLaudoHtml({ patient, appointment, doctor, draft, transcript }) {
  const patientName = (patient?.name || appointment?.patient || 'Paciente não informado').toUpperCase()
  const patientDoc = patient?.cpf || patient?.document || 'Não informado'
  const patientBirth = formatBrDate(patient?.birthDate || patient?.birth_date)
  const visitDate = formatBrDate(appointment?.date || todayIso())
  const visitTime = appointment?.time || new Date().toTimeString().slice(0, 5)
  const exam = draft?.exam || appointment?.type || 'Consulta médica'
  const diagnosis = draft?.diagnosis || ''
  const conclusion = draft?.conclusion || ''
  const cid = draft?.cidCode || ''
  const doctorName = doctor?.name || 'Médico Responsável'
  const doctorCrm = doctor?.crm ? `CRM ${doctor.crm}` : ''
  const doctorSpecialty = doctor?.specialty || ''

  const findingsSource = [diagnosis, conclusion, transcript].filter(Boolean).join('\n\n').trim()
  const findingsBlock = findingsSource
    ? paragraphsFromText(findingsSource)
    : '<p style="text-align: justify">Paciente avaliado conforme queixa apresentada. Conduta orientada após exame clínico.</p>'

  return [
    '<h2 style="text-align: center"><strong>MEDICONNECT</strong></h2>',
    '<p style="text-align: center"><em>Centro Médico Integrado</em></p>',
    '<p style="text-align: center">&nbsp;</p>',
    '<h2 style="text-align: center"><strong>LAUDO MÉDICO</strong></h2>',
    '<p style="text-align: center">&nbsp;</p>',
    `<p style="text-align: justify">DECLARO PARA OS DEVIDOS FINS, A PEDIDO, QUE O(A) SR.(A) <u><strong>${escapeHtml(patientName)}</strong></u></p>`,
    `<p style="text-align: justify"><strong>DOCUMENTO:</strong> ${escapeHtml(patientDoc)} &nbsp;&nbsp; <strong>NASC:</strong> ${escapeHtml(patientBirth)}</p>`,
    `<p style="text-align: justify"><strong>FOI ATENDIDO(A) NO DIA ${escapeHtml(visitDate)}</strong>, às <strong>${escapeHtml(visitTime)}</strong>.</p>`,
    `<p style="text-align: justify"><strong>Motivo / Exame:</strong> ${escapeHtml(exam)}</p>`,
    '<p>&nbsp;</p>',
    findingsBlock,
    cid ? `<p style="text-align: justify"><strong>CID ${escapeHtml(cid)}</strong></p>` : '',
    '<p>&nbsp;</p>',
    `<p style="text-align: justify"><strong>MÉDICO RESPONSÁVEL:</strong> ${escapeHtml(doctorName)}${doctorSpecialty ? ` — ${escapeHtml(doctorSpecialty)}` : ''}${doctorCrm ? ` — ${escapeHtml(doctorCrm)}` : ''}</p>`,
    '<p>&nbsp;</p>',
    '<p>&nbsp;</p>',
    '<p style="text-align: center">_______________________________________</p>',
    `<p style="text-align: center"><em>${escapeHtml(doctorName)}</em></p>`,
    doctorCrm ? `<p style="text-align: center"><em>${escapeHtml(doctorCrm)}</em></p>` : '',
    '<p>&nbsp;</p>',
    '<hr>',
    `<p style="text-align: center"><em>${escapeHtml(CLINIC_FOOTER)}</em></p>`,
  ].filter(Boolean).join('\n')
}

async function resolveDoctorIdForViewer() {
  const profile = await profileRepository.getCurrentUserProfile()
  if (profile?.doctorId) return { doctorId: String(profile.doctorId), profile }
  const professionals = await professionalRepository.getAll().catch(() => [])
  const current = professionalRepository.resolveCurrentProfessional(profile, professionals)
  return { doctorId: current?.id ? String(current.id) : '', profile }
}

export function AtendimentoPage({ navigate }) {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [doctorName, setDoctorName] = useState('')

  const load = useCallback(async () => {
    setError('')
    const today = todayIso()
    const demo = { ...DEMO_APPOINTMENT, date: today }
    try {
      const { doctorId, profile } = await resolveDoctorIdForViewer()
      setDoctorName(profile?.name || '')
      if (!doctorId) {
        setAppointments([demo])
        setError('Não foi possível identificar o médico vinculado ao seu usuário. Mostrando apenas o paciente de demonstração.')
        return
      }
      const data = await appointmentRepository.getAll({ doctorId, status: 'checked_in' })
      const filtered = (data || [])
        .filter((appointment) => appointment.date === today && appointment.status === 'Aguardando')
        .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
      setAppointments([demo, ...filtered])
    } catch (loadError) {
      setAppointments([demo])
      setError(translateErrorMessage(loadError) || 'Erro ao carregar a fila de atendimento. Mostrando apenas o paciente de demonstração.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const intervalId = window.setInterval(load, 30_000)
    return () => window.clearInterval(intervalId)
  }, [load])

  const todayLabel = useMemo(() => {
    const now = new Date()
    return now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  }, [])

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-primary">Atendimento</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-heading md:text-4xl">
            Pacientes em sala de espera
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted-v2">
            Lista dos pacientes do dia que já fizeram check-in na recepção e aguardam ser chamados.
            {doctorName ? <> Mostrando a fila de <span className="text-text-body">{doctorName}</span>.</> : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border-default-v2 bg-surface-card-hover px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted-v2">
            {todayLabel}
          </span>
          <button
            className="h-10 rounded-sm border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card"
            onClick={() => load()}
            type="button"
          >
            Atualizar
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-border-default-v2 bg-surface-card p-6 text-sm text-text-muted-v2">
          Carregando a fila...
        </div>
      ) : appointments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-default-v2 bg-surface-inset p-10 text-center">
          <p className="text-base font-semibold text-text-heading">Nenhum paciente aguardando.</p>
          <p className="mt-2 text-sm leading-6 text-text-muted-v2">
            Quando a recepção confirmar a chegada de um paciente, ele aparecerá aqui automaticamente.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {appointments.map((appointment) => (
            <li key={appointment.id}>
              <button
                className={`block w-full rounded-2xl border p-4 text-left shadow-card transition hover:shadow-card-hover ${
                  appointment.isDemo
                    ? 'border-dashed border-sky-500/50 bg-sky-950/15 hover:border-sky-400'
                    : 'border-border-default-v2 bg-surface-card hover:border-accent-primary'
                }`}
                onClick={() => navigate(`/atendimento/${appointment.id}`)}
                type="button"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-text-heading">{appointment.patient}</p>
                      {appointment.isDemo ? (
                        <span className="rounded-full border border-sky-400/50 bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-200">
                          Demo
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-text-muted-v2">
                      Agendado para {appointment.time || '--:--'} · {appointment.type || 'Consulta'} · {appointment.mode || 'Presencial'}
                    </p>
                    {appointment.notes ? (
                      <p className="mt-2 text-sm leading-6 text-text-body line-clamp-2">
                        <span className="text-text-muted-v2">Observação: </span>
                        {appointment.notes}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-950/30 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-200">
                    Aguardando
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function calculateAge(birthDate) {
  if (!birthDate) return null
  const date = new Date(birthDate)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  const monthDiff = today.getMonth() - date.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age -= 1
  return age >= 0 ? age : null
}

function formatElapsed(ms) {
  if (!ms || ms < 0) return '00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || ''
}

export function ConsultaPage({ navigate, appointmentId }) {
  const [appointment, setAppointment] = useState(null)
  const [patient, setPatient] = useState(null)
  const [doctor, setDoctor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [recordingState, setRecordingState] = useState('idle') // idle | recording | transcribing | ready | error
  const [recordingError, setRecordingError] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [transcript, setTranscript] = useState('')

  const [exam, setExam] = useState('')
  const [cidCode, setCidCode] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [showTranscript, setShowTranscript] = useState(false)

  const [finishing, setFinishing] = useState(false)

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const tickerRef = useRef(0)

  const isDemo = String(appointmentId) === DEMO_APPOINTMENT_ID

  useEffect(() => {
    let active = true
    async function loadDoctor() {
      try {
        const profile = await profileRepository.getCurrentUserProfile()
        const professionals = await professionalRepository.getAll().catch(() => [])
        const current = professionalRepository.resolveCurrentProfessional(profile, professionals)
        if (!active) return
        setDoctor({
          name: current?.name || profile?.name || '',
          crm: current?.crm || '',
          specialty: current?.specialty || '',
        })
      } catch {
        if (active) setDoctor(null)
      }
    }
    loadDoctor()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    async function fetchData() {
      setError('')
      if (isDemo) {
        const today = todayIso()
        setAppointment({ ...DEMO_APPOINTMENT, date: today })
        setPatient({ ...DEMO_PATIENT })
        setLoading(false)
        return
      }
      try {
        const list = await appointmentRepository.getAll()
        const target = (list || []).find((item) => String(item.id) === String(appointmentId))
        if (!target) {
          if (active) setError('Agendamento não encontrado.')
          return
        }
        if (!active) return
        setAppointment(target)
        if (target.patientId) {
          const patientData = await patientRepository.getById(target.patientId).catch(() => null)
          if (active) setPatient(patientData)
        }
      } catch (fetchError) {
        if (active) setError(translateErrorMessage(fetchError) || 'Erro ao carregar a consulta.')
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchData()
    return () => { active = false }
  }, [appointmentId, isDemo])

  useEffect(() => {
    return () => {
      stopRecorderInstance(recorderRef.current, streamRef.current)
      if (tickerRef.current) {
        window.clearInterval(tickerRef.current)
        tickerRef.current = 0
      }
    }
  }, [])

  const recordingSupported = useMemo(
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.MediaRecorder) &&
      Boolean(navigator?.mediaDevices?.getUserMedia) &&
      aiClient.isLive(),
    [],
  )

  const startRecording = useCallback(async () => {
    if (!recordingSupported) {
      setRecordingError(
        !aiClient.isLive()
          ? 'Gravação indisponível: configure VITE_GEMINI_API_KEY no .env.'
          : 'Este navegador não suporta gravação de áudio.',
      )
      return
    }
    setRecordingError('')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (mediaError) {
      const message = mediaError?.name === 'NotAllowedError'
        ? 'Permissão de microfone negada pelo navegador.'
        : `Não foi possível acessar o microfone: ${mediaError?.message || 'erro desconhecido'}`
      setRecordingError(message)
      return
    }

    const mimeType = pickRecorderMimeType()
    let recorder
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    } catch (recorderError) {
      stream.getTracks().forEach((track) => track.stop())
      setRecordingError(`Não foi possível iniciar o gravador: ${recorderError?.message || 'erro desconhecido'}`)
      return
    }

    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstart = () => {
      startedAtRef.current = Date.now()
      setElapsedMs(0)
      if (tickerRef.current) window.clearInterval(tickerRef.current)
      tickerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current)
      }, 500)
      setRecordingState('recording')
    }
    recorder.onerror = (event) => {
      setRecordingError(`Erro na gravação: ${event?.error?.message || 'desconhecido'}`)
    }
    recorder.onstop = async () => {
      if (tickerRef.current) {
        window.clearInterval(tickerRef.current)
        tickerRef.current = 0
      }
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      recorderRef.current = null

      const chunks = chunksRef.current
      chunksRef.current = []
      if (!chunks.length) {
        setRecordingState('idle')
        return
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
      setRecordingState('transcribing')

      try {
        const text = await aiClient.transcribeLongAudio({ blob, mimeType: blob.type })
        setTranscript(text || '')
        const draft = await aiClient.generateReport({
          patientName: patient?.name || appointment?.patient || '',
          complaint: text || appointment?.notes || '',
          exam: appointment?.type || 'Consulta',
        })
        const resolvedDraft = {
          exam: draft?.exam || appointment?.type || 'Consulta',
          cidCode: draft?.cidCode || '',
          diagnosis: draft?.diagnosis || '',
          conclusion: draft?.conclusion || '',
        }
        setExam(resolvedDraft.exam)
        setCidCode(resolvedDraft.cidCode)
        setDiagnosis(resolvedDraft.diagnosis)
        setConclusion(resolvedDraft.conclusion)
        setContentHtml(buildMediConnectLaudoHtml({
          patient,
          appointment,
          doctor,
          draft: resolvedDraft,
          transcript: text,
        }))
        setRecordingState('ready')
      } catch (transcribeError) {
        setRecordingError(transcribeError?.message || 'Falha ao transcrever o áudio.')
        setRecordingState('error')
      }
    }

    streamRef.current = stream
    recorderRef.current = recorder
    try {
      recorder.start()
    } catch (startError) {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      recorderRef.current = null
      setRecordingError(`Não foi possível iniciar a gravação: ${startError?.message || 'erro desconhecido'}`)
    }
  }, [appointment, patient, doctor, recordingSupported])

  const stopRecording = useCallback(() => {
    if (recorderRef.current) {
      try { recorderRef.current.stop() } catch { /* ignora */ }
    }
  }, [])

  const handleFinish = useCallback(async () => {
    if (!appointment) return
    if (!window.confirm('Marcar esta consulta como realizada?')) return
    if (isDemo) {
      navigate('/atendimento')
      return
    }
    setFinishing(true)
    try {
      await appointmentRepository.update(appointment.id, {
        ...appointment,
        professionalId: appointment.professionalId,
        durationMinutes: appointment.durationMinutes,
        status: 'Realizado',
      })
      navigate('/atendimento')
    } catch (finishError) {
      alert(finishError?.message || 'Erro ao finalizar a consulta.')
      setFinishing(false)
    }
  }, [appointment, navigate, isDemo])

  const handleGenerateLaudo = useCallback(() => {
    if (!appointment) return
    const draft = {
      patientId: appointment.patientId,
      patientName: patient?.name || appointment.patient,
      exam,
      cidCode,
      diagnosis,
      conclusion,
      contentHtml: contentHtml || buildMediConnectLaudoHtml({
        patient,
        appointment,
        doctor,
        draft: { exam, cidCode, diagnosis, conclusion },
        transcript,
      }),
      sourceAppointmentId: appointment.id,
    }
    try {
      sessionStorage.setItem(DRAFT_REPORT_STORAGE_KEY, JSON.stringify(draft))
    } catch { /* sessionStorage indisponível */ }
    navigate('/laudos')
  }, [appointment, patient, doctor, exam, cidCode, diagnosis, conclusion, contentHtml, transcript, navigate])

  if (loading) {
    return <div className="rounded-2xl border border-border-default-v2 bg-surface-card p-6 text-sm text-text-muted-v2">Carregando consulta...</div>
  }

  if (error || !appointment) {
    return (
      <div className="grid gap-4">
        <div className="rounded-2xl border border-red-500/40 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {error || 'Agendamento não encontrado.'}
        </div>
        <div>
          <button
            className="h-10 rounded-sm border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body"
            onClick={() => navigate('/atendimento')}
            type="button"
          >
            Voltar para Atendimento
          </button>
        </div>
      </div>
    )
  }

  const age = calculateAge(patient?.birthDate || patient?.birth_date)
  const ageLabel = age !== null ? `${age} anos` : 'Idade não informada'

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-primary">Consulta</p>
            {isDemo ? (
              <span className="rounded-full border border-sky-400/50 bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-200">
                Demonstração
              </span>
            ) : null}
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-heading md:text-4xl">
            {patient?.name || appointment.patient}
          </h1>
          <p className="mt-2 text-sm text-text-muted-v2">
            {ageLabel} · Agendado para {appointment.time || '--:--'} · {appointment.type || 'Consulta'}
          </p>
        </div>
        <button
          className="h-10 rounded-sm border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card"
          onClick={() => navigate('/atendimento')}
          type="button"
        >
          Voltar
        </button>
      </header>

      <section className="rounded-2xl border border-border-default-v2 bg-surface-card p-5 shadow-card">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Observação do agendamento</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-text-body">
          {appointment.notes || 'Nenhuma observação informada no agendamento.'}
        </p>
      </section>

      <section className="rounded-2xl border border-border-default-v2 bg-surface-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Gravação da consulta</h2>
            <p className="mt-1 text-sm text-text-body">
              {recordingState === 'idle' && 'Clique em Começar para gravar a consulta e gerar um mini-relatório automático.'}
              {recordingState === 'recording' && `Gravando · ${formatElapsed(elapsedMs)}`}
              {recordingState === 'transcribing' && 'Transcrevendo áudio e gerando rascunho...'}
              {recordingState === 'ready' && 'Mini-relatório gerado. Edite abaixo antes de gerar o laudo.'}
              {recordingState === 'error' && 'Algo deu errado. Você pode tentar novamente.'}
            </p>
            {!recordingSupported ? (
              <p className="mt-2 text-xs text-text-muted-v2">
                {!aiClient.isLive()
                  ? 'Para habilitar a gravação, configure VITE_GEMINI_API_KEY no .env.'
                  : 'Este navegador não suporta gravação de áudio.'}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {recordingState !== 'recording' ? (
              <button
                className="h-11 rounded-sm border border-accent-primary bg-accent-primary px-5 text-sm font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:border-border-default-v2 disabled:bg-surface-card-hover disabled:text-text-muted-v2"
                disabled={!recordingSupported || recordingState === 'transcribing'}
                onClick={startRecording}
                type="button"
              >
                {recordingState === 'ready' || recordingState === 'error' ? 'Gravar novamente' : 'Começar'}
              </button>
            ) : (
              <button
                className="h-11 rounded-sm border border-red-500/60 bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700"
                onClick={stopRecording}
                type="button"
              >
                Parar
              </button>
            )}
          </div>
        </div>
        {recordingError ? (
          <p className="mt-3 rounded-md border border-red-500/40 bg-red-950/20 px-3 py-2 text-xs text-red-200">{recordingError}</p>
        ) : null}
      </section>

      {recordingState === 'ready' || (recordingState === 'idle' && (exam || diagnosis || contentHtml)) ? (
        <section className="rounded-2xl border border-border-default-v2 bg-surface-card p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Mini-relatório</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-text-heading">Exame / motivo</span>
              <input
                className="h-10 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary"
                onChange={(event) => setExam(event.target.value)}
                value={exam}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-text-heading">CID</span>
              <input
                className="h-10 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary"
                onChange={(event) => setCidCode(event.target.value)}
                value={cidCode}
              />
            </label>
            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-xs font-medium text-text-heading">Diagnóstico</span>
              <textarea
                className="min-h-20 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-6 text-text-body outline-none focus:border-accent-primary"
                onChange={(event) => setDiagnosis(event.target.value)}
                value={diagnosis}
              />
            </label>
            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-xs font-medium text-text-heading">Conclusão</span>
              <textarea
                className="min-h-20 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-6 text-text-body outline-none focus:border-accent-primary"
                onChange={(event) => setConclusion(event.target.value)}
                value={conclusion}
              />
            </label>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-medium text-text-heading">Corpo do relatório</p>
            <div className="overflow-hidden rounded-md border border-border-default-v2 bg-surface-inset">
              <RichTextEditor onChange={setContentHtml} value={contentHtml} />
            </div>
          </div>

          {transcript ? (
            <div className="mt-5">
              <button
                className="text-xs font-semibold text-accent-primary underline-offset-2 hover:underline"
                onClick={() => setShowTranscript((value) => !value)}
                type="button"
              >
                {showTranscript ? 'Ocultar transcrição bruta' : 'Mostrar transcrição bruta'}
              </button>
              {showTranscript ? (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border-default-v2 bg-surface-inset px-3 py-2 text-xs text-text-muted-v2">
                  {transcript}
                </pre>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          className="h-10 rounded-sm border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card"
          onClick={() => navigate('/atendimento')}
          type="button"
        >
          Cancelar
        </button>
        <button
          className="h-10 rounded-sm border border-accent-primary bg-surface-card-hover px-4 text-sm font-semibold text-accent-primary transition hover:bg-surface-card disabled:cursor-not-allowed disabled:opacity-50"
          disabled={recordingState !== 'ready' && !exam && !diagnosis && !conclusion}
          onClick={handleGenerateLaudo}
          type="button"
        >
          Gerar laudo
        </button>
        <button
          className="h-10 rounded-sm border border-emerald-500/60 bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={finishing}
          onClick={handleFinish}
          type="button"
        >
          {finishing ? 'Finalizando...' : 'Finalizar consulta'}
        </button>
      </div>
    </div>
  )
}

function stopRecorderInstance(recorder, stream) {
  if (recorder) {
    try { recorder.stop() } catch { /* ignora */ }
  }
  if (stream) {
    try { stream.getTracks().forEach((track) => track.stop()) } catch { /* ignora */ }
  }
}

