import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { normalizeRole } from '../config/permissions.js'
import { AvailabilityPanel } from '../components/availability/AvailabilityPanel.jsx'
import { AgendaDailyView } from '../components/calendar/AgendaDailyView.jsx'
import { AgendaMonthlyView } from '../components/calendar/AgendaMonthlyView.jsx'
import { AgendaWeeklyView } from '../components/calendar/AgendaWeeklyView.jsx'
import { StethoscopeIcon } from '../components/Brand.jsx'
import { useAgenda } from '../hooks/useAgenda.js'
import { AGENDA_EXCEPTIONS_CHANGED_EVENT, availabilityRepository } from '../repositories/availabilityRepository.js'
import { NOTIFICATION_ACTION_EVENT, PENDING_NOTIFICATION_ACTION_KEY } from '../repositories/notificationRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'
import { formatLocalDateInput, parseLocalDate } from '../utils/agendaDate.js'

const statusFilters = [
  { label: 'Todos', value: 'Todos', tone: 'all' },
  { label: 'Agendados', value: 'Agendado', tone: 'waiting' },
  { label: 'Confirmados', value: 'Confirmado', tone: 'confirmed' },
  { label: 'Realizados', value: 'Realizado', tone: 'finished' },
  { label: 'Cancelados', value: 'Cancelado', tone: 'cancelled' },
  { label: 'Prioridade', value: 'Prioridade', tone: 'priority' },
]

const viewFilters = [
  { label: 'Dia', value: 'Dia' },
  { label: 'Semana', value: 'Semana' },
  { label: 'Mês', value: 'Mes' },
]

const appointmentTypeOptions = ['Retorno', 'Primeira consulta', 'Exame', 'Avaliação pre-op']
const appointmentStatusOptions = ['Agendado', 'Confirmado', 'Aguardando', 'Realizado', 'Cancelado']
const weekdayOptions = [
  { label: 'Domingo', value: 0 },
  { label: 'Segunda', value: 1 },
  { label: 'Terça', value: 2 },
  { label: 'Quarta', value: 3 },
  { label: 'Quinta', value: 4 },
  { label: 'Sexta', value: 5 },
  { label: 'Sábado', value: 6 },
]

export function AgendaPage({ navigate, role }) {
  const shortcutHandledRef = useRef(false)
  const [modalPatientSearch, setModalPatientSearch] = useState('')
  const [modalDoctorSearch, setModalDoctorSearch] = useState('')
  const {
    patients,
    professionals,
    users,
    currentProfessional,
    currentPatient,
    viewerProfile,
    agendaScope,
    loading,
    error,
    canCreateAppointment,
    activeView,
    setActiveView,
    baseDate,
    setBaseDate,
    status,
    setStatus,
    doctorFilter,
    setDoctorFilter,
    setDoctorSearch,
    unitFilter,
    setUnitFilter,
    modalOpen,
    editingAppointment,
    form,
    updateForm,
    openCreateModal,
    openAppointmentModal,
    openAppointmentById,
    closeAppointmentModal,
    handleSubmitAppointment,
    handleCancelAppointment,
    handleConfirmArrival,
    visibleAppointments,
    dailyOccupancyAppointments,
    availableSlots,
    slotsLoading,
    slotsError,
  } = useAgenda()

  useEffect(() => {
    if (loading || shortcutHandledRef.current) return

    const params = new URLSearchParams(window.location.search)
    const patientId = params.get('patientId')
    const shouldOpenNew = params.get('new') === '1'
    if (!shouldOpenNew || !patientId || !canCreateAppointment) return

    shortcutHandledRef.current = true
    openCreateModal({ patientId })
  }, [canCreateAppointment, loading, openCreateModal])

  useEffect(() => {
    if (loading) return undefined

    function handleAction(action) {
      if (action?.type !== 'agenda:openAppointment' || !action.appointmentId) return
      if (openAppointmentById(action.appointmentId)) {
        sessionStorage.removeItem(PENDING_NOTIFICATION_ACTION_KEY)
      }
    }

    function handleNotificationAction(event) {
      handleAction(event.detail)
    }

    const pendingAction = readPendingNotificationAction()
    handleAction(pendingAction)

    window.addEventListener(NOTIFICATION_ACTION_EVENT, handleNotificationAction)
    return () => window.removeEventListener(NOTIFICATION_ACTION_EVENT, handleNotificationAction)
  }, [loading, openAppointmentById])

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-text-muted-v2">
        <p>Carregando agenda...</p>
      </div>
    )
  }

  const weekStart = startOfWeek(baseDate, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 0 })
  const isDoctorScope = agendaScope === 'doctor'
  const isPatientScope = agendaScope === 'patient'
  const showAvailabilitySidebar = !isPatientScope && !isDoctorScope
  const isSecretaryRole = normalizeRole(role) === 'secretaria'
  const canConfirmArrival =
    isSecretaryRole &&
    Boolean(editingAppointment) &&
    !['Aguardando', 'Realizado', 'Cancelado'].includes(form.status)
  const unitOptions = [
    ...new Set(professionals.map((professional) => professional.unit).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const filteredPatients = filterBySearch(patients, modalPatientSearch, (patient) => [
    patient.name,
    patient.full_name,
    patient.nome,
    patient.cpf,
    patient.email,
  ])
  const filteredProfessionals = filterBySearch(professionals, modalDoctorSearch, (professional) => [
    professional.name,
    professional.email,
    professional.unit,
  ])
  const selectedPatient = patients.find((patient) => String(patient.id) === String(form.patientId))
  const selectedProfessional = professionals.find((professional) => String(professional.id) === String(form.professionalId))
  const appointmentCreatorName = editingAppointment
    ? resolveAppointmentCreatorName(editingAppointment, viewerProfile, professionals, users)
    : ''
  const timeOptions = getTimeOptions(form.time, availableSlots)

  function openCreate(options = {}) {
    setModalPatientSearch('')
    setModalDoctorSearch('')
    openCreateModal(options)
  }

  function openManage(appointment) {
    if (appointment?.isException) return
    setModalPatientSearch('')
    setModalDoctorSearch('')
    openAppointmentModal(appointment)
  }

  function closeModal() {
    setModalPatientSearch('')
    setModalDoctorSearch('')
    closeAppointmentModal()
  }

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-8 text-text-body">
      <section className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div>
          <h1 className="text-[32px] font-bold leading-8 tracking-[-0.02em] text-text-body">
            Agenda
          </h1>
          <p className="mt-2 text-sm leading-5 text-text-muted-v2">
            Perfil atual: {viewerProfile?.role || (isDoctorScope ? 'Médico' : 'Usuário')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex shrink-0 items-center gap-1 rounded-sm border border-border-default-v2 bg-surface-card p-1">
            <button
              className="grid size-7 shrink-0 place-items-center rounded-sm text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-body"
              onClick={() => {
                if (activeView === 'Dia') setBaseDate((current) => subDays(current, 1))
                if (activeView === 'Semana') setBaseDate((current) => subWeeks(current, 1))
                if (activeView === 'Mes') setBaseDate((current) => subMonths(current, 1))
              }}
              type="button"
            >
              {'<'}
            </button>
            <span className="min-w-[160px] text-center text-sm font-semibold text-text-body capitalize">
              {activeView === 'Dia' && format(baseDate, "dd 'de' MMM", { locale: ptBR })}
              {activeView === 'Semana' &&
                `${format(weekStart, 'dd MMM', { locale: ptBR })} - ${format(weekEnd, 'dd MMM', { locale: ptBR })}`}
              {activeView === 'Mes' && format(baseDate, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button
              className="grid size-7 shrink-0 place-items-center rounded-sm text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-body"
              onClick={() => {
                if (activeView === 'Dia') setBaseDate((current) => addDays(current, 1))
                if (activeView === 'Semana') setBaseDate((current) => addWeeks(current, 1))
                if (activeView === 'Mes') setBaseDate((current) => addMonths(current, 1))
              }}
              type="button"
            >
              {'>'}
            </button>
          </div>
          <button
            className="shrink-0 h-9 rounded-sm border border-border-default-v2 bg-surface-card px-4 text-sm font-medium text-text-body transition hover:bg-surface-card-hover"
            onClick={() => setBaseDate(new Date())}
            type="button"
          >
            Hoje
          </button>
          {!isPatientScope ? (
            <>
              <button
                className="shrink-0 h-9 rounded-sm border border-border-default-v2 bg-surface-card px-4 text-sm font-medium text-text-body transition hover:bg-surface-card-hover"
                onClick={() => navigate('/consultas')}
                type="button"
              >
                Lista de Espera Inteligente
              </button>
              <button
                className="shrink-0 h-9 rounded-sm border border-accent-primary bg-accent-primary px-4 text-sm font-semibold text-white shadow-[0_10px_15px_rgba(59,130,246,0.16)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:border-border-default-v2 disabled:bg-surface-card-hover disabled:text-text-muted-v2 disabled:shadow-none"
                disabled={!canCreateAppointment}
                onClick={() => openCreate()}
                type="button"
              >
                + Novo agendamento
              </button>
            </>
          ) : null}
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-border-default-v2 bg-surface-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
          <div className="rounded-xl border border-dashed border-[#7f1d1d] bg-[#2a1111] p-6">
            <h2 className="text-base font-bold text-[#fecaca]">Não foi possível liberar a agenda</h2>
            <p className="mt-2 text-sm leading-6 text-[#fca5a5]">{error}</p>
            <p className="mt-3 text-sm leading-6 text-text-muted-v2">
              Enquanto esse vínculo não existir na API, a tela fica bloqueada para evitar exibir consultas de outro perfil.
            </p>
          </div>
        </section>
      ) : (
        <section className={`grid gap-6 ${showAvailabilitySidebar ? 'xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
          <div className="self-start rounded-2xl border border-border-default-v2 bg-surface-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold leading-6 text-text-body">
                    {format(baseDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </h2>
                </div>
              </div>

              {!isPatientScope ? (
              <div className="flex w-full flex-wrap items-center justify-start gap-2 lg:justify-end">
                <div className="flex flex-wrap items-center gap-2">
                  {statusFilters.map((filter) => (
                    <button
                      className={`agenda-status-filter agenda-status-filter-${filter.tone} ${status === filter.value ? 'is-active' : ''} shrink-0 whitespace-nowrap h-8 rounded-sm border px-3 text-sm font-semibold transition`}
                      key={filter.value}
                      onClick={() => setStatus(filter.value)}
                      type="button"
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
              ) : null}
            </div>

            {!isPatientScope ? (
            <div className="mt-3 flex flex-col flex-wrap gap-2 lg:flex-row lg:items-center lg:justify-end">
              <div className="flex shrink-0 flex-wrap gap-2">
                {viewFilters.map((view) => (
                  <button
                    className={`shrink-0 h-8 rounded-sm border px-3 text-sm font-semibold transition ${
                      activeView === view.value
                        ? 'border-accent-primary bg-accent-primary text-white'
                        : 'border-border-default-v2 bg-surface-card-hover text-text-muted-v2 hover:text-text-body'
                    }`}
                    key={view.value}
                    onClick={() => setActiveView(view.value)}
                    type="button"
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              {!isDoctorScope ? (
                <div className="flex w-full flex-col flex-wrap gap-2 sm:flex-row lg:w-auto">
                  <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-text-muted-v2">
                    <span className="shrink-0">Médico</span>
                    <select
                      className="h-8 min-w-0 rounded-sm border border-border-default-v2 bg-surface-card-hover px-3 text-sm font-medium text-text-body outline-none transition focus:border-accent-primary sm:w-72"
                      onChange={(event) => {
                        setDoctorFilter(event.target.value)
                        setDoctorSearch('')
                      }}
                      value={doctorFilter}
                    >
                      <option value="Todos">Todos os médicos</option>
                      {professionals.map((professional) => (
                        <option key={professional.id} value={professional.id}>
                          {professional.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-text-muted-v2">
                    <span className="shrink-0">Unidade</span>
                    <select
                      className="h-8 min-w-0 rounded-sm border border-border-default-v2 bg-surface-card-hover px-3 text-sm font-medium text-text-body outline-none transition focus:border-accent-primary sm:w-44"
                      onChange={(event) => setUnitFilter(event.target.value)}
                      value={unitFilter}
                    >
                      <option value="">Todas as unidades</option>
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
            ) : null}

            {!isDoctorScope && !isPatientScope && (
              <div className="mt-3 rounded-xl border border-border-default-v2 bg-surface-inset px-4 py-2 text-sm text-text-muted-v2">
                Perfil atual: {viewerProfile?.role || 'Administrador'}
              </div>
            )}

            <div className="mt-4 grid gap-3">
              {isPatientScope ? (
                <PatientAgendaList
                  appointments={visibleAppointments}
                  currentPatient={currentPatient}
                  onAppointmentClick={openManage}
                />
              ) : activeView === 'Semana' && (
                <AgendaWeeklyView
                  baseDate={baseDate}
                  appointments={visibleAppointments}
                  canCreateAppointment={canCreateAppointment}
                  onAppointmentClick={openManage}
                  onSlotCreate={(day) => openCreate({ date: formatLocalDateInput(day) })}
                />
              )}

              {!isPatientScope && activeView === 'Mes' && (
                <AgendaMonthlyView
                  baseDate={baseDate}
                  appointments={visibleAppointments}
                  onDayClick={(day) => {
                    setBaseDate(day)
                    setActiveView('Dia')
                  }}
                />
              )}

              {!isPatientScope && activeView === 'Dia' && (
                <AgendaDailyView
                  appointments={visibleAppointments}
                  baseDate={baseDate}
                  canCreateAppointment={canCreateAppointment}
                  occupiedAppointments={dailyOccupancyAppointments}
                  onAppointmentClick={openManage}
                  onSlotCreate={(time) => openCreate({ time })}
                />
              )}
            </div>
          </div>
          {showAvailabilitySidebar ? (
            <AvailabilityPanel
              canEditAvailability={false}
              compact
              currentProfessional={currentProfessional}
              lockDoctorSelection={isDoctorScope}
              professionals={professionals}
              selectedProfessionalId={isDoctorScope ? currentProfessional?.id : doctorFilter !== 'Todos' ? doctorFilter : ''}
              showDoctorFilter={!isDoctorScope}
              showExceptionManagement={false}
              title="Disponibilidade Médica"
              viewerProfile={viewerProfile}
            />
          ) : null}
        </section>
      )}

      <DarkModal onClose={closeModal} open={modalOpen} title={isPatientScope ? 'Detalhes do agendamento' : editingAppointment ? 'Gerenciar agendamento' : 'Novo agendamento'}>
        {isPatientScope ? (
          <AppointmentReadOnlyDetails appointment={editingAppointment} onClose={closeModal} />
        ) : (
        <form className="grid gap-4" onSubmit={handleSubmitAppointment}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid content-start gap-4">
              <DarkField label="Paciente">
                <input
                  className="h-10 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary"
                  onChange={(event) => {
                    setModalPatientSearch(event.target.value)
                    updateForm('patientId', '')
                  }}
                  placeholder="Pesquisar paciente"
                  type="search"
                  value={modalPatientSearch || getPatientLabel(selectedPatient)}
                />
                {modalPatientSearch && !form.patientId ? (
                  <SearchResults
                    emptyText="Nenhum paciente encontrado."
                    getLabel={getPatientLabel}
                    items={filteredPatients.slice(0, 5)}
                    onSelect={(patient) => {
                      updateForm('patientId', patient.id)
                      setModalPatientSearch(getPatientLabel(patient))
                    }}
                    selectedId={form.patientId}
                  />
                ) : null}
              </DarkField>

              <DarkField label="Profissional">
                {isDoctorScope ? (
                  <input
                    className="h-11 rounded-md border border-border-default-v2 bg-surface-card px-3 text-sm text-text-muted-v2 outline-none"
                    disabled
                    readOnly
                    value={currentProfessional?.name || 'Médico não vinculado'}
                  />
                ) : (
                  <>
                    <input
                      className="h-10 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary"
                      onChange={(event) => {
                        setModalDoctorSearch(event.target.value)
                        updateForm('professionalId', '')
                      }}
                      placeholder="Pesquisar médico"
                      type="search"
                      value={modalDoctorSearch || selectedProfessional?.name || ''}
                    />
                    {modalDoctorSearch && !form.professionalId ? (
                      <SearchResults
                        emptyText="Nenhum médico encontrado."
                        getDescription={(professional) => professional.unit || professional.email}
                        getLabel={(professional) => professional.name}
                        items={filteredProfessionals.slice(0, 5)}
                        onSelect={(professional) => {
                          updateForm('professionalId', professional.id)
                          setModalDoctorSearch(professional.name)
                        }}
                        selectedId={form.professionalId}
                      />
                    ) : null}
                  </>
                )}
              </DarkField>
              <DarkField label="Observações">
                <textarea
                  className="min-h-36 w-full resize-y rounded-md border border-border-default-v2 bg-surface-card-hover px-3 py-2 text-sm leading-5 text-text-body outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary"
                  onChange={(event) => updateForm('notes', event.target.value)}
                  placeholder="Observações sobre o agendamento"
                  value={form.notes}
                />
              </DarkField>
            </div>

            <div className="grid content-start gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <DarkField label="Dia">
                  <input
                    className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none [color-scheme:dark] focus:border-accent-primary"
                    onChange={(event) => {
                      const parsedDate = parseLocalDate(event.target.value)
                      if (parsedDate) setBaseDate(parsedDate)
                    }}
                    type="date"
                    value={formatLocalDateInput(baseDate)}
                  />
                </DarkField>

                <DarkField label="Horário">
                  <select
                    className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary disabled:cursor-not-allowed disabled:text-text-muted-v2"
                    disabled={!form.professionalId || slotsLoading || !timeOptions.length}
                    onChange={(event) => updateForm('time', event.target.value)}
                    required
                    value={form.time}
                  >
                    <option value="">
                      {slotsLoading
                        ? 'Calculando horários...'
                        : form.professionalId
                          ? 'Selecione um horário disponível'
                          : 'Selecione um médico'}
                    </option>
                    {timeOptions.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                  {slotsLoading ? <span className="text-xs font-normal text-text-muted-v2">Calculando horários...</span> : null}
                  {slotsError ? <span className="text-xs font-normal text-amber-400">{slotsError}</span> : null}
                  {!slotsLoading && form.professionalId && !timeOptions.length ? (
                    <span className="text-xs font-normal text-amber-400">Nenhum horário disponível para este médico nesta data.</span>
                  ) : null}
                </DarkField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DarkField label="Formato">
                  <select
                    className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary"
                    onChange={(event) => updateForm('mode', event.target.value)}
                    value={form.mode}
                  >
                    <option>Teleconsulta</option>
                    <option>Presencial</option>
                  </select>
                </DarkField>

                <DarkField label="Status">
                  <select
                    className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary"
                    onChange={(event) => updateForm('status', event.target.value)}
                    value={form.status}
                  >
                    {!appointmentStatusOptions.includes(form.status) && form.status ? (
                      <option value={form.status}>{form.status}</option>
                    ) : null}
                    {appointmentStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </DarkField>
              </div>

              <label className="flex h-12 items-center justify-between gap-4 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm font-semibold text-text-body">
                <span>Alta prioridade</span>
                <input
                  checked={Boolean(form.highPriority)}
                  className="size-5 accent-[#3b82f6]"
                  onChange={(event) => updateForm('highPriority', event.target.checked)}
                  type="checkbox"
                />
              </label>

              <DarkField label="Tipo de consulta">
                <select
                  className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary"
                  onChange={(event) => updateForm('type', event.target.value)}
                  value={form.type}
                >
                  {appointmentTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </DarkField>

              <DarkField label="Duração">
                <input
                  className="h-11 rounded-md border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none focus:border-accent-primary"
                  max="240"
                  min="15"
                  onChange={(event) => updateForm('durationMinutes', event.target.value)}
                  step="15"
                  type="number"
                  value={form.durationMinutes}
                />
              </DarkField>
            </div>
          </div>

          {editingAppointment ? (
            <div className="rounded-xl border border-border-default-v2 bg-surface-inset px-4 py-3 text-sm text-text-muted-v2">
              <p>
                Agendamento de {selectedPatient ? getPatientLabel(selectedPatient) : 'paciente não informado'} às {form.time}.
              </p>
              <p className="mt-1">Status atual: {form.status}</p>
              <p className="mt-1">Criado por: {appointmentCreatorName}</p>
              {form.notes ? <p className="mt-1">Observações: {form.notes}</p> : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            {editingAppointment ? (
              <button
                className="agenda-cancel-button mr-auto h-10 rounded-sm border border-red-500/40 bg-red-950/20 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-950/35"
                onClick={handleCancelAppointment}
                type="button"
              >
                Cancelar agendamento
              </button>
            ) : null}
            {canConfirmArrival ? (
              <button
                className="h-10 rounded-sm border border-emerald-500/40 bg-emerald-950/30 px-4 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-950/50"
                onClick={handleConfirmArrival}
                type="button"
              >
                Confirmar chegada
              </button>
            ) : null}
            {editingAppointment && isSecretaryRole && form.status === 'Aguardando' ? (
              <span className="h-10 inline-flex items-center rounded-sm border border-emerald-500/40 bg-emerald-950/20 px-4 text-sm font-semibold text-emerald-200">
                Em sala de espera
              </span>
            ) : null}
            <button
              className="h-10 rounded-sm border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-semibold text-text-body transition hover:bg-surface-card-hover"
              onClick={closeModal}
              type="button"
            >
              Fechar
            </button>
            <button
              className="h-10 rounded-sm border border-accent-primary bg-accent-primary px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:border-border-default-v2 disabled:bg-surface-card-hover disabled:text-text-muted-v2"
              disabled={!canCreateAppointment}
              type="submit"
            >
              {editingAppointment ? 'Salvar alterações' : 'Salvar'}
            </button>
          </div>
        </form>
        )}
      </DarkModal>
    </div>
  )
}

function PatientAgendaList({ appointments, currentPatient, onAppointmentClick }) {
  const patientName = getPatientLabel(currentPatient) || 'paciente'

  if (!appointments.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border-default-v2 bg-surface-inset p-8 text-center">
        <p className="text-sm font-semibold text-text-body">Nenhum agendamento encontrado nesta data.</p>
        <p className="mt-2 text-sm leading-6 text-text-muted-v2">
          Esta agenda mostra apenas consultas vinculadas a {patientName}.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {appointments.map((appointment) => (
        <button
          className="rounded-xl border border-border-default-v2 bg-surface-inset p-4 text-left transition hover:border-accent-primary/50 hover:bg-surface-card"
          key={appointment.id}
          onClick={() => onAppointmentClick?.(appointment)}
          type="button"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-text-body">{appointment.type || 'Consulta'}</p>
              <p className="mt-1 truncate text-sm text-text-muted-v2">
                {appointment.professional || 'Médico não informado'}
              </p>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className="whitespace-nowrap text-lg font-bold text-accent-primary">{appointment.time || '--:--'}</p>
              <span className="mt-1 inline-flex whitespace-nowrap rounded-full border border-border-default-v2 bg-surface-card px-2.5 py-1 text-xs font-semibold text-text-body">
                {appointment.status || 'Agendado'}
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-text-muted-v2">
            {appointment.mode ? <span className="whitespace-nowrap rounded-full bg-surface-card-hover px-2.5 py-1">{appointment.mode}</span> : null}
            {appointment.room ? <span className="whitespace-nowrap rounded-full bg-surface-card-hover px-2.5 py-1">{appointment.room}</span> : null}
          </div>
        </button>
      ))}
    </div>
  )
}

function AppointmentReadOnlyDetails({ appointment, onClose }) {
  if (!appointment) {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-text-muted-v2">Agendamento não encontrado.</p>
        <div className="flex justify-end">
          <button className="h-10 rounded-sm bg-accent-primary px-4 text-sm font-semibold text-white" onClick={onClose} type="button">
            Fechar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadOnlyDetail label="Paciente" value={appointment.patient || '-'} />
        <ReadOnlyDetail label="Médico" value={appointment.professional || '-'} />
        <ReadOnlyDetail label="Data" value={formatDisplayDate(appointment.date)} />
        <ReadOnlyDetail label="Horário" value={appointment.time || '-'} />
        <ReadOnlyDetail label="Tipo" value={appointment.type || '-'} />
        <ReadOnlyDetail label="Status" value={appointment.status || '-'} />
        <ReadOnlyDetail label="Formato" value={appointment.mode || '-'} />
        <ReadOnlyDetail label="Local" value={appointment.room || '-'} />
      </div>
      {appointment.notes ? (
        <ReadOnlyDetail label="Observações" value={appointment.notes} />
      ) : null}
      <div className="flex justify-end">
        <button className="h-10 rounded-sm bg-accent-primary px-4 text-sm font-semibold text-white" onClick={onClose} type="button">
          Fechar
        </button>
      </div>
    </div>
  )
}

function ReadOnlyDetail({ label, value }) {
  return (
    <div className="rounded-lg border border-border-default-v2 bg-surface-inset px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted-v2">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-text-body">{value}</p>
    </div>
  )
}

export function AvailabilitySidebar({ currentProfessional, isDoctorScope, professionals, viewerProfile }) {
  const today = formatLocalDateInput(new Date())
  const defaultDoctorId = isDoctorScope ? currentProfessional?.id || '' : professionals[0]?.id || ''
  const isSecretary = isSecretaryProfile(viewerProfile)
  const doctorOptions = useMemo(
    () => (isDoctorScope && currentProfessional ? [currentProfessional] : professionals),
    [currentProfessional, isDoctorScope, professionals],
  )
  const [availabilityFilters, setAvailabilityFilters] = useState({
    doctorId: defaultDoctorId,
    weekday: '',
    appointmentType: '',
  })
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
    doctorId: defaultDoctorId,
    date: today,
    kind: '',
  })
  const [exceptionForm, setExceptionForm] = useState({
    doctorId: defaultDoctorId,
    date: today,
    kind: 'bloqueio',
    startTime: '',
    endTime: '',
    reason: '',
  })
  const [exceptionRows, setExceptionRows] = useState([])
  const [availabilityFormRows, setAvailabilityFormRows] = useState([])
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [savingAvailability, setSavingAvailability] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [availabilityCheck, setAvailabilityCheck] = useState(null)

  useEffect(() => {
    if (!defaultDoctorId) return

    setAvailabilityFilters((current) => ({ ...current, doctorId: current.doctorId || defaultDoctorId }))
    setAvailabilityForm((current) => ({ ...current, doctorId: current.doctorId || defaultDoctorId }))
    setExceptionFilters((current) => ({ ...current, doctorId: current.doctorId || defaultDoctorId }))
    setExceptionForm((current) => ({ ...current, doctorId: current.doctorId || defaultDoctorId }))
  }, [defaultDoctorId])

  const loadExceptions = useCallback(async () => {
    if (isSecretary) return

    setAvailabilityError('')

    try {
      const exceptions = await availabilityRepository.getExceptions({
        doctorId: exceptionFilters.doctorId,
        date: exceptionFilters.date || undefined,
      })
      setExceptionRows(exceptions)
    } catch (err) {
      setAvailabilityError(translateErrorMessage(err.message, 'Falha ao carregar exceções de agenda.'))
    }
  }, [
    exceptionFilters.date,
    exceptionFilters.doctorId,
    isSecretary,
  ])

  useEffect(() => {
    loadExceptions()
  }, [loadExceptions])

  const loadAvailabilityFormRows = useCallback(async () => {
    if (isSecretary) return
    if (!availabilityForm.doctorId) {
      setAvailabilityFormRows([])
      setAvailabilityForm((current) => ({ ...current, weekdays: [] }))
      return
    }

    setAvailabilityError('')

    try {
      const rows = await availabilityRepository.getAll({
        doctorId: availabilityForm.doctorId,
        order: 'weekday.asc,start_time.asc',
      })
      const sortedRows = sortAvailabilityRows(rows)
      const activeRows = sortedRows.filter((row) => row.active !== false)
      const template = activeRows[0] || sortedRows[0]

      setAvailabilityFormRows(sortedRows)
      setAvailabilityForm((current) => ({
        ...current,
        active: template?.active ?? current.active,
        appointmentType: template?.appointmentType || current.appointmentType,
        endTime: template?.endTime || current.endTime,
        slotMinutes: template?.slotMinutes || current.slotMinutes,
        startTime: template?.startTime || current.startTime,
        weekdays: uniqueWeekdays(activeRows.map((row) => row.weekday)),
      }))
    } catch (err) {
      setAvailabilityFormRows([])
      setAvailabilityError(translateErrorMessage(err.message, 'Falha ao carregar disponibilidade cadastrada.'))
    }
  }, [availabilityForm.doctorId, isSecretary])

  useEffect(() => {
    loadAvailabilityFormRows()
  }, [loadAvailabilityFormRows])

  async function verifyAvailability() {
    setLoadingAvailability(true)
    setAvailabilityError('')

    try {
      const availability = await availabilityRepository.getAll({
        doctorId: availabilityFilters.doctorId,
        weekday: availabilityFilters.weekday === '' ? undefined : Number(availabilityFilters.weekday),
        appointmentType: availabilityFilters.appointmentType || undefined,
      })
      setAvailabilityCheck({
        filters: { ...availabilityFilters },
        rows: availability,
      })
    } catch (err) {
      setAvailabilityError(translateErrorMessage(err.message, 'Falha ao verificar disponibilidade.'))
    } finally {
      setLoadingAvailability(false)
    }
  }

  async function saveAvailability(event) {
    event.preventDefault()
    if (!availabilityForm.doctorId) {
      window.alert('Selecione um médico para criar disponibilidade.')
      return
    }
    if (!availabilityForm.weekdays.length && !availabilityFormRows.length) {
      window.alert('Selecione ao menos um dia da semana.')
      return
    }
    if (availabilityForm.weekdays.length && !isValidTimeRange(availabilityForm.startTime, availabilityForm.endTime)) {
      window.alert('O horário inicial deve ser menor que o horário final.')
      return
    }

    setSavingAvailability(true)

    try {
      const rowsByWeekday = groupAvailabilityRowsByWeekday(availabilityFormRows)
      const selectedWeekdays = new Set(availabilityForm.weekdays.map(Number))
      const editedRowIds = new Set(availabilityFormRows.map((row) => String(row.id || '')).filter(Boolean))
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
      const removals = availabilityFormRows
        .filter((row) => !selectedWeekdays.has(Number(row.weekday)))
        .map((row) => availabilityRepository.remove(row.id))

      await Promise.all([...saves, ...removals])
      await loadAvailabilityFormRows()
      window.dispatchEvent(new CustomEvent(AGENDA_EXCEPTIONS_CHANGED_EVENT))
      window.alert(availabilityFormRows.length ? 'Disponibilidade atualizada.' : 'Disponibilidade cadastrada.')
    } catch (err) {
      window.alert(translateErrorMessage(err.message, 'Erro ao salvar disponibilidade.'))
    } finally {
      setSavingAvailability(false)
    }
  }

  async function createException(event) {
    event.preventDefault()
    if (!exceptionForm.doctorId || !exceptionForm.date || !exceptionForm.kind) {
      window.alert('Preencha médico, data e tipo da exceção.')
      return
    }

    try {
      await availabilityRepository.createException({
        ...exceptionForm,
        createdBy: viewerProfile?.id || currentProfessional?.userId || currentProfessional?.id,
      })
      await loadExceptions()
      window.dispatchEvent(new CustomEvent(AGENDA_EXCEPTIONS_CHANGED_EVENT))
      window.alert('Exceção cadastrada.')
    } catch (err) {
      window.alert(translateErrorMessage(err.message, 'Erro ao criar exceção de agenda.'))
    }
  }

  async function findConflictingAvailability(form, ignoredRowIds = new Set()) {
    const conflicts = []

    for (const weekday of form.weekdays) {
      const rows = await availabilityRepository.getAll({
        doctorId: form.doctorId,
        weekday,
        appointmentType: form.appointmentType,
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

  function updateAvailabilityFilter(field, value) {
    setAvailabilityFilters((current) => ({ ...current, [field]: value }))
  }

  function updateAvailabilityForm(field, value) {
    setAvailabilityForm((current) => ({ ...current, [field]: value }))
  }

  function toggleAvailabilityWeekday(weekday) {
    setAvailabilityForm((current) => {
      const weekdays = current.weekdays.includes(weekday)
        ? current.weekdays.filter((day) => day !== weekday)
        : [...current.weekdays, weekday].sort((a, b) => a - b)

      return { ...current, weekdays }
    })
  }

  function updateExceptionFilter(field, value) {
    setExceptionFilters((current) => ({ ...current, [field]: value }))
    if (['doctorId', 'date'].includes(field)) {
      setExceptionForm((current) => ({ ...current, [field]: value }))
    }
  }

  function updateExceptionForm(field, value) {
    setExceptionForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <aside className="grid self-start content-start gap-4 rounded-2xl border border-border-default-v2 bg-surface-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
      <div>
        <h2 className="text-base font-bold text-text-heading">Disponibilidade médica</h2>
        <p className="mt-1 text-xs leading-5 text-text-muted-v2">Horários recorrentes e exceções da agenda.</p>
      </div>

      {availabilityError ? (
        <p className="availability-error rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">{availabilityError}</p>
      ) : null}

      <section className="grid gap-3 rounded-xl border border-border-default-v2 bg-surface-inset p-3">
        <h3 className="text-sm font-bold text-text-heading">Filtros</h3>
        <SidebarField label="Médico">
          <select className={sidebarInputClass} disabled={isDoctorScope} onChange={(event) => updateAvailabilityFilter('doctorId', event.target.value)} value={availabilityFilters.doctorId}>
            <option value="">Todos</option>
            {doctorOptions.map((professional) => (
              <option key={professional.id} value={professional.id}>{professional.name}</option>
            ))}
          </select>
        </SidebarField>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <SidebarField label="Dia">
            <select className={sidebarInputClass} onChange={(event) => updateAvailabilityFilter('weekday', event.target.value)} value={availabilityFilters.weekday}>
              <option value="">Todos</option>
              {weekdayOptions.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
            </select>
          </SidebarField>
          <SidebarField label="Tipo">
            <select className={sidebarInputClass} onChange={(event) => updateAvailabilityFilter('appointmentType', event.target.value)} value={availabilityFilters.appointmentType}>
              <option value="">Todos</option>
              <option value="presencial">Presencial</option>
              <option value="telemedicina">Telemedicina</option>
            </select>
          </SidebarField>
        </div>
        <button className="h-9 rounded-sm border border-accent-primary bg-accent-primary text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={loadingAvailability} onClick={verifyAvailability} type="button">
          {loadingAvailability ? 'Verificando...' : 'Verificar'}
        </button>
      </section>

      {!isSecretary ? <form className="grid gap-3 rounded-xl border border-border-default-v2 bg-surface-inset p-3" onSubmit={saveAvailability}>
        <div>
          <h3 className="text-sm font-bold text-text-heading">Cadastrar Disponibilidade</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted-v2">
            {availabilityFormRows.length ? 'Edite os dias, horários e status da disponibilidade existente.' : 'Selecione os dias para criar uma nova disponibilidade.'}
          </p>
        </div>
        <SidebarField label="Médico">
          <select className={sidebarInputClass} disabled={isDoctorScope} onChange={(event) => updateAvailabilityForm('doctorId', event.target.value)} value={availabilityForm.doctorId}>
            <option value="">Selecione</option>
            {doctorOptions.map((professional) => (
              <option key={professional.id} value={professional.id}>{professional.name}</option>
            ))}
          </select>
        </SidebarField>
        <div className="grid gap-2">
          <span className="text-xs font-semibold text-text-muted-v2">Dias</span>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {weekdayOptions.map((day) => (
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
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <SidebarField label="Tipo">
            <select className={sidebarInputClass} onChange={(event) => updateAvailabilityForm('appointmentType', event.target.value)} value={availabilityForm.appointmentType}>
              <option value="presencial">Presencial</option>
              <option value="telemedicina">Telemedicina</option>
            </select>
          </SidebarField>
          <SidebarField label="Início">
            <input className={`${sidebarInputClass} [color-scheme:dark]`} onChange={(event) => updateAvailabilityForm('startTime', event.target.value)} type="time" value={availabilityForm.startTime} />
          </SidebarField>
          <SidebarField label="Fim">
            <input className={`${sidebarInputClass} [color-scheme:dark]`} onChange={(event) => updateAvailabilityForm('endTime', event.target.value)} type="time" value={availabilityForm.endTime} />
          </SidebarField>
          <SidebarField label="Slot (min)">
            <input className={sidebarInputClass} max="120" min="15" onChange={(event) => updateAvailabilityForm('slotMinutes', Number(event.target.value))} step="15" type="number" value={availabilityForm.slotMinutes} />
          </SidebarField>
          <label className="flex h-10 items-center gap-2 text-xs font-semibold text-text-body">
            <input checked={availabilityForm.active} className="size-4 accent-[#3b82f6]" onChange={(event) => updateAvailabilityForm('active', event.target.checked)} type="checkbox" />
            Ativa
          </label>
        </div>
        <button className="h-9 rounded-sm bg-accent-primary text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={savingAvailability} type="submit">
          {savingAvailability ? 'Salvando...' : availabilityFormRows.length ? 'Salvar alteração' : 'Cadastrar disponibilidade'}
        </button>
      </form> : null}

      {!isSecretary ? <section className="grid gap-3 rounded-xl border border-border-default-v2 bg-surface-inset p-3">
        <h3 className="text-sm font-bold text-text-heading">Exceções</h3>
        <div className="grid gap-2">
          <SidebarField label="Médico">
            <select className={sidebarInputClass} disabled={isDoctorScope} onChange={(event) => updateExceptionFilter('doctorId', event.target.value)} value={exceptionFilters.doctorId}>
              <option value="">Todos</option>
              {doctorOptions.map((professional) => (
                <option key={professional.id} value={professional.id}>{professional.name}</option>
              ))}
            </select>
          </SidebarField>
          <SidebarField label="Data">
            <input className={`${sidebarInputClass} [color-scheme:dark]`} onChange={(event) => updateExceptionFilter('date', event.target.value)} type="date" value={exceptionFilters.date} />
          </SidebarField>
        </div>

        <form className="grid gap-2 border-t border-border-default-v2 pt-3" onSubmit={createException}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <SidebarField label="Tipo">
              <select className={sidebarInputClass} onChange={(event) => updateExceptionForm('kind', event.target.value)} value={exceptionForm.kind}>
                <option value="bloqueio">Bloqueio</option>
                <option value="disponibilidade_extra">Disponibilidade extra</option>
              </select>
            </SidebarField>
            <SidebarField label="Início">
              <input className={`${sidebarInputClass} [color-scheme:dark]`} onChange={(event) => updateExceptionForm('startTime', event.target.value)} type="time" value={exceptionForm.startTime} />
            </SidebarField>
            <SidebarField label="Fim">
              <input className={`${sidebarInputClass} [color-scheme:dark]`} onChange={(event) => updateExceptionForm('endTime', event.target.value)} type="time" value={exceptionForm.endTime} />
            </SidebarField>
          </div>
          <SidebarField label="Motivo">
            <input className={sidebarInputClass} onChange={(event) => updateExceptionForm('reason', event.target.value)} value={exceptionForm.reason} />
          </SidebarField>
          <button className="h-9 rounded-sm border border-accent-primary bg-accent-primary text-sm font-semibold text-white" type="submit">Criar exceção</button>
        </form>

        <div className="grid gap-2">
          {exceptionRows.slice(0, 4).map((row) => (
            <div className="rounded-md border border-border-default-v2 bg-surface-card p-2 text-xs text-text-muted-v2" key={row.id}>
              <p className="font-semibold text-text-body">{formatDisplayDate(row.date)} | {row.kind === 'disponibilidade_extra' ? 'Extra' : 'Bloqueio'}</p>
              <p>{row.startTime || 'Dia inteiro'}{row.endTime ? ` - ${row.endTime}` : ''}</p>
              {row.reason ? <p>{row.reason}</p> : null}
            </div>
          ))}
          {!exceptionRows.length ? <p className="text-xs text-text-muted-v2">Nenhuma exceção encontrada.</p> : null}
        </div>
      </section> : null}

      <AvailabilityCheckModal
        onClose={() => setAvailabilityCheck(null)}
        result={availabilityCheck}
      />
    </aside>
  )
}

const sidebarInputClass = 'h-10 w-full rounded-sm border border-border-default-v2 bg-surface-card-hover px-3 text-sm text-text-body outline-none transition focus:border-accent-primary'

function AvailabilityCheckModal({ onClose, result }) {
  if (!result) return null

  const rows = result.rows || []

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="agenda-modal-shell flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-default-v2 bg-surface-card shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border-default-v2 px-5 py-4">
          <h2 className="text-lg font-bold text-text-body">Verificação de disponibilidade</h2>
          <button
            aria-label="Fechar"
            className="grid size-8 place-items-center rounded-sm text-xl leading-none text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-body"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          {rows.length ? (
            <div className="grid gap-3">
              <p className="availability-found-message rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-200">
                Disponibilidade encontrada para os filtros selecionados.
              </p>
              {rows.map((row) => (
                <article className="rounded-lg border border-border-default-v2 bg-surface-inset p-3 text-sm text-text-muted-v2" key={row.id || `${row.doctorId}-${row.weekday}-${row.startTime}`}>
                  <p className="font-semibold text-text-body">
                    {getWeekdayLabel(row.weekday)} | {row.startTime} - {row.endTime}
                  </p>
                  <p className="mt-1">
                    {row.appointmentType || 'presencial'} | {row.slotMinutes || 30} min | {row.active ? 'ativa' : 'inativa'}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="availability-empty-message rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-semibold text-amber-200">
              Nenhuma disponibilidade encontrada para os filtros selecionados.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function SidebarField({ children, label }) {
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
  return weekdayOptions.find((day) => Number(day.value) === Number(value))?.label || 'Dia'
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

function isSecretaryProfile(profile) {
  const normalized = String(profile?.normalizedRole || profile?.role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  return Boolean(profile?.isSecretary) || normalized.includes('secretaria')
}

function DarkField({ children, className = '', label }) {
  return (
    <label className={`grid gap-2 text-sm font-semibold text-text-muted-v2 ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function DarkModal({ children, onClose, open, title }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="agenda-modal-shell flex max-h-[96vh] min-h-[620px] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border-default-v2 bg-surface-card shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border-default-v2 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-sm bg-accent-primary text-white">
              <StethoscopeIcon className="size-5" />
            </span>
            <h2 className="text-lg font-bold text-text-body">{title}</h2>
          </div>
          <button
            aria-label="Fechar"
            className="grid size-8 place-items-center rounded-sm text-xl leading-none text-text-muted-v2 transition hover:bg-surface-card-hover hover:text-text-body"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

function SearchResults({ emptyText, getDescription, getLabel, items, onSelect, selectedId }) {
  return (
    <div className="max-h-44 overflow-y-auto rounded-md border border-border-default-v2 bg-surface-inset">
      {items.length ? (
        items.map((item) => {
          const isSelected = String(item.id) === String(selectedId)
          return (
            <button
              className={`block w-full px-3 py-2 text-left text-sm transition ${
                isSelected ? 'bg-accent-primary/20 text-text-body' : 'text-text-muted-v2 hover:bg-surface-card-hover hover:text-text-body'
              }`}
              key={item.id}
              onClick={() => onSelect(item)}
              type="button"
            >
              <span className="block font-semibold">{getLabel(item)}</span>
              {getDescription?.(item) ? (
                <span className="mt-0.5 block text-xs text-text-muted-v2">{getDescription(item)}</span>
              ) : null}
            </button>
          )
        })
      ) : (
        <p className="px-3 py-2 text-xs text-text-muted-v2">{emptyText}</p>
      )}
    </div>
  )
}

function readPendingNotificationAction() {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_NOTIFICATION_ACTION_KEY) || 'null')
  } catch {
    sessionStorage.removeItem(PENDING_NOTIFICATION_ACTION_KEY)
    return null
  }
}

function resolveAppointmentCreatorName(appointment, viewerProfile, professionals = [], users = []) {
  const explicitName = String(appointment?.createdByName || '').trim()
  if (explicitName && !isUuid(explicitName)) return explicitName

  const creatorId = normalizeIdentifier(appointment?.createdBy)
  const viewerIds = [
    viewerProfile?.id,
    viewerProfile?.userId,
    viewerProfile?.authUserId,
    viewerProfile?.doctorId,
    viewerProfile?.email,
  ].map(normalizeIdentifier)

  if (creatorId && viewerIds.includes(creatorId)) {
    return viewerProfile?.name || viewerProfile?.full_name || viewerProfile?.email || 'Usuário logado'
  }

  const user = users.find((item) =>
    [
      item.id,
      item.user_id,
      item.auth_user_id,
      item.profile_id,
      item.email,
    ].map(normalizeIdentifier).includes(creatorId),
  )

  if (user) return user.full_name || user.name || user.nome || user.email || 'Usuário'

  const professional = professionals.find((item) =>
    [
      item.id,
      item.userId,
      item.authUserId,
      item.email,
    ].map(normalizeIdentifier).includes(creatorId),
  )

  if (professional?.name) return professional.name

  return 'Usuário não informado'
}

function getPatientLabel(patient) {
  return patient?.name || patient?.full_name || patient?.nome || ''
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase()
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function filterBySearch(items, search, getValues) {
  const query = normalizeSearch(search)
  if (!query) return items

  return items.filter((item) =>
    getValues(item)
      .filter(Boolean)
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(query),
  )
}

function getTimeOptions(selectedTime, slots) {
  return [
    ...new Set([
      selectedTime,
      ...slots.map((slot) => slot.time),
    ].filter(Boolean)),
  ].sort()
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}
