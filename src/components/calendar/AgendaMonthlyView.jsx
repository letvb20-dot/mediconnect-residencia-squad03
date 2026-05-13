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
    <div className="agenda-calendar-shell rounded-2xl border border-[#404040] bg-[#262626] p-5">
      <div className="agenda-calendar-header grid grid-cols-7 gap-px border-b border-[#404040] pb-4">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-xs font-semibold uppercase tracking-widest text-[#a3a3a3]">
            {day}
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-7 gap-2">
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
              className={`agenda-month-day flex min-h-[100px] flex-col rounded-xl border p-2 text-left transition hover:border-[#525252] ${
                isCurrentMonth
                  ? 'border-[#404040] bg-[#1f1f1f]'
                  : 'border-transparent bg-transparent opacity-40 hover:opacity-80'
              }`}
            >
              <span
                className={`text-sm font-bold ${
                  isToday(day)
                    ? 'flex h-6 w-6 items-center justify-center rounded-full bg-[#3b82f6] text-white'
                    : 'text-[#e5e5e5]'
                }`}
              >
                {format(day, 'd')}
              </span>

              <div className="mt-2 flex w-full flex-col gap-1">
                {dayAppointments.slice(0, 3).map((appointment) => (
                  <div
                    key={appointment.id}
                    className={`agenda-month-event ${getStatusToneClass(appointment.status)} flex items-center gap-1.5 truncate rounded bg-[#303030] px-1.5 py-1 text-[10px] font-semibold text-[#a3a3a3]`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getDotColor(appointment.status)}`} />
                    <span className="truncate">
                      {appointment.time} - {appointment.patient}
                    </span>
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <span className="text-[10px] font-semibold text-[#3b82f6]">
                    + {dayAppointments.length - 3} mais
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

function getStatusToneClass(status) {
  switch (status) {
    case 'Confirmada':
      return 'agenda-event-confirmed'
    case 'Em triagem':
      return 'agenda-event-triage'
    case 'Cancelada':
      return 'agenda-event-cancelled'
    case 'Bloqueado':
      return 'agenda-event-blocked'
    case 'Aguardando':
    default:
      return 'agenda-event-waiting'
  }
}

function getDotColor(status) {
  switch (status) {
    case 'Confirmada':
      return 'bg-[#10b981]'
    case 'Em triagem':
      return 'bg-[#f59e0b]'
    case 'Aguardando':
      return 'bg-[#a3a3a3]'
    case 'Bloqueado':
      return 'bg-[#737373]'
    default:
      return 'bg-[#3b82f6]'
  }
}
