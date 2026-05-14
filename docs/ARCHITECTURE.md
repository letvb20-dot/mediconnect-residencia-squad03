# Arquitetura do Front-end

Este documento descreve a arquitetura, padroes e convencoes do MediConnect.

---

## Visao Geral

O MediConnect e uma SPA (Single Page Application) em React 19 com Vite, consumindo um backend Supabase (Auth, PostgREST, Edge Functions, Storage). Nao usa React Router — o roteamento e feito manualmente no `App.jsx` via `resolveRoute()`.

```
Browser
  |
  App.jsx (roteador)
  |
  AppShell (sidebar + header + notificacoes)
  |
  Page (componente da rota ativa)
    |
    Custom Hook (logica de negocio + estado)
      |
      Repository (fetch para Supabase)
        |
        Mapper (API <-> UI)
```

---

## Padrao MVC Adaptado (Repository -> Mapper -> Hook -> Page)

### 1. Repository (Acesso a Dados)

Pasta: `src/repositories/`

- Unica funcao: fazer `fetch` na API e devolver JSON
- Nao contem regras de negocio, filtragem ou formatacao
- Cada metodo chama exatamente um endpoint documentado, sem fallback em HTTP 400
- Usa `getAuthenticatedHeaders()` para rotas protegidas e `getAnonHeaders()` para rotas publicas
- Erros traduzidos para portugues via `getResponseError()` em `repositoryUtils.js`

Repositorios existentes (16):

| Repositorio | Responsabilidade |
|---|---|
| `authRepository` | Login, logout, magic link, reset senha, user info |
| `patientRepository` | CRUD pacientes, auto-cadastro, avatar |
| `appointmentRepository` | CRUD agendamentos |
| `availabilityRepository` | Disponibilidade medica, excecoes, slots |
| `reportRepository` | CRUD laudos |
| `userRepository` | Gestao de usuarios (criar, editar, excluir) |
| `professionalRepository` | Listagem e criacao de medicos |
| `communicationRepository` | Envio de SMS, historico de mensagens, templates |
| `medicalRecordRepository` | CRUD prontuarios |
| `profileRepository` | Perfil do usuario, avatar |
| `homeRepository` | Dados do dashboard |
| `analyticsRepository` | Metricas, KPIs, performance |
| `notificationRepository` | Notificacoes (localStorage) |
| `settingsRepository` | Secoes de configuracao |
| `visitRepository` | Fila de atendimento |
| `repositoryUtils` | Funcoes compartilhadas (erro, normalizacao) |

### 2. Mapper (Traducao de Dados)

Pasta: `src/mappers/`

- Traduz dados do banco para formato que a UI espera e vice-versa
- Regra: se o banco retorna `full_name`, o mapper converte para `name` e toda a aplicacao usa `name`
- Dois mappers existentes:
  - `appointmentMapper` — `toUi()` e `toApi(uiData, dialect)` com dialetos `supabase` e `api`
  - `reportMapper` — `toUi()` e `toApi()`

### 3. Custom Hook (Controlador)

Pasta: `src/hooks/`

- Puxa dados do repositorio, passa pelo mapper, gerencia estado
- Encapsula `useEffect`, `useState`, logica de negocio
- Hooks existentes:
  - `useAuth` — sessao, role, perfil, loading, authError
  - `useAgenda` — agendamentos, filtros, modais, escopo medico/global

### 4. Page (View)

Pasta: `src/pages/`

- Componentes visuais que consomem hooks e renderizam HTML/Tailwind
- Nao fazem fetch direto — delegam para hooks ou repositories

---

## Roteamento

O roteamento vive em `App.jsx` na funcao `resolveRoute(pathname, navigate, role, profile, user)`.

- Retorna `{ element, title, withShell }` para cada rota
- Rotas protegidas verificam `canAccess(role, pathname)` antes de renderizar
- Paginas carregadas com `React.lazy()` + `Suspense` para code-splitting
- Sem React Router — navegacao via `window.location` e funcao `navigate()`

---

## Sistema de Permissoes (RBAC)

Arquivo: `src/config/permissions.js`

### Funcoes principais

- `canAccess(role, pathname)` — verifica se o perfil pode acessar a rota
- `hasCapability(role, capability)` — verifica capacidade especifica
- `normalizeRole(role)` — normaliza string de role (suporta 20+ aliases em PT/EN)

### Capabilities por perfil

| Capability | Admin | Gestor | Medico | Secretaria | Paciente |
|---|:---:|:---:|:---:|:---:|:---:|
| manageUsers | sim | sim | - | - | - |
| hardDeletePatients | sim | sim | - | - | - |
| canEditPatients | sim | sim | - | sim | - |
| canViewReports | sim | sim | sim | - | - |
| canViewMedicalRecords | sim | sim | sim | - | - |
| ownAppointmentsOnly | - | - | sim | - | - |
| accessSettings | sim | sim | sim | sim | sim |

### Criacao de usuarios

- Admin pode criar: admin, gestor, medico, secretaria, paciente
- Gestor pode criar: medico, secretaria, paciente

---

## Autenticacao

Arquivo: `src/hooks/useAuth.js` + `src/config/api.js`

1. Login via `POST /auth/v1/token?grant_type=password`
2. Token JWT salvo em `sessionStorage` (chave: `mediconnect.auth.session`)
3. Hook `useAuth()` resolve o role via `POST /functions/v1/user-info`
4. Resolucao de role tenta multiplas fontes: `data.roles[]`, `data.role`, `profile.role`, `metadata.role`, flags de permissao
5. Sincronizacao entre abas via `AUTH_SESSION_CHANGED_EVENT`
6. Logout chama `POST /auth/v1/logout` e limpa sessionStorage

---

## Configuracao da API

Arquivo: `src/config/api.js`

Variaveis de ambiente (todas prefixadas `VITE_`):

| Variavel | Uso |
|---|---|
| `VITE_SUPABASE_URL` | URL base do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave publica para requests anonimos |
| `VITE_API_BASE_URL` | Base para Edge Functions |
| `VITE_SUPABASE_REST_URL` | Base para PostgREST |
| `VITE_SUPABASE_FUNCTIONS_URL` | Base para Edge Functions |
| `VITE_SUPABASE_STORAGE_URL` | Base para Storage |

Headers:
- Anonimo: `apikey` + `Authorization: Bearer <anonKey>`
- Autenticado: `apikey` + `Authorization: Bearer <accessToken>`

---

## Componentes Reutilizaveis

| Componente | Arquivo | Uso |
|---|---|---|
| AppShell | `components/AppShell.jsx` | Layout com sidebar, header, notificacoes |
| DarkField | `components/ui.jsx` | Campo de formulario (label + input) |
| Button | `components/ui.jsx` | Botao com variantes (primary, ghost, danger) |
| Card | `components/ui.jsx` | Card container |
| PageHeader | `components/ui.jsx` | Cabecalho de pagina |
| RichTextEditor | `components/RichTextEditor.jsx` | Editor TipTap para laudos |
| AgendaDailyView | `components/calendar/` | Vista diaria do calendario |
| AgendaWeeklyView | `components/calendar/` | Vista semanal |
| AgendaMonthlyView | `components/calendar/` | Vista mensal |
| Brand | `components/Brand.jsx` | Logo e marca |
| FeatureState | `components/FeatureState.jsx` | Empty state, loading, erro |

---

## Utilitarios

| Modulo | Arquivo | Funcoes |
|---|---|---|
| Formatadores BR | `utils/brFormatters.js` | `maskBrazilianPhone`, `maskCpf`, `isValidPersonName` |
| Sanitizacao | `utils/inputSanitizers.js` | `sanitizeFieldValue`, `sanitizePlainText` |
| Datas | `utils/agendaDate.js` | `formatLocalDateInput`, `parseLocalDate`, `sortAppointmentsByTime` |
| Tema | `utils/theme.js` | `getStoredTheme`, `setStoredTheme` |

---

## Limites de Input

| Tipo | Limite |
|---|---|
| Campos de texto | 255 caracteres |
| Textareas | 2.000 caracteres |
| Editor rico (TipTap) | 12.000 caracteres |

Enforcement via listeners DOM em `App.jsx` (`focusin`, `input`, `beforeinput`).

---

## Tema e Estilo

- Dark theme padrao: `#0a0a0a` (bg), `#e5e5e5` (texto), `#3b82f6` (accent azul)
- Cinzas: `#171717`, `#1a1a1a`, `#262626`, `#303030`, `#404040`
- Todo o estilo via utility classes do TailwindCSS 4
- Tema salvo em `localStorage` (chave: `mediconnect.settings.ui`)
- Classes CSS condicionais: `settings-animations-off`, `settings-high-contrast`, `settings-compact`

---

## Convencoes

- Idioma da UI: portugues brasileiro (pt-BR)
- Idioma do codigo: ingles (nomes de funcoes, variaveis, componentes)
- Arquivos JSX para componentes React, JS para logica pura
- Testes em `.test.mjs` usando `node:test` + `node:assert/strict`
- Sem TypeScript — projeto JS puro
- Sem React Router — roteamento manual
- Sem state management global (Redux, Zustand) — `useState` + hooks customizados
- Sessao em `sessionStorage` (perdida ao fechar aba)
- Notificacoes em `localStorage` (persistem entre sessoes)

---

## Tratamento de Datas

`new Date('YYYY-MM-DD')` interpreta como UTC e pode deslocar para o dia anterior no fuso BR (UTC-3). Usar `parseLocalDate` ou processar componentes (ano, mes, dia) manualmente antes de criar o objeto `Date`.

---

## Tratamento de Erros

- Repositorios traduzem erros HTTP para portugues via `translateErrorMessage()` em `repositoryUtils.js`
- 40+ traducoes de erros do Supabase (rede, auth, rate limiting, JWT, RLS, constraints)
- Componente `RouteErrorFallback` em `App.jsx` para erros de renderizacao
- Estados de erro exibidos em cards vermelhos com mensagem e botao de reload
