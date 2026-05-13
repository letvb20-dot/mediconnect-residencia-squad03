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
import { useState } from 'react'

import { AgendaDailyView } from '../components/calendar/AgendaDailyView.jsx'
import { AgendaMonthlyView } from '../components/calendar/AgendaMonthlyView.jsx'
import { AgendaWeeklyView } from '../components/calendar/AgendaWeeklyView.jsx'
import { StethoscopeIcon } from '../components/Brand.jsx'
import { useAgenda } from '../hooks/useAgenda.js'
import { formatLocalDateInput, parseLocalDate } from '../utils/agendaDate.js'

const statusFilters = [
  { label: 'Todos', value: 'Todos' },
  { label: 'Confirmadas', value: 'Confirmada' },
  { label: 'Em triagem', value: 'Em triagem' },
  { label: 'Aguardando', value: 'Aguardando' },
  { label: 'Canceladas', value: 'Cancelada' },
]

const viewFilters = [
  { label: 'Dia', value: 'Dia' },
  { label: 'Semana', value: 'Semana' },
  { label: 'Mês', value: 'Mes' },
]

const appointmentTypeOptions = ['Retorno', 'Primeira consulta', 'Exame', 'Avaliação pre-op']
const appointmentStatusOptions = ['Confirmada', 'Em triagem', 'Aguardando']

export function AgendaPage() {
  const [modalPatientSearch, setModalPatientSearch] = useState('')
  const [modalDoctorSearch, setModalDoctorSearch] = useState('')
  const {
    patients,
    professionals,
    currentProfessional,
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
    setDoctorFilter,
    doctorSearch,
    setDoctorSearch,
    unitFilter,
    setUnitFilter,
    modalOpen,
    editingAppointment,
    form,
    updateForm,
    openCreateModal,
    openAppointmentModal,
    closeAppointmentModal,
    handleSubmitAppointment,
    handleCancelAppointment,
    visibleAppointments,
    availableSlots,
    slotsLoading,
    slotsError,
  } = useAgenda()

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-[#a3a3a3]">
        <p>Carregando agenda...</p>
      </div>
    )
  }

  const weekStart = startOfWeek(baseDate, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 0 })
  const isDoctorScope = agendaScope === 'doctor'
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
  const timeOptions = getTimeOptions(form.time, availableSlots)

  function openCreate(options = {}) {
    setModalPatientSearch('')
    setModalDoctorSearch('')
    openCreateModal(options)
  }

  function openManage(appointment) {
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
    <div className="mx-auto flex max-w-[1180px] flex-col gap-8 text-[#e5e5e5]">
      <section className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[32px] font-bold leading-8 tracking-[-0.02em] text-[#e5e5e5]">
            Agenda
          </h1>
          <p className="mt-2 text-sm leading-5 text-[#a3a3a3]">
            Perfil atual: {viewerProfile?.role || (isDoctorScope ? 'Médico' : 'Usuário')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-sm border border-[#404040] bg-[#262626] p-1">
            <button
              className="grid size-7 place-items-center rounded-sm text-[#a3a3a3] transition hover:bg-[#303030] hover:text-[#e5e5e5]"
              onClick={() => {
                if (activeView === 'Dia') setBaseDate((current) => subDays(current, 1))
                if (activeView === 'Semana') setBaseDate((current) => subWeeks(current, 1))
                if (activeView === 'Mes') setBaseDate((current) => subMonths(current, 1))
              }}
              type="button"
            >
              {'<'}
            </button>
            <span className="min-w-[160px] text-center text-sm font-semibold text-[#e5e5e5] capitalize">
              {activeView === 'Dia' && format(baseDate, "dd 'de' MMM", { locale: ptBR })}
              {activeView === 'Semana' &&
                `${format(weekStart, 'dd MMM', { locale: ptBR })} - ${format(weekEnd, 'dd MMM', { locale: ptBR })}`}
              {activeView === 'Mes' && format(baseDate, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button
              className="grid size-7 place-items-center rounded-sm text-[#a3a3a3] transition hover:bg-[#303030] hover:text-[#e5e5e5]"
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
            className="h-9 rounded-sm border border-[#404040] bg-[#262626] px-4 text-sm font-medium text-[#e5e5e5] transition hover:bg-[#303030]"
            onClick={() => setBaseDate(new Date())}
            type="button"
          >
            Hoje
          </button>
          <button
            className="h-9 rounded-sm border border-[#3b82f6] bg-[#3b82f6] px-4 text-sm font-semibold text-white shadow-[0_10px_15px_rgba(59,130,246,0.16)] transition hover:bg-[#3478ed] disabled:cursor-not-allowed disabled:border-[#404040] disabled:bg-[#303030] disabled:text-[#737373] disabled:shadow-none"
            disabled={!canCreateAppointment}
            onClick={() => openCreate()}
            type="button"
          >
            + Novo agendamento
          </button>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-[#404040] bg-[#262626] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
          <div className="rounded-xl border border-dashed border-[#7f1d1d] bg-[#2a1111] p-6">
            <h2 className="text-base font-bold text-[#fecaca]">Não foi possível liberar a agenda</h2>
            <p className="mt-2 text-sm leading-6 text-[#fca5a5]">{error}</p>
            <p className="mt-3 text-sm leading-6 text-[#a3a3a3]">
              Enquanto esse vínculo não existir na API, a tela fica bloqueada para evitar exibir consultas de outro médico.
            </p>
          </div>
        </section>
      ) : (
        <section className="grid gap-6 xl:grid-cols-1">
          <div className="rounded-2xl border border-[#404040] bg-[#262626] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold leading-6 text-[#e5e5e5]">
                    {format(baseDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </h2>
                </div>
                <p className="mt-1 text-sm leading-5 text-[#a3a3a3]">
                  Visualização: {activeView.toLowerCase()} | {visibleAppointments.length} registros visíveis
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {viewFilters.map((view) => (
                  <button
                    className={`h-8 rounded-sm border px-3 text-sm font-semibold transition ${
                      activeView === view.value
                        ? 'border-[#3b82f6] bg-[#3b82f6] text-white'
                        : 'border-[#404040] bg-[#303030] text-[#a3a3a3] hover:text-[#e5e5e5]'
                    }`}
                    key={view.value}
                    onClick={() => setActiveView(view.value)}
                    type="button"
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {statusFilters.map((filter) => (
                  <button
                    className={`h-8 rounded-sm border px-3 text-sm font-semibold transition ${
                      status === filter.value
                        ? 'border-[#3b82f6] bg-[#3b82f6]/10 text-[#3b82f6]'
                        : 'border-[#404040] bg-[#303030] text-[#a3a3a3] hover:text-[#e5e5e5]'
                    }`}
                    key={filter.value}
                    onClick={() => setStatus(filter.value)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {!isDoctorScope ? (
                <div className="grid gap-3 sm:min-w-[32rem] sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-semibold text-[#a3a3a3]">
                    <span>Médico</span>
                    <input
                      className="h-9 rounded-sm border border-[#404040] bg-[#303030] px-3 text-sm font-medium text-[#e5e5e5] outline-none transition placeholder:text-[#737373] focus:border-[#3b82f6]"
                      onChange={(event) => {
                        setDoctorFilter('Todos')
                        setDoctorSearch(event.target.value)
                      }}
                      placeholder="Pesquisar médico pelo nome"
                      type="search"
                      value={doctorSearch}
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-[#a3a3a3]">
                    <span>Unidade</span>
                    <select
                      className="h-9 rounded-sm border border-[#404040] bg-[#303030] px-3 text-sm font-medium text-[#e5e5e5] outline-none transition focus:border-[#3b82f6]"
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

            {!isDoctorScope && (
              <div className="mt-4 rounded-xl border border-[#404040] bg-[#1f1f1f] px-4 py-3 text-sm text-[#a3a3a3]">
                Perfil atual: {viewerProfile?.role || 'Administrador'}
              </div>
            )}

            <div className="mt-6 grid gap-3">
              {activeView === 'Semana' && (
                <AgendaWeeklyView
                  baseDate={baseDate}
                  appointments={visibleAppointments}
                  onAppointmentClick={openManage}
                />
              )}

              {activeView === 'Mes' && (
                <AgendaMonthlyView
                  baseDate={baseDate}
                  appointments={visibleAppointments}
                  onDayClick={(day) => {
                    setBaseDate(day)
                    setActiveView('Dia')
                  }}
                />
              )}

              {activeView === 'Dia' && (
                <AgendaDailyView
                  appointments={visibleAppointments}
                  baseDate={baseDate}
                  canCreateAppointment={canCreateAppointment}
                  onAppointmentClick={openManage}
                  onSlotCreate={(time) => openCreate({ time })}
                />
              )}
            </div>
          </div>
        </section>
      )}

      <DarkModal onClose={closeModal} open={modalOpen} title={editingAppointment ? 'Gerenciar agendamento' : 'Novo agendamento'}>
        <form className="grid gap-4" onSubmit={handleSubmitAppointment}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid content-start gap-4">
              <DarkField label="Paciente">
                <input
                  className="h-10 rounded-md border border-[#404040] bg-[#303030] px-3 text-sm text-[#e5e5e5] outline-none transition placeholder:text-[#737373] focus:border-[#3b82f6]"
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
                ) : selectedPatient ? (
                  <SelectedHint label={getPatientLabel(selectedPatient)} />
                ) : null}
              </DarkField>

              <DarkField label="Profissional">
                {isDoctorScope ? (
                  <input
                    className="h-11 rounded-md border border-[#404040] bg-[#262626] px-3 text-sm text-[#a3a3a3] outline-none"
                    disabled
                    readOnly
                    value={currentProfessional?.name || 'Médico não vinculado'}
                  />
                ) : (
                  <>
                    <input
                      className="h-10 rounded-md border border-[#404040] bg-[#303030] px-3 text-sm text-[#e5e5e5] outline-none transition placeholder:text-[#737373] focus:border-[#3b82f6]"
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
                    ) : selectedProfessional ? (
                      <SelectedHint label={selectedProfessional.name} />
                    ) : null}
                  </>
                )}
              </DarkField>
            </div>

            <div className="grid content-start gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <DarkField label="Dia">
                  <input
                    className="h-11 rounded-md border border-[#404040] bg-[#303030] px-3 text-sm text-[#e5e5e5] outline-none [color-scheme:dark] focus:border-[#3b82f6]"
                    onChange={(event) => {
                      const parsedDate = parseLocalDate(event.target.value)
                      if (parsedDate) setBaseDate(parsedDate)
                    }}
                    type="date"
                    value={formatLocalDateInput(baseDate)}
                  />
                </DarkField>

                <DarkField label="Horário">
              {timeOptions.length ? (
                <select
                  className="h-11 rounded-md border border-[#404040] bg-[#303030] px-3 text-sm text-[#e5e5e5] outline-none focus:border-[#3b82f6]"
                  onChange={(event) => updateForm('time', event.target.value)}
                  value={form.time}
                >
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="h-11 rounded-md border border-[#404040] bg-[#303030] px-3 text-sm text-[#e5e5e5] outline-none focus:border-[#3b82f6]"
                  onChange={(event) => updateForm('time', event.target.value)}
                  type="time"
                  value={form.time}
                />
              )}
              {slotsLoading ? <span className="text-xs font-normal text-[#a3a3a3]">Calculando horários...</span> : null}
              {slotsError ? <span className="text-xs font-normal text-amber-400">{slotsError}</span> : null}
                </DarkField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DarkField label="Formato">
                  <select
                    className="h-11 rounded-md border border-[#404040] bg-[#303030] px-3 text-sm text-[#e5e5e5] outline-none focus:border-[#3b82f6]"
                    onChange={(event) => updateForm('mode', event.target.value)}
                    value={form.mode}
                  >
                    <option>Teleconsulta</option>
                    <option>Presencial</option>
                  </select>
                </DarkField>

                <DarkField label="Status">
                  <select
                    className="h-11 rounded-md border border-[#404040] bg-[#303030] px-3 text-sm text-[#e5e5e5] outline-none focus:border-[#3b82f6]"
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

              <DarkField label="Tipo de consulta">
                <select
                  className="h-11 rounded-md border border-[#404040] bg-[#303030] px-3 text-sm text-[#e5e5e5] outline-none focus:border-[#3b82f6]"
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

              <DarkField label="Observações">
                <textarea
                  className="min-h-24 resize-y rounded-md border border-[#404040] bg-[#303030] px-3 py-2 text-sm leading-5 text-[#e5e5e5] outline-none transition placeholder:text-[#737373] focus:border-[#3b82f6]"
                  onChange={(event) => updateForm('notes', event.target.value)}
                  placeholder="Observações sobre o agendamento"
                  value={form.notes}
                />
              </DarkField>
            </div>
          </div>

          {editingAppointment ? (
            <div className="rounded-xl border border-[#404040] bg-[#1f1f1f] px-4 py-3 text-sm text-[#a3a3a3]">
              <p>
                Agendamento de {selectedPatient ? getPatientLabel(selectedPatient) : 'paciente não informado'} às {form.time}.
              </p>
              <p className="mt-1">Status atual: {form.status}</p>
              <p className="mt-1">Criado por: {editingAppointment.createdByName || editingAppointment.createdBy || 'Usuário não informado'}</p>
              {form.notes ? <p className="mt-1">Observações: {form.notes}</p> : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            {editingAppointment ? (
              <button
                className="mr-auto h-10 rounded-sm border border-red-500/40 bg-red-950/20 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-950/35"
                onClick={handleCancelAppointment}
                type="button"
              >
                Cancelar agendamento
              </button>
            ) : null}
            <button
              className="h-10 rounded-sm border border-[#404040] bg-[#303030] px-4 text-sm font-semibold text-[#e5e5e5] transition hover:bg-[#333333]"
              onClick={closeModal}
              type="button"
            >
              Fechar
            </button>
            <button
              className="h-10 rounded-sm border border-[#3b82f6] bg-[#3b82f6] px-4 text-sm font-semibold text-white transition hover:bg-[#3478ed] disabled:cursor-not-allowed disabled:border-[#404040] disabled:bg-[#303030] disabled:text-[#737373]"
              disabled={!canCreateAppointment}
              type="submit"
            >
              {editingAppointment ? 'Salvar alterações' : 'Salvar'}
            </button>
          </div>
        </form>
      </DarkModal>
    </div>
  )
}

function DarkField({ children, label }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#a3a3a3]">
      <span>{label}</span>
      {children}
    </label>
  )
}

function DarkModal({ children, onClose, open, title }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#404040] bg-[#242424] shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-[#404040] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-sm bg-[#3b82f6] text-white">
              <StethoscopeIcon className="size-5" />
            </span>
            <h2 className="text-lg font-bold text-[#e5e5e5]">{title}</h2>
          </div>
          <button
            aria-label="Fechar"
            className="grid size-8 place-items-center rounded-sm text-xl leading-none text-[#a3a3a3] transition hover:bg-[#303030] hover:text-[#e5e5e5]"
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

function SelectedHint({ label }) {
  return (
    <span className="rounded-md border border-[#404040] bg-[#1f1f1f] px-3 py-2 text-xs font-semibold text-[#a3a3a3]">
      Selecionado: {label}
    </span>
  )
}

function SearchResults({ emptyText, getDescription, getLabel, items, onSelect, selectedId }) {
  return (
    <div className="max-h-44 overflow-y-auto rounded-md border border-[#404040] bg-[#1f1f1f]">
      {items.length ? (
        items.map((item) => {
          const isSelected = String(item.id) === String(selectedId)
          return (
            <button
              className={`block w-full px-3 py-2 text-left text-sm transition ${
                isSelected ? 'bg-[#3b82f6]/20 text-[#e5e5e5]' : 'text-[#a3a3a3] hover:bg-[#303030] hover:text-[#e5e5e5]'
              }`}
              key={item.id}
              onClick={() => onSelect(item)}
              type="button"
            >
              <span className="block font-semibold">{getLabel(item)}</span>
              {getDescription?.(item) ? (
                <span className="mt-0.5 block text-xs text-[#737373]">{getDescription(item)}</span>
              ) : null}
            </button>
          )
        })
      ) : (
        <p className="px-3 py-2 text-xs text-[#737373]">{emptyText}</p>
      )}
    </div>
  )
}

function getPatientLabel(patient) {
  return patient?.name || patient?.full_name || patient?.nome || ''
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
