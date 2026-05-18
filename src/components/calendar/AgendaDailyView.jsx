import { format, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { sortAppointmentsByTime } from '../../utils/agendaDate.js'

const DAY_START = '07:00'
const DAY_END = '18:30'
const SLOT_MINUTES = 30

export function AgendaDailyView({
  baseDate,
  appointments,
  canCreateAppointment = true,
  occupiedAppointments = appointments,
  onAppointmentClick,
  onSlotCreate,
}) {
  const dailyAppointments = sortAppointmentsByTime(appointments)
  const appointmentsByTime = groupAppointmentsByTime(dailyAppointments)
  const occupiedAppointmentsByTime = groupAppointmentsByTime(sortAppointmentsByTime(occupiedAppointments))
  const slots = mergeSlotsWithAppointmentTimes(generateSlots(DAY_START, DAY_END, SLOT_MINUTES), occupiedAppointments)

  return (
    <div className="agenda-calendar-shell rounded-2xl border border-border-default-v2 bg-surface-card p-5">
      <div className="agenda-calendar-header flex flex-col gap-3 border-b border-border-subtle pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted-v2">
            Grade de horários do dia
          </span>
          <h3 className="mt-2 text-xl font-bold text-text-heading">
            {format(baseDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="agenda-legend-pill rounded-full border border-border-default-v2 bg-surface-inset px-3 py-1 text-xs font-semibold text-text-muted-v2">
            {dailyAppointments.length} {dailyAppointments.length === 1 ? 'agendamento' : 'agendamentos'}
          </span>
          <span className="agenda-legend-pill agenda-legend-free rounded-full border border-emerald-700/40 bg-emerald-950/30 px-3 py-1 text-xs font-semibold text-emerald-200 shadow-sm">
            Livre
          </span>
          <span className="agenda-legend-pill agenda-legend-booked rounded-full border border-red-700/40 bg-red-950/30 px-3 py-1 text-xs font-semibold text-red-200 shadow-sm">
            Agendado
          </span>
          {isToday(baseDate) && (
            <span className="rounded-full border border-accent-primary/30 bg-accent-primary/10 px-3 py-1 text-xs font-semibold text-blue-200">
              Hoje
            </span>
          )}
        </div>
      </div>

      <div className="agenda-day-grid mt-4 grid gap-2">
        {slots.map((time) => {
          const slotAppointments = appointmentsByTime.get(time) || []
          const occupiedSlotAppointments = occupiedAppointmentsByTime.get(time) || []
          const primaryAppointment = slotAppointments[0]
          const hasHiddenAppointment = !primaryAppointment && occupiedSlotAppointments.length > 0
          const primaryBlocksSlot = slotAppointments.some((appointment) => !isAvailabilityExtra(appointment))
          const isBooked = primaryBlocksSlot || hasHiddenAppointment
          const isPast = isPastSlot(baseDate, time)
          const canCreateSlot = canCreateAppointment && !isPast
          const visualStatus = getAppointmentVisualStatus(primaryAppointment)
          const slotStatus = slotAppointments.length > 1 ? `${slotAppointments.length} agendamentos` : visualStatus

          return (
            <article
              className={`agenda-slot ${isBooked ? getDailyToneClass(primaryAppointment) : isPast ? 'agenda-slot-blocked' : 'agenda-slot-free'} grid gap-3 rounded-xl border px-4 py-3 shadow-[0_8px_18px_rgba(0,0,0,0.16)] md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center ${
                isBooked
                  ? 'border-border-default-v2 bg-surface-elevated text-text-heading'
                  : isPast
                    ? 'border-border-default-v2 bg-surface-inset text-text-muted-v2'
                    : 'border-border-default-v2 bg-surface-elevated text-text-heading'
              }`}
              key={time}
            >
              <div className="shrink-0">
                <p className="text-xl font-bold leading-none">{time}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">
                  {slotStatus || (isBooked ? 'Agendado' : isPast ? 'Encerrado' : 'Disponível')}
                </p>
              </div>

              {slotAppointments.length ? (
                <div className="grid min-w-0 gap-2">
                  {slotAppointments.map((appointment) => (
                    <div className="py-1" key={appointment.id}>
                      <button
                        className="block w-full truncate text-left text-sm font-bold transition hover:opacity-85"
                        onClick={() => !appointment.isException && onAppointmentClick?.(appointment)}
                        type="button"
                      >
                        {appointment.patient}
                      </button>
                      <p className="mt-1 truncate text-sm opacity-90">
                        {appointment.type} com {appointment.professional}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium opacity-80">
                        {appointment.room ? <span className="agenda-slot-chip rounded-full bg-black/25 px-2.5 py-1 shadow-sm">{appointment.room}</span> : null}
                        {appointment.mode ? <span className="agenda-slot-chip rounded-full bg-black/25 px-2.5 py-1 shadow-sm">{appointment.mode}</span> : null}
                        {appointment.status ? <span className="agenda-slot-chip rounded-full bg-black/25 px-2.5 py-1 shadow-sm">{getAppointmentVisualStatus(appointment)}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : hasHiddenAppointment ? (
                <div className="flex items-center text-sm font-medium opacity-90">
                  Horário ocupado por agendamento fora do filtro atual.
                </div>
              ) : isPast ? (
                <div className="flex items-center text-sm font-medium opacity-90">
                  Horário anterior ao horário atual do sistema.
                </div>
              ) : (
                <div className="flex items-center text-sm font-medium opacity-90">
                  Horário disponível para novo agendamento.
                </div>
              )}

              <div className="flex shrink-0 flex-wrap items-start justify-start gap-2 md:justify-end">
                <span className="agenda-slot-status rounded-full border border-current/30 bg-black/25 px-3 py-1 text-xs font-bold shadow-sm">
                  {slotStatus || (hasHiddenAppointment ? 'Ocupado' : isPast ? 'Encerrado' : 'Livre')}
                </span>
                {canCreateSlot ? (
                  <button
                    aria-label={`Criar agendamento às ${time}`}
                    className="agenda-slot-add grid min-h-8 min-w-8 shrink-0 place-items-center rounded-full border border-current/30 bg-black/30 p-1.5 text-base font-bold leading-none shadow-sm transition hover:bg-black/45"
                    onClick={() => onSlotCreate?.(time)}
                    title={`Novo agendamento às ${time}`}
                    type="button"
                  >
                    +
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function getDailyToneClass(appointment) {
  if (isHighPriority(appointment)) return 'agenda-slot-priority'

  switch (appointment?.status) {
    case 'Confirmado':
    case 'Confirmada':
      return 'agenda-slot-confirmed'
    case 'Realizado':
      return 'agenda-slot-finished'
    case 'Em triagem':
      return 'agenda-slot-triage'
    case 'Cancelado':
    case 'Cancelada':
      return 'agenda-slot-cancelled'
    case 'Bloqueado':
      return 'agenda-slot-blocked'
    case 'Agendado':
    case 'Aguardando':
    default:
      return 'agenda-slot-waiting'
  }
}

function getAppointmentVisualStatus(appointment) {
  if (!appointment) return ''
  return isHighPriority(appointment) ? 'Prioridade' : appointment.status
}

function isHighPriority(appointment) {
  return Boolean(appointment?.highPriority || appointment?.priority === 'Alta')
}

function generateSlots(start, end, intervalMinutes) {
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  const slots = []
  let cursor = startHour * 60 + startMinute
  const last = endHour * 60 + endMinute

  while (cursor < last) {
    slots.push(formatMinutes(cursor))
    cursor += intervalMinutes
  }

  return slots
}

function groupAppointmentsByTime(appointments) {
  return appointments.reduce((map, appointment) => {
    const time = normalizeTime(appointment.time)
    if (!time) return map
    map.set(time, [...(map.get(time) || []), appointment])
    return map
  }, new Map())
}

function isAvailabilityExtra(appointment) {
  return appointment?.isException && appointment?.exceptionKind === 'disponibilidade_extra'
}

function mergeSlotsWithAppointmentTimes(slots, appointments) {
  return [...new Set([...slots, ...appointments.map((appointment) => normalizeTime(appointment.time)).filter(Boolean)])]
    .sort((first, second) => minutesFromTime(first) - minutesFromTime(second))
}

function normalizeTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function minutesFromTime(value) {
  const [hours, minutes] = normalizeTime(value).split(':').map(Number)
  return hours * 60 + minutes
}

function formatMinutes(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const minutes = String(totalMinutes % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

function isPastSlot(baseDate, time) {
  const [hours, minutes] = normalizeTime(time).split(':').map(Number)
  const slotDate = new Date(baseDate)
  slotDate.setHours(hours, minutes, 0, 0)

  return slotDate.getTime() < Date.now()
}
