import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { normalizeRole } from '../config/permissions.js'
import { StethoscopeIcon } from '../components/Brand.jsx'
import { RichTextEditor } from '../components/RichTextEditor.jsx'
import { DarkField, appCardClass as cardClass, appInputClass as inputClass, appLabelClass as labelClass, appTextareaClass as textareaClass } from '../components/ui.jsx'
import { reportTemplates } from '../data/reportTemplates.js'
import { aiClient } from '../lib/ai/aiClient.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { notificationRepository } from '../repositories/notificationRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { reportRepository } from '../repositories/reportRepository.js'
import { sanitizePlainText } from '../utils/inputSanitizers.js'
import { resolveCurrentPatient } from '../utils/patientIdentity.js'

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
  digitalSignature: '',
  importedPdfs: [],
  imageFiles: [],
  hideDate: false,
  hideSignature: false,
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
  const normalizedRole = normalizeRole(role)
  const isDoctorRole = normalizedRole === 'medico'
  const isPatientRole = normalizedRole === 'paciente'

  const [filterPatientId, setFilterPatientId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCreatedBy, setFilterCreatedBy] = useState('')
  const [filterOrder, setFilterOrder] = useState('created_at.desc')

  const [editorOpen, setEditorOpen] = useState(false)
  const [viewerReport, setViewerReport] = useState(null)
  const [versionsReport, setVersionsReport] = useState(null)
  const [protocolReport, setProtocolReport] = useState(null)
  const [editor, setEditor] = useState(emptyEditor)
  const [page, setPage] = useState(1)
  const [openReportMenuId, setOpenReportMenuId] = useState(null)
  const [reportMenuAnchor, setReportMenuAnchor] = useState(null)
  const canDeleteReports = ['admin', 'gestor'].includes(normalizedRole)
  const canManageReports = !isPatientRole

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
          name: professional.name || 'Médico',
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
      { label: 'Total', value: enrichedReports.length, className: 'text-text-body' },
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
      const currentPatientId = isPatientRole
        ? patientOptions[0]?.id || viewerProfile?.patientId || ''
        : ''
      const createdByValues = isDoctorRole
        ? uniqueValues([
            viewerProfile?.id,
            viewerProfile?.doctorId,
            currentProfessional?.userId,
            currentProfessional?.id,
          ])
        : []

      if (isPatientRole && !currentPatientId) {
        setReports([])
        setPage(1)
        return
      }

      const data = await reportRepository.getInitialReports({
        patientId: isPatientRole ? currentPatientId : filterPatientId || undefined,
        patientIds: !isPatientRole && !filterPatientId && doctorPatientIds.length ? doctorPatientIds : undefined,
        status: !isPatientRole ? filterStatus || undefined : undefined,
        createdBy: !isDoctorRole && !isPatientRole ? filterCreatedBy || undefined : undefined,
        createdByValues: isDoctorRole && !doctorPatientIds.length ? createdByValues : undefined,
        order: filterOrder,
      })

      setReports(data)
      setPage(1)
    } catch (loadError) {
      console.error(loadError)
      setError(translateErrorMessage(loadError.message, 'Erro ao carregar relatórios.'))
      setReports([])
      setPage(1)
    } finally {
      setLoading(false)
    }
  }, [currentProfessional, filterCreatedBy, filterOrder, filterPatientId, filterStatus, isDoctorRole, isPatientRole, patientOptions, scopeLoading, viewerProfile])

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
        const resolvedPatient = isPatientRole
          ? resolveCurrentPatient(currentProfile, patientData || [])
          : null

        if (!active) return

        setViewerProfile(currentProfile)
        setCurrentProfessional(resolvedProfessional)
        setPatients(isPatientRole ? (resolvedPatient ? [resolvedPatient] : []) : patientData || [])
        setProfessionals(professionalData || [])
      } catch (loadError) {
        if (!active) return
        console.error(loadError)
        setError(translateErrorMessage(loadError.message, 'Erro ao carregar dados auxiliares.'))
      } finally {
        if (active) setScopeLoading(false)
      }
    }

    loadAuxiliaryData()

    return () => {
      active = false
    }
  }, [isDoctorRole, isPatientRole])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  useEffect(() => {
    if (isPatientRole) return
    let raw = ''
    try { raw = sessionStorage.getItem('mediconnect.atendimento.draftReport') || '' } catch { return }
    if (!raw) return
    let draft = null
    try { draft = JSON.parse(raw) } catch { draft = null }
    try { sessionStorage.removeItem('mediconnect.atendimento.draftReport') } catch { /* ignora */ }
    if (!draft || typeof draft !== 'object') return

    setEditor({
      ...emptyEditor,
      patientId: String(draft.patientId || ''),
      requestedBy: isDoctorRole ? currentProfessional?.name || viewerProfile?.name || '' : '',
      digitalSignature: currentProfessional?.crm || viewerProfile?.name || '',
      exam: draft.exam || '',
      cidCode: draft.cidCode || '',
      diagnosis: draft.diagnosis || '',
      conclusion: draft.conclusion || '',
      contentHtml: draft.contentHtml || '',
    })
    setEditorOpen(true)
  }, [currentProfessional?.crm, currentProfessional?.name, isDoctorRole, isPatientRole, viewerProfile?.name])

  function openNew() {
    setEditor({
      ...emptyEditor,
      patientId: patientOptions[0]?.id || '',
      requestedBy: isDoctorRole ? currentProfessional?.name || viewerProfile?.name || '' : '',
      digitalSignature: currentProfessional?.crm || viewerProfile?.name || '',
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
      originalReport: report,
      digitalSignature: report.contentJson?.digitalSignature || '',
      importedPdfs: report.contentJson?.importedPdfs || [],
      imageFiles: report.contentJson?.imageFiles || [],
      hideDate: Boolean(report.hideDate),
      hideSignature: Boolean(report.hideSignature),
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

    const contentJson = buildReportContentJson({
      editor,
      userName: currentProfessional?.name || viewerProfile?.name || viewerProfile?.email || 'Usuário',
    })

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
      contentJson,
      hideDate: Boolean(editor.hideDate),
      hideSignature: Boolean(editor.hideSignature),
      dueAt: editor.dueAt ? new Date(editor.dueAt).toISOString() : new Date().toISOString(),
      createdBy: editor.id ? undefined : viewerProfile?.id || currentProfessional?.userId || currentProfessional?.id || undefined,
      updatedBy: viewerProfile?.id || currentProfessional?.userId || currentProfessional?.id || undefined,
    }

    try {
      if (editor.id) {
        await reportRepository.update(editor.id, payload)
        notificationRepository.notifyCurrentUser({
          domain: 'reports',
          title: 'Relatório atualizado',
          detail: `${payload.exam} de ${patientNameById[String(payload.patientId)] || 'paciente selecionado'} foi atualizado.`,
          patientId: payload.patientId,
          relatedUserIds: [payload.updatedBy, payload.createdBy, viewerProfile?.id, currentProfessional?.id, currentProfessional?.userId],
        }).catch(() => null)
      } else {
        await reportRepository.create(payload)
        notificationRepository.notifyCurrentUser({
          domain: 'reports',
          title: 'Relatório criado',
          detail: `${payload.exam} de ${patientNameById[String(payload.patientId)] || 'paciente selecionado'} foi registrado.`,
          patientId: payload.patientId,
          relatedUserIds: [payload.createdBy, payload.updatedBy, viewerProfile?.id, currentProfessional?.id, currentProfessional?.userId],
        }).catch(() => null)
      }

      setEditorOpen(false)
      await loadReports()
    } catch (saveError) {
      alert(translateErrorMessage(saveError.message, 'Erro ao salvar relatório.'))
    } finally {
      setSaving(false)
    }
  }

  async function releaseReport(report) {
    if (!window.confirm('Liberar este relatório para impressão e envio ao paciente?')) return

    try {
      await reportRepository.update(report.id, {
        contentJson: appendReportVersion(report, {
          label: 'Relatório liberado',
          user: viewerProfile?.name || viewerProfile?.email || 'Usuário',
          changes: [{ field: 'Status', from: getStatusLabel(report.status), to: 'Finalizado' }],
        }),
        status: 'finalized',
      })
      await loadReports()
    } catch (releaseError) {
      alert(translateErrorMessage(releaseError.message, 'Erro ao liberar relatório.'))
    }
  }

  async function deleteReport(report) {
    if (!canDeleteReports) {
      alert('Apenas gestor ou administrador podem excluir relatórios.')
      return
    }

    if (!window.confirm('Este relatório contém dados sensíveis. Deseja continuar?')) return
    const confirmation = window.prompt('Digite EXCLUIR para confirmar a remoção definitiva do relatório.')
    if (confirmation !== 'EXCLUIR') return

    try {
      await reportRepository.remove(report.id)
      await loadReports()
    } catch (deleteError) {
      alert(translateErrorMessage(deleteError.message, 'Erro ao excluir relatório.'))
    }
  }

  async function saveDeliveryProtocol(report, protocol) {
    const contentJson = appendReportVersion({
      ...report,
      contentJson: {
        ...(report.contentJson && typeof report.contentJson === 'object' ? report.contentJson : {}),
        deliveryProtocol: protocol,
      },
    }, {
      label: 'Protocolo de entrega registrado',
      user: viewerProfile?.name || viewerProfile?.email || 'Usuário',
      changes: [{ field: 'Protocolo de entrega', from: 'Não registrado', to: protocol.responsible || 'Registrado' }],
    })

    try {
      await reportRepository.update(report.id, { ...report, contentJson })
      setProtocolReport(null)
      await loadReports()
    } catch (protocolError) {
      alert(translateErrorMessage(protocolError.message, 'Erro ao registrar protocolo de entrega.'))
    }
  }

  function toggleReportMenu(reportId, anchor) {
    setOpenReportMenuId((currentId) => {
      if (currentId === reportId) {
        setReportMenuAnchor(null)
        return null
      }

      setReportMenuAnchor(anchor)
      return reportId
    })
  }

  function closeReportMenu() {
    setOpenReportMenuId(null)
    setReportMenuAnchor(null)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-text-body">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-[32px] font-bold leading-8 tracking-[-0.02em] text-text-body">Relatórios</h1>
          <p className="mt-1 text-sm text-text-muted-v2">
            {isPatientRole ? 'Consulta de relatórios vinculados ao seu cadastro.' : 'Consulta, criação e edição de relatórios.'}
          </p>
        </div>
        {canManageReports ? (
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-accent-hover"
            onClick={openNew}
            type="button"
          >
            <ReportIcon name="plus" />
            Novo relatório
          </button>
        ) : null}
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div className={cardClass} key={stat.label}>
            <div className="p-4">
              <p className="text-xs font-semibold text-text-muted-v2">{stat.label}</p>
              <p className={`mt-1 text-2xl font-bold ${stat.className}`}>{stat.value}</p>
            </div>
          </div>
        ))}
      </section>

      <section className={`${cardClass} p-6`}>
        {canManageReports ? (
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
        ) : null}

        {error ? (
          <div className="mb-6 rounded-xl border border-[#7f1d1d] bg-[#2a1111] px-4 py-3 text-sm text-[#fecaca]">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-border-default-v2">
          <table className="w-full min-w-full table-fixed text-left text-sm">
            <thead className="bg-surface-inset text-xs font-semibold uppercase text-text-muted-v2">
              <tr>
                <th className="w-[12%] px-4 py-3">Numero</th>
                <th className="w-[20%] px-4 py-3">Exame</th>
                <th className="w-[18%] px-4 py-3">Paciente</th>
                <th className="w-[18%] px-4 py-3">Solicitante</th>
                <th className="w-[14%] px-4 py-3">Criado em</th>
                <th className="w-[10%] px-4 py-3">Status</th>
                <th className="sticky right-0 w-[8.5rem] bg-surface-inset px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default-v2 bg-surface-card">
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-text-muted-v2" colSpan={7}>
                    Carregando relatórios...
                  </td>
                </tr>
              ) : paginatedReports.length ? (
                paginatedReports.map((report) => (
                  <ReportRow
                    key={report.id}
                    canDelete={canDeleteReports}
                    isMenuOpen={openReportMenuId === report.id}
                    menuAnchor={reportMenuAnchor}
                    onCloseMenu={closeReportMenu}
                    onDelete={() => deleteReport(report)}
                    onEdit={() => openEdit(report)}
                    onMenuToggle={toggleReportMenu}
                    onPrint={() => printReportAsPdf(report, statusConfig[report.status] || statusConfig.draft)}
                    onProtocol={() => setProtocolReport(report)}
                    onRelease={() => releaseReport(report)}
                    onVersions={() => setVersionsReport(report)}
                    onView={() => setViewerReport(report)}
                    readOnly={isPatientRole}
                    report={report}
                  />
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-text-muted-v2" colSpan={7}>
                    {isPatientRole ? 'Nenhum relatório encontrado em seu nome.' : 'Nenhum relatório encontrado com os filtros atuais.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-4 border-t border-border-default-v2 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-muted-v2">
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
                    ? 'bg-accent-primary text-white'
                    : 'border border-border-default-v2 bg-surface-inset text-text-muted-v2 hover:bg-surface-card-hover'
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

      {versionsReport ? (
        <ReportVersionsModal onClose={() => setVersionsReport(null)} report={versionsReport} />
      ) : null}

      {protocolReport ? (
        <DeliveryProtocolModal
          onClose={() => setProtocolReport(null)}
          onSave={(protocol) => saveDeliveryProtocol(protocolReport, protocol)}
          report={protocolReport}
          viewerProfile={viewerProfile}
        />
      ) : null}
    </div>
  )
}

function ReportRow({ canDelete, isMenuOpen, menuAnchor, onCloseMenu, onDelete, onEdit, onMenuToggle, onPrint, onProtocol, onRelease, onVersions, onView, readOnly = false, report }) {
  const currentStatus = statusConfig[report.status] || statusConfig.draft

  function run(action) {
    onCloseMenu()
    action?.()
  }

  function toggleMenu(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    onMenuToggle(report.id, {
      left: Math.max(16, Math.min(window.innerWidth - 240, rect.right - 224)),
      top: rect.bottom + 6,
    })
  }

  return (
    <tr className="transition hover:bg-surface-card-hover">
      <td className="px-4 py-3 align-top text-text-muted-v2">{report.orderNumber || '-'}</td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          <ReportIcon className="mt-0.5 size-4 shrink-0 text-accent-primary" name="file" />
          <span className="whitespace-normal break-words font-medium text-text-body">{report.exam || 'Sem exame'}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top whitespace-normal break-words text-text-body">{report.patientName}</td>
      <td className="px-4 py-3 align-top whitespace-normal break-words text-text-muted-v2">{report.requestedBy || '-'}</td>
      <td className="px-4 py-3 align-top text-text-muted-v2">{formatDate(report.createdAt)}</td>
      <td className="px-4 py-3 align-top">
        <span className={`rounded px-2 py-1 text-[10px] font-bold ${currentStatus.pill}`}>
          {currentStatus.label}
        </span>
      </td>
      <td className="sticky right-0 bg-surface-card px-4 py-3 text-right shadow-[-10px_0_12px_-12px_rgba(0,0,0,0.75)]">
        <div className="relative flex justify-end gap-2">
          <IconButton label="Visualizar" name="eye" onClick={onView} />
          {readOnly ? <IconButton label="Imprimir" name="print" onClick={onPrint} /> : null}
          {!readOnly ? (
          <button
            aria-label="Abrir ações do relatório"
            className={`grid size-8 place-items-center rounded-lg border transition ${
              isMenuOpen
                ? 'border-accent-primary bg-accent-primary/15 text-accent-primary'
                : 'border-border-default-v2 bg-surface-inset text-text-muted-v2 hover:bg-surface-card-hover hover:text-text-body'
            }`}
            onClick={toggleMenu}
            type="button"
          >
            <ReportIcon className="size-4" name="more" />
          </button>
          ) : null}
          {!readOnly && isMenuOpen && menuAnchor ? createPortal(
            <div
              className="report-action-menu fixed w-56 overflow-hidden rounded-lg border border-border-default-v2 bg-surface-inset py-1 text-left shadow-2xl"
              style={{ left: menuAnchor.left, top: menuAnchor.top, zIndex: 99999 }}
            >
              <ReportMenuButton onClick={() => run(onVersions)}>Controle de versões</ReportMenuButton>
              <ReportMenuButton onClick={() => run(onEdit)}>Editar</ReportMenuButton>
              <ReportMenuButton onClick={() => run(onPrint)}>Imprimir</ReportMenuButton>
              <ReportMenuButton onClick={() => run(onProtocol)}>Protocolo de entrega</ReportMenuButton>
              <ReportMenuButton disabled={report.status === 'finalized'} onClick={() => run(onRelease)}>Liberar relatório</ReportMenuButton>
              <ReportMenuButton danger disabled={!canDelete} onClick={() => run(onDelete)}>Excluir relatório</ReportMenuButton>
            </div>,
            document.body,
          ) : null}
        </div>
      </td>
    </tr>
  )
}

function ReportMenuButton({ children, danger = false, disabled = false, onClick }) {
  return (
    <button
      className={`block w-full px-3 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
        danger
          ? 'text-red-300 hover:bg-red-950/30'
          : 'text-text-body hover:bg-surface-card-hover'
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
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
  const [aiComplaint, setAiComplaint] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const isValid = isReportEditorValid(editor)
  const requesterQuery = normalizeSearch(requesterSearch)
  const selectedRequesterQuery = normalizeSearch(editor.requestedBy)
  const filteredPatients = patientOptions.filter((patient) => {
    const query = normalizeSearch(patientSearch)
    return query && normalizeSearch(patient.name).includes(query)
  })
  const filteredProfessionals = professionalOptions.filter((professional) => {
    const professionalName = normalizeSearch(professional.name)
    return requesterQuery && requesterQuery !== selectedRequesterQuery && professionalName.includes(requesterQuery)
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

  function handleRequesterSearch(value) {
    setRequesterSearch(sanitizePlainText(value))
    updateField('requestedBy', '')
  }

  function appendFiles(field, files) {
    const names = Array.from(files || []).map((file) => file.name).filter(Boolean)
    if (!names.length) return
    onChange((current) => ({ ...current, [field]: [...(current[field] || []), ...names] }))
  }

  function removeFile(field, index) {
    onChange((current) => ({
      ...current,
      [field]: (current[field] || []).filter((_, fileIndex) => fileIndex !== index),
    }))
  }

  async function handleGenerateAI() {
    if (aiLoading) return
    setAiLoading(true)
    try {
      const draft = await aiClient.generateReport({
        patientName: selectedPatient?.name || patientSearch,
        exam: editor.exam,
        complaint: aiComplaint,
        templateTitle: editor.contentJson?.templateTitle,
      })
      onChange((current) => ({
        ...current,
        exam: draft.exam || current.exam,
        cidCode: draft.cidCode || current.cidCode,
        diagnosis: draft.diagnosis || current.diagnosis,
        conclusion: draft.conclusion || current.conclusion,
        contentHtml: current.contentHtml ? `${current.contentHtml}<hr>${draft.contentHtml}` : draft.contentHtml,
      }))
    } catch {
      alert('Não foi possível gerar o rascunho com IA. Tente novamente.')
    } finally {
      setAiLoading(false)
    }
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
        className="report-editor-shell flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border-default-v2 bg-surface-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="report-editor-header flex items-center justify-between border-b border-border-default-v2 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-sm bg-accent-primary text-white">
              <StethoscopeIcon className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-text-heading">{editor.id ? 'Editar relatório' : 'Novo relatório'}</h2>
              <p className="text-xs text-text-muted-v2">Escolha um template opcional e edite o conteúdo do relatório.</p>
            </div>
          </div>
          <button className="grid size-9 place-items-center rounded-sm text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-body" onClick={onClose} type="button">
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
                  className="report-template-trigger inline-flex h-10 items-center gap-2 rounded-sm border border-border-default-v2 bg-surface-inset px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card-hover"
                  onClick={() => setTemplatesOpen((current) => !current)}
                  type="button"
                >
                  <ReportIcon className="size-4" name="file" />
                  Templates
                  <ReportIcon className="size-4" name="chevron-right" />
                </button>

                {templatesOpen ? (
                  <div className="report-template-menu absolute right-0 top-12 z-10 w-[min(28rem,calc(100vw-2rem))] rounded-md border border-border-default-v2 bg-surface-inset p-3 shadow-2xl">
                    <div className="relative mb-3">
                      <ReportIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted-v2" name="search" />
                      <input
                        className="h-10 w-full rounded-sm border border-border-default-v2 bg-surface-inset pl-10 pr-3 text-sm text-text-body outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary"
                        onChange={(event) => setTemplateSearch(event.target.value)}
                        placeholder="Buscar templates..."
                        value={templateSearch}
                      />
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {filteredTemplates.length ? (
                        filteredTemplates.map((template) => (
                          <button
                            className="block w-full rounded-sm border border-transparent px-3 py-3 text-left transition hover:border-accent-primary/40 hover:bg-surface-card-hover"
                            key={template.id}
                            onClick={() => applyTemplate(template)}
                            type="button"
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-text-heading">{template.title}</span>
                              {template.popular ? <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">Popular</span> : null}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-text-muted-v2">{template.description}</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-4 text-sm text-text-muted-v2">Nenhum template encontrado.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mb-5 rounded-xl border border-accent-primary/30 bg-accent-primary/5 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-text-heading">Assistente de IA {aiClient.isLive() ? '' : '(rascunho local)'}</p>
              </div>
              <p className="mb-3 text-xs text-text-muted-v2">Descreva a queixa/observação e gere um rascunho de exame, CID, diagnóstico e conclusão. Revise antes de salvar.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={`${inputClass} flex-1`}
                  maxLength={255}
                  onChange={(event) => setAiComplaint(sanitizePlainText(event.target.value))}
                  placeholder="Ex.: febre e dor de garganta há 3 dias"
                  value={aiComplaint}
                />
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-accent-primary px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50"
                  disabled={aiLoading}
                  onClick={handleGenerateAI}
                  type="button"
                >
                  {aiLoading ? 'Gerando...' : 'Gerar com IA'}
                </button>
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

              <DarkField label="Médico responsável *">
                <div className="relative">
                  <input
                    className={inputClass}
                    disabled={isDoctorRole}
                    onChange={(event) => {
                      if (isDoctorRole) return
                      handleRequesterSearch(event.target.value)
                    }}
                    placeholder="Digite o nome do médico solicitante"
                    readOnly={isDoctorRole}
                    type="search"
                    value={isDoctorRole ? doctorRequesterName : requesterSearch}
                  />
                  {!isDoctorRole && requesterQuery && requesterQuery !== selectedRequesterQuery ? (
                    <SearchMenu
                      emptyText="Nenhum médico encontrado."
                      items={filteredProfessionals.slice(0, 6)}
                      onSelect={selectRequester}
                    />
                  ) : null}
                </div>
              </DarkField>

              <DarkField label="Exame *">
                <input className={inputClass} onChange={(event) => updateField('exam', sanitizePlainText(event.target.value))} value={editor.exam} />
              </DarkField>

              <DarkField label="CID-10 *">
                <input className={inputClass} onChange={(event) => updateField('cidCode', sanitizePlainText(event.target.value))} value={editor.cidCode} />
              </DarkField>

              <DarkField label="Diagnóstico *">
                <textarea className={`${textareaClass} min-h-32`} onChange={(event) => updateField('diagnosis', sanitizePlainText(event.target.value))} value={editor.diagnosis} />
              </DarkField>

              <DarkField label="Conclusão *">
                <textarea className={`${textareaClass} min-h-32`} onChange={(event) => updateField('conclusion', sanitizePlainText(event.target.value))} value={editor.conclusion} />
              </DarkField>
              <DarkField label="Prazo">
                <input className={`${inputClass} [color-scheme:dark]`} onChange={(event) => updateField('dueAt', event.target.value)} type="datetime-local" value={editor.dueAt} />
              </DarkField>

              <DarkField label="Assinatura digital *">
                <input className={inputClass} onChange={(event) => updateField('digitalSignature', sanitizePlainText(event.target.value))} placeholder="CRM, certificado ou assinatura eletrônica" value={editor.digitalSignature} />
              </DarkField>

              <DarkField label="Importar PDF">
                <label className="flex h-11 cursor-pointer items-center justify-center rounded-sm border border-border-default-v2 bg-surface-inset px-3 text-center text-sm font-semibold text-text-body transition hover:border-accent-primary hover:text-accent-primary">
                  Escolher arquivo.
                  <input
                    accept="application/pdf"
                    className="sr-only"
                    multiple
                    onChange={(event) => {
                      appendFiles('importedPdfs', event.target.files)
                      event.target.value = ''
                    }}
                    type="file"
                  />
                </label>
                <PendingFileList files={editor.importedPdfs} onRemove={(index) => removeFile('importedPdfs', index)} />
              </DarkField>

              <DarkField label="Imagens">
                <label className="flex h-11 cursor-pointer items-center justify-center rounded-sm border border-border-default-v2 bg-surface-inset px-3 text-center text-sm font-semibold text-text-body transition hover:border-accent-primary hover:text-accent-primary">
                  Escolher arquivo.
                  <input
                    accept="image/*"
                    className="sr-only"
                    multiple
                    onChange={(event) => {
                      appendFiles('imageFiles', event.target.files)
                      event.target.value = ''
                    }}
                    type="file"
                  />
                </label>
                <PendingFileList files={editor.imageFiles} onRemove={(index) => removeFile('imageFiles', index)} />
              </DarkField>

              <label className="flex min-h-11 items-center gap-3 rounded-sm border border-border-default-v2 bg-surface-inset px-3 text-sm font-semibold text-text-body">
                <input
                  checked={Boolean(editor.hideDate)}
                  className="size-4 accent-[#3b82f6]"
                  onChange={(event) => updateField('hideDate', event.target.checked)}
                  type="checkbox"
                />
                Ocultar data
              </label>

              <label className="flex min-h-11 items-center gap-3 rounded-sm border border-border-default-v2 bg-surface-inset px-3 text-sm font-semibold text-text-body">
                <input
                  checked={Boolean(editor.hideSignature)}
                  className="size-4 accent-[#3b82f6]"
                  onChange={(event) => updateField('hideSignature', event.target.checked)}
                  type="checkbox"
                />
                Ocultar assinatura
              </label>
            </div>

            <DarkField label="Editor de texto">
              <RichTextEditor
                onChange={(value) => updateField('contentHtml', value)}
                value={editor.contentHtml}
              />
            </DarkField>

            <div className="mt-5 rounded-xl border border-border-default-v2 bg-surface-inset p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted-v2">Pré-visualização</p>
              <div className="min-h-24 text-sm leading-6 text-text-body" dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(editor.contentHtml) || '<p>O conteúdo do relatório aparecerá aqui.</p>' }} />
            </div>
          </main>
        </div>

        <div className="report-editor-footer flex flex-wrap items-center justify-between gap-3 border-t border-border-default-v2 px-6 py-4">
          <p className="text-xs font-semibold text-amber-300">
            {!isValid ? '* Preencha o editor de texto para salvar.' : 'Relatório pronto para salvar.'}
          </p>
          <div className="flex gap-3">
            <button className="rounded-sm border border-border-default-v2 bg-surface-card px-4 py-2 text-sm font-semibold text-text-body transition hover:bg-surface-card-hover" onClick={onClose} type="button">
              Cancelar
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-sm border border-accent-primary bg-accent-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:border-border-default-v2 disabled:bg-surface-card-hover disabled:text-text-muted-v2"
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

function ReportVersionsModal({ onClose, report }) {
  const storedVersions = Array.isArray(report.contentJson?.versions) ? report.contentJson.versions : []
  const versions = storedVersions.length
    ? storedVersions
    : [{
        date: report.updatedAt || report.createdAt,
        label: report.updatedAt ? 'Versão atualizada' : 'Versão inicial',
        user: report.createdByName || 'Sistema',
        changes: [{ field: 'Relatório', from: '-', to: report.exam || report.orderNumber || 'Criado' }],
      }]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border-default-v2 bg-surface-card p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-text-heading">Controle de versões</h2>
            <p className="mt-1 text-xs text-text-muted-v2">{report.orderNumber || report.exam || 'Relatório'}</p>
          </div>
          <button className="rounded-lg p-1.5 transition hover:bg-surface-card-hover" onClick={onClose} type="button">
            <ReportIcon className="size-4 text-text-muted-v2" name="x" />
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          {versions.map((version, index) => (
            <div className="rounded-lg border border-border-default-v2 bg-surface-inset p-3" key={`${version.date}-${index}`}>
              <p className="text-sm font-semibold text-text-body">{version.label || `Versão ${versions.length - index}`}</p>
              <p className="mt-1 text-xs text-text-muted-v2">{formatDateTime(version.date)} - {version.user || 'Usuário não informado'}</p>
              {Array.isArray(version.changes) && version.changes.length ? (
                <ul className="mt-3 grid gap-2 text-xs text-text-muted-v2">
                  {version.changes.map((change, changeIndex) => (
                    <li className="rounded-md border border-border-subtle bg-surface-inset px-3 py-2" key={`${change.field}-${changeIndex}`}>
                      <span className="font-semibold text-text-body">{change.field}</span>
                      <span className="mt-1 block">
                        {change.from} → {change.to}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DeliveryProtocolModal({ onClose, onSave, report, viewerProfile }) {
  const [protocol, setProtocol] = useState({
    date: new Date().toISOString().slice(0, 10),
    responsible: viewerProfile?.name || viewerProfile?.email || '',
    patientSignature: '',
  })

  function update(field, value) {
    setProtocol((current) => ({ ...current, [field]: value }))
  }

  function submit(event) {
    event.preventDefault()
    onSave({
      ...protocol,
      recordedAt: new Date().toISOString(),
      reportId: report.id,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form className="w-full max-w-xl rounded-2xl border border-border-default-v2 bg-surface-card p-6 shadow-xl" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-text-heading">Protocolo de entrega</h2>
            <p className="mt-1 text-xs text-text-muted-v2">{report.patientName} - {report.exam}</p>
          </div>
          <button className="rounded-lg p-1.5 transition hover:bg-surface-card-hover" onClick={onClose} type="button">
            <ReportIcon className="size-4 text-text-muted-v2" name="x" />
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          <DarkField label="Data de entrega">
            <input className={`${inputClass} [color-scheme:dark]`} onChange={(event) => update('date', event.target.value)} required type="date" value={protocol.date} />
          </DarkField>
          <DarkField label="Responsável pela entrega">
            <input className={inputClass} onChange={(event) => update('responsible', sanitizePlainText(event.target.value))} required value={protocol.responsible} />
          </DarkField>
          <DarkField label="Assinatura digital do paciente">
            <textarea className={`${inputClass} min-h-24 py-2`} onChange={(event) => update('patientSignature', sanitizePlainText(event.target.value))} placeholder="Nome completo, token ou confirmação eletrônica" required value={protocol.patientSignature} />
          </DarkField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="rounded-sm border border-border-default-v2 bg-surface-inset px-4 py-2 text-sm font-semibold text-text-body" onClick={onClose} type="button">Cancelar</button>
          <button className="rounded-sm bg-accent-primary px-4 py-2 text-sm font-semibold text-white" type="submit">Registrar entrega</button>
        </div>
      </form>
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
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-border-default-v2 bg-surface-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-default-v2 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-text-body">Relatório</h2>
            <p className="mt-1 text-xs text-text-muted-v2">{report.orderNumber || 'Sem número'} </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-default-v2 bg-surface-inset px-3 text-xs font-semibold text-text-body transition hover:bg-surface-card-hover"
              onClick={() => printReportAsPdf(report, currentStatus)}
              type="button"
            >
              <ReportIcon className="size-4" name="print" />
              Imprimir PDF
            </button>
            <button className="rounded-lg p-1.5 transition hover:bg-surface-card-hover" onClick={onClose} type="button">
              <ReportIcon className="size-4 text-text-muted-v2" name="x" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <DetailCard label="Paciente" value={report.patientName} />
            <DetailCard label="Solicitante" value={report.requestedBy || '-'} />
            <DetailCard label="Criado em" value={formatDate(report.createdAt)} />
            <DetailCard label="Criado por" value={report.createdByName} />
            <DetailCard label="Status" value={currentStatus.label} />
            <DetailCard label="Prazo" value={formatDateTime(report.dueAt)} />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <DetailBlock label="Exame" value={report.exam || '-'} />
            <DetailBlock label="CID-10" value={report.cidCode || '-'} />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <DetailBlock label="Diagnóstico" value={report.diagnosis || '-'} />
            <DetailBlock label="Conclusão" value={report.conclusion || '-'} />
          </div>
          <div className="mt-6 rounded-xl border border-border-default-v2 bg-surface-inset p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted-v2">Relatório</p>
            {report.contentHtml ? (
              <div
                className="whitespace-pre-wrap text-sm leading-6 text-text-body"
                dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(report.contentHtml) }}
              />
            ) : (
              <p className="text-sm text-text-muted-v2">Nenhum complemento informado.</p>
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

function PendingFileList({ files = [], onRemove }) {
  if (!files?.length) return null

  return (
    <ul className="mt-2 grid gap-2 text-xs text-text-muted-v2">
      {files.map((fileName, index) => (
        <li className="flex items-center justify-between gap-3 rounded border border-border-default-v2 bg-surface-card px-3 py-2" key={`${fileName}-${index}`}>
          <span className="min-w-0 truncate">{fileName}</span>
          <button
            aria-label={`Remover ${fileName}`}
            className="grid size-5 shrink-0 place-items-center rounded-sm text-text-body transition hover:bg-surface-card-hover"
            onClick={() => onRemove?.(index)}
            type="button"
          >
            x
          </button>
        </li>
      ))}
    </ul>
  )
}

function SearchMenu({ emptyText, items, onSelect }) {
  return (
    <div className="absolute left-0 right-0 top-11 z-20 max-h-56 overflow-y-auto rounded-md border border-border-default-v2 bg-surface-inset shadow-2xl">
      {items.length ? (
        items.map((item) => (
          <button
            className="block w-full px-3 py-2 text-left text-sm font-semibold text-text-body transition hover:bg-surface-card-hover"
            key={item.id || item.name}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(item)}
            type="button"
          >
            {item.name}
          </button>
        ))
      ) : (
        <p className="px-3 py-2 text-xs text-text-muted-v2">{emptyText}</p>
      )}
    </div>
  )
}

function DetailCard({ label, value }) {
  return (
    <div className="rounded-lg border border-border-default-v2 bg-surface-inset px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted-v2">{label}</p>
      <p className="mt-1 text-sm leading-5 text-text-body">{value}</p>
    </div>
  )
}

function DetailBlock({ label, value }) {
  return (
    <div className="rounded-lg border border-border-default-v2 bg-surface-inset px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted-v2">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-text-body">{value}</p>
    </div>
  )
}

function IconButton({ label, name, onClick }) {
  return (
    <button
      aria-label={label}
      className="grid size-9 place-items-center rounded-lg border border-border-default-v2 bg-surface-inset text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-body"
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
      className="grid size-8 place-items-center rounded-lg border border-border-default-v2 bg-surface-inset text-text-body transition hover:bg-surface-card-hover disabled:cursor-not-allowed disabled:opacity-30"
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

function buildReportContentJson({ editor, userName }) {
  const baseContentJson = editor.contentJson && typeof editor.contentJson === 'object' ? editor.contentJson : {}
  const nextContentJson = {
    ...baseContentJson,
    digitalSignature: editor.digitalSignature,
    importedPdfs: editor.importedPdfs || [],
    imageFiles: editor.imageFiles || [],
  }

  return appendReportVersion({
    ...editor.originalReport,
    contentJson: nextContentJson,
  }, {
    label: editor.id ? 'Relatório atualizado' : 'Relatório criado',
    user: userName,
    changes: editor.id
      ? diffReportChanges(editor.originalReport, editor)
      : [{ field: 'Relatório', from: '-', to: editor.exam || 'Criado' }],
  })
}

function appendReportVersion(report, entry) {
  const contentJson = report?.contentJson && typeof report.contentJson === 'object' ? report.contentJson : {}
  const previousVersions = Array.isArray(contentJson.versions) ? contentJson.versions : []
  const changes = Array.isArray(entry.changes) && entry.changes.length
    ? entry.changes
    : [{ field: 'Registro', from: '-', to: 'Atualizado sem alteração textual detectada' }]

  return {
    ...contentJson,
    versions: [
      ...previousVersions,
      {
        date: new Date().toISOString(),
        label: entry.label || 'Alteração registrada',
        user: entry.user || 'Usuário não informado',
        changes,
      },
    ],
  }
}

function diffReportChanges(previous = {}, next = {}) {
  const previousContentJson = previous?.contentJson && typeof previous.contentJson === 'object' ? previous.contentJson : {}
  const checks = [
    ['Status', getStatusLabel(previous?.status), getStatusLabel(next.status)],
    ['Paciente', previous?.patientId || '', next.patientId || ''],
    ['Exame', previous?.exam, next.exam],
    ['Médico responsável', previous?.requestedBy, next.requestedBy],
    ['CID-10', previous?.cidCode, next.cidCode],
    ['Diagnóstico', previous?.diagnosis, next.diagnosis],
    ['Conclusão', previous?.conclusion, next.conclusion],
    ['Conteúdo', stripHtml(previous?.contentHtml), stripHtml(next.contentHtml)],
    ['Prazo', toComparableDate(previous?.dueAt), toComparableDate(next.dueAt)],
    ['Assinatura digital', previousContentJson.digitalSignature, next.digitalSignature],
    ['PDFs anexados', formatFileList(previousContentJson.importedPdfs), formatFileList(next.importedPdfs)],
    ['Imagens anexadas', formatFileList(previousContentJson.imageFiles), formatFileList(next.imageFiles)],
  ]

  return checks
    .filter(([, from, to]) => normalizeComparable(from) !== normalizeComparable(to))
    .map(([field, from, to]) => ({
      field,
      from: formatChangeValue(from),
      to: formatChangeValue(to),
    }))
}

function getStatusLabel(status) {
  return (statusConfig[status] || statusConfig.draft).label
}

function formatFileList(files) {
  return Array.isArray(files) ? files.join(', ') : ''
}

function toComparableDate(value) {
  return value ? toDateTimeLocal(value) || value : ''
}

function normalizeComparable(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function formatChangeValue(value) {
  const normalized = normalizeComparable(value)
  if (!normalized) return '-'
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized
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
    editor.digitalSignature,
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
  const printedAt = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const createdDate = report.hideDate ? '-' : formatDate(report.createdAt)
  const dueDate = report.hideDate ? '-' : formatDateTime(report.dueAt)
  const createdBy = report.hideSignature ? '-' : report.createdByName
  const signatureName = report.hideSignature ? 'Responsável técnico' : report.createdByName || 'Responsável técnico'
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Impressão do relatório')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'
  document.body.appendChild(iframe)

  const printDocument = iframe.contentWindow?.document
  if (!printDocument) {
    document.body.removeChild(iframe)
    return
  }

  printDocument.open()
  printDocument.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Relatório ${escapeHtml(report.orderNumber || '')}</title>
        <style>
          * { box-sizing: border-box; }
          html { background: #eef2f3; }
          body { background: #eef2f3; color: #1f2933; font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 12.5px; line-height: 1.55; margin: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .page { background: #ffffff; box-shadow: 0 18px 44px rgba(15, 23, 42, 0.12); display: flex; flex-direction: column; margin: 18mm auto; max-width: 210mm; min-height: 297mm; padding: 20mm 18mm 16mm; }
          .document-header { align-items: flex-start; border-bottom: 2px solid #1d3557; display: grid; gap: 24px; grid-template-columns: minmax(0, 1fr) auto; padding-bottom: 16px; position: relative; }
          .document-header::after { background: #2f7d78; bottom: -2px; content: ''; height: 2px; left: 0; position: absolute; width: 148px; }
          .eyebrow { color: #2f7d78; font-size: 10px; font-weight: 700; letter-spacing: 0.14em; margin: 0 0 7px; text-transform: uppercase; }
          h1 { color: #102a43; font-family: Georgia, 'Times New Roman', serif; font-size: 30px; font-weight: 700; line-height: 1.1; margin: 0; }
          .document-number { color: #52606d; font-size: 12px; margin: 8px 0 0; }
          .brand { min-width: 160px; text-align: right; }
          .brand-mark { align-items: center; background: #102a43; color: #ffffff; display: inline-flex; font-size: 13px; font-weight: 700; height: 36px; justify-content: center; margin-bottom: 8px; width: 36px; }
          .brand-name { color: #102a43; font-size: 14px; font-weight: 700; margin: 0; }
          .brand-caption { color: #6b7280; font-size: 10px; letter-spacing: 0.1em; margin: 2px 0 0; text-transform: uppercase; }
          .patient-summary { align-items: center; background: #f7fbfa; border: 1px solid #cfd8dc; display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) auto; margin-top: 18px; padding: 14px 16px; }
          .summary-label { color: #52606d; display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; margin-bottom: 4px; text-transform: uppercase; }
          .patient-name { color: #102a43; display: block; font-size: 18px; font-weight: 700; }
          .status-box { border-left: 3px solid #2f7d78; min-width: 116px; padding-left: 12px; text-align: left; }
          .status-value { color: #102a43; display: block; font-size: 13px; font-weight: 700; }
          .metadata { border: 1px solid #d7dde1; border-collapse: collapse; margin-top: 16px; table-layout: fixed; width: 100%; }
          .metadata th { background: #f4f7f7; border: 1px solid #d7dde1; color: #52606d; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; padding: 9px 10px; text-align: left; text-transform: uppercase; width: 18%; }
          .metadata td { border: 1px solid #d7dde1; color: #1f2933; font-size: 12.5px; padding: 9px 10px; vertical-align: top; width: 32%; word-break: break-word; }
          .section { break-inside: avoid; margin-top: 20px; }
          .section-heading { align-items: center; border-bottom: 1px solid #cfd8dc; color: #102a43; display: flex; font-size: 12px; font-weight: 700; gap: 9px; letter-spacing: 0.12em; margin: 0 0 10px; padding-bottom: 7px; text-transform: uppercase; }
          .section-heading::before { background: #2f7d78; content: ''; display: inline-block; height: 17px; width: 4px; }
          .section-body { color: #1f2933; font-size: 13px; line-height: 1.8; white-space: pre-wrap; }
          .section-body p { margin: 0; }
          .report-body { white-space: normal; }
          .report-body p { margin: 0 0 12px; }
          .report-body ul,
          .report-body ol { margin: 0 0 12px 20px; padding: 0; }
          .report-body li { margin: 0 0 7px; }
          .report-body strong { color: #102a43; }
          .signature { break-inside: avoid; display: flex; justify-content: flex-end; margin-top: 34px; }
          .signature-card { color: #334e68; text-align: center; width: 280px; }
          .signature-line { border-top: 1px solid #52606d; height: 1px; margin-bottom: 8px; width: 100%; }
          .signature-name { color: #102a43; font-size: 12px; font-weight: 700; margin: 0; }
          .signature-meta { color: #6b7280; font-size: 10px; letter-spacing: 0.08em; margin: 2px 0 0; text-transform: uppercase; }
          .footer { border-top: 1px solid #d7dde1; color: #6b7280; display: flex; font-size: 10.5px; gap: 16px; justify-content: space-between; margin-top: auto; padding-top: 10px; }
          @page { size: A4; margin: 0; }
          @media print {
            html,
            body { background: #ffffff; }
            .page { box-shadow: none; margin: 0; min-height: 297mm; padding: 18mm 16mm 14mm; page-break-after: always; }
          }
        </style>
      </head>
      <body>
        <main class="page">
          <header class="document-header">
            <div>
              <p class="eyebrow">Documento clínico</p>
              <h1>Relatório médico</h1>
              <p class="document-number">${escapeHtml(report.orderNumber || 'Sem número')}</p>
            </div>
            <div class="brand">
              <div class="brand-mark">MC</div>
              <p class="brand-name">MediConnect</p>
              <p class="brand-caption">Gestão clínica</p>
            </div>
          </header>

          <section class="patient-summary">
            <div>
              <span class="summary-label">Paciente</span>
              <span class="patient-name">${escapeHtml(report.patientName || '-')}</span>
            </div>
            <div class="status-box">
              <span class="summary-label">Status</span>
              <span class="status-value">${escapeHtml(status.label || '-')}</span>
            </div>
          </section>

          <table class="metadata" aria-label="Identificação do relatório">
            <tbody>
              ${printMetadataRow('Solicitante', report.requestedBy || '-', 'Criado em', createdDate)}
              ${printMetadataRow('Criado por', createdBy, 'Prazo', dueDate)}
              ${printMetadataRow('Exame', report.exam || '-', 'CID-10', report.cidCode || '-')}
            </tbody>
          </table>

          ${printPlainSection('Diagnóstico', report.diagnosis || '-')}
          ${printPlainSection('Conclusão', report.conclusion || '-')}

          <section class="section">
            <h2 class="section-heading">Relatório</h2>
            <div class="section-body report-body">${report.contentHtml ? sanitizePreviewHtml(report.contentHtml) : '<p>Nenhum complemento informado.</p>'}</div>
          </section>

          <section class="signature">
            <div class="signature-card">
              <div class="signature-line"></div>
              <p class="signature-name">${escapeHtml(signatureName)}</p>
              <p class="signature-meta">Assinatura e carimbo</p>
            </div>
          </section>

          <footer class="footer">
            <span>Documento gerado para impressão em ${escapeHtml(printedAt)}.</span>
            <span>${escapeHtml(report.orderNumber || 'Sem número')}</span>
          </footer>
        </main>
      </body>
    </html>
  `)
  printDocument.close()

  window.setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    window.setTimeout(() => iframe.remove(), 1000)
  }, 100)
}

function printMetadataRow(firstLabel, firstValue, secondLabel, secondValue) {
  return `
    <tr>
      <th>${escapeHtml(firstLabel)}</th>
      <td>${escapeHtml(firstValue || '-')}</td>
      <th>${escapeHtml(secondLabel)}</th>
      <td>${escapeHtml(secondValue || '-')}</td>
    </tr>
  `
}

function printPlainSection(label, value) {
  return `
    <section class="section">
      <h2 class="section-heading">${escapeHtml(label)}</h2>
      <div class="section-body"><p>${escapeHtml(value || '-')}</p></div>
    </section>
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

  if (name === 'more') {
    return (
      <svg {...common}>
        <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
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
