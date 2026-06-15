import { appointmentRepository } from '../../../../repositories/appointmentRepository.js'
import { waitlistRepository } from '../../../../repositories/waitlistRepository.js'
import { availabilityRepository } from '../../../../repositories/availabilityRepository.js'
import { reportRepository } from '../../../../repositories/reportRepository.js'
import { medicalRecordRepository } from '../../../../repositories/medicalRecordRepository.js'
import { patientRepository } from '../../../../repositories/patientRepository.js'
import { professionalRepository } from '../../../../repositories/professionalRepository.js'
import { userRepository } from '../../../../repositories/userRepository.js'
import { visitRepository } from '../../../../repositories/visitRepository.js'
import { communicationRepository } from '../../../../repositories/communicationRepository.js'
import { notificationRepository } from '../../../../repositories/notificationRepository.js'
import { ADMIN_CREATABLE_ROLES, GESTOR_CREATABLE_ROLES, normalizeRole } from '../../../../config/permissions.js'

// =============================================================================
// Ferramentas de ESCRITA do agente (Create / Update / Delete).
//
// Diferenças em relação às de leitura:
//   1. requiresConfirmation: true  -> o loop só executa após o ConfirmationCard
//      ser aceito. Cada tool expõe summarize(args, ctx) com o resumo humano.
//   2. Ownership é validado ANTES de mutar (não é só filtro): se o recurso não
//      pertencer ao escopo do usuário, recusa com erro legível. Nunca confia no
//      modelo. Fail-closed: ctx incompleto -> recusa.
// =============================================================================

// --- Helpers de escopo/ownership -------------------------------------------

// Conjunto de pacientes do médico (derivado das consultas dele).
async function medicoPatientIds(ctx = {}) {
  if (!ctx.currentDoctorId) return new Set()
  const appointments = await appointmentRepository.getAll({ doctorId: ctx.currentDoctorId })
  const ids = new Set()
  for (const appointment of appointments || []) {
    if (appointment.patientId) ids.add(String(appointment.patientId))
  }
  return ids
}

// Médico só pode tocar consultas da própria agenda; paciente, só as próprias.
async function ownsAppointment(ctx, consultaId) {
  if (ctx.role === 'medico') {
    if (!ctx.currentDoctorId) return false
    const list = await appointmentRepository.getAll({ doctorId: ctx.currentDoctorId })
    return list.some((a) => String(a.id) === String(consultaId))
  }
  if (ctx.role === 'paciente') {
    if (!ctx.currentPatientId) return false
    const list = await appointmentRepository.getAll({ patientId: ctx.currentPatientId })
    return list.some((a) => String(a.id) === String(consultaId))
  }
  return true
}

async function medicoOwnsPatient(ctx, pacienteId) {
  const ids = await medicoPatientIds(ctx)
  return ids.has(String(pacienteId))
}

// Entrada da lista de espera é do médico? (localStorage não filtra -> checar aqui)
async function ownsWaitlist(ctx, entradaId) {
  if (ctx.role !== 'medico') return true
  const list = await waitlistRepository.getAll()
  const entry = list.find((e) => String(e.id) === String(entradaId))
  return Boolean(entry) && String(entry.doctorId) === String(ctx.currentDoctorId || 'non-existent')
}

async function ownsVisit(ctx, filaId) {
  if (ctx.role !== 'medico') return true
  const queue = await visitRepository.getCareQueue()
  const item = queue.find((q) => String(q.id) === String(filaId))
  return Boolean(item) && String(item.professionalId) === String(ctx.currentDoctorId || 'non-existent')
}

async function ownsAvailability(ctx, janelaId) {
  if (ctx.role !== 'medico') return true
  const list = await availabilityRepository.getAll({ doctorId: ctx.currentDoctorId || 'non-existent' })
  return list.some((w) => String(w.id) === String(janelaId))
}

async function medicoOwnsReport(ctx, laudoId) {
  const ids = await medicoPatientIds(ctx)
  if (!ids.size) return false
  const list = await reportRepository.getInitialReports({ patientIds: [...ids] })
  return list.some((r) => String(r.id) === String(laudoId))
}

const RECUSA = { erro: 'Ação fora do seu escopo de permissão.' }

// =============================================================================
// CREATE
// =============================================================================

export const agendarConsulta = {
  declaration: {
    name: 'agendarConsulta',
    description:
      'Agenda uma nova consulta. Resolva antes o id do paciente (buscarPacientes) e do profissional ' +
      '(buscarProfissionais). Use quando o usuário pedir para marcar/agendar uma consulta.',
    parameters: {
      type: 'object',
      properties: {
        pacienteId: { type: 'string', description: 'ID do paciente.' },
        profissionalId: { type: 'string', description: 'ID do profissional.' },
        data: { type: 'string', description: 'Data no formato AAAA-MM-DD.' },
        hora: { type: 'string', description: 'Hora no formato HH:mm.' },
        duracao: { type: 'integer', description: 'Duração em minutos (opcional, padrão 30).' },
      },
      required: ['pacienteId', 'profissionalId', 'data', 'hora'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico', 'paciente'],
  runningLabel: 'Agendando a consulta…',
  summarize(args = {}) {
    return `Agendar consulta — paciente ${args.pacienteId}, profissional ${args.profissionalId}, em ${args.data} às ${args.hora}.`
  },
  async execute(args = {}, ctx = {}) {
    const payload = {
      patientId: args.pacienteId,
      professionalId: args.profissionalId,
      date: args.data,
      time: args.hora,
      durationMinutes: args.duracao,
    }
    // Escopo: médico agenda só na própria agenda; paciente só para si.
    if (ctx.role === 'medico') {
      if (!ctx.currentDoctorId) return RECUSA
      payload.professionalId = ctx.currentDoctorId
    } else if (ctx.role === 'paciente') {
      if (!ctx.currentPatientId) return RECUSA
      payload.patientId = ctx.currentPatientId
    }
    if (!payload.patientId || !payload.professionalId || !payload.date || !payload.time) {
      return { erro: 'Faltam dados: paciente, profissional, data e hora são obrigatórios.' }
    }
    const consulta = await appointmentRepository.create(payload)
    return { ok: true, consulta }
  },
}

export const adicionarListaEspera = {
  declaration: {
    name: 'adicionarListaEspera',
    description:
      'Adiciona um paciente à lista de espera. Use quando não houver horário e o paciente quiser entrar na fila.',
    parameters: {
      type: 'object',
      properties: {
        pacienteId: { type: 'string', description: 'ID do paciente.' },
        pacienteNome: { type: 'string', description: 'Nome do paciente.' },
        telefone: { type: 'string', description: 'Telefone de contato.' },
        profissionalId: { type: 'string', description: 'ID do profissional desejado (opcional).' },
        urgencia: { type: 'integer', description: 'Urgência 1-5 (opcional, padrão 3).' },
        canal: { type: 'string', description: 'Canal de contato: whatsapp, sms, telefone (opcional).' },
        motivo: { type: 'string', description: 'Motivo/observação (opcional).' },
      },
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Adicionando à lista de espera…',
  summarize(args = {}) {
    return `Adicionar ${args.pacienteNome || args.pacienteId || 'paciente'} à lista de espera${args.urgencia ? ` (urgência ${args.urgencia})` : ''}.`
  },
  async execute(args = {}, ctx = {}) {
    const data = {
      patientId: args.pacienteId,
      patientName: args.pacienteNome,
      patientPhone: args.telefone,
      doctorId: ctx.role === 'medico' ? ctx.currentDoctorId || 'non-existent' : args.profissionalId,
      urgency: args.urgencia,
      channel: args.canal,
      reason: args.motivo,
    }
    const entrada = await waitlistRepository.add(data)
    return { ok: true, entrada }
  },
}

export const criarLaudo = {
  declaration: {
    name: 'criarLaudo',
    description: 'Cria um laudo/relatório clínico para um paciente.',
    parameters: {
      type: 'object',
      properties: {
        pacienteId: { type: 'string', description: 'ID do paciente.' },
        exame: { type: 'string', description: 'Exame/título do laudo.' },
        status: { type: 'string', description: 'rascunho/draft ou entregue/delivered (opcional).' },
        diagnostico: { type: 'string', description: 'Diagnóstico (opcional).' },
        conclusao: { type: 'string', description: 'Conclusão (opcional).' },
        conteudoHtml: { type: 'string', description: 'Conteúdo do laudo (opcional).' },
      },
      required: ['pacienteId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'medico'],
  runningLabel: 'Criando o laudo…',
  summarize(args = {}) {
    return `Criar laudo${args.exame ? ` de "${args.exame}"` : ''} para o paciente ${args.pacienteId}.`
  },
  async execute(args = {}, ctx = {}) {
    if (ctx.role === 'medico' && !(await medicoOwnsPatient(ctx, args.pacienteId))) return RECUSA
    const laudo = await reportRepository.create({
      patientId: args.pacienteId,
      exam: args.exame,
      status: args.status,
      diagnosis: args.diagnostico,
      conclusion: args.conclusao,
      contentHtml: args.conteudoHtml,
    })
    return { ok: true, laudo }
  },
}

export const criarProntuario = {
  declaration: {
    name: 'criarProntuario',
    description: 'Cria um registro de prontuário médico para um paciente.',
    parameters: {
      type: 'object',
      properties: {
        pacienteId: { type: 'string', description: 'ID do paciente.' },
        tipo: { type: 'string', description: 'Tipo (ex.: Primeira Consulta, Consulta Retorno, Exame).' },
        data: { type: 'string', description: 'Data AAAA-MM-DD (opcional).' },
        cid: { type: 'string', description: 'CID (opcional).' },
        diagnostico: { type: 'string', description: 'Diagnóstico (opcional).' },
        conduta: { type: 'string', description: 'Conduta (opcional).' },
        prescricoes: { type: 'string', description: 'Prescrições (opcional).' },
        conteudoHtml: { type: 'string', description: 'Anamnese/conteúdo (opcional).' },
      },
      required: ['pacienteId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'medico'],
  runningLabel: 'Criando o prontuário…',
  summarize(args = {}) {
    return `Criar prontuário${args.tipo ? ` (${args.tipo})` : ''} para o paciente ${args.pacienteId}.`
  },
  async execute(args = {}, ctx = {}) {
    if (ctx.role === 'medico' && !(await medicoOwnsPatient(ctx, args.pacienteId))) return RECUSA
    const prontuario = await medicalRecordRepository.create({
      patientId: args.pacienteId,
      type: args.tipo,
      date: args.data,
      cid: args.cid,
      diagnosis: args.diagnostico,
      conduct: args.conduta,
      prescriptions: args.prescricoes,
      contentHtml: args.conteudoHtml,
    })
    return { ok: true, prontuario }
  },
}

export const cadastrarPaciente = {
  declaration: {
    name: 'cadastrarPaciente',
    description: 'Cadastra um novo paciente. Exige nome, e-mail, CPF e telefone.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome completo.' },
        email: { type: 'string', description: 'E-mail.' },
        cpf: { type: 'string', description: 'CPF (11 dígitos).' },
        telefone: { type: 'string', description: 'Telefone celular (DDD + número).' },
        nascimento: { type: 'string', description: 'Data de nascimento AAAA-MM-DD (opcional).' },
      },
      required: ['nome', 'email', 'cpf', 'telefone'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria'],
  runningLabel: 'Cadastrando o paciente…',
  summarize(args = {}) {
    return `Cadastrar paciente ${args.nome} (CPF ${args.cpf}, ${args.email}).`
  },
  async execute(args = {}) {
    const paciente = await patientRepository.create({
      full_name: args.nome,
      email: args.email,
      cpf: args.cpf,
      phone_mobile: args.telefone,
      birth_date: args.nascimento,
    })
    return { ok: true, paciente }
  },
}

export const cadastrarProfissional = {
  declaration: {
    name: 'cadastrarProfissional',
    description: 'Cadastra um novo profissional (médico). Exige nome, e-mail, CPF, CRM e UF do CRM.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome completo.' },
        email: { type: 'string', description: 'E-mail.' },
        cpf: { type: 'string', description: 'CPF (11 dígitos).' },
        crm: { type: 'string', description: 'Número do CRM.' },
        crmUf: { type: 'string', description: 'UF do CRM (2 letras).' },
        especialidade: { type: 'string', description: 'Especialidade (opcional).' },
        telefone: { type: 'string', description: 'Telefone (opcional).' },
      },
      required: ['nome', 'email', 'cpf', 'crm', 'crmUf'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor'],
  runningLabel: 'Cadastrando o profissional…',
  summarize(args = {}) {
    return `Cadastrar profissional ${args.nome} (CRM ${args.crm}/${args.crmUf}).`
  },
  async execute(args = {}) {
    const profissional = await professionalRepository.create({
      fullName: args.nome,
      email: args.email,
      cpf: args.cpf,
      crm: args.crm,
      crm_uf: args.crmUf,
      specialty: args.especialidade,
      phone_mobile: args.telefone,
    })
    return { ok: true, profissional }
  },
}

export const criarUsuario = {
  declaration: {
    name: 'criarUsuario',
    description: 'Cria um usuário do sistema com um papel (role). Restrito à gestão.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome completo.' },
        email: { type: 'string', description: 'E-mail.' },
        role: { type: 'string', description: 'Papel: admin, gestor, medico, secretaria, paciente.' },
        telefone: { type: 'string', description: 'Telefone (opcional).' },
        cpf: { type: 'string', description: 'CPF (opcional).' },
      },
      required: ['nome', 'email', 'role'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor'],
  runningLabel: 'Criando o usuário…',
  summarize(args = {}) {
    return `Criar usuário ${args.nome} (${args.email}) com papel "${args.role}".`
  },
  async execute(args = {}, ctx = {}) {
    const alvo = normalizeRole(args.role)
    if (!alvo) return { erro: 'Papel inválido.' }
    const permitidos = ctx.role === 'gestor' ? GESTOR_CREATABLE_ROLES : ADMIN_CREATABLE_ROLES
    if (!permitidos.includes(alvo)) {
      return { erro: `Seu perfil não pode criar usuários com o papel "${alvo}".` }
    }
    const usuario = await userRepository.create({
      full_name: args.nome,
      email: args.email,
      role: alvo,
      phone: args.telefone,
      cpf: args.cpf,
    })
    return { ok: true, usuario }
  },
}

export const criarJanelaAtendimento = {
  declaration: {
    name: 'criarJanelaAtendimento',
    description: 'Cria uma janela recorrente de atendimento na agenda de um profissional.',
    parameters: {
      type: 'object',
      properties: {
        profissionalId: { type: 'string', description: 'ID do profissional.' },
        diaSemana: { type: 'integer', description: 'Dia da semana (0=domingo..6=sábado).' },
        inicio: { type: 'string', description: 'Início HH:mm.' },
        fim: { type: 'string', description: 'Fim HH:mm.' },
        duracaoSlot: { type: 'integer', description: 'Duração do slot em minutos (opcional, padrão 30).' },
        tipo: { type: 'string', description: 'presencial ou telemedicina (opcional).' },
      },
      required: ['diaSemana', 'inicio', 'fim'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Criando a janela de atendimento…',
  summarize(args = {}) {
    return `Criar janela de atendimento: dia ${args.diaSemana}, das ${args.inicio} às ${args.fim}.`
  },
  async execute(args = {}, ctx = {}) {
    const doctorId = ctx.role === 'medico' ? ctx.currentDoctorId || 'non-existent' : args.profissionalId
    if (!doctorId) return { erro: 'Informe o profissionalId.' }
    const janela = await availabilityRepository.create({
      doctorId,
      weekday: args.diaSemana,
      startTime: args.inicio,
      endTime: args.fim,
      slotMinutes: args.duracaoSlot,
      appointmentType: args.tipo,
    })
    return { ok: true, janela }
  },
}

export const criarExcecaoAgenda = {
  declaration: {
    name: 'criarExcecaoAgenda',
    description: 'Cria uma exceção na agenda: bloqueio (folga/férias) ou disponibilidade extra, em uma data.',
    parameters: {
      type: 'object',
      properties: {
        profissionalId: { type: 'string', description: 'ID do profissional.' },
        data: { type: 'string', description: 'Data AAAA-MM-DD.' },
        tipo: { type: 'string', description: 'bloqueio ou disponibilidade_extra.' },
        inicio: { type: 'string', description: 'Início HH:mm (opcional).' },
        fim: { type: 'string', description: 'Fim HH:mm (opcional).' },
        motivo: { type: 'string', description: 'Motivo (opcional).' },
      },
      required: ['data', 'tipo'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Criando exceção na agenda…',
  summarize(args = {}) {
    return `Criar ${args.tipo === 'bloqueio' ? 'bloqueio' : 'disponibilidade extra'} em ${args.data}.`
  },
  async execute(args = {}, ctx = {}) {
    const doctorId = ctx.role === 'medico' ? ctx.currentDoctorId || 'non-existent' : args.profissionalId
    if (!doctorId) return { erro: 'Informe o profissionalId.' }
    const excecao = await availabilityRepository.createException({
      doctorId,
      date: args.data,
      kind: args.tipo,
      startTime: args.inicio,
      endTime: args.fim,
      reason: args.motivo,
    })
    return { ok: true, excecao }
  },
}

export const enviarMensagem = {
  declaration: {
    name: 'enviarMensagem',
    description:
      'Envia uma mensagem (SMS ou WhatsApp) a um paciente. AÇÃO EXTERNA: envia de verdade. ' +
      'Use quando o usuário pedir para avisar/notificar um paciente.',
    parameters: {
      type: 'object',
      properties: {
        telefone: { type: 'string', description: 'Telefone do destinatário.' },
        conteudo: { type: 'string', description: 'Texto da mensagem.' },
        canal: { type: 'string', description: 'whatsapp (padrão) ou sms.' },
        pacienteId: { type: 'string', description: 'ID do paciente (opcional).' },
        pacienteNome: { type: 'string', description: 'Nome do paciente (opcional).' },
      },
      required: ['telefone', 'conteudo'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Enviando a mensagem…',
  summarize(args = {}) {
    const canal = args.canal === 'sms' ? 'SMS' : 'WhatsApp'
    return `Enviar ${canal} para ${args.telefone}: "${args.conteudo}"`
  },
  async execute(args = {}) {
    const payload = {
      patientId: args.pacienteId,
      patientName: args.pacienteNome,
      phone: args.telefone,
      content: args.conteudo,
    }
    const resultado =
      args.canal === 'sms'
        ? await communicationRepository.sendSms(payload)
        : await communicationRepository.sendWhatsApp(payload)
    return { ok: true, resultado }
  },
}

export const enfileirarAtendimento = {
  declaration: {
    name: 'enfileirarAtendimento',
    description: 'Coloca um paciente na fila de atendimento do dia.',
    parameters: {
      type: 'object',
      properties: {
        pacienteId: { type: 'string', description: 'ID do paciente.' },
        profissionalId: { type: 'string', description: 'ID do profissional.' },
        data: { type: 'string', description: 'Data AAAA-MM-DD.' },
        hora: { type: 'string', description: 'Hora HH:mm.' },
        tipo: { type: 'string', description: 'Tipo de atendimento (opcional).' },
        prioridade: { type: 'string', description: 'Alta, Média ou Baixa (opcional).' },
      },
      required: ['pacienteId', 'data', 'hora'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Enfileirando o atendimento…',
  summarize(args = {}) {
    return `Colocar o paciente ${args.pacienteId} na fila de atendimento em ${args.data} ${args.hora}.`
  },
  async execute(args = {}, ctx = {}) {
    const professionalId = ctx.role === 'medico' ? ctx.currentDoctorId || 'non-existent' : args.profissionalId
    const item = await visitRepository.enqueue({
      patientId: args.pacienteId,
      professionalId,
      date: args.data,
      time: args.hora,
      type: args.tipo,
      priority: args.prioridade,
    })
    return { ok: true, item }
  },
}

// =============================================================================
// UPDATE
// =============================================================================

export const cancelarConsulta = {
  declaration: {
    name: 'cancelarConsulta',
    description: 'Cancela uma consulta pelo id (marca como cancelada). Use buscarConsultas para achar o id.',
    parameters: {
      type: 'object',
      properties: {
        consultaId: { type: 'string', description: 'ID da consulta.' },
        motivo: { type: 'string', description: 'Motivo do cancelamento (opcional).' },
      },
      required: ['consultaId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico', 'paciente'],
  runningLabel: 'Cancelando a consulta…',
  summarize(args = {}) {
    return `Cancelar a consulta ${args.consultaId}${args.motivo ? ` — motivo: ${args.motivo}` : ''}.`
  },
  async execute(args = {}, ctx = {}) {
    if (!(await ownsAppointment(ctx, args.consultaId))) return RECUSA
    const consulta = await appointmentRepository.cancel(args.consultaId, { notes: args.motivo })
    return { ok: true, consulta }
  },
}

export const remarcarConsulta = {
  declaration: {
    name: 'remarcarConsulta',
    description: 'Remarca uma consulta para nova data/hora. Use buscarConsultas para achar o id.',
    parameters: {
      type: 'object',
      properties: {
        consultaId: { type: 'string', description: 'ID da consulta.' },
        novaData: { type: 'string', description: 'Nova data AAAA-MM-DD.' },
        novaHora: { type: 'string', description: 'Nova hora HH:mm.' },
      },
      required: ['consultaId', 'novaData', 'novaHora'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico', 'paciente'],
  runningLabel: 'Remarcando a consulta…',
  summarize(args = {}) {
    return `Remarcar a consulta ${args.consultaId} para ${args.novaData} às ${args.novaHora}.`
  },
  async execute(args = {}, ctx = {}) {
    if (!(await ownsAppointment(ctx, args.consultaId))) return RECUSA
    const consulta = await appointmentRepository.update(args.consultaId, {
      date: args.novaData,
      time: args.novaHora,
    })
    return { ok: true, consulta }
  },
}

export const atualizarPaciente = {
  declaration: {
    name: 'atualizarPaciente',
    description: 'Atualiza dados de um paciente (nome, telefone, e-mail).',
    parameters: {
      type: 'object',
      properties: {
        pacienteId: { type: 'string', description: 'ID do paciente.' },
        nome: { type: 'string', description: 'Novo nome (opcional).' },
        telefone: { type: 'string', description: 'Novo telefone (opcional).' },
        email: { type: 'string', description: 'Novo e-mail (opcional).' },
      },
      required: ['pacienteId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria'],
  runningLabel: 'Atualizando o paciente…',
  summarize(args = {}) {
    return `Atualizar dados do paciente ${args.pacienteId}.`
  },
  async execute(args = {}) {
    const paciente = await patientRepository.update(args.pacienteId, {
      full_name: args.nome,
      phone_mobile: args.telefone,
      email: args.email,
    })
    return { ok: true, paciente }
  },
}

export const atualizarLaudo = {
  declaration: {
    name: 'atualizarLaudo',
    description: 'Edita um laudo existente pelo id.',
    parameters: {
      type: 'object',
      properties: {
        laudoId: { type: 'string', description: 'ID do laudo.' },
        status: { type: 'string', description: 'Novo status (opcional).' },
        diagnostico: { type: 'string', description: 'Diagnóstico (opcional).' },
        conclusao: { type: 'string', description: 'Conclusão (opcional).' },
        exame: { type: 'string', description: 'Exame/título (opcional).' },
      },
      required: ['laudoId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'medico'],
  runningLabel: 'Atualizando o laudo…',
  summarize(args = {}) {
    return `Atualizar o laudo ${args.laudoId}.`
  },
  async execute(args = {}, ctx = {}) {
    if (ctx.role === 'medico' && !(await medicoOwnsReport(ctx, args.laudoId))) return RECUSA
    const laudo = await reportRepository.update(args.laudoId, {
      status: args.status,
      diagnosis: args.diagnostico,
      conclusion: args.conclusao,
      exam: args.exame,
    })
    return { ok: true, laudo }
  },
}

export const atualizarProntuario = {
  declaration: {
    name: 'atualizarProntuario',
    description: 'Edita um prontuário existente pelo id.',
    parameters: {
      type: 'object',
      properties: {
        prontuarioId: { type: 'string', description: 'ID do prontuário.' },
        diagnostico: { type: 'string', description: 'Diagnóstico (opcional).' },
        conduta: { type: 'string', description: 'Conduta (opcional).' },
        prescricoes: { type: 'string', description: 'Prescrições (opcional).' },
        cid: { type: 'string', description: 'CID (opcional).' },
      },
      required: ['prontuarioId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'medico'],
  runningLabel: 'Atualizando o prontuário…',
  summarize(args = {}) {
    return `Atualizar o prontuário ${args.prontuarioId}.`
  },
  async execute(args = {}, ctx = {}) {
    if (ctx.role === 'medico') {
      const rec = await medicalRecordRepository.getById(args.prontuarioId)
      if (!rec) return { erro: 'Prontuário não encontrado.' }
      if (rec.patientId && !(await medicoOwnsPatient(ctx, rec.patientId))) return RECUSA
    }
    const prontuario = await medicalRecordRepository.update(args.prontuarioId, {
      diagnosis: args.diagnostico,
      conduct: args.conduta,
      prescriptions: args.prescricoes,
      cid: args.cid,
    })
    return { ok: true, prontuario }
  },
}

export const atualizarJanelaAtendimento = {
  declaration: {
    name: 'atualizarJanelaAtendimento',
    description: 'Edita uma janela de atendimento da agenda pelo id.',
    parameters: {
      type: 'object',
      properties: {
        janelaId: { type: 'string', description: 'ID da janela.' },
        inicio: { type: 'string', description: 'Novo início HH:mm (opcional).' },
        fim: { type: 'string', description: 'Novo fim HH:mm (opcional).' },
        duracaoSlot: { type: 'integer', description: 'Duração do slot (opcional).' },
        ativo: { type: 'boolean', description: 'Ativa/inativa a janela (opcional).' },
      },
      required: ['janelaId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Atualizando a janela de atendimento…',
  summarize(args = {}) {
    return `Atualizar a janela de atendimento ${args.janelaId}.`
  },
  async execute(args = {}, ctx = {}) {
    if (!(await ownsAvailability(ctx, args.janelaId))) return RECUSA
    const janela = await availabilityRepository.update(args.janelaId, {
      startTime: args.inicio,
      endTime: args.fim,
      slotMinutes: args.duracaoSlot,
      active: args.ativo,
    })
    return { ok: true, janela }
  },
}

export const atualizarUsuario = {
  declaration: {
    name: 'atualizarUsuario',
    description: 'Edita um usuário do sistema pelo id. Restrito à gestão.',
    parameters: {
      type: 'object',
      properties: {
        usuarioId: { type: 'string', description: 'ID do usuário.' },
        nome: { type: 'string', description: 'Novo nome (opcional).' },
        email: { type: 'string', description: 'Novo e-mail (opcional).' },
        telefone: { type: 'string', description: 'Novo telefone (opcional).' },
      },
      required: ['usuarioId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor'],
  runningLabel: 'Atualizando o usuário…',
  summarize(args = {}) {
    return `Atualizar o usuário ${args.usuarioId}.`
  },
  async execute(args = {}) {
    const usuario = await userRepository.update(args.usuarioId, {
      full_name: args.nome,
      email: args.email,
      phone: args.telefone,
    })
    return { ok: true, usuario }
  },
}

export const atualizarListaEspera = {
  declaration: {
    name: 'atualizarListaEspera',
    description: 'Edita uma entrada da lista de espera (urgência, status, canal).',
    parameters: {
      type: 'object',
      properties: {
        entradaId: { type: 'string', description: 'ID da entrada.' },
        urgencia: { type: 'integer', description: 'Nova urgência 1-5 (opcional).' },
        status: { type: 'string', description: 'Novo status (opcional).' },
        canal: { type: 'string', description: 'Novo canal (opcional).' },
      },
      required: ['entradaId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Atualizando a lista de espera…',
  summarize(args = {}) {
    return `Atualizar a entrada ${args.entradaId} da lista de espera.`
  },
  async execute(args = {}, ctx = {}) {
    if (!(await ownsWaitlist(ctx, args.entradaId))) return RECUSA
    const entrada = await waitlistRepository.update(args.entradaId, {
      urgency: args.urgencia,
      status: args.status,
      channel: args.canal,
    })
    return { ok: true, entrada }
  },
}

export const marcarListaEsperaNotificada = {
  declaration: {
    name: 'marcarListaEsperaNotificada',
    description: 'Marca uma entrada da lista de espera como notificada.',
    parameters: {
      type: 'object',
      properties: {
        entradaId: { type: 'string', description: 'ID da entrada.' },
        canal: { type: 'string', description: 'Canal usado para notificar (opcional).' },
      },
      required: ['entradaId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Marcando como notificada…',
  summarize(args = {}) {
    return `Marcar a entrada ${args.entradaId} da lista de espera como notificada.`
  },
  async execute(args = {}, ctx = {}) {
    if (!(await ownsWaitlist(ctx, args.entradaId))) return RECUSA
    const entrada = await waitlistRepository.markNotified(args.entradaId, args.canal)
    return { ok: true, entrada }
  },
}

export const marcarAtendimentoAgendado = {
  declaration: {
    name: 'marcarAtendimentoAgendado',
    description: 'Marca um item da fila de atendimento como agendado.',
    parameters: {
      type: 'object',
      properties: {
        filaId: { type: 'string', description: 'ID do item da fila.' },
        consultaId: { type: 'string', description: 'ID da consulta vinculada (opcional).' },
      },
      required: ['filaId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Marcando atendimento como agendado…',
  summarize(args = {}) {
    return `Marcar o item ${args.filaId} da fila como agendado.`
  },
  async execute(args = {}, ctx = {}) {
    if (!(await ownsVisit(ctx, args.filaId))) return RECUSA
    const item = await visitRepository.markScheduled(args.filaId, { id: args.consultaId })
    return { ok: true, item }
  },
}

export const marcarNotificacoesLidas = {
  declaration: {
    name: 'marcarNotificacoesLidas',
    description: 'Marca todas as notificações do usuário atual como lidas.',
    parameters: { type: 'object', properties: {} },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico', 'paciente'],
  runningLabel: 'Marcando notificações como lidas…',
  summarize() {
    return 'Marcar todas as suas notificações como lidas.'
  },
  async execute() {
    await notificationRepository.markAllReadForCurrentUser()
    return { ok: true }
  },
}

// =============================================================================
// DELETE — hard delete; confirmação obrigatória e enfática
// =============================================================================

export const removerPaciente = {
  declaration: {
    name: 'removerPaciente',
    description: 'APAGA permanentemente um paciente. Ação destrutiva e irreversível. Restrito à gestão.',
    parameters: {
      type: 'object',
      properties: { pacienteId: { type: 'string', description: 'ID do paciente.' } },
      required: ['pacienteId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor'],
  runningLabel: 'Removendo o paciente…',
  summarize(args = {}) {
    return `⚠️ APAGAR PERMANENTEMENTE o paciente ${args.pacienteId}. Esta ação é irreversível.`
  },
  async execute(args = {}) {
    await patientRepository.remove(args.pacienteId)
    return { ok: true }
  },
}

export const removerUsuario = {
  declaration: {
    name: 'removerUsuario',
    description: 'APAGA permanentemente um usuário. Ação destrutiva e irreversível. Restrito à gestão.',
    parameters: {
      type: 'object',
      properties: { usuarioId: { type: 'string', description: 'ID do usuário.' } },
      required: ['usuarioId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor'],
  runningLabel: 'Removendo o usuário…',
  summarize(args = {}) {
    return `⚠️ APAGAR PERMANENTEMENTE o usuário ${args.usuarioId}. Esta ação é irreversível.`
  },
  async execute(args = {}) {
    await userRepository.remove(args.usuarioId)
    return { ok: true }
  },
}

export const removerLaudo = {
  declaration: {
    name: 'removerLaudo',
    description: 'APAGA permanentemente um laudo. Ação destrutiva e irreversível.',
    parameters: {
      type: 'object',
      properties: { laudoId: { type: 'string', description: 'ID do laudo.' } },
      required: ['laudoId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'medico'],
  runningLabel: 'Removendo o laudo…',
  summarize(args = {}) {
    return `⚠️ APAGAR PERMANENTEMENTE o laudo ${args.laudoId}. Esta ação é irreversível.`
  },
  async execute(args = {}, ctx = {}) {
    if (ctx.role === 'medico' && !(await medicoOwnsReport(ctx, args.laudoId))) return RECUSA
    await reportRepository.remove(args.laudoId)
    return { ok: true }
  },
}

export const removerJanelaAtendimento = {
  declaration: {
    name: 'removerJanelaAtendimento',
    description: 'APAGA uma janela de atendimento da agenda. Ação destrutiva.',
    parameters: {
      type: 'object',
      properties: { janelaId: { type: 'string', description: 'ID da janela.' } },
      required: ['janelaId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Removendo a janela de atendimento…',
  summarize(args = {}) {
    return `⚠️ APAGAR a janela de atendimento ${args.janelaId}.`
  },
  async execute(args = {}, ctx = {}) {
    if (!(await ownsAvailability(ctx, args.janelaId))) return RECUSA
    await availabilityRepository.remove(args.janelaId)
    return { ok: true }
  },
}

export const removerDaListaEspera = {
  declaration: {
    name: 'removerDaListaEspera',
    description: 'Remove uma entrada da lista de espera. Ação destrutiva.',
    parameters: {
      type: 'object',
      properties: { entradaId: { type: 'string', description: 'ID da entrada.' } },
      required: ['entradaId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Removendo da lista de espera…',
  summarize(args = {}) {
    return `⚠️ Remover a entrada ${args.entradaId} da lista de espera.`
  },
  async execute(args = {}, ctx = {}) {
    if (!(await ownsWaitlist(ctx, args.entradaId))) return RECUSA
    await waitlistRepository.remove(args.entradaId)
    return { ok: true }
  },
}

export const removerDaFila = {
  declaration: {
    name: 'removerDaFila',
    description: 'Remove um item da fila de atendimento. Ação destrutiva.',
    parameters: {
      type: 'object',
      properties: { filaId: { type: 'string', description: 'ID do item da fila.' } },
      required: ['filaId'],
    },
  },
  requiresConfirmation: true,
  allowedRoles: ['admin', 'gestor', 'secretaria', 'medico'],
  runningLabel: 'Removendo da fila de atendimento…',
  summarize(args = {}) {
    return `⚠️ Remover o item ${args.filaId} da fila de atendimento.`
  },
  async execute(args = {}, ctx = {}) {
    if (!(await ownsVisit(ctx, args.filaId))) return RECUSA
    await visitRepository.remove(args.filaId)
    return { ok: true }
  },
}
