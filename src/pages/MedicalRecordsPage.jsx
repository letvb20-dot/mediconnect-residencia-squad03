import { useEffect, useMemo, useState } from 'react'

import { RichTextEditor } from '../components/RichTextEditor.jsx'
import { medicalRecordRepository } from '../repositories/medicalRecordRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'
import { notificationRepository } from '../repositories/notificationRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { reportRepository } from '../repositories/reportRepository.js'
import { sanitizePlainText } from '../utils/inputSanitizers.js'

const inputClass =
  'h-10 w-full rounded-lg border border-border-default-v2 bg-surface-inset px-3 text-sm text-text-heading outline-none transition placeholder:text-text-muted-v2 focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]'
const textareaClass =
  'min-h-28 w-full rounded-lg border border-border-default-v2 bg-surface-inset px-3 py-2 text-sm leading-6 text-text-heading outline-none transition placeholder:text-text-muted-v2 focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]'
const labelClass = 'mb-1 block text-xs font-medium text-text-heading'
const cardClass = 'rounded-2xl border border-border-default-v2 bg-surface-card shadow-sm'

const emptyRecord = {
  id: '',
  patientId: '',
  patient: '',
  date: '',
  time: '',
  type: 'Prontuário multiprofissional',
  cid: '',
  diagnosis: '',
  diagnosticReasoning: '',
  conduct: '',
  prescriptions: '',
  procedures: '',
  examResults: '',
  contentHtml: '',
  status: 'completo',
}

export function MedicalRecordsPage({ mode = 'list', navigate, recordId }) {
  const [records, setRecords] = useState([])
  const [patients, setPatients] = useState([])
  const [reports, setReports] = useState([])
  const [viewerProfile, setViewerProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState(emptyRecord)

  useEffect(() => {
    let active = true

    Promise.all([
      medicalRecordRepository.getInitialRecords(),
      patientRepository.getDirectoryRows().catch(() => []),
      profileRepository.getCurrentUserProfile().catch(() => null),
    ])
      .then(async ([recordData, patientData, profile]) => {
        if (!active) return
        setRecords(recordData || [])
        setPatients(patientData || [])
        setViewerProfile(profile)

        if (mode === 'new') {
          setDraft({ ...emptyRecord, patientId: patientData?.[0]?.id || '', date: toDateInput(new Date()), time: toTimeInput(new Date()) })
        }

        if ((mode === 'detail' || mode === 'edit') && recordId) {
          const record = await medicalRecordRepository.getById(recordId).catch(() =>
            (recordData || []).find((item) => String(item.id) === String(recordId)) || null,
          )
          if (!active) return
          if (record) {
            setDraft(recordToDraft(record))
            if (record.patientId) {
              const reportData = await reportRepository.getInitialReports({ patientId: record.patientId }).catch(() => [])
              if (active) setReports(reportData || [])
            }
          }
        }
      })
      .catch((loadError) => {
        if (!active) return
        setError(translateErrorMessage(loadError.message, 'Erro ao carregar prontuários.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [mode, recordId])

  const patientOptions = useMemo(
    () => patients.map((patient) => ({ id: String(patient.id || patient.detailId || ''), name: getPatientName(patient), phone: patient.phone || '', email: patient.email || '' })),
    [patients],
  )

  const filteredRecords = useMemo(() => {
    const query = normalizeSearch(search)
    if (!query) return records

    return records.filter((record) =>
      [record.patient, record.cid, record.doctor, record.type, record.summary, record.diagnosis, record.conduct]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(query),
    )
  }, [records, search])

  async function saveRecord(event) {
    event.preventDefault()
    if (!draft.patientId) {
      window.alert('Selecione um paciente antes de salvar o prontuário.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...draft,
        patient: patientOptions.find((patient) => patient.id === draft.patientId)?.name || draft.patient,
        doctor: viewerProfile?.name || draft.doctor,
        signedBy: viewerProfile?.name || viewerProfile?.email || 'Profissional MediConnect',
      }
      const saved = mode === 'edit'
        ? await medicalRecordRepository.update(draft.id, payload)
        : await medicalRecordRepository.create(payload)

      notificationRepository.notifyCurrentUser({
        domain: 'medical-records',
        title: mode === 'edit' ? 'Prontuário atualizado' : 'Prontuário criado',
        detail: `Prontuário de ${payload.patient || 'paciente selecionado'} foi salvo.`,
        patientId: payload.patientId,
        relatedUserIds: [viewerProfile?.id, viewerProfile?.doctorId],
      }).catch(() => null)

      navigate(`/prontuario/${saved.id || draft.id}`)
    } catch (saveError) {
      window.alert(`Erro ao salvar prontuário: ${translateErrorMessage(saveError.message, 'Erro ao salvar prontuário.')}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="p-8 text-center text-sm text-text-muted-v2">Carregando prontuários...</p>

  if (mode === 'new' || mode === 'edit') {
    return (
      <RecordForm
        draft={draft}
        onCancel={() => navigate(mode === 'edit' && draft.id ? `/prontuario/${draft.id}` : '/prontuario')}
        onChange={setDraft}
        onSubmit={saveRecord}
        patientOptions={patientOptions}
        saving={saving}
        title={mode === 'edit' ? 'Editar prontuário' : 'Novo prontuário'}
      />
    )
  }

  if (mode === 'detail') {
    return (
      <RecordDetail
        navigate={navigate}
        patient={patientOptions.find((item) => item.id === String(draft.patientId))}
        record={draft}
        reports={reports}
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-text-heading">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-heading">Prontuário Médico</h1>
          <p className="mt-1 text-sm text-text-muted-v2">Histórico clínico contínuo, cronológico e multiprofissional.</p>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#3b82f6] px-4 text-sm font-medium text-white transition hover:bg-[#2563eb]"
          onClick={() => navigate('/prontuario/novo')}
          type="button"
        >
          <RecordIcon name="plus" />
          Novo prontuário
        </button>
      </div>

      <section className={`${cardClass} p-4`}>
        <div className="relative">
          <RecordIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted-v2" name="search" />
          <input
            className="h-10 w-full rounded-lg border border-border-default-v2 bg-surface-inset py-2 pl-10 pr-3 text-sm text-text-heading outline-none transition placeholder:text-text-muted-v2 focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por paciente, CID, médico ou resumo..."
            value={search}
          />
        </div>
      </section>

      {error ? <div className={`${cardClass} p-5 text-sm text-red-300`}>{error}</div> : null}

      <div className="space-y-3">
        {filteredRecords.length ? (
          filteredRecords.map((record) => <RecordCard key={record.id} navigate={navigate} record={record} />)
        ) : (
          <div className={`${cardClass} p-8 text-center text-sm text-text-muted-v2`}>Nenhum prontuário encontrado na API.</div>
        )}
      </div>
    </div>
  )
}

function RecordCard({ navigate, record }) {
  const statusClass = record.status === 'completo' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'

  return (
    <button className={`${cardClass} block w-full p-5 text-left transition hover:border-[#3b82f6]/30`} onClick={() => navigate(`/prontuario/${record.id}`)} type="button">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#3b82f6]/10 text-[#3b82f6]">
            <RecordIcon className="size-5" name="file" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-text-heading">{record.patient}</h2>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass}`}>{record.status === 'completo' ? 'Completo' : 'Rascunho'}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted-v2">
              <span>{record.date}</span>
              <span>{record.doctor}</span>
              <span>{record.type}</span>
            </div>
            <p className="mt-2 inline-block rounded bg-surface-inset px-2 py-1 text-xs text-text-muted-v2">{record.cid}</p>
            <p className="mt-2 text-xs leading-5 text-text-muted-v2">{record.summary}</p>
          </div>
        </div>
      </div>
    </button>
  )
}

function RecordForm({ draft, onCancel, onChange, onSubmit, patientOptions, saving, title }) {
  function update(field, value) {
    onChange((current) => ({ ...current, [field]: value }))
  }

  return (
    <form className="mx-auto max-w-6xl space-y-6 text-text-heading" onSubmit={onSubmit}>
      <header className="flex flex-col gap-4 border-b border-border-default-v2 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-text-muted-v2">Preencha o registro clínico com dados legíveis, cronológicos e assinados.</p>
        </div>
        <div className="flex gap-3">
          <button className="rounded-lg border border-border-default-v2 bg-surface-card px-4 py-2 text-sm font-semibold" onClick={onCancel} type="button">Cancelar</button>
          <button className="rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={saving} type="submit">
            {saving ? 'Salvando...' : 'Salvar prontuário'}
          </button>
        </div>
      </header>

      <section className={`${cardClass} p-6`}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Paciente *">
            <select className={inputClass} onChange={(event) => update('patientId', event.target.value)} required value={draft.patientId}>
              <option value="">Selecione</option>
              {patientOptions.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data *">
              <input className={`${inputClass} [color-scheme:dark]`} onChange={(event) => update('date', event.target.value)} required type="date" value={draft.date} />
            </Field>
            <Field label="Hora *">
              <input className={`${inputClass} [color-scheme:dark]`} onChange={(event) => update('time', event.target.value)} required type="time" value={draft.time} />
            </Field>
          </div>
          <Field label="Tipo">
            <input className={inputClass} onChange={(event) => update('type', sanitizePlainText(event.target.value))} value={draft.type} />
          </Field>
          <Field label="CID-10">
            <input className={inputClass} onChange={(event) => update('cid', sanitizePlainText(event.target.value))} value={draft.cid} />
          </Field>
        </div>
      </section>

      <section className={`${cardClass} space-y-4 p-6`}>
        <Field label="Histórico e relatórios do paciente">
          <RichTextEditor onChange={(value) => update('contentHtml', value)} value={draft.contentHtml} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Diagnóstico">
            <textarea className={textareaClass} onChange={(event) => update('diagnosis', sanitizePlainText(event.target.value))} placeholder="Raciocínio médico, hipóteses diagnósticas e diagnóstico definitivo" value={draft.diagnosis} />
          </Field>
          <Field label="Conduta">
            <textarea className={textareaClass} onChange={(event) => update('conduct', sanitizePlainText(event.target.value))} placeholder="Prescrições, procedimentos, cirurgias e orientações" value={draft.conduct} />
          </Field>
          <Field label="Prescrições e procedimentos">
            <textarea className={textareaClass} onChange={(event) => update('prescriptions', sanitizePlainText(event.target.value))} value={draft.prescriptions} />
          </Field>
          <Field label="Resultados de exames">
            <textarea className={textareaClass} onChange={(event) => update('examResults', sanitizePlainText(event.target.value))} placeholder="Laudos laboratoriais e de imagem" value={draft.examResults} />
          </Field>
        </div>
      </section>
    </form>
  )
}

function RecordDetail({ navigate, patient, record, reports }) {
  if (!record?.id) {
    return <div className={`${cardClass} mx-auto max-w-3xl p-8 text-center text-sm text-text-muted-v2`}>Prontuário não encontrado.</div>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-text-heading">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <button className="mb-4 text-sm font-semibold text-[#3b82f6]" onClick={() => navigate('/prontuario')} type="button">Voltar</button>
          <h1 className="text-2xl font-bold">Prontuário de {record.patient}</h1>
          <p className="mt-1 text-sm text-text-muted-v2">{record.date} {record.time ? `às ${record.time}` : ''} | {record.doctor}</p>
          <p className="mt-1 text-xs text-text-muted-v2">Assinatura/carimbo: {record.signedBy || record.doctor || 'Profissional não informado'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-lg border border-border-default-v2 bg-surface-card px-4 py-2 text-sm font-semibold" onClick={() => navigate(`/prontuario/${record.id}/editar`)} type="button">Editar</button>
          <button className="rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white" onClick={() => exportRecord(record, reports)} type="button">Exportar PDF</button>
          <a className="rounded-lg border border-border-default-v2 bg-surface-card px-4 py-2 text-sm font-semibold" href={`mailto:${patient?.email || ''}?subject=Prontuário&body=Segue solicitação de cópia do prontuário.`}>Enviar por e-mail</a>
          <a className="rounded-lg border border-border-default-v2 bg-surface-card px-4 py-2 text-sm font-semibold" href={`https://wa.me/${onlyDigits(patient?.phone)}?text=${encodeURIComponent('Olá, segue a solicitação de cópia do prontuário.')}`} rel="noreferrer" target="_blank">WhatsApp</a>
        </div>
      </header>

      <section className={`${cardClass} p-6`}>
        <h2 className="text-lg font-bold">Histórico completo de relatórios</h2>
        <div className="mt-4 space-y-3">
          {reports.length ? reports.map((report) => (
            <article className="rounded-xl border border-border-default-v2 bg-surface-inset p-4" key={report.id}>
              <p className="text-sm font-semibold">{report.exam || 'Relatório'}</p>
              <p className="mt-1 text-xs text-text-muted-v2">{formatDateTime(report.createdAt)} | {report.requestedBy || report.createdBy || 'Profissional não informado'}</p>
              <p className="mt-2 text-sm leading-6 text-text-muted-v2">{report.diagnosis || report.conclusion || 'Sem resumo textual.'}</p>
            </article>
          )) : <p className="text-sm text-text-muted-v2">Nenhum relatório vinculado a este paciente foi encontrado.</p>}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <DetailBlock title="Diagnóstico" value={record.diagnosis || record.diagnosticReasoning || record.cid} />
        <DetailBlock title="Conduta" value={record.conduct || record.prescriptions} />
        <DetailBlock title="Resultados de Exames" value={record.examResults} />
        <DetailBlock title="Multiprofissional" value={`Registro por ${record.doctor || 'profissional não informado'}. ${record.type || ''}`} />
      </section>

      <section className={`${cardClass} p-6`}>
        <h2 className="mb-3 text-lg font-bold">Registro clínico</h2>
        {record.contentHtml ? (
          <div className="prose prose-invert max-w-none text-sm leading-6 text-text-heading" dangerouslySetInnerHTML={{ __html: sanitizeHtml(record.contentHtml) }} />
        ) : (
          <p className="text-sm text-text-muted-v2">{record.summary || 'Sem texto complementar.'}</p>
        )}
      </section>
    </div>
  )
}

function DetailBlock({ title, value }) {
  return (
    <article className={`${cardClass} p-5`}>
      <h2 className="text-sm font-bold text-text-heading">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-muted-v2">{value || 'Não informado'}</p>
    </article>
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

function recordToDraft(record) {
  return {
    ...emptyRecord,
    ...record,
    date: toDateInput(record.rawDate || record.date),
    time: record.time || '',
    diagnosis: record.diagnosis || record.diagnosticReasoning || '',
    contentHtml: record.contentHtml || '',
  }
}

function exportRecord(record, reports) {
  const html = `
    <html><head><title>Prontuário</title><style>
      body{font-family:Arial,sans-serif;color:#171717;margin:24px;line-height:1.5}
      h1{font-size:22px;margin:0 0 4px}.muted{color:#525252;font-size:12px}.box{border:1px solid #ddd;border-radius:8px;padding:12px;margin-top:12px}
    </style></head><body>
      <h1>Prontuário de ${escapeHtml(record.patient)}</h1>
      <p class="muted">${escapeHtml(record.date)} ${escapeHtml(record.time || '')} | ${escapeHtml(record.doctor)}</p>
      <div class="box"><strong>Diagnóstico</strong><p>${escapeHtml(record.diagnosis || record.cid || '')}</p></div>
      <div class="box"><strong>Conduta</strong><p>${escapeHtml(record.conduct || record.prescriptions || '')}</p></div>
      <div class="box"><strong>Resultados de Exames</strong><p>${escapeHtml(record.examResults || '')}</p></div>
      <div class="box"><strong>Relatórios</strong>${reports.map((report) => `<p>${escapeHtml(formatDateTime(report.createdAt))} - ${escapeHtml(report.exam || 'Relatório')}</p>`).join('')}</div>
    </body></html>`
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  iframe.contentWindow.document.write(html)
  iframe.contentWindow.document.close()
  window.setTimeout(() => {
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    window.setTimeout(() => iframe.remove(), 1000)
  }, 100)
}

function sanitizeHtml(value) {
  return String(value || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '')
}

function getPatientName(patient) {
  return patient?.name || patient?.full_name || patient?.nome || 'Paciente'
}

function normalizeSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function toDateInput(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    const [day, month, year] = String(value).split('/')
    return year && month && day ? `${year}-${month}-${day}` : ''
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toTimeInput(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR')
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function RecordIcon({ className = 'size-4', name }) {
  const common = { className, fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.8, viewBox: '0 0 24 24' }

  if (name === 'search') {
    return <svg {...common}><path d="m21 21-4.3-4.3" /><circle cx="11" cy="11" r="7" /></svg>
  }

  if (name === 'plus') {
    return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
  }

  return <svg {...common}><path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
}
