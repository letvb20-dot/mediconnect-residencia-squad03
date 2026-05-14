import { useEffect, useMemo, useState } from 'react'

import { normalizeRole } from '../config/permissions.js'
import { StethoscopeIcon } from '../components/Brand.jsx'
import { communicationRepository } from '../repositories/communicationRepository.js'
import { notificationRepository } from '../repositories/notificationRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { sanitizePlainText } from '../utils/inputSanitizers.js'

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


const emptyMessage = {
  patientId: '',
  patient: '',
  phone: '',
  channel: 'whatsapp',
  template: 'Lembrete 48h',
  content: '',
}

const emptyTemplate = {
  name: '',
  channel: 'whatsapp',
  category: 'Lembrete',
  content: '',
}

const cardClass = 'rounded-2xl border border-[#404040] bg-[#262626] shadow-sm'
const inputClass =
  'h-10 w-full rounded-sm border border-[#404040] bg-[#171717] px-3 text-sm text-[#e5e5e5] outline-none transition placeholder:text-[#a3a3a3] focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20'
const textareaClass =
  'min-h-28 w-full resize-y rounded-sm border border-[#404040] bg-[#171717] px-3 py-2 text-sm leading-6 text-[#e5e5e5] outline-none transition placeholder:text-[#a3a3a3] focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20'
const labelClass = 'text-xs font-semibold uppercase tracking-[0.08em] text-[#a3a3a3]'

export function MessagesPage({ role }) {
  const normalizedRole = normalizeRole(role)
  const isSecretary = normalizedRole === 'secretaria'
  const allowedChannelKeys = useMemo(
    () => (isSecretary ? ['whatsapp', 'sms'] : Object.keys(channels)),
    [isSecretary],
  )
  const [messages, setMessages] = useState([])
  const [templates, setTemplates] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('historico')
  const [channelFilter, setChannelFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState(null)
  const [composer, setComposer] = useState(emptyMessage)
  const [templateDraft, setTemplateDraft] = useState(emptyTemplate)
  const availableTemplates = useMemo(
    () => templates.filter((template) => allowedChannelKeys.includes(template.channel)),
    [allowedChannelKeys, templates],
  )
  const patientOptions = useMemo(
    () =>
      patients.map((patient) => ({
        id: String(patient.detailId || patient.id || ''),
        name: patient.name || patient.full_name || patient.nome || 'Paciente',
        phone: patient.phone || patient.phone_mobile || patient.telefone || '',
        document: patient.cpf || patient.document || '',
      })),
    [patients],
  )
  const campaigns = useMemo(
    () => communicationRepository.getCampaigns({ patients: patientOptions }),
    [patientOptions],
  )

  useEffect(() => {
    let active = true

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
        setError(loadError.message || 'Erro ao carregar comunicação.')
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
  }, [])

  const filteredMessages = useMemo(
    () =>
      messages.filter((message) => {
        const isAllowedChannel = allowedChannelKeys.includes(message.channel)
        const matchesChannel = channelFilter === 'todos' || message.channel === channelFilter
        const query = search.trim().toLowerCase()
        const matchesSearch =
          !query ||
          [message.patient, message.template, channels[message.channel].label]
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

    setEditingTemplateId(template?.id || null)
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

  async function submitMessage(event) {
    event.preventDefault()

    if (!composer.patient.trim()) {
      return
    }

    if (!allowedChannelKeys.includes(composer.channel)) {
      alert('Canal indisponivel para o seu perfil.')
      return
    }

    let smsSent = false

    if (composer.channel === 'sms') {
      if (!composer.phone.trim()) {
        alert('Informe o telefone para enviar SMS.')
        return
      }

      try {
        await communicationRepository.sendSms({
          patientId: composer.patientId,
          patientName: composer.patient.trim(),
          phone: composer.phone.trim(),
          content: composer.content,
        })
        smsSent = true
      } catch (e) {
        alert('Falha ao disparar SMS: ' + e.message)
      }
    }

    setMessages((current) => [
      {
        id: `local-${Date.now()}`,
        patient: composer.patient.trim(),
        channel: composer.channel,
        template: composer.template.trim() || 'Mensagem avulsa',
        sentAt: 'Agora',
        status: composer.channel === 'sms' ? (smsSent ? 'entregue' : 'falha') : 'pendente',
        response: '',
      },
      ...current,
    ])
    notificationRepository.notifyCurrentUser({
      domain: 'communication',
      title: 'Comunicação registrada',
      detail: `${channels[composer.channel].label} para ${composer.patient.trim()} foi ${composer.channel === 'sms' && smsSent ? 'enviado' : 'registrado'}.`,
      patientId: composer.patientId,
    }).catch(() => null)
    setComposer(emptyMessage)
    setComposerOpen(false)
    setActiveTab('historico')
  }

  function submitTemplate(event) {
    event.preventDefault()

    if (!templateDraft.name.trim() || !templateDraft.content.trim()) {
      return
    }

    const nextTemplate = {
      id: editingTemplateId || `template-${Date.now()}`,
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#f5f5f5]">Comunicação</h1>
          <p className="mt-1 text-sm text-[#b8b8b8]">{isSecretary ? 'WhatsApp e SMS para contato operacional com pacientes' : 'WhatsApp, E-mail e SMS com pacientes carregados da API'}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {!isSecretary ? (
            <button
              className="inline-flex h-12 items-center gap-2 rounded-sm border border-[#404040] bg-[#262626] px-4 text-sm font-semibold text-[#e5e5e5] transition hover:bg-[#303030]"
              onClick={() => setActiveTab('campanha')}
              type="button"
            >
              <CommIcon className="size-4" name="send" />
              Envio em Massa
            </button>
          ) : null}
          <button
            className="inline-flex h-12 items-center gap-2 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
            onClick={() => setComposerOpen(true)}
            type="button"
          >
            <CommIcon className="size-4" name="plus" />
            Nova Mensagem
          </button>
        </div>
      </div>

      {loading ? (
        <p className={`${cardClass} p-8 text-center text-sm text-[#a3a3a3]`}>Carregando comunicação...</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Enviadas" value={stats.total} />
        <StatCard label="Entregues" value={stats.delivered} valueClassName="text-emerald-400" />
        <StatCard label="Lidas" value={stats.read} valueClassName="text-[#3b82f6]" />
        <StatCard label="Falhas" value={stats.failed} valueClassName="text-red-400" />
      </div>

      <div className="flex gap-4 border-b border-[#404040]">
        {[
          ['historico', 'Histórico'],
          ...(!isSecretary ? [['templates', 'Templates'], ['campanha', 'Campanhas']] : []),
        ].map(([key, label]) => (
          <button
            className={`border-b-2 px-2 pb-3 text-sm font-semibold transition ${
              activeTab === key
                ? 'border-[#3b82f6] text-[#3b82f6]'
                : 'border-transparent text-[#b8b8b8] hover:text-[#e5e5e5]'
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
        <section className={`${cardClass} p-5 md:p-6`} aria-label="Histórico de comunicação">
          <div className="mb-6 flex flex-col gap-3 md:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Buscar comunicação</span>
              <CommIcon
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#a3a3a3]"
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
                      : 'border-[#404040] bg-[#171717] text-[#b8b8b8] hover:text-[#e5e5e5]'
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

          <div className="overflow-x-auto rounded-sm border border-[#404040]">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-[#171717] text-xs font-semibold uppercase tracking-[0.02em] text-[#b8b8b8]">
                <tr>
                  <th className="px-5 py-4">Paciente</th>
                  <th className="px-5 py-4">Canal</th>
                  <th className="px-5 py-4">Template</th>
                  <th className="px-5 py-4">Enviado em</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Resposta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#404040] bg-[#262626]">
                {filteredMessages.map((message) => (
                  <MessageRow key={message.id} message={message} />
                ))}
              </tbody>
            </table>
          </div>

          {filteredMessages.length === 0 ? (
            <div className="rounded-b-sm border-x border-b border-[#404040] bg-[#171717] px-4 py-8 text-center text-sm text-[#a3a3a3]">
              Nenhuma comunicação encontrada com os filtros atuais.
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'templates' ? (
        <section className="space-y-4 rounded-2xl p-4" aria-label="Templates de comunicação">
          <div className="flex justify-end">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
              onClick={() => openTemplateEditor()}
              type="button"
            >
              <CommIcon className="size-4" name="plus" />
              Novo Template
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {availableTemplates.length ? availableTemplates.map((template) => (
              <TemplateCard key={template.id} onEdit={openTemplateEditor} onUse={openTemplate} template={template} />
            )) : (
              <p className={`${cardClass} p-6 text-sm text-[#a3a3a3] md:col-span-2 xl:col-span-3`}>
                Nenhum template encontrado na API. Use mensagem avulsa ou cadastre um novo template.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'campanha' ? (
        <section className={`${cardClass} p-6`} aria-label="Campanhas inteligentes">
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#303030]">
              <CommIcon className="size-8 text-[#51a2ff]" name="send" />
            </div>
            <h2 className="text-lg font-bold text-[#f5f5f5]">Campanhas Inteligentes</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#a3a3a3]">
              Crie campanhas segmentadas por perfil comportamental. A IA sugere os melhores horários e canais para
              cada paciente.
            </p>

            <div className="mx-auto mt-6 grid max-w-2xl gap-4 md:grid-cols-3">
              {campaigns.map((campaign) => (
                <div className="rounded-xl border border-[#404040] bg-[#171717] p-4 text-left" key={campaign.title}>
                  <h3 className="text-sm font-bold text-[#f5f5f5]">{campaign.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#a3a3a3]">{campaign.desc}</p>
                  <p className="mt-2 text-[10px] font-semibold text-[#51a2ff]">{campaign.count}</p>
                  <button
                    className="mt-3 h-8 w-full rounded-sm bg-[#3b82f6] text-xs font-semibold text-white transition hover:bg-[#2563eb]"
                    onClick={() => {
                      setComposer({
                        patientId: '',
                        patient: '',
                        phone: '',
                        channel: 'whatsapp',
                        template: campaign.title,
                        content: campaign.desc,
                      })
                      setComposerOpen(true)
                    }}
                    type="button"
                  >
                    Disparar
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#404040] bg-[#171717] p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-400">
                LGPD
              </span>
              <span className="text-sm font-bold text-[#f5f5f5]">Conformidade</span>
            </div>
            <p className="text-xs leading-6 text-[#a3a3a3]">
              Todas as comunicações respeitam as preferências de Opt-in/Opt-out dos pacientes. Os pacientes podem
              cancelar o recebimento de mensagens a qualquer momento, conforme exigido pela LGPD.
            </p>
          </div>
        </section>
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
          patients={patientOptions}
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
          title={editingTemplateId ? 'Editar Template' : 'Novo Template'}
        />
      ) : null}
    </div>
  )
}

function StatCard({ label, value, valueClassName = 'text-[#f5f5f5]' }) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="text-sm text-[#b8b8b8]">{label}</p>
      <p className={`mt-2 text-3xl font-bold leading-none ${valueClassName}`}>{value}</p>
    </div>
  )
}

function MessageRow({ message }) {
  const channel = channels[message.channel]
  const status = statusConfig[message.status]

  return (
    <tr className="transition hover:bg-[#303030]">
      <td className="px-5 py-4 font-semibold text-[#f5f5f5]">{message.patient}</td>
      <td className="px-5 py-4">
        <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold ${channel.className}`}>
          <CommIcon className="size-3.5" name={channel.icon} />
          {channel.label}
        </span>
      </td>
      <td className="px-5 py-4 text-[#b8b8b8]">{message.template}</td>
      <td className="px-5 py-4 text-[#b8b8b8]">{message.sentAt}</td>
      <td className="px-5 py-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${status.className}`}>
          <CommIcon className="size-3.5" name={status.icon} />
          {status.label}
        </span>
      </td>
      <td className="px-5 py-4 text-[#b8b8b8]">{message.response || '-'}</td>
    </tr>
  )
}

function TemplateCard({ onEdit, onUse, template }) {
  const channel = channels[template.channel]

  return (
    <article className={`${cardClass} p-5`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold ${channel.className}`}>
          <CommIcon className="size-3.5" name={channel.icon} />
          {channel.label}
        </span>
        <span className="rounded bg-[#303030] px-2 py-0.5 text-[10px] font-semibold text-[#a3a3a3]">
          {template.category}
        </span>
      </div>
      <h3 className="text-sm font-bold text-[#f5f5f5]">{template.name}</h3>
      <p className="mt-2 min-h-[72px] text-xs leading-6 text-[#a3a3a3]">{template.content}</p>
      <div className="mt-4 flex gap-2">
        <button
          className="h-9 flex-1 rounded-sm border border-[#404040] bg-[#171717] text-xs font-semibold text-[#e5e5e5] transition hover:bg-[#303030]"
          onClick={() => onEdit(template)}
          type="button"
        >
          Editar
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
  const filteredPatients = useMemo(() => {
    const query = normalizeSearch(patientSearch)
    if (!query) return patients

    return patients.filter((patient) =>
      [patient.name, patient.phone, patient.document]
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(query),
    )
  }, [patientSearch, patients])

  function update(field, value) {
    onChange((current) => ({ ...current, [field]: value }))
  }

  function selectPatient(patient) {
    onChange((current) => ({
      ...current,
      patientId: patient?.id || '',
      patient: patient?.name || '',
      phone: patient?.phone || patient?.phone_mobile || '',
    }))
    setPatientSearch(patient?.name || '')
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
    <ModalFrame branded onClose={onClose} title="Nova Mensagem">
      <form className="space-y-5" onSubmit={onSubmit}>
        <DarkField label="Paciente">
          <div className="space-y-2">
            <input
              className={inputClass}
              onChange={(event) => {
                setPatientSearch(event.target.value)
                onChange((current) => ({ ...current, patientId: '', patient: '', phone: '' }))
              }}
              placeholder="Digite nome, CPF ou telefone"
              type="search"
              value={patientSearch}
            />
            {!draft.patientId ? (
            <div className="max-h-44 overflow-y-auto rounded-md border border-[#404040] bg-[#1f1f1f]">
              {filteredPatients.length ? (
                filteredPatients.slice(0, 8).map((patient) => {
                  const isSelected = String(patient.id) === String(draft.patientId)
                  return (
                    <button
                      className={`block w-full px-3 py-2 text-left text-sm transition ${
                        isSelected ? 'bg-[#3b82f6]/20 text-[#e5e5e5]' : 'text-[#a3a3a3] hover:bg-[#303030] hover:text-[#e5e5e5]'
                      }`}
                      key={patient.id}
                      onClick={() => selectPatient(patient)}
                      type="button"
                    >
                      <span className="block font-semibold">{patient.name}</span>
                      <span className="mt-0.5 block text-xs text-[#737373]">
                        {[patient.document, patient.phone].filter(Boolean).join(' | ') || 'Sem documento informado'}
                      </span>
                    </button>
                  )
                })
              ) : (
                <p className="px-3 py-2 text-xs text-[#737373]">Nenhum paciente encontrado.</p>
              )}
            </div>
            ) : null}
          </div>
        </DarkField>

        <div className="grid gap-4 md:grid-cols-2">
          <DarkField label="Canal">
            <select className={inputClass} onChange={(event) => update('channel', event.target.value)} value={draft.channel}>
              {allowedChannelKeys.map((key) => (
                <option key={key} value={key}>{channels[key].label}</option>
              ))}
            </select>
          </DarkField>
        </div>

        {draft.channel === 'sms' ? (
          <DarkField label="Telefone">
            <input
              className={inputClass}
              placeholder={draft.patientId ? 'Telefone não cadastrado' : 'Selecione um paciente'}
              readOnly
              value={draft.phone}
            />
          </DarkField>
        ) : null}

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

        <div className="flex justify-end gap-3 border-t border-[#404040] pt-4">
          <button className="h-10 rounded-sm border border-[#404040] px-4 text-sm font-semibold text-[#e5e5e5]" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="h-10 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draft.patient.trim()}
            type="submit"
          >
            Enviar
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
        <DarkField label="Conteúdo">
          <textarea className={textareaClass} onChange={(event) => update('content', event.target.value)} value={draft.content} />
        </DarkField>
        <div className="flex justify-end gap-3 border-t border-[#404040] pt-4">
          <button className="h-10 rounded-sm border border-[#404040] px-4 text-sm font-semibold text-[#e5e5e5]" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="h-10 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draft.name.trim() || !draft.content.trim()}
            type="submit"
          >
            Salvar Template
          </button>
        </div>
      </form>
    </ModalFrame>
  )
}

function ModalFrame({ branded = false, children, onClose, title }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`message-modal-shell flex max-h-[94vh] w-full ${branded ? 'max-w-6xl' : 'max-w-2xl'} flex-col overflow-hidden rounded-xl border border-[#404040] bg-[#242424] shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-[#404040] px-5 py-4">
          <div className="flex items-center gap-3">
            {branded ? (
              <span className="grid size-9 place-items-center rounded-sm bg-[#3b82f6] text-white">
                <StethoscopeIcon className="size-5" />
              </span>
            ) : null}
            <h2 className="text-lg font-bold text-[#f5f5f5]">{title}</h2>
          </div>
          <button className="grid size-9 place-items-center rounded-sm text-[#a3a3a3] hover:bg-[#303030]" onClick={onClose} type="button">
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
