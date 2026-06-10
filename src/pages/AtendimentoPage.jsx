import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { RichTextEditor } from '../components/RichTextEditor.jsx'
import { aiClient } from '../lib/ai/aiClient.js'
import { heygenClient } from '../lib/ai/heygenClient.js'
import { buildMediConnectLaudoHtml } from '../lib/medical/laudoTemplate.js'
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

function todayIso() {
  return formatLocalDateInput(new Date())
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

  const realQueueCount = appointments.filter((appointment) => !appointment.isDemo).length
  const hasDemo = appointments.some((appointment) => appointment.isDemo)
  const nextPatient = appointments[0]

  return (
    <div className="grid gap-6">
      {/* Cabeçalho */}
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
            <svg className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M3 12h4l2-5 4 10 2-5h6" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-primary">Atendimento</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-text-heading md:text-3xl">
              Sala de espera
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted-v2">
              Pacientes do dia que já fizeram check-in na recepção e aguardam ser chamados.
              {doctorName ? <> Fila de <span className="text-text-body">{doctorName}</span>.</> : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          <span className="rounded-full border border-border-default-v2 bg-surface-card-hover px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted-v2">
            {todayLabel}
          </span>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-xs font-semibold text-text-body transition hover:bg-surface-card"
            onClick={() => load()}
            type="button"
          >
            <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
            </svg>
            Atualizar
          </button>
        </div>
      </header>

      {/* Barra de estatísticas */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border-default-v2 bg-surface-card p-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Aguardando atendimento</p>
          <p className="mt-2 text-2xl font-bold text-text-heading">{realQueueCount}</p>
          <p className="mt-1 text-xs text-text-muted-v2">
            {realQueueCount === 0 ? 'Nenhum paciente real na fila' : realQueueCount === 1 ? 'paciente em sala de espera' : 'pacientes em sala de espera'}
          </p>
        </div>
        <div className="rounded-xl border border-border-default-v2 bg-surface-card p-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Próximo da fila</p>
          <p className="mt-2 truncate text-base font-semibold text-text-heading">
            {nextPatient?.patient || '—'}
          </p>
          <p className="mt-1 text-xs text-text-muted-v2">
            {nextPatient ? `Agendado para ${nextPatient.time || '--:--'}` : 'Fila vazia'}
          </p>
        </div>
        <div className="rounded-xl border border-border-default-v2 bg-surface-card p-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Modo demonstração</p>
          <p className="mt-2 text-base font-semibold text-text-heading">{hasDemo ? 'Ativo' : 'Desativado'}</p>
          <p className="mt-1 text-xs text-text-muted-v2">
            {hasDemo ? 'Paciente Bot disponível no topo da fila' : '—'}
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      ) : null}

      {/* Fila */}
      <section className="rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
        <header className="flex items-center justify-between border-b border-border-default-v2 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Fila de atendimento</h2>
          <span className="text-xs text-text-muted-v2">
            {appointments.length} {appointments.length === 1 ? 'item' : 'itens'}
          </span>
        </header>

        {loading ? (
          <div className="p-6 text-sm text-text-muted-v2">Carregando a fila...</div>
        ) : appointments.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-card-hover text-text-muted-v2">
              <svg className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </div>
            <p className="mt-3 text-base font-semibold text-text-heading">Nenhum paciente aguardando.</p>
            <p className="mt-1 text-sm leading-6 text-text-muted-v2">
              Quando a recepção confirmar a chegada de um paciente, ele aparecerá aqui automaticamente.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-default-v2">
            {appointments.map((appointment) => {
              const initials = String(appointment.patient || 'P')
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join('') || 'P'
              return (
                <li key={appointment.id}>
                  <button
                    className={`group flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-surface-card-hover ${
                      appointment.isDemo ? 'bg-sky-950/10' : ''
                    }`}
                    onClick={() => navigate(`/atendimento/${appointment.id}`)}
                    type="button"
                  >
                    {/* Hora */}
                    <div className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-surface-inset px-2 py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Hora</span>
                      <span className="mt-0.5 text-lg font-bold tabular-nums text-text-heading">{appointment.time || '--:--'}</span>
                    </div>
                    {/* Avatar */}
                    <div className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      appointment.isDemo
                        ? 'bg-sky-500/20 text-sky-200'
                        : 'bg-accent-primary/15 text-accent-primary'
                    }`}>
                      {initials}
                    </div>
                    {/* Conteúdo */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-semibold text-text-heading">{appointment.patient}</p>
                        {appointment.isDemo ? (
                          <span className="rounded-full border border-sky-400/50 bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-200">
                            Demo
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-text-muted-v2">
                        {appointment.type || 'Consulta'} · {appointment.mode || 'Presencial'}
                      </p>
                      {appointment.notes ? (
                        <p className="mt-1 line-clamp-1 text-sm text-text-body">
                          <span className="text-text-muted-v2">Obs.: </span>
                          {appointment.notes}
                        </p>
                      ) : null}
                    </div>
                    {/* Status + seta */}
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-950/30 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200">
                        Aguardando
                      </span>
                      <svg className="size-5 text-text-muted-v2 transition group-hover:translate-x-0.5 group-hover:text-accent-primary" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
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
  const [manualMode, setManualMode] = useState(false)
  const [manualText, setManualText] = useState('')
  const [manualProcessing, setManualProcessing] = useState(false)

  const [exam, setExam] = useState('')
  const [cidCode, setCidCode] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [showTranscript, setShowTranscript] = useState(false)

  const [videoScript, setVideoScript] = useState('')
  const [videoState, setVideoState] = useState('idle') // idle | generating | ready | error
  const [videoStatus, setVideoStatus] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoError, setVideoError] = useState('')
  const videoScriptTouchedRef = useRef(false)

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
        const friendlyMsg = transcribeError?.quotaExceeded
          ? 'Limite gratuito da IA atingido. Use a opção "Digitar resumo manualmente" abaixo para continuar sem perder a apresentação.'
          : transcribeError?.message?.includes('429')
            ? 'Limite gratuito da IA atingido. Use a opção "Digitar resumo manualmente" abaixo.'
            : transcribeError?.message || 'Falha ao transcrever o áudio.'
        setRecordingError(friendlyMsg)
        setRecordingState('error')
        // Abre automaticamente o modo manual pra não bloquear a demo
        setManualMode(true)
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

  // Modo manual: médico digita um resumo e a IA local monta o mini-laudo + letterhead.
  // Funciona sem chamar nenhuma API externa (usa o motor heurístico de reportGenerator).
  const handleManualSubmit = useCallback(async () => {
    const text = manualText.trim()
    if (!text) return
    setManualProcessing(true)
    setRecordingError('')
    try {
      const draft = await aiClient.generateReport({
        patientName: patient?.name || appointment?.patient || '',
        complaint: text,
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
      setTranscript(text)
      setContentHtml(buildMediConnectLaudoHtml({
        patient,
        appointment,
        doctor,
        draft: resolvedDraft,
        transcript: text,
      }))
      setRecordingState('ready')
      setManualMode(false)
    } finally {
      setManualProcessing(false)
    }
  }, [manualText, patient, appointment, doctor])

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
      alert(translateErrorMessage(finishError?.message, 'Erro ao finalizar a consulta.'))
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

  // Pré-popula o roteiro do vídeo a partir da Conclusão sempre que ela mudar,
  // exceto se o médico já editou manualmente.
  useEffect(() => {
    if (videoScriptTouchedRef.current) return
    const firstName = String(patient?.name || appointment?.patient || 'paciente').split(' ')[0]
    const message = conclusion?.trim()
      ? `Olá, ${firstName}. Aqui vai um resumo da nossa consulta de hoje. ${conclusion.trim()} Qualquer dúvida, estou à disposição. Cuide-se bem.`
      : ''
    setVideoScript(message)
  }, [conclusion, patient?.name, appointment?.patient])

  const videoSupported = useMemo(() => heygenClient.isLive(), [])

  const handleGenerateVideo = useCallback(async () => {
    if (!videoSupported) {
      setVideoError('Configure VITE_HEYGEN_API_KEY no .env para gerar vídeos.')
      return
    }
    const script = videoScript.trim()
    if (!script) {
      setVideoError('Escreva uma mensagem antes de gerar o vídeo.')
      return
    }
    setVideoError('')
    setVideoUrl('')
    setVideoState('generating')
    setVideoStatus('Enviando roteiro para o HeyGen...')
    try {
      const { videoUrl: url } = await heygenClient.generateVideo({
        prompt: script,
        onProgress: ({ message }) => setVideoStatus(message),
      })
      setVideoUrl(url)
      setVideoState('ready')
      setVideoStatus('Vídeo pronto.')
    } catch (genError) {
      setVideoError(genError?.message || 'Falha ao gerar o vídeo.')
      setVideoState('error')
      setVideoStatus('')
    }
  }, [videoScript, videoSupported])

  const handleSendVideo = useCallback(async () => {
    if (!videoUrl) return
    try {
      const response = await fetch(videoUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const safeName = (patient?.name || appointment?.patient || 'paciente')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      anchor.href = objectUrl
      anchor.download = `mediconnect-mensagem-${safeName || 'paciente'}.mp4`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (downloadError) {
      // Fallback: abre direto a URL em nova aba
      window.open(videoUrl, '_blank', 'noopener,noreferrer')
      setVideoError(`Não consegui baixar direto (${downloadError?.message || 'erro'}). Abri o vídeo em uma nova aba.`)
    }
  }, [videoUrl, patient, appointment])

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
  const initials = String(patient?.name || appointment.patient || 'P')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P'

  const recordingDone = recordingState === 'ready'
  const laudoFilled = Boolean(exam || diagnosis || conclusion || contentHtml)
  const videoDone = Boolean(videoUrl)

  const stepStatus = {
    record: recordingDone ? 'done' : recordingState === 'recording' || recordingState === 'transcribing' ? 'doing' : 'pending',
    laudo: videoDone ? 'done' : laudoFilled ? 'doing' : 'pending',
    video: videoDone ? 'done' : videoState === 'generating' ? 'doing' : 'pending',
  }

  return (
    <div className="grid gap-6 pb-24">
      {/* Top bar com paciente + voltar */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm font-semibold text-text-body transition hover:bg-surface-card"
            onClick={() => navigate('/atendimento')}
            type="button"
          >
            <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="m15 6-6 6 6 6" />
            </svg>
            Voltar
          </button>
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-primary">Atendimento em curso</p>
            {isDemo ? (
              <span className="rounded-full border border-sky-400/50 bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-200">
                Demonstração
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {/* Layout em duas colunas: paciente (esq) + workflow (dir) */}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* COLUNA ESQUERDA: ficha do paciente (sticky no desktop) */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
            <div className="border-b border-border-default-v2 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Paciente</p>
              <div className="mt-3 flex items-center gap-3">
                <div className={`flex size-14 items-center justify-center rounded-full text-base font-bold ${
                  isDemo ? 'bg-sky-500/20 text-sky-200' : 'bg-accent-primary/15 text-accent-primary'
                }`}>
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-text-heading">{patient?.name || appointment.patient}</p>
                  <p className="text-xs text-text-muted-v2">{ageLabel}</p>
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-3 px-5 py-4 text-sm">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Horário</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-text-heading">{appointment.time || '--:--'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Tipo</dt>
                <dd className="mt-0.5 text-text-body">{appointment.type || 'Consulta'} · {appointment.mode || 'Presencial'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Observação do agendamento</dt>
                <dd className="mt-1 whitespace-pre-line text-sm leading-6 text-text-body">
                  {appointment.notes || <span className="text-text-muted-v2">Nenhuma observação informada.</span>}
                </dd>
              </div>
            </dl>
            {/* Indicador de progresso das etapas */}
            <div className="border-t border-border-default-v2 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Fluxo da consulta</p>
              <ol className="mt-3 space-y-2 text-xs">
                <StepIndicator number={1} label="Gravação" status={stepStatus.record} />
                <StepIndicator number={2} label="Mini-laudo" status={stepStatus.laudo} />
                <StepIndicator number={3} label="Vídeo para o paciente" status={stepStatus.video} />
              </ol>
            </div>
          </div>
        </aside>

        {/* COLUNA DIREITA: etapas */}
        <div className="grid gap-5">
          {/* ETAPA 1 — Gravação */}
          <StepCard number={1} title="Gravação da consulta" subtitle="Capture o áudio do atendimento para gerar o rascunho automático.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`flex size-12 items-center justify-center rounded-full transition ${
                  recordingState === 'recording'
                    ? 'animate-pulse bg-red-500/20 text-red-300'
                    : recordingDone
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-surface-card-hover text-text-muted-v2'
                }`}>
                  <svg className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <rect height="14" rx="3" width="6" x="9" y="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-heading">
                    {recordingState === 'idle' && 'Pronto para gravar'}
                    {recordingState === 'recording' && `Gravando · ${formatElapsed(elapsedMs)}`}
                    {recordingState === 'transcribing' && 'Transcrevendo com IA...'}
                    {recordingState === 'ready' && 'Gravação concluída'}
                    {recordingState === 'error' && 'Erro na gravação'}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted-v2">
                    {recordingState === 'idle' && 'O áudio é transcrito automaticamente quando você parar.'}
                    {recordingState === 'recording' && 'Clique em Parar para encerrar.'}
                    {recordingState === 'transcribing' && 'Isso pode levar alguns segundos.'}
                    {recordingState === 'ready' && 'O mini-laudo apareceu abaixo, pronto para revisão.'}
                    {recordingState === 'error' && 'Você pode tentar novamente.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {recordingState !== 'recording' ? (
                  <>
                    <button
                      className="inline-flex h-11 items-center gap-2 rounded-md border border-accent-primary bg-accent-primary px-5 text-sm font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:border-border-default-v2 disabled:bg-surface-card-hover disabled:text-text-muted-v2"
                      disabled={!recordingSupported || recordingState === 'transcribing'}
                      onClick={startRecording}
                      type="button"
                    >
                      <span className="size-2 rounded-full bg-current" />
                      {recordingState === 'ready' || recordingState === 'error' ? 'Gravar novamente' : 'Começar'}
                    </button>
                    <button
                      className="inline-flex h-11 items-center gap-2 rounded-md border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card"
                      onClick={() => setManualMode((value) => !value)}
                      type="button"
                    >
                      <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                      </svg>
                      {manualMode ? 'Fechar resumo' : 'Digitar resumo'}
                    </button>
                  </>
                ) : (
                  <button
                    className="inline-flex h-11 items-center gap-2 rounded-md border border-red-500/60 bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700"
                    onClick={stopRecording}
                    type="button"
                  >
                    <span className="size-3 rounded-sm bg-current" />
                    Parar
                  </button>
                )}
              </div>
            </div>
            {!recordingSupported ? (
              <p className="mt-3 text-xs text-text-muted-v2">
                {!aiClient.isLive()
                  ? 'Para habilitar a gravação, configure VITE_GEMINI_API_KEY no .env.'
                  : 'Este navegador não suporta gravação de áudio.'}
              </p>
            ) : null}
            {recordingError ? (
              <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">{recordingError}</p>
            ) : null}
            {manualMode ? (
              <div className="mt-4 rounded-lg border border-accent-primary/30 bg-accent-primary/5 p-4">
                <p className="text-sm font-semibold text-text-heading">Resumo manual da consulta</p>
                <p className="mt-1 text-xs text-text-muted-v2">
                  Descreva o atendimento em poucas linhas. A IA local monta o mini-laudo + letterhead automaticamente — não depende de nenhuma chave externa.
                </p>
                <textarea
                  className="mt-3 min-h-32 w-full rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-6 text-text-body outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                  onChange={(event) => setManualText(event.target.value)}
                  placeholder="Ex.: paciente relata febre e dor de garganta há 3 dias, sem outros sintomas. Orientei hidratação e sintomáticos."
                  value={manualText}
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-accent-primary bg-accent-primary px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!manualText.trim() || manualProcessing}
                    onClick={handleManualSubmit}
                    type="button"
                  >
                    {manualProcessing ? 'Montando laudo...' : 'Gerar mini-laudo a partir do texto'}
                  </button>
                  <span className="text-xs text-text-muted-v2">Sem custo de API · roda local</span>
                </div>
              </div>
            ) : null}
          </StepCard>

          {/* ETAPA 2 — Mini-laudo */}
          {recordingDone || laudoFilled ? (
            <StepCard number={2} title="Mini-laudo" subtitle="Revise e edite o rascunho gerado pela IA antes de transformar em laudo oficial.">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-text-heading">Exame / motivo</span>
                  <input
                    className="h-10 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                    onChange={(event) => setExam(event.target.value)}
                    value={exam}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-text-heading">CID</span>
                  <input
                    className="h-10 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                    onChange={(event) => setCidCode(event.target.value)}
                    value={cidCode}
                  />
                </label>
                <label className="grid gap-1.5 md:col-span-2">
                  <span className="text-xs font-medium text-text-heading">Diagnóstico</span>
                  <textarea
                    className="min-h-20 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-6 text-text-body outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                    onChange={(event) => setDiagnosis(event.target.value)}
                    value={diagnosis}
                  />
                </label>
                <label className="grid gap-1.5 md:col-span-2">
                  <span className="text-xs font-medium text-text-heading">Conclusão</span>
                  <textarea
                    className="min-h-20 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-6 text-text-body outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                    onChange={(event) => setConclusion(event.target.value)}
                    value={conclusion}
                  />
                </label>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-text-heading">Corpo do relatório</p>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted-v2">Letterhead MediConnect</span>
                </div>
                <div className="overflow-hidden rounded-md border border-border-default-v2 bg-surface-inset">
                  <RichTextEditor onChange={setContentHtml} value={contentHtml} />
                </div>
              </div>

              {transcript ? (
                <div className="mt-5">
                  <button
                    className="inline-flex items-center gap-1 text-xs font-semibold text-accent-primary underline-offset-2 hover:underline"
                    onClick={() => setShowTranscript((value) => !value)}
                    type="button"
                  >
                    <svg className="size-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                      <path d={showTranscript ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
                    </svg>
                    {showTranscript ? 'Ocultar transcrição bruta' : 'Mostrar transcrição bruta'}
                  </button>
                  {showTranscript ? (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border-default-v2 bg-surface-inset px-3 py-2 text-xs text-text-muted-v2">
                      {transcript}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </StepCard>
          ) : null}

          {/* ETAPA 3 — Vídeo */}
          {recordingDone || conclusion || videoUrl ? (
            <StepCard number={3} title="Mensagem em vídeo" subtitle="Um avatar do HeyGen narra a mensagem e gera um MP4 para enviar ao paciente.">
              {!videoSupported ? (
                <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                  Para habilitar a geração de vídeo, configure <code>VITE_HEYGEN_API_KEY</code> no <code>.env</code>.
                </p>
              ) : null}

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-text-heading">Roteiro do vídeo</span>
                <textarea
                  className="min-h-32 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-6 text-text-body outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                  onChange={(event) => {
                    videoScriptTouchedRef.current = true
                    setVideoScript(event.target.value)
                  }}
                  placeholder="Olá, [nome]. Aqui vai um resumo da nossa consulta..."
                  value={videoScript}
                />
              </label>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-fuchsia-500/60 bg-fuchsia-600 px-4 text-sm font-semibold text-white transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:border-border-default-v2 disabled:bg-surface-card-hover disabled:text-text-muted-v2"
                  disabled={!videoSupported || videoState === 'generating' || !videoScript.trim()}
                  onClick={handleGenerateVideo}
                  type="button"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <polygon points="6 4 20 12 6 20 6 4" />
                  </svg>
                  {videoState === 'generating' ? 'Gerando vídeo...' : videoState === 'ready' ? 'Gerar novamente' : 'Gerar vídeo'}
                </button>
                {videoState === 'generating' && videoStatus ? (
                  <span className="inline-flex items-center gap-2 text-xs text-text-muted-v2">
                    <span className="size-1.5 animate-pulse rounded-full bg-fuchsia-400" />
                    {videoStatus}
                  </span>
                ) : null}
              </div>

              {videoError ? (
                <p className="mt-3 rounded-md border border-red-500/40 bg-red-950/20 px-3 py-2 text-xs text-red-200">{videoError}</p>
              ) : null}

              {videoUrl ? (
                <div className="mt-4 grid gap-3">
                  <video
                    className="w-full max-w-xl rounded-md border border-border-default-v2 bg-black"
                    controls
                    src={videoUrl}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-500/60 bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      onClick={handleSendVideo}
                      type="button"
                    >
                      <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />
                      </svg>
                      Enviar (baixar MP4)
                    </button>
                    <a
                      className="inline-flex h-10 items-center rounded-md border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card"
                      href={videoUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Abrir em nova aba
                    </a>
                  </div>
                </div>
              ) : null}
            </StepCard>
          ) : null}
        </div>
      </div>

      {/* Action bar sticky */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default-v2 bg-surface-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-end gap-2 px-6 py-3">
          <button
            className="h-10 rounded-md border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card"
            onClick={() => navigate('/atendimento')}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-accent-primary bg-surface-card-hover px-4 text-sm font-semibold text-accent-primary transition hover:bg-surface-card disabled:cursor-not-allowed disabled:opacity-50"
            disabled={recordingState !== 'ready' && !exam && !diagnosis && !conclusion}
            onClick={handleGenerateLaudo}
            type="button"
          >
            <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M8 13h8M8 17h5" />
            </svg>
            Gerar laudo
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-500/60 bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={finishing}
            onClick={handleFinish}
            type="button"
          >
            <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {finishing ? 'Finalizando...' : 'Finalizar consulta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Card de etapa numerada usado na ConsultaPage
function StepCard({ number, title, subtitle, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
      <header className="flex items-start gap-3 border-b border-border-default-v2 px-5 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-primary/15 text-sm font-bold text-accent-primary">
          {number}
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-heading">{title}</h2>
          {subtitle ? <p className="text-xs text-text-muted-v2">{subtitle}</p> : null}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

// Indicador visual de progresso (sidebar do paciente)
function StepIndicator({ number, label, status }) {
  const styles = status === 'done'
    ? { dot: 'bg-emerald-500/20 text-emerald-300', label: 'text-text-body', sub: 'Concluído' }
    : status === 'doing'
      ? { dot: 'bg-accent-primary/20 text-accent-primary', label: 'text-text-heading font-semibold', sub: 'Em andamento' }
      : { dot: 'bg-surface-card-hover text-text-muted-v2', label: 'text-text-muted-v2', sub: 'Pendente' }
  return (
    <li className="flex items-center gap-3">
      <div className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${styles.dot}`}>
        {status === 'done' ? (
          <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : number}
      </div>
      <div className="min-w-0">
        <p className={`truncate text-xs ${styles.label}`}>{label}</p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted-v2">{styles.sub}</p>
      </div>
    </li>
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

