import { appointmentRepository } from '../../../../repositories/appointmentRepository.js'
import { patientRepository } from '../../../../repositories/patientRepository.js'
import { professionalRepository } from '../../../../repositories/professionalRepository.js'
import { availabilityRepository } from '../../../../repositories/availabilityRepository.js'
import { waitlistRepository } from '../../../../repositories/waitlistRepository.js'
import { reportRepository } from '../../../../repositories/reportRepository.js'
import { medicalRecordRepository } from '../../../../repositories/medicalRecordRepository.js'
import { analyticsRepository } from '../../../../repositories/analyticsRepository.js'
import { homeRepository } from '../../../../repositories/homeRepository.js'
import { visitRepository } from '../../../../repositories/visitRepository.js'
import { communicationRepository } from '../../../../repositories/communicationRepository.js'
import { notificationRepository } from '../../../../repositories/notificationRepository.js'
import { userRepository } from '../../../../repositories/userRepository.js'

// =============================================================================
// Ferramentas de LEITURA do agente.
//
// Cada tool é um wrapper fino sobre um repositório existente. Duas coisas que o
// repositório NÃO faz e a tool SEMPRE faz:
//   1. Força o escopo por papel a partir do ctx (nunca confia no modelo).
//   2. Enxuga o retorno (projeção + slice) para controlar tokens.
//
// A barreira principal de role é o `allowedRoles` (o getToolsForRole nem entrega
// a tool a quem não pode). O escopo DENTRO da role (médico só o próprio, etc.) é
// forçado aqui no execute, e é fail-closed: ctx incompleto → devolve vazio,
// nunca dados sem filtro.
// =============================================================================

// Conjunto de pacientes do médico: derivado das consultas dele.
// Necessário porque getDirectoryRows NÃO filtra a lista por doctorId (só
// enriquece lastVisit/nextVisit). Sem currentDoctorId → conjunto vazio (fail-closed).
async function getMedicoPatientIds(ctx = {}) {
  if (!ctx.currentDoctorId) return new Set()
  const appointments = await appointmentRepository.getAll({ doctorId: ctx.currentDoctorId })
  const ids = new Set()
  for (const appointment of appointments || []) {
    if (appointment.patientId) ids.add(String(appointment.patientId))
  }
  return ids
}

// Match de texto simples e tolerante (case-insensitive, substring).
function matchText(value, query) {
  if (!query) return true
  return String(value ?? '').toLowerCase().includes(String(query).toLowerCase())
}

// -----------------------------------------------------------------------------
// 1. buscarConsultas → appointmentRepository.getAll
// -----------------------------------------------------------------------------
export const buscarConsultas = {
  declaration: {
    name: 'buscarConsultas',
    description:
      'Busca consultas/agendamentos da clínica. Use quando o usuário perguntar sobre agenda, ' +
      'horários, atendimentos, quantas consultas existem, consultas de um dia específico ou ' +
      'consultas canceladas. Retorna a lista com data, hora, paciente, profissional e status.',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'Filtra por uma data específica no formato AAAA-MM-DD. Omita para trazer todas.',
        },
        status: {
          type: 'string',
          description:
            'Filtra por status. Valores aceitos: agendada, confirmada, realizada, cancelada. Omita para todos.',
        },
      },
    },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico', 'paciente'],
  runningLabel: 'Consultando a agenda…',
  async execute(args = {}, ctx = {}) {
    const filters = {}

    // Escopo obrigatório por papel.
    if (ctx.role === 'medico') {
      filters.doctorId = ctx.currentDoctorId || 'non-existent'
    } else if (ctx.role === 'paciente') {
      filters.patientId = ctx.currentPatientId || 'non-existent'
    }

    if (args.status) filters.status = args.status

    let list = await appointmentRepository.getAll(filters)

    if (args.data) {
      list = list.filter((appointment) => appointment.date === args.data)
    }

    return {
      total: list.length,
      consultas: list.slice(0, 30).map((appointment) => ({
        id: appointment.id,
        data: appointment.date,
        hora: appointment.time,
        status: appointment.status,
        paciente: appointment.patientName || appointment.patient || 'Paciente',
        profissional: appointment.professional || appointment.professionalName || 'Profissional',
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 2. buscarPacientes → patientRepository.getDirectoryRows
// -----------------------------------------------------------------------------
export const buscarPacientes = {
  declaration: {
    name: 'buscarPacientes',
    description:
      'Lista pacientes da clínica (nome, CPF, telefone, convênio, última/próxima visita). ' +
      'Use quando o usuário pedir a lista de pacientes ou procurar um paciente por nome ou CPF.',
    parameters: {
      type: 'object',
      properties: {
        busca: {
          type: 'string',
          description: 'Texto para filtrar por nome ou CPF do paciente. Omita para listar todos.',
        },
      },
    },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Buscando pacientes…',
  async execute(args = {}, ctx = {}) {
    const isMedico = ctx.role === 'medico'
    let rows = await patientRepository.getDirectoryRows(
      isMedico ? { doctorId: ctx.currentDoctorId || 'non-existent' } : {},
    )

    // Médico só enxerga pacientes com quem tem consulta (getDirectoryRows traz todos).
    if (isMedico) {
      const ids = await getMedicoPatientIds(ctx)
      rows = rows.filter((row) => ids.has(String(row.id)))
    }

    if (args.busca) {
      rows = rows.filter((row) => matchText(row.name, args.busca) || matchText(row.cpf, args.busca))
    }

    return {
      total: rows.length,
      pacientes: rows.slice(0, 30).map((row) => ({
        id: row.id,
        nome: row.name,
        cpf: row.cpf,
        telefone: row.phone,
        convenio: row.plan || row.insurance,
        idade: row.age,
        ultimaVisita: row.lastVisit,
        proximaVisita: row.nextVisit,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 3. detalharPaciente → patientRepository.getById
// -----------------------------------------------------------------------------
export const detalharPaciente = {
  declaration: {
    name: 'detalharPaciente',
    description:
      'Retorna a ficha detalhada de um paciente pelo id. Use depois de identificar o paciente ' +
      '(ex.: via buscarPacientes) quando precisar de detalhes como contato, convênio ou observações.',
    parameters: {
      type: 'object',
      properties: {
        pacienteId: { type: 'string', description: 'ID do paciente.' },
      },
      required: ['pacienteId'],
    },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Abrindo a ficha do paciente…',
  async execute(args = {}, ctx = {}) {
    if (!args.pacienteId) return { error: 'Informe o pacienteId.' }

    if (ctx.role === 'medico') {
      const ids = await getMedicoPatientIds(ctx)
      if (!ids.has(String(args.pacienteId))) {
        return { error: 'Paciente fora do seu escopo (sem consulta com você).' }
      }
    }

    const patient = await patientRepository.getById(args.pacienteId)
    if (!patient) return { error: 'Paciente não encontrado.' }

    return {
      id: patient.id,
      nome: patient.name,
      cpf: patient.cpf,
      email: patient.email,
      telefone: patient.phone,
      nascimento: patient.birthDate,
      idade: patient.age,
      convenio: patient.plan,
      status: patient.status,
      observacoes: patient.notes,
    }
  },
}

// -----------------------------------------------------------------------------
// 4. buscarProfissionais → professionalRepository.getAll
// -----------------------------------------------------------------------------
export const buscarProfissionais = {
  declaration: {
    name: 'buscarProfissionais',
    description:
      'Lista os profissionais (médicos) da clínica com especialidade e CRM. Use para encontrar o ' +
      'id de um profissional pelo nome antes de consultar horários, ou quando pedirem a lista de médicos.',
    parameters: {
      type: 'object',
      properties: {
        especialidade: { type: 'string', description: 'Filtra por especialidade.' },
        busca: { type: 'string', description: 'Texto para filtrar por nome do profissional.' },
      },
    },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Consultando os profissionais…',
  async execute(args = {}) {
    const filters = {}
    if (args.especialidade) filters.specialty = args.especialidade

    let list = await professionalRepository.getAll(filters)

    if (args.busca) {
      list = list.filter((professional) => matchText(professional.name || professional.full_name, args.busca))
    }

    return {
      total: list.length,
      profissionais: list.slice(0, 50).map((professional) => ({
        id: professional.id,
        nome: professional.name || professional.full_name,
        especialidade: professional.specialty,
        crm: professional.crm,
        crmUf: professional.crm_uf,
        unidade: professional.unit,
        status: professional.status,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 5. buscarHorariosDisponiveis → availabilityRepository.getAvailableSlots
// -----------------------------------------------------------------------------
export const buscarHorariosDisponiveis = {
  declaration: {
    name: 'buscarHorariosDisponiveis',
    description:
      'Lista os horários livres de um profissional. Informe o profissionalId (use buscarProfissionais ' +
      'para descobri-lo pelo nome) e a data, ou um intervalo de datas. Use quando perguntarem quais ' +
      'horários um médico tem disponíveis.',
    parameters: {
      type: 'object',
      properties: {
        profissionalId: {
          type: 'string',
          description: 'ID do profissional. Obrigatório (exceto para o médico, que usa o próprio).',
        },
        data: { type: 'string', description: 'Data única no formato AAAA-MM-DD.' },
        dataInicio: { type: 'string', description: 'Início do intervalo (AAAA-MM-DD).' },
        dataFim: { type: 'string', description: 'Fim do intervalo (AAAA-MM-DD).' },
      },
    },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Verificando horários livres…',
  async execute(args = {}, ctx = {}) {
    let doctorId = args.profissionalId
    if (ctx.role === 'medico') doctorId = ctx.currentDoctorId || 'non-existent'

    if (!doctorId) {
      return { error: 'Informe o profissionalId — use buscarProfissionais para obter o id pelo nome.' }
    }

    const payload = { doctorId }
    if (args.data) {
      payload.date = args.data
    } else if (args.dataInicio || args.dataFim) {
      payload.startDate = args.dataInicio || args.dataFim
      payload.endDate = args.dataFim || args.dataInicio
    } else {
      return { error: 'Informe a data (AAAA-MM-DD) ou um intervalo dataInicio/dataFim.' }
    }

    let slots
    try {
      slots = await availabilityRepository.getAvailableSlots(payload)
    } catch (error) {
      return { error: error?.message || 'Não foi possível calcular os horários.' }
    }

    const livres = (slots || []).filter((slot) => slot.available)
    return {
      total: livres.length,
      horarios: livres.slice(0, 60).map((slot) => ({
        data: slot.date,
        hora: slot.time,
        datetime: slot.datetime,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 6. buscarJanelasAtendimento → availabilityRepository.getAll
// -----------------------------------------------------------------------------
export const buscarJanelasAtendimento = {
  declaration: {
    name: 'buscarJanelasAtendimento',
    description:
      'Lista as janelas de atendimento recorrentes configuradas de um profissional (dia da semana, ' +
      'horário de início/fim, duração do slot). Diferente de buscarHorariosDisponiveis (que calcula ' +
      'vagas livres); aqui é a configuração da agenda.',
    parameters: {
      type: 'object',
      properties: {
        profissionalId: { type: 'string', description: 'ID do profissional.' },
        diaSemana: { type: 'integer', description: 'Dia da semana (0=domingo .. 6=sábado).' },
      },
    },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Consultando a configuração da agenda…',
  async execute(args = {}, ctx = {}) {
    const filters = {}
    filters.doctorId = ctx.role === 'medico' ? ctx.currentDoctorId || 'non-existent' : args.profissionalId
    if (args.diaSemana !== undefined) filters.weekday = args.diaSemana

    const list = await availabilityRepository.getAll(filters)

    return {
      total: list.length,
      janelas: list.slice(0, 50).map((window) => ({
        id: window.id,
        profissionalId: window.doctorId,
        diaSemana: window.weekday,
        inicio: window.startTime,
        fim: window.endTime,
        duracaoSlotMin: window.slotMinutes,
        tipo: window.appointmentType,
        ativo: window.active,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 7. buscarExcecoesAgenda → availabilityRepository.getExceptions
// -----------------------------------------------------------------------------
export const buscarExcecoesAgenda = {
  declaration: {
    name: 'buscarExcecoesAgenda',
    description:
      'Lista exceções da agenda de um profissional: bloqueios (folga, férias) e disponibilidades ' +
      'extras, por data. Use para saber se um médico está bloqueado em determinado dia.',
    parameters: {
      type: 'object',
      properties: {
        profissionalId: { type: 'string', description: 'ID do profissional.' },
        data: { type: 'string', description: 'Data no formato AAAA-MM-DD.' },
      },
    },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Consultando exceções da agenda…',
  async execute(args = {}, ctx = {}) {
    const filters = {}
    filters.doctorId = ctx.role === 'medico' ? ctx.currentDoctorId || 'non-existent' : args.profissionalId
    if (args.data) filters.date = args.data

    const list = await availabilityRepository.getExceptions(filters)

    return {
      total: list.length,
      excecoes: list.slice(0, 50).map((exception) => ({
        id: exception.id,
        profissionalId: exception.doctorId,
        data: exception.date,
        inicio: exception.startTime,
        fim: exception.endTime,
        tipo: exception.kind,
        motivo: exception.reason,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 8. buscarListaEspera → waitlistRepository.getAll
// -----------------------------------------------------------------------------
export const buscarListaEspera = {
  declaration: {
    name: 'buscarListaEspera',
    description:
      'Lista a fila de espera de pacientes aguardando encaixe/agendamento, com urgência e canal de ' +
      'contato. Use quando o usuário perguntar sobre a lista de espera.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filtra por status da entrada.' },
        urgencia: { type: 'string', description: 'Filtra por nível de urgência.' },
      },
    },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Consultando a lista de espera…',
  async execute(args = {}, ctx = {}) {
    let list = await waitlistRepository.getAll()

    // localStorage não filtra nada → escopo do médico é 100% responsabilidade da tool.
    if (ctx.role === 'medico') {
      const own = ctx.currentDoctorId || 'non-existent'
      list = list.filter((entry) => String(entry.doctorId) === String(own))
    }

    if (args.status) list = list.filter((entry) => matchText(entry.status, args.status))
    if (args.urgencia) list = list.filter((entry) => matchText(entry.urgency, args.urgencia))

    return {
      total: list.length,
      listaEspera: list.slice(0, 30).map((entry) => ({
        id: entry.id,
        paciente: entry.patientName,
        telefone: entry.patientPhone,
        profissional: entry.doctorName,
        urgencia: entry.urgency,
        tipo: entry.preferredType,
        canal: entry.channel,
        status: entry.status,
        criadoEm: entry.createdAt,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 9. buscarLaudos → reportRepository.getInitialReports
// -----------------------------------------------------------------------------
export const buscarLaudos = {
  declaration: {
    name: 'buscarLaudos',
    description:
      'Lista laudos/relatórios clínicos (exame, status, solicitante). Use quando o usuário perguntar ' +
      'sobre laudos. Pode filtrar por status.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filtra por status: rascunho/draft ou entregue/delivered.',
        },
      },
    },
  },
  requiresConfirmation: false,
  // Secretária NÃO entra (canViewReports=false).
  allowedRoles: ['admin', 'gestor', 'medico', 'paciente'],
  runningLabel: 'Buscando laudos…',
  async execute(args = {}, ctx = {}) {
    const filters = {}
    if (args.status) filters.status = args.status

    if (ctx.role === 'paciente') {
      if (!ctx.currentPatientId) return { total: 0, laudos: [] }
      filters.patientId = ctx.currentPatientId
    } else if (ctx.role === 'medico') {
      const ids = await getMedicoPatientIds(ctx)
      if (!ids.size) return { total: 0, laudos: [] }
      filters.patientIds = [...ids]
    }

    const list = await reportRepository.getInitialReports(filters)

    return {
      total: list.length,
      laudos: list.slice(0, 30).map((report) => ({
        id: report.id,
        numero: report.orderNumber,
        exame: report.exam,
        status: report.status,
        solicitante: report.requestedBy,
        pacienteId: report.patientId,
        criadoEm: report.createdAt,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 10. buscarProntuarios → medicalRecordRepository.getInitialRecords
// -----------------------------------------------------------------------------
export const buscarProntuarios = {
  declaration: {
    name: 'buscarProntuarios',
    description:
      'Lista prontuários/registros médicos de um paciente (data, médico, tipo, CID, diagnóstico). ' +
      'Requer o pacienteId. Use quando pedirem o histórico/prontuário de um paciente.',
    parameters: {
      type: 'object',
      properties: {
        pacienteId: { type: 'string', description: 'ID do paciente.' },
      },
    },
  },
  requiresConfirmation: false,
  // canViewMedicalRecords: secretária e paciente fora.
  allowedRoles: ['admin', 'gestor', 'medico'],
  runningLabel: 'Consultando prontuários…',
  async execute(args = {}, ctx = {}) {
    if (ctx.role === 'medico') {
      if (!args.pacienteId) {
        return { error: 'Informe o pacienteId do paciente cujo prontuário deseja consultar.' }
      }
      const ids = await getMedicoPatientIds(ctx)
      if (!ids.has(String(args.pacienteId))) {
        return { error: 'Paciente fora do seu escopo (sem consulta com você).' }
      }
    }

    const filters = {}
    if (args.pacienteId) filters.patientId = args.pacienteId

    const list = await medicalRecordRepository.getInitialRecords(filters)

    return {
      total: list.length,
      prontuarios: list.slice(0, 30).map((record) => ({
        id: record.id,
        pacienteId: record.patientId,
        paciente: record.patient,
        data: record.date,
        medico: record.doctor,
        tipo: record.type,
        cid: record.cid,
        status: record.status,
        diagnostico: record.diagnosis,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 11. detalharProntuario → medicalRecordRepository.getById
// -----------------------------------------------------------------------------
export const detalharProntuario = {
  declaration: {
    name: 'detalharProntuario',
    description:
      'Retorna o conteúdo detalhado de um prontuário pelo id (diagnóstico, conduta, prescrições). ' +
      'Use após localizar o prontuário via buscarProntuarios.',
    parameters: {
      type: 'object',
      properties: {
        prontuarioId: { type: 'string', description: 'ID do prontuário.' },
      },
      required: ['prontuarioId'],
    },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'medico'],
  runningLabel: 'Abrindo o prontuário…',
  async execute(args = {}, ctx = {}) {
    if (!args.prontuarioId) return { error: 'Informe o prontuarioId.' }

    const record = await medicalRecordRepository.getById(args.prontuarioId)
    if (!record) return { error: 'Prontuário não encontrado.' }

    if (ctx.role === 'medico') {
      const ids = await getMedicoPatientIds(ctx)
      if (record.patientId && !ids.has(String(record.patientId))) {
        return { error: 'Prontuário fora do seu escopo.' }
      }
    }

    return {
      id: record.id,
      pacienteId: record.patientId,
      paciente: record.patient,
      data: record.date,
      medico: record.doctor,
      tipo: record.type,
      cid: record.cid,
      status: record.status,
      diagnostico: record.diagnosis,
      conduta: record.conduct,
      prescricoes: record.prescriptions,
      resumo: record.summary,
    }
  },
}

// -----------------------------------------------------------------------------
// 12. buscarMetricas → analyticsRepository.getDashboardData
// -----------------------------------------------------------------------------
export const buscarMetricas = {
  declaration: {
    name: 'buscarMetricas',
    description:
      'Retorna métricas e indicadores (KPIs) da clínica: total de consultas, taxa de absenteísmo/no-show, ' +
      'desempenho por médico e top pacientes. Use quando a gestão pedir números, estatísticas ou um panorama.',
    parameters: { type: 'object', properties: {} },
  },
  requiresConfirmation: false,
  // Agregado da clínica (não escopável) → só gestão.
  allowedRoles: ['admin', 'gestor'],
  runningLabel: 'Calculando as métricas…',
  async execute() {
    const data = await analyticsRepository.getDashboardData()
    return {
      kpis: data?.kpis,
      atendimento: data?.attendanceMetrics,
      absenteismoPorMes: data?.absenteeismData,
      consultasPorMes: data?.consultationsData,
      desempenhoMedicos: data?.doctorPerformance,
      topPacientes: (data?.topPatients || []).slice(0, 5),
    }
  },
}

// -----------------------------------------------------------------------------
// 13. resumoDoDia → homeRepository.getDashboardOverview
// -----------------------------------------------------------------------------
export const resumoDoDia = {
  declaration: {
    name: 'resumoDoDia',
    description:
      'Retorna o resumo operacional do dia: consultas de hoje, métricas rápidas, alerta preditivo e ' +
      'total da semana. Use para um panorama do dia atual.',
    parameters: { type: 'object', properties: {} },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Montando o resumo do dia…',
  async execute(_args = {}, ctx = {}) {
    // O repositório já filtra internamente por role/profile (médico → própria agenda).
    const data = await homeRepository.getDashboardOverview({
      role: ctx.role,
      profile: ctx.profile,
      user: ctx.profile,
    })
    return {
      metricas: data?.metrics,
      alerta: data?.predictiveAlert,
      totalSemana: data?.weeklyAppointments?.total,
      consultasHoje: (data?.appointmentsToday || []).slice(0, 20),
    }
  },
}

// -----------------------------------------------------------------------------
// 14. buscarFilaAtendimento → visitRepository.getCareQueue
// -----------------------------------------------------------------------------
export const buscarFilaAtendimento = {
  declaration: {
    name: 'buscarFilaAtendimento',
    description:
      'Lista a fila de atendimento do dia (pacientes aguardando, em atendimento), com prioridade e ' +
      'tempo de espera. Use no contexto do atendimento/recepção.',
    parameters: { type: 'object', properties: {} },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'medico'],
  runningLabel: 'Consultando a fila de atendimento…',
  async execute(_args = {}, ctx = {}) {
    let queue = await visitRepository.getCareQueue()

    // localStorage não filtra → escopo do médico forçado aqui.
    if (ctx.role === 'medico') {
      const own = ctx.currentDoctorId || 'non-existent'
      queue = queue.filter((item) => String(item.professionalId) === String(own))
    }

    return {
      total: queue.length,
      fila: queue.slice(0, 30).map((item) => ({
        id: item.id,
        paciente: item.patient,
        profissional: item.professional,
        data: item.date,
        hora: item.time,
        tipo: item.type,
        status: item.status,
        prioridade: item.priority,
        espera: item.wait,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 15. buscarMensagens → communicationRepository.getInitialMessages
// -----------------------------------------------------------------------------
export const buscarMensagens = {
  declaration: {
    name: 'buscarMensagens',
    description:
      'Lista o histórico de mensagens enviadas a pacientes (SMS/WhatsApp/e-mail) com canal, template ' +
      'e status. Use quando o usuário perguntar sobre comunicações/mensagens enviadas.',
    parameters: { type: 'object', properties: {} },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Consultando as mensagens…',
  async execute() {
    const list = await communicationRepository.getInitialMessages()
    return {
      total: list.length,
      mensagens: list.slice(0, 30).map((message) => ({
        id: message.id,
        paciente: message.patient,
        canal: message.channel,
        template: message.template,
        enviadoEm: message.sentAt,
        status: message.status,
        resposta: message.response,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 16. buscarTemplatesMensagem → communicationRepository.getInitialTemplates
// -----------------------------------------------------------------------------
export const buscarTemplatesMensagem = {
  declaration: {
    name: 'buscarTemplatesMensagem',
    description:
      'Lista os modelos (templates) de mensagem disponíveis, por canal e categoria. Use quando ' +
      'perguntarem quais templates existem ou for compor uma comunicação.',
    parameters: { type: 'object', properties: {} },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Consultando os templates…',
  async execute() {
    const list = await communicationRepository.getInitialTemplates()
    return {
      total: list.length,
      templates: list.slice(0, 50).map((template) => ({
        id: template.id,
        nome: template.name,
        canal: template.channel,
        categoria: template.category,
        conteudo: template.content,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 17. buscarCampanhas → communicationRepository.getCampaigns
// -----------------------------------------------------------------------------
export const buscarCampanhas = {
  declaration: {
    name: 'buscarCampanhas',
    description:
      'Sugere campanhas de comunicação com base na carteira de pacientes (ex.: pacientes sem retorno ' +
      'agendado). Use quando perguntarem sobre campanhas ou ações de comunicação em massa.',
    parameters: { type: 'object', properties: {} },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Montando as campanhas…',
  async execute(_args = {}, ctx = {}) {
    const isMedico = ctx.role === 'medico'
    let patients = await patientRepository.getDirectoryRows(
      isMedico ? { doctorId: ctx.currentDoctorId || 'non-existent' } : {},
    )
    if (isMedico) {
      const ids = await getMedicoPatientIds(ctx)
      patients = patients.filter((row) => ids.has(String(row.id)))
    }

    const campanhas = await communicationRepository.getCampaigns({ patients })
    return { campanhas }
  },
}

// -----------------------------------------------------------------------------
// 18. buscarNotificacoes → notificationRepository.getForCurrentUser
// -----------------------------------------------------------------------------
export const buscarNotificacoes = {
  declaration: {
    name: 'buscarNotificacoes',
    description:
      'Lista as notificações do usuário atual (avisos de agenda, comunicação, etc.), mais recentes ' +
      'primeiro. Use quando o usuário perguntar se tem notificações ou avisos.',
    parameters: { type: 'object', properties: {} },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico', 'paciente'],
  runningLabel: 'Consultando as notificações…',
  async execute() {
    // O repositório já escopa pelo usuário autenticado.
    const list = await notificationRepository.getForCurrentUser()
    return {
      total: list.length,
      notificacoes: list.slice(0, 30).map((notification) => ({
        id: notification.id,
        titulo: notification.title,
        detalhe: notification.detail,
        dominio: notification.domain,
        rota: notification.route,
        lida: notification.read,
        criadoEm: notification.createdAt,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 19. buscarUsuarios → userRepository.getAll
// -----------------------------------------------------------------------------
export const buscarUsuarios = {
  declaration: {
    name: 'buscarUsuarios',
    description:
      'Lista os usuários do sistema (nome, e-mail, perfil/role, status). Restrito à gestão. Use quando ' +
      'admin/gestor perguntar sobre usuários ou contas.',
    parameters: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Texto para filtrar por nome ou e-mail.' },
      },
    },
  },
  requiresConfirmation: false,
  // manageUsers: só admin/gestor.
  allowedRoles: ['admin', 'gestor'],
  runningLabel: 'Consultando os usuários…',
  async execute(args = {}) {
    let list = await userRepository.getAll()

    if (args.busca) {
      list = list.filter((user) => matchText(user.full_name, args.busca) || matchText(user.email, args.busca))
    }

    return {
      total: list.length,
      usuarios: list.slice(0, 50).map((user) => ({
        id: user.id,
        nome: user.full_name,
        email: user.email,
        telefone: user.phone || user.phone_mobile,
        role: user.role,
        status: user.status,
        doctorId: user.doctorId,
        patientId: user.patientId,
        crm: user.crm,
        especialidade: user.specialty,
      })),
    }
  },
}

// -----------------------------------------------------------------------------
// 20. detalharUsuario → userRepository.getById
// -----------------------------------------------------------------------------
export const detalharUsuario = {
  declaration: {
    name: 'detalharUsuario',
    description: 'Retorna os detalhes de um usuário específico pelo id. Restrito à gestão.',
    parameters: {
      type: 'object',
      properties: {
        usuarioId: { type: 'string', description: 'ID do usuário.' },
      },
      required: ['usuarioId'],
    },
  },
  requiresConfirmation: false,
  allowedRoles: ['admin', 'gestor'],
  runningLabel: 'Abrindo o usuário…',
  async execute(args = {}) {
    if (!args.usuarioId) return { error: 'Informe o usuarioId.' }
    const user = await userRepository.getById(args.usuarioId)
    if (!user) return { error: 'Usuário não encontrado.' }
    return user
  },
}
