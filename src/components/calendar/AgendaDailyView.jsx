import { format, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { sortAppointmentsByTime } from '../../utils/agendaDate.js'

const DAY_START = '07:00'
const DAY_END = '19:00'
const SLOT_MINUTES = 30

export function AgendaDailyView({ baseDate, appointments, canCreateAppointment = true, onAppointmentClick, onSlotCreate }) {
  const dailyAppointments = sortAppointmentsByTime(appointments)
  const appointmentsByTime = groupAppointmentsByTime(dailyAppointments)
  const slots = mergeSlotsWithAppointmentTimes(generateSlots(DAY_START, DAY_END, SLOT_MINUTES), dailyAppointments)

  return (
    <div className="agenda-calendar-shell rounded-2xl border border-[#404040] bg-[#262626] p-5">
      <div className="agenda-calendar-header flex flex-col gap-3 border-b border-[#404040] pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#737373]">
            Grade de horários do dia
          </span>
          <h3 className="mt-2 text-xl font-bold text-[#e5e5e5]">
            {format(baseDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="agenda-legend-pill rounded-full border border-[#404040] bg-[#1f1f1f] px-3 py-1 text-xs font-semibold text-[#a3a3a3]">
            {dailyAppointments.length} {dailyAppointments.length === 1 ? 'agendamento' : 'agendamentos'}
          </span>
          <span className="agenda-legend-pill agenda-legend-free rounded-full border border-emerald-700/40 bg-emerald-950/30 px-3 py-1 text-xs font-semibold text-emerald-200 shadow-sm">
            Livre
          </span>
          <span className="agenda-legend-pill agenda-legend-booked rounded-full border border-red-700/40 bg-red-950/30 px-3 py-1 text-xs font-semibold text-red-200 shadow-sm">
            Agendado
          </span>
          {isToday(baseDate) && (
            <span className="rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-1 text-xs font-semibold text-[#93c5fd]">
              Hoje
            </span>
          )}
        </div>
      </div>

      <div className="agenda-day-grid mt-4 grid gap-2">
        {slots.map((time) => {
          const slotAppointments = appointmentsByTime.get(time) || []
          const primaryAppointment = slotAppointments[0]
          const isBooked = Boolean(primaryAppointment)

          return (
            <article
              className={`agenda-slot ${isBooked ? getDailyToneClass(primaryAppointment.status) : 'agenda-slot-free'} grid gap-3 rounded-xl border px-4 py-3 shadow-[0_8px_18px_rgba(0,0,0,0.16)] md:grid-cols-[84px_1fr_auto] ${
                isBooked
                  ? 'border-red-700/50 bg-red-950/35 text-red-50'
                  : 'border-emerald-700/50 bg-emerald-950/35 text-emerald-50'
              }`}
              key={time}
            >
              <div>
                <p className="text-xl font-bold leading-none">{time}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">
                  {isBooked ? 'Agendado' : 'Disponível'}
                </p>
              </div>

              {isBooked ? (
                <div>
                  <button
                    className="text-left text-sm font-bold transition hover:opacity-85"
                    onClick={() => onAppointmentClick?.(primaryAppointment)}
                    type="button"
                  >
                    {primaryAppointment.patient}
                  </button>
                  <p className="mt-1 text-sm opacity-90">
                    {primaryAppointment.type} com {primaryAppointment.professional}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium opacity-80">
                    {primaryAppointment.room ? <span className="agenda-slot-chip rounded-full bg-black/25 px-2.5 py-1 shadow-sm">{primaryAppointment.room}</span> : null}
                    {primaryAppointment.mode ? <span className="agenda-slot-chip rounded-full bg-black/25 px-2.5 py-1 shadow-sm">{primaryAppointment.mode}</span> : null}
                    {slotAppointments.length > 1 ? <span className="agenda-slot-chip rounded-full bg-black/25 px-2.5 py-1 shadow-sm">+{slotAppointments.length - 1}</span> : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-center text-sm font-medium opacity-90">
                  Horário disponível para novo agendamento.
                </div>
              )}

              <div className="flex flex-wrap items-start justify-start gap-2 md:justify-end">
                <span className="agenda-slot-status rounded-full border border-current/30 bg-black/25 px-3 py-1 text-xs font-bold shadow-sm">
                  {isBooked ? primaryAppointment.status : 'Livre'}
                </span>
                {canCreateAppointment ? (
                  <button
                    aria-label={`Criar agendamento às ${time}`}
                    className="agenda-slot-add grid size-8 place-items-center rounded-full border border-current/30 bg-black/30 text-base font-bold leading-none shadow-sm transition hover:bg-black/45"
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

function getDailyToneClass(status) {
  switch (status) {
    case 'Confirmada':
      return 'agenda-slot-confirmed'
    case 'Em triagem':
      return 'agenda-slot-triage'
    case 'Cancelada':
      return 'agenda-slot-cancelled'
    case 'Bloqueado':
      return 'agenda-slot-blocked'
    case 'Aguardando':
    default:
      return 'agenda-slot-waiting'
  }
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
