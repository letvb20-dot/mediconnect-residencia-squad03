import { useCallback, useEffect, useMemo, useState } from 'react'

import { normalizeRole } from '../config/permissions.js'
import { appCardClass as cardClass, appInputClass as inputClass, appLabelClass as labelClass } from '../components/ui.jsx'
import { aiClient } from '../lib/ai/aiClient.js'
import { analyzeGaps, suggestFits } from '../lib/ai/waitlistEngine.js'
import { appointmentRepository } from '../repositories/appointmentRepository.js'
import { availabilityRepository } from '../repositories/availabilityRepository.js'
import { notificationRepository } from '../repositories/notificationRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { waitlistRepository, WAITLIST_CHANGED_EVENT } from '../repositories/waitlistRepository.js'

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'E-mail' },
]

const emptyForm = {
  patientId: '',
  doctorId: '',
  preferredType: 'presencial',
  urgency: 3,
  reason: '',
  channel: 'whatsapp',
}

export function WaitlistPage({ role }) {
  const normalizedRole = normalizeRole(role)
  const canManage = ['admin', 'gestor', 'secretaria'].includes(normalizedRole)

  const [patients, setPatients] = useState([])
  const [professionals, setProfessionals] = useState([])
  const [appointments, setAppointments] = useState([])
  const [entries, setEntries] = useState(() => waitlistRepository.getAll())
  const [form, setForm] = useState(emptyForm)
  const [gapDoctorId, setGapDoctorId] = useState('')
  const [gaps, setGaps] = useState([])
  const [gapLoading, setGapLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    Promise.all([
      patientRepository.getAll().catch(() => []),
      professionalRepository.getAll().catch(() => []),
      appointmentRepository.getAll().catch(() => []),
    ]).then(([patientData, professionalData, appointmentData]) => {
      if (!active) return
      setPatients(patientData || [])
      setProfessionals(professionalData || [])
      setAppointments(appointmentData || [])
    })

    function reload() {
      setEntries(waitlistRepository.getAll())
    }

    window.addEventListener(WAITLIST_CHANGED_EVENT, reload)
    return () => {
      active = false
      window.removeEventListener(WAITLIST_CHANGED_EVENT, reload)
    }
  }, [])

  const ranked = useMemo(() => aiClient.rankWaitlist({ waitlist: entries, slot: {} }), [entries])
  const risks = useMemo(() => aiClient.predictCancellations({ appointments }).slice(0, 6), [appointments])

  const fits = useMemo(() => {
    if (!gapDoctorId || !gaps.length) return []
    return suggestFits({ gaps, waitlist: entries, doctorId: gapDoctorId }).slice(0, 8)
  }, [entries, gapDoctorId, gaps])

  const patientName = useCallback(
    (id) => {
      const patient = patients.find((item) => String(item.id) === String(id))
      return patient?.name || patient?.full_name || patient?.nome || 'Paciente'
    },
    [patients],
  )

  const doctorName = useCallback(
    (id) => professionals.find((item) => String(item.id) === String(id))?.name || 'Médico(a)',
    [professionals],
  )

  const analyzeDoctorGaps = useCallback(async (doctorId) => {
    setGapDoctorId(doctorId)
    setGaps([])
    if (!doctorId) return

    setGapLoading(true)
    try {
      const startDate = formatDate(new Date())
      const endDate = formatDate(addDays(new Date(), 7))
      const slots = await availabilityRepository.getAvailableSlots({ startDate, endDate, doctorId })
      const doctorAppointments = appointments.filter((appointment) => String(appointment.professionalId) === String(doctorId))
      setGaps(analyzeGaps({ slots, appointments: doctorAppointments }))
    } catch {
      setGaps([])
    } finally {
      setGapLoading(false)
    }
  }, [appointments])

  function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!form.patientId) {
      setError('Selecione um paciente para inscrever na lista de espera.')
      return
    }

    waitlistRepository.add({
      ...form,
      patientName: patientName(form.patientId),
      doctorName: doctorName(form.doctorId),
    })
    setForm(emptyForm)
  }

  function notify(entry) {
    notificationRepository.notifyCurrentUser({
      domain: 'agenda',
      channel: entry.channel,
      title: 'Encaixe disponível',
      detail: `${entry.patientName} pode ser encaixado(a)${entry.doctorName ? ` com ${entry.doctorName}` : ''} via ${channelLabel(entry.channel)}.`,
      route: '/lista-espera',
    }).catch(() => null)
    waitlistRepository.markNotified(entry.id, entry.channel)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-text-body">
      <div>
        <h1 className="text-[32px] font-bold leading-8 tracking-[-0.02em]">Lista de Espera Inteligente</h1>
        <p className="mt-1 text-sm text-text-muted-v2">
          Priorização por urgência, predição de cancelamentos e sugestão de encaixe em lacunas de agenda.
        </p>
      </div>

      {canManage ? (
        <section className={`${cardClass} p-6`}>
          <h2 className="mb-4 text-lg font-bold text-text-heading">Inscrever na Lista</h2>
          {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
          <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
            <Field label="Paciente *">
              <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, patientId: event.target.value }))} value={form.patientId}>
                <option value="">Selecione</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>{patient.name || patient.full_name || patient.nome}</option>
                ))}
              </select>
            </Field>

            <Field label="Médico (preferência)">
              <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, doctorId: event.target.value }))} value={form.doctorId}>
                <option value="">Qualquer</option>
                {professionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>{professional.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Modalidade">
              <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, preferredType: event.target.value }))} value={form.preferredType}>
                <option value="presencial">Presencial</option>
                <option value="telemedicina">Teleconsulta</option>
              </select>
            </Field>

            <Field label={`Urgência: ${form.urgency}/5`}>
              <input className="w-full accent-[#3b82f6]" max={5} min={1} onChange={(event) => setForm((current) => ({ ...current, urgency: Number(event.target.value) }))} type="range" value={form.urgency} />
            </Field>

            <Field label="Canal de contato">
              <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))} value={form.channel}>
                {CHANNELS.map((channel) => (
                  <option key={channel.value} value={channel.value}>{channel.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Motivo / observação">
              <input className={inputClass} maxLength={255} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} value={form.reason} />
            </Field>

            <div className="md:col-span-3">
              <button className="inline-flex h-10 items-center rounded-lg bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-accent-hover" type="submit">
                Adicionar à lista
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <h2 className="mb-4 text-lg font-bold text-text-heading">Pacientes na Espera ({ranked.length})</h2>
        <div className="overflow-x-auto rounded-xl border border-border-default-v2">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-inset text-xs font-semibold uppercase text-text-muted-v2">
              <tr>
                <th className="px-4 py-3">Paciente</th>
                <th className="px-4 py-3">Médico</th>
                <th className="px-4 py-3">Urgência</th>
                <th className="px-4 py-3">Prioridade IA</th>
                <th className="px-4 py-3">Status</th>
                {canManage ? <th className="px-4 py-3 text-right">Ações</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default-v2">
              {ranked.length ? ranked.map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-card-hover">
                  <td className="px-4 py-3 font-medium">{entry.patientName}</td>
                  <td className="px-4 py-3 text-text-muted-v2">{entry.doctorName || 'Qualquer'}</td>
                  <td className="px-4 py-3">{entry.urgency}/5</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-accent-primary/15 px-2 py-1 text-xs font-bold text-accent-primary" title={entry.matchReasons?.join(', ')}>
                      {entry.matchScore}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-1 text-[10px] font-bold ${entry.status === 'notificado' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {entry.status === 'notificado' ? 'Notificado' : 'Aguardando'}
                    </span>
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button className="rounded-lg border border-border-default-v2 bg-surface-inset px-3 py-1.5 text-xs font-semibold transition hover:bg-surface-card-hover" onClick={() => notify(entry)} type="button">
                          Notificar
                        </button>
                        <button className="rounded-lg border border-border-default-v2 bg-surface-inset px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-950/30" onClick={() => waitlistRepository.remove(entry.id)} type="button">
                          Remover
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              )) : (
                <tr>
                  <td className="px-4 py-8 text-center text-text-muted-v2" colSpan={canManage ? 6 : 5}>A lista de espera está vazia.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${cardClass} p-6`}>
          <h2 className="mb-2 text-lg font-bold text-text-heading">Encaixes Sugeridos</h2>
          <p className="mb-4 text-xs text-text-muted-v2">Cruza lacunas de agenda (próximos 7 dias) com a lista de espera.</p>
          <select className={`${inputClass} mb-4`} onChange={(event) => analyzeDoctorGaps(event.target.value)} value={gapDoctorId}>
            <option value="">Selecione um médico</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>{professional.name}</option>
            ))}
          </select>
          {gapLoading ? <p className="text-sm text-text-muted-v2">Analisando lacunas...</p> : null}
          {!gapLoading && gapDoctorId && !fits.length ? <p className="text-sm text-text-muted-v2">Nenhum encaixe sugerido (sem lacunas ou sem pacientes compatíveis).</p> : null}
          <ul className="space-y-2">
            {fits.map((fit, index) => (
              <li className="rounded-lg border border-border-default-v2 bg-surface-inset px-3 py-2 text-sm" key={index}>
                <span className="font-semibold">{formatDateBr(fit.gap.date)} às {fit.gap.time}</span>
                {' → '}
                <span className="text-accent-primary">{fit.candidate.patientName}</span>
                <span className="text-text-muted-v2"> (prioridade {fit.candidate.matchScore})</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${cardClass} p-6`}>
          <h2 className="mb-2 text-lg font-bold text-text-heading">Risco de Cancelamento</h2>
          <p className="mb-4 text-xs text-text-muted-v2">Agendamentos com maior probabilidade de falta/cancelamento — candidatos a confirmar ou abrir para encaixe.</p>
          <ul className="space-y-2">
            {risks.length ? risks.map((appointment) => (
              <li className="flex items-center justify-between rounded-lg border border-border-default-v2 bg-surface-inset px-3 py-2 text-sm" key={appointment.id}>
                <div>
                  <p className="font-medium">{appointment.patient}</p>
                  <p className="text-xs text-text-muted-v2">{formatDateBr(appointment.date)} às {appointment.time} · {appointment.riskReasons?.join(', ') || 'sem fatores'}</p>
                </div>
                <span className={`rounded px-2 py-1 text-[10px] font-bold ${riskClass(appointment.riskLevel)}`}>{appointment.riskLevel} {appointment.riskScore}%</span>
              </li>
            )) : <p className="text-sm text-text-muted-v2">Sem agendamentos analisáveis.</p>}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Field({ children, label }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}

function riskClass(level) {
  if (level === 'alto') return 'bg-red-500/20 text-red-400'
  if (level === 'médio') return 'bg-amber-500/20 text-amber-400'
  return 'bg-emerald-500/20 text-emerald-400'
}

function channelLabel(value) {
  return CHANNELS.find((channel) => channel.value === value)?.label || 'WhatsApp'
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateBr(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}
