import { useState } from 'react'

import { authRepository } from '../repositories/authRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { maskBrazilianPhone, maskCpf } from '../utils/inputSanitizers.js'

import { BrandLogo } from '../components/Brand.jsx'
import loginClinicImage from '../assets/figma/login-clinic.png'

export function LoginPage({ navigate }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      await authRepository.login(form)
      navigate('/inicio')
    } catch (err) {
      setError(err.message || 'Erro de autenticação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-dark min-h-screen text-white">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative hidden min-h-screen overflow-hidden lg:block">
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            src={loginClinicImage}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(126.72deg, rgba(10, 10, 10, 0.92) 0%, rgba(23, 23, 23, 0.72) 52%, rgba(59, 130, 246, 0.28) 100%)',
            }}
          />

          <div className="relative flex min-h-screen flex-col justify-between px-[43px] py-[43px] xl:px-12 xl:py-12">
            <LoginLogo />

            <div className="max-w-[488px] pb-0">
              <h1 className="text-[32px] font-bold leading-[40px] tracking-[-0.02em] xl:text-4xl xl:leading-[45px]">
                Gestão clínica
                <br />
                <span className="text-[#3b82f6]">inteligente</span> com IA
                <br />
                preditiva.
              </h1>
              <p className="mt-5 max-w-[352px] text-sm leading-[23px] text-white/60 xl:text-base xl:leading-[26px]">
                Reduza o absenteísmo, organize sua agenda e melhore a experiência dos seus pacientes.
              </p>

              <dl className="mt-[38px] flex flex-wrap gap-8">
                <LoginMetric label="Acurácia IA" value="87%" />
                <LoginMetric label="Absenteísmo" value="↓42%" />
                <LoginMetric label="Clínicas" value="+2.8k" />
              </dl>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-[60px] xl:px-[68px]">
          <div className="w-full max-w-[448px] lg:translate-y-3">
            <div className="mb-12 lg:hidden">
              <LoginLogo />
            </div>

            <div>
              <h2 className="text-[30px] font-bold leading-9 text-white">Entrar</h2>
              <p className="mt-1 text-sm leading-5 text-white/40">
                Bem-vindo(a) de volta! Acesse sua conta.
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded bg-red-500/10 p-3 text-sm font-semibold text-red-500 border border-red-500/20">
                {error}
              </div>
            )}

            <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
              <LoginField htmlFor="login-email" label="E-mail">
                <input
                  autoComplete="email"
                  className={authInputClass}
                  id="login-email"
                  onChange={(event) => updateField('email', event.target.value)}
                  placeholder="seu@email.com"
                  type="email"
                  value={form.email}
                />
              </LoginField>

              <LoginField
                action={
                  <button
                    className="text-xs font-medium leading-4 text-[#3b82f6] transition hover:text-[#66a3ff]"
                    onClick={() => navigate('/recuperar-senha')}
                    type="button"
                  >
                    Esqueceu a senha?
                  </button>
                }
                htmlFor="login-password"
                label="Senha"
              >
                <div className="relative">
                  <input
                    autoComplete="current-password"
                    className={authPasswordInputClass}
                    id="login-password"
                    onChange={(event) => updateField('password', event.target.value)}
                    placeholder="••••••••"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                  />
                  <button
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 grid size-5 -translate-y-1/2 place-items-center text-white/30 transition hover:text-white/60"
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    <EyeIcon />
                  </button>
                </div>
              </LoginField>

              <button
                className="inline-flex h-11 w-full items-center justify-center rounded-[6px] border border-[#3b82f6] bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_15px_rgba(59,130,246,0.2),0_4px_6px_rgba(59,130,246,0.2)] transition hover:bg-[#3478ed] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6] disabled:opacity-50"
                disabled={loading}
                type="submit"
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}

export function RegisterPage({ navigate }) {
  const [form, setForm] = useState({
    birth_date: '',
    confirm_password: '',
    cpf: '',
    email: '',
    full_name: '',
    password: '',
    phone_mobile: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function updateField(field, value) {
    const nextValue =
      field === 'cpf'
        ? maskCpf(value)
        : field === 'phone_mobile'
          ? maskBrazilianPhone(value)
          : value

    setForm((current) => ({ ...current, [field]: nextValue }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (form.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (form.password !== form.confirm_password) {
      setError('A confirmação de senha não confere.')
      return
    }

    setLoading(true)
    try {
      await patientRepository.registerWithPassword(form)
      window.alert('Cadastro realizado. Você já pode fazer login.')
      navigate('/login')
    } catch (err) {
      setError(err.message || 'Erro ao realizar cadastro.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      description="Crie seu acesso de paciente com CPF, celular e senha."
      title="Cadastro de paciente"
    >
      {error ? (
        <div className="mt-4 rounded bg-red-500/10 p-3 text-sm font-semibold text-red-500 border border-red-500/20">
          {error}
        </div>
      ) : null}
      <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
        <AuthField label="Nome completo">
          <input
            autoComplete="name"
            className={authInputClass}
            onChange={(event) => updateField('full_name', event.target.value)}
            required
            value={form.full_name}
          />
        </AuthField>
        <AuthField label="E-mail">
          <input
            autoComplete="email"
            className={authInputClass}
            onChange={(event) => updateField('email', event.target.value)}
            required
            type="email"
            value={form.email}
          />
        </AuthField>
        <div className="grid gap-5 sm:grid-cols-2">
          <AuthField label="CPF">
            <input
              autoComplete="off"
              className={authInputClass}
              maxLength={14}
              onChange={(event) => updateField('cpf', event.target.value)}
              required
              value={form.cpf}
            />
          </AuthField>
          <AuthField label="Celular">
            <input
              autoComplete="tel"
              className={authInputClass}
              maxLength={15}
              onChange={(event) => updateField('phone_mobile', event.target.value)}
              required
              value={form.phone_mobile}
            />
          </AuthField>
        </div>
        <AuthField label="Data de nascimento">
          <input
            className={`${authInputClass} [color-scheme:dark]`}
            onChange={(event) => updateField('birth_date', event.target.value)}
            type="date"
            value={form.birth_date}
          />
        </AuthField>
        <div className="grid gap-5 sm:grid-cols-2">
          <AuthField label="Senha">
            <input
              autoComplete="new-password"
              className={authInputClass}
              minLength={6}
              onChange={(event) => updateField('password', event.target.value)}
              required
              type="password"
              value={form.password}
            />
          </AuthField>
          <AuthField label="Confirmar senha">
            <input
              autoComplete="new-password"
              className={authInputClass}
              minLength={6}
              onChange={(event) => updateField('confirm_password', event.target.value)}
              required
              type="password"
              value={form.confirm_password}
            />
          </AuthField>
        </div>
        <button
          className="inline-flex h-11 w-full items-center justify-center rounded-[6px] bg-[#3b82f6] text-sm font-semibold text-white shadow-[0_10px_15px_rgba(59,130,246,0.2)] transition hover:bg-[#3478ed] disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? 'Cadastrando...' : 'Cadastrar'}
        </button>
      </form>
      <button className="mt-5 text-sm font-semibold text-[#3b82f6]" onClick={() => navigate('/login')} type="button">
        Voltar para login
      </button>
    </AuthLayout>
  )
}

export function ForgotPasswordPage({ navigate }) {
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await authRepository.requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err.message || 'Erro ao comunicar com o servidor.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      description="Informe o e-mail cadastrado para receber o link de acesso."
      title="Recuperar senha"
    >
      {sent ? (
        <div className="mt-8 rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-300">
          Link de recuperação enviado para o e-mail informado. Siga as instruções do link!
        </div>
      ) : (
        <form
          className="mt-8 grid gap-5"
          onSubmit={handleSubmit}
        >
          {error && (
            <div className="rounded bg-red-500/10 p-3 text-sm font-semibold text-red-500 border border-red-500/20">
              {error}
            </div>
          )}
          <AuthField label="E-mail cadastrado">
            <input autoComplete="email" className={authInputClass} onChange={e => setEmail(e.target.value)} value={email} type="email" />
          </AuthField>
          <button 
            className="inline-flex h-11 w-full items-center justify-center rounded-[6px] bg-[#3b82f6] text-sm font-semibold text-white shadow-[0_10px_15px_rgba(59,130,246,0.2)] transition hover:bg-[#3478ed] disabled:opacity-50" 
            disabled={loading}
            type="submit"
          >
            {loading ? "Enviando..." : "Enviar link"}
          </button>
        </form>
      )}
      <button className="mt-5 text-sm font-semibold text-[#3b82f6]" onClick={() => navigate('/login')} type="button">
        Voltar para login
      </button>
    </AuthLayout>
  )
}

function AuthLayout({ children, description, title }) {
  return (
    <main className="auth-dark min-h-screen text-white">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative hidden min-h-screen overflow-hidden lg:block">
          <img alt="" className="absolute inset-0 h-full w-full object-cover" src={loginClinicImage} />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(126.72deg, rgba(10, 10, 10, 0.92) 0%, rgba(23, 23, 23, 0.72) 52%, rgba(59, 130, 246, 0.28) 100%)',
            }}
          />
          <div className="relative flex min-h-screen flex-col justify-between px-[43px] py-[43px] xl:px-12 xl:py-12">
            <LoginLogo />
            <div className="max-w-[488px]">
              <h1 className="text-[32px] font-bold leading-[40px] tracking-[-0.02em] xl:text-4xl xl:leading-[45px]">
                Cuidado conectado
                <br />
                para equipes de
                <br />
                <span className="text-[#3b82f6]">saúde.</span>
              </h1>
              <p className="mt-5 max-w-[360px] text-sm leading-[23px] text-white/60 xl:text-base xl:leading-[26px]">
                Segurança e continuidade para equipes de saúde.
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-[60px] xl:px-[68px]">
          <div className="w-full max-w-[448px] lg:translate-y-3">
            <div className="mb-12 lg:hidden">
              <LoginLogo />
            </div>
            <h2 className="text-[30px] font-bold leading-9 text-white">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-white/40">{description}</p>
            {children}
          </div>
        </section>
      </div>
    </main>
  )
}

const authInputClass =
  'auth-input h-11 w-full rounded-[6px] border px-4 text-sm outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20'
const authPasswordInputClass =
  'auth-input h-11 w-full rounded-[6px] border py-2 pl-4 pr-11 text-sm outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20'

function AuthField({ children, label }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium leading-4 text-[#a3a3a3]">
      <span>{label}</span>
      {children}
    </label>
  )
}

function LoginField({ action, children, htmlFor, label }) {
  return (
    <div className="grid gap-1.5">
      <span className="flex min-h-4 items-center justify-between gap-4 text-xs font-medium leading-4 text-[#a3a3a3]">
        <label htmlFor={htmlFor}>{label}</label>
        {action}
      </span>
      {children}
    </div>
  )
}

function LoginLogo() {
  return (
    <BrandLogo />
  )
}

function LoginMetric({ label, value }) {
  return (
    <div>
      <dt className="text-[21px] font-bold leading-7 text-[#3b82f6] xl:text-2xl xl:leading-8">{value}</dt>
      <dd className="mt-0.5 text-[11px] leading-4 text-white/50 xl:text-xs">{label}</dd>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 16 16">
      <path
        d="M1.375 8.23c-.06-.16-.06-.34 0-.5a7.16 7.16 0 0 1 13.25 0c.06.16.06.34 0 .5a7.16 7.16 0 0 1-13.25 0Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33"
      />
      <path
        d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33"
      />
    </svg>
  )
}
