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
  doctor: ROLES.MEDICO,
  physician: ROLES.MEDICO,
  secretaria: ROLES.SECRETARIA,
  secretario: ROLES.SECRETARIA,
  secretary: ROLES.SECRETARIA,
  receptionist: ROLES.SECRETARIA,
  paciente: ROLES.PACIENTE,
  patient: ROLES.PACIENTE,
}

// Rotas permitidas por role ('*' = todas)
const ROLE_ROUTES = {
  admin: '*',
  gestor: [
    '/inicio', '/home', '/dashboard',
    '/agenda',
    '/pacientes',
    '/prontuario',
    '/laudos',
    '/relatorios',
    '/comunicacao', '/mensagens',
    '/configuracoes', '/config',
    '/consultas',
    '/usuarios',
    '/perfil',
  ],
  medico: [
    '/agenda',
    '/pacientes',
    '/prontuario',
    '/laudos',
    '/comunicacao', '/mensagens',
    '/configuracoes', '/config',
    '/perfil',
  ],
  secretaria: [
    '/agenda',
    '/pacientes',
    '/comunicacao', '/mensagens',
    '/configuracoes', '/config',
    '/perfil',
  ],
  paciente: [
    '/inicio', '/home', '/dashboard',
    '/configuracoes', '/config',
    '/perfil',
  ],
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
    canViewReports: false,
    canViewMedicalRecords: false,
  },
}

// Itens do menu por role (para o AppShell)
export const ROLE_NAV_ITEMS = {
  admin: [
    { path: '/inicio', label: 'Painel' },
    { path: '/agenda', label: 'Agenda' },
    { path: '/pacientes', label: 'Pacientes' },
    { path: '/prontuario', label: 'Prontuário' },
    { path: '/laudos', label: 'Relatórios' },
    { path: '/relatorios', label: 'Analytics' },
    { path: '/comunicacao', label: 'Comunicação' },
    { path: '/usuarios', label: 'Usuários' },
    { path: '/configuracoes', label: 'Configurações' },
  ],
  gestor: [
    { path: '/inicio', label: 'Painel' },
    { path: '/agenda', label: 'Agenda' },
    { path: '/pacientes', label: 'Pacientes' },
    { path: '/prontuario', label: 'Prontuário' },
    { path: '/laudos', label: 'Relatórios' },
    { path: '/relatorios', label: 'Analytics' },
    { path: '/comunicacao', label: 'Comunicação' },
    { path: '/usuarios', label: 'Usuários' },
    { path: '/configuracoes', label: 'Configurações' },
  ],
  medico: [
    { path: '/agenda', label: 'Agenda' },
    { path: '/pacientes', label: 'Pacientes' },
    { path: '/prontuario', label: 'Prontuário' },
    { path: '/laudos', label: 'Relatórios' },
    { path: '/comunicacao', label: 'Comunicação' },
    { path: '/configuracoes', label: 'Configurações' },
  ],
  secretaria: [
    { path: '/agenda', label: 'Agenda' },
    { path: '/pacientes', label: 'Pacientes' },
    { path: '/comunicacao', label: 'Comunicação' },
    { path: '/configuracoes', label: 'Configurações' },
  ],
  paciente: [
    { path: '/inicio', label: 'Painel' },
    { path: '/configuracoes', label: 'Configurações' },
  ],
}

// Verifica se um role pode acessar uma rota
export function canAccess(role, pathname) {
  const normalizedRole = normalizeRole(role)
  if (!normalizedRole) return false
  const allowed = ROLE_ROUTES[normalizedRole]
  if (allowed === '*') return true
  if (!Array.isArray(allowed)) return false
  return allowed.some((route) => pathname === route || pathname.startsWith(route + '/'))
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

// Rótulos amigáveis para cada role
export const ROLE_LABELS = {
  admin: 'Administrador',
  gestor: 'Gestão / Coordenação',
  medico: 'Médico',
  secretaria: 'Secretária',
  paciente: 'Paciente',
}

// Roles que um gestor pode criar
export const GESTOR_CREATABLE_ROLES = ['medico', 'secretaria', 'paciente']

// Roles que um admin pode criar
export const ADMIN_CREATABLE_ROLES = ['admin', 'gestor', 'medico', 'secretaria', 'paciente']
