import { useEffect, useState } from 'react'

import { StethoscopeIcon } from '../components/Brand.jsx'
import { ADMIN_CREATABLE_ROLES, GESTOR_CREATABLE_ROLES, hasCapability, normalizeRole, ROLE_LABELS } from '../config/permissions.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'
import { userRepository } from '../repositories/userRepository.js'
import { sanitizeFieldValue } from '../utils/inputSanitizers.js'

const darkInput =
  'h-10 w-full rounded-lg border border-border-default-v2 bg-surface-inset px-3 text-sm text-text-heading outline-none transition placeholder:text-text-muted-v2 focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]'
const darkLabel = 'mb-1.5 block text-xs font-medium text-text-heading'
const authMethodOptions = [
  {
    value: 'magic_link',
    label: 'Magic Link',
    description: 'Enviar link de acesso por email',
  },
  {
    value: 'password',
    label: 'Email e senha',
    description: 'Definir senha inicial agora',
  },
]
const BRAZILIAN_UF = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE',
  'TO',
]
const USERS_PER_PAGE = 8
const initialUserForm = {
  email: '',
  full_name: '',
  phone: '',
  cpf: '',
  role: '',
  auth_method: 'magic_link',
  password: '',
  confirm_password: '',
  create_patient_record: false,
  doctorId: '',
  crm: '',
  crm_uf: '',
  specialty: '',
}

export function UsersPage({ embedded = false, embeddedHeaderOnly = false, hideHeader = false, navigate, role: currentRole }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [editingUserId, setEditingUserId] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [form, setForm] = useState(initialUserForm)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('Todos')
  const [userPage, setUserPage] = useState(1)

  const normalizedRole = normalizeRole(currentRole)
  const canManageUsers = hasCapability(normalizedRole, 'manageUsers')
  const creatableRoles = normalizedRole === 'admin' ? ADMIN_CREATABLE_ROLES : GESTOR_CREATABLE_ROLES
  const isPasswordCreation = form.auth_method === 'password'
  const isDoctorForm = normalizeRole(form.role) === 'medico'
  const filterableRoles = normalizedRole === 'admin' ? ADMIN_CREATABLE_ROLES : GESTOR_CREATABLE_ROLES
  const pageSize = embedded ? 5 : USERS_PER_PAGE
  const filteredUsers = users.filter((user) => {
    const query = normalizeSearch(search)
    const matchesSearch =
      !query ||
      [user.full_name, user.name, user.email, user.phone, user.phone_mobile, user.cpf]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(query)
    const matchesRole = roleFilter === 'Todos' || normalizeRole(getUserRole(user)) === roleFilter
    return matchesSearch && matchesRole
  })
  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize))
  const currentUserPage = Math.min(userPage, totalUserPages)
  const visibleUsers = filteredUsers.slice((currentUserPage - 1) * pageSize, currentUserPage * pageSize)

  useEffect(() => {
    if (embeddedHeaderOnly) return
    loadUsers()
  }, [embeddedHeaderOnly])

  useEffect(() => {
    setUserPage(1)
  }, [roleFilter, search])

  async function loadUsers() {
    setLoading(true)
    setError(null)
    try {
      const data = await userRepository.getAll()
      setUsers(data)
    } catch (err) {
      setError(translateErrorMessage(err.message, 'Erro ao carregar usuários.'))
    } finally {
      setLoading(false)
    }
  }

  function handleFormChange(event) {
    const { checked, name, type, value } = event.target
    const nextValue = type === 'checkbox' ? checked : sanitizeFieldValue(name, value)
    setForm((current) => ({ ...current, [name]: nextValue }))
  }

  function openCreateModal() {
    setEditingUserId(null)
    setForm(initialUserForm)
    setModalOpen(true)
  }

  function openEditModal(user) {
    setSelectedUser(null)
    setEditingUserId(user.id)
    setForm({
      ...initialUserForm,
      email: user.email || '',
      full_name: user.full_name || user.name || '',
      phone: user.phone || user.phone_mobile || '',
      cpf: user.cpf || '',
      role: normalizeRole(getUserRole(user)) || '',
      doctorId: user.doctorId || user.doctor_id || '',
      crm: user.crm || '',
      crm_uf: user.crm_uf || user.crmUf || '',
      specialty: user.specialty || user.specialidade || '',
    })
    setModalOpen(true)
  }

  async function handleCreate(event) {
    event.preventDefault()
    if (!canManageUsers) {
      window.alert('Você não tem permissão para criar usuários.')
      return
    }

    if (!form.email || !form.full_name || !form.phone || !form.cpf || !form.role) {
      window.alert('Preencha email, nome completo, celular, CPF e perfil.')
      return
    }

    if (isDoctorForm && (!form.crm || !form.crm_uf)) {
      window.alert('CRM e CRM UF são obrigatórios para usuários médicos.')
      return
    }

    if (!editingUserId && isPasswordCreation) {
      if (!form.password || !form.confirm_password) {
        window.alert('Preencha a senha e a confirmação de senha.')
        return
      }

      if (form.password.length < 6) {
        window.alert('A senha deve ter pelo menos 6 caracteres.')
        return
      }

      if (form.password !== form.confirm_password) {
        window.alert('A confirmação de senha não confere.')
        return
      }
    }

    setSaving(true)
    try {
      if (editingUserId) {
        const updatedUser = await userRepository.update(editingUserId, form)
        setUsers((current) => current.map((user) => (user.id === editingUserId ? { ...user, ...form, ...updatedUser } : user)))
        window.alert(`Usuário atualizado: ${form.email}.`)
      } else if (isPasswordCreation) {
        await userRepository.createWithPassword(form)
        window.alert(`Usuário criado com email e senha para ${form.email}.`)
      } else {
        await userRepository.create(form)
        window.alert(`Usuário criado! Magic Link enviado para ${form.email}.`)
      }
      setModalOpen(false)
      setEditingUserId(null)
      setForm(initialUserForm)
      if (!editingUserId) loadUsers()
    } catch (err) {
      window.alert(`Erro ao salvar usuário: ${translateErrorMessage(err.message, 'Erro ao salvar usuário.')}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(user) {
    if (!canManageUsers) {
      window.alert('Você não tem permissão para deletar usuários.')
      return
    }

    const confirmed = window.confirm(
      `ATENÇÃO: Esta operação é IRREVERSÍVEL!\n\nO usuário "${user.full_name || user.email}" e TODOS os dados relacionados (perfil, agendamentos, registros) serão deletados permanentemente.\n\nDeseja continuar?`
    )
    if (!confirmed) return

    setDeletingId(user.id)
    try {
      await userRepository.remove(user.id)
      setUsers((current) => current.filter((u) => u.id !== user.id))
    } catch (err) {
      window.alert(`Erro ao deletar usuário: ${translateErrorMessage(err.message, 'Erro ao deletar usuário.')}`)
    } finally {
      setDeletingId(null)
    }
  }

  if (!canManageUsers) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-border-default-v2 bg-surface-card p-8 text-center text-text-heading">
        <h1 className="text-xl font-bold">Acesso não permitido</h1>
        <p className="mt-2 text-sm text-text-muted-v2">Somente Administrador e Gestão podem gerenciar usuários.</p>
      </div>
    )
  }

  if (embeddedHeaderOnly) {
    return (
      <div>
        <h1 className="text-lg font-bold tracking-tight text-text-heading">Usuários do Sistema</h1>
        <p className="mt-1 text-sm text-text-muted-v2">Gerencie os usuários e seus perfis de acesso</p>
      </div>
    )
  }

  return (
    <div className={`${embedded ? 'w-full space-y-4' : 'mx-auto max-w-7xl space-y-6'} text-text-heading`}>
      {!hideHeader ? <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className={`${embedded ? 'text-lg' : 'text-2xl'} font-bold tracking-tight text-text-heading`}>Usuários do Sistema</h1>
          <p className="mt-1 text-sm text-text-muted-v2">Gerencie os usuários e seus perfis de acesso</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {embedded && navigate ? (
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border-default-v2 bg-surface-card-hover px-4 text-sm font-medium text-text-heading shadow-sm transition hover:bg-surface-elevated sm:w-auto"
              onClick={() => navigate('/usuarios')}
              type="button"
            >
              Ver usuários
            </button>
          ) : null}
          <button
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#3b82f6] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[#2563eb] sm:w-auto"
            onClick={openCreateModal}
            type="button"
          >
            + Novo usuário
          </button>
        </div>
      </div> : null}

      {loading ? (
        <p className="py-10 text-center text-sm text-text-muted-v2">Carregando usuários...</p>
      ) : error ? (
        <p className="py-10 text-center text-sm text-red-400">Erro ao carregar usuários: {error}</p>
      ) : (
        <div className="rounded-2xl border border-border-default-v2 bg-surface-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border-default-v2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-text-heading">Filtros</p>
              <p className="mt-1 text-xs text-text-muted-v2">
                {filteredUsers.length} de {users.length} usuários exibidos
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.6fr)]">
            <label className="grid gap-1.5 text-xs font-semibold text-text-muted-v2">
              <span>Pesquisa</span>
              <input
                className={darkInput}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome, email, telefone ou CPF"
                type="search"
                value={search}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-text-muted-v2">
              <span>Perfil</span>
              <select
                className={darkInput}
                onChange={(event) => setRoleFilter(event.target.value)}
                value={roleFilter}
              >
                <option value="Todos">Todos os perfis</option>
                {filterableRoles.map((role) => (
                  <option key={`filter-role-${role}`} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="bg-surface-page text-xs font-semibold uppercase text-text-muted-v2">
                <tr>
                  <th className="px-6 py-4">Nome</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Perfil</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default-v2">
                {filteredUsers.length ? (
                  visibleUsers.map((user) => {
                    const userRole = getNormalizedUserRole(user)
                    const userStatus = getUserStatus(user)
                    return (
                      <tr className="cursor-pointer transition hover:bg-surface-card-hover" key={user.id} onClick={() => setSelectedUser(user)}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="grid size-8 place-items-center rounded-full bg-accent-muted text-xs font-bold text-accent-primary">
                              {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
                            </span>
                            <span className="font-medium text-text-heading">{user.full_name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-text-muted-v2">{user.email}</td>
                        <td className="px-6 py-4">
                          <RoleBadge role={userRole} />
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${userStatus.className}`}>
                            {userStatus.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            className="rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-1.5 text-xs font-semibold text-[#ef4444] transition hover:bg-[#ef4444]/20 disabled:opacity-50"
                            disabled={deletingId === user.id}
                            onClick={(event) => {
                              event.stopPropagation()
                              handleDelete(user)
                            }}
                            type="button"
                          >
                            {deletingId === user.id ? 'Deletando...' : 'Deletar'}
                          </button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td className="px-6 py-10 text-center text-text-muted-v2" colSpan={5}>
                      {users.length ? 'Nenhum usuário encontrado para o perfil selecionado.' : 'Nenhum usuário encontrado.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredUsers.length > pageSize ? (
            <div className="flex items-center justify-between gap-3 border-t border-border-default-v2 px-6 py-4 text-xs text-text-muted-v2">
              <span>Página {currentUserPage} de {totalUserPages}</span>
              <div className="flex gap-2">
                <button
                  className="h-8 rounded border border-border-default-v2 bg-surface-card-hover px-3 font-semibold text-text-heading disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={currentUserPage <= 1}
                  onClick={() => setUserPage((page) => Math.max(1, page - 1))}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="h-8 rounded border border-border-default-v2 bg-surface-card-hover px-3 font-semibold text-text-heading disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={currentUserPage >= totalUserPages}
                  onClick={() => setUserPage((page) => Math.min(totalUserPages, page + 1))}
                  type="button"
                >
                  Próxima
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {selectedUser ? (
        <UserDetailModal
          onClose={() => setSelectedUser(null)}
          onDelete={handleDelete}
          onEdit={openEditModal}
          user={selectedUser}
        />
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setModalOpen(false)}>
          <div
            className="user-modal-shell flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border-default-v2 bg-surface-card shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-default-v2 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-sm bg-[#3b82f6] text-white">
                  <StethoscopeIcon className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-text-heading">{editingUserId ? 'Editar Usuário' : 'Novo Usuário'}</h2>
                  <p className="mt-1 text-xs text-text-muted-v2">
                    {editingUserId ? 'Atualize os dados e permissões do usuário.' : isPasswordCreation ? 'Crie o acesso inicial com email e senha.' : 'Um Magic Link sera enviado para o email cadastrado.'}
                  </p>
                </div>
              </div>
              <button
                className="rounded p-1 text-text-muted-v2 transition hover:bg-surface-card-hover"
                onClick={() => setModalOpen(false)}
                type="button"
              >
                ✕
              </button>
            </div>

            <form className="min-h-0 space-y-5 overflow-y-auto p-6" onSubmit={handleCreate}>
              {!editingUserId ? (
              <div>
                <span className={darkLabel}>Criar usuário usando *</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {authMethodOptions.map((option) => {
                    const selected = form.auth_method === option.value
                    return (
                      <label
                        className={`cursor-pointer rounded-lg border p-3 transition ${
                          selected
                            ? 'border-[#3b82f6] bg-[#3b82f6]/15 text-text-heading'
                            : 'border-border-default-v2 bg-surface-inset text-text-muted-v2 hover:border-border-strong hover:text-text-heading'
                        }`}
                        key={option.value}
                      >
                        <span className="flex items-start gap-3">
                          <input
                            checked={selected}
                            className="mt-1 size-4 accent-[#3b82f6]"
                            name="auth_method"
                            onChange={handleFormChange}
                            type="radio"
                            value={option.value}
                          />
                          <span>
                            <span className="block text-sm font-semibold">{option.label}</span>
                            <span className="mt-1 block text-xs text-text-muted-v2">{option.description}</span>
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
              ) : null}

              <div>
                <label className={darkLabel}>Nome completo *</label>
                <input
                  className={darkInput}
                  name="full_name"
                  onChange={handleFormChange}
                  placeholder="Ex: João da Silva"
                  required
                  value={form.full_name}
                />
              </div>

              <div>
                <label className={darkLabel}>Email *</label>
                <input
                  className={darkInput}
                  name="email"
                  onChange={handleFormChange}
                  placeholder="email@exemplo.com"
                  required
                  type="email"
                  value={form.email}
                />
              </div>

              <div>
                <label className={darkLabel}>Celular *</label>
                <input
                  className={darkInput}
                  maxLength={15}
                  name="phone"
                  onChange={handleFormChange}
                  placeholder="(00) 00000-0000"
                  required
                  value={form.phone}
                />
              </div>

              <div>
                <label className={darkLabel}>CPF *</label>
                <input
                  className={darkInput}
                  maxLength={14}
                  name="cpf"
                  onChange={handleFormChange}
                  placeholder="000.000.000-00"
                  required
                  value={form.cpf}
                />
              </div>

              {isPasswordCreation ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={darkLabel}>Senha *</label>
                    <input
                      autoComplete="new-password"
                      className={darkInput}
                      minLength={6}
                      name="password"
                      onChange={handleFormChange}
                      placeholder="Mínimo 6 caracteres"
                      required={isPasswordCreation}
                      type="password"
                      value={form.password}
                    />
                  </div>
                  <div>
                    <label className={darkLabel}>Confirmar senha *</label>
                    <input
                      autoComplete="new-password"
                      className={darkInput}
                      minLength={6}
                      name="confirm_password"
                      onChange={handleFormChange}
                      placeholder="Repita a senha"
                      required={isPasswordCreation}
                      type="password"
                      value={form.confirm_password}
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <label className={darkLabel}>Perfil de acesso *</label>
                <select
                  className={darkInput}
                  name="role"
                  onChange={handleFormChange}
                  required
                  value={form.role}
                >
                  <option value="">Selecione um perfil</option>
                  {creatableRoles.map((r) => (
                    <option key={`role-option-${r}`} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              {isDoctorForm ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={darkLabel}>CRM *</label>
                    <input
                      className={darkInput}
                      name="crm"
                      onChange={handleFormChange}
                      placeholder="Ex: 123456"
                      required={isDoctorForm}
                      value={form.crm}
                    />
                  </div>
                  <div>
                    <label className={darkLabel}>CRM UF *</label>
                    <select
                      className={darkInput}
                      name="crm_uf"
                      onChange={handleFormChange}
                      required={isDoctorForm}
                      value={form.crm_uf}
                    >
                      <option value="">Selecione</option>
                      {BRAZILIAN_UF.map((uf) => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={darkLabel}>Especialidade</label>
                    <input
                      className={darkInput}
                      name="specialty"
                      onChange={handleFormChange}
                      placeholder="Ex: Cardiologia"
                      value={form.specialty}
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-3 border-t border-border-default-v2 pt-4">
                <button
                  className="rounded-lg border border-border-default-v2 bg-surface-inset px-4 py-2 text-sm font-medium text-text-heading transition hover:bg-surface-card-hover"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2563eb] disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? 'Salvando...' : editingUserId ? 'Salvar alterações' : isPasswordCreation ? 'Criar com senha' : 'Criar e enviar Magic Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function UserDetailModal({ onClose, onDelete, onEdit, user }) {
  const userRole = normalizeRole(getUserRole(user)) || getUserRole(user)
  const userStatus = getUserStatus(user)
  const details = [
    ['Nome', user.full_name || user.name || 'Não informado'],
    ['Email', user.email || 'Não informado'],
    ['Celular', user.phone || user.phone_mobile || 'Não informado'],
    ['CPF', user.cpf || 'Não informado'],
    ['Perfil', ROLE_LABELS[userRole] || userRole || 'Não informado'],
    ['Status', userStatus.label],
  ]

  if (userRole === 'medico') {
    details.push(['CRM', user.crm || 'Não informado'])
    details.push(['CRM UF', user.crm_uf || user.crmUf || 'Não informado'])
    details.push(['Especialidade', user.specialty || user.specialidade || 'Não informado'])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="user-modal-shell w-full max-w-3xl rounded-xl border border-border-default-v2 bg-surface-card shadow-elevated"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-default-v2 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-text-heading">Detalhes do usuário</h2>
            <p className="mt-1 text-xs text-text-muted-v2">{user.email}</p>
          </div>
          <button className="rounded p-1 text-text-muted-v2 transition hover:bg-surface-card-hover" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          {details.map(([label, value]) => (
            <div className="rounded-xl border border-border-default-v2 bg-surface-inset p-4" key={label}>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted-v2">{label}</p>
              <p className="mt-2 text-sm font-semibold text-text-heading">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-border-default-v2 px-6 py-4">
          <button
            className="mr-auto rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-2 text-sm font-semibold text-[#ef4444] transition hover:bg-[#ef4444]/20"
            onClick={() => onDelete(user)}
            type="button"
          >
            Deletar
          </button>
          <button
            className="rounded-lg border border-border-default-v2 bg-surface-inset px-4 py-2 text-sm font-semibold text-text-heading transition hover:bg-surface-card-hover"
            onClick={onClose}
            type="button"
          >
            Fechar
          </button>
          <button
            className="rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
            onClick={() => onEdit(user)}
            type="button"
          >
            Editar
          </button>
        </div>
      </div>
    </div>
  )
}

function RoleBadge({ role }) {
  const styles = {
    admin: 'bg-purple-500/20 text-purple-400',
    gestor: 'bg-blue-500/20 text-blue-400',
    medico: 'bg-emerald-500/20 text-emerald-400',
    secretaria: 'bg-amber-500/20 text-amber-400',
    paciente: 'bg-surface-card-hover text-text-muted-v2',
  }

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[role] || styles.paciente}`}>
      {ROLE_LABELS[role] || 'Sem perfil'}
    </span>
  )
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function getNormalizedUserRole(user) {
  return normalizeRole(getUserRole(user)) || ''
}

function getUserStatus(user) {
  const status = String(user.status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  if (status === 'blocked') {
    return { label: 'Bloqueado', className: 'bg-red-500/20 text-red-400' }
  }

  if (status === 'pending') {
    return { label: 'Pendente', className: 'bg-amber-500/20 text-amber-400' }
  }

  return { label: 'Ativo', className: 'bg-emerald-500/20 text-emerald-400' }
}

function getUserRole(user) {
  return Array.isArray(user.roles) ? user.roles[0] : (user.role ?? '—')
}
