import { useCallback, useEffect, useMemo, useState } from 'react'

import { normalizeRole } from '../config/permissions.js'
import { StethoscopeIcon } from '../components/Brand.jsx'
import { RichTextEditor } from '../components/RichTextEditor.jsx'
import { DarkField, appCardClass as cardClass, appInputClass as inputClass, appLabelClass as labelClass } from '../components/ui.jsx'
import { reportTemplates } from '../data/reportTemplates.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { reportRepository } from '../repositories/reportRepository.js'

const ITEMS_PER_PAGE = 25

const statusConfig = {
  draft: {
    label: 'Rascunho',
    pill: 'bg-amber-500/20 text-amber-400',
    stat: 'text-amber-400',
  },
  finalized: {
    label: 'Finalizado',
    pill: 'bg-emerald-500/20 text-emerald-400',
    stat: 'text-emerald-400',
  },
}

const orderOptions = [
  { label: 'Criação mais recente', value: 'created_at.desc' },
  { label: 'Criação mais antiga', value: 'created_at.asc' },
  { label: 'Prazo mais proximo', value: 'due_at.asc' },
  { label: 'Prazo mais distante', value: 'due_at.desc' },
]

const emptyEditor = {
  id: null,
  orderNumber: '',
  patientId: '',
  status: 'draft',
  exam: '',
  requestedBy: '',
  cidCode: '',
  diagnosis: '',
  conclusion: '',
  contentHtml: '',
  contentJson: undefined,
  dueAt: '',
}

export function ReportsPage({ role }) {
  const [reports, setReports] = useState([])
  const [patients, setPatients] = useState([])
  const [professionals, setProfessionals] = useState([])
  const [viewerProfile, setViewerProfile] = useState(null)
  const [currentProfessional, setCurrentProfessional] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scopeLoading, setScopeLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isDoctorRole = normalizeRole(role) === 'medico'

  const [filterPatientId, setFilterPatientId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCreatedBy, setFilterCreatedBy] = useState('')
  const [filterOrder, setFilterOrder] = useState('created_at.desc')

  const [editorOpen, setEditorOpen] = useState(false)
  const [viewerReport, setViewerReport] = useState(null)
  const [editor, setEditor] = useState(emptyEditor)
  const [page, setPage] = useState(1)

  const patientOptions = useMemo(
    () =>
      patients.map((patient) => ({
        id: String(patient.id || ''),
        name: patient.name || patient.full_name || patient.nome || 'Paciente',
      })),
    [patients],
  )

  const professionalOptions = useMemo(() => {
    const seen = new Set()

    return professionals
      .map((professional) => {
        const createdByValue = String(professional.userId || professional.id || '')
        return {
          id: String(professional.id || ''),
          createdByValue,
          name: professional.name || 'Médico(a)',
        }
      })
      .filter((professional) => {
        if (!professional.createdByValue || seen.has(professional.createdByValue)) {
          return false
        }

        seen.add(professional.createdByValue)
        return true
      })
  }, [professionals])

  const patientNameById = useMemo(
    () => Object.fromEntries(patientOptions.map((patient) => [patient.id, patient.name])),
    [patientOptions],
  )

  const professionalNameByCreatedBy = useMemo(
    () => Object.fromEntries(professionalOptions.map((professional) => [professional.createdByValue, professional.name])),
    [professionalOptions],
  )

  const enrichedReports = useMemo(
    () =>
      reports.map((report) => ({
        ...report,
        patientName: patientNameById[String(report.patientId || '')] || 'Paciente não encontrado',
        createdByName: professionalNameByCreatedBy[String(report.createdBy || '')] || report.createdBy || 'Sistema',
      })),
    [patientNameById, professionalNameByCreatedBy, reports],
  )

  const stats = useMemo(
    () => [
      { label: 'Total', value: enrichedReports.length, className: 'text-[#e5e5e5]' },
      {
        label: 'Rascunhos',
        value: enrichedReports.filter((report) => report.status === 'draft').length,
        className: statusConfig.draft.stat,
      },
      {
        label: 'Finalizados',
        value: enrichedReports.filter((report) => report.status === 'finalized').length,
        className: statusConfig.finalized.stat,
      },
    ],
    [enrichedReports],
  )

  const totalPages = Math.max(1, Math.ceil(enrichedReports.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedReports = enrichedReports.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const loadReports = useCallback(async () => {
    if (scopeLoading) return

    setLoading(true)
    setError('')

    try {
      const doctorPatientIds = isDoctorRole
        ? patientOptions.map((patient) => patient.id).filter(Boolean)
        : []
      const createdByValues = isDoctorRole
        ? uniqueValues([
            viewerProfile?.id,
            viewerProfile?.doctorId,
            currentProfessional?.userId,
            currentProfessional?.id,
          ])
        : []

      const data = await reportRepository.getInitialReports({
        patientId: filterPatientId || undefined,
        patientIds: !filterPatientId && doctorPatientIds.length ? doctorPatientIds : undefined,
        status: filterStatus || undefined,
        createdBy: !isDoctorRole ? filterCreatedBy || undefined : undefined,
        createdByValues: isDoctorRole && !doctorPatientIds.length ? createdByValues : undefined,
        order: filterOrder,
      })

      setReports(data)
      setPage(1)
    } catch (loadError) {
      console.error(loadError)
      setError(loadError.message || 'Erro ao carregar relatórios.')
      setReports([])
      setPage(1)
    } finally {
      setLoading(false)
    }
  }, [currentProfessional, filterCreatedBy, filterOrder, filterPatientId, filterStatus, isDoctorRole, patientOptions, scopeLoading, viewerProfile])

  useEffect(() => {
    let active = true

    async function loadAuxiliaryData() {
      setScopeLoading(true)

      try {
        const [professionalData, currentProfile] = await Promise.all([
          professionalRepository.getAll(),
          profileRepository.getCurrentUserProfile(),
        ])

        if (!active) return

        const resolvedProfessional = professionalRepository.resolveCurrentProfessional(currentProfile, professionalData || [])
        const patientData = isDoctorRole && resolvedProfessional?.id
          ? await patientRepository.getDirectoryRows({ doctorId: resolvedProfessional.id })
          : await patientRepository.getAll()

        if (!active) return

        setViewerProfile(currentProfile)
        setCurrentProfessional(resolvedProfessional)
        setPatients(patientData || [])
        setProfessionals(professionalData || [])
      } catch (loadError) {
        if (!active) return
        console.error(loadError)
        setError(loadError.message || 'Erro ao carregar dados auxiliares.')
      } finally {
        if (active) setScopeLoading(false)
      }
    }

    loadAuxiliaryData()

    return () => {
      active = false
    }
  }, [isDoctorRole])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  function openNew() {
    setEditor({
      ...emptyEditor,
      patientId: patientOptions[0]?.id || '',
      requestedBy: isDoctorRole ? currentProfessional?.name || viewerProfile?.name || '' : '',
    })
    setEditorOpen(true)
  }

  function openEdit(report) {
    setEditor({
      id: report.id,
      orderNumber: report.orderNumber,
      patientId: String(report.patientId || ''),
      status: report.status,
      exam: report.exam,
      requestedBy: report.requestedBy,
      cidCode: report.cidCode,
      diagnosis: report.diagnosis,
      conclusion: report.conclusion,
      contentHtml: report.contentHtml,
      contentJson: report.contentJson,
      dueAt: toDateTimeLocal(report.dueAt),
    })
    setEditorOpen(true)
  }

  async function handleSave() {
    if (!isReportEditorValid(editor)) {
      alert('Preencha todos os campos obrigatórios antes de salvar o relatório.')
      return
    }

    setSaving(true)

    const plainContent = stripHtml(editor.contentHtml)
    const fallbackAuthor =
      currentProfessional?.name ||
      viewerProfile?.name ||
      viewerProfile?.email ||
      'Profissional MediConnect'

    const payload = {
      orderNumber: editor.id ? editor.orderNumber : `REL-${Date.now()}`,
      patientId: editor.patientId || patientOptions[0]?.id || '',
      status: editor.status,
      exam: editor.exam || 'Relatório médico',
      requestedBy: editor.requestedBy || fallbackAuthor,
      cidCode: editor.cidCode || 'Z00.0',
      diagnosis: editor.diagnosis || plainContent.slice(0, 240) || 'Relatório médico registrado em prontuário.',
      conclusion: editor.conclusion || plainContent.slice(0, 240) || 'Relatório médico salvo no sistema.',
      contentHtml: editor.contentHtml,
      contentJson: editor.contentJson,
      dueAt: editor.dueAt ? new Date(editor.dueAt).toISOString() : new Date().toISOString(),
      createdBy: editor.id ? undefined : viewerProfile?.id || currentProfessional?.userId || currentProfessional?.id || undefined,
      updatedBy: viewerProfile?.id || currentProfessional?.userId || currentProfessional?.id || undefined,
    }

    try {
      if (editor.id) {
        await reportRepository.update(editor.id, payload)
      } else {
        await reportRepository.create(payload)
      }

      setEditorOpen(false)
      await loadReports()
    } catch (saveError) {
      alert(saveError.message || 'Erro ao salvar relatório.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-[#e5e5e5]">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#e5e5e5]">Relatórios</h1>
          <p className="mt-1 text-sm text-[#a3a3a3]">Consulta, criação e edição de relatórios.</p>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#3b82f6] px-4 text-sm font-medium text-white transition hover:bg-[#2563eb]"
          onClick={openNew}
          type="button"
        >
          <ReportIcon name="plus" />
          Novo relatório
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div className={cardClass} key={stat.label}>
            <div className="p-4">
              <p className="text-xs font-semibold text-[#a3a3a3]">{stat.label}</p>
              <p className={`mt-1 text-2xl font-bold ${stat.className}`}>{stat.value}</p>
            </div>
          </div>
        ))}
      </section>

      <section className={`${cardClass} p-6`}>
        <div className="mb-6 grid gap-4 lg:grid-cols-4">
          <FilterField label="Paciente">
            <select
              className={inputClass}
              onChange={(event) => {
                setFilterPatientId(event.target.value)
                setPage(1)
              }}
              value={filterPatientId}
            >
              <option value="">Todos os pacientes</option>
              {patientOptions.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Status">
            <select
              className={inputClass}
              onChange={(event) => {
                setFilterStatus(event.target.value)
                setPage(1)
              }}
              value={filterStatus}
            >
              <option value="">Todos os status</option>
              <option value="draft">Rascunho</option>
              <option value="finalized">Finalizado</option>
            </select>
          </FilterField>

          <FilterField label="Criado por">
            <select
              className={inputClass}
              onChange={(event) => {
                setFilterCreatedBy(event.target.value)
                setPage(1)
              }}
              value={filterCreatedBy}
            >
              <option value="">Todos os autores</option>
              {professionalOptions.map((professional) => (
                <option key={professional.createdByValue} value={professional.createdByValue}>
                  {professional.name}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Ordenação">
            <select
              className={inputClass}
              onChange={(event) => {
                setFilterOrder(event.target.value)
                setPage(1)
              }}
              value={filterOrder}
            >
              {orderOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-[#7f1d1d] bg-[#2a1111] px-4 py-3 text-sm text-[#fecaca]">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-[#404040]">
          <table className="w-full min-w-full table-fixed text-left text-sm">
            <thead className="bg-[#171717] text-xs font-semibold uppercase text-[#a3a3a3]">
              <tr>
                <th className="w-[12%] px-4 py-3">Numero</th>
                <th className="w-[20%] px-4 py-3">Exame</th>
                <th className="w-[18%] px-4 py-3">Paciente</th>
                <th className="w-[18%] px-4 py-3">Solicitante</th>
                <th className="w-[14%] px-4 py-3">Criado em</th>
                <th className="w-[10%] px-4 py-3">Status</th>
                <th className="sticky right-0 w-[8.5rem] bg-[#171717] px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#404040] bg-[#262626]">
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-[#a3a3a3]" colSpan={7}>
                    Carregando relatórios...
                  </td>
                </tr>
              ) : paginatedReports.length ? (
                paginatedReports.map((report) => (
                  <ReportRow
                    key={report.id}
                    onEdit={() => openEdit(report)}
                    onView={() => setViewerReport(report)}
                    report={report}
                  />
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-[#a3a3a3]" colSpan={7}>
                    Nenhum relatório encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-4 border-t border-[#404040] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#a3a3a3]">
            Mostrando {enrichedReports.length ? startIndex + 1 : 0}-{Math.min(startIndex + ITEMS_PER_PAGE, enrichedReports.length)} de{' '}
            {enrichedReports.length} relatórios
          </p>
          <div className="flex items-center gap-2">
            <PageButton disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
              <ReportIcon className="size-4" name="chevron-left" />
            </PageButton>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                className={`grid size-8 place-items-center rounded-lg text-xs font-medium transition ${
                  pageNumber === currentPage
                    ? 'bg-[#3b82f6] text-white'
                    : 'border border-[#404040] bg-[#1a1a1a] text-[#a3a3a3] hover:bg-[#333333]'
                }`}
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
                type="button"
              >
                {pageNumber}
              </button>
            ))}
            <PageButton disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
              <ReportIcon className="size-4" name="chevron-right" />
            </PageButton>
          </div>
        </div>
      </section>

      {editorOpen ? (
        <ReportEditorModalV3
          currentProfessional={currentProfessional}
          editor={editor}
          isDoctorRole={isDoctorRole}
          onChange={setEditor}
          onClose={() => setEditorOpen(false)}
          onSave={handleSave}
          patientOptions={patientOptions}
          professionalOptions={professionalOptions}
          saving={saving}
          viewerProfile={viewerProfile}
        />
      ) : null}

      {viewerReport ? (
        <ReportViewModal onClose={() => setViewerReport(null)} report={viewerReport} />
      ) : null}
    </div>
  )
}

function ReportRow({ onEdit, onView, report }) {
  const currentStatus = statusConfig[report.status] || statusConfig.draft

  return (
    <tr className="transition hover:bg-[#303030]">
      <td className="px-4 py-3 align-top text-[#a3a3a3]">{report.orderNumber || '-'}</td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          <ReportIcon className="mt-0.5 size-4 shrink-0 text-[#3b82f6]" name="file" />
          <span className="whitespace-normal break-words font-medium text-[#e5e5e5]">{report.exam || 'Sem exame'}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top whitespace-normal break-words text-[#e5e5e5]">{report.patientName}</td>
      <td className="px-4 py-3 align-top whitespace-normal break-words text-[#a3a3a3]">{report.requestedBy || '-'}</td>
      <td className="px-4 py-3 align-top text-[#a3a3a3]">{formatDate(report.createdAt)}</td>
      <td className="px-4 py-3 align-top">
        <span className={`rounded px-2 py-1 text-[10px] font-bold ${currentStatus.pill}`}>
          {currentStatus.label}
        </span>
      </td>
      <td className="sticky right-0 bg-[#262626] px-4 py-3 text-right shadow-[-10px_0_12px_-12px_rgba(0,0,0,0.75)]">
        <div className="flex justify-end gap-2">
          <IconButton label="Visualizar" name="eye" onClick={onView} />
          <IconButton label="Editar" name="edit" onClick={onEdit} />
        </div>
      </td>
    </tr>
  )
}

function ReportEditorModalV3({
  currentProfessional,
  editor,
  isDoctorRole,
  onChange,
  onClose,
  onSave,
  patientOptions,
  professionalOptions,
  saving,
  viewerProfile,
}) {
  const selectedPatient = patientOptions.find((patient) => String(patient.id) === String(editor.patientId))
  const doctorRequesterName = currentProfessional?.name || viewerProfile?.name || ''
  const [patientSearch, setPatientSearch] = useState(selectedPatient?.name || '')
  const [requesterSearch, setRequesterSearch] = useState(editor.requestedBy || doctorRequesterName)
  const [templateSearch, setTemplateSearch] = useState('')
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const isValid = isReportEditorValid(editor)
  const filteredPatients = patientOptions.filter((patient) => {
    const query = normalizeSearch(patientSearch)
    return query && normalizeSearch(patient.name).includes(query)
  })
  const filteredProfessionals = professionalOptions.filter((professional) => {
    const query = normalizeSearch(requesterSearch)
    return query && normalizeSearch(professional.name).includes(query)
  })
  const filteredTemplates = reportTemplates.filter((template) => {
    const query = normalizeSearch(templateSearch)
    const matchesSearch = !query || normalizeSearch([template.title, template.description, template.tags.join(' ')].join(' ')).includes(query)
    return matchesSearch
  })

  function updateField(field, value) {
    onChange((current) => ({ ...current, [field]: value }))
  }

  useEffect(() => {
    if (isDoctorRole && doctorRequesterName && !editor.requestedBy) {
      onChange((current) => ({ ...current, requestedBy: doctorRequesterName }))
    }
  }, [doctorRequesterName, editor.requestedBy, isDoctorRole, onChange])

  function selectPatient(patient) {
    setPatientSearch(patient.name)
    updateField('patientId', patient.id)
  }

  function selectRequester(professional) {
    setRequesterSearch(professional.name)
    updateField('requestedBy', professional.name)
  }

  function applyTemplate(template) {
    setTemplatesOpen(false)
    onChange((current) => ({
      ...current,
      exam: current.exam || template.exam,
      cidCode: current.cidCode || template.cidCode,
      diagnosis: current.diagnosis || template.diagnosis,
      conclusion: current.conclusion || template.conclusion,
      contentHtml: current.contentHtml ? `${current.contentHtml}<hr>${template.contentHtml}` : template.contentHtml,
      contentJson: {
        templateId: template.id,
        templateTitle: template.title,
        appliedAt: new Date().toISOString(),
      },
    }))
  }

  return (
    <div className="report-editor-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div
        className="report-editor-shell flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#404040] bg-[#242424] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="report-editor-header flex items-center justify-between border-b border-[#404040] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-sm bg-[#3b82f6] text-white">
              <StethoscopeIcon className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-[#f5f5f5]">{editor.id ? 'Editar relatório' : 'Novo relatório'}</h2>
              <p className="text-xs text-[#a3a3a3]">Escolha um template opcional e edite o conteúdo do relatório.</p>
            </div>
          </div>
          <button className="grid size-9 place-items-center rounded-sm text-[#a3a3a3] transition hover:bg-[#303030] hover:text-[#e5e5e5]" onClick={onClose} type="button">
            <ReportIcon className="size-4" name="x" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1">
          <main className="report-editor-body min-h-0 overflow-y-auto p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <DarkField label="Status *">
                <select className={`${inputClass} md:w-52`} onChange={(event) => updateField('status', event.target.value)} value={editor.status}>
                  <option value="draft">Rascunho</option>
                  <option value="finalized">Finalizado</option>
                </select>
              </DarkField>

              <div className="relative">
                <button
                  className="report-template-trigger inline-flex h-10 items-center gap-2 rounded-sm border border-[#404040] bg-[#171717] px-4 text-sm font-semibold text-[#e5e5e5] transition hover:bg-[#303030]"
                  onClick={() => setTemplatesOpen((current) => !current)}
                  type="button"
                >
                  <ReportIcon className="size-4" name="file" />
                  Templates
                  <ReportIcon className="size-4" name="chevron-right" />
                </button>

                {templatesOpen ? (
                  <div className="report-template-menu absolute right-0 top-12 z-10 w-[min(28rem,calc(100vw-2rem))] rounded-md border border-[#404040] bg-[#202020] p-3 shadow-2xl">
                    <div className="relative mb-3">
                      <ReportIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#a3a3a3]" name="search" />
                      <input
                        className="h-10 w-full rounded-sm border border-[#404040] bg-[#171717] pl-10 pr-3 text-sm text-[#e5e5e5] outline-none transition placeholder:text-[#a3a3a3] focus:border-[#3b82f6]"
                        onChange={(event) => setTemplateSearch(event.target.value)}
                        placeholder="Buscar templates..."
                        value={templateSearch}
                      />
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {filteredTemplates.length ? (
                        filteredTemplates.map((template) => (
                          <button
                            className="block w-full rounded-sm border border-transparent px-3 py-3 text-left transition hover:border-[#3b82f6]/40 hover:bg-[#303030]"
                            key={template.id}
                            onClick={() => applyTemplate(template)}
                            type="button"
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-[#f5f5f5]">{template.title}</span>
                              {template.popular ? <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">Popular</span> : null}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-[#a3a3a3]">{template.description}</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-4 text-sm text-[#a3a3a3]">Nenhum template encontrado.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mb-5 grid gap-4 md:grid-cols-2">
              <DarkField label="Paciente *">
                <div className="relative">
                  <input
                    className={inputClass}
                    onChange={(event) => {
                      setPatientSearch(event.target.value)
                      updateField('patientId', '')
                    }}
                    placeholder="Digite o nome do paciente"
                    type="search"
                    value={patientSearch}
                  />
                  {patientSearch && !editor.patientId ? (
                    <SearchMenu
                      emptyText="Nenhum paciente encontrado."
                      items={filteredPatients.slice(0, 6)}
                      onSelect={selectPatient}
                    />
                  ) : null}
                </div>
              </DarkField>

              <DarkField label="Solicitante *">
                <div className="relative">
                  <input
                    className={inputClass}
                    disabled={isDoctorRole}
                    onChange={(event) => {
                      if (isDoctorRole) return
                      setRequesterSearch(event.target.value)
                      updateField('requestedBy', event.target.value)
                    }}
                    placeholder="Digite o nome do médico solicitante"
                    readOnly={isDoctorRole}
                    type="search"
                    value={isDoctorRole ? doctorRequesterName : requesterSearch}
                  />
                  {!isDoctorRole && requesterSearch ? (
                    <SearchMenu
                      emptyText="Nenhum médico encontrado."
                      items={filteredProfessionals.slice(0, 6)}
                      onSelect={selectRequester}
                    />
                  ) : null}
                </div>
              </DarkField>

              <DarkField label="Exame *">
                <input className={inputClass} onChange={(event) => updateField('exam', event.target.value)} value={editor.exam} />
              </DarkField>

              <DarkField label="CID-10 *">
                <input className={inputClass} onChange={(event) => updateField('cidCode', event.target.value)} value={editor.cidCode} />
              </DarkField>

              <DarkField label="Diagnóstico *">
                <input className={inputClass} onChange={(event) => updateField('diagnosis', event.target.value)} value={editor.diagnosis} />
              </DarkField>

              <DarkField label="Conclusão *">
                <input className={inputClass} onChange={(event) => updateField('conclusion', event.target.value)} value={editor.conclusion} />
              </DarkField>
            </div>

            <DarkField label="Editor de texto">
              <RichTextEditor
                onChange={(value) => updateField('contentHtml', value)}
                value={editor.contentHtml}
              />
            </DarkField>
          </main>
        </div>

        <div className="report-editor-footer flex flex-wrap items-center justify-between gap-3 border-t border-[#404040] px-6 py-4">
          <p className="text-xs font-semibold text-amber-300">
            {!isValid ? '* Preencha o editor de texto para salvar.' : 'Relatório pronto para salvar.'}
          </p>
          <div className="flex gap-3">
            <button className="rounded-sm border border-[#404040] bg-[#262626] px-4 py-2 text-sm font-semibold text-[#e5e5e5] transition hover:bg-[#303030]" onClick={onClose} type="button">
              Cancelar
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-sm border border-[#3b82f6] bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:border-[#404040] disabled:bg-[#303030] disabled:text-[#737373]"
              disabled={!isValid || saving}
              onClick={onSave}
              type="button"
            >
              <ReportIcon className="size-3.5" name="save" />
              {saving ? 'Salvando...' : editor.status === 'finalized' ? 'Liberar relatório' : 'Salvar rascunho'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function sanitizePreviewHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
}

function ReportViewModal({ onClose, report }) {
  const currentStatus = statusConfig[report.status] || statusConfig.draft

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-[#404040] bg-[#262626] shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#404040] px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#e5e5e5]">Relatório</h2>
            <p className="mt-1 text-xs text-[#a3a3a3]">{report.orderNumber || 'Sem número'} </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 text-xs font-semibold text-[#e5e5e5] transition hover:bg-[#2a2a2a]"
              onClick={() => printReportAsPdf(report, currentStatus)}
              type="button"
            >
              <ReportIcon className="size-4" name="print" />
              Imprimir PDF
            </button>
            <button className="rounded-lg p-1.5 transition hover:bg-[#2a2a2a]" onClick={onClose} type="button">
              <ReportIcon className="size-4 text-[#a3a3a3]" name="x" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailCard label="Paciente" value={report.patientName} />
            <DetailCard label="Solicitante" value={report.requestedBy || '-'} />
            <DetailCard label="Criado em" value={formatDate(report.createdAt)} />
            <DetailCard label="Criado por" value={report.createdByName} />
            <DetailCard label="Status" value={currentStatus.label} />
            <DetailCard label="Prazo" value={formatDateTime(report.dueAt)} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <DetailBlock label="Exame" value={report.exam || '-'} />
            <DetailBlock label="CID-10" value={report.cidCode || '-'} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <DetailBlock label="Diagnóstico" value={report.diagnosis || '-'} />
            <DetailBlock label="Conclusão" value={report.conclusion || '-'} />
          </div>
          <div className="mt-6 rounded-xl border border-[#404040] bg-[#1a1a1a] p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#a3a3a3]">Relatório</p>
            {report.contentHtml ? (
              <div
                className="whitespace-pre-wrap text-sm leading-6 text-[#e5e5e5]"
                dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(report.contentHtml) }}
              />
            ) : (
              <p className="text-sm text-[#a3a3a3]">Nenhum complemento informado.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterField({ children, label }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}

function SearchMenu({ emptyText, items, onSelect }) {
  return (
    <div className="absolute left-0 right-0 top-11 z-20 max-h-56 overflow-y-auto rounded-md border border-[#404040] bg-[#202020] shadow-2xl">
      {items.length ? (
        items.map((item) => (
          <button
            className="block w-full px-3 py-2 text-left text-sm font-semibold text-[#e5e5e5] transition hover:bg-[#303030]"
            key={item.id || item.name}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(item)}
            type="button"
          >
            {item.name}
          </button>
        ))
      ) : (
        <p className="px-3 py-2 text-xs text-[#737373]">{emptyText}</p>
      )}
    </div>
  )
}

function DetailCard({ label, value }) {
  return (
    <div className="rounded-xl border border-[#404040] bg-[#1a1a1a] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#a3a3a3]">{label}</p>
      <p className="mt-2 text-sm text-[#e5e5e5]">{value}</p>
    </div>
  )
}

function DetailBlock({ label, value }) {
  return (
    <div className="rounded-xl border border-[#404040] bg-[#1a1a1a] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#a3a3a3]">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#e5e5e5]">{value}</p>
    </div>
  )
}

function IconButton({ label, name, onClick }) {
  return (
    <button
      aria-label={label}
      className="grid size-9 place-items-center rounded-lg border border-[#404040] bg-[#1a1a1a] text-[#a3a3a3] transition hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
      onClick={onClick}
      title={label}
      type="button"
    >
      <ReportIcon className="size-4" name={name} />
    </button>
  )
}

function PageButton({ children, disabled, onClick }) {
  return (
    <button
      className="grid size-8 place-items-center rounded-lg border border-[#404040] bg-[#1a1a1a] text-[#e5e5e5] transition hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-30"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function formatDate(value) {
  if (!value) return '-'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'

  return parsed.toLocaleDateString('pt-BR')
}

function formatDateTime(value) {
  if (!value) return '-'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'

  return parsed.toLocaleString('pt-BR')
}

function toDateTimeLocal(value) {
  if (!value) return ''

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function isReportEditorValid(editor) {
  return [
    editor.patientId,
    editor.requestedBy,
    editor.exam,
    editor.cidCode,
    editor.diagnosis,
    editor.conclusion,
    editor.status,
    stripHtml(editor.contentHtml),
  ].every((value) => String(value || '').trim())
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function printReportAsPdf(report, status) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100')

  if (!printWindow) {
    window.print()
    return
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Relatório ${escapeHtml(report.orderNumber || '')}</title>
        <style>
          * { box-sizing: border-box; }
          body { color: #171717; font-family: Arial, sans-serif; margin: 40px; }
          h1 { font-size: 24px; margin: 0 0 4px; }
          .muted { color: #525252; font-size: 12px; }
          .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 24px; }
          .box { border: 1px solid #d4d4d4; border-radius: 8px; padding: 12px; }
          .label { color: #525252; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
          .value { font-size: 13px; margin-top: 6px; white-space: pre-wrap; }
          .section { margin-top: 20px; }
          @media print { body { margin: 24mm; } button { display: none; } }
        </style>
      </head>
      <body>
        <h1>Relatório</h1>
        <p class="muted">${escapeHtml(report.orderNumber || 'Sem número')}</p>
        <div class="grid">
          ${printDetail('Paciente', report.patientName)}
          ${printDetail('Solicitante', report.requestedBy || '-')}
          ${printDetail('Criado em', formatDate(report.createdAt))}
          ${printDetail('Criado por', report.createdByName)}
          ${printDetail('Status', status.label)}
          ${printDetail('Prazo', formatDateTime(report.dueAt))}
        </div>
        <div class="grid">
          ${printDetail('Exame', report.exam || '-')}
          ${printDetail('CID-10', report.cidCode || '-')}
        </div>
        <div class="section box">
          <p class="label">Diagnóstico</p>
          <p class="value">${escapeHtml(report.diagnosis || '-')}</p>
        </div>
        <div class="section box">
          <p class="label">Conclusão</p>
          <p class="value">${escapeHtml(report.conclusion || '-')}</p>
        </div>
        <div class="section box">
          <p class="label">Relatório</p>
          <div class="value">${report.contentHtml ? sanitizePreviewHtml(report.contentHtml) : 'Nenhum complemento informado.'}</div>
        </div>
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

function printDetail(label, value) {
  return `
    <div class="box">
      <p class="label">${escapeHtml(label)}</p>
      <p class="value">${escapeHtml(value || '-')}</p>
    </div>
  `
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function ReportIcon({ className = 'size-4', name }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
  }

  if (name === 'plus') {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    )
  }

  if (name === 'bolt') {
    return (
      <svg {...common}>
        <path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" />
      </svg>
    )
  }

  if (name === 'search') {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    )
  }

  if (name === 'undo') {
    return (
      <svg {...common}>
        <path d="M9 7 5 11l4 4" />
        <path d="M5 11h9a5 5 0 0 1 5 5v1" />
      </svg>
    )
  }

  if (name === 'redo') {
    return (
      <svg {...common}>
        <path d="m15 7 4 4-4 4" />
        <path d="M19 11h-9a5 5 0 0 0-5 5v1" />
      </svg>
    )
  }

  if (name === 'bold') {
    return (
      <svg {...common}>
        <path d="M7 5h6a3 3 0 0 1 0 6H7zM7 11h7a3 3 0 0 1 0 6H7z" />
      </svg>
    )
  }

  if (name === 'italic') {
    return (
      <svg {...common}>
        <path d="M10 5h7M7 19h7M14 5l-4 14" />
      </svg>
    )
  }

  if (name === 'underline') {
    return (
      <svg {...common}>
        <path d="M7 5v6a5 5 0 0 0 10 0V5M5 21h14" />
      </svg>
    )
  }

  if (name === 'strike') {
    return (
      <svg {...common}>
        <path d="M5 12h14M8 17a5 5 0 0 0 4 2c2.8 0 5-1.4 5-3.5 0-4-9-2.5-9-7C8 6.6 9.8 5 12.5 5c1.6 0 3 .5 4 1.5" />
      </svg>
    )
  }

  if (name === 'align-left') {
    return (
      <svg {...common}>
        <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
      </svg>
    )
  }

  if (name === 'align-center') {
    return (
      <svg {...common}>
        <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
      </svg>
    )
  }

  if (name === 'align-right') {
    return (
      <svg {...common}>
        <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
      </svg>
    )
  }

  if (name === 'list') {
    return (
      <svg {...common}>
        <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
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

  if (name === 'eye') {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
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

  if (name === 'x') {
    return (
      <svg {...common}>
        <path d="M18 6 6 18M6 6l12 12" />
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

  if (name === 'save') {
    return (
      <svg {...common}>
        <path d="M5 21h14a1 1 0 0 0 1-1V7.4a1 1 0 0 0-.3-.7l-2.4-2.4a1 1 0 0 0-.7-.3H5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1Z" />
        <path d="M8 21v-6h8v6M8 4v5h7" />
      </svg>
    )
  }

  if (name === 'print') {
    return (
      <svg {...common}>
        <path d="M7 8V4h10v4" />
        <path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
        <path d="M7 14h10v7H7zM17 12h.01" />
      </svg>
    )
  }

  if (name === 'check') {
    return (
      <svg {...common}>
        <path d="m5 12 4 4L19 6" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
