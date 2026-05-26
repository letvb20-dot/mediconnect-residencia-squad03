import { useEffect, useMemo, useState } from 'react'

import { canAccess, normalizeRole, ROLE_LABELS, ROLE_NAV_ITEMS } from '../config/permissions.js'
import { authRepository } from '../repositories/authRepository.js'
import {
  NOTIFICATION_ACTION_EVENT,
  NOTIFICATIONS_CHANGED_EVENT,
  PENDING_NOTIFICATION_ACTION_KEY,
  notificationRepository,
} from '../repositories/notificationRepository.js'
import { PROFILE_AVATAR_CHANGED_EVENT, profileRepository } from '../repositories/profileRepository.js'
import { useSocketEvent } from '../providers/socketContext.js'
import { BrandLogo } from './Brand.jsx'
import { ChatbotWidget } from './ai/ChatbotWidget.jsx'

// Todos os itens de navegação com seus ícones e metadados
const ALL_NAV_ITEMS = [
  { href: '/inicio', label: 'Painel', icon: 'pulse', activePaths: ['/inicio', '/home', '/dashboard'] },
  { href: '/agenda', label: 'Agenda', icon: 'calendar' },
  { href: '/agendamento', label: 'Agendamento', icon: 'calendar' },
  { href: '/profissionais', label: 'Profissionais', icon: 'doctor' },
  { href: '/pacientes', label: 'Pacientes', icon: 'users', exact: true },
  { href: '/laudos', label: 'Relatórios', icon: 'clipboard' },
  { href: '/lista-espera', label: 'Lista de espera', icon: 'users' },
  {
    href: '/comunicacao',
    label: 'Comunicação',
    icon: 'message',
    activePaths: ['/comunicacao', '/mensagens'],
  },
  { href: '/relatorios', label: 'Analytics', icon: 'chart' },
  { href: '/configuracoes', label: 'Configurações', icon: 'settings', activePaths: ['/configuracoes', '/config'] },
]

const titles = {
  '/inicio': 'Painel',
  '/home': 'Painel',
  '/dashboard': 'Painel',
  '/agenda': 'Agenda',
  '/agendamento': 'Agendamento',
  '/consultas': 'Fila de Consultas',
  '/laudos': 'Relatórios',
  '/lista-espera': 'Lista de espera',
  '/pacientes': 'Pacientes',
  '/profissionais': 'Profissionais',
  '/comunicacao': 'Comunicação',
  '/mensagens': 'Comunicação',
  '/relatorios': 'Analytics',
  '/perfil': 'Perfil',
  '/configuracoes': 'Configurações',
  '/config': 'Configurações',
}

export function AppShell({ children, currentPath, navigate, role, routeTitle }) {
  const normalizedRole = normalizeRole(role)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [viewerProfile, setViewerProfile] = useState({ avatarUrl: '', name: 'Usuário', role: 'Usuário do Sistema' })
  const [notifications, setNotifications] = useState([])
  useSocketEvent('nova_notificacao', (payload) => {
    // Increment notifications unread
    setNotifications((prev) => [payload, ...prev])
    
    const messageDetail = payload.detail || ''
    const truncated = messageDetail.length > 50 ? `${messageDetail.substring(0, 50)}...` : messageDetail

    // Dispatch Toast
    window.dispatchEvent(new CustomEvent('app:show_toast', {
      detail: {
        title: payload.title || 'Nova Notificação',
        description: truncated || 'Você tem uma atualização na agenda.'
      }
    }))
  })

  const pageTitle = useMemo(() => {
    if (currentPath.startsWith('/pacientes/') && routeTitle) {
      return routeTitle
    }

    return routeTitle || titles[currentPath] || 'MediConnect'
  }, [currentPath, routeTitle])

  // Filtra os itens de navegação com base no role do usuário
  const navItems = useMemo(() => {
    if (!normalizedRole) return []

    const allowedPaths = ROLE_NAV_ITEMS[normalizedRole]?.map((item) => item.path) ?? []

    return ALL_NAV_ITEMS.filter((item) =>
      allowedPaths.some(
        (allowed) => item.href === allowed || item.activePaths?.includes(allowed),
      ),
    )
  }, [normalizedRole])

  const canOpenSettings = useMemo(
    () =>
      (ROLE_NAV_ITEMS[normalizedRole] ?? []).some(
        (item) => item.path === '/configuracoes' || item.path === '/config',
      ),
    [normalizedRole],
  )
  const canOpenProfile = useMemo(() => canAccess(normalizedRole, '/perfil'), [normalizedRole])
  useEffect(() => {
    let active = true

    function loadViewerProfile() {
      profileRepository
        .getCurrentUserProfile()
        .then((profile) => {
          if (!active || !profile) return

          setViewerProfile({
            avatarUrl: profile.avatarUrl || '',
            name: profile.name || 'Usuário',
            role: ROLE_LABELS[normalizedRole] || profile.role || 'Usuário do Sistema',
          })
        })
        .catch(() => {
          // Fallback: usa o label do role diretamente
          if (active && normalizedRole) {
            setViewerProfile((prev) => ({
              ...prev,
              role: ROLE_LABELS[normalizedRole] || 'Usuário do Sistema',
            }))
          }
        })
    }

    loadViewerProfile()
    window.addEventListener(PROFILE_AVATAR_CHANGED_EVENT, loadViewerProfile)

    return () => {
      active = false
      window.removeEventListener(PROFILE_AVATAR_CHANGED_EVENT, loadViewerProfile)
    }
  }, [normalizedRole])

  useEffect(() => {
    if (!profileMenuOpen && !notificationsOpen) return undefined

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false)
        setNotificationsOpen(false)
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [notificationsOpen, profileMenuOpen])

  useEffect(() => {
    let active = true

    async function loadNotifications() {
      const data = await notificationRepository.getForCurrentUser().catch(() => [])
      if (active) setNotifications(data)
    }

    loadNotifications()
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, loadNotifications)
    window.addEventListener('storage', loadNotifications)

    return () => {
      active = false
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, loadNotifications)
      window.removeEventListener('storage', loadNotifications)
    }
  }, [])

  function goTo(path) {
    setMenuOpen(false)
    setProfileMenuOpen(false)
    setNotificationsOpen(false)
    navigate(path)
  }

  function handleNotificationClick(notification) {
    const route = notification.route || getNotificationRoute(notification)
    const action = notification.action || null

    setNotificationsOpen(false)

    if (action) {
      sessionStorage.setItem(PENDING_NOTIFICATION_ACTION_KEY, JSON.stringify(action))
      window.dispatchEvent(new CustomEvent(NOTIFICATION_ACTION_EVENT, { detail: action }))
    }

    if (route) {
      navigate(route)
    }
  }

  async function handleLogout() {
    setProfileMenuOpen(false)
    await authRepository.logout()
    navigate('/login', { replace: true })
  }

  function toggleSidebarCollapsed() {
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) {
      return
    }

    setSidebarCollapsed((current) => !current)
  }

  return (
    <div className="min-h-screen bg-surface-page text-text-body">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-primary"
        href="#app-content"
      >
        Pular para conteúdo
      </a>

      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-40 flex w-56 -translate-x-full flex-col border-r border-border-subtle bg-surface-card shadow-[1px_0_3px_rgba(15,23,42,0.03)] transition-all duration-200 lg:translate-x-0 ${
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-56'
        } ${
          menuOpen ? 'translate-x-0' : ''
        }`}
      >
        <div className={`flex h-16 items-center border-b border-border-subtle px-3 ${sidebarCollapsed ? 'lg:justify-center' : ''}`}>
          <BrandLogo
            iconClassName="app-sidebar-brand-icon size-8 rounded-sm"
            iconButtonLabel={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            markClassName="size-5"
            onIconClick={toggleSidebarCollapsed}
            textClassName={`app-sidebar-brand-text text-xl font-bold leading-7 tracking-[-0.025em] text-text-heading ${sidebarCollapsed ? 'lg:hidden' : ''}`}
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pt-4" aria-label="Principal">
          <div className="space-y-1">
            {navItems.map((item) => (
              <NavItem
                active={isActive(currentPath, item)}
                item={item}
                key={`${item.label}-${item.href}`}
                onNavigate={goTo}
                sidebarCollapsed={sidebarCollapsed}
              />
            ))}
          </div>
        </nav>

        <div className="p-3">
          <button
            className={`app-sidebar-profile-card w-full rounded-lg border border-border-default-v2 bg-surface-card-hover text-left transition hover:border-border-strong hover:bg-surface-elevated ${
              sidebarCollapsed ? 'grid h-10 place-items-center px-0 py-0 lg:rounded-full' : 'px-3 py-2.5'
            }`}
            onClick={() => goTo(canOpenProfile ? '/perfil' : '/configuracoes')}
            title={sidebarCollapsed ? `${viewerProfile.name} - ${viewerProfile.role}` : undefined}
            type="button"
          >
            {sidebarCollapsed ? (
              <span className="app-sidebar-profile-initials text-xs font-bold text-accent-primary">{getInitials(viewerProfile.name)}</span>
            ) : (
              <>
                <p className="app-sidebar-profile-name truncate text-xs font-semibold text-text-heading">{viewerProfile.name}</p>
                <p className="app-sidebar-profile-role mt-0.5 truncate text-[11px] leading-4 text-text-muted-v2">{viewerProfile.role}</p>
              </>
            )}
          </button>
        </div>
      </aside>

      {menuOpen ? (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      ) : null}

      <div className={`transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-56'}`}>
        <header className="app-topbar sticky top-0 z-20 h-auto border-b border-border-subtle bg-surface-card/80 px-4 py-3 backdrop-blur-xl md:px-8 lg:h-16 lg:py-0">
          <div className="flex h-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <button
                aria-label="Abrir menu"
                className="app-topbar-menu-button rounded-lg border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm font-semibold text-text-heading lg:hidden"
                onClick={() => setMenuOpen(true)}
                type="button"
              >
                Menu
              </button>
            </div>

            <div className="flex items-center gap-6">
              <div className="relative z-30">
                <button
                  aria-expanded={notificationsOpen}
                  aria-haspopup="menu"
                  aria-label="Notificações"
                  className="app-topbar-icon-button relative grid size-8 place-items-center text-text-muted-v2 transition hover:text-text-heading"
                  onClick={() => {
                    setNotificationsOpen((open) => {
                      const nextOpen = !open
                      if (nextOpen) notificationRepository.markAllReadForCurrentUser().catch(() => null)
                      return nextOpen
                    })
                    setProfileMenuOpen(false)
                  }}
                  type="button"
                >
                  <BellIcon className="size-5" />
                  {notifications.some((notification) => !notification.read) ? (
                    <span className="absolute right-0 top-0 grid size-4 place-items-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white ring-2 ring-[var(--surface-elevated)]">
                      {notifications.filter((notification) => !notification.read).length}
                    </span>
                  ) : null}
                </button>

                {notificationsOpen ? (
                  <div
                    aria-label="Notificações"
                    className="absolute right-0 top-12 z-50 w-80 rounded-md border border-[var(--border-default)] bg-[var(--surface-elevated)] p-2 shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
                    role="dialog"
                    data-state="open"
                  >
                    <div className="flex items-center justify-between px-2 py-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Notificações</p>
                    </div>
                    <div className="my-1 h-px bg-[var(--border-default)]" />
                    <div className="max-h-[18rem] space-y-1 overflow-y-auto pr-1">
                      {notifications.length ? notifications.map((notification) => (
                        <button
                          className="w-full rounded-md border border-transparent px-2 py-2 text-left transition hover:border-border-default-v2 hover:bg-surface-card-hover"
                          key={notification.id}
                          onClick={() => handleNotificationClick(notification)}
                          role="menuitem"
                          type="button"
                        >
                          <span className="flex items-start gap-3">
                            <NotificationIcon domain={notification.domain} channel={notification.channel} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-[var(--text-primary)]">{notification.title}</span>
                              <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)] truncate">{notification.detail}</span>
                            </span>
                            <span className="shrink-0 text-[10px] font-semibold text-[var(--accent-primary, #3b82f6)]">{formatNotificationTime(notification.createdAt)}</span>
                          </span>
                        </button>
                      )) : (
                        <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 text-center">
                          <svg className="size-12 text-[var(--text-muted)] opacity-30" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            <path d="M17 6h3l-3 4h3" />
                            <path d="M20 1h2l-2 3h2" />
                          </svg>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Tudo tranquilo por aqui.</p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">Você não tem novas notificações.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <span className="app-topbar-divider hidden h-6 w-px bg-border-default-v2 sm:block" aria-hidden="true" />

              <div className="relative z-30">
                <button
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                  className="app-topbar-profile-trigger flex min-w-0 items-center gap-3 rounded-lg px-1.5 py-1 text-left transition hover:bg-surface-card-hover focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/40"
                  onClick={() => {
                    setProfileMenuOpen((open) => !open)
                    setNotificationsOpen(false)
                  }}
                  type="button"
                >
                  <ProfileAvatar
                    avatarUrl={viewerProfile.avatarUrl}
                    className="app-topbar-avatar size-8 text-xs ring-2 ring-[#3b82f6]/20"
                    name={viewerProfile.name}
                  />
                  <span className="hidden min-w-0 sm:block">
                    <span className="app-topbar-profile-name block max-w-40 truncate text-sm font-semibold leading-4 text-text-heading">
                      {viewerProfile.name}
                    </span>
                    <span className="app-topbar-profile-role mt-0.5 block max-w-40 truncate text-[11px] font-medium leading-4 text-accent-primary">
                      {viewerProfile.role}
                    </span>
                  </span>
                  <ChevronDownIcon className="app-topbar-chevron hidden size-4 text-text-muted-v2 sm:block" />
                </button>

                {profileMenuOpen ? (
                  <div
                    aria-label="Menu do usuário"
                    className="absolute right-0 top-12 z-30 w-56 rounded-lg border border-border-default-v2 bg-surface-card p-1 shadow-elevated"
                    role="menu"
                  >
                    {canOpenProfile ? (
                      <button
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-text-heading transition hover:bg-surface-card-hover"
                        onClick={() => goTo('/perfil')}
                        role="menuitem"
                        type="button"
                      >
                        <ProfileAvatar
                          avatarUrl={viewerProfile.avatarUrl}
                          className="size-4 text-[9px]"
                          name={viewerProfile.name}
                        />
                        Ver perfil
                      </button>
                    ) : null}

                    {canOpenSettings ? (
                      <button
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-text-heading transition hover:bg-surface-card-hover"
                        onClick={() => goTo('/configuracoes')}
                        role="menuitem"
                        type="button"
                      >
                        <AppIcon className="size-4 text-text-muted-v2" name="settings" />
                        Configurações
                      </button>
                    ) : null}

                    <div className="my-1 h-px bg-border-default-v2" />

                    <button
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#f87171] transition hover:bg-surface-card-hover"
                      onClick={handleLogout}
                      role="menuitem"
                      type="button"
                    >
                      <LogoutIcon className="size-4" />
                      Sair
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="page-enter w-full px-4 py-6 md:px-8 md:py-8" id="app-content">
          <div className="sr-only" aria-live="polite">
            {pageTitle}
          </div>
          {children}
        </main>
      </div>

      <ChatbotWidget navigate={navigate} role={role} />
    </div>
  )
}

function NavItem({ active, item, onNavigate, sidebarCollapsed = false }) {
  return (
    <a
      aria-current={active ? 'page' : undefined}
      aria-label={sidebarCollapsed ? item.label : undefined}
      className={`app-sidebar-nav-item flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
        active
          ? 'border-l-[3px] border-l-accent-primary bg-gradient-to-r from-[#3b82f6]/10 to-transparent text-accent-primary'
          : 'border-l-[3px] border-l-transparent text-text-muted-v2 hover:bg-surface-card-hover hover:text-text-heading'
      }`}
      href={item.href}
      onClick={(event) => {
        event.preventDefault()
        onNavigate(item.href)
      }}
      title={sidebarCollapsed ? item.label : undefined}
    >
      <AppIcon className={`size-5 shrink-0 ${sidebarCollapsed ? 'lg:mx-auto' : ''}`} name={item.icon} />
      <span className={sidebarCollapsed ? 'lg:hidden' : ''}>{item.label}</span>
    </a>
  )
}

function ProfileAvatar({ avatarUrl = '', className = 'size-8 text-xs', name }) {
  const [failedUrl, setFailedUrl] = useState('')
  const hasAvatar = Boolean(avatarUrl) && failedUrl !== avatarUrl

  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/15 font-bold text-accent-primary ${className}`}>
      {hasAvatar ? (
        <img
          alt=""
          className="size-full object-cover"
          onError={() => setFailedUrl(avatarUrl)}
          src={avatarUrl}
        />
      ) : (
        getInitials(name)
      )}
    </span>
  )
}

function isActive(pathname, item) {
  if (item.activePaths?.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return true
  }

  if (item.activePrefixes?.some((path) => pathname.startsWith(path))) {
    return true
  }

  if (item.exact) {
    return pathname === item.href
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

function getNotificationRoute(notification) {
  if (notification.patientId && notification.domain === 'patients') {
    return `/pacientes/${notification.patientId}`
  }

  const domainRoutes = {
    agenda: '/agenda',
    communication: '/comunicacao',
    comunicacao: '/comunicacao',
    'medical-records': '/prontuario',
    medical_records: '/prontuario',
    prontuario: '/prontuario',
    reports: '/laudos',
    relatorios: '/laudos',
  }

  return domainRoutes[notification.domain] || ''
}

function AppIcon({ className = 'size-5', name }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
  }

  if (name === 'calendar') {
    return (
      <svg {...common}>
        <path d="M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      </svg>
    )
  }

  if (name === 'users') {
    return (
      <svg {...common}>
        <path d="M16 19a4 4 0 0 0-8 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 19a3 3 0 0 0-3-3M4 19a3 3 0 0 1 3-3" />
      </svg>
    )
  }

  if (name === 'doctor') {
    return (
      <svg {...common}>
        <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
        <path d="M17.5 11.5h3M19 10v3" />
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

  if (name === 'clipboard') {
    return (
      <svg {...common}>
        <path d="M9 5h6M9 5a3 3 0 0 1 6 0M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M8 13h8M8 17h5" />
      </svg>
    )
  }

  if (name === 'message') {
    return (
      <svg {...common}>
        <path d="M5 5h14v10H8l-4 4V6a1 1 0 0 1 1-1Z" />
      </svg>
    )
  }

  if (name === 'chart') {
    return (
      <svg {...common}>
        <path d="M4 17 9 11l4 4 7-9" />
        <path d="M4 20h16" />
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

  if (name === 'settings') {
    return (
      <svg {...common}>
        <path d="M12 3v3M12 18v3M4.9 4.9 7 7M17 17l2.1 2.1M3 12h3M18 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M3 12h4l2-5 4 10 2-5h6" />
    </svg>
  )
}

function BellIcon({ className = 'size-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  )
}

function LogoutIcon({ className = 'size-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M10 17 15 12l-5-5" />
      <path d="M15 12H3" />
      <path d="M21 3v18" />
    </svg>
  )
}

function ChevronDownIcon({ className = 'size-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function getInitials(name) {
  return String(name || 'US')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function formatNotificationTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
  if (diffMinutes < 1) return 'agora'
  if (diffMinutes < 60) return `${diffMinutes} min`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} h`

  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)
}

function NotificationIcon({ domain, channel }) {
  if (domain === 'communication' || domain === 'comunicacao') {
    if (channel === 'whatsapp') {
      return (
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-elevated)] border border-[var(--border-default)] text-[var(--accent-primary)] shadow-sm">
          <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </div>
      )
    }
    if (channel === 'email') {
      return (
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] shadow-sm">
          <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>
      )
    }
    // SMS / Default Communication
    return (
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] shadow-sm">
        <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
    )
  }

  if (domain === 'medical-records' || domain === 'prontuario') {
    return (
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-elevated)] border border-[var(--border-default)] text-[var(--accent-primary)] shadow-sm">
        <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
        </svg>
      </div>
    )
  }

  if (domain === 'reports' || domain === 'relatorios') {
    return (
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] shadow-sm">
        <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 18h8" />
          <path d="M8 14h8" />
          <path d="M8 10h2" />
        </svg>
      </div>
    )
  }

  // Default Agenda Icon
  return (
    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-transparent text-[var(--text-muted)]">
      <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
        <line x1="16" x2="16" y1="2" y2="6" />
        <line x1="8" x2="8" y1="2" y2="6" />
        <line x1="3" x2="21" y1="10" y2="10" />
      </svg>
    </div>
  )
}
