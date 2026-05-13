import { useEffect, useRef, useState } from 'react'

import { normalizeRole } from '../config/permissions.js'
import { authRepository } from '../repositories/authRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'

const cardClass = 'rounded-2xl border border-[#404040] bg-[#262626] shadow-sm'
const inputClass =
  'h-10 rounded-sm border border-[#404040] bg-[#171717] px-3 text-sm text-[#e5e5e5] outline-none transition placeholder:text-[#a3a3a3] focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20'
const readOnlyInputClass =
  'h-10 rounded-sm border border-[#404040] bg-[#1f1f1f] px-3 text-sm text-[#a3a3a3] outline-none'

export function ProfilePage({ navigate }) {
  const [saved, setSaved] = useState(false)
  const [profile, setProfile] = useState({ name: '', role: '', email: '', phone: '', unit: '', avatarUrl: '' })
  const [loading, setLoading] = useState(true)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    profileRepository
      .getCurrentUserProfile()
      .then((data) => {
        setProfile(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function update(field, value) {
    setSaved(false)
    setProfile((current) => ({ ...current, [field]: value }))
  }

  async function handleLogout() {
    await authRepository.logout()
    navigate('/login')
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    setAvatarError('')

    try {
      const result = await profileRepository.updateAvatar(file)
      setProfile((current) => ({
        ...current,
        avatarUrl: result.avatarUrl || URL.createObjectURL(file),
      }))
    } catch (err) {
      setAvatarError(err.message || 'Erro ao enviar avatar.')
    } finally {
      setUploadingAvatar(false)
      event.target.value = ''
    }
  }

  if (loading) {
    return <div className="pt-20 text-center text-[#a3a3a3]">Localizando dados do perfil...</div>
  }

  const normalizedRole = normalizeRole(profile.role)
  const canEditProfile = !['medico', 'secretaria'].includes(normalizedRole)
  const currentInputClass = canEditProfile ? inputClass : readOnlyInputClass

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[#f5f5f5]">Perfil</h1>
        <p className="mt-1 text-sm text-[#b8b8b8]">Dados do usuário logado e preferências básicas do shell.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className={`${cardClass} p-6`}>
          <div className="mb-6 flex items-center gap-4">
            {profile.avatarUrl ? (
              <img alt="" className="size-16 rounded-full border border-[#3b82f6]/30 object-cover" src={profile.avatarUrl} />
            ) : (
              <div className="grid size-16 place-items-center rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/10 text-xl font-bold text-[#3b82f6]">
                {initials(profile.name)}
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-[#f5f5f5]">{profile.name}</h2>
              <p className="mt-1 text-sm text-[#a3a3a3]">{profile.role}</p>
              <button
                className="mt-1 text-xs font-semibold text-[#3b82f6] disabled:opacity-60"
                disabled={uploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                {uploadingAvatar ? 'Enviando...' : 'Alterar foto'}
              </button>
              <input
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
                ref={fileInputRef}
                type="file"
              />
              {avatarError ? <p className="mt-1 text-xs font-semibold text-red-400">{avatarError}</p> : null}
            </div>
          </div>

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (canEditProfile) setSaved(true)
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome">
                <input className={currentInputClass} onChange={(event) => update('name', event.target.value)} readOnly={!canEditProfile} value={profile.name} />
              </Field>
              <Field label="Cargo">
                <input className={currentInputClass} onChange={(event) => update('role', event.target.value)} readOnly={!canEditProfile} value={profile.role} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="E-mail">
                <input className={currentInputClass} onChange={(event) => update('email', event.target.value)} readOnly={!canEditProfile} type="email" value={profile.email} />
              </Field>
              <Field label="Telefone">
                <input className={currentInputClass} onChange={(event) => update('phone', event.target.value)} readOnly={!canEditProfile} value={profile.phone} />
              </Field>
            </div>
            <Field label="Unidade padrão">
              {canEditProfile ? (
                <select className={inputClass} onChange={(event) => update('unit', event.target.value)} value={profile.unit}>
                  <option>Clínica Boa Vista</option>
                  <option>Unidade Centro</option>
                  <option>Unidade Sul</option>
                </select>
              ) : (
                <input className={readOnlyInputClass} readOnly value={profile.unit} />
              )}
            </Field>
            {canEditProfile ? (
              <div className="flex flex-wrap items-center gap-3">
                <button className="h-10 rounded-sm bg-[#3b82f6] px-4 text-sm font-semibold text-white" type="submit">
                  Salvar alterações
                </button>
                {saved ? <span className="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300">Preferências salvas localmente</span> : null}
              </div>
            ) : null}
          </form>
        </section>

        <aside className={`${cardClass} p-6`}>
          <h2 className="text-xl font-bold text-[#f5f5f5]">Resumo de acesso</h2>
          <dl className="mt-5 grid gap-4 text-sm">
            <Info label="Perfil" value={profile.role} />
            <Info label="E-mail principal" value={profile.email} />
            <Info label="Permissões" value="Agenda, pacientes, comunicação e configurações" />
          </dl>
          <div className="mt-8 border-t border-[#404040] pt-6">
            <button
              className="h-10 w-full rounded-sm border border-red-500/30 text-sm font-semibold text-red-500 transition hover:bg-red-500/10"
              onClick={handleLogout}
              type="button"
            >
              Sair da conta
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Field({ children, label }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold text-[#a3a3a3]">{label}</span>
      {children}
    </label>
  )
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-[#404040] bg-[#171717] p-4">
      <dt className="font-semibold text-[#a3a3a3]">{label}</dt>
      <dd className="mt-1 text-[#e5e5e5]">{value || '-'}</dd>
    </div>
  )
}

function initials(name) {
  return String(name || 'US')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
