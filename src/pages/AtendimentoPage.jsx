import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { RecordingToolbar } from '../components/RecordingToolbar.jsx'
import { RichTextEditor } from '../components/RichTextEditor.jsx'
import { SignatureToggle } from '../components/SignatureToggle.jsx'
import { useLaudoRecorder } from '../hooks/useLaudoRecorder.js'
import { aiClient } from '../lib/ai/aiClient.js'
import { heygenClient } from '../lib/ai/heygenClient.js'
import { buildMediConnectLaudoHtml, buildVideoBlockHtml, formatBrDate } from '../lib/laudoTemplate.js'
import { appointmentRepository } from '../repositories/appointmentRepository.js'
import { communicationRepository } from '../repositories/communicationRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { reportRepository } from '../repositories/reportRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'
import { formatLocalDateInput } from '../utils/agendaDate.js'

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
    try {
      const { doctorId, profile } = await resolveDoctorIdForViewer()
      setDoctorName(profile?.name || '')
      if (!doctorId) {
        setAppointments([])
        setError('Não foi possível identificar o médico vinculado ao seu usuário.')
        return
      }
      const data = await appointmentRepository.getAll({ doctorId, status: 'checked_in' })
      const filtered = (data || [])
        .filter((appointment) => appointment.date === today && appointment.status === 'Aguardando')
        .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
      setAppointments(filtered)
    } catch (loadError) {
      setAppointments([])
      setError(translateErrorMessage(loadError) || 'Erro ao carregar a fila de atendimento.')
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

  const queueCount = appointments.length
  const nextPatient = appointments[0]
  const upcoming = appointments.slice(1)
  const nextInitials = initialsOf(nextPatient?.patient)

  return (
    <div className="page-enter grid gap-6">
      {/* HERO: contexto do médico + ação principal */}
      <header className="relative overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-primary/30 via-accent-primary to-accent-primary/30" aria-hidden="true" />
        <div className="grid gap-5 px-5 py-5 sm:px-7 md:grid-cols-[1fr_auto] md:items-end">
          <div className="flex items-start gap-4">
            <div className="metric-tone-blue flex size-12 items-center justify-center rounded-2xl shadow-card">
              <svg className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M3 12h4l2-5 4 10 2-5h6" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-primary">Atendimento · Sala de espera</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-text-heading md:text-3xl">
                {doctorName ? <>Bom atendimento, <span className="text-accent-primary">{firstName(doctorName)}</span>.</> : 'Sua fila de atendimento'}
              </h1>
              <p className="mt-1 text-sm capitalize text-text-muted-v2">{todayLabel}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-end">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border-default-v2 bg-surface-card-hover px-3.5 text-sm font-semibold text-text-body transition hover:bg-surface-card hover:border-border-strong"
              onClick={() => load()}
              type="button"
            >
              <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
              </svg>
              Atualizar
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-t border-border-subtle bg-surface-inset/50 px-5 py-4 sm:px-7 sm:grid-cols-2">
          {/* Próximo paciente em destaque */}
          {nextPatient ? (
            <button
              className="group flex items-center gap-4 rounded-xl border border-accent-primary/30 bg-accent-primary/5 px-4 py-3 text-left transition hover:border-accent-primary/60 hover:bg-accent-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              onClick={() => navigate(`/atendimento/${nextPatient.id}`)}
              type="button"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-primary text-base font-bold text-white shadow-card">
                {nextInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-primary">Próximo</p>
                <p className="mt-0.5 truncate text-base font-bold text-text-heading">{nextPatient.patient}</p>
                <p className="mt-0.5 truncate text-xs text-text-muted-v2">
                  {nextPatient.time || '--:--'} · {nextPatient.type || 'Consulta'}
                </p>
              </div>
              <span className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent-primary px-3 text-xs font-bold text-white shadow-card transition group-hover:bg-accent-hover">
                Atender
                <svg className="size-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-default-v2 px-4 py-3 text-sm text-text-muted-v2">
              <svg className="size-5 text-text-muted-v2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Nenhum paciente aguardando no momento.
            </div>
          )}

          {/* Métrica da fila */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border-default-v2 bg-surface-card px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted-v2">Em sala de espera</p>
              <p className="mt-0.5 text-2xl font-bold leading-none tabular-nums text-text-heading">{queueCount}</p>
            </div>
            <div className="text-right text-xs text-text-muted-v2">
              <p>{queueCount === 1 ? 'paciente' : 'pacientes'}</p>
              <p className="mt-0.5">aguardando</p>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
          <svg className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <p>{error}</p>
        </div>
      ) : null}

      {/* Fila completa */}
      <section className="overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
        <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-text-heading">Fila completa</h2>
            <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[11px] font-semibold tabular-nums text-text-muted-v2">
              {appointments.length}
            </span>
          </div>
          {upcoming.length > 0 ? (
            <span className="text-xs text-text-muted-v2">
              {upcoming.length} {upcoming.length === 1 ? 'após o próximo' : 'após o próximo'}
            </span>
          ) : null}
        </header>

        {loading ? (
          <div className="grid gap-2 p-5">
            {[0, 1, 2].map((index) => (
              <div className="skeleton h-16" key={index} />
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-surface-inset text-text-muted-v2">
              <svg className="size-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 11h-6M22 11l-2-2M22 11l-2 2" />
              </svg>
            </div>
            <p className="mt-3 text-base font-semibold text-text-heading">Nenhum paciente aguardando</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-text-muted-v2">
              Assim que a recepção confirmar a chegada de alguém, o paciente aparecerá aqui.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {appointments.map((appointment, index) => (
              <li key={appointment.id}>
                <QueueRow
                  appointment={appointment}
                  highlighted={index === 0}
                  onClick={() => navigate(`/atendimento/${appointment.id}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// Linha da fila com hora, avatar, dados e botão de atender.
function QueueRow({ appointment, highlighted, onClick }) {
  const initials = initialsOf(appointment.patient)
  return (
    <button
      className={`group flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-surface-card-hover focus-visible:bg-surface-card-hover focus-visible:outline-none ${
        highlighted ? 'bg-accent-primary/[0.04]' : ''
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-surface-inset px-2 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Hora</span>
        <span className="mt-0.5 text-lg font-bold tabular-nums text-text-heading">{appointment.time || '--:--'}</span>
      </div>
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
        highlighted ? 'bg-accent-primary text-white shadow-card' : 'bg-accent-primary/15 text-accent-primary'
      }`}>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base font-semibold text-text-heading">{appointment.patient}</p>
          {highlighted ? (
            <span className="rounded-full bg-accent-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-accent-primary">
              Próximo
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
      <div className="flex items-center gap-3">
        <span className="hidden rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300 sm:inline-flex">
          Aguardando
        </span>
        <svg className="size-5 text-text-muted-v2 transition group-hover:translate-x-1 group-hover:text-accent-primary" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </div>
    </button>
  )
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

function initialsOf(name) {
  return String(name || 'P')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P'
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


export function ConsultaPage({ navigate, appointmentId }) {
  const [appointment, setAppointment] = useState(null)
  const [patient, setPatient] = useState(null)
  const [doctor, setDoctor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [exam, setExam] = useState('')
  const [cidCode, setCidCode] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [showTranscript, setShowTranscript] = useState(false)
  // Toggle: quando ON, o nome do médico aparece na linha de assinatura. OFF =
  // linha em branco para assinar manualmente após imprimir.
  const [signDigitally, setSignDigitally] = useState(true)
  // Última versão do corpo do laudo que NÓS geramos (a partir dos campos ou da
  // transcrição). Se o editor estiver com esse conteúdo, podemos sobrescrever ao
  // mudar campos. Se o médico editou manualmente, o conteúdo difere e paramos
  // de auto-gerar para não perder a edição dele.
  const lastAutoLaudoHtmlRef = useRef('')

  const [videoScript, setVideoScript] = useState('')
  const [videoState, setVideoState] = useState('idle') // idle | generating | ready | error
  const [videoStatus, setVideoStatus] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoError, setVideoError] = useState('')
  const videoScriptTouchedRef = useRef(false)

  const [finishing, setFinishing] = useState(false)

  // Envio do laudo/vídeo para o paciente
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [sendIncludeLaudo, setSendIncludeLaudo] = useState(true)
  const [sendIncludeVideo, setSendIncludeVideo] = useState(false)
  const [sendNotifySms, setSendNotifySms] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendSuccess, setSendSuccess] = useState('')

  // Hook compartilhado de gravação por voz → transcrição → rascunho IA.
  // Quando a IA termina, recebemos os campos e construímos o HTML aqui
  // (para respeitar o toggle de assinatura digital).
  const handleDraftReady = useCallback((draft) => {
    setExam(draft.exam)
    setCidCode(draft.cidCode)
    setDiagnosis(draft.diagnosis)
    setConclusion(draft.conclusion)
    const recordedHtml = buildMediConnectLaudoHtml({
      patient,
      appointment,
      doctor,
      draft,
      transcript: draft.transcript,
      signDigitally,
    })
    lastAutoLaudoHtmlRef.current = recordedHtml
    setContentHtml(recordedHtml)
  }, [patient, appointment, doctor, signDigitally])

  const getReportContext = useCallback(() => ({
    patientName: patient?.name || appointment?.patient || '',
    complaint: appointment?.notes || '',
    exam: appointment?.type || 'Consulta',
  }), [patient, appointment])

  const {
    recordingState,
    recordingError,
    elapsedMs,
    transcript,
    recordingSupported,
    startRecording,
    stopRecording,
  } = useLaudoRecorder({ getReportContext, onDraftReady: handleDraftReady })

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
  }, [appointmentId])

  const canSendToPatient = (sendIncludeLaudo && (exam || diagnosis || conclusion || contentHtml)) || (sendIncludeVideo && videoUrl)

  const handleSendToPatient = useCallback(async () => {
    if (!appointment) return
    if (!sendIncludeLaudo && !sendIncludeVideo) {
      setSendError('Escolha pelo menos uma coisa para enviar (laudo ou vídeo).')
      return
    }
    if (sendIncludeVideo && !videoUrl) {
      setSendError('Você marcou para enviar o vídeo, mas ainda não há um vídeo gerado.')
      return
    }
    if (sendIncludeLaudo && !(exam || diagnosis || conclusion || contentHtml)) {
      setSendError('Você marcou para enviar o laudo, mas ele está vazio.')
      return
    }
    setSending(true)
    setSendError('')
    setSendSuccess('')
    try {
      const fallbackDraft = { exam, cidCode, diagnosis, conclusion }
      const baseHtml = sendIncludeLaudo
        ? (contentHtml || buildMediConnectLaudoHtml({ patient, appointment, doctor, draft: fallbackDraft, transcript }))
        : ''
      const videoBlock = sendIncludeVideo
        ? buildVideoBlockHtml(videoUrl, patient?.name || appointment.patient)
        : ''
      const finalHtml = [baseHtml, videoBlock].filter(Boolean).join('\n')

      const reportTitle = sendIncludeLaudo && sendIncludeVideo
        ? 'Laudo médico e mensagem em vídeo'
        : sendIncludeLaudo ? 'Laudo médico' : 'Mensagem em vídeo'

      await reportRepository.create({
        patientId: appointment.patientId,
        status: 'finalized',
        exam: sendIncludeLaudo ? (exam || appointment.type || 'Consulta') : reportTitle,
        cidCode: sendIncludeLaudo ? cidCode : '',
        diagnosis: sendIncludeLaudo ? diagnosis : '',
        conclusion: sendIncludeLaudo ? conclusion : (sendIncludeVideo ? 'Mensagem em vídeo do seu médico — assista no documento abaixo.' : ''),
        requestedBy: doctor?.name || '',
        contentHtml: finalHtml,
      })

      if (sendNotifySms && patient?.phone) {
        const what = sendIncludeLaudo && sendIncludeVideo
          ? 'um laudo e um vídeo'
          : sendIncludeLaudo ? 'um laudo médico' : 'uma mensagem em vídeo'
        await communicationRepository.sendSms({
          patientId: appointment.patientId,
          patientName: patient?.name || appointment.patient,
          phone: patient.phone,
          content: `Olá! Seu médico enviou ${what} pra você. Acesse o MediConnect em Laudos para visualizar.`,
        }).catch((smsError) => {
          // SMS falha não impede o envio do laudo — só registra
          console.warn('Falha no SMS de notificação:', smsError?.message)
          setSendError(`Laudo enviado, mas o SMS de aviso falhou: ${smsError?.message || 'erro do Twilio'}`)
        })
      }

      const successMsg = sendIncludeLaudo && sendIncludeVideo
        ? 'Laudo e vídeo enviados ao paciente.'
        : sendIncludeLaudo ? 'Laudo enviado ao paciente.' : 'Vídeo enviado ao paciente.'
      setSendSuccess(successMsg)
      window.dispatchEvent(new CustomEvent('app:show_toast', {
        detail: { title: 'Envio concluído', description: successMsg, type: 'success' },
      }))
      setTimeout(() => setSendModalOpen(false), 1200)
    } catch (sendErr) {
      setSendError(translateErrorMessage(sendErr?.message, 'Não foi possível enviar ao paciente.'))
    } finally {
      setSending(false)
    }
  }, [appointment, patient, doctor, exam, cidCode, diagnosis, conclusion, contentHtml, videoUrl, transcript, sendIncludeLaudo, sendIncludeVideo, sendNotifySms])

  const handleFinish = useCallback(async () => {
    if (!appointment) return
    if (!window.confirm('Marcar esta consulta como realizada?')) return
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
  }, [appointment, navigate])

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

  // Auto-popula o corpo do laudo (RichTextEditor) a partir dos campos preenchidos,
  // enquanto o médico não editou manualmente o editor. Comparar com o último HTML
  // que geramos deixa essa "edição manual" detectável sem flag extra. Também
  // re-renderiza quando o toggle de assinatura muda.
  useEffect(() => {
    if (!appointment) return
    const editorIsPristine = contentHtml === '' || contentHtml === lastAutoLaudoHtmlRef.current
    if (!editorIsPristine) return
    if (!(exam || cidCode || diagnosis || conclusion)) return
    const html = buildMediConnectLaudoHtml({
      patient,
      appointment,
      doctor,
      draft: { exam, cidCode, diagnosis, conclusion },
      transcript,
      signDigitally,
    })
    if (html === contentHtml) return
    lastAutoLaudoHtmlRef.current = html
    setContentHtml(html)
  }, [exam, cidCode, diagnosis, conclusion, patient, appointment, doctor, transcript, contentHtml, signDigitally])

  const videoSupported = useMemo(() => heygenClient.isLive(), [])

  const handleGenerateVideo = useCallback(async () => {
    if (!videoSupported) {
      setVideoError('Geração de vídeo indisponível: a chave VITE_HEYGEN_API_KEY não está configurada no .env.')
      return
    }
    const script = videoScript.trim()
    if (!script) {
      setVideoError('Escreva uma mensagem no roteiro antes de gerar o vídeo.')
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
      setVideoError(`Falha ao gerar o vídeo. ${genError?.message || 'Erro desconhecido do HeyGen.'}`)
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
      setVideoError(`Não foi possível baixar o vídeo direto (${downloadError?.message || 'erro de rede'}). Abri o arquivo em uma nova aba para você baixar manualmente.`)
    }
  }, [videoUrl, patient, appointment])

  if (loading) {
    return (
      <div className="grid gap-4 page-enter">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-96 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error || !appointment) {
    return (
      <div className="grid gap-4 page-enter">
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          <svg className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p>{error || 'Agendamento não encontrado.'}</p>
        </div>
        <div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card"
            onClick={() => navigate('/atendimento')}
            type="button"
          >
            <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="m15 6-6 6 6 6" />
            </svg>
            Voltar para Atendimento
          </button>
        </div>
      </div>
    )
  }

  const age = calculateAge(patient?.birthDate || patient?.birth_date)
  const ageLabel = age !== null ? `${age} anos` : 'Idade não informada'
  const birthDateLabel = formatBrDate(patient?.birthDate || patient?.birth_date)
  const initials = initialsOf(patient?.name || appointment.patient)

  return (
    <div className="page-enter grid gap-5 pb-28">
      {/* Voltar */}
      <button
        className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-xs font-semibold text-text-muted-v2 transition hover:bg-surface-card hover:text-text-body"
        onClick={() => navigate('/atendimento')}
        type="button"
      >
        <svg className="size-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="m15 6-6 6 6 6" />
        </svg>
        Voltar para a fila
      </button>

      {/* HERO DO PACIENTE */}
      <header className="relative overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-primary/40 via-accent-primary to-accent-primary/40" aria-hidden="true" />
        <div className="grid gap-5 px-5 py-5 sm:px-7 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-accent-primary text-xl font-bold text-white shadow-card sm:size-20">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Em atendimento
                </span>
              </div>
              <h1 className="mt-1 truncate text-xl font-bold leading-tight text-text-heading sm:text-2xl">
                {patient?.name || appointment.patient}
              </h1>
              <p className="mt-0.5 text-sm text-text-muted-v2">
                {ageLabel}
                {patient?.cpf ? <span> · CPF {patient.cpf}</span> : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <PatientFact icon="clock" label="Horário" value={appointment.time || '--:--'} mono />
            <PatientFact icon="stethoscope" label="Tipo" value={appointment.type || 'Consulta'} />
            <PatientFact icon="map-pin" label="Modalidade" value={appointment.mode || 'Presencial'} />
            <PatientFact icon="calendar" label="Nascimento" value={birthDateLabel} mono />
          </div>
        </div>
      </header>

      {/* Layout em duas colunas: contexto (esq) + laudo (dir) */}
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* CONTEXTO DO PACIENTE */}
        <aside className="lg:sticky lg:top-6 lg:self-start grid gap-5">
          <section className="overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
            <header className="border-b border-border-subtle px-5 py-3">
              <h2 className="text-sm font-bold text-text-heading">Anamnese do agendamento</h2>
            </header>
            <div className="px-5 py-4">
              {appointment.notes ? (
                <p className="whitespace-pre-line text-sm leading-6 text-text-body">{appointment.notes}</p>
              ) : (
                <p className="text-sm text-text-muted-v2">
                  Nenhuma observação foi registrada no agendamento deste paciente.
                </p>
              )}
            </div>
          </section>

          {doctor?.name ? (
            <section className="overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
              <header className="border-b border-border-subtle px-5 py-3">
                <h2 className="text-sm font-bold text-text-heading">Profissional responsável</h2>
              </header>
              <div className="px-5 py-4 text-sm">
                <p className="font-semibold text-text-heading">{doctor.name}</p>
                {doctor.specialty ? <p className="mt-0.5 text-text-body">{doctor.specialty}</p> : null}
                {doctor.crm ? <p className="mt-0.5 text-xs text-text-muted-v2">CRM {doctor.crm}</p> : null}
              </div>
            </section>
          ) : null}
        </aside>

        {/* CONTEÚDO PRINCIPAL */}
        <div className="grid gap-5">
          {/* Laudo médico */}
          <section className="overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-primary">
                  <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6M8 13h8M8 17h5" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-heading">Laudo médico</h2>
                  <p className="text-xs text-text-muted-v2">Preencha manualmente ou pelo ditado de voz</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SignatureToggle checked={signDigitally} onChange={setSignDigitally} />
                <RecordingToolbar
                  aiAvailable={aiClient.isLive()}
                  elapsedMs={elapsedMs}
                  onStart={startRecording}
                  onStop={stopRecording}
                  recordingState={recordingState}
                  supported={recordingSupported}
                />
              </div>
            </header>

            <div className="grid gap-5 px-5 py-5 sm:px-6">
              {!recordingSupported ? (
                <InlineNotice tone="warning">
                  {!aiClient.isLive()
                    ? 'Preenchimento por voz desabilitado: a chave VITE_GEMINI_API_KEY não está configurada no .env.'
                    : 'Este navegador não suporta gravação de áudio. Use uma versão recente do Chrome, Edge ou Firefox.'}
                </InlineNotice>
              ) : null}
              {recordingError ? <InlineNotice tone="danger">{recordingError}</InlineNotice> : null}
              {recordingState === 'transcribing' ? (
                <InlineNotice tone="info">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-1.5 animate-pulse rounded-full bg-accent-primary" />
                    Transcrevendo o áudio e gerando rascunho do laudo...
                  </span>
                </InlineNotice>
              ) : null}

              {/* Identificação do laudo */}
              <div>
                <FieldGroupTitle>Identificação</FieldGroupTitle>
                <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_180px]">
                  <Field label="Exame / motivo">
                    <input
                      className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                      onChange={(event) => setExam(event.target.value)}
                      placeholder="Ex.: Consulta de retorno"
                      value={exam}
                    />
                  </Field>
                  <Field label="CID">
                    <input
                      className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm font-mono text-text-body uppercase outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                      onChange={(event) => setCidCode(event.target.value)}
                      placeholder="Ex.: R51"
                      value={cidCode}
                    />
                  </Field>
                </div>
              </div>

              {/* Avaliação clínica */}
              <div>
                <FieldGroupTitle>Avaliação clínica</FieldGroupTitle>
                <div className="mt-3 grid gap-4">
                  <Field label="Diagnóstico">
                    <textarea
                      className="min-h-24 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-6 text-text-body outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                      onChange={(event) => setDiagnosis(event.target.value)}
                      placeholder="Descreva o diagnóstico clínico do paciente."
                      value={diagnosis}
                    />
                  </Field>
                  <Field label="Conclusão e conduta">
                    <textarea
                      className="min-h-24 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-6 text-text-body outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                      onChange={(event) => setConclusion(event.target.value)}
                      placeholder="Resumo da conduta, prescrições e orientações."
                      value={conclusion}
                    />
                  </Field>
                </div>
              </div>

              {/* Corpo do relatório */}
              <div>
                <FieldGroupTitle>Corpo do laudo</FieldGroupTitle>
                <p className="mt-1 text-xs text-text-muted-v2">Editor com letterhead da clínica — base para o documento final.</p>
                <div className="mt-3 overflow-hidden rounded-lg border border-border-default-v2 bg-surface-inset">
                  <RichTextEditor onChange={setContentHtml} value={contentHtml} />
                </div>
              </div>

              {transcript ? (
                <details className="group rounded-lg border border-border-subtle bg-surface-inset/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-semibold text-text-muted-v2 hover:text-text-body">
                    <span className="inline-flex items-center gap-2">
                      <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path d="M4 6h16M4 12h16M4 18h10" />
                      </svg>
                      Transcrição bruta do áudio
                    </span>
                    <svg className="size-3 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-border-subtle px-4 py-3 text-xs text-text-body">
                    {transcript}
                  </pre>
                </details>
              ) : null}
            </div>
          </section>

          {/* Mensagem em vídeo */}
          <section className="overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
            <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-fuchsia-500/15 text-fuchsia-400">
                  <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <polygon points="6 4 20 12 6 20 6 4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-heading">Mensagem em vídeo</h2>
                  <p className="text-xs text-text-muted-v2">Gere um vídeo curto com avatar para o paciente</p>
                </div>
              </div>
              <span className="rounded-full bg-surface-inset px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">
                Opcional
              </span>
            </header>

            <div className="grid gap-4 px-5 py-5 sm:px-6">
              {!videoSupported ? (
                <InlineNotice tone="warning">
                  Geração de vídeo desabilitada: a chave <code className="font-mono">VITE_HEYGEN_API_KEY</code> não está configurada no <code className="font-mono">.env</code>.
                </InlineNotice>
              ) : null}

              <Field label="Roteiro do vídeo">
                <textarea
                  className="min-h-32 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-6 text-text-body outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                  onChange={(event) => {
                    videoScriptTouchedRef.current = true
                    setVideoScript(event.target.value)
                  }}
                  placeholder="Olá, [nome]. Aqui vai um resumo da nossa consulta..."
                  value={videoScript}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-fuchsia-600 px-4 text-sm font-bold text-white shadow-card transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:bg-surface-card-hover disabled:text-text-muted-v2 disabled:shadow-none"
                  disabled={!videoSupported || videoState === 'generating' || !videoScript.trim()}
                  onClick={handleGenerateVideo}
                  type="button"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <polygon points="6 4 20 12 6 20 6 4" />
                  </svg>
                  {videoState === 'generating' ? 'Gerando...' : videoState === 'ready' ? 'Gerar novamente' : 'Gerar vídeo'}
                </button>
                {videoState === 'generating' && videoStatus ? (
                  <span className="inline-flex items-center gap-2 text-xs text-text-muted-v2">
                    <span className="size-1.5 animate-pulse rounded-full bg-fuchsia-400" />
                    {videoStatus}
                  </span>
                ) : null}
              </div>

              {videoError ? <InlineNotice tone="danger">{videoError}</InlineNotice> : null}

              {videoUrl ? (
                <div className="grid gap-3 rounded-lg border border-border-subtle bg-surface-inset/60 p-4">
                  <video
                    className="w-full max-w-xl rounded-md border border-border-default-v2 bg-black"
                    controls
                    src={videoUrl}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-card transition hover:bg-emerald-700"
                      onClick={handleSendVideo}
                      type="button"
                    >
                      <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />
                      </svg>
                      Baixar MP4
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
            </div>
          </section>
        </div>
      </div>

      {/* Action bar sticky */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default-v2 bg-surface-card/95 shadow-elevated backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-7">
          <div className="hidden items-center gap-2 text-xs text-text-muted-v2 sm:flex">
            <svg className="size-4 text-accent-primary" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span>Atendendo <strong className="text-text-heading">{patient?.name || appointment.patient}</strong></span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card"
              onClick={() => navigate('/atendimento')}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-fuchsia-500/50 bg-fuchsia-500/10 px-4 text-sm font-bold text-fuchsia-300 transition hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:border-border-default-v2 disabled:bg-surface-card-hover disabled:text-text-muted-v2 disabled:opacity-60"
              disabled={!(exam || diagnosis || conclusion || contentHtml || videoUrl)}
              onClick={() => {
                setSendError('')
                setSendSuccess('')
                setSendIncludeLaudo(Boolean(exam || diagnosis || conclusion || contentHtml))
                setSendIncludeVideo(Boolean(videoUrl))
                setSendModalOpen(true)
              }}
              type="button"
            >
              <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />
              </svg>
              Enviar ao paciente
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white shadow-card transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={finishing}
              onClick={handleFinish}
              type="button"
            >
              <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {finishing ? 'Finalizando...' : 'Finalizar consulta'}
            </button>
          </div>
        </div>
      </div>

      {sendModalOpen ? (
        <SendToPatientModal
          canSend={canSendToPatient}
          error={sendError}
          hasLaudo={Boolean(exam || diagnosis || conclusion || contentHtml)}
          hasVideo={Boolean(videoUrl)}
          includeLaudo={sendIncludeLaudo}
          includeVideo={sendIncludeVideo}
          notifySms={sendNotifySms}
          onClose={() => setSendModalOpen(false)}
          onConfirm={handleSendToPatient}
          onToggleLaudo={() => setSendIncludeLaudo((value) => !value)}
          onToggleSms={() => setSendNotifySms((value) => !value)}
          onToggleVideo={() => setSendIncludeVideo((value) => !value)}
          patientName={patient?.name || appointment.patient}
          patientPhone={patient?.phone || ''}
          sending={sending}
          success={sendSuccess}
        />
      ) : null}
    </div>
  )
}

// Modal para enviar laudo e/ou vídeo ao paciente.
function SendToPatientModal({ canSend, error, hasLaudo, hasVideo, includeLaudo, includeVideo, notifySms, onClose, onConfirm, onToggleLaudo, onToggleSms, onToggleVideo, patientName, patientPhone, sending, success }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-elevated"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-fuchsia-500/15 text-fuchsia-400">
              <svg className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-text-heading">Enviar ao paciente</h2>
              <p className="text-xs text-text-muted-v2">Para <strong className="text-text-body">{patientName}</strong></p>
            </div>
          </div>
          <button
            aria-label="Fechar"
            className="inline-flex size-8 items-center justify-center rounded-md text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-body"
            onClick={onClose}
            type="button"
          >
            <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="grid gap-3 px-5 py-5">
          <p className="text-xs text-text-muted-v2">O paciente verá o conteúdo na aba <strong className="text-text-body">Laudos</strong> dele.</p>

          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition has-[:checked]:border-accent-primary/60 has-[:checked]:bg-accent-primary/5 ${
            !hasLaudo ? 'border-border-subtle bg-surface-inset/40 opacity-60 cursor-not-allowed' : 'border-border-default-v2 hover:border-border-strong'
          }`}>
            <input
              checked={includeLaudo && hasLaudo}
              className="mt-0.5 size-4 accent-accent-primary"
              disabled={!hasLaudo}
              onChange={onToggleLaudo}
              type="checkbox"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-text-heading">
                <svg className="size-4 text-accent-primary" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" />
                </svg>
                Laudo médico
              </p>
              <p className="mt-0.5 text-xs text-text-muted-v2">
                {hasLaudo ? 'Inclui exame, CID, diagnóstico, conclusão e o corpo do relatório.' : 'Preencha algum campo do laudo primeiro para incluí-lo.'}
              </p>
            </div>
          </label>

          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition has-[:checked]:border-fuchsia-500/60 has-[:checked]:bg-fuchsia-500/5 ${
            !hasVideo ? 'border-border-subtle bg-surface-inset/40 opacity-60 cursor-not-allowed' : 'border-border-default-v2 hover:border-border-strong'
          }`}>
            <input
              checked={includeVideo && hasVideo}
              className="mt-0.5 size-4 accent-fuchsia-500"
              disabled={!hasVideo}
              onChange={onToggleVideo}
              type="checkbox"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-text-heading">
                <svg className="size-4 text-fuchsia-400" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                  <polygon points="6 4 20 12 6 20 6 4" />
                </svg>
                Mensagem em vídeo
              </p>
              <p className="mt-0.5 text-xs text-text-muted-v2">
                {hasVideo ? 'O vídeo fica embedado no laudo, com player nativo para o paciente assistir.' : 'Gere a mensagem em vídeo primeiro para incluí-la.'}
              </p>
            </div>
          </label>

          <div className="mt-2 border-t border-border-subtle pt-3">
            <label className={`flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1 ${!patientPhone ? 'opacity-60 cursor-not-allowed' : 'hover:bg-surface-card-hover'}`}>
              <input
                checked={notifySms && Boolean(patientPhone)}
                className="mt-0.5 size-4 accent-emerald-500"
                disabled={!patientPhone}
                onChange={onToggleSms}
                type="checkbox"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-text-body">
                  <svg className="size-4 text-emerald-400" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72a2 2 0 0 1 1.72 2.01z" />
                  </svg>
                  Avisar por SMS
                </p>
                <p className="mt-0.5 text-xs text-text-muted-v2">
                  {patientPhone ? <>Envia um SMS via Twilio para <span className="text-text-body">{patientPhone}</span>.</> : 'O paciente não tem telefone cadastrado.'}
                </p>
              </div>
            </label>
          </div>

          {error ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>
          ) : null}
          {success ? (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{success}</p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-inset/40 px-5 py-4">
          <button
            className="inline-flex h-10 items-center rounded-md border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card disabled:opacity-60"
            disabled={sending}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-accent-primary px-4 text-sm font-bold text-white shadow-card transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSend || sending || Boolean(success)}
            onClick={onConfirm}
            type="button"
          >
            {sending ? (
              <>
                <svg className="size-4 animate-spin" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Enviando...
              </>
            ) : (
              <>
                <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />
                </svg>
                Enviar agora
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}

// Pílula de fato do paciente usada no hero da ConsultaPage.
function PatientFact({ icon, label, value, mono }) {
  const icons = {
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    stethoscope: <><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 12 0V4a2 2 0 0 0-2-2h-1a.3.3 0 1 0 .2.3" /><path d="M8 15v2a4 4 0 0 0 8 0v-3" /><circle cx="20" cy="10" r="2" /></>,
    'map-pin': <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>,
    calendar: <><rect height="18" rx="2" width="18" x="3" y="4" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  }
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-inset/60 px-3 py-2">
      <div className="flex size-8 items-center justify-center rounded-lg bg-surface-card text-text-muted-v2">
        <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          {icons[icon] || <circle cx="12" cy="12" r="9" />}
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">{label}</p>
        <p className={`truncate text-sm font-semibold text-text-heading ${mono ? 'tabular-nums' : ''}`}>{value}</p>
      </div>
    </div>
  )
}

// Título de um grupo de campos no card do laudo.
function FieldGroupTitle({ children }) {
  return (
    <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted-v2">
      <span className="h-px w-4 bg-border-default-v2" aria-hidden="true" />
      {children}
    </h3>
  )
}

// Wrapper de label + campo com espaçamento consistente.
function Field({ label, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-text-body">{label}</span>
      {children}
    </label>
  )
}

// Aviso inline coerente entre seções (info / warning / danger).
function InlineNotice({ tone = 'info', children }) {
  const tones = {
    info: 'border-accent-primary/30 bg-accent-primary/5 text-text-body',
    warning: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    danger: 'border-red-500/40 bg-red-500/10 text-red-200',
  }
  const iconByTone = {
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>,
    warning: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>,
    danger: <><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></>,
  }
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-5 ${tones[tone] || tones.info}`}>
      <svg className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        {iconByTone[tone] || iconByTone.info}
      </svg>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

