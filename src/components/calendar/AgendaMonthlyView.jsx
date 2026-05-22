import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns'

import { parseLocalDate, sortAppointmentsByTime } from '../../utils/agendaDate.js'

export function AgendaMonthlyView({ baseDate, appointments, onDayClick }) {
  const monthStart = startOfMonth(baseDate)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 })
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = eachDayOfInterval({ start: startDate, end: endDate })
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div className="agenda-calendar-shell rounded-xl border border-border-default-v2 bg-surface-card p-3">
      <div className="agenda-calendar-header grid grid-cols-7 gap-px border-b border-border-subtle pb-2">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-[11px] font-semibold uppercase tracking-wide text-text-muted-v2">
            {day}
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, monthStart)

          const dayAppointments = sortAppointmentsByTime(
            appointments.filter((appointment) => {
              if (!appointment.date) return false

              const appointmentDate = parseLocalDate(appointment.date)
              return appointmentDate && isSameDay(appointmentDate, day)
            }),
          )

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayClick && onDayClick(day)}
              className={`agenda-month-day flex min-h-[72px] flex-col rounded-lg border p-1.5 text-left transition hover:border-border-strong xl:min-h-[78px] ${
                isCurrentMonth
                  ? 'border-border-default-v2 bg-surface-inset'
                  : 'border-transparent bg-transparent opacity-40 hover:opacity-80'
              }`}
            >
              <span
                className={`text-sm font-bold ${
                  isToday(day)
                    ? 'flex h-5 w-5 items-center justify-center rounded-full bg-accent-primary text-xs text-white'
                    : 'text-text-heading'
                }`}
              >
                {format(day, 'd')}
              </span>

              <div className="mt-1 flex w-full flex-col gap-0.5">
                {dayAppointments.slice(0, 2).map((appointment) => (
                  <div
                    key={appointment.id}
                    className={`agenda-month-event ${getStatusToneClass(appointment)} flex items-center gap-1 truncate rounded bg-surface-card-hover px-1 py-0.5 text-[9px] font-semibold leading-4 text-text-muted-v2`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getDotColor(appointment)}`} />
                    <span className="truncate">
                      {appointment.time} - {appointment.patient}
                    </span>
                  </div>
                ))}
                {dayAppointments.length > 2 && (
                  <span className="text-[9px] font-semibold leading-4 text-accent-primary">
                    + {dayAppointments.length - 2} mais
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function getStatusToneClass(appointment) {
  if (isHighPriority(appointment)) return 'agenda-event-priority'

  switch (appointment?.status) {
    case 'Confirmado':
    case 'Confirmada':
      return 'agenda-event-confirmed'
    case 'Em triagem':
      return 'agenda-event-triage'
    case 'Cancelado':
    case 'Cancelada':
      return 'agenda-event-cancelled'
    case 'Bloqueado':
      return 'agenda-event-blocked'
    case 'Realizado':
      return 'agenda-event-finished'
    case 'Agendado':
    case 'Aguardando':
    default:
      return 'agenda-event-waiting'
  }
}

function getDotColor(appointment) {
  if (isHighPriority(appointment)) return 'bg-[#d8b4fe]'

  switch (appointment?.status) {
    case 'Confirmado':
    case 'Confirmada':
      return 'bg-[#93c5fd]'
    case 'Em triagem':
      return 'bg-[#d8b4fe]'
    case 'Realizado':
      return 'bg-[#86efac]'
    case 'Cancelado':
    case 'Cancelada':
      return 'bg-[#fda4af]'
    case 'Agendado':
    case 'Aguardando':
      return 'bg-[#fbbf24]'
    case 'Bloqueado':
      return 'bg-slate-500'
    default:
      return 'bg-[#3b82f6]'
  }
}

function isHighPriority(appointment) {
  return Boolean(appointment?.highPriority || appointment?.priority === 'Alta')
}
