import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  AGENDA_EXCEPTIONS_CHANGED_EVENT,
  availabilityRepository,
} from '../../repositories/availabilityRepository.js'
import { translateErrorMessage } from '../../repositories/repositoryUtils.js'
import { formatLocalDateInput } from '../../utils/agendaDate.js'

const WEEKDAY_OPTIONS = [
  { label: 'Domingo', value: 0 },
  { label: 'Segunda', value: 1 },
  { label: 'Terça', value: 2 },
  { label: 'Quarta', value: 3 },
  { label: 'Quinta', value: 4 },
  { label: 'Sexta', value: 5 },
  { label: 'Sábado', value: 6 },
]

const inputClass =
  'h-10 w-full rounded-sm border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none transition focus:border-accent-primary'
const compactInputClass =
  'h-8 w-full rounded-sm border border-border-default-v2 bg-surface-card-hover px-2 text-xs font-medium text-text-body outline-none transition focus:border-accent-primary'

export function AvailabilityPanel({
  canEditAvailability = false,
  compact = false,
  currentProfessional = null,
  lockDoctorSelection = false,
  professionals = [],
  selectedProfessionalId = '',
  showDoctorFilter = true,
  showExceptionManagement = true,
  title = 'Disponibilidade Médica',
  viewerProfile = null,
}) {
  const today = useMemo(() => formatLocalDateInput(new Date()), [])
  const defaultDoctorId =
    selectedProfessionalId ||
    currentProfessional?.id ||
    professionals[0]?.id ||
    ''
  const [selectedDoctorId, setSelectedDoctorId] = useState(defaultDoctorId)
  const [appointmentTypeFilter, setAppointmentTypeFilter] = useState('')
  const [availabilityForm, setAvailabilityForm] = useState({
    doctorId: defaultDoctorId,
    weekdays: [1],
    startTime: '08:00',
    endTime: '18:00',
    slotMinutes: 30,
    appointmentType: 'presencial',
    active: true,
  })
  const [exceptionFilters, setExceptionFilters] = useState({
    date: today,
    kind: '',
  })
  const [exceptionForm, setExceptionForm] = useState({
    date: today,
    kind: 'bloqueio',
    startTime: '',
    endTime: '',
    reason: '',
  })
  const [exceptionRows, setExceptionRows] = useState([])
  const [allAvailabilityRows, setAllAvailabilityRows] = useState([])
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [savingAvailability, setSavingAvailability] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')

  const selectedProfessional = useMemo(
    () =>
      professionals.find((professional) => sameId(professional.id, selectedDoctorId)) ||
      currentProfessional ||
      null,
    [currentProfessional, professionals, selectedDoctorId],
  )
  const doctorOptions = useMemo(() => {
    if (lockDoctorSelection) {
      return selectedProfessional ? [selectedProfessional] : []
    }

    return professionals
  }, [lockDoctorSelection, professionals, selectedProfessional])
  const canChangeDoctor = showDoctorFilter && !lockDoctorSelection && doctorOptions.length > 1
  const visibleAvailabilityRows = useMemo(() => {
    const type = normalizeAppointmentType(appointmentTypeFilter)
    return sortAvailabilityRows(
      type
        ? allAvailabilityRows.filter((row) => normalizeAppointmentType(row.appointmentType) === type)
        : allAvailabilityRows,
    )
  }, [allAvailabilityRows, appointmentTypeFilter])
  const canManageExceptions = canEditAvailability && showExceptionManagement

  const loadAvailabilityRows = useCallback(async () => {
    if (!selectedDoctorId) {
      setAllAvailabilityRows([])
      setAvailabilityForm((current) => ({ ...current, doctorId: '', weekdays: [] }))
      return
    }

    setLoadingAvailability(true)
    setAvailabilityError('')

    try {
      const rows = await availabilityRepository.getAll({
        doctorId: selectedDoctorId,
        order: 'weekday.asc,start_time.asc',
      })
      const sortedRows = sortAvailabilityRows(rows)
      const activeRows = sortedRows.filter((row) => row.active !== false)
      const template = activeRows[0] || sortedRows[0]

      setAllAvailabilityRows(sortedRows)
      setAvailabilityForm((current) => ({
        ...current,
        active: template?.active ?? current.active,
        appointmentType: template?.appointmentType || current.appointmentType,
        doctorId: selectedDoctorId,
        endTime: template?.endTime || current.endTime,
        slotMinutes: template?.slotMinutes || current.slotMinutes,
        startTime: template?.startTime || current.startTime,
        weekdays: uniqueWeekdays(activeRows.map((row) => row.weekday)),
      }))
    } catch (err) {
      setAllAvailabilityRows([])
      setAvailabilityError(translateErrorMessage(err.message, 'Falha ao carregar disponibilidade cadastrada.'))
    } finally {
      setLoadingAvailability(false)
    }
  }, [selectedDoctorId])

  const loadExceptions = useCallback(async () => {
    if (!showExceptionManagement || !selectedDoctorId) {
      setExceptionRows([])
      return
    }

    setAvailabilityError('')

    try {
      const exceptions = await availabilityRepository.getExceptions({
        date: exceptionFilters.date || undefined,
        doctorId: selectedDoctorId,
        kind: exceptionFilters.kind || undefined,
      })
      setExceptionRows(exceptions)
    } catch (err) {
      setAvailabilityError(translateErrorMessage(err.message, 'Falha ao carregar exceções de agenda.'))
    }
  }, [
    exceptionFilters.date,
    exceptionFilters.kind,
    selectedDoctorId,
    showExceptionManagement,
  ])

  useEffect(() => {
    if (!defaultDoctorId) return
    setSelectedDoctorId((current) => (lockDoctorSelection || !current ? defaultDoctorId : current))
  }, [defaultDoctorId, lockDoctorSelection])

  useEffect(() => {
    setAvailabilityForm((current) => ({ ...current, doctorId: selectedDoctorId }))
  }, [selectedDoctorId])

  useEffect(() => {
    loadAvailabilityRows()
  }, [loadAvailabilityRows])

  useEffect(() => {
    loadExceptions()
  }, [loadExceptions])

  useEffect(() => {
    function handleAvailabilityChanged() {
      loadAvailabilityRows()
      loadExceptions()
    }

    window.addEventListener(AGENDA_EXCEPTIONS_CHANGED_EVENT, handleAvailabilityChanged)
    return () => window.removeEventListener(AGENDA_EXCEPTIONS_CHANGED_EVENT, handleAvailabilityChanged)
  }, [loadAvailabilityRows, loadExceptions])

  async function saveAvailability(event) {
    event.preventDefault()
    if (!canEditAvailability) return
    if (!availabilityForm.doctorId) {
      window.alert('Selecione um médico para criar disponibilidade.')
      return
    }
    if (!availabilityForm.weekdays.length && !allAvailabilityRows.length) {
      window.alert('Selecione ao menos um dia da semana.')
      return
    }
    if (availabilityForm.weekdays.length && !isValidTimeRange(availabilityForm.startTime, availabilityForm.endTime)) {
      window.alert('O horário inicial deve ser menor que o horário final.')
      return
    }

    const hadRows = allAvailabilityRows.length > 0
    setSavingAvailability(true)

    try {
      const rowsByWeekday = groupAvailabilityRowsByWeekday(allAvailabilityRows)
      const selectedWeekdays = new Set(availabilityForm.weekdays.map(Number))
      const editedRowIds = new Set(allAvailabilityRows.map((row) => String(row.id || '')).filter(Boolean))
      const conflictingWeekdays = availabilityForm.weekdays.length
        ? await findConflictingAvailability(availabilityForm, editedRowIds)
        : []
      if (conflictingWeekdays.length) {
        window.alert(`Já existe disponibilidade sobreposta para: ${conflictingWeekdays.join(', ')}.`)
        return
      }

      const saves = availabilityForm.weekdays.map((weekday) => {
        const rowsForDay = rowsByWeekday.get(Number(weekday)) || []
        const [primaryRow, ...duplicateRows] = rowsForDay

        return Promise.all([
          primaryRow
            ? availabilityRepository.update(primaryRow.id, availabilityForm)
            : availabilityRepository.create({ ...availabilityForm, weekday }),
          ...duplicateRows.map((row) => availabilityRepository.remove(row.id)),
        ])
      })
      const removals = allAvailabilityRows
        .filter((row) => !selectedWeekdays.has(Number(row.weekday)))
        .map((row) => availabilityRepository.remove(row.id))

      await Promise.all([...saves, ...removals])
      await loadAvailabilityRows()
      notifyAvailabilityChanged()
      window.alert(hadRows ? 'Disponibilidade atualizada.' : 'Disponibilidade cadastrada.')
    } catch (err) {
      window.alert(translateErrorMessage(err.message, 'Erro ao salvar disponibilidade.'))
    } finally {
      setSavingAvailability(false)
    }
  }

  async function createException(event) {
    event.preventDefault()
    if (!canManageExceptions) return
    if (!selectedDoctorId || !exceptionForm.date || !exceptionForm.kind) {
      window.alert('Preencha médico, data e tipo da exceção.')
      return
    }

    try {
      await availabilityRepository.createException({
        ...exceptionForm,
        createdBy: viewerProfile?.id || currentProfessional?.userId || currentProfessional?.id,
        doctorId: selectedDoctorId,
      })
      await loadExceptions()
      notifyAvailabilityChanged()
      window.alert('Exceção cadastrada.')
    } catch (err) {
      window.alert(translateErrorMessage(err.message, 'Erro ao criar exceção de agenda.'))
    }
  }

  async function findConflictingAvailability(form, ignoredRowIds = new Set()) {
    const conflicts = []

    for (const weekday of form.weekdays) {
      const rows = await availabilityRepository.getAll({
        appointmentType: form.appointmentType,
        doctorId: form.doctorId,
        weekday,
      })

      if (rows.some((row) =>
        !ignoredRowIds.has(String(row.id || '')) &&
        row.active !== false &&
        intervalsOverlap(form.startTime, form.endTime, row.startTime, row.endTime)
      )) {
        conflicts.push(getWeekdayLabel(weekday))
      }
    }

    return conflicts
  }

  function handleDoctorChange(value) {
    setSelectedDoctorId(value)
    setAvailabilityForm((current) => ({ ...current, doctorId: value }))
  }

  function updateAvailabilityForm(field, value) {
    setAvailabilityForm((current) => ({ ...current, [field]: value }))
  }

  function toggleAvailabilityWeekday(weekday) {
    setAvailabilityForm((current) => {
      const weekdays = current.weekdays.includes(weekday)
        ? current.weekdays.filter((day) => day !== weekday)
        : [...current.weekdays, weekday].sort((first, second) => first - second)

      return { ...current, weekdays }
    })
  }

  function updateExceptionFilter(field, value) {
    setExceptionFilters((current) => ({ ...current, [field]: value }))
    if (field === 'date') {
      setExceptionForm((current) => ({ ...current, date: value }))
    }
  }

  function updateExceptionForm(field, value) {
    setExceptionForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <aside className={`grid self-start content-start rounded-2xl border border-border-default-v2 bg-surface-card shadow-[0_1px_3px_rgba(0,0,0,0.2)] ${compact ? 'gap-2 p-3' : 'gap-4 p-5'}`}>
      <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between ${compact ? 'gap-1' : 'gap-3'}`}>
        <div>
          <h2 className={`${compact ? 'text-sm' : 'text-base'} font-bold text-text-heading`}>{title}</h2>
          {selectedProfessional ? (
            <p className={`${compact ? 'mt-0.5 leading-4' : 'mt-1 leading-5'} truncate text-xs text-text-muted-v2`}>
              {selectedProfessional.name} {selectedProfessional.specialty ? `| ${selectedProfessional.specialty}` : ''}
            </p>
          ) : null}
        </div>
        {loadingAvailability ? <span className="text-xs font-semibold text-text-muted-v2">Carregando...</span> : null}
      </div>

      {availabilityError ? (
        <p className="availability-error rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">{availabilityError}</p>
      ) : null}

      <section className={`grid rounded-xl border border-border-default-v2 bg-surface-inset ${compact ? 'gap-2 p-2' : 'gap-3 p-3'}`}>
        <div className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-2'}`}>
          {showDoctorFilter ? (
            <Field label="Médico">
              <select
                className={compact ? compactInputClass : inputClass}
                disabled={!canChangeDoctor}
                onChange={(event) => handleDoctorChange(event.target.value)}
                value={selectedDoctorId}
              >
                <option value="">Selecione</option>
                {doctorOptions.map((professional) => (
                  <option key={professional.id} value={professional.id}>{professional.name}</option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Tipo">
            <select
              className={compact ? compactInputClass : inputClass}
              onChange={(event) => setAppointmentTypeFilter(event.target.value)}
              value={appointmentTypeFilter}
            >
              <option value="">Todos</option>
              <option value="presencial">Presencial</option>
              <option value="telemedicina">Telemedicina</option>
            </select>
          </Field>
        </div>
      </section>

      <WeeklyAvailabilityMiniAgenda compact={compact} rows={visibleAvailabilityRows} />

      {canEditAvailability ? (
        <form className="grid gap-3 rounded-xl border border-border-default-v2 bg-surface-inset p-3" onSubmit={saveAvailability}>
          <div>
            <h3 className="text-sm font-bold text-text-heading">Cadastrar Disponibilidade</h3>
            <p className="mt-1 text-xs leading-5 text-text-muted-v2">
              {allAvailabilityRows.length ? 'Edite os dias, horários e status da disponibilidade existente.' : 'Selecione os dias para criar uma nova disponibilidade.'}
            </p>
          </div>
          <Field label="Médico">
            <select
              className={inputClass}
              disabled={lockDoctorSelection || !canChangeDoctor}
              onChange={(event) => handleDoctorChange(event.target.value)}
              value={availabilityForm.doctorId}
            >
              <option value="">Selecione</option>
              {doctorOptions.map((professional) => (
                <option key={professional.id} value={professional.id}>{professional.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid gap-2">
            <span className="text-xs font-semibold text-text-muted-v2">Dias</span>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {WEEKDAY_OPTIONS.map((day) => (
                <label className="flex h-10 items-center justify-between rounded-sm border border-border-default-v2 bg-surface-card-hover px-3 text-xs font-semibold text-text-body" key={day.value}>
                  <span>{day.label}</span>
                  <input
                    checked={availabilityForm.weekdays.includes(day.value)}
                    className="size-4 accent-[#3b82f6]"
                    onChange={() => toggleAvailabilityWeekday(day.value)}
                    type="checkbox"
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tipo">
              <select className={inputClass} onChange={(event) => updateAvailabilityForm('appointmentType', event.target.value)} value={availabilityForm.appointmentType}>
                <option value="presencial">Presencial</option>
                <option value="telemedicina">Telemedicina</option>
              </select>
            </Field>
            <Field label="Início">
              <input className={`${inputClass} [color-scheme:dark]`} onChange={(event) => updateAvailabilityForm('startTime', event.target.value)} type="time" value={availabilityForm.startTime} />
            </Field>
            <Field label="Fim">
              <input className={`${inputClass} [color-scheme:dark]`} onChange={(event) => updateAvailabilityForm('endTime', event.target.value)} type="time" value={availabilityForm.endTime} />
            </Field>
            <Field label="Slot (min)">
              <input className={inputClass} max="120" min="15" onChange={(event) => updateAvailabilityForm('slotMinutes', Number(event.target.value))} step="15" type="number" value={availabilityForm.slotMinutes} />
            </Field>
            <label className="flex h-10 items-center gap-2 text-xs font-semibold text-text-body">
              <input checked={availabilityForm.active} className="size-4 accent-[#3b82f6]" onChange={(event) => updateAvailabilityForm('active', event.target.checked)} type="checkbox" />
              Ativa
            </label>
          </div>
          <button className="h-9 rounded-sm bg-accent-primary text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={savingAvailability} type="submit">
            {savingAvailability ? 'Salvando...' : allAvailabilityRows.length ? 'Salvar alteração' : 'Cadastrar disponibilidade'}
          </button>
        </form>
      ) : null}

      {showExceptionManagement ? (
        <section className="grid gap-3 rounded-xl border border-border-default-v2 bg-surface-inset p-3">
          <h3 className="text-sm font-bold text-text-heading">Exceções</h3>
          <div className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-2'}`}>
            <Field label="Data">
              <input className={`${inputClass} [color-scheme:dark]`} onChange={(event) => updateExceptionFilter('date', event.target.value)} type="date" value={exceptionFilters.date} />
            </Field>
            <Field label="Tipo">
              <select className={inputClass} onChange={(event) => updateExceptionFilter('kind', event.target.value)} value={exceptionFilters.kind}>
                <option value="">Todos</option>
                <option value="bloqueio">Bloqueio</option>
                <option value="disponibilidade_extra">Disponibilidade extra</option>
              </select>
            </Field>
          </div>

          {canManageExceptions ? (
            <form className="grid gap-2 border-t border-border-default-v2 pt-3" onSubmit={createException}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Tipo">
                  <select className={inputClass} onChange={(event) => updateExceptionForm('kind', event.target.value)} value={exceptionForm.kind}>
                    <option value="bloqueio">Bloqueio</option>
                    <option value="disponibilidade_extra">Disponibilidade extra</option>
                  </select>
                </Field>
                <Field label="Data">
                  <input className={`${inputClass} [color-scheme:dark]`} onChange={(event) => updateExceptionForm('date', event.target.value)} type="date" value={exceptionForm.date} />
                </Field>
                <Field label="Início">
                  <input className={`${inputClass} [color-scheme:dark]`} onChange={(event) => updateExceptionForm('startTime', event.target.value)} type="time" value={exceptionForm.startTime} />
                </Field>
                <Field label="Fim">
                  <input className={`${inputClass} [color-scheme:dark]`} onChange={(event) => updateExceptionForm('endTime', event.target.value)} type="time" value={exceptionForm.endTime} />
                </Field>
              </div>
              <Field label="Motivo">
                <input className={inputClass} onChange={(event) => updateExceptionForm('reason', event.target.value)} value={exceptionForm.reason} />
              </Field>
              <button className="h-9 rounded-sm border border-accent-primary bg-accent-primary text-sm font-semibold text-white" type="submit">Criar exceção</button>
            </form>
          ) : null}

          <div className="grid gap-2">
            {exceptionRows.slice(0, compact ? 3 : 6).map((row) => (
              <div className="rounded-md border border-border-default-v2 bg-surface-card p-2 text-xs text-text-muted-v2" key={row.id}>
                <p className="font-semibold text-text-body">{formatDisplayDate(row.date)} | {row.kind === 'disponibilidade_extra' ? 'Extra' : 'Bloqueio'}</p>
                <p>{row.startTime || 'Dia inteiro'}{row.endTime ? ` - ${row.endTime}` : ''}</p>
                {row.reason ? <p>{row.reason}</p> : null}
              </div>
            ))}
            {!exceptionRows.length ? <p className="text-xs text-text-muted-v2">Nenhuma exceção encontrada.</p> : null}
          </div>
        </section>
      ) : null}
    </aside>
  )
}

export function WeeklyAvailabilityMiniAgenda({ compact = false, rows = [] }) {
  const groupedRows = groupAvailabilityRowsByWeekday(rows)

  if (compact) {
    return (
      <section className="rounded-xl border border-border-default-v2 bg-surface-inset p-2">
        <div className="grid gap-1">
          {WEEKDAY_OPTIONS.map((day) => {
            const dayRows = sortAvailabilityRows(groupedRows.get(day.value) || [])

            return (
              <article className="grid min-h-8 grid-cols-[3.7rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-border-default-v2 bg-surface-card px-2 py-1.5" key={day.value}>
                <h3 className="text-[11px] font-bold uppercase text-text-heading">{getWeekdayShortLabel(day.label)}</h3>
                <div className="flex min-w-0 flex-wrap gap-1">
                  {dayRows.length ? dayRows.map((row) => (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4 ${
                        row.active === false
                          ? 'bg-surface-card-hover text-text-muted-v2'
                          : 'bg-[#3b82f6]/10 text-[#93c5fd]'
                      }`}
                      key={row.id || `${row.doctorId}-${row.weekday}-${row.startTime}-${row.appointmentType}`}
                    >
                      {normalizeTime(row.startTime)}-{normalizeTime(row.endTime)}
                    </span>
                  )) : (
                    <span className="text-[11px] leading-4 text-text-muted-v2">Sem horários</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-border-default-v2 bg-surface-inset p-3">
      <div className={`grid gap-2 ${compact ? '' : 'md:grid-cols-7'}`}>
        {WEEKDAY_OPTIONS.map((day) => {
          const dayRows = sortAvailabilityRows(groupedRows.get(day.value) || [])

          return (
            <article className="min-h-24 rounded-lg border border-border-default-v2 bg-surface-card p-3" key={day.value}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-text-heading">{day.label}</h3>
              <div className="mt-3 grid gap-2">
                {dayRows.length ? dayRows.map((row) => (
                  <div
                    className={`rounded-md px-2 py-1.5 text-xs leading-4 ${
                      row.active === false
                        ? 'bg-surface-card-hover text-text-muted-v2'
                        : 'bg-[#3b82f6]/10 text-[#93c5fd]'
                    }`}
                    key={row.id || `${row.doctorId}-${row.weekday}-${row.startTime}-${row.appointmentType}`}
                  >
                    <p className="font-semibold text-text-body">{normalizeTime(row.startTime)} - {normalizeTime(row.endTime)}</p>
                    <p className="mt-0.5 text-[11px]">{formatAppointmentType(row.appointmentType)} | {row.slotMinutes || 30} min</p>
                  </div>
                )) : (
                  <p className="text-xs leading-5 text-text-muted-v2">Sem horários</p>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Field({ children, label }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-text-muted-v2">
      <span>{label}</span>
      {children}
    </label>
  )
}

function groupAvailabilityRowsByWeekday(rows = []) {
  return rows.reduce((map, row) => {
    const weekday = Number(row.weekday)
    if (!Number.isInteger(weekday)) return map
    map.set(weekday, [...(map.get(weekday) || []), row])
    return map
  }, new Map())
}

function sortAvailabilityRows(rows = []) {
  return [...rows].sort((first, second) => {
    const weekdayDiff = Number(first.weekday) - Number(second.weekday)
    if (weekdayDiff !== 0) return weekdayDiff
    return String(first.startTime || '').localeCompare(String(second.startTime || ''))
  })
}

function uniqueWeekdays(values = []) {
  return [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))]
    .sort((first, second) => first - second)
}

function getWeekdayLabel(value) {
  return WEEKDAY_OPTIONS.find((day) => Number(day.value) === Number(value))?.label || 'Dia'
}

function getWeekdayShortLabel(label) {
  const normalized = String(label || '')
  if (normalized === 'Domingo') return 'Dom'
  if (normalized === 'Segunda') return 'Seg'
  if (normalized === 'Terça') return 'Ter'
  if (normalized === 'Quarta') return 'Qua'
  if (normalized === 'Quinta') return 'Qui'
  if (normalized === 'Sexta') return 'Sex'
  if (normalized === 'Sábado') return 'Sáb'
  return normalized.slice(0, 3)
}

function formatDisplayDate(value) {
  if (!value) return '-'
  const [year, month, day] = String(value).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function isValidTimeRange(startTime, endTime) {
  const start = minutesFromTime(startTime)
  const end = minutesFromTime(endTime)
  return start !== null && end !== null && start < end
}

function intervalsOverlap(startA, endA, startB, endB) {
  const aStart = minutesFromTime(startA)
  const aEnd = minutesFromTime(endA)
  const bStart = minutesFromTime(startB)
  const bEnd = minutesFromTime(endB)
  if ([aStart, aEnd, bStart, bEnd].some((value) => value === null)) return false
  return aStart < bEnd && bStart < aEnd
}

function minutesFromTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function normalizeAppointmentType(type) {
  const normalized = String(type || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  return normalized.includes('tele') ? 'telemedicina' : normalized ? 'presencial' : ''
}

function formatAppointmentType(type) {
  return normalizeAppointmentType(type) === 'telemedicina' ? 'Telemedicina' : 'Presencial'
}

function normalizeTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/)
  if (!match) return '--:--'
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function sameId(first, second) {
  return String(first || '') === String(second || '')
}

function notifyAvailabilityChanged() {
  window.dispatchEvent(new CustomEvent(AGENDA_EXCEPTIONS_CHANGED_EVENT))
}
