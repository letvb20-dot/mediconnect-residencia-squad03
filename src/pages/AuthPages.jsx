import { useState } from 'react'

import { authRepository } from '../repositories/authRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { maskBrazilianPhone, maskCpf } from '../utils/inputSanitizers.js'

import { StethoscopeIcon } from '../components/Brand.jsx'

// ─── Estilos ────────────────────────────────────────────────────────────────

const dotPanelStyle = {
  backgroundColor: '#02070f',
  backgroundImage:
    'radial-gradient(rgba(147,197,253,0.14) 1px, transparent 1px), linear-gradient(105deg, #030406 0%, #071326 42%, #0d2454 100%)',
  backgroundSize: '32px 32px, auto',
}

const lightInputClass =
  'h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'

const lightPasswordInputClass =
  'h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-11 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'

const lightInputSimpleClass =
  'h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'

// ─── Página de Login ─────────────────────────────────────────────────────────

export function LoginPage({ navigate }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
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
    <main className="min-h-screen bg-[#f4f7fb]">
      <div className="grid min-h-screen lg:grid-cols-2">

        {/* Painel esquerdo (dark navy + dots) */}
        <section
          className="relative hidden min-h-screen overflow-hidden lg:flex lg:flex-col"
          style={dotPanelStyle}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 h-[480px] w-[480px]"
            style={{
              background:
                'radial-gradient(ellipse at top right, rgba(59,130,246,0.22) 0%, transparent 65%)',
            }}
          />

          <div className="relative flex flex-1 flex-col justify-between px-12 py-10">
            <RightLogo dark />

            <div className="max-w-[440px]">
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80">
                <span className="text-[#3b82f6]">✦</span>
                Inteligência Artificial para sua clínica
              </div>

              <h1 className="text-[34px] font-bold leading-[1.22] tracking-tight text-white">
                A gestão da sua clínica,
                <br />
                potencializada por IA.
              </h1>

              <p className="mt-4 max-w-[390px] text-sm leading-6 text-white/55">
                Agendamentos inteligentes, prontuários assistidos e insights em tempo real.
                Tudo em uma única plataforma pensada para profissionais de saúde.
              </p>

              <ul className="mt-8 flex flex-col gap-4">
                <LeftFeature icon={<ActivityIcon />} text="Prontuário eletrônico com sugestões automáticas" />
                <LeftFeature icon={<SparkleIcon />}  text="Análises preditivas e relatórios em segundos" />
                <LeftFeature icon={<ShieldIcon />}   text="Conformidade LGPD e dados criptografados" />
              </ul>
            </div>

            <div className="flex items-center justify-between text-xs text-white/30">
              <span>© 2026 Mediconnect</span>
              <div className="flex gap-5">
                {['Privacidade', 'Termos', 'Suporte'].map((label) => (
                  <button key={label} className="transition hover:text-white/60" type="button">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Painel direito */}
        <section className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-6 py-12 sm:px-10 lg:px-16">
          <div className="w-full max-w-[448px]">

            <RightLogo />

            <h2 className="mt-8 text-[28px] font-bold leading-tight text-gray-900">
              Bem-vindo de volta
            </h2>
            <p className="mt-1.5 text-sm text-gray-500">
              Acesse sua conta para continuar gerenciando sua clínica.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">
                {error}
              </div>
            )}

            <form className="mt-7 grid gap-5" onSubmit={handleSubmit}>

              <LightField htmlFor="login-email" label="E-mail">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <MailIcon />
                  </span>
                  <input
                    autoComplete="email"
                    className={lightInputClass}
                    id="login-email"
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="seu@email.com"
                    required
                    type="email"
                    value={form.email}
                  />
                </div>
              </LightField>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700" htmlFor="login-password">
                    Senha
                  </label>
                  <button
                    className="text-sm text-[#3b82f6] transition hover:text-blue-700"
                    onClick={() => navigate('/recuperar-senha')}
                    type="button"
                  >
                    Esqueceu?
                  </button>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <LockIcon />
                  </span>
                  <input
                    autoComplete="current-password"
                    className={lightPasswordInputClass}
                    id="login-password"
                    onChange={(e) => updateField('password', e.target.value)}
                    placeholder="••••••••"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                  />
                  <button
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600"
                    onClick={() => setShowPassword((p) => !p)}
                    type="button"
                  >
                    <EyeIcon />
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-600">
                <input
                  checked={rememberMe}
                  className="size-4 rounded border-gray-300 accent-[#3b82f6]"
                  onChange={(e) => setRememberMe(e.target.checked)}
                  type="checkbox"
                />
                Manter-me conectado
              </label>

              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#3b82f6] text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
                disabled={loading}
                type="submit"
              >
                {loading ? 'Entrando...' : <><span>Entrar</span><span>→</span></>}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
              Não tem uma conta?{' '}
              <button
                className="font-medium text-[#3b82f6] transition hover:text-blue-700"
                onClick={() => navigate('/cadastro')}
                type="button"
              >
                Criar conta gratuita
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}

// ─── Página de Cadastro ───────────────────────────────────────────────────────

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
      await patientRepository.registerPublicWithPassword(form)
      window.alert('Cadastro realizado. Você já pode acessar com email e senha.')
      navigate('/login')
    } catch (err) {
      setError(err.message || 'Erro ao realizar cadastro.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout description="Crie seu acesso de paciente com CPF, celular e senha." title="Cadastro de paciente">
      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">
          {error}
        </div>
      ) : null}
      <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
        <LightField label="Nome completo">
          <input
            autoComplete="name"
            className={lightInputSimpleClass}
            onChange={(e) => updateField('full_name', e.target.value)}
            required
            value={form.full_name}
          />
        </LightField>
        <LightField label="E-mail">
          <input
            autoComplete="email"
            className={lightInputSimpleClass}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="seu@email.com"
            required
            type="email"
            value={form.email}
          />
        </LightField>
        <div className="grid gap-5 sm:grid-cols-2">
          <LightField label="CPF">
            <input
              autoComplete="off"
              className={lightInputSimpleClass}
              maxLength={14}
              onChange={(e) => updateField('cpf', e.target.value)}
              required
              value={form.cpf}
            />
          </LightField>
          <LightField label="Celular">
            <input
              autoComplete="tel"
              className={lightInputSimpleClass}
              maxLength={15}
              onChange={(e) => updateField('phone_mobile', e.target.value)}
              required
              value={form.phone_mobile}
            />
          </LightField>
        </div>
        <LightField label="Data de nascimento">
          <input
            className={lightInputSimpleClass}
            onChange={(e) => updateField('birth_date', e.target.value)}
            type="date"
            value={form.birth_date}
          />
        </LightField>
        <div className="grid gap-5 sm:grid-cols-2">
          <LightField label="Senha">
            <input
              autoComplete="new-password"
              className={lightInputSimpleClass}
              minLength={6}
              onChange={(e) => updateField('password', e.target.value)}
              required
              type="password"
              value={form.password}
            />
          </LightField>
          <LightField label="Confirmar senha">
            <input
              autoComplete="new-password"
              className={lightInputSimpleClass}
              minLength={6}
              onChange={(e) => updateField('confirm_password', e.target.value)}
              required
              type="password"
              value={form.confirm_password}
            />
          </LightField>
        </div>
        <button
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#3b82f6] text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? 'Cadastrando...' : 'Cadastrar'}
        </button>
      </form>
      <button
        className="mt-5 text-sm font-medium text-[#3b82f6] transition hover:text-blue-700"
        onClick={() => navigate('/login')}
        type="button"
      >
        ← Voltar para login
      </button>
    </AuthLayout>
  )
}

// ─── Página de Recuperar Senha ────────────────────────────────────────────────

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
        <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-700">
          Link de recuperação enviado para o e-mail informado. Siga as instruções do link!
        </div>
      ) : (
        <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">
              {error}
            </div>
          )}
          <LightField label="E-mail cadastrado">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <MailIcon />
              </span>
              <input
                autoComplete="email"
                className={lightInputClass}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                type="email"
                value={email}
              />
            </div>
          </LightField>
          <button
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#3b82f6] text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? 'Enviando...' : 'Enviar link'}
          </button>
        </form>
      )}
      <button
        className="mt-5 text-sm font-medium text-[#3b82f6] transition hover:text-blue-700"
        onClick={() => navigate('/login')}
        type="button"
      >
        ← Voltar para login
      </button>
    </AuthLayout>
  )
}

// ─── Layout compartilhado ─────────────────────────────────────────────────────

function AuthLayout({ children, description, title }) {
  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen lg:grid-cols-2">

        <section
          className="relative hidden min-h-screen overflow-hidden lg:flex lg:flex-col"
          style={dotPanelStyle}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 h-[480px] w-[480px]"
            style={{
              background:
                'radial-gradient(ellipse at top right, rgba(59,130,246,0.22) 0%, transparent 65%)',
            }}
          />
          <div className="relative flex flex-1 flex-col justify-between px-12 py-10">
            <RightLogo dark />
            <div className="max-w-[440px]">
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80">
                <span className="text-[#3b82f6]">✦</span>
                Inteligência Artificial para sua clínica
              </div>
              <h1 className="text-[34px] font-bold leading-[1.22] tracking-tight text-white">
                A gestão da sua clínica,
                <br />
                potencializada por IA.
              </h1>
              <p className="mt-4 max-w-[390px] text-sm leading-6 text-white/55">
                Agendamentos inteligentes, prontuários assistidos e insights em tempo real.
                Tudo em uma única plataforma pensada para profissionais de saúde.
              </p>
              <ul className="mt-8 flex flex-col gap-4">
                <LeftFeature icon={<ActivityIcon />} text="Prontuário eletrônico com sugestões automáticas" />
                <LeftFeature icon={<SparkleIcon />}  text="Análises preditivas e relatórios em segundos" />
                <LeftFeature icon={<ShieldIcon />}   text="Conformidade LGPD e dados criptografados" />
              </ul>
            </div>
            <div className="flex items-center justify-between text-xs text-white/30">
              <span>© 2026 Mediconnect</span>
              <div className="flex gap-5">
                {['Privacidade', 'Termos', 'Suporte'].map((label) => (
                  <button key={label} className="transition hover:text-white/60" type="button">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-6 py-12 sm:px-10 lg:px-16">
          <div className="w-full max-w-[448px]">
            <div className="mb-8 lg:hidden">
              <RightLogo />
            </div>
            <h2 className="text-[28px] font-bold leading-tight text-gray-900">{title}</h2>
            <p className="mt-1.5 text-sm text-gray-500">{description}</p>
            {children}
          </div>
        </section>
      </div>
    </main>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function RightLogo({ dark = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#3b82f6]">
        <StethoscopeIcon className="size-5 text-white" />
      </div>
      <div>
        <p className={`font-bold leading-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
          Mediconnect
        </p>
        <p className={`text-xs ${dark ? 'text-white/50' : 'text-gray-500'}`}>
          Gestão clínica com IA
        </p>
      </div>
    </div>
  )
}

function LeftFeature({ icon, text }) {
  return (
    <li className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#3b82f6]">
        {icon}
      </div>
      <span className="text-sm text-white/65">{text}</span>
    </li>
  )
}

function LightField({ children, htmlFor, label }) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium text-gray-700" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ─── Ícones ───────────────────────────────────────────────────────────────────

function MailIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function ActivityIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l3-9 4 18 3-9h5" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  )
}
