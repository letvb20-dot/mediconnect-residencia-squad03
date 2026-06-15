import { useEffect, useMemo, useRef, useState } from 'react'

import { GuidedVoiceFlow } from '../components/ai/GuidedVoiceFlow.jsx'
import { VoiceFormFiller } from '../components/ai/VoiceFormFiller.jsx'
import { apiConfig } from '../config/api.js'
import { hasCapability } from '../config/permissions.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'
import { isValidPersonName } from '../utils/brFormatters.js'
import { maskHeight, sanitizeFieldValue, sanitizePersonName } from '../utils/inputSanitizers.js'
const ITEMS_PER_PAGE = 25

const darkInput =
  'h-10 w-full rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20'
const darkLabel = 'mb-1.5 block text-xs font-semibold text-text-body'
const darkCard = 'rounded-2xl border border-border-default-v2 bg-surface-card p-6 shadow-card'
const MAX_PATIENT_ATTACHMENT_SIZE = 10 * 1024 * 1024

const patientTabs = [
  { label: 'Resumo', value: 'resumo' },
  { label: 'Consultas', value: 'consultas' },
  { label: 'Documentos', value: 'documentos' },
]

const BRAZILIAN_STATES = [
  { value: 'AC', label: 'Acre' },
  { value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapá' },
  { value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' },
  { value: 'CE', label: 'Ceará' },
  { value: 'DF', label: 'Distrito Federal' },
  { value: 'ES', label: 'Espírito Santo' },
  { value: 'GO', label: 'Goiás' },
  { value: 'MA', label: 'Maranhão' },
  { value: 'MT', label: 'Mato Grosso' },
  { value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'PA', label: 'Pará' },
  { value: 'PB', label: 'Paraíba' },
  { value: 'PR', label: 'Paraná' },
  { value: 'PE', label: 'Pernambuco' },
  { value: 'PI', label: 'Piauí' },
  { value: 'RJ', label: 'Rio de Janeiro' },
  { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' },
  { value: 'RO', label: 'Rondônia' },
  { value: 'RR', label: 'Roraima' },
  { value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'São Paulo' },
  { value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' },
]

const INSURANCE_OPTIONS = ['Unimed', 'Bradesco Saúde', 'Amil']
const BLOOD_TYPE_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const DOCUMENT_TYPE_OPTIONS = ['RG', 'CNH', 'Passaporte', 'RNE', 'Certidão de nascimento', 'Carteira profissional', 'Outro']
const NATIONALITY_OPTIONS = ['Brasileira', 'Brasileira naturalizada', 'Estrangeira']
const NATURALITY_OPTIONS = [...BRAZILIAN_STATES.map((state) => state.label), 'Exterior']

// Schema usado pelo VoiceFormFiller para o Gemini saber quais campos pode preencher.
const PATIENT_VOICE_SCHEMA = [
  { name: 'name', label: 'Nome completo', type: 'text' },
  { name: 'socialName', label: 'Nome social', type: 'text' },
  { name: 'cpf', label: 'CPF', type: 'text', example: '000.000.000-00' },
  { name: 'rg', label: 'RG', type: 'text' },
  { name: 'sex', label: 'Sexo', type: 'enum', options: ['Masculino', 'Feminino', 'Outro'] },
  { name: 'age', label: 'Idade em anos', type: 'number' },
  { name: 'birthDate', label: 'Data de nascimento', type: 'date' },
  { name: 'ethnicity', label: 'Etnia', type: 'text' },
  { name: 'race', label: 'Raça', type: 'text' },
  { name: 'maritalStatus', label: 'Estado civil', type: 'enum', options: ['Solteiro', 'Casado', 'Divorciado', 'Viúvo', 'União estável'] },
  { name: 'nationality', label: 'Nacionalidade', type: 'enum', options: NATIONALITY_OPTIONS },
  { name: 'naturality', label: 'Naturalidade (estado de nascimento)', type: 'enum', options: NATURALITY_OPTIONS },
  { name: 'profession', label: 'Profissão', type: 'text' },
  { name: 'motherName', label: 'Nome da mãe', type: 'text' },
  { name: 'fatherName', label: 'Nome do pai', type: 'text' },
  { name: 'spouseName', label: 'Nome do cônjuge', type: 'text' },
  { name: 'responsibleName', label: 'Nome do responsável (para menores)', type: 'text' },
  { name: 'responsibleCpf', label: 'CPF do responsável', type: 'text' },
  { name: 'condition', label: 'Condição médica principal', type: 'text' },
  { name: 'bloodType', label: 'Tipo sanguíneo', type: 'enum', options: BLOOD_TYPE_OPTIONS },
  { name: 'weight', label: 'Peso em kg', type: 'number' },
  { name: 'height', label: 'Altura em metros', type: 'number', example: '1,70' },
  { name: 'allergies', label: 'Alergias', type: 'text' },
  { name: 'email', label: 'E-mail', type: 'text' },
  { name: 'phone', label: 'Celular', type: 'text', example: '(11) 99999-0000' },
  { name: 'phoneLandline', label: 'Telefone fixo', type: 'text' },
  { name: 'zipCode', label: 'CEP', type: 'text', example: '00000-000' },
  { name: 'addressStreet', label: 'Endereço (rua/avenida)', type: 'text' },
  { name: 'addressNumber', label: 'Número do endereço', type: 'text' },
  { name: 'addressComplement', label: 'Complemento do endereço', type: 'text' },
  { name: 'city', label: 'Cidade', type: 'text' },
  { name: 'state', label: 'UF do estado', type: 'enum', options: BRAZILIAN_STATES.map((s) => s.value) },
  { name: 'insurance', label: 'Convênio', type: 'enum', options: INSURANCE_OPTIONS },
  { name: 'plan', label: 'Plano do convênio', type: 'text' },
  { name: 'insuranceNumber', label: 'Número da matrícula do convênio', type: 'text' },
  { name: 'cns', label: 'Cartão Nacional de Saúde (SUS)', type: 'text' },
]

// Sequência usada pelo modo guiado: só os 13 campos obrigatórios, na ordem
// natural de preenchimento. Cada item tem o "type" certo pra o normalizer.
const PATIENT_GUIDED_FIELDS = [
  { name: 'name', label: 'Nome completo', type: 'text', help: 'Diga o nome completo do paciente.' },
  { name: 'cpf', label: 'CPF', type: 'document', help: 'Pode falar os 11 dígitos seguidos.' },
  { name: 'birthDate', label: 'Data de nascimento', type: 'date', help: 'Ex.: 15 de março de 1990.' },
  { name: 'age', label: 'Idade', type: 'number', help: 'Diga só o número de anos.' },
  { name: 'motherName', label: 'Nome da mãe', type: 'text' },
  { name: 'phone', label: 'Celular', type: 'phone', help: 'DDD + número, ex.: 11 99999 0000.' },
  { name: 'email', label: 'E-mail', type: 'email', help: 'Diga "arroba" e "ponto" onde aparecerem.' },
  { name: 'zipCode', label: 'CEP', type: 'cep', help: '8 dígitos.' },
  { name: 'addressStreet', label: 'Endereço (rua ou avenida)', type: 'text' },
  { name: 'addressNumber', label: 'Número do endereço', type: 'text' },
  { name: 'city', label: 'Cidade', type: 'text' },
  {
    name: 'state',
    label: 'UF do estado',
    type: 'enum',
    options: BRAZILIAN_STATES.map((s) => s.value),
    help: 'Pode falar o nome do estado, ex.: "São Paulo".',
  },
  { name: 'plan', label: 'Plano de saúde', type: 'text' },
]

export function PatientsPage({ navigate, role }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState('list')
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [insurance, setInsurance] = useState('')
  const [vip, setVip] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [lastVisitSince, setLastVisitSince] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const [page, setPage] = useState(1)

  useEffect(() => {
    buildPatientRows()
      .then((data) => setRows(data))
      .catch((err) => setError(translateErrorMessage(err.message, 'Erro ao carregar pacientes.')))
      .finally(() => setLoading(false))
  }, [])

  // Permite que o assistente abra o formulário de cadastro via /pacientes?new=1.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('new') === '1' && hasCapability(role, 'canEditPatients')) {
      setEditingId(null)
      setView('form')
      params.delete('new')
      const nextSearch = params.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`
      window.history.replaceState({}, '', nextUrl)
    }
  }, [role])

  const editingPatient = rows.find((patient) => patient.id === editingId)
  const hasAdvancedFilters = city || state || ageMin || ageMax || lastVisitSince
  const canEditPatients = hasCapability(role, 'canEditPatients')
  const canHardDeletePatients = hasCapability(role, 'hardDeletePatients')

  const filteredPatients = useMemo(() => {
    const minAge = normalizeAgeFilter(ageMin)
    const maxAge = normalizeAgeFilter(ageMax)

    return rows.filter((patient) => {
      const haystack = [
        patient.name,
        patient.cpf,
        patient.document,
        patient.insurance,
        patient.phone,
        patient.email,
        patient.city,
        patient.state,
        patient.motherName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (search && !haystack.includes(search.toLowerCase())) {
        return false
      }

      if (insurance && normalizeFilterValue(patient.insurance) !== normalizeFilterValue(insurance)) {
        return false
      }

      if (vip === 'Sim' && !patient.vip) {
        return false
      }

      if (vip === 'Não' && patient.vip) {
        return false
      }

      if (city && !String(patient.city || '').toLowerCase().includes(city.toLowerCase())) {
        return false
      }

      if (state && patient.state !== state) {
        return false
      }

      if (minAge !== null || maxAge !== null) {
        const patientAge = resolvePatientFilterAge(patient)
        if (patientAge === null) return false

        if (minAge !== null && patientAge < minAge) {
          return false
        }

        if (maxAge !== null && patientAge > maxAge) {
          return false
        }
      }

      if (lastVisitSince && (!patient.lastVisitIso || patient.lastVisitIso < lastVisitSince)) {
        return false
      }

      return true
    })
  }, [ageMax, ageMin, city, insurance, lastVisitSince, rows, search, state, vip])

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedPatients = filteredPatients.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  const menuPatient = openMenuId ? rows.find((patient) => patient.id === openMenuId) : null

  function resetAdvancedFilters() {
    setCity('')
    setState('')
    setAgeMin('')
    setAgeMax('')
    setLastVisitSince('')
    setAdvancedOpen(false)
    setPage(1)
  }

  function closeActionMenu() {
    setOpenMenuId(null)
    setMenuPosition({ left: 0, top: 0 })
  }

  function toggleActionMenu(event, patient) {
    event.stopPropagation()

    if (openMenuId === patient.id) {
      closeActionMenu()
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const menuWidth = 192
    const menuHeight = canHardDeletePatients ? 184 : 144
    const gap = 8
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || menuWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || menuHeight
    const maxLeft = Math.max(gap, viewportWidth - menuWidth - gap)
    const left = Math.min(Math.max(gap, rect.right - menuWidth), maxLeft)
    const opensDown = rect.bottom + gap + menuHeight <= viewportHeight
    const top = opensDown ? rect.bottom + gap : Math.max(gap, rect.top - menuHeight - gap)

    setMenuPosition({ left, top })
    setOpenMenuId(patient.id)
  }

  function openForm(patientId = null) {
    if (!canEditPatients) return
    setEditingId(patientId)
    closeActionMenu()
    setView('form')
  }

  async function savePatient(patient) {
  if (!canEditPatients) {
    window.alert('Você não tem permissão para salvar pacientes.')
    return
  }

  const isNew = !rows.some((item) => item.id === patient.id)
  setSaving(true)

  try {
    if (isNew) {
      const created = normalizeCreatedPatient(await patientRepository.create(patient))
      const patientId = created?.id || patient.id
      if (patientId) {
        await patientRepository.update(patientId, patient)
      }
      const avatarResult = patient.avatarFile
        ? await patientRepository.uploadAvatar(patientId, patient.avatarFile)
        : null
      const uploadedAttachments = await uploadPatientAttachments(patientId, patient.attachmentFiles)
      const nextAttachments = [...(patient.attachments || []), ...uploadedAttachments]
      if (uploadedAttachments.length) {
        await patientRepository.update(patientId, { attachments: nextAttachments })
      }
      const newRow = {
        ...patient,
        attachmentFiles: undefined,
        attachments: nextAttachments,
        avatarFile: undefined,
        avatarUrl: avatarResult?.avatarUrl || patient.avatarUrl,
        id: patientId,
        detailId: patientId || patient.detailId || patient.id,
        name: created?.full_name || created?.name || patient.name,
        phone: patient.phone || created?.phone_mobile || created?.phone,
      }
      setRows((currentRows) => [newRow, ...currentRows])
    } else {
      await patientRepository.update(patient.id, patient)
      const avatarResult = patient.avatarFile
        ? await patientRepository.uploadAvatar(patient.id, patient.avatarFile)
        : null
      const uploadedAttachments = await uploadPatientAttachments(patient.id, patient.attachmentFiles)
      const nextAttachments = [...(patient.attachments || []), ...uploadedAttachments]
      if (uploadedAttachments.length) {
        await patientRepository.update(patient.id, { attachments: nextAttachments })
      }
      const nextPatient = {
        ...patient,
        attachmentFiles: undefined,
        attachments: nextAttachments,
        avatarFile: undefined,
        avatarUrl: avatarResult?.avatarUrl || patient.avatarUrl,
      }
      setRows((currentRows) =>
        currentRows.map((item) => (item.id === patient.id ? nextPatient : item))
      )
    }
  } catch (err) {
    window.alert(`Erro ao salvar paciente: ${translateErrorMessage(err.message, 'Erro ao salvar paciente.')}`)
    return
  } finally {
    setSaving(false)
  }

  setEditingId(null)
  setPage(1)
  setView('list')
}

async function uploadPatientAttachments(patientId, files = []) {
  if (!files?.length) return []

  const results = await Promise.allSettled(
    files.map((file) => patientRepository.uploadAttachment(patientId, file)),
  )
  const failedUploads = results
    .filter((result) => result.status === 'rejected')
    .map((result) => translateErrorMessage(result.reason?.message, 'Falha ao enviar anexo do paciente.'))

  if (failedUploads.length) {
    throw new Error(`${failedUploads.length} anexo(s) nao puderam ser enviados. ${failedUploads[0]}`)
  }

  return results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .map((upload) => ({
      name: upload.name,
      path: upload.path,
      url: upload.url,
    }))
}

  async function deletePatient(patient) {
    if (!canHardDeletePatients) return

    if (!window.confirm(`Tem certeza que deseja excluir ${patient.name}? Esta ação não poderá ser desfeita.`)) {
      return
    }

    try {
      await patientRepository.remove(patient.detailId || patient.id)
      setRows((currentRows) => currentRows.filter((item) => item.id !== patient.id))
      closeActionMenu()
    } catch (err) {
      window.alert(`Erro ao excluir paciente: ${translateErrorMessage(err.message, 'Erro ao excluir paciente.')}`)
    }
  }

  function openDetail(patient) {
    closeActionMenu()
    if (patient.detailId) {
      navigate(`/pacientes/${patient.detailId}`)
      return
    }

    openForm(patient.id)
  }

  if (loading) {
    return (
      <div className="mx-auto grid max-w-7xl gap-5 page-enter">
        <div className="skeleton h-28 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="skeleton h-24 rounded-2xl" />
          <div className="skeleton h-24 rounded-2xl" />
          <div className="skeleton h-24 rounded-2xl" />
        </div>
        <div className="skeleton h-96 rounded-2xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          <svg className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p>Erro ao carregar pacientes: {error}</p>
        </div>
      </div>
    )
  }

  if (view === 'form') {
    return (
      <PatientEditor
        existingIds={rows.map((patient) => patient.id)}
        onCancel={() => {
          setEditingId(null)
          setView('list')
        }}
        onSave={savePatient}
        patient={editingPatient}
        saving={saving}
      />
    )
  }

  const totalPatients = rows.length
  const vipPatients = rows.filter((patient) => patient.vip).length
  const withInsurance = rows.filter((patient) => patient.insurance).length

  return (
    <div className="page-enter mx-auto grid max-w-7xl gap-5 text-text-heading">
      {/* HERO */}
      <header className="relative overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-primary/30 via-accent-primary to-accent-primary/30" aria-hidden="true" />
        <div className="grid gap-5 px-5 py-5 sm:px-7 md:grid-cols-[1fr_auto] md:items-end">
          <div className="flex items-start gap-4">
            <div className="metric-tone-blue flex size-12 items-center justify-center rounded-2xl shadow-card">
              <svg className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-primary">Cadastro · Pacientes</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-text-heading md:text-3xl">
                Pacientes da clínica
              </h1>
              <p className="mt-1 max-w-xl text-sm leading-6 text-text-muted-v2">
                Cadastre novos pacientes, busque por nome ou documento e abra a ficha completa para confirmar dados de contato e convênio.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-end">
            <button
              className={`inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 ${
                hasAdvancedFilters
                  ? 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary'
                  : 'border-border-default-v2 bg-surface-card-hover text-text-body hover:border-border-strong hover:bg-surface-card'
              }`}
              onClick={() => setAdvancedOpen(true)}
              type="button"
            >
              <PatientIcon className="size-4" name="filter" />
              Filtro avançado
              {hasAdvancedFilters ? (
                <span className="ml-1 rounded-full bg-accent-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {[city, state, ageMin, ageMax, lastVisitSince].filter(Boolean).length}
                </span>
              ) : null}
            </button>
            {canEditPatients ? (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-accent-primary px-4 text-sm font-bold text-white shadow-card transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
                onClick={() => openForm()}
                type="button"
              >
                <PatientIcon className="size-4" name="user-plus" />
                Adicionar paciente
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 border-t border-border-subtle bg-surface-inset/40 px-5 py-4 sm:grid-cols-3 sm:px-7">
          <PatientHeroMetric tone="blue" label="Cadastrados" value={totalPatients} hint={totalPatients === 1 ? 'paciente no sistema' : 'pacientes no sistema'} />
          <PatientHeroMetric tone="violet" label="Pacientes VIP" value={vipPatients} hint={vipPatients === 0 ? 'nenhum marcado como VIP' : vipPatients === 1 ? 'paciente com prioridade' : 'pacientes com prioridade'} />
          <PatientHeroMetric tone="green" label="Com convênio" value={withInsurance} hint={withInsurance === totalPatients && totalPatients > 0 ? 'todos com convênio cadastrado' : 'possuem convênio vinculado'} />
        </div>
      </header>

      {/* Toolbar de busca + filtros */}
      <section className="overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
        <div className="grid gap-3 border-b border-border-subtle px-5 py-4 sm:px-6 md:grid-cols-[1fr_220px_180px]">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-muted-v2">
              <PatientIcon className="size-4" name="search" />
            </span>
            <input
              className="h-11 w-full rounded-md border border-border-default-v2 bg-surface-card-hover pl-10 pr-3 text-sm text-text-body outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Buscar por nome, CPF, telefone ou e-mail..."
              value={search}
            />
            {search ? (
              <button
                aria-label="Limpar busca"
                className="absolute inset-y-0 right-2 my-auto flex size-7 items-center justify-center rounded-md text-text-muted-v2 transition hover:bg-surface-card hover:text-text-body"
                onClick={() => { setSearch(''); setPage(1) }}
                type="button"
              >
                <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>

          <PatientSelect
            icon="file"
            label="Convênio"
            onChange={(value) => {
              setInsurance(value)
              setPage(1)
            }}
            options={INSURANCE_OPTIONS}
            value={insurance}
          />

          <PatientSelect
            icon="star"
            label="VIP"
            onChange={(value) => {
              setVip(value)
              setPage(1)
            }}
            options={['Sim', 'Não']}
            value={vip}
          />
        </div>

        {hasAdvancedFilters ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-5 py-3 sm:px-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted-v2">Filtros ativos</span>
            {city ? <FilterChip label={`Cidade: ${city}`} onClear={() => setCity('')} /> : null}
            {state ? <FilterChip label={`Estado: ${state}`} onClear={() => setState('')} /> : null}
            {ageMin ? <FilterChip label={`Idade ≥ ${ageMin}`} onClear={() => setAgeMin('')} /> : null}
            {ageMax ? <FilterChip label={`Idade ≤ ${ageMax}`} onClear={() => setAgeMax('')} /> : null}
            {lastVisitSince ? <FilterChip label={`Atendido desde ${lastVisitSince}`} onClear={() => setLastVisitSince('')} /> : null}
            <button className="ml-1 text-xs font-semibold text-red-400 hover:underline" onClick={resetAdvancedFilters} type="button">
              Limpar todos
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-full table-fixed text-left text-sm">
            <thead className="bg-surface-inset/60 text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted-v2">
              <tr>
                <th className="w-[26%] px-5 py-3">Paciente</th>
                <th className="w-[14%] px-5 py-3">Telefone</th>
                <th className="w-[14%] px-5 py-3">Cidade/UF</th>
                <th className="w-[16%] px-5 py-3">Último atendimento</th>
                <th className="w-[18%] px-5 py-3">Próximo atendimento</th>
                <th className="sticky right-0 w-[7rem] bg-surface-inset/60 px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle bg-surface-card">
              {paginatedPatients.length ? (
                paginatedPatients.map((patient) => (
                  <tr className="group transition hover:bg-surface-card-hover" key={patient.id}>
                    <td className="px-5 py-3.5 align-middle">
                      <button className="flex w-full items-center gap-3 text-left focus-visible:outline-none" onClick={() => openDetail(patient)} type="button">
                        <PatientAvatar className="size-10" patient={patient} />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-semibold text-text-heading transition group-hover:text-accent-primary">
                              {patient.name}
                            </span>
                            {patient.vip ? (
                              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-300">
                                VIP
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-text-muted-v2">
                            {patient.insurance || 'Sem convênio'}
                            {patient.cpf ? ` · CPF ${patient.cpf}` : ''}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="px-5 py-3.5 align-middle text-text-body">{patient.phone || <span className="text-text-muted-v2">—</span>}</td>
                    <td className="px-5 py-3.5 align-middle text-text-body">
                      {patient.city ? (
                        <span>
                          {patient.city}
                          {patient.state ? <span className="text-text-muted-v2"> / {patient.state}</span> : null}
                        </span>
                      ) : <span className="text-text-muted-v2">—</span>}
                    </td>
                    <td className="px-5 py-3.5 align-middle text-sm">
                      {patient.lastVisit ? (
                        <span className="text-text-body">{patient.lastVisit}</span>
                      ) : (
                        <span className="text-text-muted-v2">Sem atendimentos</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-middle text-sm">
                      {patient.nextVisit ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-accent-primary/30 bg-accent-primary/5 px-2 py-0.5 text-xs font-medium text-accent-primary">
                          <svg className="size-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                            <rect height="18" rx="2" width="18" x="3" y="4" /><path d="M16 2v4M8 2v4M3 10h18" />
                          </svg>
                          {patient.nextVisit}
                        </span>
                      ) : (
                        <span className="text-text-muted-v2">Nenhum agendado</span>
                      )}
                    </td>
                    <td className="sticky right-0 bg-surface-card px-3 py-3.5 text-right group-hover:bg-surface-card-hover">
                      <button
                        aria-label={`Ações de ${patient.name}`}
                        className="inline-flex size-9 items-center justify-center rounded-md border border-transparent text-text-muted-v2 transition hover:border-border-default-v2 hover:bg-surface-inset hover:text-text-body focus-visible:outline-none focus-visible:border-accent-primary"
                        onClick={(event) => toggleActionMenu(event, patient)}
                        type="button"
                      >
                        <PatientIcon className="size-5" name="more" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="px-6 py-14 text-center">
                      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-surface-inset text-text-muted-v2">
                        <PatientIcon className="size-7" name="search" />
                      </div>
                      <p className="mt-3 text-base font-semibold text-text-heading">Nenhum paciente encontrado</p>
                      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-text-muted-v2">
                        Ajuste os filtros ou cadastre um novo paciente com o botão "Adicionar paciente".
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border-subtle px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-text-muted-v2">
            {filteredPatients.length === 0
              ? 'Nenhum resultado'
              : <>Mostrando <strong className="text-text-body tabular-nums">{startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredPatients.length)}</strong> de <strong className="text-text-body tabular-nums">{filteredPatients.length}</strong> {filteredPatients.length === 1 ? 'paciente' : 'pacientes'}</>}
          </p>
          {totalPages > 1 ? (
            <div className="flex items-center gap-1.5">
              <PageButton disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                <PatientIcon className="size-4" name="chevron-left" />
              </PageButton>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  className={`grid size-9 place-items-center rounded-md text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 ${
                    pageNumber === currentPage
                      ? 'bg-accent-primary text-white shadow-card'
                      : 'border border-border-default-v2 bg-surface-card-hover text-text-body hover:border-border-strong hover:bg-surface-card'
                  }`}
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                  type="button"
                >
                  {pageNumber}
                </button>
              ))}
              <PageButton disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
                <PatientIcon className="size-4" name="chevron-right" />
              </PageButton>
            </div>
          ) : null}
        </div>
      </section>

      {menuPatient ? (
        <>
          <button
            aria-label="Fechar menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={closeActionMenu}
            type="button"
          />
          <div
            className="fixed z-50 w-52 rounded-xl border border-border-default-v2 bg-surface-card p-1.5 text-left shadow-elevated"
            style={{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }}
          >
            <ActionItem icon="file" label="Ver detalhes" onClick={() => openDetail(menuPatient)} />
            {canEditPatients ? <ActionItem icon="edit" label="Editar paciente" onClick={() => openForm(menuPatient.id)} /> : null}
            <ActionItem
              icon="calendar"
              label="Marcar consulta"
              onClick={() => {
                closeActionMenu()
                navigate(`/agenda?new=1&patientId=${encodeURIComponent(menuPatient.detailId || menuPatient.id)}`)
              }}
            />
            {canHardDeletePatients ? (
              <>
                <div className="my-1 h-px bg-border-subtle" />
                <ActionItem danger icon="trash" label="Excluir" onClick={() => deletePatient(menuPatient)} />
              </>
            ) : null}
          </div>
        </>
      ) : null}

      {advancedOpen ? (
        <AdvancedFilterModal
          ageMax={ageMax}
          ageMin={ageMin}
          city={city}
          lastVisitSince={lastVisitSince}
          onApply={() => {
            setPage(1)
            setAdvancedOpen(false)
          }}
          onClear={resetAdvancedFilters}
          onClose={() => setAdvancedOpen(false)}
          setAgeMax={setAgeMax}
          setAgeMin={setAgeMin}
          setCity={setCity}
          setLastVisitSince={setLastVisitSince}
          setState={setState}
          state={state}
          stateOptions={BRAZILIAN_STATES}
        />
      ) : null}
    </div>
  )
}

async function uploadPatientAttachments(patientId, files = []) {
  if (!files?.length) return []

  const results = await Promise.allSettled(
    files.map((file) => patientRepository.uploadAttachment(patientId, file)),
  )
  const failedUploads = results
    .filter((result) => result.status === 'rejected')
    .map((result) => translateErrorMessage(result.reason?.message, 'Falha ao enviar anexo do paciente.'))

  if (failedUploads.length) {
    throw new Error(`${failedUploads.length} anexo(s) nao puderam ser enviados. ${failedUploads[0]}`)
  }

  return results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .map((upload) => ({
      name: upload.name,
      path: upload.path,
      url: upload.url,
    }))
}

function PatientEditor({ existingIds, onCancel, onSave, patient, saving }) {
  const [formData, setFormData] = useState(() => ({
    id: patient?.id || '',
    detailId: patient?.detailId || null,
    name: patient?.name || '',
    socialName: patient?.socialName || patient?.social_name || '',
    cpf: patient?.cpf || '',
    rg: patient?.rg || '',
    otherDocuments: patient?.otherDocuments || patient?.other_documents || '',
    documentNumber: patient?.documentNumber || patient?.document_number || '',
    sex: patient?.sex || patient?.sexo || '',
    birthDate: patient?.birthDate || patient?.birth_date || '',
    motherName: patient?.motherName || patient?.mother_name || '',
    motherProfession: patient?.motherProfession || patient?.mother_profession || '',
    fatherName: patient?.fatherName || patient?.father_name || '',
    fatherProfession: patient?.fatherProfession || patient?.father_profession || '',
    responsibleName: patient?.responsibleName || patient?.responsible_name || '',
    responsibleCpf: patient?.responsibleCpf || patient?.responsible_cpf || '',
    spouseName: patient?.spouseName || patient?.spouse_name || '',
    ethnicity: patient?.ethnicity || '',
    race: patient?.race || patient?.raca || '',
    naturality: patient?.naturality || patient?.naturalidade || '',
    nationality: patient?.nationality || patient?.nacionalidade || '',
    profession: patient?.profession || patient?.profissao || '',
    maritalStatus: patient?.maritalStatus || patient?.marital_status || '',
    phone: patient?.phone || '',
    phoneLandline: patient?.phoneLandline || patient?.phone_landline || '',
    phoneSecondary: patient?.phoneSecondary || patient?.phone_secondary || '',
    email: patient?.email || '',
    zipCode: patient?.zipCode || patient?.zip_code || '',
    addressStreet: patient?.addressStreet || patient?.address_street || patient?.address || '',
    addressNumber: patient?.addressNumber || patient?.address_number || '',
    addressComplement: patient?.addressComplement || patient?.address_complement || '',
    city: patient?.city || '',
    state: patient?.state || '',
    insurance: patient?.insurance || '',
    plan: patient?.plan || '',
    age: patient?.age || '',
    bloodType: patient?.bloodType || patient?.blood_type || '',
    weight: patient?.weight || patient?.peso || '',
    height: formatHeightField(patient?.height || patient?.altura || ''),
    bmi: patient?.bmi || patient?.imc || '',
    allergies: patient?.allergies || patient?.alergias || '',
    condition: patient?.condition || '',
    notesText: patient?.notesText || patient?.notes_text || '',
    insuranceNumber: patient?.insuranceNumber || patient?.insurance_number || patient?.numero_matricula || '',
    insuranceCardValidUntil: patient?.insuranceCardValidUntil || patient?.insurance_card_valid_until || patient?.validade_carteira || '',
    insuranceIndefiniteValidity: Boolean(patient?.insuranceIndefiniteValidity || patient?.insurance_indefinite_validity),
    cns: patient?.cns || patient?.sus_card || patient?.cartao_sus || '',
    attachments: patient?.attachments || patient?.anexos || [],
    lgpdOptIn: Boolean(patient?.lgpdOptIn ?? patient?.lgpd_opt_in ?? true),
    vip: Boolean(patient?.vip),
    lastVisit: patient?.lastVisit || null,
    nextVisit: patient?.nextVisit || null,
    lastVisitIso: patient?.lastVisitIso || null,
    avatarUrl: resolvePatientAvatarUrl(patient),
  }))
  const fileInputRef = useRef(null)
  const attachmentInputRef = useRef(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(formData.avatarUrl)
  const [attachmentFiles, setAttachmentFiles] = useState([])
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const [voiceMode, setVoiceMode] = useState('idle') // idle | guided
  const isNewPatient = !patient
  const calculatedBmi = calculateBmi(formData.weight, formData.height)
  const isMinorPatient = isMinorPatientRecord(formData)

  function applyVoiceFillField(name, value) {
    if (!name) return
    const stringValue = value === undefined || value === null ? '' : String(value)
    setFormData((currentData) => {
      if (!(name in currentData)) return currentData
      const next = { ...currentData }
      if (name === 'height') {
        next.height = maskHeight(stringValue)
      } else if (name === 'weight') {
        next.weight = stringValue.replace(/[^\d,.]/g, '').slice(0, 6)
      } else if (name === 'name') {
        next.name = sanitizePersonName(stringValue)
      } else {
        next[name] = sanitizeFieldValue(name, stringValue)
      }
      if (name === 'weight' || name === 'height') {
        next.bmi = calculateBmi(next.weight, next.height)
      }
      return next
    })
  }

  function applyVoiceFill(values) {
    if (!values || typeof values !== 'object') return
    setFormData((currentData) => {
      const next = { ...currentData }
      for (const key of Object.keys(values)) {
        if (!(key in next)) continue
        const rawValue = values[key]
        if (rawValue === undefined || rawValue === null) continue
        const stringValue = String(rawValue)
        if (key === 'height') {
          next.height = maskHeight(stringValue)
        } else if (key === 'weight') {
          next.weight = stringValue.replace(/[^\d,.]/g, '').slice(0, 6)
        } else if (key === 'name') {
          next.name = sanitizePersonName(stringValue)
        } else {
          next[key] = sanitizeFieldValue(key, stringValue)
        }
      }
      next.bmi = calculateBmi(next.weight, next.height)
      return next
    })
  }

  function handleChange(event) {
    const { checked, name, type, value } = event.target
    const nextValue = type === 'checkbox'
      ? checked
      : type === 'date'
        ? value
        : name === 'height'
          ? maskHeight(value)
          : name === 'weight'
            ? value.replace(/[^\d,.]/g, '').slice(0, 6)
            : name === 'name'
              ? sanitizePersonName(value)
              : sanitizeFieldValue(name, value)

    setFormData((currentData) => {
      const nextData = { ...currentData, [name]: nextValue }
      if (name === 'weight' || name === 'height') {
        nextData.bmi = calculateBmi(nextData.weight, nextData.height)
      }
      if (name === 'insuranceIndefiniteValidity' && checked) {
        nextData.insuranceCardValidUntil = ''
      }
      return nextData
    })
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    event.target.value = ''
  }

  function handleAttachmentChange(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const validFiles = files.filter((file) => file.size <= MAX_PATIENT_ATTACHMENT_SIZE)
    const rejectedFiles = files.filter((file) => file.size > MAX_PATIENT_ATTACHMENT_SIZE)

    if (rejectedFiles.length) {
      window.alert(`Anexo muito grande. Envie arquivos de até ${formatFileSize(MAX_PATIENT_ATTACHMENT_SIZE)}.`)
    }

    if (validFiles.length) {
      setAttachmentFiles((current) => [...current, ...validFiles])
    }
    event.target.value = ''
  }

  function removeAvatarFile() {
    setAvatarFile(null)
    setAvatarPreview(formData.avatarUrl || '')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachmentFile(index) {
    setAttachmentFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
    if (attachmentInputRef.current) attachmentInputRef.current.value = ''
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!isValidPersonName(formData.name)) {
      window.alert('Informe um nome válido. O campo Nome não pode conter e-mail.')
      return
    }

    const requiredFields = [
      ['cpf', 'CPF'],
      ['age', 'idade'],
      ['birthDate', 'data de nascimento'],
      ['motherName', 'nome da mãe'],
      ['email', 'email'],
      ['phone', 'celular'],
      ['zipCode', 'CEP'],
      ['addressStreet', 'endereço'],
      ['addressNumber', 'número'],
      ['city', 'cidade'],
      ['state', 'estado'],
      ['plan', 'plano'],
    ]
    if (isNewPatient) {
      const missingFields = requiredFields
        .filter(([field]) => !String(formData[field] || '').trim())
        .map(([, label]) => label)

      if (missingFields.length) {
        window.alert(`Preencha os campos obrigatórios: ${missingFields.join(', ')}.`)
        return
      }
    }

    onSave({
      ...formData,
      id: formData.id || uniqueSlug(formData.name, existingIds),
      age: Number(formData.age) || 0,
      bmi: calculatedBmi,
      city: formData.city,
      document: formData.cpf ? `CPF ${formData.cpf}` : 'CPF não informado',
      insurance: formData.insurance,
      lastVisit: formData.lastVisit || 'Ainda não houve atendimento',
      nextVisit: formData.nextVisit || null,
      phone: formData.phone,
      plan: formData.plan,
      state: formData.state,
      address: formatAddress(formData),
      notes: formData.notesText ? [formData.notesText] : [],
      avatarFile,
      avatarUrl: avatarFile ? formData.avatarUrl : avatarPreview || formData.avatarUrl,
      attachmentFiles,
      attachments: formData.attachments,
    })
  }

  return (
    <div className={`page-enter mx-auto max-w-7xl text-text-heading ${voiceMode === 'guided' ? 'pb-56' : 'pb-28'}`}>
      {/* Voltar */}
      <button
        className="mb-4 inline-flex h-9 w-fit items-center gap-1.5 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-xs font-semibold text-text-muted-v2 transition hover:bg-surface-card hover:text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
        onClick={onCancel}
        type="button"
      >
        <svg className="size-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="m15 6-6 6 6 6" />
        </svg>
        Voltar para a lista
      </button>

      {/* HERO do formulário */}
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-card">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-primary/40 via-accent-primary to-accent-primary/40" aria-hidden="true" />
        <div className="grid gap-4 px-5 py-5 sm:px-7 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex items-start gap-4">
            <div className="metric-tone-blue flex size-12 items-center justify-center rounded-2xl shadow-card">
              <PatientIcon className="size-6" name={isNewPatient ? 'user-plus' : 'edit'} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-primary">
                {isNewPatient ? 'Novo cadastro' : 'Edição de cadastro'}
              </p>
              <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-text-heading md:text-3xl">
                {isNewPatient ? 'Adicionar paciente' : (patient?.name || 'Editar paciente')}
              </h1>
              <p className="mt-1 max-w-xl text-sm leading-6 text-text-muted-v2">
                {isNewPatient
                  ? 'Preencha os dados pessoais, contato, endereço e convênio. Os campos marcados com * são obrigatórios.'
                  : 'Atualize as informações do paciente. As alterações são salvas ao clicar em "Salvar alterações".'}
              </p>
            </div>
          </div>
          {isNewPatient ? (
            <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                <span className="size-1.5 rounded-full bg-amber-400" />
                12 campos obrigatórios
              </span>
            </div>
          ) : null}
        </div>
      </header>

      {isNewPatient ? (
        <div className={`${darkCard} mb-5`}>
          <VoiceFormFiller
            schema={PATIENT_VOICE_SCHEMA}
            onFill={applyVoiceFill}
            onStartGuided={() => setVoiceMode('guided')}
            hint="Cadastro de paciente em clínica brasileira."
          />
        </div>
      ) : null}

      {voiceMode === 'guided' && isNewPatient ? (
        <GuidedVoiceFlow
          fields={PATIENT_GUIDED_FIELDS}
          onFieldFilled={applyVoiceFillField}
          onFinish={() => setVoiceMode('idle')}
          onCancel={() => setVoiceMode('idle')}
        />
      ) : null}

      <form className="space-y-5" id="patient-editor-form" onSubmit={handleSubmit}>
          <section className={darkCard}>
            <SectionHeading icon="user" tone="blue">Dados do paciente</SectionHeading>
            <div className="mb-8 flex flex-col items-center gap-5 rounded-xl border border-border-subtle bg-surface-inset/40 p-5 sm:flex-row sm:items-center sm:p-4">
              {avatarPreview ? (
                <img alt="" className="size-20 shrink-0 rounded-full border-2 border-accent-primary/40 object-cover" src={avatarPreview} />
              ) : (
                <div className="grid size-20 shrink-0 place-items-center rounded-full border-2 border-accent-primary/30 bg-accent-primary/15 text-accent-primary">
                  <PatientIcon className="size-10" name="user" />
                </div>
              )}
              <div className="flex flex-1 flex-col items-center text-center sm:items-start sm:text-left">
                <p className="text-sm font-semibold text-text-heading">Foto do paciente</p>
                <p className="mt-0.5 text-xs text-text-muted-v2">Opcional. PNG ou JPG, até 5MB.</p>
              </div>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border-default-v2 bg-surface-card px-4 text-sm font-semibold text-text-body transition hover:border-border-strong hover:bg-surface-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <PatientIcon className="size-4" name="upload" />
                {avatarPreview ? 'Trocar foto' : 'Carregar foto'}
              </button>
              <input
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
                ref={fileInputRef}
                type="file"
              />
              {avatarFile ? (
                <div className="flex items-center gap-2 rounded-md border border-border-default-v2 bg-surface-card px-3 py-2 text-xs text-text-muted-v2">
                  <span className="max-w-56 truncate">{avatarFile.name}</span>
                  <button
                    aria-label={`Remover ${avatarFile.name}`}
                    className="grid size-5 place-items-center rounded-sm text-text-heading transition hover:bg-surface-card-hover"
                    onClick={removeAvatarFile}
                    type="button"
                  >
                    x
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-12">
              <DarkField className="md:col-span-6" label="Nome *">
                <input className={darkInput} name="name" onChange={handleChange} required={isNewPatient} value={formData.name} />
              </DarkField>
              <DarkField className="md:col-span-6" label="Nome social">
                <input className={darkInput} name="socialName" onChange={handleChange} value={formData.socialName} />
              </DarkField>
              <DarkField className="md:col-span-3" label={requiredLabel('CPF')}>
                <input className={darkInput} maxLength={14} name="cpf" onChange={handleChange} required={isNewPatient} value={formData.cpf} />
              </DarkField>
              <DarkField className="md:col-span-3" label="RG">
                <input className={darkInput} maxLength={12} name="rg" onChange={handleChange} value={formData.rg} />
              </DarkField>
              <DarkField className="md:col-span-3" label="Outros documentos">
                <select className={darkInput} name="otherDocuments" onChange={handleChange} value={formData.otherDocuments}>
                  <option value="">Selecione</option>
                  {withCurrentOption(DOCUMENT_TYPE_OPTIONS, formData.otherDocuments).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </DarkField>
              <DarkField className="md:col-span-3" label="Número do documento">
                <input className={darkInput} maxLength={11} name="documentNumber" onChange={handleChange} value={formData.documentNumber} />
              </DarkField>
              <DarkField className="md:col-span-3" label="Sexo">
                <select className={darkInput} name="sex" onChange={handleChange} value={formData.sex}>
                  <option value="">Selecione</option>
                  <option>Feminino</option>
                  <option>Masculino</option>
                </select>
              </DarkField>
              <DarkField className="md:col-span-3" label={requiredLabel('Idade')}>
                <input className={darkInput} min="0" name="age" onChange={handleChange} required={isNewPatient} type="number" value={formData.age} />
              </DarkField>
              <DarkField className="md:col-span-3" label={requiredLabel('Data de Nascimento')}>
                <input className={`${darkInput} [color-scheme:dark]`} name="birthDate" onChange={handleChange} required={isNewPatient} type="date" value={formData.birthDate} />
              </DarkField>
              <DarkField className="md:col-span-3" label="Etnia">
                <select className={darkInput} name="ethnicity" onChange={handleChange} value={formData.ethnicity}>
                  <option value="">Selecione</option>
                  <option>Indígena</option>
                  <option>Não Indígena</option>
                </select>
              </DarkField>
              <DarkField className="md:col-span-3" label="Estado civil">
                <select className={darkInput} name="maritalStatus" onChange={handleChange} value={formData.maritalStatus}>
                  <option value="">Selecione</option>
                  <option>Solteiro(a)</option>
                  <option>Casado(a)</option>
                  <option>Divorciado(a)</option>
                </select>
              </DarkField>
              <DarkField className="md:col-span-6" label={requiredLabel('Nome da mãe')}>
                <input className={darkInput} name="motherName" onChange={handleChange} required={isNewPatient} value={formData.motherName} />
              </DarkField>
              <DarkField className="md:col-span-6" label="Nome do pai">
                <input className={darkInput} name="fatherName" onChange={handleChange} value={formData.fatherName} />
              </DarkField>
              <DarkField className="md:col-span-3" label="Raça">
                <select className={darkInput} name="race" onChange={handleChange} value={formData.race}>
                  <option value="">Selecione</option>
                  <option>Branca</option>
                  <option>Preta</option>
                  <option>Parda</option>
                  <option>Amarela</option>
                  <option>Indígena</option>
                  <option>Não informada</option>
                </select>
              </DarkField>
              <DarkField className="md:col-span-3" label="Naturalidade">
                <select className={darkInput} name="naturality" onChange={handleChange} value={formData.naturality}>
                  <option value="">Selecione</option>
                  {withCurrentOption(NATURALITY_OPTIONS, formData.naturality).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </DarkField>
              <DarkField className="md:col-span-3" label="Nacionalidade">
                <select className={darkInput} name="nationality" onChange={handleChange} value={formData.nationality}>
                  <option value="">Selecione</option>
                  {withCurrentOption(NATIONALITY_OPTIONS, formData.nationality).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </DarkField>
              <DarkField className="md:col-span-3" label="Profissão">
                <input className={darkInput} name="profession" onChange={handleChange} value={formData.profession} />
              </DarkField>
              <DarkField className="md:col-span-3" label="Nome do esposo(a)">
                <input className={darkInput} name="spouseName" onChange={handleChange} value={formData.spouseName} />
              </DarkField>
              {isMinorPatient ? (
                <>
                  <div className="md:col-span-12 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                    <svg className="size-4 text-amber-300" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path d="M12 9v4M12 17h.01" />
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    </svg>
                    <p className="text-xs font-semibold text-amber-200">Campos obrigatórios para pacientes menores de idade</p>
                  </div>
              <DarkField className="md:col-span-6" label="Profissão da mãe">
                <input className={darkInput} name="motherProfession" onChange={handleChange} value={formData.motherProfession} />
              </DarkField>
              <DarkField className="md:col-span-6" label="Profissão do pai">
                <input className={darkInput} name="fatherProfession" onChange={handleChange} value={formData.fatherProfession} />
              </DarkField>
              <DarkField className="md:col-span-6" label="Nome do responsável">
                <input className={darkInput} name="responsibleName" onChange={handleChange} value={formData.responsibleName} />
              </DarkField>
              <DarkField className="md:col-span-3" label="CPF do responsável">
                <input className={darkInput} maxLength={14} name="responsibleCpf" onChange={handleChange} value={formData.responsibleCpf} />
              </DarkField>
                </>
              ) : null}
              <div className="md:col-span-12">
                <button
                  className="flex w-full items-center justify-between rounded-lg border border-border-default-v2 bg-surface-inset p-4 text-left text-sm font-medium text-text-heading transition hover:bg-surface-card-hover"
                  onClick={() => setAttachmentsOpen((open) => !open)}
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    <PatientIcon className="size-4 text-text-muted-v2" name="paperclip" />
                    Anexos do paciente
                  </span>
                  <PatientIcon className="size-4 text-text-muted-v2" name={attachmentsOpen ? 'chevron-up' : 'chevron-down'} />
                </button>
                {attachmentsOpen ? (
                  <UploadDropzone
                    attachmentInputRef={attachmentInputRef}
                    existingAttachments={formData.attachments}
                    files={attachmentFiles}
                    onFileChange={handleAttachmentChange}
                    onRemoveFile={removeAttachmentFile}
                  />
                ) : null}
              </div>
            </div>
          </section>

          <section className={darkCard}>
            <SectionHeading icon="heart" tone="violet">Informações médicas</SectionHeading>
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-12">
              <DarkField className="md:col-span-6" label="Condição principal">
                <input className={darkInput} name="condition" onChange={handleChange} value={formData.condition} />
              </DarkField>
              <DarkField className="md:col-span-3" label="Tipo sanguíneo">
                <select className={darkInput} name="bloodType" onChange={handleChange} value={formData.bloodType}>
                  <option value="">Selecione</option>
                  {BLOOD_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </DarkField>
              <DarkField className="md:col-span-3" label="Última consulta">
                <input className={`${darkInput} [color-scheme:dark]`} name="lastVisitIso" onChange={handleChange} type="date" value={formData.lastVisitIso || ''} />
              </DarkField>
              <DarkField className="md:col-span-3" label="Peso (kg)">
                <input className={darkInput} inputMode="decimal" name="weight" onChange={handleChange} value={formData.weight} />
              </DarkField>
              <DarkField className="md:col-span-3" label="Altura (m)">
                <input className={darkInput} inputMode="numeric" maxLength={4} name="height" onChange={handleChange} placeholder="1,70" value={formData.height} />
              </DarkField>
              <DarkField className="md:col-span-3" label="IMC">
                <input className={darkInput} readOnly value={calculatedBmi} />
              </DarkField>
              <DarkField className="md:col-span-12" label="Alergias">
                <textarea className={`${darkInput} min-h-24 py-2`} name="allergies" onChange={handleChange} value={formData.allergies} />
              </DarkField>
            </div>
          </section>

          <section className={darkCard}>
            <SectionHeading icon="phone" tone="green">Contato</SectionHeading>
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-12">
              <DarkField className="md:col-span-3" label={requiredLabel('E-mail')}>
                <input className={darkInput} name="email" onChange={handleChange} required={isNewPatient} type="email" value={formData.email} />
              </DarkField>
              <DarkField className="md:col-span-3" label={requiredLabel('Celular')}>
                <input className={darkInput} maxLength={15} name="phone" onChange={handleChange} required={isNewPatient} value={formData.phone} />
              </DarkField>
              <DarkField className="md:col-span-3" label="TEL1">
                <input className={darkInput} maxLength={15} name="phoneLandline" onChange={handleChange} value={formData.phoneLandline} />
              </DarkField>
              <DarkField className="md:col-span-3" label="TEL2">
                <input className={darkInput} maxLength={15} name="phoneSecondary" onChange={handleChange} value={formData.phoneSecondary} />
              </DarkField>
            </div>
          </section>

          <section className={darkCard}>
            <SectionHeading icon="map-pin" tone="blue">Endereço</SectionHeading>
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-12">
              <DarkField className="md:col-span-3" label={requiredLabel('CEP')}>
                <input className={darkInput} maxLength={9} name="zipCode" onChange={handleChange} placeholder="_____-___" required={isNewPatient} value={formData.zipCode} />
              </DarkField>
              <DarkField className="md:col-span-5" label={requiredLabel('Endereço')}>
                <input className={darkInput} name="addressStreet" onChange={handleChange} required={isNewPatient} value={formData.addressStreet} />
              </DarkField>
              <DarkField className="md:col-span-2" label={requiredLabel('Número')}>
                <input className={darkInput} name="addressNumber" onChange={handleChange} required={isNewPatient} value={formData.addressNumber} />
              </DarkField>
              <DarkField className="md:col-span-6" label="Complemento">
                <input className={darkInput} name="addressComplement" onChange={handleChange} value={formData.addressComplement} />
              </DarkField>
              <DarkField className="md:col-span-4" label={requiredLabel('Cidade')}>
                <input className={darkInput} name="city" onChange={handleChange} required={isNewPatient} value={formData.city} />
              </DarkField>
              <DarkField className="md:col-span-4" label={requiredLabel('Estado')}>
                <select className={darkInput} name="state" onChange={handleChange} required={isNewPatient} value={formData.state}>
                  <option value="">Selecione</option>
                  {BRAZILIAN_STATES.map((stateOption) => (
                    <option key={stateOption.value} value={stateOption.value}>
                      {stateOption.label}
                    </option>
                  ))}
                </select>
              </DarkField>
            </div>
          </section>

          <section className={darkCard}>
            <SectionHeading icon="file" tone="violet">Convênio</SectionHeading>
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-12">
              <DarkField className="md:col-span-6" label="Convênio">
                <select className={darkInput} name="insurance" onChange={handleChange} value={formData.insurance}>
                  <option value="">Selecione</option>
                  {INSURANCE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </DarkField>
              <DarkField className="md:col-span-6" label={requiredLabel('Plano')}>
                <input className={darkInput} name="plan" onChange={handleChange} required={isNewPatient} value={formData.plan} />
              </DarkField>
              <DarkField className="md:col-span-4" label="Número da matrícula">
                <input className={darkInput} name="insuranceNumber" onChange={handleChange} value={formData.insuranceNumber} />
              </DarkField>
              <DarkField className="md:col-span-4" label="Validade da carteira">
                <input
                  className={`${darkInput} [color-scheme:dark]`}
                  disabled={formData.insuranceIndefiniteValidity}
                  name="insuranceCardValidUntil"
                  onChange={handleChange}
                  type="date"
                  value={formData.insuranceCardValidUntil}
                />
              </DarkField>
              <label className="flex h-10 cursor-pointer items-center gap-2 self-end text-sm text-text-body md:col-span-4">
                <input className="size-4 accent-accent-primary" checked={formData.insuranceIndefiniteValidity} name="insuranceIndefiniteValidity" onChange={handleChange} type="checkbox" />
                Validade indeterminada
              </label>
              <label className="md:col-span-12 flex w-fit cursor-pointer items-center gap-3 rounded-lg border border-border-default-v2 bg-surface-inset px-4 py-2.5 text-sm font-medium text-text-body transition hover:border-amber-500/50 has-[:checked]:border-amber-500/60 has-[:checked]:bg-amber-500/10 has-[:checked]:text-amber-200">
                <input className="size-4 accent-amber-400" checked={formData.vip} name="vip" onChange={handleChange} type="checkbox" />
                <span className="inline-flex items-center gap-1.5">
                  <svg className="size-4" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Marcar como paciente VIP
                </span>
              </label>
            </div>
          </section>

          <section className={darkCard}>
            <SectionHeading icon="file" tone="green">Informações do SUS</SectionHeading>
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-12">
              <DarkField className="md:col-span-6" label="CNS">
                <input className={darkInput} maxLength={15} name="cns" onChange={handleChange} value={formData.cns} />
              </DarkField>
            </div>
          </section>

          <section className={darkCard}>
            <SectionHeading icon="edit" tone="blue">Observações</SectionHeading>
            <DarkField label="Observações gerais">
              <textarea className={`${darkInput} min-h-32 py-2`} name="notesText" onChange={handleChange} value={formData.notesText} />
            </DarkField>
            <label className="mt-4 flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-default-v2 bg-surface-inset px-4 py-2 text-sm font-medium text-text-body transition hover:border-border-strong has-[:checked]:border-accent-primary/60 has-[:checked]:bg-accent-primary/5">
              <span className="inline-flex items-center gap-2">
                <svg className="size-4 text-accent-primary" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Autoriza o recebimento de mensagens conforme LGPD
              </span>
              <input className="size-4 accent-accent-primary" checked={Boolean(formData.lgpdOptIn)} name="lgpdOptIn" onChange={handleChange} type="checkbox" />
            </label>
          </section>

      </form>

      {/* Action bar sticky */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default-v2 bg-surface-card/95 shadow-elevated backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-7">
          <div className="hidden items-center gap-2 text-xs text-text-muted-v2 sm:flex">
            <svg className="size-4 text-accent-primary" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <span>
              {isNewPatient
                ? <>Cadastrando novo paciente — confira os campos antes de salvar.</>
                : <>Editando <strong className="text-text-body">{patient?.name}</strong></>}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
              disabled={saving}
              onClick={onCancel}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-accent-primary px-5 text-sm font-bold text-white shadow-card transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
              disabled={saving}
              form="patient-editor-form"
              type="submit"
            >
              {saving ? (
                <>
                  <svg className="size-4 animate-spin" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Salvando...
                </>
              ) : (
                <>
                  <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {isNewPatient ? 'Cadastrar paciente' : 'Salvar alterações'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PatientDetailPage({ navigate, patient, role }) {
  const [activeTab, setActiveTab] = useState('resumo')
  const [localPatient, setLocalPatient] = useState(patient)
  const [editing, setEditing] = useState(false)
  const [messageShortcutOpen, setMessageShortcutOpen] = useState(false)
  const [appointmentShortcutOpen, setAppointmentShortcutOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const canEditPatients = hasCapability(role, 'canEditPatients')
  const canHardDeletePatients = hasCapability(role, 'hardDeletePatients')

  async function savePatient(updatedPatient) {
    if (!canEditPatients) return

    setSaving(true)
    try {
      await patientRepository.update(updatedPatient.id, updatedPatient)
      const avatarResult = updatedPatient.avatarFile
        ? await patientRepository.uploadAvatar(updatedPatient.id, updatedPatient.avatarFile)
        : null
      const uploadedAttachments = await uploadPatientAttachments(updatedPatient.id, updatedPatient.attachmentFiles)
      const nextAttachments = [...(updatedPatient.attachments || []), ...uploadedAttachments]
      if (uploadedAttachments.length) {
        await patientRepository.update(updatedPatient.id, { attachments: nextAttachments })
      }
      setLocalPatient((current) => ({
        ...current,
        ...updatedPatient,
        attachmentFiles: undefined,
        attachments: nextAttachments,
        avatarFile: undefined,
        avatarUrl: avatarResult?.avatarUrl || updatedPatient.avatarUrl,
      }))
      setEditing(false)
    } catch (err) {
      window.alert(`Erro ao salvar paciente: ${translateErrorMessage(err.message, 'Erro ao salvar paciente.')}`)
    } finally {
      setSaving(false)
    }
  }

  async function deletePatient() {
    if (!canHardDeletePatients) return

    if (!window.confirm('Tem certeza que deseja excluir este paciente definitivamente? Esta ação não poderá ser desfeita.')) {
      return
    }

    try {
      await patientRepository.remove(localPatient.id)
      navigate('/pacientes')
    } catch (err) {
      window.alert(`Erro ao excluir paciente: ${translateErrorMessage(err.message, 'Erro ao excluir paciente.')}`)
    }
  }

  if (editing) {
    return (
      <PatientEditor
        existingIds={[localPatient.id]}
        onCancel={() => setEditing(false)}
        onSave={savePatient}
        patient={localPatient}
        saving={saving}
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-start gap-4">
          <button
            className="mt-1 grid size-10 place-items-center rounded-sm border border-border-default-v2 bg-surface-card text-text-heading transition hover:bg-surface-card-hover"
            onClick={() => navigate('/pacientes')}
            type="button"
          >
            <PatientIcon className="size-5" name="chevron-left" />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3b82f6]">Dados do Paciente</p>
            <h1 className="mt-1 text-[32px] font-bold leading-8 tracking-[-0.02em] text-text-heading">{localPatient.name}</h1>
            <p className="mt-1 text-sm text-text-body">
              {localPatient.condition} • {localPatient.status} • {localPatient.document}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {canEditPatients ? (
            <button
              className="h-10 rounded-sm border border-border-default-v2 bg-surface-card px-4 text-sm font-semibold text-text-heading transition hover:bg-surface-card-hover"
              onClick={() => setEditing(true)}
              type="button"
            >
              Editar dados
            </button>
          ) : null}
          <button
            className="h-10 rounded-sm border border-border-default-v2 bg-surface-card px-4 text-sm font-semibold text-text-heading transition hover:bg-surface-card-hover"
            onClick={() => setMessageShortcutOpen(true)}
            type="button"
          >
            Enviar mensagem
          </button>
          <button
            className="h-10 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
            onClick={() => setAppointmentShortcutOpen(true)}
            type="button"
          >
            Novo retorno
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Idade" value={localPatient.age ? `${localPatient.age} anos` : missingValue('Idade')} />
        <SummaryTile label="Risco" value={localPatient.risk || missingValue('Risco')} tone={localPatient.risk ? riskColor(localPatient.risk) : null} />
        <SummaryTile label="Última consulta" value={localPatient.lastVisit || 'Ainda não houve atendimento'} />
        <SummaryTile label="Próxima consulta" value={localPatient.nextVisit || 'Nenhum atendimento agendado'} />
      </section>

      <section className={darkCard}>
        <div className="flex gap-4 border-b border-border-default-v2">
          {patientTabs.map((tab) => (
            <button
              className={`border-b-2 px-2 pb-3 text-sm font-semibold transition ${
                activeTab === tab.value
                  ? 'border-[#3b82f6] text-[#3b82f6]'
                  : 'border-transparent text-text-body hover:text-text-heading'
              }`}
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === 'resumo' ? <PatientSummary patient={localPatient} /> : null}
          {activeTab === 'consultas' ? <PatientVisits navigate={navigate} patient={localPatient} /> : null}
          {activeTab === 'documentos' ? <PatientDocuments patient={localPatient} /> : null}
        </div>
      </section>

      {canHardDeletePatients ? (
        <div className="flex justify-end">
          <button
            className="h-10 rounded-sm border border-red-700 bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/40"
            onClick={deletePatient}
            type="button"
          >
            Excluir paciente
          </button>
        </div>
      ) : null}

      {messageShortcutOpen ? (
        <PatientMessageShortcutModal
          onClose={() => setMessageShortcutOpen(false)}
          patient={localPatient}
        />
      ) : null}

      {appointmentShortcutOpen ? (
        <PatientAppointmentShortcutModal
          onClose={() => setAppointmentShortcutOpen(false)}
          patient={localPatient}
        />
      ) : null}
    </div>
  )
}

function PatientSummary({ patient }) {
  const isMinorPatient = isMinorPatientRecord(patient)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <PatientInfoSection
          items={[
            ['Nome social', patient.socialName],
            ['RG', patient.rg],
            ['Outros documentos', patient.otherDocuments],
            ['Número do documento', patient.documentNumber],
            ['Sexo', patient.sex],
            ['Profissão da mãe', patient.motherProfession],
            ['Profissão do pai', patient.fatherProfession],
            ['Raça', patient.race],
            ['Naturalidade', patient.naturality],
            ['Nacionalidade', patient.nationality],
            ['Profissão', patient.profession],
            ['Responsável', patient.responsibleName],
            ['CPF do responsável', patient.responsibleCpf],
            ['Esposo(a)', patient.spouseName],
            ['CPF', patient.cpf || patient.document],
            ['Data de nascimento', formatDisplayDate(patient.birthDate || patient.birth_date)],
            ['Nome da mãe', patient.motherName],
            ['Nome do pai', patient.fatherName],
            ['Etnia', patient.ethnicity],
            ['Estado civil', patient.maritalStatus],
          ].filter(([label]) => isMinorPatient || !isMinorOnlyPatientInfoLabel(label))}
          title="Dados pessoais"
        />
        <PatientInfoSection
          items={[
            ['CEP', patient.zipCode],
            ['Endereço', patient.addressStreet],
            ['Número', patient.addressNumber],
            ['Complemento', patient.addressComplement],
            ['Cidade', patient.city],
            ['Estado', patient.state],
          ]}
          title="Endereço"
        />
        <PatientInfoSection
          items={[
            ['Tipo sanguíneo', patient.bloodType],
            ['Peso', patient.weight ? `${patient.weight} kg` : ''],
            ['Altura', patient.height ? `${patient.height} m` : ''],
            ['IMC', patient.bmi],
            ['Alergias', patient.allergies],
            ['Condição principal', patient.condition],
          ]}
          title="Informações médicas"
        />
        <PatientInfoSection
          items={[
            ['Convênio', patient.insurance],
            ['Plano', patient.plan],
            ['Número da matrícula', patient.insuranceNumber],
            ['Validade da carteira', patient.insuranceIndefiniteValidity ? 'Indeterminada' : formatDisplayDate(patient.insuranceCardValidUntil)],
            ['VIP', patient.vip ? 'Sim' : 'Não'],
          ]}
          title="Informações de convênio"
        />
        <PatientInfoSection
          items={[
            ['CNS', patient.cns],
          ]}
          title="Informações do SUS"
        />
      </div>
      <div className="rounded-xl border border-border-default-v2 bg-surface-page p-4">
        <div className="mb-5 border-b border-border-default-v2 pb-5">
          <h3 className="font-bold text-text-heading">Foto do paciente</h3>
          <div className="mt-4 flex items-center gap-4">
            <PatientAvatar className="size-24" patient={patient} />
            <p className="text-sm leading-5 text-text-muted-v2">
              {resolvePatientAvatarUrl(patient) ? 'Imagem cadastrada no perfil do paciente.' : 'Nenhuma foto cadastrada.'}
            </p>
          </div>
        </div>
        <h3 className="font-bold text-text-heading">Contato e equipe</h3>
        <dl className="mt-4 grid gap-3 text-sm">
          <InfoRow label="Celular" value={patient.phone} />
          <InfoRow label="TEL1" value={patient.phoneLandline} />
          <InfoRow label="TEL2" value={patient.phoneSecondary} />
          <InfoRow label="E-mail" value={patient.email} />
          <InfoRow label="Mensagens LGPD" value={patient.lgpdOptIn ? 'Opt-in' : 'Opt-out'} />
          <InfoRow label="Endereço" value={patient.address} />
          <InfoRow label="Equipe" value={(patient.team || []).join(', ')} />
        </dl>
      </div>
    </div>
  )
}

function PatientAvatar({ className = 'mt-1 size-12', patient }) {
  const [failedUrl, setFailedUrl] = useState('')
  const avatarUrl = resolvePatientAvatarUrl(patient)
  const hasAvatar = Boolean(avatarUrl) && failedUrl !== avatarUrl

  return (
    <span className={`${className} grid shrink-0 place-items-center overflow-hidden rounded-full border border-[#3b82f6]/30 bg-surface-card text-lg font-bold text-text-muted-v2`}>
      {hasAvatar ? (
        <img
          alt={`Foto de ${patient.name || 'paciente'}`}
          className="size-full object-cover"
          onError={() => setFailedUrl(avatarUrl)}
          src={avatarUrl}
        />
      ) : (
        getPatientInitials(patient.name)
      )}
    </span>
  )
}

function resolvePatientAvatarUrl(patient) {
  const avatar = String(patient?.avatarUrl || patient?.avatar_url || patient?.avatar_path || patient?.photo_url || patient?.foto_url || '').trim()
  if (!avatar) return ''
  if (/^(https?:|blob:|data:)/i.test(avatar)) return avatar

  return `${apiConfig.storageUrl}/object/public/avatars/${avatar.replace(/^\/+/, '')}`
}

function getPatientInitials(name) {
  return String(name || 'P')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function PatientMessageShortcutModal({ onClose, patient }) {
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState('whatsapp')

  function handleSubmit(event) {
    event.preventDefault()
    onClose()
  }

  return (
    <ShortcutModal onClose={onClose} title="Nova mensagem">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <DarkField label="Paciente">
          <input className={darkInput} readOnly value={patient.name || ''} />
        </DarkField>
        <DarkField label="Canal">
          <select className={darkInput} onChange={(event) => setChannel(event.target.value)} value={channel}>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="email">E-mail</option>
          </select>
        </DarkField>
        <DarkField label="Mensagem">
          <textarea
            className={`${darkInput} min-h-28 py-2`}
            onChange={(event) => setMessage(event.target.value)}
            value={message}
          />
        </DarkField>
        <ShortcutActions disabled={!message.trim()} onClose={onClose} submitLabel="Enviar" />
      </form>
    </ShortcutModal>
  )
}

function PatientAppointmentShortcutModal({ onClose, patient }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    onClose()
  }

  return (
    <ShortcutModal onClose={onClose} title="Novo agendamento">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <DarkField label="Paciente">
          <input className={darkInput} readOnly value={patient.name || ''} />
        </DarkField>
        <div className="grid gap-4 md:grid-cols-2">
          <DarkField label="Data">
            <input className={`${darkInput} [color-scheme:dark]`} onChange={(event) => setDate(event.target.value)} type="date" value={date} />
          </DarkField>
          <DarkField label="Horário">
            <input className={`${darkInput} [color-scheme:dark]`} onChange={(event) => setTime(event.target.value)} type="time" value={time} />
          </DarkField>
        </div>
        <DarkField label="Observações">
          <textarea
            className={`${darkInput} min-h-24 py-2`}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Observações para o retorno"
            value={notes}
          />
        </DarkField>
        <ShortcutActions disabled={!date || !time} onClose={onClose} submitLabel="Salvar" />
      </form>
    </ShortcutModal>
  )
}

function ShortcutModal({ children, onClose, title }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-border-default-v2 bg-surface-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-default-v2 px-5 py-4">
          <h2 className="text-lg font-bold text-text-heading">{title}</h2>
          <button className="grid size-9 place-items-center rounded-sm text-text-muted-v2 hover:bg-surface-card-hover" onClick={onClose} type="button">
            <PatientIcon className="size-5" name="x" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function ShortcutActions({ disabled, onClose, submitLabel }) {
  return (
    <div className="flex justify-end gap-3 border-t border-border-default-v2 pt-4">
      <button className="h-10 rounded-sm border border-border-default-v2 px-4 text-sm font-semibold text-text-heading" onClick={onClose} type="button">
        Cancelar
      </button>
      <button
        className="h-10 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        type="submit"
      >
        {submitLabel}
      </button>
    </div>
  )
}

function PatientInfoSection({ items, title }) {
  return (
    <section className="rounded-xl border border-border-default-v2 bg-surface-page p-4">
      <h3 className="font-bold text-text-heading">{title}</h3>
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        {items.map(([label, value]) => (
          <InfoRow key={label} label={label} value={value || 'Não informado'} />
        ))}
      </dl>
    </section>
  )
}

function PatientVisits({ navigate, patient }) {
  return (
    <div className="grid gap-3">
      {[
        patient.nextVisit
          ? { date: patient.nextVisit, status: 'Agendada', description: `Retorno para ${patient.condition}` }
          : null,
        patient.lastVisit
          ? { date: patient.lastVisit, status: 'Finalizada', description: 'Consulta registrada no histórico do paciente.' }
          : null,
      ].filter(Boolean).map((visit) => (
        <div className="rounded-xl border border-border-default-v2 bg-surface-page p-4" key={`${visit.date}-${visit.status}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-text-heading">{visit.date}</p>
              <p className="mt-1 text-sm text-text-muted-v2">{visit.description}</p>
            </div>
            <span
              className={`rounded px-2 py-1 text-xs font-bold ${
                visit.status === 'Agendada' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-card-hover text-text-muted-v2'
              }`}
            >
              {visit.status}
            </span>
          </div>
        </div>
      ))}
      {!patient.nextVisit && !patient.lastVisit ? (
        <div className="rounded-xl border border-border-default-v2 bg-surface-page p-4 text-sm text-text-muted-v2">
          Nenhum agendamento encontrado para este paciente.
        </div>
      ) : null}
      <button
        className="h-10 justify-self-start rounded-sm border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-heading transition hover:border-[#3b82f6]"
        onClick={() => navigate('/consultas')}
        type="button"
      >
        Abrir fila de consultas
      </button>
    </div>
  )
}

function PatientDocuments({ patient }) {
  const exams = Array.isArray(patient.exams) ? patient.exams : []
  const attachments = Array.isArray(patient.attachments) ? patient.attachments : []

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {attachments.map((attachment) => (
        <a
          className="rounded-xl border border-border-default-v2 bg-surface-page p-4 transition hover:border-[#3b82f6]"
          href={attachment.url}
          key={attachment.path || attachment.url || attachment.name}
          rel="noreferrer"
          target="_blank"
        >
          <p className="font-semibold text-text-heading">{attachment.name || 'Anexo do paciente'}</p>
          <p className="mt-2 text-sm text-text-muted-v2">Arquivo enviado para o cadastro.</p>
          <span className="mt-4 inline-flex rounded bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-400">
            Disponível
          </span>
        </a>
      ))}
      {exams.length ? exams.map((exam) => (
        <div className="rounded-xl border border-border-default-v2 bg-surface-page p-4" key={exam}>
          <p className="font-semibold text-text-heading">{exam}</p>
          <p className="mt-2 text-sm text-text-muted-v2">Pendente de revisão.</p>
          <span className="mt-4 inline-flex rounded bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400">
            A revisar
          </span>
        </div>
      )) : null}
      {!attachments.length && !exams.length ? (
        <div className="rounded-xl border border-border-default-v2 bg-surface-page p-4 text-sm text-text-muted-v2">
          Nenhum documento encontrado.
        </div>
      ) : null}
    </div>
  )
}

function SummaryTile({ label, tone = null, value }) {
  return (
    <article className="rounded-2xl border border-border-default-v2 bg-surface-card p-4 shadow-sm">
      <p className="text-sm font-medium text-text-muted-v2">{label}</p>
      <div className="mt-3">
        {tone ? (
          <span className={`rounded px-2.5 py-1 text-xs font-bold ${tone}`}>{value}</span>
        ) : (
          <p className="text-xl font-bold text-text-heading">{value}</p>
        )}
      </div>
    </article>
  )
}

function InfoRow({ label, value }) {
  const displayValue = formatInfoValue(value)
  const minorOnly = isMinorOnlyPatientInfoLabel(label)

  return (
    <div>
      <dt className="flex flex-wrap items-center gap-2 font-semibold text-text-muted-v2">
        <span>{label}</span>
        {minorOnly ? <span className="rounded-sm bg-[#3b82f6]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#51a2ff]">Menor de idade</span> : null}
      </dt>
      <dd className="mt-1 break-words text-text-heading">{displayValue || missingValue(label)}</dd>
    </div>
  )
}

function formatInfoValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  if (value && typeof value === 'object') {
    return Object.values(value).filter(Boolean).join(', ')
  }
  return value
}

function missingValue(label) {
  return `${label} não informado`
}

function formatDisplayDate(value) {
  if (!value) return ''
  const [year, month, day] = String(value).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function riskColor(risk) {
  if (risk === 'Alto') {
    return 'bg-red-500/20 text-red-400'
  }

  if (risk === 'Moderado') {
    return 'bg-amber-500/20 text-amber-400'
  }

  return 'bg-emerald-500/20 text-emerald-400'
}

function normalizeFilterValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeAgeFilter(value) {
  if (value === '' || value === null || value === undefined) return null

  const age = Number(value)
  return Number.isFinite(age) && age >= 0 ? age : null
}

function resolvePatientFilterAge(patient) {
  const rawAge = patient?.age ?? patient?.idade
  if (rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== '') {
    const age = Number(rawAge)
    if (Number.isFinite(age) && age >= 0) return age
  }

  const ageFromBirthDate = calculateAgeFromBirthDate(patient?.birthDate || patient?.birth_date)
  return Number.isFinite(ageFromBirthDate) && ageFromBirthDate >= 0 ? ageFromBirthDate : null
}

function PatientSelect({ className = '', icon, label, onChange, options, value }) {
  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
        <PatientIcon className="size-4 text-text-muted-v2" name={icon} />
      </div>
      <select
        className={`h-11 w-full cursor-pointer appearance-none rounded-md border bg-surface-card-hover py-2 pl-10 pr-8 text-sm outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 ${
          value ? 'border-accent-primary/40 text-text-body' : 'border-border-default-v2 text-text-muted-v2'
        }`}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <PatientIcon className="pointer-events-none absolute right-3 top-3.5 size-4 text-text-muted-v2" name="chevron-down" />
    </div>
  )
}

function PatientHeroMetric({ tone, label, value, hint }) {
  const tones = {
    blue: 'metric-tone-blue',
    violet: 'metric-tone-violet',
    green: 'metric-tone-green',
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-card px-4 py-3">
      <div className={`flex size-10 items-center justify-center rounded-lg ${tones[tone] || tones.blue}`}>
        <svg className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted-v2">{label}</p>
        <p className="mt-0.5 text-xl font-bold leading-none tabular-nums text-text-heading">{value}</p>
        {hint ? <p className="mt-1 truncate text-[11px] text-text-muted-v2">{hint}</p> : null}
      </div>
    </div>
  )
}

function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-primary/30 bg-accent-primary/10 px-2.5 py-1 text-xs font-semibold text-accent-primary">
      {label}
      <button
        aria-label={`Remover ${label}`}
        className="inline-flex size-4 items-center justify-center rounded-full transition hover:bg-accent-primary/20"
        onClick={onClear}
        type="button"
      >
        <PatientIcon className="size-3" name="x" />
      </button>
    </span>
  )
}

function PageButton({ children, disabled, onClick }) {
  return (
    <button
      className="grid size-9 place-items-center rounded-md border border-border-default-v2 bg-surface-card-hover text-text-body transition hover:border-border-strong hover:bg-surface-card disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function ActionItem({ danger = false, icon, label, onClick }) {
  return (
    <button
      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-text-body hover:bg-surface-card-hover hover:text-text-heading'
      }`}
      onClick={onClick}
      type="button"
    >
      <PatientIcon className="size-4" name={icon} />
      {label}
    </button>
  )
}

function requiredLabel(label) {
  return (
    <>
      {label} <span className="text-red-400">*</span>
    </>
  )
}

function DarkField({ children, className = '', label }) {
  return (
    <label className={`block ${className}`}>
      <span className={darkLabel}>{label}</span>
      {children}
    </label>
  )
}

function SectionHeading({ children, icon, tone = 'blue' }) {
  const tones = {
    blue: 'metric-tone-blue',
    violet: 'metric-tone-violet',
    green: 'metric-tone-green',
  }
  return (
    <div className="mb-6 flex items-center gap-3 border-b border-border-subtle pb-4">
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tones[tone] || tones.blue}`}>
        <PatientIcon className="size-4" name={icon} />
      </div>
      <h2 className="text-base font-bold text-text-heading">{children}</h2>
    </div>
  )
}

function UploadDropzone({ attachmentInputRef, existingAttachments = [], files = [], onFileChange, onRemoveFile }) {
  return (
    <div
      className="mt-4 cursor-pointer rounded-xl border-2 border-dashed border-border-default-v2 bg-surface-inset px-6 py-8 text-center transition hover:border-accent-primary/40 hover:bg-surface-card-hover focus-visible:outline-none focus-visible:border-accent-primary"
      onClick={() => attachmentInputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
        <PatientIcon className="size-6" name="upload" />
      </div>
      <p className="text-sm font-semibold text-text-heading">Clique para selecionar arquivos ou arraste-os aqui</p>
      <p className="mt-1 text-xs text-text-muted-v2">Imagens e documentos até 10MB cada</p>
      <input className="hidden" multiple onChange={onFileChange} ref={attachmentInputRef} type="file" />
      {files.length || existingAttachments.length ? (
        <ul className="mt-5 grid gap-2 text-left text-xs">
          {existingAttachments.map((attachment) => (
            <li className="flex items-center gap-2 rounded-lg border border-border-default-v2 bg-surface-card px-3 py-2" key={attachment.path || attachment.url || attachment.name}>
              <PatientIcon className="size-4 shrink-0 text-text-muted-v2" name="paperclip" />
              {attachment.url ? (
                <a className="min-w-0 truncate font-semibold text-accent-primary hover:underline" href={attachment.url} rel="noreferrer" target="_blank">
                  {attachment.name || 'Anexo cadastrado'}
                </a>
              ) : (
                <span className="min-w-0 truncate text-text-body">{attachment.name || 'Anexo cadastrado'}</span>
              )}
            </li>
          ))}
          {files.map((file, index) => (
            <li className="flex items-center justify-between gap-3 rounded-lg border border-border-default-v2 bg-surface-card px-3 py-2" key={`${file.name}-${file.size}-${index}`}>
              <span className="flex min-w-0 items-center gap-2">
                <PatientIcon className="size-4 shrink-0 text-text-muted-v2" name="paperclip" />
                <span className="min-w-0 truncate text-text-body">{file.name}</span>
              </span>
              <button
                aria-label={`Remover ${file.name}`}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-text-muted-v2 transition hover:bg-red-500/10 hover:text-red-400"
                onClick={(event) => {
                  event.stopPropagation()
                  onRemoveFile?.(index)
                }}
                type="button"
              >
                <PatientIcon className="size-3.5" name="x" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function AdvancedFilterModal({
  ageMax,
  ageMin,
  city,
  lastVisitSince,
  onApply,
  onClear,
  onClose,
  setAgeMax,
  setAgeMin,
  setCity,
  setLastVisitSince,
  setState,
  state,
  stateOptions,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border-default-v2 bg-surface-card shadow-elevated"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="metric-tone-blue flex size-9 items-center justify-center rounded-lg">
              <PatientIcon className="size-4" name="filter" />
            </div>
            <h2 className="text-base font-bold text-text-heading">Filtros avançados</h2>
          </div>
          <button
            aria-label="Fechar"
            className="inline-flex size-9 items-center justify-center rounded-md text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            onClick={onClose}
            type="button"
          >
            <PatientIcon className="size-5" name="x" />
          </button>
        </header>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DarkField label="Cidade">
              <input
                className={darkInput}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Ex.: Recife"
                value={city}
              />
            </DarkField>
            <DarkField label="Estado">
              <select className={darkInput} onChange={(event) => setState(event.target.value)} value={state}>
                <option value="">Todos</option>
                {stateOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </DarkField>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DarkField label="Idade mínima">
              <input
                className={darkInput}
                min="0"
                onChange={(event) => setAgeMin(event.target.value)}
                placeholder="0"
                type="number"
                value={ageMin}
              />
            </DarkField>
            <DarkField label="Idade máxima">
              <input
                className={darkInput}
                min="0"
                onChange={(event) => setAgeMax(event.target.value)}
                placeholder="120"
                type="number"
                value={ageMax}
              />
            </DarkField>
          </div>
          <DarkField label="Último atendimento desde">
            <input
              className={`${darkInput} [color-scheme:dark]`}
              onChange={(event) => setLastVisitSince(event.target.value)}
              type="date"
              value={lastVisitSince}
            />
          </DarkField>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-inset/40 px-6 py-4">
          <button
            className="inline-flex h-10 items-center rounded-md border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            onClick={onClear}
            type="button"
          >
            Limpar
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-accent-primary px-4 text-sm font-bold text-white shadow-card transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            onClick={onApply}
            type="button"
          >
            <PatientIcon className="size-4" name="filter" />
            Aplicar filtros
          </button>
        </footer>
      </div>
    </div>
  )
}

function PatientIcon({ className = 'size-4', name }) {
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

  if (name === 'user-plus') {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6M22 11h-6" />
      </svg>
    )
  }

  if (name === 'filter') {
    return (
      <svg {...common}>
        <path d="M3 5h18M7 12h10M10 19h4" />
      </svg>
    )
  }

  if (name === 'star') {
    return (
      <svg {...common}>
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
      </svg>
    )
  }

  if (name === 'calendar') {
    return (
      <svg {...common}>
        <path d="M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      </svg>
    )
  }

  if (name === 'file') {
    return (
      <svg {...common}>
        <path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </svg>
    )
  }

  if (name === 'more') {
    return (
      <svg {...common}>
        <circle cx="5" cy="12" fill="currentColor" r="1.5" stroke="none" />
        <circle cx="12" cy="12" fill="currentColor" r="1.5" stroke="none" />
        <circle cx="19" cy="12" fill="currentColor" r="1.5" stroke="none" />
      </svg>
    )
  }

  if (name === 'edit') {
    return (
      <svg {...common}>
        <path d="m16 3 5 5L8 21H3v-5L16 3Z" />
      </svg>
    )
  }

  if (name === 'trash') {
    return (
      <svg {...common}>
        <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6" />
      </svg>
    )
  }

  if (name === 'chevron-left') {
    return (
      <svg {...common}>
        <path d="m15 18-6-6 6-6" />
      </svg>
    )
  }

  if (name === 'chevron-right') {
    return (
      <svg {...common}>
        <path d="m9 18 6-6-6-6" />
      </svg>
    )
  }

  if (name === 'chevron-up') {
    return (
      <svg {...common}>
        <path d="m18 15-6-6-6 6" />
      </svg>
    )
  }

  if (name === 'arrow-left') {
    return (
      <svg {...common}>
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    )
  }

  if (name === 'x') {
    return (
      <svg {...common}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    )
  }

  if (name === 'upload') {
    return (
      <svg {...common}>
        <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
      </svg>
    )
  }

  if (name === 'paperclip') {
    return (
      <svg {...common}>
        <path d="m21 12-8.5 8.5a5 5 0 0 1-7.1-7.1L14 4.8a3 3 0 0 1 4.2 4.2l-8.5 8.5a1 1 0 0 1-1.4-1.4L16 8.4" />
      </svg>
    )
  }

  if (name === 'user') {
    return (
      <svg {...common}>
        <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
      </svg>
    )
  }

  if (name === 'trending') {
    return (
      <svg {...common}>
        <path d="m3 17 6-6 4 4 7-8" />
        <path d="M14 7h6v6" />
      </svg>
    )
  }

  if (name === 'alert') {
    return (
      <svg {...common}>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 4.3 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      </svg>
    )
  }

  if (name === 'shield') {
    return (
      <svg {...common}>
        <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z" />
      </svg>
    )
  }

  if (name === 'heart') {
    return (
      <svg {...common}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    )
  }

  if (name === 'phone') {
    return (
      <svg {...common}>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72a2 2 0 0 1 1.72 2.01z" />
      </svg>
    )
  }

  if (name === 'map-pin') {
    return (
      <svg {...common}>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    )
  }

  if (name === 'chevron-down') {
    return (
      <svg {...common}>
        <path d="m6 9 6 6 6-6" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

async function buildPatientRows() {
  return patientRepository.getDirectoryRows()
}

function normalizeCreatedPatient(payload) {
  if (Array.isArray(payload)) return payload[0] || null
  return payload?.patient || payload?.data || payload?.created || payload || null
}

function uniqueSlug(value, existingIds) {
  const base = slugify(value) || `paciente-${Date.now()}`
  let nextId = base
  let counter = 2

  while (existingIds.includes(nextId)) {
    nextId = `${base}-${counter}`
    counter += 1
  }

  return nextId
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function calculateBmi(weight, height) {
  const normalizedWeight = Number(String(weight || '').replace(',', '.'))
  let normalizedHeight = Number(String(height || '').replace(',', '.'))

  if (!normalizedWeight || !normalizedHeight) return ''
  if (normalizedHeight > 3) normalizedHeight /= 100

  const bmi = normalizedWeight / (normalizedHeight * normalizedHeight)
  if (!Number.isFinite(bmi)) return ''

  return bmi.toFixed(1)
}

function formatHeightField(value) {
  if (value === undefined || value === null || value === '') return ''
  const normalizedNumber = Number(String(value).replace(',', '.'))
  if (Number.isFinite(normalizedNumber) && normalizedNumber > 0 && normalizedNumber <= 3) {
    return normalizedNumber.toFixed(2).replace('.', ',')
  }
  return maskHeight(value)
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

function isMinorPatientRecord(patient) {
  const birthDate = patient?.birthDate || patient?.birth_date
  const rawAge = patient?.age ?? patient?.idade
  const hasAge = rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== ''

  if (hasAge) {
    const age = Number(rawAge)
    if (Number.isFinite(age)) return age < 18 && (age > 0 || Boolean(birthDate))
  }

  const ageFromBirthDate = calculateAgeFromBirthDate(birthDate)
  return Number.isFinite(ageFromBirthDate) && ageFromBirthDate < 18
}

function calculateAgeFromBirthDate(value) {
  if (!value) return NaN

  const birthDate = parseBirthDate(value)
  if (Number.isNaN(birthDate.getTime())) return NaN

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const currentMonth = today.getMonth()
  const birthMonth = birthDate.getMonth()

  if (currentMonth < birthMonth || (currentMonth === birthMonth && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

function parseBirthDate(value) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  }

  return new Date(value)
}

function isMinorOnlyPatientInfoLabel(label) {
  const looseLabel = String(label || '').toLowerCase()
  if (looseLabel.includes('respons')) return true
  if (looseLabel.includes('profiss') && (looseLabel.includes('pai') || looseLabel.includes('m'))) return true

  const normalized = normalizeFilterValue(label)
  return [
    'profissao da mae',
    'profissao do pai',
    'responsavel',
    'cpf do responsavel',
  ].includes(normalized)
}

function withCurrentOption(options, currentValue) {
  const normalizedCurrent = String(currentValue || '').trim()
  if (!normalizedCurrent || options.includes(normalizedCurrent)) return options
  return [normalizedCurrent, ...options]
}

function formatAddress(patient) {
  return [
    patient.addressStreet,
    patient.addressNumber,
    patient.addressComplement,
    patient.city,
    patient.state,
    patient.zipCode,
  ]
    .filter(Boolean)
    .join(', ')
}
