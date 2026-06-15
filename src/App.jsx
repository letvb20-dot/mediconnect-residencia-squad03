import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import { AppShell } from './components/AppShell.jsx'
import { canAccess, normalizeRole } from './config/permissions.js'
import { useAuth } from './hooks/useAuth.js'
import { ForgotPasswordPage, LoginPage, RegisterPage } from './pages/AuthPages.jsx'
import { NotFoundPage } from './pages/NotFoundPage.jsx'
import { patientRepository } from './repositories/patientRepository.js'

const AgendaPage = lazyPage(() => import('./pages/AgendaPage.jsx'), 'AgendaPage')
const AnalyticsPage = lazyPage(() => import('./pages/AnalyticsPage.jsx'), 'AnalyticsPage')
const AtendimentoPage = lazyPage(() => import('./pages/AtendimentoPage.jsx'), 'AtendimentoPage')
const ConsultaPage = lazyPage(() => import('./pages/AtendimentoPage.jsx'), 'ConsultaPage')
const HomePage = lazyPage(() => import('./pages/HomePage.jsx'), 'HomePage')
const LandingPage = lazyPage(() => import('./pages/LandingPage.jsx'), 'LandingPage')
const MessagesPage = lazyPage(() => import('./pages/MessagesPage.jsx'), 'MessagesPage')
const PatientDetailPage = lazyPage(() => import('./pages/PatientsPage.jsx'), 'PatientDetailPage')
const PatientsPage = lazyPage(() => import('./pages/PatientsPage.jsx'), 'PatientsPage')
const ProfilePage = lazyPage(() => import('./pages/ProfilePage.jsx'), 'ProfilePage')
const ProfessionalDetailPage = lazyPage(() => import('./pages/ProfessionalsPage.jsx'), 'ProfessionalDetailPage')
const ProfessionalsPage = lazyPage(() => import('./pages/ProfessionalsPage.jsx'), 'ProfessionalsPage')
const PatientSchedulingDetailPage = lazyPage(() => import('./pages/PatientSchedulingPage.jsx'), 'PatientSchedulingDetailPage')
const PatientSchedulingPage = lazyPage(() => import('./pages/PatientSchedulingPage.jsx'), 'PatientSchedulingPage')
const ReportsPage = lazyPage(() => import('./pages/ReportsPage.jsx'), 'ReportsPage')
const SettingsPage = lazyPage(() => import('./pages/SettingsPage.jsx'), 'SettingsPage')
const UsersPage = lazyPage(() => import('./pages/UsersPage.jsx'), 'UsersPage')
const VisitsPage = lazyPage(() => import('./pages/VisitsPage.jsx'), 'VisitsPage')
const WaitlistPage = lazyPage(() => import('./pages/WaitlistPage.jsx'), 'WaitlistPage')

const PANEL_PATHS = ['/inicio', '/home', '/dashboard']
const USERS_PATHS = ['/usuarios', '/usuários']
const ROLE_HOME_PATHS = {
  paciente: '/agendamento',
}
const FREE_TEXT_INPUT_LIMIT = 255
const FREE_TEXTAREA_LIMIT = 2000
const RICH_TEXT_LIMIT = 12000

function lazyPage(loader, exportName) {
  return lazy(() => loader().then((module) => ({ default: module[exportName] })))
}

function App() {
  const [location, setLocation] = useState(() => readLocation())
  const { isAuthenticated, role, loading: authLoading, profile, user } = useAuth()

  const navigate = useCallback((to, options = {}) => {
    if (options.replace) {
      window.history.replaceState({}, '', to)
    } else {
      window.history.pushState({}, '', to)
    }

    setLocation(readLocation())
    const hash = to.split('#')[1]
    window.requestAnimationFrame(() => {
      if (hash) {
        document.getElementById(hash)?.scrollIntoView({ block: 'start' })
      } else {
        window.scrollTo({ left: 0, top: 0 })
      }
    })
  }, [])

  useEffect(() => {
    function handlePopState() {
      setLocation(readLocation())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => attachTextLimitGuards(), [])

  const route = useMemo(
    () => resolveRoute(location.pathname, navigate, role, profile, user, isAuthenticated),
    [isAuthenticated, location.pathname, navigate, profile, role, user],
  )

  // Tela de carregamento enquanto busca o role do usuário
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-page">
        <p className="text-sm text-text-muted-v2">Carregando...</p>
      </div>
    )
  }

  // Rotas públicas (sem shell)
  if (!route.withShell) {
    return <RouteSuspense resetKey={location.pathname}>{route.element}</RouteSuspense>
  }

  // Usuário não autenticado
  if (!isAuthenticated) {
    return <LoginPage navigate={navigate} />
  }

  // Usuário autenticado mas sem permissão para a rota
  if (!role || !canAccess(role, location.pathname)) {
    const roleHomePath = ROLE_HOME_PATHS[role]
    if (roleHomePath && PANEL_PATHS.includes(location.pathname)) {
      navigate(roleHomePath, { replace: true })
      return null
    }

    return (
      <AppShell currentPath={location.pathname} navigate={navigate} role={role} routeTitle="Sem acesso">
        <UnauthorizedPage navigate={navigate} />
      </AppShell>
    )
  }

  return (
    <AppShell currentPath={location.pathname} navigate={navigate} role={role} routeTitle={route.title}>
      <RouteSuspense resetKey={location.pathname}>{route.element}</RouteSuspense>
    </AppShell>
  )
}

function attachTextLimitGuards() {
  function getFieldLimit(target) {
    if (!(target instanceof HTMLElement)) return 0

    if (target.matches('textarea')) return FREE_TEXTAREA_LIMIT
    if (target.matches('input')) {
      const type = String(target.getAttribute('type') || 'text').toLowerCase()
      if (['button', 'checkbox', 'color', 'date', 'datetime-local', 'email', 'file', 'hidden', 'month', 'number', 'password', 'radio', 'range', 'reset', 'search', 'submit', 'time', 'week'].includes(type)) {
        return 0
      }

      return FREE_TEXT_INPUT_LIMIT
    }

    return 0
  }

  function applyMaxLength(target, limit) {
    if (!limit || target.hasAttribute('readonly')) return
    const currentMax = Number(target.getAttribute('maxlength') || 0)
    if (!currentMax || currentMax > limit) target.setAttribute('maxlength', String(limit))
  }

  function handleFocusIn(event) {
    const target = event.target
    const limit = getFieldLimit(target)
    if (limit) applyMaxLength(target, limit)
  }

  function handleInput(event) {
    const target = event.target
    const limit = getFieldLimit(target)
    if (!limit || typeof target.value !== 'string' || target.value.length <= limit) return
    target.value = target.value.slice(0, limit)
  }

  function handleBeforeInput(event) {
    const target = event.target instanceof HTMLElement
      ? event.target.closest('[contenteditable="true"], .ProseMirror')
      : null
    if (!target) return

    const nextTextLength = (target.textContent || '').length + String(event.data || '').length
    if (nextTextLength > RICH_TEXT_LIMIT) event.preventDefault()
  }

  document.addEventListener('focusin', handleFocusIn, true)
  document.addEventListener('input', handleInput, true)
  document.addEventListener('beforeinput', handleBeforeInput, true)

  return () => {
    document.removeEventListener('focusin', handleFocusIn, true)
    document.removeEventListener('input', handleInput, true)
    document.removeEventListener('beforeinput', handleBeforeInput, true)
  }
}

class RouteErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return <RouteErrorFallback />
    }

    return this.props.children
  }
}

function RouteSuspense({ children, resetKey }) {
  return (
    <RouteErrorBoundary resetKey={resetKey}>
      <Suspense fallback={<RouteFallback />}>
        {children}
      </Suspense>
    </RouteErrorBoundary>
  )
}

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border border-border-default-v2 bg-surface-card p-5 shadow-card">
        <div className="h-4 w-36 animate-pulse rounded bg-surface-card-hover" />
        <div className="mt-4 grid gap-3">
          <div className="h-20 animate-pulse rounded-xl bg-surface-inset" />
          <div className="h-20 animate-pulse rounded-xl bg-surface-inset" />
        </div>
        <p className="mt-4 text-sm text-text-muted-v2">Carregando modulo...</p>
      </div>
    </div>
  )
}

function RouteErrorFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <div className="max-w-xl rounded-2xl border border-red-500/40 bg-surface-card p-6 text-center shadow-card">
        <h2 className="text-lg font-bold text-text-heading">Não foi possível carregar esta tela</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted-v2">
          Ocorreu um erro ao abrir o modulo. Recarregue a pagina e tente novamente.
        </p>
        <button
          className="mt-5 rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
          onClick={() => window.location.reload()}
          type="button"
        >
          Recarregar
        </button>
      </div>
    </div>
  )
}

function resolveRoute(pathname, navigate, role, profile, user, isAuthenticated) {
  if (pathname === '/') {
    return {
      element: <LandingPage navigate={navigate} isAuthenticated={isAuthenticated} />,
      title: 'MediConnect',
      withShell: false,
    }
  }

  if (pathname === '/login') {
    return {
      element: <LoginPage navigate={navigate} />,
      title: 'Login',
      withShell: false,
    }
  }

  if (pathname === '/cadastro') {
    return {
      element: <RegisterPage navigate={navigate} />,
      title: 'Cadastro',
      withShell: false,
    }
  }

  if (pathname === '/recuperar-senha') {
    return {
      element: <ForgotPasswordPage navigate={navigate} />,
      title: 'Recuperar senha',
      withShell: false,
    }
  }

  if (pathname === '/inicio' || pathname === '/home' || pathname === '/dashboard') {
    return {
      element: <HomePage navigate={navigate} profile={profile} role={role} user={user} />,
      title: 'Painel',
      withShell: true,
    }
  }

  if (pathname === '/agenda') {
    return {
      element: <AgendaPage navigate={navigate} role={role} />,
      title: 'Agenda',
      withShell: true,
    }
  }

  if (pathname === '/atendimento') {
    return {
      element: <AtendimentoPage navigate={navigate} role={role} profile={profile} user={user} />,
      title: 'Atendimento',
      withShell: true,
    }
  }

  if (pathname.startsWith('/atendimento/')) {
    const appointmentId = pathname.split('/')[2]
    return {
      element: <ConsultaPage navigate={navigate} role={role} profile={profile} user={user} appointmentId={appointmentId} />,
      title: 'Consulta',
      withShell: true,
    }
  }

  if (pathname === '/agendamento') {
    return {
      element: <PatientSchedulingPage navigate={navigate} />,
      title: 'Agendamento',
      withShell: true,
    }
  }

  if (pathname.startsWith('/agendamento/')) {
    const professionalId = pathname.split('/')[2]
    return {
      element: <PatientSchedulingDetailPage navigate={navigate} professionalId={professionalId} />,
      title: 'Agendamento',
      withShell: true,
    }
  }

  if (pathname === '/pacientes') {
    return {
      element: <PatientsPage navigate={navigate} role={role} />,
      title: 'Pacientes',
      withShell: true,
    }
  }

  if (pathname.startsWith('/pacientes/')) {
    const patientId = pathname.split('/')[2]
    return {
      element: <PatientDetailRoute navigate={navigate} patientId={patientId} role={role} />,
      title: 'Paciente',
      withShell: true,
    }
  }

  if (pathname === '/profissionais') {
    const isDoctorRole = normalizeRole(role) === 'medico'

    return {
      element: isDoctorRole
        ? <ProfessionalDetailPage navigate={navigate} role={role} selfProfile />
        : <ProfessionalsPage navigate={navigate} role={role} />,
      title: isDoctorRole ? 'Meu perfil profissional' : 'Profissionais',
      withShell: true,
    }
  }

  if (pathname.startsWith('/profissionais/')) {
    const professionalId = pathname.split('/')[2]
    return {
      element: <ProfessionalDetailPage navigate={navigate} professionalId={professionalId} role={role} />,
      title: 'Profissional',
      withShell: true,
    }
  }

  if (pathname === '/consultas') {
    return {
      element: <VisitsPage navigate={navigate} />,
      title: 'Lista de Espera Inteligente',
      withShell: true,
    }
  }

  if (pathname === '/lista-espera') {
    return {
      element: <WaitlistPage navigate={navigate} role={role} />,
      title: 'Lista de Espera Inteligente',
      withShell: true,
    }
  }

  if (pathname === '/laudos') {
    return {
      element: <ReportsPage navigate={navigate} role={role} />,
      title: 'Laudos',
      withShell: true,
    }
  }

  if (pathname === '/analytics' || pathname === '/relatorios') {
    return {
      element: <AnalyticsPage />,
      title: 'Analytics',
      withShell: true,
    }
  }

  if (pathname === '/comunicacao' || pathname === '/mensagens') {
    return {
      element: <MessagesPage navigate={navigate} role={role} />,
      title: 'Comunicação',
      withShell: true,
    }
  }

  if (USERS_PATHS.includes(pathname)) {
    return {
      element: <UsersPage navigate={navigate} profile={profile} role={role} />,
      title: 'Usuários',
      withShell: true,
    }
  }

  if (pathname === '/perfil') {
    return {
      element: <ProfilePage navigate={navigate} />,
      title: 'Perfil',
      withShell: true,
    }
  }

  if (pathname === '/configuracoes' || pathname === '/config') {
    return {
      element: <SettingsPage navigate={navigate} />,
      title: 'Configurações',
      withShell: true,
    }
  }

  return {
    element: <NotFoundPage navigate={navigate} />,
    title: 'Página não encontrada',
    withShell: true,
  }
}

function PatientDetailRoute({ navigate, patientId, role }) {
  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    patientRepository
      .getById(patientId)
      .then((data) => {
        if (active) setPatient(data)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [patientId])

  if (loading) {
    return <div className="pt-10 text-sm text-text-muted-v2">Carregando paciente...</div>
  }

  return patient ? (
    <PatientDetailPage navigate={navigate} patient={patient} role={role} />
  ) : (
    <NotFoundPage navigate={navigate} />
  )
}

function UnauthorizedPage({ navigate }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-5xl">🔒</p>
      <h1 className="mt-4 text-2xl font-bold text-text-heading">Acesso não permitido</h1>
      <p className="mt-2 text-sm text-text-muted-v2">
        Você não tem permissão para acessar esta página.
      </p>
      <button
        className="mt-6 rounded-lg bg-[#3b82f6] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2563eb]"
        onClick={() => navigate('/inicio')}
        type="button"
      >
        Voltar ao painel
      </button>
    </div>
  )
}

function readLocation() {
  return {
    pathname: normalizePath(window.location.pathname),
    search: window.location.search,
  }
}

function normalizePath(pathname) {
  if (!pathname || pathname === '/') {
    return '/'
  }

  const normalizedPathname = pathname.replace(/\/+$/, '')

  try {
    return decodeURIComponent(normalizedPathname)
  } catch {
    return normalizedPathname
  }
}

export default App
