import { useEffect, useMemo, useState } from 'react'

import { StethoscopeIcon } from '../components/Brand.jsx'
import { getCommunicationAccess } from '../config/communicationAccess.js'
import { communicationRepository } from '../repositories/communicationRepository.js'
import { notificationRepository } from '../repositories/notificationRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'
import { sanitizePlainText } from '../utils/inputSanitizers.js'
import { isCommunicationEligiblePatient } from '../utils/communicationEligibility.js'
import { appointmentRepository } from '../repositories/appointmentRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { getCommunicationSettings } from '../utils/communicationSettings.js'
import { formatLocalDateInput } from '../utils/agendaDate.js'

const channels = {
  whatsapp: { label: 'WhatsApp', className: 'bg-emerald-500/20 text-emerald-400', icon: 'message' },
  email: { label: 'E-mail', className: 'bg-blue-500/20 text-blue-400', icon: 'mail' },
  sms: { label: 'SMS', className: 'bg-purple-500/20 text-purple-400', icon: 'phone' },
}

const statusConfig = {
  entregue: { label: 'Entregue', className: 'text-emerald-400', icon: 'check' },
  lida: { label: 'Lida', className: 'text-blue-400', icon: 'eye' },
  falha: { label: 'Falha', className: 'text-red-400', icon: 'x-circle' },
  pendente: { label: 'Pendente', className: 'text-amber-400', icon: 'clock' },
}

const defaultTemplates = [
  {
    id: 'default-marketing-medico',
    builtin: true,
    name: 'Marketing medico',
    channel: 'email',
    category: 'Marketing',
    content: 'Ola, {paciente}. A equipe MediConnect preparou conteudos de saude preventiva para apoiar sua rotina de cuidado. Conte conosco para acompanhar sua saude de perto.',
  },
  {
    id: 'default-vacinacao',
    builtin: true,
    name: 'Campanha de vacinacao',
    channel: 'whatsapp',
    category: 'Campanha',
    content: 'Ola, {paciente}. Estamos com uma campanha de vacinacao ativa na clinica. Responda esta mensagem para receber orientacoes e verificar disponibilidade.',
  },
  {
    id: 'default-lembrete-consulta',
    builtin: true,
    name: 'Lembrete de consulta proxima',
    channel: 'whatsapp',
    category: 'Lembrete',
    content: 'Ola, {paciente}. Passando para lembrar que voce tem uma consulta agendada em breve. Caso precise reagendar, fale com nossa equipe.',
  },
  {
    id: 'default-confirmacao-agendamento',
    builtin: true,
    name: 'Confirmacao de agendamento',
    channel: 'sms',
    category: 'Confirmacao',
    content: 'Sua consulta na MediConnect foi agendada. Responda SIM para confirmar sua presenca ou entre em contato para reagendar.',
  },
  {
    id: 'default-agradecimento',
    builtin: true,
    name: 'Agradecimento pos-consulta',
    channel: 'whatsapp',
    category: 'Relacionamento',
    content: 'Ola, {paciente}. Agradecemos sua visita. Se tiver duvidas sobre orientacoes ou retorno, nossa equipe esta a disposicao.',
  },
  {
    id: 'default-retorno-pendente',
    builtin: true,
    name: 'Retorno pendente',
    channel: 'whatsapp',
    category: 'Retorno',
    content: 'Ola, {paciente}. Identificamos que voce ainda nao possui retorno agendado. Podemos ajudar a encontrar o melhor horario?',
  },
  {
    id: 'default-atualizacao-cadastral',
    builtin: true,
    name: 'Atualizacao cadastral',
    channel: 'email',
    category: 'Cadastro',
    content: 'Ola, {paciente}. Para manter seu atendimento seguro, pedimos que confirme seus dados cadastrais com nossa equipe antes da proxima consulta.',
  },
  {
    id: 'default-preparo-exame',
    builtin: true,
    name: 'Preparo para exame',
    channel: 'sms',
    category: 'Exames',
    content: 'Lembrete MediConnect: verifique as orientacoes de preparo para seu exame. Em caso de duvidas, fale com a clinica.',
  },
]

const recurrenceOptions = [
  ['none', 'Nao repetir'],
  ['weekly', 'Semanalmente'],
  ['biweekly', 'A cada 15 dias'],
  ['monthly', 'Mensalmente'],
  ['quarterly', 'A cada 3 meses'],
]

const campaignStorageKey = 'mediconnect.communication.campaigns'

const emptyMessage = {
  patientId: '',
  patient: '',
  phone: '',
  channel: 'whatsapp',
  template: 'Mensagem avulsa',
  content: '',
}

const emptyTemplate = {
  name: '',
  channel: 'whatsapp',
  category: 'Lembrete',
  content: '',
}

const emptyCampaign = {
  name: '',
  channel: 'whatsapp',
  template: 'Mensagem avulsa',
  content: '',
  patientIds: [],
  recurrence: 'none',
}

const tabLabels = {
  historico: 'Historico',
  templates: 'Templates',
  campanha: 'Campanhas',
  gerenciamento: 'Gerenciamento',
  lembretes: 'Lembretes',
}

const cardClass = 'rounded-2xl border border-border-default-v2 bg-surface-card shadow-sm'
const inputClass =
  'h-10 w-full rounded-sm border border-border-default-v2 bg-surface-page px-3 text-sm text-text-heading outline-none transition placeholder:text-text-muted-v2 focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20'
const textareaClass =
  'min-h-28 w-full resize-y rounded-sm border border-border-default-v2 bg-surface-page px-3 py-2 text-sm leading-6 text-text-heading outline-none transition placeholder:text-text-muted-v2 focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20'
const labelClass = 'text-xs font-semibold uppercase tracking-[0.08em] text-text-muted-v2'

export function MessagesPage({ role }) {
  const communicationAccess = useMemo(() => getCommunicationAccess(role), [role])
  const canAccessModule = communicationAccess.canAccessModule
  const allowedChannelKeys = communicationAccess.channelKeys
  const communicationTabs = communicationAccess.tabKeys.map((key) => [key, tabLabels[key]])
  const [messages, setMessages] = useState([])
  const [templates, setTemplates] = useState([])
  const [patients, setPatients] = useState([])
  const [campaignHistory, setCampaignHistory] = useState(loadStoredCampaigns)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('historico')
  const [channelFilter, setChannelFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState(null)
  const [composer, setComposer] = useState(emptyMessage)
  const [campaignDraft, setCampaignDraft] = useState(emptyCampaign)
  const [templateDraft, setTemplateDraft] = useState(emptyTemplate)

  const patientOptions = useMemo(
    () =>
      patients.map((patient) => ({
        id: String(patient.detailId || patient.id || ''),
        name: patient.name || patient.full_name || patient.nome || 'Paciente',
        phone: patient.phone || patient.phone_mobile || patient.telefone || '',
        email: patient.email || '',
        document: patient.cpf || patient.document || '',
        nextVisit: patient.nextVisit || patient.next_visit || '',
        communicationEligible: isCommunicationEligiblePatient(patient),
      })),
    [patients],
  )
  const eligiblePatients = useMemo(
    () => patientOptions.filter((patient) => patient.communicationEligible),
    [patientOptions],
  )
  const optedOutCount = patientOptions.length - eligiblePatients.length
  const availableTemplates = useMemo(
    () => mergeTemplates(defaultTemplates, templates).filter((template) => allowedChannelKeys.includes(template.channel)),
    [allowedChannelKeys, templates],
  )

  useEffect(() => {
    let active = true

    if (!canAccessModule) {
      return () => {
        active = false
      }
    }

    Promise.all([
      patientRepository.getDirectoryRows().catch(() => []),
      communicationRepository.getInitialMessages().catch(() => []),
      communicationRepository.getInitialTemplates().catch(() => []),
    ])
      .then(([patientData, messageData, templateData]) => {
        if (!active) return
        setPatients(patientData || [])
        setMessages(messageData || [])
        setTemplates(templateData || [])
      })
      .catch((loadError) => {
        if (!active) return
        setError(translateErrorMessage(loadError.message, 'Erro ao carregar comunicacao.'))
        setPatients([])
        setMessages([])
        setTemplates([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [canAccessModule])

  useEffect(() => {
    saveStoredCampaigns(campaignHistory)
  }, [campaignHistory])

  const filteredMessages = useMemo(
    () =>
      messages.filter((message) => {
        const channel = channels[message.channel]
        const isAllowedChannel = allowedChannelKeys.includes(message.channel)
        const matchesChannel = channelFilter === 'todos' || message.channel === channelFilter
        const query = search.trim().toLowerCase()
        const matchesSearch =
          !query ||
          [message.patient, message.template, channel?.label]
            .join(' ')
            .toLowerCase()
            .includes(query)

        return isAllowedChannel && matchesChannel && matchesSearch
      }),
    [allowedChannelKeys, channelFilter, messages, search],
  )

  const stats = useMemo(
    () => ({
      total: messages.filter((message) => allowedChannelKeys.includes(message.channel)).length,
      delivered: messages.filter((message) => allowedChannelKeys.includes(message.channel) && (message.status === 'entregue' || message.status === 'lida')).length,
      read: messages.filter((message) => allowedChannelKeys.includes(message.channel) && message.status === 'lida').length,
      failed: messages.filter((message) => allowedChannelKeys.includes(message.channel) && message.status === 'falha').length,
    }),
    [allowedChannelKeys, messages],
  )

  function openTemplate(template) {
    if (!allowedChannelKeys.includes(template.channel)) return

    setComposer({
      patientId: '',
      patient: '',
      phone: '',
      channel: template.channel,
      template: template.name,
      content: template.content,
    })
    setComposerOpen(true)
  }

  function openTemplateEditor(template = null) {
    if (template && !allowedChannelKeys.includes(template.channel)) return

    setEditingTemplateId(template?.builtin ? null : template?.id || null)
    setTemplateDraft(
      template
        ? {
            name: template.name || '',
            channel: template.channel || allowedChannelKeys[0],
            category: template.category || 'Personalizado',
            content: template.content || '',
          }
        : {
            ...emptyTemplate,
            channel: allowedChannelKeys[0] || 'whatsapp',
          },
    )
    setTemplateEditorOpen(true)
  }

  function openCampaignModal(campaign = null) {
    const eligibleIds = new Set(eligiblePatients.map((patient) => patient.id))
    setCampaignDraft(
      campaign
        ? {
            name: campaign.name || '',
            channel: campaign.channel || 'whatsapp',
            template: campaign.template || 'Mensagem avulsa',
            content: campaign.content || '',
            patientIds: (campaign.patientIds || []).filter((patientId) => eligibleIds.has(String(patientId))),
            recurrence: campaign.recurrence || 'none',
          }
        : {
            ...emptyCampaign,
            channel: allowedChannelKeys[0] || 'whatsapp',
          },
    )
    setCampaignOpen(true)
  }

  async function submitMessage(event) {
    event.preventDefault()

    if (!composer.patientId || !composer.patient.trim()) return

    if (!allowedChannelKeys.includes(composer.channel)) {
      window.alert('Canal indisponivel para o seu perfil.')
      return
    }

    const patient = eligiblePatients.find((item) => String(item.id) === String(composer.patientId))
    if (!patient) {
      window.alert('Paciente indisponivel para comunicacao por opt-out LGPD.')
      return
    }

    const result = await sendCommunicationToPatient({
      channel: composer.channel,
      content: composer.content,
      patient,
      template: composer.template.trim() || 'Mensagem avulsa',
    })

    setMessages((current) => [createLocalMessage(result), ...current])
    notificationRepository.notifyCurrentUser({
      domain: 'communication',
      title: 'Comunicacao registrada',
      detail: `${channels[composer.channel].label} para ${composer.patient.trim()} foi ${result.status === 'entregue' ? 'enviado' : 'registrado'}.`,
      patientId: composer.patientId,
    }).catch(() => null)
    setComposer(emptyMessage)
    setComposerOpen(false)
    setActiveTab('historico')
  }

  function submitTemplate(event) {
    event.preventDefault()

    if (!templateDraft.name.trim() || !templateDraft.content.trim()) return

    const nextTemplate = {
      id: editingTemplateId || `template-${new Date().getTime()}`,
      name: templateDraft.name.trim(),
      channel: templateDraft.channel,
      content: templateDraft.content.trim(),
      category: templateDraft.category.trim() || 'Personalizado',
    }

    setTemplates((current) =>
      editingTemplateId
        ? current.map((template) => (template.id === editingTemplateId ? nextTemplate : template))
        : [nextTemplate, ...current],
    )
    setEditingTemplateId(null)
    setTemplateDraft(emptyTemplate)
    setTemplateEditorOpen(false)
  }

  async function submitCampaign(event) {
    event.preventDefault()

    const selectedPatients = eligiblePatients.filter((patient) => campaignDraft.patientIds.includes(patient.id))
    if (!campaignDraft.name.trim() || !campaignDraft.content.trim() || !selectedPatients.length) return

    const results = await Promise.all(
      selectedPatients.map((patient) =>
        sendCommunicationToPatient({
          channel: campaignDraft.channel,
          content: campaignDraft.content,
          patient,
          template: campaignDraft.template.trim() || campaignDraft.name.trim(),
        }),
      ),
    )
    const now = new Date()
    const campaignRecord = {
      id: `campaign-${now.getTime()}`,
      channel: campaignDraft.channel,
      content: campaignDraft.content.trim(),
      delivered: results.filter((result) => result.status === 'entregue').length,
      failed: results.filter((result) => result.status === 'falha').length,
      name: campaignDraft.name.trim(),
      patientIds: selectedPatients.map((patient) => patient.id),
      patients: selectedPatients.map((patient) => patient.name),
      nextRunAt: getNextRunAt(campaignDraft.recurrence, now),
      recurrence: campaignDraft.recurrence,
      recurrenceLabel: getRecurrenceLabel(campaignDraft.recurrence),
      sentAt: formatDateTime(now),
      template: campaignDraft.template.trim() || campaignDraft.name.trim(),
      total: selectedPatients.length,
    }

    setMessages((current) => [...results.map(createLocalMessage), ...current])
    setCampaignHistory((current) => [campaignRecord, ...current])
    notificationRepository.notifyCurrentUser({
      domain: 'communication',
      title: 'Campanha disparada',
      detail: `${campaignRecord.name} enviada para ${campaignRecord.total} pacientes elegíveis.`,
    }).catch(() => null)
    setCampaignDraft(emptyCampaign)
    setCampaignOpen(false)
    setActiveTab('campanha')
  }

  async function sendCommunicationToPatient({ channel, content, patient, template }) {
    if (channel === 'sms' || channel === 'whatsapp') {
      if (!patient.phone) {
        await communicationRepository.registerMessage({
          channel,
          content,
          patientId: patient.id,
          patientName: patient.name,
          status: 'falha',
          template,
        }).catch(() => null)
        return { channel, patient, response: 'Telefone ausente', status: 'falha', template }
      }

      try {
        const sendResult = channel === 'sms'
          ? await communicationRepository.sendSms({
              content,
              patientId: patient.id,
              patientName: patient.name,
              phone: patient.phone,
            })
          : await communicationRepository.sendWhatsApp({
              content,
              fallbackSms: false,
              patientId: patient.id,
              patientName: patient.name,
              phone: patient.phone,
            })

        const response = channel === 'sms'
          ? (sendResult.sid ? `Twilio SID: ${sendResult.sid}` : sendResult.message || '')
          : (sendResult.id ? `WhatsApp ID: ${sendResult.id}` : sendResult.message || '')

        return { channel, patient, response, status: 'entregue', template }
      } catch (sendError) {
        await communicationRepository.registerMessage({
          channel,
          content,
          patientId: patient.id,
          patientName: patient.name,
          status: 'falha',
          template,
        }).catch(() => null)
        return {
          channel,
          patient,
          response: translateErrorMessage(sendError.message, channel === 'sms' ? 'Falha ao enviar SMS.' : 'Falha ao enviar WhatsApp.'),
          status: 'falha',
          template,
        }
      }
    }

    await communicationRepository.registerMessage({
      channel,
      content,
      patientId: patient.id,
      patientName: patient.name,
      status: 'pendente',
      template,
    }).catch(() => null)

    return { channel, patient, response: '', status: 'pendente', template }
  }

  if (!canAccessModule) {
    return (
      <div className={`${cardClass} mx-auto max-w-3xl p-8 text-center text-sm text-text-muted-v2`}>
        Sem acesso ao modulo de comunicacao.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-[32px] font-bold leading-8 tracking-[-0.02em] text-text-heading">Comunicação</h1>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex h-12 items-center gap-2 rounded-sm border border-border-default-v2 bg-surface-card px-4 text-sm font-semibold text-text-heading transition hover:bg-surface-card-hover"
            onClick={() => openCampaignModal()}
            type="button"
          >
            <CommIcon className="size-4" name="send" />
            Nova campanha
          </button>
          <button
            className="inline-flex h-12 items-center gap-2 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
            onClick={() => setComposerOpen(true)}
            type="button"
          >
            <CommIcon className="size-4" name="plus" />
            Nova mensagem
          </button>
        </div>
      </div>

      {loading ? (
        <p className={`${cardClass} p-8 text-center text-sm text-text-muted-v2`}>Carregando comunicacao...</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total enviadas" value={stats.total} />
        <StatCard label="Entregues" value={stats.delivered} valueClassName="text-emerald-400" />
        <StatCard label="Lidas" value={stats.read} valueClassName="text-[#3b82f6]" />
        <StatCard label="Falhas" value={stats.failed} valueClassName="text-red-400" />
      </div>

      <div className="flex gap-4 border-b border-border-default-v2">
        {communicationTabs.map(([key, label]) => (
          <button
            className={`border-b-2 px-2 pb-3 text-sm font-semibold transition ${
              activeTab === key
                ? 'border-[#3b82f6] text-[#3b82f6]'
                : 'border-transparent text-text-body hover:text-text-heading'
            }`}
            key={key}
            onClick={() => setActiveTab(key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'historico' ? (
        <HistoryTab
          allowedChannelKeys={allowedChannelKeys}
          channelFilter={channelFilter}
          messages={filteredMessages}
          search={search}
          setChannelFilter={setChannelFilter}
          setSearch={setSearch}
        />
      ) : null}

      {activeTab === 'templates' ? (
        <TemplatesTab
          onEdit={openTemplateEditor}
          onUse={openTemplate}
          templates={availableTemplates}
        />
      ) : null}

      {activeTab === 'campanha' ? (
        <CampaignsTab
          campaignHistory={campaignHistory}
          eligibleCount={eligiblePatients.length}
          onCreate={() => openCampaignModal()}
          onResend={openCampaignModal}
          optedOutCount={optedOutCount}
        />
      ) : null}

      {activeTab === 'gerenciamento' ? (
        <ManagementTab
          campaignHistory={campaignHistory}
          customTemplates={templates.filter((template) => allowedChannelKeys.includes(template.channel))}
          eligibleCount={eligiblePatients.length}
          onEditTemplate={openTemplateEditor}
          onResendCampaign={openCampaignModal}
          optedOutCount={optedOutCount}
          totalPatients={patientOptions.length}
        />
      ) : null}

      {activeTab === 'lembretes' ? (
        <RemindersTab
          patients={patientOptions}
        />
      ) : null}

      {composerOpen ? (
        <MessageComposer
          allowedChannelKeys={allowedChannelKeys}
          draft={composer}
          onChange={setComposer}
          onClose={() => {
            setComposerOpen(false)
            setComposer(emptyMessage)
          }}
          onSubmit={submitMessage}
          patients={eligiblePatients}
          templates={availableTemplates}
        />
      ) : null}

      {campaignOpen ? (
        <CampaignComposer
          allowedChannelKeys={allowedChannelKeys}
          draft={campaignDraft}
          onChange={setCampaignDraft}
          onClose={() => {
            setCampaignOpen(false)
            setCampaignDraft(emptyCampaign)
          }}
          onSubmit={submitCampaign}
          patients={eligiblePatients}
          templates={availableTemplates}
        />
      ) : null}

      {templateEditorOpen ? (
        <TemplateEditor
          allowedChannelKeys={allowedChannelKeys}
          draft={templateDraft}
          onChange={setTemplateDraft}
          onClose={() => {
            setTemplateEditorOpen(false)
            setTemplateDraft(emptyTemplate)
            setEditingTemplateId(null)
          }}
          onSubmit={submitTemplate}
          title={editingTemplateId ? 'Editar template' : 'Novo template'}
        />
      ) : null}
    </div>
  )
}

function HistoryTab({ allowedChannelKeys, channelFilter, messages, search, setChannelFilter, setSearch }) {
  return (
    <section className={`${cardClass} p-5 md:p-6`} aria-label="Historico de comunicacao">
      <div className="mb-6 flex flex-col gap-3 md:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Buscar comunicacao</span>
          <CommIcon
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-muted-v2"
            name="search"
          />
          <input
            className={`${inputClass} h-12 pl-12`}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar paciente..."
            type="search"
            value={search}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {[
            ['todos', 'Todos'],
            ...allowedChannelKeys.map((key) => [key, channels[key].label]),
          ].map(([key, label]) => (
            <button
              className={`h-12 rounded-sm border px-4 text-xs font-semibold transition ${
                channelFilter === key
                  ? 'border-[#3b82f6] bg-[#3b82f6] text-white'
                  : 'border-border-default-v2 bg-surface-page text-text-body hover:text-text-heading'
              }`}
              key={key}
              onClick={() => setChannelFilter(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-sm border border-border-default-v2">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-surface-page text-xs font-semibold uppercase tracking-[0.02em] text-text-body">
            <tr>
              <th className="px-5 py-4">Paciente</th>
              <th className="px-5 py-4">Canal</th>
              <th className="px-5 py-4">Template</th>
              <th className="px-5 py-4">Enviado em</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Resposta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default-v2 bg-surface-card">
            {messages.map((message) => (
              <MessageRow key={message.id} message={message} />
            ))}
          </tbody>
        </table>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-b-sm border-x border-b border-border-default-v2 bg-surface-page px-4 py-8 text-center text-sm text-text-muted-v2">
          Nenhuma comunicacao encontrada com os filtros atuais.
        </div>
      ) : null}
    </section>
  )
}

function TemplatesTab({ onEdit, onUse, templates }) {
  return (
    <section className="space-y-4 rounded-2xl p-4" aria-label="Templates de comunicacao">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm leading-6 text-text-muted-v2">
          Modelos prontos para contatos recorrentes da clinica. Personalize qualquer template antes de usar.
        </p>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
          onClick={() => onEdit()}
          type="button"
        >
          <CommIcon className="size-4" name="plus" />
          Novo template
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <TemplateCard key={template.id} onEdit={onEdit} onUse={onUse} template={template} />
        ))}
      </div>
    </section>
  )
}

function CampaignsTab({ campaignHistory, eligibleCount, onCreate, onResend, optedOutCount }) {
  return (
    <section className={`${cardClass} space-y-6 p-6`} aria-label="Campanhas">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <h2 className="text-lg font-bold text-text-heading">Campanhas</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted-v2">
            Uma campanha é uma comunicação enviada para um grupo de pacientes elegíveis, usando o canal, mensagem e
            recorrencia definidos pela equipe.
          </p>
          <button
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
            onClick={onCreate}
            type="button"
          >
            <CommIcon className="size-4" name="plus" />
            Criar campanha
          </button>
        </div>

        <div className="rounded-xl border border-border-default-v2 bg-surface-page p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-400">
              LGPD
            </span>
            <span className="text-sm font-bold text-text-heading">Elegibilidade</span>
          </div>
          <p className="text-xs leading-6 text-text-muted-v2">
            Pacientes com opt-out marcado no perfil não aparecem para seleção em mensagens ou campanhas.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniCount label="Elegíveis" value={eligibleCount} />
            <MiniCount label="Opt-out" value={optedOutCount} />
          </div>
        </div>
      </div>

      <CampaignHistory campaigns={campaignHistory} onResend={onResend} />
    </section>
  )
}

function ManagementTab({ campaignHistory, customTemplates, eligibleCount, onEditTemplate, onResendCampaign, optedOutCount, totalPatients }) {
  return (
    <section className="grid gap-6 lg:grid-cols-3" aria-label="Gerenciamento de comunicacao">
      <article className={`${cardClass} p-5`}>
        <h2 className="text-sm font-bold text-text-heading">Pacientes</h2>
        <div className="mt-4 grid gap-3">
          <MiniCount label="Total na API" value={totalPatients} />
          <MiniCount label="Elegíveis" value={eligibleCount} />
          <MiniCount label="Com opt-out" value={optedOutCount} />
        </div>
      </article>

      <article className={`${cardClass} p-5 lg:col-span-2`}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-bold text-text-heading">Templates personalizados</h2>
          <button className="h-9 rounded-sm bg-[#3b82f6] px-3 text-xs font-semibold text-white" onClick={() => onEditTemplate()} type="button">
            Novo template
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {customTemplates.length ? customTemplates.map((template) => (
            <button
              className="rounded-lg border border-border-default-v2 bg-surface-page p-3 text-left transition hover:border-[#3b82f6]"
              key={template.id}
              onClick={() => onEditTemplate(template)}
              type="button"
            >
              <span className="block text-sm font-semibold text-text-heading">{template.name}</span>
              <span className="mt-1 block text-xs text-text-muted-v2">{template.category} - {channels[template.channel]?.label}</span>
            </button>
          )) : (
            <p className="rounded-lg border border-dashed border-border-default-v2 p-4 text-sm text-text-muted-v2 md:col-span-2">
              Nenhum template personalizado salvo ainda.
            </p>
          )}
        </div>
      </article>

      <article className={`${cardClass} p-5 lg:col-span-3`}>
        <h2 className="text-sm font-bold text-text-heading">Campanhas salvas</h2>
        <CampaignHistory campaigns={campaignHistory} compact onResend={onResendCampaign} />
      </article>
    </section>
  )
}

function CampaignHistory({ campaigns, compact = false, onResend }) {
  if (!campaigns.length) {
    return (
      <div className="rounded-xl border border-dashed border-border-default-v2 bg-surface-page p-6 text-center text-sm text-text-muted-v2">
        Nenhuma campanha disparada ainda.
      </div>
    )
  }

  return (
    <div className={`grid gap-3 ${compact ? 'mt-4 md:grid-cols-2 xl:grid-cols-3' : ''}`}>
      {campaigns.map((campaign) => (
        <article className="rounded-xl border border-border-default-v2 bg-surface-page p-4" key={campaign.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-text-heading">{campaign.name}</h3>
              <p className="mt-1 text-xs text-text-muted-v2">
                {channels[campaign.channel]?.label} - {campaign.sentAt}
              </p>
            </div>
            <span className="rounded bg-surface-card-hover px-2 py-1 text-[10px] font-semibold text-text-muted-v2">
              {campaign.recurrenceLabel}
            </span>
          </div>
          <p className="mt-3 line-clamp-2 text-xs leading-5 text-text-muted-v2">{campaign.content}</p>
          <p className="mt-3 text-xs font-semibold text-[#51a2ff]">
            {campaign.total} pacientes - {campaign.failed} falhas
          </p>
          {campaign.nextRunAt ? (
            <p className="mt-1 text-xs text-text-muted-v2">Proxima execucao: {formatDateTime(campaign.nextRunAt)}</p>
          ) : null}
          <p className="mt-1 truncate text-xs text-text-muted-v2">{campaign.patients.join(', ')}</p>
          <button
            className="mt-4 h-9 rounded-sm border border-border-default-v2 px-3 text-xs font-semibold text-text-heading transition hover:border-[#3b82f6] hover:text-[#3b82f6]"
            onClick={() => onResend(campaign)}
            type="button"
          >
            Disparar novamente
          </button>
        </article>
      ))}
    </div>
  )
}

function StatCard({ label, value, valueClassName = 'text-text-heading' }) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="text-sm text-text-body">{label}</p>
      <p className={`mt-2 text-3xl font-bold leading-none ${valueClassName}`}>{value}</p>
    </div>
  )
}

function MiniCount({ label, value }) {
  return (
    <div className="rounded-lg bg-[#202020] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted-v2">{label}</p>
      <p className="mt-1 text-lg font-bold text-text-heading">{value}</p>
    </div>
  )
}

function MessageRow({ message }) {
  const channel = channels[message.channel] || channels.sms
  const status = statusConfig[message.status] || statusConfig.pendente

  return (
    <tr className="transition hover:bg-surface-card-hover">
      <td className="px-5 py-4 font-semibold text-text-heading">{message.patient}</td>
      <td className="px-5 py-4">
        <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold ${channel.className}`}>
          <CommIcon className="size-3.5" name={channel.icon} />
          {channel.label}
        </span>
      </td>
      <td className="px-5 py-4 text-text-body">{message.template}</td>
      <td className="px-5 py-4 text-text-body">{message.sentAt}</td>
      <td className="px-5 py-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${status.className}`}>
          <CommIcon className="size-3.5" name={status.icon} />
          {status.label}
        </span>
      </td>
      <td className="px-5 py-4 text-text-body">{message.response || '-'}</td>
    </tr>
  )
}

function TemplateCard({ onEdit, onUse, template }) {
  const channel = channels[template.channel] || channels.whatsapp

  return (
    <article className={`${cardClass} p-5`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold ${channel.className}`}>
          <CommIcon className="size-3.5" name={channel.icon} />
          {channel.label}
        </span>
        <span className="rounded bg-surface-card-hover px-2 py-0.5 text-[10px] font-semibold text-text-muted-v2">
          {template.category}
        </span>
      </div>
      <h3 className="text-sm font-bold text-text-heading">{template.name}</h3>
      <p className="mt-2 min-h-[72px] text-xs leading-6 text-text-muted-v2">{template.content}</p>
      <div className="mt-4 flex gap-2">
        <button
          className="h-9 flex-1 rounded-sm border border-border-default-v2 bg-surface-page text-xs font-semibold text-text-heading transition hover:bg-surface-card-hover"
          onClick={() => onEdit(template)}
          type="button"
        >
          {template.builtin ? 'Personalizar' : 'Editar'}
        </button>
        <button
          className="h-9 flex-1 rounded-sm bg-[#3b82f6]/10 text-xs font-semibold text-[#3b82f6] transition hover:bg-[#3b82f6]/20"
          onClick={() => onUse(template)}
          type="button"
        >
          Usar
        </button>
      </div>
    </article>
  )
}

function MessageComposer({ allowedChannelKeys, draft, onChange, onClose, onSubmit, patients, templates }) {
  const [patientSearch, setPatientSearch] = useState(draft.patient || '')
  const datalistId = 'message-patient-options'

  function update(field, value) {
    onChange((current) => ({ ...current, [field]: value }))
  }

  function selectPatientByName(value) {
    setPatientSearch(value)
    const patient = patients.find((item) => normalizeSearch(item.name) === normalizeSearch(value))
    onChange((current) => ({
      ...current,
      patientId: patient?.id || '',
      patient: patient?.name || '',
      phone: patient?.phone || '',
    }))
  }

  function applyTemplate(templateName) {
    const template = templates.find((item) => item.name === templateName)

    if (!template) {
      update('template', templateName)
      return
    }

    onChange((current) => ({
      ...current,
      channel: template.channel,
      template: template.name,
      content: template.content,
    }))
  }

  return (
    <ModalFrame branded onClose={onClose} title="Nova mensagem">
      <form className="space-y-5" onSubmit={onSubmit}>
        <DarkField label="Paciente">
          <input
            className={inputClass}
            list={datalistId}
            onChange={(event) => selectPatientByName(event.target.value)}
            placeholder="Busque por nome do paciente elegível"
            type="search"
            value={patientSearch}
          />
          <datalist id={datalistId}>
            {patients.map((patient) => (
              <option key={patient.id} label={[patient.document, patient.phone].filter(Boolean).join(' | ')} value={patient.name} />
            ))}
          </datalist>
          {patientSearch && !draft.patientId ? (
            <p className="text-xs text-amber-400">Selecione um paciente elegível sugerido pela busca.</p>
          ) : null}
        </DarkField>

        <div className="grid gap-4 md:grid-cols-2">
          <DarkField label="Canal">
            <select className={inputClass} onChange={(event) => update('channel', event.target.value)} value={draft.channel}>
              {allowedChannelKeys.map((key) => (
                <option key={key} value={key}>{channels[key].label}</option>
              ))}
            </select>
          </DarkField>
          {draft.channel === 'sms' ? (
            <DarkField label="Telefone">
              <input
                className={inputClass}
                placeholder={draft.patientId ? 'Telefone nao cadastrado' : 'Selecione um paciente'}
                readOnly
                value={draft.phone}
              />
            </DarkField>
          ) : null}
        </div>

        <DarkField label="Template">
          <select className={inputClass} onChange={(event) => applyTemplate(event.target.value)} value={draft.template}>
            <option value="Mensagem avulsa">Mensagem avulsa</option>
            {templates.map((template) => (
              <option key={template.id} value={template.name}>
                {template.name}
              </option>
            ))}
          </select>
        </DarkField>

        <DarkField label="Mensagem">
          <textarea
            className={`${textareaClass} min-h-44`}
            onChange={(event) => update('content', sanitizePlainText(event.target.value))}
            placeholder="Escreva a mensagem"
            value={draft.content}
          />
        </DarkField>

        <div className="flex justify-end gap-3 border-t border-border-default-v2 pt-4">
          <button className="h-10 rounded-sm border border-border-default-v2 px-4 text-sm font-semibold text-text-heading" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="h-10 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draft.patientId || !draft.content.trim()}
            type="submit"
          >
            Enviar
          </button>
        </div>
      </form>
    </ModalFrame>
  )
}

function CampaignComposer({ allowedChannelKeys, draft, onChange, onClose, onSubmit, patients, templates }) {
  const [patientSearch, setPatientSearch] = useState('')
  const selectedCount = draft.patientIds.length
  const filteredPatients = useMemo(() => {
    const query = normalizeSearch(patientSearch)
    if (!query) return patients
    return patients.filter((patient) =>
      [patient.name, patient.phone, patient.document, patient.email].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query),
    )
  }, [patientSearch, patients])

  function update(field, value) {
    onChange((current) => ({ ...current, [field]: value }))
  }

  function togglePatient(patientId) {
    onChange((current) => ({
      ...current,
      patientIds: current.patientIds.includes(patientId)
        ? current.patientIds.filter((id) => id !== patientId)
        : [...current.patientIds, patientId],
    }))
  }

  function applyTemplate(templateName) {
    const template = templates.find((item) => item.name === templateName)
    if (!template) {
      update('template', templateName)
      return
    }

    onChange((current) => ({
      ...current,
      channel: template.channel,
      template: template.name,
      content: template.content,
    }))
  }

  return (
    <ModalFrame branded onClose={onClose} title="Campanha">
      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <DarkField label="Nome da campanha">
            <input className={inputClass} onChange={(event) => update('name', event.target.value)} value={draft.name} />
          </DarkField>
          <DarkField label="Recorrencia automatica">
            <select className={inputClass} onChange={(event) => update('recurrence', event.target.value)} value={draft.recurrence}>
              {recurrenceOptions.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </DarkField>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <DarkField label="Canal">
            <select className={inputClass} onChange={(event) => update('channel', event.target.value)} value={draft.channel}>
              {allowedChannelKeys.map((key) => (
                <option key={key} value={key}>{channels[key].label}</option>
              ))}
            </select>
          </DarkField>
          <DarkField label="Template">
            <select className={inputClass} onChange={(event) => applyTemplate(event.target.value)} value={draft.template}>
              <option value="Mensagem avulsa">Mensagem avulsa</option>
              {templates.map((template) => (
                <option key={template.id} value={template.name}>{template.name}</option>
              ))}
            </select>
          </DarkField>
        </div>

        <DarkField label={`Pacientes elegíveis selecionados (${selectedCount})`}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                className={inputClass}
                onChange={(event) => setPatientSearch(event.target.value)}
                placeholder="Buscar por nome, CPF, telefone ou e-mail"
                type="search"
                value={patientSearch}
              />
              <button
                className="h-10 shrink-0 rounded-sm border border-border-default-v2 px-3 text-xs font-semibold text-text-heading"
                onClick={() => update('patientIds', patients.map((patient) => patient.id))}
                type="button"
              >
                Todos
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-border-default-v2 bg-surface-inset">
              {filteredPatients.length ? filteredPatients.map((patient) => (
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-text-heading hover:bg-surface-card-hover" key={patient.id}>
                  <input
                    checked={draft.patientIds.includes(patient.id)}
                    className="size-4 accent-[#3b82f6]"
                    onChange={() => togglePatient(patient.id)}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{patient.name}</span>
                    <span className="block truncate text-xs text-text-muted-v2">
                      {[patient.document, patient.phone, patient.email].filter(Boolean).join(' | ') || 'Sem contato informado'}
                    </span>
                  </span>
                </label>
              )) : (
                <p className="px-3 py-4 text-center text-xs text-text-muted-v2">Nenhum paciente elegível encontrado.</p>
              )}
            </div>
          </div>
        </DarkField>

        <DarkField label="Mensagem">
          <textarea
            className={`${textareaClass} min-h-40`}
            onChange={(event) => update('content', sanitizePlainText(event.target.value))}
            placeholder="Escreva a mensagem da campanha"
            value={draft.content}
          />
        </DarkField>

        <div className="flex justify-end gap-3 border-t border-border-default-v2 pt-4">
          <button className="h-10 rounded-sm border border-border-default-v2 px-4 text-sm font-semibold text-text-heading" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="h-10 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draft.name.trim() || !draft.content.trim() || !selectedCount}
            type="submit"
          >
            Concluir e disparar
          </button>
        </div>
      </form>
    </ModalFrame>
  )
}

function TemplateEditor({ allowedChannelKeys, draft, onChange, onClose, onSubmit, title }) {
  function update(field, value) {
    onChange((current) => ({ ...current, [field]: value }))
  }

  return (
    <ModalFrame onClose={onClose} title={title}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <DarkField label="Nome">
            <input className={inputClass} onChange={(event) => update('name', event.target.value)} value={draft.name} />
          </DarkField>
          <DarkField label="Canal">
            <select className={inputClass} onChange={(event) => update('channel', event.target.value)} value={draft.channel}>
              {allowedChannelKeys.map((key) => (
                <option key={key} value={key}>{channels[key].label}</option>
              ))}
            </select>
          </DarkField>
        </div>
        <DarkField label="Categoria">
          <input className={inputClass} onChange={(event) => update('category', event.target.value)} value={draft.category} />
        </DarkField>
        <DarkField label="Conteudo">
          <textarea className={textareaClass} onChange={(event) => update('content', sanitizePlainText(event.target.value))} value={draft.content} />
        </DarkField>
        <div className="flex justify-end gap-3 border-t border-border-default-v2 pt-4">
          <button className="h-10 rounded-sm border border-border-default-v2 px-4 text-sm font-semibold text-text-heading" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="h-10 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draft.name.trim() || !draft.content.trim()}
            type="submit"
          >
            Salvar template
          </button>
        </div>
      </form>
    </ModalFrame>
  )
}

function ModalFrame({ branded = false, children, onClose, title }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`message-modal-shell flex max-h-[94vh] w-full ${branded ? 'max-w-6xl' : 'max-w-2xl'} flex-col overflow-hidden rounded-xl border border-border-default-v2 bg-surface-card shadow-elevated`}>
        <div className="flex items-center justify-between border-b border-border-default-v2 px-5 py-4">
          <div className="flex items-center gap-3">
            {branded ? (
              <span className="grid size-9 place-items-center rounded-sm bg-[#3b82f6] text-white">
                <StethoscopeIcon className="size-5" />
              </span>
            ) : null}
            <h2 className="text-lg font-bold text-text-heading">{title}</h2>
          </div>
          <button className="grid size-9 place-items-center rounded-sm text-text-muted-v2 hover:bg-surface-card-hover" onClick={onClose} type="button">
            <CommIcon className="size-5" name="x" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

function DarkField({ children, label }) {
  return (
    <label className="space-y-2">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}

function createLocalMessage({ channel, patient, response, status, template }) {
  return {
    id: `local-${new Date().getTime()}-${patient.id}-${channel}`,
    channel,
    patient: patient.name,
    response,
    sentAt: 'Agora',
    status,
    template,
  }
}

function mergeTemplates(baseTemplates, apiTemplates) {
  const seen = new Set()
  return [...apiTemplates, ...baseTemplates].filter((template) => {
    const key = `${template.channel}-${normalizeSearch(template.name)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getRecurrenceLabel(value) {
  return recurrenceOptions.find(([key]) => key === value)?.[1] || 'Nao repetir'
}

function getNextRunAt(recurrence, from) {
  if (recurrence === 'none') return ''

  const nextDate = new Date(from)
  if (recurrence === 'weekly') nextDate.setDate(nextDate.getDate() + 7)
  if (recurrence === 'biweekly') nextDate.setDate(nextDate.getDate() + 15)
  if (recurrence === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1)
  if (recurrence === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3)

  return nextDate.toISOString()
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Agora'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function loadStoredCampaigns() {
  if (typeof window === 'undefined') return []

  try {
    const parsed = JSON.parse(window.localStorage.getItem(campaignStorageKey) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveStoredCampaigns(campaigns) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(campaignStorageKey, JSON.stringify(campaigns.slice(0, 40)))
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function CommIcon({ className = 'size-4', name }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.9,
    viewBox: '0 0 24 24',
  }

  if (name === 'message') {
    return (
      <svg {...common}>
        <path d="M5 5h14v10H8l-4 4V6a1 1 0 0 1 1-1Z" />
      </svg>
    )
  }

  if (name === 'mail') {
    return (
      <svg {...common}>
        <path d="M4 6h16v12H4z" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    )
  }

  if (name === 'phone') {
    return (
      <svg {...common}>
        <path d="M7 4h10v16H7z" />
        <path d="M11 17h2" />
      </svg>
    )
  }

  if (name === 'send') {
    return (
      <svg {...common}>
        <path d="m22 2-7 20-4-9-9-4 20-7Z" />
        <path d="M22 2 11 13" />
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

  if (name === 'search') {
    return (
      <svg {...common}>
        <path d="m21 21-4.3-4.3" />
        <circle cx="11" cy="11" r="7" />
      </svg>
    )
  }

  if (name === 'check') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </svg>
    )
  }

  if (name === 'eye') {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    )
  }

  if (name === 'x-circle') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6M15 9l-6 6" />
      </svg>
    )
  }

  if (name === 'clock') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    )
  }

  if (name === 'x') {
    return (
      <svg {...common}>
        <path d="m18 6-12 12M6 6l12 12" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M3 12h4l2-5 4 10 2-5h6" />
    </svg>
  )
}

function RemindersTab({ patients }) {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [professionals, setProfessionals] = useState([])
  const [sentReminders, setSentReminders] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mediconnect.sent_reminders.v1') || '{}')
    } catch {
      return {}
    }
  })
  const [sentConfirmations, setSentConfirmations] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mediconnect.sent_confirmations.v1') || '{}')
    } catch {
      return {}
    }
  })
  const [settings] = useState(() => getCommunicationSettings())

  useEffect(() => {
    let active = true
    async function loadData() {
      try {
        const [appts, profs] = await Promise.all([
          appointmentRepository.getAll(),
          professionalRepository.getAll().catch(() => [])
        ])
        if (!active) return
        setProfessionals(profs)

        // Filter appointments for today and tomorrow
        const todayStr = formatLocalDateInput(new Date())
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowStr = formatLocalDateInput(tomorrow)

        const filtered = appts.filter(appt => appt.date === todayStr || appt.date === tomorrowStr)
        setAppointments(filtered)
      } catch (err) {
        console.error(err)
      } finally {
        if (active) setLoading(false)
      }
    }
    loadData()
    return () => { active = false }
  }, [])

  async function handleSendReminder(appt) {
    const patient = patients.find(p => String(p.id) === String(appt.patientId))
    const prof = professionals.find(p => String(p.id) === String(appt.professionalId))
    if (!patient) {
      alert('Paciente não encontrado.')
      return
    }
    if (!patient.phone) {
      alert('Paciente não possui telefone cadastrado.')
      return
    }

    try {
      const content = settings.reminder_sms_template
        .replace('{paciente}', patient.name)
        .replace('{data}', formatLocalDatePtBr(appt.date))
        .replace('{hora}', appt.time)
        .replace('{medico}', prof?.name || appt.professional || 'Médico(a)')

      await communicationRepository.sendSms({
        patientId: patient.id,
        patientName: patient.name,
        phone: patient.phone,
        content
      })

      const updated = {
        ...sentReminders,
        [appt.id]: {
          sentAt: new Date().toISOString(),
          status: 'Sucesso'
        }
      }
      setSentReminders(updated)
      localStorage.setItem('mediconnect.sent_reminders.v1', JSON.stringify(updated))
      alert('Lembrete enviado com sucesso!')
    } catch (err) {
      const updated = {
        ...sentReminders,
        [appt.id]: {
          sentAt: new Date().toISOString(),
          status: 'Falha'
        }
      }
      setSentReminders(updated)
      localStorage.setItem('mediconnect.sent_reminders.v1', JSON.stringify(updated))
      alert('Falha ao enviar lembrete: ' + err.message)
    }
  }

  async function handleSendAllTomorrowReminders() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = formatLocalDateInput(tomorrow)

    const tomorrowAppts = appointments.filter(appt => appt.date === tomorrowStr)
    const pendingAppts = tomorrowAppts.filter(appt => !sentReminders[appt.id] || sentReminders[appt.id].status === 'Falha')

    if (pendingAppts.length === 0) {
      alert('Não há lembretes pendentes para amanhã.')
      return
    }

    let successCount = 0
    let failCount = 0
    const updatedReminders = { ...sentReminders }

    for (const appt of pendingAppts) {
      const patient = patients.find(p => String(p.id) === String(appt.patientId))
      const prof = professionals.find(p => String(p.id) === String(appt.professionalId))
      if (!patient || !patient.phone || !patient.communicationEligible) {
        updatedReminders[appt.id] = {
          sentAt: new Date().toISOString(),
          status: 'Falha'
        }
        failCount++
        continue
      }

      try {
        const content = settings.reminder_sms_template
          .replace('{paciente}', patient.name)
          .replace('{data}', formatLocalDatePtBr(appt.date))
          .replace('{hora}', appt.time)
          .replace('{medico}', prof?.name || appt.professional || 'Médico(a)')

        await communicationRepository.sendSms({
          patientId: patient.id,
          patientName: patient.name,
          phone: patient.phone,
          content
        })

        updatedReminders[appt.id] = {
          sentAt: new Date().toISOString(),
          status: 'Sucesso'
        }
        successCount++
      } catch (err) {
        updatedReminders[appt.id] = {
          sentAt: new Date().toISOString(),
          status: 'Falha'
        }
        failCount++
      }
    }

    setSentReminders(updatedReminders)
    localStorage.setItem('mediconnect.sent_reminders.v1', JSON.stringify(updatedReminders))

    alert(`Disparo concluído: ${successCount} enviados com sucesso, ${failCount} falhas.`)
  }

  function formatLocalDatePtBr(dateStr) {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length !== 3) return dateStr
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }

  if (loading) {
    return <p className="text-center text-sm text-text-muted-v2 py-8">Carregando consultas...</p>
  }

  return (
    <section className="space-y-6" aria-label="Gerenciamento de Lembretes">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-heading">Controle de Lembretes SMS</h2>
          <p className="text-xs text-text-muted-v2">Visualização de consultas para hoje e amanhã com status de envio de notificações.</p>
        </div>
        <button
          className="inline-flex h-11 items-center gap-2 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
          onClick={handleSendAllTomorrowReminders}
          type="button"
        >
          <CommIcon className="size-4" name="send" />
          Disparar Lembretes de Amanhã
        </button>
      </div>

      <div className="rounded-xl border border-border-default-v2 bg-surface-inset p-4">
        <h3 className="text-sm font-bold text-text-heading mb-2">Template Atual do Lembrete</h3>
        <p className="text-xs text-text-muted-v2 mb-2">Configure este template nas configurações de Notificações.</p>
        <div className="rounded-lg bg-surface-page p-3 text-sm text-text-body border border-border-default-v2">
          {settings.reminder_sms_template}
        </div>
      </div>

      <div className="overflow-x-auto rounded-sm border border-border-default-v2">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-surface-page text-xs font-semibold uppercase tracking-[0.02em] text-text-body">
            <tr>
              <th className="px-5 py-4">Data/Horário</th>
              <th className="px-5 py-4">Paciente</th>
              <th className="px-5 py-4">Profissional</th>
              <th className="px-5 py-4">Confirmação (Imediata)</th>
              <th className="px-5 py-4">Lembrete (24h)</th>
              <th className="px-5 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default-v2 bg-surface-card">
            {appointments.map((appt) => {
              const reminder = sentReminders[appt.id]
              const confirmation = sentConfirmations[appt.id]
              const patient = patients.find(p => String(p.id) === String(appt.patientId))

              return (
                <tr className="transition hover:bg-surface-card-hover" key={appt.id}>
                  <td className="px-5 py-4">
                    <span className="block font-semibold text-text-heading">{formatLocalDatePtBr(appt.date)}</span>
                    <span className="text-xs text-text-muted-v2">{appt.time}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="block font-semibold text-text-heading">{appt.patient}</span>
                    <span className="text-xs text-text-muted-v2">{patient?.phone || 'Sem telefone'}</span>
                  </td>
                  <td className="px-5 py-4 text-text-body">{appt.professional}</td>
                  <td className="px-5 py-4">
                    {confirmation ? (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                        confirmation.status === 'Sucesso' ? 'text-emerald-400' :
                        confirmation.status === 'Parcial' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {confirmation.status}
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted-v2">Não registrado</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {reminder ? (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                        reminder.status === 'Sucesso' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {reminder.status}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-400 font-semibold">Pendente</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      className="h-8 rounded-sm bg-[#3b82f6]/10 px-3 text-xs font-semibold text-[#3b82f6] transition hover:bg-[#3b82f6]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!patient?.phone || (reminder && reminder.status === 'Sucesso')}
                      onClick={() => handleSendReminder(appt)}
                      type="button"
                    >
                      Enviar Lembrete
                    </button>
                  </td>
                </tr>
              )
            })}
            {appointments.length === 0 && (
              <tr>
                <td className="px-5 py-8 text-center text-sm text-text-muted-v2" colSpan={6}>
                  Nenhuma consulta agendada para hoje ou amanhã.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
