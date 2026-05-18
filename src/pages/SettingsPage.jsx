import { useEffect, useState } from 'react'

import { useAccessibility } from '../contexts/AccessibilityContext.jsx'
import { settingsRepository } from '../repositories/settingsRepository.js'
import { getStoredTheme, setStoredTheme } from '../utils/theme.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.jsx'
import { Switch } from '../components/ui/switch.jsx'

const SETTINGS_UI_KEY = 'mediconnect.settings.ui'
const cardClass = 'rounded-2xl border border-[#404040] bg-[#262626] shadow-sm'
const rowClass = 'flex items-center justify-between gap-6 border-b border-[#404040] py-4 last:border-0'
const inputClass =
  'h-10 rounded-sm border border-[#404040] bg-[#171717] px-3 text-sm text-[#e5e5e5] outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20'

export function SettingsPage() {
  const sections = settingsRepository.getSections()
  const [activeSection, setActiveSection] = useState('aparencia')

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-[#f5f5f5]">Configurações</h1>
        <p className="mt-1 text-sm text-[#b8b8b8]">Gerencie preferências, segurança e integrações do MediConnect</p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="lg:w-64" aria-label="Seções de configuração">
          <div className={`${cardClass} flex flex-col gap-1 p-2`}>
            {sections.map((item) => (
              <button
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                  activeSection === item.id
                    ? 'bg-[#3b82f6]/10 text-[#3b82f6]'
                    : 'text-[#a3a3a3] hover:bg-[#303030] hover:text-[#e5e5e5]'
                }`}
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                type="button"
              >
                <SettingsIcon className="size-4 shrink-0" name={item.icon} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-none">{item.label}</span>
                  <span className="mt-1 block truncate text-[11px] opacity-70">{item.description}</span>
                </span>
              </button>
            ))}
          </div>
        </nav>

        <section className={`${cardClass} min-w-0 flex-1 p-6 lg:p-8`}>
          {activeSection === 'aparencia' ? <AppearanceSection /> : null}
          {activeSection === 'notificacoes' ? <NotificationsSection /> : null}
          {activeSection === 'conta' ? <AccountSection /> : null}
          {activeSection === 'integracoes' ? <IntegrationsSection /> : null}
          {activeSection === 'privacidade' ? <PrivacySection /> : null}
          {activeSection === 'dados' ? <DataSection /> : null}
        </section>
      </div>
    </div>
  )
}

function AppearanceSection() {
  const { isHighContrast, toggleHighContrast } = useAccessibility()
  const [theme, setTheme] = useState(() => getStoredTheme())
  const [ui, setUi] = useState(() => getStoredUiSettings())

  useEffect(() => {
    localStorage.setItem(SETTINGS_UI_KEY, JSON.stringify(ui))
    document.documentElement.classList.toggle('settings-animations-off', !ui.animations)
    
    document.documentElement.classList.remove('text-scale-sm', 'text-scale-standard', 'text-scale-lg')
    if (ui.typographicScale) {
      document.documentElement.classList.add(`text-scale-${ui.typographicScale}`)
    }
  }, [ui])

  function handleThemeChange(nextTheme) {
    setTheme(setStoredTheme(nextTheme))
  }

  function updateUi(field, value) {
    setUi((current) => ({ ...current, [field]: value }))
  }

  return (
    <SectionFrame description="Personalize a interface do MediConnect." title="Aparência e Acessibilidade">
      <div className="mb-8">
        <p className="mb-4 text-sm font-semibold text-[#e5e5e5]">Tema da interface</p>
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          {[
            { id: 'dark', label: 'Escuro', preview: 'bg-[#0a0a0a]' },
            { id: 'light', label: 'Claro', preview: 'bg-[#f4f7fb]' },
          ].map((item) => (
            <button
              className={`rounded-2xl border-2 p-4 text-left transition ${
                theme === item.id
                  ? item.id === 'dark'
                    ? 'border-[#737373] bg-[#171717] shadow-md shadow-black/30'
                    : 'border-[#3b82f6] bg-[#3b82f6]/5 shadow-md shadow-[#3b82f6]/20'
                  : 'border-[#404040] bg-[#262626] hover:border-[#737373]'
              }`}
              key={item.id}
              onClick={() => handleThemeChange(item.id)}
              type="button"
            >
              <span className={`settings-theme-preview ${item.id === 'dark' ? 'settings-theme-preview-dark' : 'settings-theme-preview-light'} mb-3 flex h-20 flex-col gap-1.5 overflow-hidden rounded-xl border border-[#404040] p-2 ${item.preview}`}>
                <span className={`settings-theme-preview-bar h-2.5 rounded ${item.id === 'dark' ? 'bg-[#262626]' : 'bg-white'}`} />
                <span className="flex flex-1 gap-1">
                  <span className={`settings-theme-preview-side w-8 rounded ${item.id === 'dark' ? 'bg-[#171717]' : 'bg-white'}`} />
                  <span className="flex flex-1 flex-col justify-center gap-1">
                    <span className={`settings-theme-preview-line h-1.5 w-3/4 rounded-full ${item.id === 'dark' ? 'bg-[#525252]' : 'bg-[#dde8f7]'}`} />
                    <span className={`settings-theme-preview-line h-1.5 w-1/2 rounded-full ${item.id === 'dark' ? 'bg-[#404040]' : 'bg-[#dde8f7]'}`} />
                  </span>
                </span>
              </span>
              <span className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#e5e5e5]">{item.label}</span>
                {theme === item.id ? <span className="grid size-5 place-items-center rounded-full bg-[#3b82f6] text-[11px] text-white">✓</span> : null}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-[#a3a3a3]">A preferência de tema é salva localmente.</p>
      </div>

      <SettingsGroup>
        <ToggleRow checked={ui.animations} description="Transições suaves entre telas e componentes" label="Animações de interface" onChange={(value) => updateUi('animations', value)} />
        <ToggleRow checked={isHighContrast} description="Aumenta o contraste dos elementos para melhor acessibilidade" label="Modo de alto contraste" onChange={toggleHighContrast} />
        
        <SettingRow description="Define o tamanho base da interface" label="Escala Tipográfica">
          <div className="w-48">
            <Select value={ui.typographicScale} onValueChange={(val) => updateUi('typographicScale', val)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tamanho" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Pequena (14px)</SelectItem>
                <SelectItem value="standard">Padrão (16px)</SelectItem>
                <SelectItem value="lg">Grande (18px)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingRow>

        <SettingRow description="Idioma de exibição do sistema" label="Idioma do sistema">
          <div className="w-48">
            <Select value={ui.language} onValueChange={(val) => updateUi('language', val)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o idioma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-br">Português (BR)</SelectItem>
                <SelectItem value="en-us">English (US)</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingRow>
      </SettingsGroup>
    </SectionFrame>
  )
}

function NotificationsSection() {
  const [agenda, setAgenda] = useState(true)
  const [communication, setCommunication] = useState(true)
  const [records, setRecords] = useState(true)
  const [reports, setReports] = useState(true)

  return (
    <SectionFrame description="Escolha quais eventos aparecem no sino de notificações." title="Notificações">
      <SettingsGroup>
        <ToggleRow checked={agenda} description="Marcações, alterações e cancelamentos de consulta" label="Agenda" onChange={setAgenda} />
        <ToggleRow checked={communication} description="Mensagens e contatos registrados" label="Comunicação" onChange={setCommunication} />
        <ToggleRow checked={records} description="Criação e edição de prontuários" label="Prontuário" onChange={setRecords} />
        <ToggleRow checked={reports} description="Criação e edição de relatórios" label="Relatórios" onChange={setReports} />
      </SettingsGroup>
    </SectionFrame>
  )
}

function AccountSection() {
  return (
    <SectionFrame description="Atalhos de conta do usuário logado." title="Conta & Perfil">
      <SettingsGroup>
        <SettingRow description="Nome, telefone, foto e unidade padrão" label="Dados do perfil">
          <a className="h-9 rounded-sm border border-[#404040] bg-[#303030] px-3 py-2 text-sm font-semibold text-[#e5e5e5]" href="/perfil">
            Abrir perfil
          </a>
        </SettingRow>
        <SettingRow description="Preferências locais desta sessão" label="Preferências">
          <span className="text-sm text-[#a3a3a3]">Ativas</span>
        </SettingRow>
      </SettingsGroup>
    </SectionFrame>
  )
}

function IntegrationsSection() {
  return (
    <SectionFrame description="Configure integrações externas usadas pela operação." title="Integrações">
      <div className="grid gap-4 md:grid-cols-2">
        {[
          ['WhatsApp', 'Envio de mensagens para pacientes'],
          ['E-mail', 'Envio de PDFs e comunicados'],
          ['SMS', 'Lembretes transacionais'],
          ['Armazenamento', 'Avatares e documentos'],
        ].map(([title, description]) => (
          <div className="rounded-xl border border-[#404040] bg-[#171717] p-4" key={title}>
            <p className="text-sm font-semibold text-[#f5f5f5]">{title}</p>
            <p className="mt-1 text-xs leading-5 text-[#a3a3a3]">{description}</p>
            <span className="mt-3 inline-flex rounded bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-400">Disponível</span>
          </div>
        ))}
      </div>
    </SectionFrame>
  )
}

function PrivacySection() {
  const [twoFactor, setTwoFactor] = useState(false)
  const [audit, setAudit] = useState(true)
  const [anonymous, setAnonymous] = useState(false)

  return (
    <SectionFrame description="Gerencie conformidade com a Lei Geral de Proteção de Dados." title="Privacidade & LGPD">
      <div className="mb-6 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <SettingsIcon className="mt-0.5 size-5 shrink-0 text-amber-400" name="alert" />
        <div>
          <p className="text-sm font-semibold text-amber-400">Conformidade LGPD ativa</p>
          <p className="mt-1 text-xs leading-5 text-[#a3a3a3]">Dados de pacientes são tratados com finalidade legítima e armazenados com segurança.</p>
        </div>
      </div>

      <Subsection title="Segurança de acesso">
        <ToggleRow checked={twoFactor} description="Adiciona uma camada extra de segurança ao login" label="Autenticação de dois fatores (2FA)" onChange={setTwoFactor} />
        <SettingRow description="Desconectar automaticamente após inatividade" label="Tempo de sessão">
          <select className={inputClass} defaultValue="30">
            <option value="30">30 minutos</option>
            <option value="60">1 hora</option>
            <option value="240">4 horas</option>
          </select>
        </SettingRow>
        <ToggleRow checked={audit} description="Registrar todas as ações realizadas no sistema" label="Log de auditoria" onChange={setAudit} />
      </Subsection>

      <Subsection title="Dados dos pacientes">
        <ToggleRow checked={anonymous} description="Ocultar dados pessoais identificáveis nos relatórios exportados" label="Anonimizar em relatórios" onChange={setAnonymous} />
        <SettingRow description="Período de armazenamento de dados inativos" label="Retenção de dados">
          <select className={inputClass} defaultValue="5">
            <option value="1">1 ano</option>
            <option value="3">3 anos</option>
            <option value="5">5 anos (padrão)</option>
            <option value="10">10 anos</option>
          </select>
        </SettingRow>
        <SettingRow description="Gerar relatório completo para atender solicitação de titular" label="Exportar dados do paciente">
          <button className="h-9 rounded-sm border border-[#404040] bg-[#303030] px-3 text-sm font-semibold text-[#e5e5e5]" type="button">Exportar</button>
        </SettingRow>
      </Subsection>
    </SectionFrame>
  )
}

function DataSection() {
  return (
    <SectionFrame description="Exporte, importe e gerencie backups do sistema." title="Dados & Backup">
      <Subsection title="Exportação de dados">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['Pacientes (CSV)', 'Lista completa com dados cadastrais'],
            ['Prontuários (PDF)', 'Registros médicos do período'],
            ['Relatório geral (PDF)', 'Dashboard executivo completo'],
          ].map(([label, desc]) => (
            <button className="flex items-center gap-3 rounded-xl border border-[#404040] bg-[#171717] p-4 text-left transition hover:border-[#3b82f6]/40" key={label} type="button">
              <span className="grid size-9 place-items-center rounded-lg bg-[#3b82f6]/10 text-[#3b82f6]">
                <SettingsIcon className="size-4" name="download" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-[#f5f5f5]">{label}</span>
                <span className="block text-xs text-[#a3a3a3]">{desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Subsection>

      <Subsection title="Backup automático">
        <SettingRow description="Salvar snapshot diário dos dados" label="Backup automático">
          <ToggleSwitch checked onChange={() => {}} />
        </SettingRow>
        <SettingRow description="Com que frequência o backup é realizado" label="Frequência">
          <select className={inputClass} defaultValue="daily">
            <option value="daily">Diário (00h)</option>
            <option value="12h">A cada 12h</option>
            <option value="weekly">Semanal</option>
          </select>
        </SettingRow>
        <SettingRow description="30/03/2026 às 00:15" label="Último backup">
          <button className="h-9 rounded-sm border border-[#404040] bg-[#303030] px-3 text-sm font-semibold text-[#e5e5e5]" type="button">Baixar</button>
        </SettingRow>
      </Subsection>
    </SectionFrame>
  )
}

function SectionFrame({ children, description, title }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#f5f5f5]">{title}</h2>
        <p className="mt-1 text-sm text-[#a3a3a3]">{description}</p>
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  )
}

function Subsection({ children, title }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#a3a3a3]">{title}</p>
      <SettingsGroup>{children}</SettingsGroup>
    </div>
  )
}

function SettingsGroup({ children }) {
  return <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-6">{children}</div>
}

function ToggleRow({ checked, description, label, onChange }) {
  return (
    <SettingRow description={description} label={label}>
      <Switch checked={checked} onCheckedChange={onChange} />
    </SettingRow>
  )
}

function SettingRow({ children, description, label }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-[var(--border-default)] py-4 last:border-0">
      <div className="min-w-0 flex-1 pr-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      aria-checked={checked}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-[#3b82f6]' : 'bg-[#303030]'}`}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className={`inline-block size-4 rounded-full bg-white shadow-md transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function getStoredUiSettings() {
  try {
    return { animations: true, contrast: false, typographicScale: 'standard', language: 'pt-br', ...JSON.parse(localStorage.getItem(SETTINGS_UI_KEY) || '{}') }
  } catch {
    return { animations: true, contrast: false, typographicScale: 'standard', language: 'pt-br' }
  }
}

function SettingsIcon({ className = 'size-4', name }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.9,
    viewBox: '0 0 24 24',
  }

  if (name === 'shield') return <svg {...common}><path d="M12 3 5 6v5c0 4 3 7.5 7 10 4-2.5 7-6 7-10V6l-7-3Z" /></svg>
  if (name === 'database') return <svg {...common}><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>
  if (name === 'download') return <svg {...common}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
  if (name === 'bell') return <svg {...common}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
  if (name === 'user') return <svg {...common}><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></svg>
  if (name === 'plug') return <svg {...common}><path d="M9 7V3M15 7V3M7 11h10M8 7h8v5a4 4 0 0 1-8 0V7ZM12 16v5" /></svg>
  if (name === 'alert') return <svg {...common}><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5M12 18h.01" /></svg>

  return <svg {...common}><path d="M12 3v3M12 18v3M4.9 4.9 7 7M17 17l2.1 2.1M3 12h3M18 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /><circle cx="12" cy="12" r="3" /></svg>
}
