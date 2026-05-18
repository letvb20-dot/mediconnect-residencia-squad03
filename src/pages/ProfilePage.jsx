import { useEffect, useRef, useState } from 'react'

import { normalizeRole } from '../config/permissions.js'
import { authRepository } from '../repositories/authRepository.js'
import { profileRepository } from '../repositories/profileRepository.js'
import { translateErrorMessage } from '../repositories/repositoryUtils.js'

const cardClass = 'rounded-2xl border border-border-default-v2 bg-surface-card shadow-sm'
const inputClass =
  'h-10 rounded-sm border border-border-default-v2 bg-surface-inset px-3 text-sm text-text-heading outline-none transition placeholder:text-text-muted-v2 focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20'
const readOnlyInputClass =
  'h-10 rounded-sm border border-border-default-v2 bg-surface-inset px-3 text-sm text-text-muted-v2 outline-none'

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
      setAvatarError(translateErrorMessage(err.message, 'Erro ao enviar avatar.'))
    } finally {
      setUploadingAvatar(false)
      event.target.value = ''
    }
  }

  if (loading) {
    return <div className="pt-20 text-center text-text-muted-v2">Localizando dados do perfil...</div>
  }

  const normalizedRole = normalizeRole(profile.role)
  const canEditProfile = !['medico', 'secretaria'].includes(normalizedRole)
  const currentInputClass = canEditProfile ? inputClass : readOnlyInputClass

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-text-heading">Perfil</h1>
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
              <h2 className="text-lg font-bold text-text-heading">{profile.name}</h2>
              <p className="mt-1 text-sm text-text-muted-v2">{profile.role}</p>
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
          <h2 className="text-xl font-bold text-text-heading">Resumo de acesso</h2>
          <dl className="mt-5 grid gap-4 text-sm">
            <Info label="Perfil" value={profile.role} />
            <Info label="E-mail principal" value={profile.email} />
          </dl>
          <div className="mt-8 border-t border-border-default-v2 pt-6">
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
      <span className="text-xs font-semibold text-text-muted-v2">{label}</span>
      {children}
    </label>
  )
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-border-default-v2 bg-surface-inset p-4">
      <dt className="font-semibold text-text-muted-v2">{label}</dt>
      <dd className="mt-1 text-text-heading">{value || '-'}</dd>
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
