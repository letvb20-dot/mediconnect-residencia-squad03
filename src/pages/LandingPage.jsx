import { useState } from 'react'
import {
  Activity,
  ArrowRight,
  Baby,
  Building2,
  CalendarCheck,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  Clock,
  FileText,
  Globe2,
  HeartPulse,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  Users,
  X,
} from 'lucide-react'

const clinicName = 'Clínica Aurora Vida'

const navLinks = [
  { href: '#especialidades', label: 'Especialidades' },
  { href: '#experiencia', label: 'Experiência' },
  { href: '#estrutura', label: 'Estrutura' },
  { href: '#faq', label: 'FAQ' },
]

const trustPoints = [
  'Agenda online pelo MediConnect',
  'Confirmação automática de consultas',
  'Prontuário conectado à equipe',
]

const specialties = [
  {
    Icon: Stethoscope,
    title: 'Clínica médica',
    description: 'Avaliação integral, acompanhamento de rotina e encaminhamento coordenado.',
  },
  {
    Icon: HeartPulse,
    title: 'Cardiologia',
    description: 'Consultas preventivas, acompanhamento de risco e retorno com histórico centralizado.',
  },
  {
    Icon: Baby,
    title: 'Pediatria',
    description: 'Cuidado próximo para crianças, famílias e vacinação acompanhada em agenda.',
  },
  {
    Icon: Activity,
    title: 'Ortopedia',
    description: 'Avaliação de dor, mobilidade, lesões e plano de cuidado compartilhado.',
  },
  {
    Icon: Users,
    title: 'Ginecologia',
    description: 'Atendimento acolhedor, exames de rotina e orientação por fase de vida.',
  },
  {
    Icon: ShieldCheck,
    title: 'Dermatologia',
    description: 'Prevenção, diagnóstico e acompanhamento com registros acessíveis no portal.',
  },
]

const patientJourney = [
  {
    Icon: CalendarCheck,
    title: 'Agendamento simples',
    description: 'O paciente escolhe horário, profissional e especialidade pelo portal conectado.',
  },
  {
    Icon: MessageCircle,
    title: 'Lembretes no canal certo',
    description: 'A clínica confirma consultas e envia orientações antes da chegada.',
  },
  {
    Icon: ClipboardCheck,
    title: 'Atendimento com contexto',
    description: 'A equipe encontra histórico, laudos e observações em uma rotina única.',
  },
  {
    Icon: FileText,
    title: 'Documentos organizados',
    description: 'Receitas, laudos e retornos ficam mais fáceis de acompanhar após a consulta.',
  },
]

const mediconnectHighlights = [
  {
    value: '15 min',
    label: 'tempo médio entre check-in e triagem',
  },
  {
    value: '3 canais',
    label: 'para confirmação e lembretes',
  },
  {
    value: '24h',
    label: 'de acesso ao portal do paciente',
  },
]

const carePrinciples = [
  'Equipe multidisciplinar com prontuário compartilhado',
  'Fluxo digital para reduzir filas e ligações repetidas',
  'Privacidade e acesso por perfil para dados sensíveis',
]

const testimonials = [
  {
    name: 'Renata M.',
    role: 'Paciente de cardiologia',
    initials: 'RM',
    text:
      'Consegui marcar retorno, receber o lembrete e encontrar minhas orientações no portal sem depender de várias ligações.',
  },
  {
    name: 'Marcelo A.',
    role: 'Paciente de ortopedia',
    initials: 'MA',
    text:
      'A equipe já tinha meu histórico na tela e isso deixou a consulta mais objetiva. Senti que todo mundo falava a mesma língua.',
  },
  {
    name: 'Dra. Helena Torres',
    role: 'Diretora clínica',
    initials: 'HT',
    text:
      'O MediConnect ajudou a organizar agenda, comunicação e prontuário. Hoje a clínica atende com mais previsibilidade.',
  },
]

const faqs = [
  {
    question: 'Como funciona o agendamento online?',
    answer:
      'O paciente cria cadastro ou acessa o portal, escolhe especialidade, profissional e horário disponível, e recebe a confirmação digital da consulta.',
  },
  {
    question: 'Preciso ter conta para agendar?',
    answer:
      'A experiência foi pensada para levar o paciente ao cadastro ou ao portal. Depois do login, o agendamento acontece dentro do MediConnect.',
  },
  {
    question: 'A clínica atende por convênio?',
    answer:
      'A clínica trabalha com atendimento particular e convênios cadastrados, sempre com confirmação digital antes da consulta.',
  },
  {
    question: 'Meus dados ficam protegidos?',
    answer:
      'O fluxo proposto usa acesso por perfil, registros centralizados e boas práticas de segurança para reduzir dados espalhados fora do sistema.',
  },
  {
    question: 'Posso acessar resultados e orientações?',
    answer:
      'Sim. A proposta da página direciona pacientes ao portal, onde documentos, retornos e comunicações podem ser acompanhados de forma organizada.',
  },
]

export function LandingPage({ isAuthenticated = false, navigate }) {
  const accountPath = isAuthenticated ? '/inicio' : '/login'
  const accountLabel = isAuthenticated ? 'Ir ao painel' : 'Portal do paciente'

  function goTo(path) {
    navigate(path)
  }

  function goToSection(event, href) {
    event.preventDefault()
    navigate(`/${href}`)
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-[#0f172a]">
      <LandingHeader
        accountLabel={accountLabel}
        accountPath={accountPath}
        goTo={goTo}
        goToSection={goToSection}
      />

      <main>
        <Hero goTo={goTo} />
        <Specialties goToSection={goToSection} />
        <PatientExperience />
        <Structure />
        <Testimonials />
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
    <header className="sticky top-0 z-50 border-b border-blue-900/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-6">
        <a
          className="flex items-center gap-3 text-[#0f172a]"
          href="/"
          onClick={(event) => {
            event.preventDefault()
            setOpen(false)
            goTo('/')
          }}
        >
          <span className="grid size-10 place-items-center rounded-lg bg-[#3b82f6] text-white shadow-sm">
            <HeartPulse className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold sm:text-base">{clinicName}</span>
            <span className="hidden text-xs font-medium text-[#64748b] sm:block">
              Conectada pelo MediConnect
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Navegação principal">
          {navLinks.map((link) => (
            <a
              className="text-sm font-semibold text-[#64748b] transition hover:text-[#3b82f6]"
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
            <LandingButton onClick={() => goTo('/cadastro')}>Novo cadastro</LandingButton>
          ) : null}
        </div>

        <button
          aria-expanded={open}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          className="grid size-10 place-items-center rounded-lg text-[#334155] transition hover:bg-[#eff6ff] md:hidden"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-blue-900/10 bg-white px-5 py-4 shadow-sm md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Navegação mobile">
            {navLinks.map((link) => (
              <a
                className="rounded-lg px-3 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#eff6ff] hover:text-[#3b82f6]"
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
              <LandingButton onClick={() => goTo('/cadastro')}>Novo cadastro</LandingButton>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  )
}

function Hero({ goTo }) {
  return (
    <section className="relative isolate flex min-h-[640px] items-center overflow-hidden bg-[#082f5f] px-5 py-16 text-white sm:px-6 lg:min-h-[560px]">
      <div className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block" aria-hidden="true">
        <img
          alt=""
          className="absolute right-0 top-0 h-full w-[58%] object-cover object-[58%_35%] opacity-75"
          decoding="async"
          fetchPriority="high"
          src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1400&q=85"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#082f5f_0%,#082f5f_40%,rgba(8,47,95,0.78)_66%,rgba(8,47,95,0.24)_100%)]" />
        <div className="absolute left-[38%] top-[-16%] size-[620px] rounded-full border-[54px] border-white/[0.045]" />
        <div className="absolute right-[-2rem] top-6 text-[26rem] font-black leading-none text-white/[0.035]">+</div>
      </div>
      <div className="pointer-events-none absolute left-[-4rem] bottom-8 hidden h-28 w-28 rounded-[28px] border-[18px] border-[#60a5fa]/35 sm:block" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent_42%)]" />

      <div className="relative mx-auto w-full max-w-7xl">
        <div className="max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 text-base font-semibold text-[#bfdbfe]">
            <Sparkles className="size-4 text-[#60a5fa]" />
            Atendimento integrado pelo MediConnect
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            Clínica Aurora Vida
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-white/82 sm:text-lg">
            Cuidado médico integrado, agenda digital e comunicação clara para pacientes que querem
            resolver tudo com menos espera e mais acompanhamento.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LandingButton className="min-h-12 px-5" onClick={() => goTo('/cadastro')} variant="primaryFlat">
              Agendar primeira consulta
              <ArrowRight className="size-4" />
            </LandingButton>
            <LandingButton
              className="min-h-12 border-white/25 bg-white/10 px-5 text-white backdrop-blur hover:bg-white/18"
              onClick={() => goTo('/login')}
              variant="secondary"
            >
              Acessar portal
            </LandingButton>
          </div>

          <div className="mt-10 flex flex-wrap gap-3 text-sm">
            {trustPoints.map((point) => (
              <span
                className="inline-flex items-center gap-2 rounded-sm border border-white/12 bg-white/7 px-3 py-1.5 text-white/85 backdrop-blur-sm"
                key={point}
              >
                <CheckCircle2 className="size-3.5 text-[#93c5fd]" />
                {point}
              </span>
            ))}
          </div>

        </div>
      </div>
    </section>
  )
}

function Specialties({ goToSection }) {
  return (
    <section className="scroll-mt-20 bg-[#f4f7fb] py-12 sm:py-16" id="especialidades">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <SectionIntro
          eyebrow="Especialidades"
          title="Uma clínica completa, conectada por uma única jornada"
          description="A Aurora Vida usa o MediConnect para aproximar recepção, equipe médica e paciente antes, durante e depois da consulta."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {specialties.map((specialty) => (
            <article
              className="rounded-lg border border-blue-900/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3b82f6]/40 hover:shadow-[0_18px_35px_rgba(59,130,246,0.12)]"
              key={specialty.title}
            >
              <div className="grid size-12 place-items-center rounded-lg bg-[#eff6ff] text-[#3b82f6]">
                <specialty.Icon className="size-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-[#0f172a]">{specialty.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#64748b]">{specialty.description}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center">
          <a
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#3b82f6] transition hover:gap-3 hover:text-[#2563eb]"
            href="#experiencia"
            onClick={(event) => goToSection(event, '#experiencia')}
          >
            Ver experiência do paciente
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

function PatientExperience() {
  return (
    <section className="scroll-mt-20 bg-white py-16 sm:py-20" id="experiencia">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <SectionKicker>Experiência MediConnect</SectionKicker>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-[#0f172a] sm:text-4xl">
            Da marcação ao retorno, a clínica trabalha com o mesmo histórico
          </h2>
          <p className="mt-4 text-base leading-7 text-[#64748b]">
            A página pública leva o paciente ao cadastro e ao portal. A partir daí, a operação da
            Aurora Vida usa agenda, confirmações e prontuário no MediConnect.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {mediconnectHighlights.map((item) => (
              <div className="border-t-2 border-[#3b82f6] pt-3" key={item.label}>
                <p className="text-2xl font-semibold text-[#3b82f6]">{item.value}</p>
                <p className="mt-1 text-sm leading-5 text-[#64748b]">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {patientJourney.map((step, index) => (
            <article
              className="grid gap-4 rounded-lg border border-blue-900/10 bg-[#f4f7fb] p-5 shadow-sm sm:grid-cols-[auto_1fr]"
              key={step.title}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#3b82f6] text-white">
                  <step.Icon className="size-5" />
                </span>
                <span className="mt-2 text-xs font-semibold uppercase text-[#94a3b8]">
                  Etapa {index + 1}
                </span>
              </div>
              <div>
                <h3 className="font-semibold text-[#0f172a]">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#64748b]">{step.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Structure() {
  return (
    <section className="scroll-mt-20 bg-[#eff6ff] py-16 sm:py-20" id="estrutura">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="overflow-hidden rounded-xl border border-blue-900/10 bg-white shadow-sm">
            <img
              alt="Equipe médica reunida em sala de atendimento"
              className="h-72 w-full object-cover sm:h-96"
              loading="lazy"
              src="https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&w=1200&q=80"
            />
          </div>

          <div>
            <SectionKicker>Estrutura e equipe</SectionKicker>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-[#0f172a] sm:text-4xl">
              Atendimento humano com bastidor digital
            </h2>
            <p className="mt-4 text-base leading-7 text-[#64748b]">
              A Aurora Vida foi imaginada como uma clínica de bairro com operação moderna:
              recepção, consultórios e coordenação clínica compartilham informação sem perder o
              acolhimento.
            </p>

            <ul className="mt-7 grid gap-3">
              {carePrinciples.map((item) => (
                <li className="flex items-start gap-3 text-sm leading-6 text-[#334155]" key={item}>
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#3b82f6]" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-blue-900/10 bg-white p-5 shadow-sm">
                <Building2 className="size-5 text-[#3b82f6]" />
                <p className="mt-3 text-sm font-semibold text-[#0f172a]">Unidade principal</p>
                <p className="mt-1 text-sm text-[#64748b]">Av. das Palmeiras, 1200</p>
              </div>
              <div className="rounded-lg border border-blue-900/10 bg-white p-5 shadow-sm">
                <Clock className="size-5 text-[#3b82f6]" />
                <p className="mt-3 text-sm font-semibold text-[#0f172a]">Horário de atendimento</p>
                <p className="mt-1 text-sm text-[#64748b]">Segunda a sábado, 7h às 19h</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Testimonials() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <SectionIntro
          eyebrow="Vozes da rotina"
          title="Uma experiência conectada para pacientes e equipe"
          description="Os relatos ajudam a visualizar como uma clínica usuária do MediConnect se comunica com pacientes e organiza a rotina da equipe."
        />

        <div className="mt-6 flex items-center justify-center gap-1 text-[#3b82f6]">
          {Array.from({ length: 5 }, (_, index) => (
            <Star className="size-5 fill-current" key={index} />
          ))}
          <span className="ml-2 text-sm font-medium text-[#64748b]">Avaliação dos pacientes 4.9 / 5</span>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <article className="rounded-lg border border-blue-900/10 bg-[#f4f7fb] p-6 shadow-sm" key={testimonial.name}>
              <Quote className="size-7 text-[#bfdbfe]" />
              <p className="mt-4 text-sm leading-6 text-[#334155]">"{testimonial.text}"</p>
              <div className="mt-6 flex items-center gap-3 border-t border-blue-900/10 pt-4">
                <div className="grid size-11 place-items-center rounded-full bg-[#082f5f] text-sm font-semibold text-white">
                  {testimonial.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0f172a]">{testimonial.name}</p>
                  <p className="text-xs text-[#64748b]">{testimonial.role}</p>
                </div>
              </div>
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
    <section className="scroll-mt-20 bg-[#f4f7fb] py-16 sm:py-20" id="faq">
      <div className="mx-auto max-w-3xl px-5 sm:px-6">
        <SectionIntro
          eyebrow="Perguntas frequentes"
          title="Dúvidas antes de entrar no portal"
          description="Respostas rápidas para entender a rotina da clínica conectada ao MediConnect."
        />

        <div className="mt-10 space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index

            return (
              <article className="rounded-lg border border-blue-900/10 bg-white shadow-sm" key={faq.question}>
                <button
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-[#0f172a]"
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  type="button"
                >
                  <span>{faq.question}</span>
                  <CircleHelp className={`size-5 shrink-0 text-[#3b82f6] transition ${isOpen ? 'rotate-45' : ''}`} />
                </button>
                {isOpen ? <p className="px-5 pb-5 text-sm leading-6 text-[#64748b]">{faq.answer}</p> : null}
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
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-5 text-center sm:px-6">
        <SectionKicker>Portal Aurora Vida</SectionKicker>
        <h2 className="mt-4 text-3xl font-semibold leading-tight text-[#0f172a] sm:text-4xl">
          Marque sua consulta e acompanhe seu cuidado pelo MediConnect
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#64748b]">
          Novos pacientes podem criar cadastro. Quem já é atendido pela clínica acessa o portal
          para ver agenda, retornos e comunicações.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <LandingButton className="min-h-12 px-5" onClick={() => goTo('/cadastro')}>
            Criar cadastro
            <ArrowRight className="size-4" />
          </LandingButton>
          <LandingButton className="min-h-12 px-5" onClick={() => goTo('/login')} variant="secondary">
            Entrar no portal
          </LandingButton>
        </div>
      </div>
    </section>
  )
}

function LandingFooter({ goToSection }) {
  const footerLinks = [
    { href: '#especialidades', label: 'Especialidades' },
    { href: '#experiencia', label: 'Experiência' },
    { href: '#faq', label: 'FAQ' },
  ]

  return (
    <footer className="bg-[#082f5f] text-white/72">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-[#bfdbfe] text-[#082f5f]">
                <HeartPulse className="size-5" />
              </span>
              <div>
                <span className="block font-semibold text-white">{clinicName}</span>
                <span className="text-xs text-white/50">Conectada pelo MediConnect</span>
              </div>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/55">
              Clínica médica com agenda, prontuário e comunicação conectados pelo MediConnect para
              simplificar a jornada do paciente.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white">Navegação</h3>
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
                <Phone className="size-4" />
                (11) 4002-2026
              </span>
              <span className="inline-flex items-center gap-2">
                <Mail className="size-4" />
                contato@auroravida.com.br
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin className="size-4" />
                Av. das Palmeiras, 1200
              </span>
              <span className="inline-flex items-center gap-2">
                <Globe2 className="size-4" />
                Portal do paciente via MediConnect
              </span>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Clínica Aurora Vida.</span>
          <span>MediConnect | LGPD | Portal do paciente</span>
        </div>
      </div>
    </footer>
  )
}

function SectionIntro({ description, eyebrow, title }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <SectionKicker>{eyebrow}</SectionKicker>
      <h2 className="mt-4 text-3xl font-semibold leading-tight text-[#0f172a] sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-[#64748b]">{description}</p>
    </div>
  )
}

function SectionKicker({ children }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-[#eff6ff] px-3 py-1 text-sm font-semibold text-[#3b82f6]">
      <Sparkles className="size-4" />
      {children}
    </div>
  )
}

function LandingButton({ children, className = '', variant = 'primary', ...props }) {
  const variants = {
    ghost: 'border-transparent bg-transparent text-[#334155] hover:bg-[#eff6ff]',
    primary:
      'border-transparent bg-gradient-to-b from-[#4f93f7] to-[#3b82f6] text-white shadow-[0_2px_8px_rgba(59,130,246,0.28)] hover:brightness-110',
    primaryFlat: 'border-transparent bg-[#3b82f6] text-white hover:bg-[#2563eb]',
    secondary: 'border-blue-900/15 bg-white text-[#0f172a] hover:bg-[#f4f7fb]',
  }

  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}
