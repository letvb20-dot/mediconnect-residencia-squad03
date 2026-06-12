import { normalizeRole, ROLE_LABELS, ROLE_NAV_ITEMS } from '../../config/permissions.js'

// Motor heurístico do chatbot: casa a intenção da última mensagem do usuário
// com dados de contexto (carregados pelo widget) e devolve { text, route? }.
// Utiliza um sistema de "scoring" onde palavras-chave somam pontos para identificar a intenção correta.

const INTENTS = [
  {
    id: 'appointments_today',
    keywords: ['consulta', 'agenda', 'atendimento', 'agendamento', 'marcada', 'marcado', 'compromisso', 'horario', 'consultas'],
    boosters: ['hoje', 'agora', 'dia', 'quantas', 'quantos', 'proxima', 'proximas'],
    roles: ['medico', 'secretaria', 'gestor', 'admin', 'paciente'],
    handler: (data, normalizedRole) => {
      const count = Number(data.appointmentsToday ?? 0)
      const owner = normalizedRole === 'medico' ? 'na sua agenda' : 'na agenda da clínica'
      return {
        text: count
          ? `Há ${count} consulta(s) para hoje ${owner}. Quer abrir a Agenda?`
          : `Não encontrei consultas para hoje ${owner}.`,
        route: '/agenda',
      }
    }
  },
  {
    id: 'waitlist',
    keywords: ['espera', 'fila', 'encaixe', 'esperando', 'aguardando', 'aguardar', 'lista', 'prioridade', 'encaixar'],
    boosters: ['quem', 'quantos', 'quantas', 'pacientes'],
    roles: ['medico', 'secretaria', 'gestor', 'admin'],
    handler: (data) => {
      const count = Number(data.waitlistCount ?? 0)
      const gaps = Number(data.gapsCount ?? 0)
      return {
        text: count
          ? `Há ${count} paciente(s) na lista de espera${gaps ? ` e ${gaps} lacuna(s) de horário com encaixe sugerido` : ''}. Posso abrir a Lista de espera.`
          : 'A lista de espera está vazia no momento.',
        route: '/lista-espera',
      }
    }
  },
  {
    id: 'reports',
    keywords: ['laudo', 'relatorio', 'relatório', 'exame', 'exames', 'resultado', 'resultados', 'diagnostico', 'parecer', 'laudos', 'relatorios'],
    boosters: ['meus', 'ver', 'abrir', 'gerar', 'criar'],
    roles: ['medico', 'secretaria', 'gestor', 'admin', 'paciente'],
    handler: (data, normalizedRole) => {
      const count = Number(data.reportsCount ?? 0)
      if (normalizedRole === 'paciente') {
        return {
          text: count
            ? `Você tem ${count} relatório(s) disponível(is). Abra a área de Relatórios para visualizar e imprimir.`
            : 'Ainda não há relatórios vinculados ao seu cadastro.',
          route: '/laudos',
        }
      }
      return {
        text: 'Em Relatórios você cria, edita e libera laudos. No editor, use o botão "Gerar com IA" para um rascunho automático a partir do paciente e do modelo.',
        route: '/laudos',
      }
    }
  },
  {
    id: 'metrics',
    keywords: ['cancelamento', 'no-show', 'no show', 'taxa', 'metrica', 'métrica', 'indicador', 'ausencia', 'falta', 'faltou', 'faltaram', 'indicadores', 'estatistica', 'estatística', 'dados', 'desempenho', 'performance'],
    boosters: ['qual', 'quanto', 'ver'],
    roles: ['admin', 'gestor'],
    handler: (data) => {
      const rate = data.cancelRate ?? null
      const total = data.appointmentsTotal ?? null
      return {
        text: rate != null
          ? `A taxa de ausência/cancelamento estimada é de ${rate}%${total != null ? ` sobre ${total} consultas` : ''}. Veja detalhes em Analytics.`
          : 'Abra Analytics para ver as métricas consolidadas da clínica.',
        route: '/relatorios',
      }
    }
  },
  {
    id: 'patients',
    keywords: ['paciente', 'pacientes', 'cadastro', 'ficha', 'registro', 'cadastrar'],
    boosters: ['meus', 'buscar', 'lista', 'novo'],
    roles: ['medico', 'secretaria', 'gestor', 'admin'],
    handler: () => ({
      text: 'Você pode gerenciar os cadastros e prontuários na área de Pacientes. Quer abrir agora?',
      route: '/pacientes',
    })
  },
  {
    id: 'scheduling_patient',
    keywords: ['agendar', 'marcar', 'consulta', 'reservar', 'solicitar', 'horario', 'disponivel', 'vaga', 'agendamento'],
    boosters: ['quero', 'como', 'gostaria'],
    roles: ['paciente'],
    handler: () => ({
      text: 'Para agendar, abra a área de Agendamento, escolha um profissional e selecione um horário disponível.',
      route: '/agendamento',
    })
  },
  {
    id: 'profile',
    keywords: ['perfil', 'conta', 'senha', 'dados'],
    boosters: ['meu', 'minha', 'alterar', 'mudar', 'configuracoes', 'configuração', 'ajuste', 'preferencia', 'preferência'],
    roles: ['medico', 'secretaria', 'gestor', 'admin', 'paciente'],
    handler: () => ({
      text: 'Você pode gerenciar seus dados, senha e configurações no seu Perfil.',
      route: '/perfil',
    })
  },
  {
    id: 'help',
    keywords: ['funcionalidades', 'recursos', 'menu', 'fazer', 'ajuda', 'ajudar', 'ola', 'oi', 'bom dia', 'boa tarde', 'boa noite'],
    boosters: ['o que', 'posso', 'quais'],
    roles: ['medico', 'secretaria', 'gestor', 'admin', 'paciente'],
    handler: (data, normalizedRole) => ({
      text: greeting(normalizedRole),
      route: null,
    })
  },
  {
    id: 'communication',
    keywords: ['mensagem', 'comunicacao', 'comunicação', 'notificacao', 'notificação', 'whatsapp', 'sms', 'email'],
    boosters: ['enviar', 'mandar', 'notificar', 'avisar'],
    roles: ['medico', 'secretaria', 'gestor', 'admin'],
    handler: () => ({
      text: 'Use a área de Comunicação para enviar mensagens (WhatsApp, SMS, E-mail) aos pacientes.',
      route: '/comunicacao',
    })
  },
  {
    id: 'professionals',
    keywords: ['medico', 'médico', 'profissional', 'profissionais', 'especialista', 'especialistas'],
    boosters: ['quais', 'lista', 'buscar', 'equipe'],
    roles: ['medico', 'secretaria', 'gestor', 'admin', 'paciente'],
    handler: () => ({
      text: 'A lista da equipe e especialidades fica na área de Profissionais.',
      route: '/profissionais',
    })
  },
]

const ROUTE_KEYWORDS = [
  { route: '/agenda', label: 'Agenda', words: ['agenda', 'agendamento', 'consulta', 'horario', 'horário', 'marcar'] },
  { route: '/laudos', label: 'Relatórios', words: ['laudo', 'laudos', 'relatorio', 'relatório', 'exame', 'exames'] },
  { route: '/pacientes', label: 'Pacientes', words: ['paciente', 'pacientes', 'prontuario', 'prontuário', 'cadastro'] },
  { route: '/profissionais', label: 'Profissionais', words: ['medico', 'médico', 'profissional', 'profissionais'] },
  { route: '/lista-espera', label: 'Lista de espera', words: ['espera', 'fila', 'encaixe', 'lista de espera'] },
  { route: '/comunicacao', label: 'Comunicação', words: ['mensagem', 'comunicacao', 'comunicação', 'notificacao', 'notificação'] },
  { route: '/relatorios', label: 'Analytics', words: ['analytics', 'indicador', 'metrica', 'métrica', 'dashboard'] },
  { route: '/configuracoes', label: 'Configurações', words: ['configuracao', 'configuração', 'ajuste', 'preferencia', 'preferência'] },
]

export function runChatEngine({ messages = [], role, data = {}, hasAi = false }) {
  const normalizedRole = normalizeRole(role) || 'paciente'
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  const text = normalize(lastUser?.content || lastUser?.text || '')

  if (!text) {
    return { text: greeting(normalizedRole), matched: true }
  }

  const isActionIntent = matches(text, ['agendar', 'marcar', 'cancelar', 'desmarcar', 'reagendar', 'deletar', 'excluir', 'editar', 'alterar', 'mudar', 'novo', 'nova']) && !matches(text, ['senha', 'perfil', 'conta', 'configuracao', 'configuração'])

  if (hasAi && isActionIntent) {
    return { text: '', matched: false }
  }

  const isDestructive = matches(text, ['cancelar', 'desmarcar', 'reagendar', 'deletar', 'excluir', 'editar', 'alterar', 'mudar', 'novo', 'nova']) && !matches(text, ['senha', 'perfil', 'conta', 'configuracao', 'configuração'])

  // Se for ação destrutiva sem IA, orienta o usuário a ir para a tela correspondente.
  if (isDestructive) {
    for (const routeHit of ROUTE_KEYWORDS) {
      if (routeHit.words.some((word) => text.includes(normalize(word)))) {
        if (isRouteAllowed(normalizedRole, routeHit.route)) {
          return { text: `Para realizar essa ação, por favor acesse "${routeHit.label}". Quer que eu abra a tela?`, route: routeHit.route, matched: true }
        }
      }
    }
    return {
      text: getFallback(normalizedRole),
      matched: false,
    }
  }

  let bestIntent = null
  let maxScore = 0

  // Avaliação do score de cada intenção
  for (const intent of INTENTS) {
    if (!intent.roles.includes(normalizedRole)) continue

    let score = 0
    for (const keyword of intent.keywords) {
      if (text.includes(normalize(keyword))) {
        score += 1.0
      }
    }

    if (score > 0) {
      for (const booster of intent.boosters || []) {
        if (text.includes(normalize(booster))) {
          score += 0.5
        }
      }
    }

    if (score >= 1.0 && score > maxScore) {
      maxScore = score
      bestIntent = intent
    }
  }

  if (bestIntent) {
    const result = bestIntent.handler(data, normalizedRole)
    return { ...result, matched: true }
  }

  // Fallback de navegação genérica para palavras perdidas que ainda correspondam a rotas
  for (const routeHit of ROUTE_KEYWORDS) {
    if (routeHit.words.some((word) => text.includes(normalize(word)))) {
      if (isRouteAllowed(normalizedRole, routeHit.route)) {
        return { text: `Você encontra isso em "${routeHit.label}". Quer que eu abra?`, route: routeHit.route, matched: true }
      }
    }
  }

  return {
    text: getFallback(normalizedRole),
    matched: false,
  }
}

function greeting(normalizedRole) {
  const label = ROLE_LABELS[normalizedRole] || 'usuário'
  const examples = {
    medico: '"quantas consultas tenho hoje?", "quem está na lista de espera?"',
    secretaria: '"consultas de hoje", "lista de espera"',
    admin: '"taxa de cancelamento", "total de consultas"',
    gestor: '"taxa de cancelamento", "indicadores da clínica"',
    paciente: '"como agendar uma consulta", "meus laudos"',
  }
  return `Olá! Sou o assistente do MediConnect (perfil ${label}). Você pode perguntar, por exemplo: ${examples[normalizedRole] || examples.paciente}.`
}

function getFallback(normalizedRole) {
  if (normalizedRole === 'paciente') {
    return 'Posso ajudar com:\n• Agendar consulta — "quero agendar"\n• Meus laudos — "meus exames"\n• Meu perfil — "meus dados"\nTente reformular sua pergunta!'
  }
  if (normalizedRole === 'medico') {
    return 'Não entendi sua pergunta, mas posso ajudar com:\n• Consultas de hoje — "minhas consultas"\n• Lista de espera — "quem está na espera?"\n• Relatórios — "meus laudos"\n• Navegar — "abrir agenda"\nTente reformular!'
  }
  if (normalizedRole === 'secretaria') {
    return 'Não entendi, mas posso ajudar com:\n• Consultas — "consultas de hoje"\n• Espera — "lista de espera"\n• Pacientes — "buscar paciente"\n• Comunicação — "enviar mensagem"\nTente reformular!'
  }
  if (normalizedRole === 'admin' || normalizedRole === 'gestor') {
    return 'Não entendi. Posso ajudar com:\n• Indicadores — "taxa de cancelamento"\n• Agenda — "consultas de hoje"\n• Lista de espera — "quem está esperando"\n• Navegar — "abrir profissionais"\nTente reformular!'
  }
  return 'Posso ajudar com agenda, lista de espera, relatórios e navegação no sistema. Tente reformular sua pergunta!'
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
