import { useState } from 'react'
import {
  Activity,
  ArrowRight,
  Brain,
  CalendarCheck,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock,
  FileText,
  Globe2,
  LockKeyhole,
  Mail,
  Menu,
  MessageCircle,
  Plug,
  Quote,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react'

import heroClinicImage from '../assets/figma/login-clinic.png'

const navLinks = [
  { href: '#pilares', label: 'Solucoes' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#beneficios', label: 'Beneficios' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'FAQ' },
]

const trustPoints = [
  'Conformidade LGPD',
  'Suporte em portugues',
  'Prontuario eletronico',
]

const pillars = [
  {
    Icon: CalendarCheck,
    badgeClass: 'bg-[#eff6ff] text-[#3b82f6]',
    dotClass: 'bg-[#3b82f6]',
    iconClass: 'bg-[#dbeafe] text-[#3b82f6]',
    title: 'Reducao de absenteismo',
    description:
      'Comunicacao automatizada por WhatsApp, SMS e e-mail para confirmar consultas, lembrar pacientes e reocupar horarios livres.',
    items: ['Confirmacao automatica', 'Lista de espera dinamica', 'Lembretes multicanal'],
  },
  {
    Icon: FileText,
    badgeClass: 'bg-[#eff6ff] text-[#3b82f6]',
    dotClass: 'bg-[#3b82f6]',
    iconClass: 'bg-[#dbeafe] text-[#3b82f6]',
    title: 'Laudos estruturados',
    description:
      'Editor rico, templates por especialidade e historico centralizado para registrar atendimentos com mais agilidade e consistencia.',
    items: ['Templates clinicos', 'Editor rico', 'Historico do paciente'],
  },
  {
    Icon: Brain,
    badgeClass: 'bg-[#eff6ff] text-[#3b82f6]',
    dotClass: 'bg-[#3b82f6]',
    iconClass: 'bg-[#dbeafe] text-[#3b82f6]',
    title: 'Inteligencia operacional',
    description:
      'Dashboards para enxergar receita, agenda, convenio, salas e profissionais, ajudando a decidir com base em dados reais.',
    items: ['KPIs em tempo real', 'Analise por convenio', 'Alertas operacionais'],
  },
]

const steps = [
  {
    Icon: Plug,
    title: 'Cadastre sua clinica',
    description:
      'Inclua profissionais, pacientes, convenios e perfis de acesso para cada pessoa da equipe.',
  },
  {
    Icon: Settings2,
    title: 'Configure os modulos',
    description:
      'Ajuste templates de laudo, canais de comunicacao, agenda e dashboards ao fluxo real da operacao.',
  },
  {
    Icon: Rocket,
    title: 'Comece a atender',
    description:
      'Use agenda integrada, registre consultas, gere laudos e envie confirmacoes automaticas desde o primeiro dia.',
  },
  {
    Icon: TrendingUp,
    title: 'Acompanhe os resultados',
    description:
      'Monitore indicadores por especialidade, convenio e profissional para corrigir gargalos antes que virem perda.',
  },
]

const metrics = [
  { value: '-45%', label: 'de reducao potencial de faltas' },
  { value: '8h', label: 'semanais recuperadas pela equipe' },
  { value: '3', label: 'canais de comunicacao integrados' },
  { value: '5', label: 'perfis de acesso configuraveis' },
]

const benefits = [
  {
    Icon: Clock,
    title: 'Devolve tempo ao medico',
    description:
      'Templates e editor rico reduzem retrabalho administrativo sem tirar controle da decisao clinica.',
  },
  {
    Icon: Wallet,
    title: 'Receita mais previsivel',
    description:
      'Indicadores por convenio, especialidade e profissional mostram onde a clinica ganha ou perde margem.',
  },
  {
    Icon: ShieldCheck,
    title: 'Rotina alinhada a LGPD',
    description:
      'Acesso por perfil, registro centralizado e boas praticas de seguranca para dados sensiveis.',
  },
  {
    Icon: Users,
    title: 'Visoes por perfil',
    description:
      'Admin, gestor, medico, secretaria e paciente acessam apenas o que precisam para trabalhar melhor.',
  },
  {
    Icon: LockKeyhole,
    title: 'Dados protegidos na nuvem',
    description:
      'Sistema web, sem servidor local na clinica, com acesso seguro para equipes distribuidas.',
  },
  {
    Icon: Activity,
    title: 'Operacao mais previsivel',
    description:
      'Agenda, prontuario, comunicacao e relatorios ficam no mesmo fluxo, com menos ferramentas soltas.',
  },
]

const testimonials = [
  {
    name: 'Dra. Camila Ribeiro',
    role: 'Cardiologista, Clinica CorVita',
    initials: 'CR',
    text:
      'Em poucos meses conseguimos organizar agenda, lembretes e laudos em um fluxo so. A equipe parou de apagar incendio o dia inteiro.',
  },
  {
    name: 'Dr. Henrique Salles',
    role: 'Ortopedista, Instituto Movimento',
    initials: 'HS',
    text:
      'Os templates de laudo deram velocidade sem deixar o atendimento mecanico. Registro entre consultas e encontro tudo no historico do paciente.',
  },
  {
    name: 'Dra. Marina Tavares',
    role: 'Dermatologista, Clinica Pele Viva',
    initials: 'MT',
    text:
      'Os dashboards deixaram claro onde a clinica estava perdendo margem. Hoje a conversa com convenios e equipe e muito mais objetiva.',
  },
]

const plans = [
  {
    name: 'Essencial',
    description: 'Para consultorios individuais e clinicas em inicio de jornada digital.',
    features: [
      'Agenda e gestao de consultas',
      'Cadastro de pacientes',
      'Editor de laudos com templates',
      'Comunicacao por WhatsApp, SMS e e-mail',
      'Suporte por chat',
    ],
  },
  {
    name: 'Profissional',
    description: 'Para clinicas multi-especialidade que querem escalar com dados e automacao.',
    featured: true,
    features: [
      'Tudo do Essencial',
      'Analytics e dashboards operacionais',
      'KPIs por convenio e especialidade',
      'Gestao de usuarios com 5 perfis',
      'Prontuario eletronico completo',
      'Suporte prioritario',
    ],
  },
  {
    name: 'Enterprise',
    description: 'Para redes, hospitais e operacoes com necessidades especificas.',
    features: [
      'Tudo do Profissional',
      'Multiunidades com consolidacao',
      'API REST documentada',
      'Treinamento dedicado',
      'SLA e onboarding assistido',
    ],
  },
]

const faqs = [
  {
    question: 'O MediConnect substitui o trabalho clinico?',
    answer:
      'Nao. O sistema apoia a gestao e automatiza tarefas administrativas. A decisao clinica continua sendo responsabilidade do profissional de saude.',
  },
  {
    question: 'Meus dados ficam seguros e alinhados a LGPD?',
    answer:
      'Sim. A proposta do sistema e centralizar acesso, perfis e registros de forma controlada, reduzindo informacao espalhada em ferramentas paralelas.',
  },
  {
    question: 'O sistema substitui minha agenda atual?',
    answer:
      'Sim. A plataforma possui modulo de agenda com visoes diaria, semanal e mensal, integrado aos cadastros, consultas e comunicacao.',
  },
  {
    question: 'Preciso instalar servidor na clinica?',
    answer:
      'Nao. O MediConnect e uma aplicacao web acessada pelo navegador, pensada para operar em nuvem e funcionar em diferentes dispositivos.',
  },
  {
    question: 'Quanto tempo ate perceber reducao de faltas?',
    answer:
      'Os lembretes e confirmacoes podem ajudar desde a configuracao inicial. O impacto depende do volume de consultas e da adesao dos pacientes aos canais configurados.',
  },
]

export function LandingPage({ isAuthenticated = false, navigate }) {
  const accountPath = isAuthenticated ? '/inicio' : '/login'
  const accountLabel = isAuthenticated ? 'Ir ao painel' : 'Entrar'

  function goTo(path) {
    navigate(path)
  }

  function goToSection(event, href) {
    event.preventDefault()
    navigate(`/${href}`)
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-gray-900">
      <LandingHeader
        accountLabel={accountLabel}
        accountPath={accountPath}
        goTo={goTo}
        goToSection={goToSection}
      />

      <main>
        <Hero goTo={goTo} />
        <Pillars goToSection={goToSection} />
        <HowItWorks />
        <Benefits />
        <Testimonials />
        <Plans goTo={goTo} />
        <FAQ />
        <FinalCTA goTo={goTo} />
      </main>

      <LandingFooter goToSection={goToSection} />
    </div>
  )
}

function LandingHeader({ accountLabel, accountPath, goTo, goToSection }) {
  const [open, setOpen] = useState(false)

  function handleNav(event, href) {
    setOpen(false)
    goToSection(event, href)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-6">
        <a
          className="flex items-center gap-2 text-gray-900"
          href="/"
          onClick={(event) => {
            event.preventDefault()
            setOpen(false)
            goTo('/')
          }}
        >
          <span className="grid size-9 place-items-center rounded-md bg-[#3b82f6] text-white">
            <Stethoscope className="size-5" />
          </span>
          <span className="font-semibold">MediConnect</span>
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Navegacao principal">
          {navLinks.map((link) => (
            <a
              className="text-sm font-medium text-gray-500 transition hover:text-[#3b82f6]"
              href={link.href}
              key={link.href}
              onClick={(event) => goToSection(event, link.href)}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <LandingButton onClick={() => goTo(accountPath)} variant="ghost">
            {accountLabel}
          </LandingButton>
          {!accountPath.includes('inicio') ? (
            <LandingButton onClick={() => goTo('/cadastro')}>Criar conta</LandingButton>
          ) : null}
        </div>

        <button
          aria-expanded={open}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          className="grid size-10 place-items-center rounded-md text-gray-700 transition hover:bg-[#f4f7fb] md:hidden"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-gray-200 bg-white px-5 py-4 shadow-sm md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Navegacao mobile">
            {navLinks.map((link) => (
              <a
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-[#f4f7fb] hover:text-[#3b82f6]"
                href={link.href}
                key={link.href}
                onClick={(event) => handleNav(event, link.href)}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 grid gap-2">
            <LandingButton onClick={() => goTo(accountPath)} variant="secondary">
              {accountLabel}
            </LandingButton>
            {!accountPath.includes('inicio') ? (
              <LandingButton onClick={() => goTo('/cadastro')}>Criar conta</LandingButton>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  )
}

function Hero({ goTo }) {
  return (
    <section
      className="relative isolate flex min-h-[600px] items-center overflow-hidden bg-[#02070f] bg-cover bg-center px-5 py-20 text-white sm:px-6 lg:min-h-[680px]"
      style={{
        backgroundImage: `linear-gradient(105deg, rgba(3, 4, 6, 0.94) 0%, rgba(7, 19, 38, 0.82) 44%, rgba(13, 36, 84, 0.48) 100%), url(${heroClinicImage})`,
      }}
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-white/80 backdrop-blur">
            <Sparkles className="size-4 text-[#3b82f6]" />
            Inteligencia artificial para sua clinica
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            A gestao da sua clinica, potencializada por IA.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
            Reduza absenteismo, automatize laudos e tome decisoes baseadas em dados. Uma
            plataforma pensada para medicos e clinicas brasileiras que precisam crescer com
            previsibilidade.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LandingButton className="min-h-12 px-5" onClick={() => goTo('/cadastro')}>
              Criar conta gratuita
              <ArrowRight className="size-4" />
            </LandingButton>
            <LandingButton
              className="min-h-12 border-white/30 bg-white/10 px-5 text-white hover:bg-white/15"
              onClick={() => goTo('/login')}
              variant="secondary"
            >
              Acessar sistema
            </LandingButton>
          </div>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/75">
            {trustPoints.map((point) => (
              <span className="inline-flex items-center gap-2" key={point}>
                <CheckCircle2 className="size-4 text-[#3b82f6]" />
                {point}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Pillars({ goToSection }) {
  return (
    <section className="scroll-mt-20 bg-white py-20 sm:py-24" id="pilares">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <SectionIntro
          eyebrow="Tres pilares, um sistema"
          title="Tudo o que sua clinica precisa para crescer com previsibilidade"
          description="MediConnect concentra os modulos criticos da operacao clinica em uma plataforma unica, desenhada para rotinas de saude no Brasil."
        />

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {pillars.map((pillar) => (
            <article
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-[#3b82f6]/30 hover:shadow-md"
              key={pillar.title}
            >
              <div className={`mb-5 grid size-12 place-items-center rounded-lg ${pillar.iconClass}`}>
                <pillar.Icon className="size-6" />
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${pillar.badgeClass}`}>
                {pillar.title}
              </span>
              <p className="mt-4 text-sm leading-6 text-gray-500">{pillar.description}</p>
              <ul className="mt-5 space-y-2">
                {pillar.items.map((item) => (
                  <li className="flex items-center gap-2 text-sm text-gray-700" key={item}>
                    <span className={`size-1.5 rounded-full ${pillar.dotClass}`} />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-[#3b82f6] transition hover:gap-2 hover:text-blue-700"
                href="#como-funciona"
                onClick={(event) => goToSection(event, '#como-funciona')}
              >
                Saiba mais
                <ArrowRight className="size-4" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section className="scroll-mt-20 bg-[#f4f7fb] py-20 sm:py-24" id="como-funciona">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <SectionKicker>Como funciona</SectionKicker>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-gray-900 sm:text-4xl">
            Do cadastro ao pleno funcionamento em poucos passos
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-500">
            Configure a clinica, defina permissoes por perfil e comece a usar agenda,
            prontuario, laudos e relatorios sem depender de infraestrutura local.
          </p>
        </div>

        <div className="grid gap-4">
          {steps.map((step, index) => (
            <article className="flex gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm" key={step.title}>
              <div className="flex flex-col items-center">
                <div className="grid size-11 place-items-center rounded-full bg-[#3b82f6] text-white shadow-sm">
                  <step.Icon className="size-5" />
                </div>
                {index < steps.length - 1 ? <div className="mt-3 h-full min-h-8 w-px bg-[#dbeafe]" /> : null}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-gray-400">Passo {index + 1}</p>
                <h3 className="mt-1 font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-500">{step.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Benefits() {
  return (
    <section className="scroll-mt-20 bg-white py-20 sm:py-24" id="beneficios">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="grid gap-8 bg-[#02070f] px-6 py-12 text-white sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <SectionKicker dark>Resultados operacionais</SectionKicker>
            <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
              Numeros que aparecem na rotina antes de aparecerem no DRE
            </h2>
            <p className="mt-4 text-sm leading-6 text-white/55">
              Uma operacao com menos faltas, menos retrabalho e dados mais visiveis ganha folego
              para atender melhor e planejar crescimento.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <p className="text-3xl font-semibold text-[#93c5fd] sm:text-4xl">{metric.value}</p>
                <p className="mt-2 text-sm leading-5 text-white/55">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16">
          <SectionIntro
            eyebrow="Pensado para quem vive a clinica"
            title="Beneficios praticos para uma operacao de saude"
            description="Cada modulo cobre uma dor recorrente: tempo medico, previsibilidade financeira, seguranca, acesso por perfil e dados acionaveis."
          />

          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit) => (
              <article className="rounded-lg border border-gray-200 bg-white p-6 transition hover:border-[#3b82f6]/30 hover:bg-[#f4f7fb]" key={benefit.title}>
                <div className="grid size-10 place-items-center rounded-lg bg-[#dbeafe] text-[#3b82f6]">
                  <benefit.Icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold text-gray-900">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-500">{benefit.description}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Testimonials() {
  return (
    <section className="bg-[#f4f7fb] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <SectionIntro
          eyebrow="Quem usa, recomenda"
          title="Clinicas que ganharam clareza na rotina"
          description="Relatos inspirados nos ganhos que a plataforma busca entregar: agenda previsivel, laudos organizados e decisao orientada por dados."
        />

        <div className="mt-6 flex items-center justify-center gap-1 text-[#3b82f6]">
          {Array.from({ length: 5 }, (_, index) => (
            <Star className="size-5 fill-current" key={index} />
          ))}
          <span className="ml-2 text-sm font-medium text-gray-500">4.9 / 5 em avaliacoes de usuarios</span>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <article className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm" key={testimonial.name}>
              <Quote className="size-7 text-[#bfdbfe]" />
              <p className="mt-4 text-sm leading-6 text-gray-700">"{testimonial.text}"</p>
              <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-4">
                <div className="grid size-11 place-items-center rounded-full bg-[#071326] text-sm font-semibold text-white">
                  {testimonial.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{testimonial.name}</p>
                  <p className="text-xs text-gray-500">{testimonial.role}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Plans({ goTo }) {
  return (
    <section className="scroll-mt-20 bg-white py-20 sm:py-24" id="planos">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <SectionIntro
          eyebrow="Planos sob medida"
          title="Escolha o ritmo certo para digitalizar sua clinica"
          description="Cada operacao tem tamanho, equipe e maturidade diferentes. O MediConnect organiza uma jornada de entrada clara para cada perfil."
        />

        <div className="mx-auto mt-12 grid max-w-6xl gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              className={`relative rounded-lg p-6 shadow-sm ${
                plan.featured
                  ? 'border border-[#3b82f6] bg-[#3b82f6] text-white'
                  : 'border border-gray-200 bg-white text-gray-900'
              }`}
              key={plan.name}
            >
              {plan.featured ? (
                <div className="mb-4 inline-flex items-center gap-1 rounded-full bg-[#dbeafe] px-3 py-1 text-xs font-semibold text-[#1e3a8a]">
                  <Sparkles className="size-3.5" />
                  Mais escolhido
                </div>
              ) : null}
              <h3 className="text-xl font-semibold">{plan.name}</h3>
              <p className={`mt-2 min-h-16 text-sm leading-6 ${plan.featured ? 'text-white/85' : 'text-gray-500'}`}>
                {plan.description}
              </p>
              <div className="mt-5">
                <p className="text-2xl font-semibold">Sob consulta</p>
                <p className={`mt-1 text-sm ${plan.featured ? 'text-white/75' : 'text-gray-500'}`}>
                  Proposta personalizada apos diagnostico
                </p>
              </div>
              <LandingButton
                className={`mt-6 w-full ${
                  plan.featured ? 'border-white bg-white text-[#3b82f6] hover:bg-[#eff6ff]' : ''
                }`}
                onClick={() => goTo('/cadastro')}
                variant={plan.featured ? 'secondary' : 'primary'}
              >
                Falar com especialista
              </LandingButton>
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li className="flex items-start gap-2 text-sm" key={feature}>
                    <Check className={`mt-0.5 size-4 shrink-0 ${plan.featured ? 'text-[#bfdbfe]' : 'text-[#3b82f6]'}`} />
                    <span className={plan.featured ? 'text-white/90' : 'text-gray-700'}>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQ() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <section className="scroll-mt-20 bg-[#f4f7fb] py-20 sm:py-24" id="faq">
      <div className="mx-auto max-w-3xl px-5 sm:px-6">
        <SectionIntro
          eyebrow="Perguntas frequentes"
          title="Duvidas que aparecem antes da implantacao"
          description="Algumas respostas rapidas para entender o papel do MediConnect na rotina da clinica."
        />

        <div className="mt-10 space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index

            return (
              <article className="rounded-lg border border-gray-200 bg-white" key={faq.question}>
                <button
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-gray-900"
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  type="button"
                >
                  <span>{faq.question}</span>
                  <CircleHelp className={`size-5 shrink-0 text-[#3b82f6] transition ${isOpen ? 'rotate-45' : ''}`} />
                </button>
                {isOpen ? <p className="px-5 pb-5 text-sm leading-6 text-gray-500">{faq.answer}</p> : null}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FinalCTA({ goTo }) {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-5 text-center sm:px-6">
        <SectionKicker>Proximo passo</SectionKicker>
        <h2 className="mt-4 text-3xl font-semibold leading-tight text-gray-900 sm:text-4xl">
          Pronto para devolver tempo ao medico que existe na sua equipe?
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-500">
          Experimente um sistema que conecta agenda, prontuario, comunicacao e indicadores para
          tornar a gestao clinica mais leve e previsivel.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <LandingButton className="min-h-12 px-5" onClick={() => goTo('/cadastro')}>
            Criar conta gratuita
            <ArrowRight className="size-4" />
          </LandingButton>
          <LandingButton className="min-h-12 px-5" onClick={() => goTo('/login')} variant="secondary">
            Entrar no sistema
          </LandingButton>
        </div>
      </div>
    </section>
  )
}

function LandingFooter({ goToSection }) {
  const footerLinks = [
    { href: '#pilares', label: 'Solucoes' },
    { href: '#como-funciona', label: 'Como funciona' },
    { href: '#planos', label: 'Planos' },
    { href: '#faq', label: 'FAQ' },
  ]

  return (
    <footer className="bg-[#02070f] text-white/70">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-md bg-[#3b82f6] text-white">
                <Stethoscope className="size-5" />
              </span>
              <span className="font-semibold text-white">MediConnect</span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/55">
              Plataforma de gestao clinica com IA para medicos e clinicas brasileiras. Menos
              burocracia, mais cuidado e decisao com dados.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white">Produto</h3>
            <ul className="mt-4 space-y-2">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <a
                    className="text-sm text-white/55 transition hover:text-white"
                    href={link.href}
                    onClick={(event) => goToSection(event, link.href)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white">Contato</h3>
            <div className="mt-4 grid gap-3 text-sm text-white/55">
              <span className="inline-flex items-center gap-2">
                <Mail className="size-4" />
                contato@mediconnect.com.br
              </span>
              <span className="inline-flex items-center gap-2">
                <MessageCircle className="size-4" />
                Suporte via chat e WhatsApp
              </span>
              <span className="inline-flex items-center gap-2">
                <Globe2 className="size-4" />
                Operacao pensada para o Brasil
              </span>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 MediConnect Tecnologia em Saude.</span>
          <span>Termos de uso · Politica de privacidade · LGPD</span>
        </div>
      </div>
    </footer>
  )
}

function SectionIntro({ description, eyebrow, title }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <SectionKicker>{eyebrow}</SectionKicker>
      <h2 className="mt-4 text-3xl font-semibold leading-tight text-gray-900 sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-gray-500">{description}</p>
    </div>
  )
}

function SectionKicker({ children, dark = false }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
        dark ? 'bg-white/10 text-[#bfdbfe]' : 'bg-[#eff6ff] text-[#3b82f6]'
      }`}
    >
      <Sparkles className="size-4" />
      {children}
    </div>
  )
}

function LandingButton({ children, className = '', variant = 'primary', ...props }) {
  const variants = {
    ghost: 'border-transparent bg-transparent text-gray-700 hover:bg-[#f4f7fb]',
    primary: 'border-[#3b82f6] bg-[#3b82f6] text-white hover:bg-blue-600',
    secondary: 'border-gray-300 bg-white text-gray-800 hover:bg-[#f4f7fb]',
  }

  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}
