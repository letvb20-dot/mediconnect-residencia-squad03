import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isBefore,
  isSameDay,
  isToday,
  startOfDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { parseLocalDate, sortAppointmentsByTime } from '../../utils/agendaDate.js'

export function AgendaWeeklyView({ baseDate, appointments, canCreateAppointment = true, onAppointmentClick, onSlotCreate }) {
  const start = startOfWeek(baseDate, { weekStartsOn: 0 })
  const end = endOfWeek(baseDate, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start, end })

  const weeklyAppointments = sortAppointmentsByTime(
    appointments.filter((appointment) => {
      if (!appointment.date) return false

      const appointmentDate = parseLocalDate(appointment.date)
      return appointmentDate && appointmentDate >= start && appointmentDate <= end
    }),
  )

  return (
    <div className="agenda-calendar-shell rounded-xl border border-border-default-v2 bg-surface-card p-3">
      <div className="agenda-calendar-header grid grid-cols-7 gap-2 border-b border-border-subtle pb-2">
        {days.map((day) => {
          const isWeekend = day.getDay() === 0

          return (
            <div key={day.toISOString()} className="text-center">
              <span
                className={`block text-[11px] font-semibold uppercase tracking-wide ${
                  isWeekend ? 'text-blue-200' : 'text-text-muted-v2'
                }`}
              >
                {format(day, 'EEE', { locale: ptBR })}
              </span>
              <span className={`mt-0.5 block text-xl font-bold leading-6 ${isToday(day) ? 'text-accent-primary' : 'text-text-heading'}`}>
                {format(day, 'dd')}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-2 grid min-h-[300px] grid-cols-7 gap-2 xl:min-h-[340px]">
        {days.map((day) => {
          const dayIsPast = isBefore(startOfDay(day), startOfDay(new Date()))
          const dayAppointments = weeklyAppointments.filter((appointment) => {
            if (!appointment.date) return false

            const appointmentDate = parseLocalDate(appointment.date)
            return appointmentDate && isSameDay(appointmentDate, day)
          })

          return (
            <div
              key={day.toISOString()}
              className="agenda-week-day flex h-full min-w-0 flex-col gap-1.5 rounded-lg border border-border-default-v2 bg-surface-inset p-1.5"
            >
              {dayAppointments.length === 0 ? (
                <button
                  className="flex h-full min-h-16 items-center justify-center rounded-md border border-dashed border-border-default-v2 p-2 text-center text-xs font-semibold text-text-muted-v2 transition hover:border-accent-primary/50 hover:text-blue-200 disabled:cursor-not-allowed disabled:hover:border-border-default-v2 disabled:hover:text-text-muted-v2"
                  disabled={!canCreateAppointment || dayIsPast}
                  onClick={() => onSlotCreate?.(day)}
                  type="button"
                >
                  {dayIsPast ? 'Encerrado' : 'Livre'}
                </button>
              ) : (
                <>
                  {dayAppointments.map((appointment) => (
                    <button
                      key={appointment.id}
                      onClick={() => onAppointmentClick && onAppointmentClick(appointment)}
                      className={`agenda-event ${getStatusToneClass(appointment)} flex w-full min-w-0 flex-col items-start overflow-hidden rounded-md border px-1.5 py-1 text-left shadow-sm transition hover:brightness-110`}
                      type="button"
                    >
                      <div className="mb-0.5 flex w-full min-w-0 items-center gap-1 overflow-hidden">
                        <span className="shrink-0 rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                          {appointment.time}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[8px] font-semibold uppercase tracking-normal opacity-80">
                          {appointment.mode}
                        </span>
                      </div>
                      <span className="block w-full min-w-0 truncate text-[11px] font-bold leading-4" title={appointment.patient}>
                        {appointment.patient}
                      </span>
                      <span
                        className="block w-full min-w-0 truncate text-[9px] font-medium leading-3 opacity-80"
                        title={appointment.professional}
                      >
                        Dr(a). {appointment.professional?.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                  <button
                    className="mt-auto rounded-md border border-dashed border-border-default-v2 px-2 py-1.5 text-[11px] font-semibold text-text-muted-v2 transition hover:border-accent-primary/50 hover:text-blue-200 disabled:cursor-not-allowed disabled:hover:border-border-default-v2 disabled:hover:text-text-muted-v2"
                    disabled={!canCreateAppointment || dayIsPast}
                    onClick={() => onSlotCreate?.(day)}
                    type="button"
                  >
                    {dayIsPast ? 'Dia encerrado' : '+ Novo agendamento'}
                  </button>
                </>
              )}
            </div>
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
    case 'Realizado':
    case 'Concluida':
    case 'Concluída':
      return 'agenda-event-finished'
    case 'Cancelado':
    case 'Cancelada':
      return 'agenda-event-cancelled'
    case 'Bloqueado':
      return 'agenda-event-blocked'
    case 'Agendado':
    case 'Aguardando':
    default:
      return 'agenda-event-waiting'
  }
}

function isHighPriority(appointment) {
  return Boolean(appointment?.highPriority || appointment?.priority === 'Alta')
}
