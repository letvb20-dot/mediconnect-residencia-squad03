import { normalizeRole, ROLE_LABELS, ROLE_NAV_ITEMS } from '../../config/permissions.js'

// Motor heurístico do chatbot: casa a intenção da última mensagem do usuário
// com dados de contexto (carregados pelo widget) e devolve { text, route? }.

const ROUTE_KEYWORDS = [
  { route: '/agenda', label: 'Agenda', words: ['agenda', 'agendamento', 'consulta', 'horario', 'horário', 'marcar'] },
  { route: '/laudos', label: 'Relatórios', words: ['laudo', 'laudos', 'relatorio', 'relatório', 'exame'] },
  { route: '/pacientes', label: 'Pacientes', words: ['paciente', 'pacientes', 'prontuario', 'prontuário', 'cadastro'] },
  { route: '/profissionais', label: 'Profissionais', words: ['medico', 'médico', 'profissional', 'profissionais'] },
  { route: '/lista-espera', label: 'Lista de espera', words: ['espera', 'fila', 'encaixe', 'lista de espera'] },
  { route: '/comunicacao', label: 'Comunicação', words: ['mensagem', 'comunicacao', 'comunicação', 'notificacao', 'notificação'] },
  { route: '/relatorios', label: 'Analytics', words: ['analytics', 'indicador', 'metrica', 'métrica', 'dashboard'] },
  { route: '/configuracoes', label: 'Configurações', words: ['configuracao', 'configuração', 'ajuste', 'preferencia', 'preferência'] },
]

export function runChatEngine({ messages = [], role, data = {} }) {
  const normalizedRole = normalizeRole(role) || 'paciente'
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  const text = normalize(lastUser?.content || lastUser?.text || '')

  if (!text) {
    return { text: greeting(normalizedRole), matched: true }
  }

  if (matches(text, ['ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'ajuda', 'ajudar', 'o que voce faz', 'pode fazer'])) {
    return { text: greeting(normalizedRole), matched: true }
  }

  // Consultas de hoje
  if (matches(text, ['consulta', 'agenda', 'atendimento']) && matches(text, ['hoje', 'agora', 'quantas', 'quantos', 'dia'])) {
    const count = Number(data.appointmentsToday ?? 0)
    const owner = normalizedRole === 'medico' ? 'na sua agenda' : 'na agenda da clínica'
    return {
      text: count
        ? `Há ${count} consulta(s) para hoje ${owner}. Quer abrir a Agenda?`
        : `Não encontrei consultas para hoje ${owner}.`,
      route: '/agenda',
      matched: true,
    }
  }

  // Lista de espera
  if (matches(text, ['espera', 'fila', 'encaixe'])) {
    const count = Number(data.waitlistCount ?? 0)
    const gaps = Number(data.gapsCount ?? 0)
    return {
      text: count
        ? `Há ${count} paciente(s) na lista de espera${gaps ? ` e ${gaps} lacuna(s) de horário com encaixe sugerido` : ''}. Posso abrir a Lista de espera.`
        : 'A lista de espera está vazia no momento.',
      route: '/lista-espera',
      matched: true,
    }
  }

  // Laudos / relatórios
  if (matches(text, ['laudo', 'relatorio', 'relatório', 'exame'])) {
    const count = Number(data.reportsCount ?? 0)
    if (normalizedRole === 'paciente') {
      return {
        text: count
          ? `Você tem ${count} relatório(s) disponível(is). Abra a área de Relatórios para visualizar e imprimir.`
          : 'Ainda não há relatórios vinculados ao seu cadastro.',
        route: '/laudos',
        matched: true,
      }
    }
    return {
      text: 'Em Relatórios você cria, edita e libera laudos. No editor, use o botão "Gerar com IA" para um rascunho automático a partir do paciente e do modelo.',
      route: '/laudos',
      matched: true,
    }
  }

  // Métricas (gestor/admin)
  if (matches(text, ['cancelamento', 'no-show', 'no show', 'falta', 'taxa', 'metrica', 'métrica', 'indicador'])) {
    if (['admin', 'gestor'].includes(normalizedRole)) {
      const rate = data.cancelRate ?? null
      const total = data.appointmentsTotal ?? null
      return {
        text: rate != null
          ? `A taxa de ausência/cancelamento estimada é de ${rate}%${total != null ? ` sobre ${total} consultas` : ''}. Veja detalhes em Analytics.`
          : 'Abra Analytics para ver as métricas consolidadas da clínica.',
        route: '/relatorios',
        matched: true,
      }
    }
    return { text: 'As métricas consolidadas ficam disponíveis para gestão e administração.', matched: true }
  }

  // Como agendar (paciente)
  if (normalizedRole === 'paciente' && matches(text, ['agendar', 'marcar', 'consulta', 'agendamento'])) {
    return {
      text: 'Para agendar, abra a área de Agendamento, escolha um profissional e selecione um horário disponível.',
      route: '/agendamento',
      matched: true,
    }
  }

  // Navegação genérica ("onde vejo X", "como faço Y", ou termos diretos curtos)
  const isNavQuery = matches(text, ['onde', 'como', 'abrir', 'ir para', 'ir ate', 'ver', 'mostrar', 'acessar', 'tela']) || text.split(/\s+/).length <= 2
  if (isNavQuery) {
    const routeHit = ROUTE_KEYWORDS.find((entry) => entry.words.some((word) => text.includes(normalize(word))))
    if (routeHit && isRouteAllowed(normalizedRole, routeHit.route)) {
      return { text: `Você encontra isso em "${routeHit.label}". Quer que eu abra?`, route: routeHit.route, matched: true }
    }
  }

  return {
    text: 'Posso ajudar com agenda, lista de espera, relatórios e navegação no sistema. Tente perguntar, por exemplo: "quantas consultas tenho hoje?" ou "onde vejo os laudos?".',
    matched: false,
  }
}

function greeting(normalizedRole) {
  const label = ROLE_LABELS[normalizedRole] || 'usuário'
  const examples = {
    medico: '"quantas consultas tenho hoje?", "quem está na lista de espera?"',
    secretaria: '"consultas de hoje", "lacunas na agenda", "lista de espera"',
    admin: '"taxa de cancelamento", "total de consultas"',
    gestor: '"taxa de cancelamento", "indicadores da clínica"',
    paciente: '"como agendar uma consulta", "meus laudos"',
  }
  return `Olá! Sou o assistente do MediConnect (perfil ${label}). Você pode perguntar, por exemplo: ${examples[normalizedRole] || examples.paciente}.`
}

function isRouteAllowed(normalizedRole, route) {
  const allowed = (ROLE_NAV_ITEMS[normalizedRole] || []).map((item) => item.path)
  return allowed.includes(route) || route === '/agendamento'
}

function matches(text, words) {
  return words.some((word) => text.includes(normalize(word)))
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
