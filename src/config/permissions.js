// Roles disponíveis no sistema
export const ROLES = {
  ADMIN: 'admin',
  GESTOR: 'gestor',
  MEDICO: 'medico',
  SECRETARIA: 'secretaria',
  PACIENTE: 'paciente',
}

const ROLE_ALIASES = {
  admin: ROLES.ADMIN,
  administrador: ROLES.ADMIN,
  administrator: ROLES.ADMIN,
  gestor: ROLES.GESTOR,
  gestao: ROLES.GESTOR,
  gestao_coordenacao: ROLES.GESTOR,
  coordenacao: ROLES.GESTOR,
  coordenador: ROLES.GESTOR,
  manager: ROLES.GESTOR,
  medico: ROLES.MEDICO,
  medica: ROLES.MEDICO,
  medico_a: ROLES.MEDICO,
  profissional_medico: ROLES.MEDICO,
  profissional_medica: ROLES.MEDICO,
  profissional_de_saude: ROLES.MEDICO,
  medical: ROLES.MEDICO,
  doctor: ROLES.MEDICO,
  physician: ROLES.MEDICO,
  secretaria: ROLES.SECRETARIA,
  secretario: ROLES.SECRETARIA,
  secretaria_o: ROLES.SECRETARIA,
  secretaria_clinica: ROLES.SECRETARIA,
  secretario_clinico: ROLES.SECRETARIA,
  recepcao: ROLES.SECRETARIA,
  recepcionista: ROLES.SECRETARIA,
  atendente: ROLES.SECRETARIA,
  secretary: ROLES.SECRETARIA,
  receptionist: ROLES.SECRETARIA,
  paciente: ROLES.PACIENTE,
  patient: ROLES.PACIENTE,
}

// Rotas permitidas por role ('*' = todas)
const ROLE_ROUTES = {
  admin: [
    '/inicio', '/home', '/dashboard',
    '/agenda',
    '/profissionais',
    '/pacientes',
    '/laudos',
    '/analytics',
    '/comunicacao', '/mensagens',
    '/configuracoes', '/config',
    '/consultas',
    '/lista-espera',
    '/usuarios', '/usuários',
    '/perfil',
  ],
  gestor: [
    '/inicio', '/home', '/dashboard',
    '/agenda',
    '/profissionais',
    '/pacientes',
    '/laudos',
    '/analytics',
    '/comunicacao', '/mensagens',
    '/configuracoes', '/config',
    '/consultas',
    '/lista-espera',
    '/usuarios', '/usuários',
    '/perfil',
  ],
  medico: [
    '/inicio', '/home', '/dashboard',
    '/agenda',
    '/atendimento',
    '/profissionais',
    '/consultas',
    '/lista-espera',
    '/pacientes',
    '/laudos',
    '/analytics',
    '/comunicacao', '/mensagens',
    '/configuracoes', '/config',
    '/perfil',
  ],
  secretaria: [
    '/inicio', '/home', '/dashboard',
    '/agenda',
    '/profissionais',
    '/consultas',
    '/lista-espera',
    '/pacientes',
    '/comunicacao', '/mensagens',
    '/configuracoes', '/config',
    '/perfil',
  ],
  paciente: [
    '/agendamento',
    '/laudos',
    '/configuracoes', '/config',
    '/perfil',
  ],
}

const ROLE_EXACT_ROUTES = {
  medico: ['/profissionais'],
}

// Capacidades especiais por role
export const ROLE_CAPABILITIES = {
  admin: {
    manageUsers: true,
    hardDeletePatients: true,
    accessSettings: true,
    ownAppointmentsOnly: false,
    canEditPatients: true,
    canViewReports: true,
    canViewMedicalRecords: true,
  },
  gestor: {
    manageUsers: true,
    hardDeletePatients: true,
    accessSettings: true,
    ownAppointmentsOnly: false,
    canEditPatients: true,
    canViewReports: true,
    canViewMedicalRecords: true,
  },
  medico: {
    manageUsers: false,
    hardDeletePatients: false,
    accessSettings: true,
    ownAppointmentsOnly: true,
    canEditPatients: false,
    canViewReports: true,
    canViewMedicalRecords: true,
  },
  secretaria: {
    manageUsers: false,
    hardDeletePatients: false,
    accessSettings: true,
    ownAppointmentsOnly: false,
    canEditPatients: true,
    canViewReports: false,
    canViewMedicalRecords: false,
  },
  paciente: {
    manageUsers: false,
    hardDeletePatients: false,
    accessSettings: true,
    ownAppointmentsOnly: false,
    canEditPatients: false,
    canViewReports: true,
    canViewMedicalRecords: false,
  },
}

// Itens do menu por role (para o AppShell)
export const ROLE_NAV_ITEMS = {
  admin: [
    { path: '/inicio', label: 'Painel' },
    { path: '/agenda', label: 'Agenda' },
    { path: '/profissionais', label: 'Profissionais' },
    { path: '/pacientes', label: 'Pacientes' },
    { path: '/laudos', label: 'Laudos' },
    { path: '/lista-espera', label: 'Lista de Espera Inteligente' },
    { path: '/analytics', label: 'Analytics' },
    { path: '/comunicacao', label: 'Comunicação' },
    { path: '/configuracoes', label: 'Configurações' },
  ],
  gestor: [
    { path: '/inicio', label: 'Painel' },
    { path: '/agenda', label: 'Agenda' },
    { path: '/profissionais', label: 'Profissionais' },
    { path: '/pacientes', label: 'Pacientes' },
    { path: '/laudos', label: 'Laudos' },
    { path: '/lista-espera', label: 'Lista de Espera Inteligente' },
    { path: '/analytics', label: 'Analytics' },
    { path: '/comunicacao', label: 'Comunicação' },
    { path: '/configuracoes', label: 'Configurações' },
  ],
  medico: [
    { path: '/inicio', label: 'Painel' },
    { path: '/agenda', label: 'Agenda' },
    { path: '/atendimento', label: 'Atendimento' },
    { path: '/profissionais', label: 'Profissionais' },
    { path: '/pacientes', label: 'Pacientes' },
    { path: '/laudos', label: 'Laudos' },
    { path: '/lista-espera', label: 'Lista de Espera Inteligente' },
    { path: '/comunicacao', label: 'Comunicação' },
    { path: '/configuracoes', label: 'Configurações' },
  ],
  secretaria: [
    { path: '/inicio', label: 'Painel' },
    { path: '/agenda', label: 'Agenda' },
    { path: '/profissionais', label: 'Profissionais' },
    { path: '/pacientes', label: 'Pacientes' },
    { path: '/lista-espera', label: 'Lista de Espera Inteligente' },
    { path: '/comunicacao', label: 'Comunicação' },
    { path: '/configuracoes', label: 'Configurações' },
  ],
  paciente: [
    { path: '/agendamento', label: 'Agendamento' },
    { path: '/laudos', label: 'Laudos' },
    { path: '/configuracoes', label: 'Configurações' },
  ],
}

// Verifica se um role pode acessar uma rota
export function canAccess(role, pathname) {
  const normalizedRole = normalizeRole(role)
  if (!normalizedRole) return false
  const comparablePathname = normalizePathname(pathname)

  if (String(comparablePathname || '').startsWith('/prontuario')) {
    return ROLE_CAPABILITIES[normalizedRole]?.canViewMedicalRecords === true
  }

  const allowed = ROLE_ROUTES[normalizedRole]
  if (allowed === '*') return true
  if (!Array.isArray(allowed)) return false
  const exactRoutes = ROLE_EXACT_ROUTES[normalizedRole] || []
  return allowed.some((route) => {
    if (exactRoutes.includes(route)) return comparablePathname === route
    return comparablePathname === route || comparablePathname.startsWith(route + '/')
  })
}

// Verifica se um role tem uma capacidade específica
export function hasCapability(role, capability) {
  const normalizedRole = normalizeRole(role)
  return ROLE_CAPABILITIES[normalizedRole]?.[capability] ?? false
}

export function normalizeRole(role) {
  const normalized = normalizeRoleKey(role)
  return ROLE_ALIASES[normalized] ?? null
}

function normalizeRoleKey(role) {
  return String(role ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizePathname(pathname) {
  const path = String(pathname || '')

  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

// Rótulos amigáveis para cada role
export const ROLE_LABELS = {
  admin: 'Administrador',
  gestor: 'Gestão',
  medico: 'Médico',
  secretaria: 'Secretária',
  paciente: 'Paciente',
}

// Roles que um gestor pode criar
export const GESTOR_CREATABLE_ROLES = ['medico', 'secretaria', 'paciente']

// Roles que um admin pode criar
export const ADMIN_CREATABLE_ROLES = ['admin', 'gestor', 'medico', 'secretaria', 'paciente']
