import { useEffect, useMemo, useState } from 'react'

import { medicalRecordRepository } from '../repositories/medicalRecordRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'

const inputClass =
  'h-10 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 text-sm text-[#e5e5e5] outline-none transition placeholder:text-[#a3a3a3] focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]'
const labelClass = 'mb-1 block text-xs font-medium text-[#e5e5e5]'
const cardClass = 'rounded-2xl border border-[#404040] bg-[#262626] shadow-sm'

export function MedicalRecordsPage() {
  const recordTypes = medicalRecordRepository.getRecordTypes()
  const [records, setRecords] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    let active = true

    Promise.all([
      medicalRecordRepository.getInitialRecords(),
      patientRepository.getDirectoryRows().catch(() => []),
    ])
      .then(([recordData, patientData]) => {
        if (!active) return
        setRecords(recordData || [])
        setPatients(patientData || [])
      })
      .catch((loadError) => {
        if (!active) return
        setError(loadError.message || 'Erro ao carregar prontuários.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const filteredRecords = useMemo(() => {
    const query = normalizeSearch(search)
    if (!query) return records

    return records.filter((record) =>
      [record.patient, record.cid, record.doctor, record.type, record.summary]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(query),
    )
  }, [records, search])

  async function handleCreateRecord(record) {
    setSaving(true)

    try {
      const created = await medicalRecordRepository.create(record)
      setRecords((currentRecords) => [created, ...currentRecords])
      setEditorOpen(false)
    } catch (saveError) {
      window.alert(`Erro ao salvar prontuário: ${saveError.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="p-8 text-center text-sm text-[#a3a3a3]">Carregando prontuários...</p>
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-[#e5e5e5]">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#e5e5e5]">Prontuário Médico</h1>
          <p className="mt-1 text-sm text-[#a3a3a3]">Registros persistidos na API de prontuários</p>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#3b82f6] px-4 text-sm font-medium text-white transition hover:bg-[#2563eb]"
          onClick={() => setEditorOpen(true)}
          type="button"
        >
          <RecordIcon name="plus" />
          Nova Consulta
        </button>
      </div>

      <section className={`${cardClass} p-4`}>
        <div className="relative">
          <RecordIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#a3a3a3]" name="search" />
          <input
            className="h-10 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] py-2 pl-10 pr-3 text-sm text-[#e5e5e5] outline-none transition placeholder:text-[#a3a3a3] focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por paciente, CID, médico ou resumo..."
            value={search}
          />
        </div>
      </section>

      {error ? (
        <div className={`${cardClass} p-5 text-sm text-red-300`}>
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {filteredRecords.length ? (
          filteredRecords.map((record) => <RecordCard key={record.id} record={record} />)
        ) : (
          <div className={`${cardClass} p-8 text-center text-sm text-[#a3a3a3]`}>
            Nenhum prontuário encontrado na API.
          </div>
        )}
      </div>

      {editorOpen ? (
        <RecordEditorModal
          onClose={() => setEditorOpen(false)}
          onSave={handleCreateRecord}
          patients={patients}
          recordTypes={recordTypes}
          saving={saving}
        />
      ) : null}
    </div>
  )
}

function RecordCard({ record }) {
  const statusClass =
    record.status === 'completo'
      ? 'bg-emerald-500/20 text-emerald-400'
      : 'bg-amber-500/20 text-amber-400'

  return (
    <article className={`${cardClass} p-5 transition hover:border-[#3b82f6]/30`}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#3b82f6]/10 text-[#3b82f6]">
            <RecordIcon className="size-5" name="file" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-[#e5e5e5]">{record.patient}</h2>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass}`}>
                {record.status === 'completo' ? 'Completo' : 'Rascunho'}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#a3a3a3]">
              <span>{record.date}</span>
              <span>{record.doctor}</span>
              <span>{record.type}</span>
            </div>
            <p className="mt-2 inline-block rounded bg-[#1a1a1a] px-2 py-1 text-xs text-[#a3a3a3]">{record.cid}</p>
            <p className="mt-2 text-xs leading-5 text-[#a3a3a3]">{record.summary}</p>
          </div>
        </div>
      </div>
    </article>
  )
}

function RecordEditorModal({ onClose, onSave, patients, recordTypes, saving }) {
  const [patientSearch, setPatientSearch] = useState('')
  const [formData, setFormData] = useState({
    patientId: '',
    patient: '',
    date: '',
    type: 'Primeira Consulta',
    cid: '',
    anamnesis: '',
    physicalExam: '',
    conduct: '',
    prescriptions: '',
    returnDate: '',
    status: 'completo',
  })

  const filteredPatients = useMemo(() => {
    const query = normalizeSearch(patientSearch)
    if (!query) return patients

    return patients.filter((patient) =>
      [patient.name, patient.full_name, patient.nome, patient.cpf, patient.document, patient.email]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(query),
    )
  }, [patientSearch, patients])

  function updateField(event) {
    const { name, value } = event.target
    setFormData((currentData) => ({ ...currentData, [name]: value }))
  }

  function selectPatient(patient) {
    const name = getPatientName(patient)
    setFormData((currentData) => ({
      ...currentData,
      patientId: patient.id,
      patient: name,
    }))
    setPatientSearch(name)
  }

  function handleSubmit(event) {
    event.preventDefault()
    const submitter = event.nativeEvent.submitter
    const status = submitter?.value || formData.status

    if (!formData.patientId) {
      window.alert('Selecione um paciente antes de salvar o prontuário.')
      return
    }

    onSave({ ...formData, status })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#404040] bg-[#262626] p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="mb-6 text-lg font-bold text-[#e5e5e5]">Novo Registro de Consulta</h2>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DarkField label="Paciente">
              <input
                className={inputClass}
                onChange={(event) => {
                  setPatientSearch(event.target.value)
                  setFormData((currentData) => ({ ...currentData, patientId: '', patient: '' }))
                }}
                placeholder="Buscar paciente..."
                type="search"
                value={patientSearch || formData.patient}
              />
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-[#404040] bg-[#1a1a1a]">
                {filteredPatients.length ? (
                  filteredPatients.slice(0, 6).map((patient) => {
                    const selected = String(patient.id) === String(formData.patientId)
                    return (
                      <button
                        className={`block w-full px-3 py-2 text-left text-sm transition ${
                          selected ? 'bg-[#3b82f6]/20 text-[#e5e5e5]' : 'text-[#a3a3a3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]'
                        }`}
                        key={patient.id}
                        onClick={() => selectPatient(patient)}
                        type="button"
                      >
                        <span className="block font-semibold">{getPatientName(patient)}</span>
                        <span className="mt-0.5 block text-xs text-[#737373]">{patient.cpf || patient.document || patient.email || 'Sem documento'}</span>
                      </button>
                    )
                  })
                ) : (
                  <p className="px-3 py-2 text-xs text-[#737373]">Nenhum paciente encontrado.</p>
                )}
              </div>
            </DarkField>
            <DarkField label="Data da Consulta">
              <input className={`${inputClass} [color-scheme:dark]`} name="date" onChange={updateField} type="date" value={formData.date} />
            </DarkField>
          </div>

          <DarkField label="Anamnese">
            <textarea className={`${inputClass} min-h-24 py-2`} name="anamnesis" onChange={updateField} placeholder="Queixa principal, história da doença atual..." value={formData.anamnesis} />
          </DarkField>

          <DarkField label="Exame Físico">
            <textarea className={`${inputClass} min-h-24 py-2`} name="physicalExam" onChange={updateField} placeholder="Achados do exame físico..." value={formData.physicalExam} />
          </DarkField>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DarkField label="Hipóteses Diagnósticas (CID-10)">
              <input className={inputClass} name="cid" onChange={updateField} placeholder="Ex: I10, E11.9..." value={formData.cid} />
            </DarkField>
            <DarkField label="Tipo de Consulta">
              <select className={inputClass} name="type" onChange={updateField} value={formData.type}>
                {recordTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </DarkField>
          </div>

          <DarkField label="Conduta Médica">
            <textarea className={`${inputClass} min-h-24 py-2`} name="conduct" onChange={updateField} placeholder="Plano terapêutico, orientações..." value={formData.conduct} />
          </DarkField>

          <DarkField label="Prescrições">
            <textarea className={`${inputClass} min-h-20 py-2`} name="prescriptions" onChange={updateField} placeholder="Medicamentos, posologia..." value={formData.prescriptions} />
          </DarkField>

          <DarkField label="Retorno Agendado">
            <input className={`${inputClass} [color-scheme:dark]`} name="returnDate" onChange={updateField} type="date" value={formData.returnDate} />
          </DarkField>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button className="rounded-lg border border-[#404040] bg-[#262626] px-4 py-2 text-sm font-medium text-[#e5e5e5] transition hover:bg-[#333333]" disabled={saving} onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="rounded-lg border border-[#404040] bg-[#2a2a2a] px-4 py-2 text-sm font-medium text-[#e5e5e5] transition hover:bg-[#333333] disabled:opacity-60" disabled={saving} type="submit" value="rascunho">
            {saving ? 'Salvando...' : 'Salvar Rascunho'}
          </button>
          <button className="rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2563eb] disabled:opacity-60" disabled={saving} type="submit" value="completo">
            {saving ? 'Salvando...' : 'Finalizar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function DarkField({ children, label }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}

function getPatientName(patient) {
  return patient?.name || patient?.full_name || patient?.nome || ''
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function RecordIcon({ className = 'size-4', name }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
  }

  if (name === 'search') {
    return (
      <svg {...common}>
        <path d="m21 21-4.3-4.3" />
        <circle cx="11" cy="11" r="7" />
      </svg>
    )
  }

  if (name === 'plus') {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  )
}
