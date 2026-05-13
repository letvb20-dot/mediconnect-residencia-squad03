import { appointmentRepository } from './appointmentRepository.js'
import { patientRepository } from './patientRepository.js'

export const homeRepository = {
  async getDashboardOverview() {
    const [appointments, patients] = await Promise.all([
      appointmentRepository.getAll().catch(() => []),
      patientRepository.getDirectoryRows().catch(() => []),
    ])

    const todayKey = formatDateKey(new Date())
    const todayAppointments = appointments
      .filter((appointment) => appointment.date === todayKey)
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))

    const completedAppointments = appointments.filter((appointment) => isCompletedStatus(appointment.status))
    const noShowAppointments = appointments.filter((appointment) => isNoShowStatus(appointment.status))
    const pendingToday = todayAppointments.filter((appointment) => isPendingStatus(appointment.status))
    const occupancyRate = Math.min(100, Math.round((todayAppointments.length / 24) * 1000) / 10)
    const noShowRate = appointments.length
      ? Math.round((noShowAppointments.length / appointments.length) * 1000) / 10
      : 0

    return {
      appointmentsToday: todayAppointments.slice(0, 6).map((appointment) => ({
        time: appointment.time || '--:--',
        name: appointment.patient || 'Paciente',
        patientId: appointment.patientId,
        status: appointment.status || 'Aguardando',
      })),
      metrics: [
        { label: 'Consultas Hoje', value: String(todayAppointments.length), change: `${completedAppointments.length} concluídas`, tone: 'blue' },
        { label: 'Taxa de Ocupação', value: `${occupancyRate}%`, change: `${todayAppointments.length}/24 slots`, tone: 'violet' },
        { label: 'No-show', value: `${noShowRate}%`, change: `${noShowAppointments.length} registros`, tone: 'green' },
      ],
      predictiveAlert: pendingToday.length
        ? `${pendingToday.length} pacientes de hoje ainda aguardam confirmação. Recomenda-se confirmar presença antes do horário.`
        : 'Nenhum paciente de hoje pendente de confirmação.',
      reportCards: [
        { title: 'Próximos Pacientes', description: `${todayAppointments.length} consultas agendadas hoje`, icon: 'calendar' },
        { title: 'Pacientes Ativos', description: `${patients.length} pacientes cadastrados`, icon: 'users' },
        { title: 'Produtividade Médica', description: `${completedAppointments.length} consultas concluídas`, icon: 'brand' },
        { title: 'Análise de Convênios', description: 'Distribuição baseada no cadastro de pacientes', icon: 'building' },
      ],
    }
  },
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeStatus(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function isCompletedStatus(status) {
  return ['concluida', 'concluido', 'completed', 'finalizada', 'finalizado'].includes(normalizeStatus(status))
}

function isNoShowStatus(status) {
  return ['no_show', 'no-show', 'falta', 'ausente', 'faltou'].includes(normalizeStatus(status).replace(/\s+/g, '_'))
}

function isPendingStatus(status) {
  return ['aguardando', 'requested', 'solicitada', 'pendente'].includes(normalizeStatus(status))
}
