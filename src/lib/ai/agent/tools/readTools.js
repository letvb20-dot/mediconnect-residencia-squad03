import { appointmentRepository } from '../../../../repositories/appointmentRepository.js'

// Ferramenta de leitura: consultas/agendamentos.
// O RBAC é FORÇADO aqui (não confiamos no modelo): médico só enxerga a própria
// agenda; paciente, as próprias consultas. Espelha a lógica de buildContext.
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
