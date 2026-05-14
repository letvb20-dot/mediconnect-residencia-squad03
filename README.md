# MediConnect

Sistema de gestao clinica com foco na reducao de absenteismo, automacao de laudos e inteligencia operacional para clinicas medicas brasileiras.

---

## Sobre o Produto

O MediConnect combina gestao clinica completa (prontuario, laudos, agendamento e relatorios), sistema anti-absenteismo com comunicacao automatizada (WhatsApp, SMS, e-mail) e analytics operacional em uma unica plataforma. Cinco perfis de acesso (admin, gestor, medico, secretaria e paciente) garantem que cada usuario veja apenas o necessario para seu trabalho.

---

## Stack Tecnica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Vite 8, TailwindCSS 4 |
| Editor de texto | TipTap 3 (extensoes: StarterKit, TextAlign, Underline) |
| Datas | date-fns 4 (locale pt-BR) |
| Backend / BaaS | Supabase (Auth, PostgREST, Edge Functions, Storage) |
| Banco de dados | PostgreSQL (gerenciado pelo Supabase) |
| Testes | Node.js test runner nativo (`node:test` + `node:assert/strict`) |
| Linting | ESLint 9 |

---

## Como Rodar

### Pre-requisitos

- Node.js >= 18
- npm

### Setup

```bash
# 1. Clonar o repositorio
git clone https://github.com/letvb20-dot/mediconnect-residencia-squad03.git
cd mediconnect-residencia-squad03

# 2. Instalar dependencias
npm install

# 3. Configurar variaveis de ambiente
# Criar arquivo .env na raiz com:
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_API_BASE_URL=https://<projeto>.supabase.co/functions/v1
VITE_SUPABASE_REST_URL=https://<projeto>.supabase.co/rest/v1
VITE_SUPABASE_FUNCTIONS_URL=https://<projeto>.supabase.co/functions/v1
VITE_SUPABASE_STORAGE_URL=https://<projeto>.supabase.co/storage/v1

# 4. Iniciar servidor de desenvolvimento
npm run dev
# Acesse http://localhost:5173
```

### Comandos disponiveis

| Comando | Descricao |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` | Build de producao |
| `npm run preview` | Preview do build de producao |
| `npm run lint` | Linting com ESLint |
| `npm test` | Rodar todos os testes |

---

## Perfis e Permissoes

O sistema possui 5 perfis com permissoes granulares:

| Funcionalidade | Admin | Gestor | Medico | Secretaria | Paciente |
|---|:---:|:---:|:---:|:---:|:---:|
| Painel (dashboard) | sim | sim | sim | sim | sim |
| Agenda | sim | sim | sim (so propria) | sim | - |
| Pacientes - visualizar | sim | sim | sim | sim | - |
| Pacientes - criar/editar | sim | sim | - | sim | - |
| Pacientes - excluir (hard delete) | sim | sim | - | - | - |
| Laudos/Relatorios | sim | sim | sim | - | - |
| Prontuarios | sim | sim | sim | - | - |
| Analytics | sim | sim | - | - | - |
| Comunicacao (3 canais) | sim | sim | sim | WhatsApp/SMS | - |
| Gestao de usuarios | sim | sim | - | - | - |
| Criar usuarios admin/gestor | sim | - | - | - | - |
| Configuracoes | sim | sim | sim | sim | sim |
| Perfil - editar | sim | sim | - | - | sim |

---

## Estrutura do Projeto

```
src/
  assets/            # Imagens e icones
  components/        # Componentes reutilizaveis
    calendar/        #   Views de calendario (diaria, semanal, mensal)
    AppShell.jsx     #   Layout principal (sidebar, header, notificacoes)
    Brand.jsx        #   Logo e marca
    RichTextEditor.jsx # Editor TipTap para laudos
    ui.jsx           #   Primitivos de UI (Button, Card, DarkField)
    FeatureState.jsx #   Estados vazios, loading, erro
  config/
    api.js           # Configuracao Supabase, headers, sessao
    permissions.js   # RBAC: roles, rotas, capabilities, nav items
  data/              # Dados estaticos
  hooks/
    useAuth.js       # Estado de autenticacao e resolucao de role
    useAgenda.js     # Logica de agendamento (escopo medico vs global)
  mappers/
    appointmentMapper.js  # API <-> UI para agendamentos
    reportMapper.js       # API <-> UI para laudos
  pages/
    AuthPages.jsx         # Login, cadastro, recuperacao de senha
    HomePage.jsx          # Dashboard com metricas e alertas
    AgendaPage.jsx        # Calendario e CRUD de agendamentos
    PatientsPage.jsx      # CRUD de pacientes + detalhe
    ReportsPage.jsx       # CRUD de laudos com editor rico
    AnalyticsPage.jsx     # KPIs, graficos, performance
    MessagesPage.jsx      # Comunicacao (WhatsApp, SMS, e-mail)
    UsersPage.jsx         # Gestao de usuarios
    ProfilePage.jsx       # Perfil do usuario logado
    SettingsPage.jsx      # Configuracoes do sistema
    VisitsPage.jsx        # Fila de atendimento
    MedicalRecordsPage.jsx # Prontuarios
    NotFoundPage.jsx      # Pagina 404
  repositories/      # Camada de acesso a API (16 repositorios)
  utils/             # Formatadores BR, sanitizacao, datas, tema
  App.jsx            # Roteador principal
  main.jsx           # Entry point
  index.css          # Estilos globais + Tailwind

tests/               # Testes (node:test)
docs/                # Documentacao tecnica
```

---

## Rotas

| Rota | Pagina | Perfis com acesso |
|---|---|---|
| `/login` | Login | Publico |
| `/cadastro` | Auto-cadastro de paciente | Publico |
| `/recuperar-senha` | Recuperacao de senha | Publico |
| `/inicio` | Dashboard | Todos autenticados |
| `/agenda` | Agenda | Admin, Gestor, Medico, Secretaria |
| `/pacientes` | Lista de pacientes | Admin, Gestor, Medico, Secretaria |
| `/pacientes/:id` | Detalhe do paciente | Admin, Gestor, Medico, Secretaria |
| `/laudos` | Laudos medicos | Admin, Gestor, Medico |
| `/relatorios` | Analytics | Admin, Gestor |
| `/comunicacao` | Mensagens | Admin, Gestor, Medico, Secretaria |
| `/consultas` | Fila de atendimento | Admin, Gestor |
| `/usuarios` | Gestao de usuarios | Admin, Gestor |
| `/prontuario/:id` | Prontuario medico | Admin, Gestor, Medico |
| `/perfil` | Perfil do usuario | Todos autenticados |
| `/configuracoes` | Configuracoes | Todos autenticados |

---

## API

O backend e composto por 32 endpoints no Supabase, documentados no Apidog: https://do5wegrct3.apidog.io/

Categorias: Autenticacao (5), Usuarios (6), Pacientes (6), Medicos (2), Agendamentos (3), Disponibilidade (6), Laudos (3), SMS (1), Storage (2).

Detalhes completos no catalogo de endpoints: [docs/RELATORIO_AUDITORIA.md](docs/RELATORIO_AUDITORIA.md)

---

## Testes

```bash
npm test
# Roda: permissions, mappers, repositoryUtils, patientRepository
# 11 testes / 4 suites
```

---

## Documentacao

| Documento | Descricao |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura, padroes e convencoes |
| [docs/RELATORIO_AUDITORIA.md](docs/RELATORIO_AUDITORIA.md) | Auditoria dos repositorios vs API (32 endpoints) |
| [docs/repository-api-audit.md](docs/repository-api-audit.md) | Mapeamento endpoint-repositorio |
