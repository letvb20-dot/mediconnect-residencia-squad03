# Arquitetura do Front-end

Este documento descreve o estado atual do front-end do MediConnect. Ele deve ser lido como um retrato do codigo em `src/`, nao como contrato definitivo da API.

---

## Visao Geral

O MediConnect e uma SPA em React 19 com Vite 8 e TailwindCSS 4. O app consome Supabase para Auth, PostgREST, Edge Functions e Storage, com alguns recursos locais em `localStorage` enquanto nao ha endpoint dedicado.

Fluxo principal:

```text
main.jsx
  -> applyTheme(getStoredTheme())
  -> AccessibilityProvider
  -> SocketProvider
  -> ToastProvider
  -> App.jsx
       -> roteamento manual
       -> AppShell
       -> Page
            -> hook e/ou repository
                 -> mapper
                 -> Supabase / localStorage
```

Nao ha React Router. A navegacao e resolvida em `App.jsx` por `resolveRoute()` e por `window.history.pushState`.

---

## Stack Tecnica

| Camada | Tecnologia |
|---|---|
| UI | React 19, Vite 8, TailwindCSS 4 |
| Componentes auxiliares | Radix Select/Switch, lucide-react |
| Editor rico | TipTap 3 |
| Datas | date-fns 4 e utilitarios locais |
| Backend/BaaS | Supabase Auth, PostgREST, Edge Functions, Storage |
| Estado global | Hooks React, Context API pontual, eventos de browser |
| Testes | `node:test` + `node:assert/strict` |
| Lint | ESLint 9 |

---

## Entrada da Aplicacao

Arquivo: `src/main.jsx`

- Importa `index.css`.
- Aplica tema antes do render: `applyTheme(getStoredTheme())`.
- Monta a arvore com `AccessibilityProvider`, `SocketProvider`, `ToastProvider` e `App`.

Providers atuais:

| Provider | Arquivo | Responsabilidade |
|---|---|---|
| `AccessibilityProvider` | `contexts/AccessibilityContext.jsx` | Preferencias locais de UI, contraste, animacoes e escala tipografica |
| `SocketProvider` | `providers/SocketProvider.jsx` | Socket simulado baseado em eventos `simulated_socket_push` |
| `ToastProvider` | `components/ui/toast.jsx` | Toasts via evento `app:show_toast` |

---

## Roteamento

Arquivo: `src/App.jsx`

O roteador manual retorna `{ element, title, withShell }`. Rotas publicas nao recebem `AppShell`; rotas autenticadas passam por RBAC antes de renderizar.

| Rota | Tela | Shell | Observacao |
|---|---|:---:|---|
| `/` | `LandingPage` | nao | Landing publica |
| `/login` | `LoginPage` | nao | Login por email/senha |
| `/cadastro` | `RegisterPage` | nao | Auto-cadastro de paciente com senha |
| `/recuperar-senha` | `ForgotPasswordPage` | nao | Reset por Edge Function |
| `/inicio`, `/home`, `/dashboard` | `HomePage` | sim | Painel |
| `/agenda` | `AgendaPage` | sim | Agenda operacional |
| `/agendamento` | `PatientSchedulingPage` | sim | Fluxo de agendamento do paciente |
| `/agendamento/:professionalId` | `PatientSchedulingDetailPage` | sim | Agenda de um profissional |
| `/pacientes` | `PatientsPage` | sim | Lista de pacientes |
| `/pacientes/:id` | `PatientDetailPage` | sim | Detalhe carregado por `patientRepository.getById` |
| `/profissionais` | `ProfessionalsPage` ou detalhe do proprio medico | sim | Medico ve o proprio perfil profissional |
| `/profissionais/:id` | `ProfessionalDetailPage` | sim | Detalhe profissional |
| `/consultas` | `VisitsPage` | sim | Fila de consultas/encaixe |
| `/laudos` | `ReportsPage` | sim | Laudos/relatorios clinicos |
| `/relatorios` | `AnalyticsPage` | sim | Analytics |
| `/comunicacao`, `/mensagens` | `MessagesPage` | sim | Mensagens e campanhas |
| `/usuarios` | `UsersPage` | sim | Gestao de usuarios |
| `/perfil` | `ProfilePage` | sim | Perfil do usuario logado |
| `/configuracoes`, `/config` | `SettingsPage` | sim | Configuracoes |

Observacao atual: `MedicalRecordsPage.jsx` existe, e `permissions.js` conhece `/prontuario`, mas `App.jsx` ainda nao conecta uma rota explicita para prontuario. Hoje esse caminho cai em `NotFoundPage` dentro do shell para perfis autorizados.

---

## RBAC

Arquivo: `src/config/permissions.js`

Roles canonicos:

- `admin`
- `gestor`
- `medico`
- `secretaria`
- `paciente`

`normalizeRole()` aceita aliases em portugues e ingles. `canAccess()` valida rotas, e `hasCapability()` valida capacidades especificas.

| Capability | Admin | Gestor | Medico | Secretaria | Paciente |
|---|:---:|:---:|:---:|:---:|:---:|
| `manageUsers` | sim | sim | nao | nao | nao |
| `hardDeletePatients` | sim | sim | nao | nao | nao |
| `canEditPatients` | sim | sim | nao | sim | nao |
| `canViewReports` | sim | sim | sim | nao | sim |
| `canViewMedicalRecords` | sim | sim | sim | nao | nao |
| `ownAppointmentsOnly` | nao | nao | sim | nao | nao |
| `accessSettings` | sim | sim | sim | sim | sim |

Criacao de usuarios:

- Admin pode criar `admin`, `gestor`, `medico`, `secretaria` e `paciente`.
- Gestor pode criar `medico`, `secretaria` e `paciente`.

---

## Autenticacao e Sessao

Arquivos: `src/repositories/authRepository.js`, `src/config/api.js`, `src/hooks/useAuth.js`

Fluxo atual:

1. Login chama `POST /auth/v1/token?grant_type=password`.
2. A sessao retornada e salva em `sessionStorage` na chave `mediconnect.auth.session`.
3. O perfil do usuario e resolvido por `POST /functions/v1/user-info`.
4. `profileRepository.getCurrentUserProfile()` normaliza perfil, role, ids de medico/paciente e avatar.
5. Logout chama `POST /auth/v1/logout` e sempre limpa a sessao local.
6. Mudancas de sessao disparam `mediconnect:auth-session-changed`.

A sessao e por aba. Ao fechar a aba, o usuario perde a sessao local.

---

## Camada de Dados

Padrao esperado:

```text
Page/Hook -> Repository -> Mapper -> API
```

Na pratica, algumas paginas ainda chamam repositories diretamente; esse e o padrao existente do projeto.

### Repositories

Pasta: `src/repositories/`

| Repository | Responsabilidade atual |
|---|---|
| `authRepository` | Login, logout, magic link, reset de senha e `user-info` |
| `patientRepository` | Listagem, detalhe, criacao, auto-cadastro, update agrupado, avatar e anexos |
| `appointmentRepository` | CRUD de agendamentos e cancelamento |
| `availabilityRepository` | Disponibilidade, excecoes e calculo local de slots |
| `reportRepository` | CRUD de laudos/relatorios clinicos |
| `userRepository` | Listagem, criacao, update, remocao e sincronizacao de medico/paciente |
| `professionalRepository` | Listagem e criacao de medicos/profissionais |
| `communicationRepository` | SMS, logs de comunicacao e templates |
| `medicalRecordRepository` | Prontuarios em tabelas candidatas |
| `profileRepository` | Perfil atual, update de perfil e avatar |
| `homeRepository` | Metricas do painel a partir de appointments/patients/professionals |
| `analyticsRepository` | KPIs e series analiticas derivadas |
| `notificationRepository` | Notificacoes locais por perfil |
| `settingsRepository` | Secoes estaticas da tela de configuracoes |
| `visitRepository` | Fila local de consultas/encaixes |
| `repositoryUtils` | Normalizacao de respostas e traducao de erros |

### Mappers

Pasta: `src/mappers/`

| Mapper | Papel |
|---|---|
| `appointmentMapper` | Converte status, datas e nomes entre Supabase e UI; `toApi(..., 'supabase')` envia apenas campos aceitos por appointments |
| `reportMapper` | Converte laudos; status de UI `finalized` vira enum de banco `delivered` |

---

## Configuracao da API

Arquivo: `src/config/api.js`

Variaveis aceitas:

| Variavel | Uso |
|---|---|
| `VITE_SUPABASE_URL` | Base do projeto Supabase; obrigatoria |
| `VITE_SUPABASE_ANON_KEY` | Chave anon publica; obrigatoria |
| `VITE_API_BASE_URL` | Base alternativa para Edge Functions |
| `VITE_SUPABASE_REST_URL` | Base PostgREST; opcional |
| `VITE_SUPABASE_FUNCTIONS_URL` | Base Edge Functions; opcional |
| `VITE_SUPABASE_STORAGE_URL` | Base Storage; opcional |

Quando URLs especificas nao sao informadas, o codigo monta:

- `${VITE_SUPABASE_URL}/rest/v1`
- `${VITE_SUPABASE_URL}/functions/v1`
- `${VITE_SUPABASE_URL}/storage/v1`

Headers:

- Publico/anonimo: `apikey` e, em alguns fluxos, `Authorization: Bearer <anonKey>`.
- Autenticado: `apikey` e `Authorization: Bearer <accessToken>`.

---

## Recursos Locais

Alguns recursos persistem no navegador:

| Recurso | Chave/evento |
|---|---|
| Tema | `localStorage: mediconnect.theme` |
| Acessibilidade/UI | `localStorage: mediconnect.settings.ui` |
| Notificacoes | `localStorage: mediconnect.notifications.v1` |
| Acao pendente de notificacao | `localStorage: mediconnect.pendingNotificationAction` |
| Fila de consultas | `localStorage: mediconnect.consultationQueue.v1` |
| Sessao auth | `sessionStorage: mediconnect.auth.session` |

`SettingsPage` ainda usa um endpoint local `http://localhost:3333/usuarios/me/preferencias` para preferencias de notificacao, com fallback visual quando esse backend local nao responde.

---

## Tema, Estilo e Acessibilidade

Arquivos: `src/utils/theme.js`, `src/index.css`, `src/pages/SettingsPage.jsx`, `src/contexts/AccessibilityContext.jsx`

Estado atual:

- O tema padrao de um navegador sem preferencia salva e `light`.
- A chave de tema e `mediconnect.theme`.
- `dark` so e aplicado quando salvo explicitamente.
- Valores ausentes ou invalidos sao normalizados para `light`.
- A tela de Configuracoes permite alternar entre `Escuro` e `Claro`.
- Preferencias de acessibilidade ficam em `mediconnect.settings.ui`.

`index.css` contem tokens e overrides para `:root[data-theme='light']`, `:root[data-theme='dark']` e alto contraste. O tema escuro existe e e suportado, mas nao e o padrao inicial.

---

## Componentes Reutilizaveis

| Componente | Arquivo | Uso |
|---|---|---|
| `AppShell` | `components/AppShell.jsx` | Sidebar, header, perfil e notificacoes |
| `Brand` | `components/Brand.jsx` | Logo/marca |
| `FeatureState` | `components/FeatureState.jsx` | Estados vazios, erro e bloqueio funcional |
| `RichTextEditor` | `components/RichTextEditor.jsx` | Editor TipTap para laudos |
| `AgendaDailyView` | `components/calendar/AgendaDailyView.jsx` | Calendario diario |
| `AgendaWeeklyView` | `components/calendar/AgendaWeeklyView.jsx` | Calendario semanal |
| `AgendaMonthlyView` | `components/calendar/AgendaMonthlyView.jsx` | Calendario mensal |
| `AvailabilityPanel` | `components/availability/AvailabilityPanel.jsx` | Disponibilidade e excecoes de agenda |
| `Select`, `Switch`, `ToastProvider` | `components/ui/*` | Primitivos de UI |
| `Button`, `Card`, `PageHeader`, `DarkField` | `components/ui.jsx` | Componentes legados compartilhados |

---

## Utilitarios

| Modulo | Responsabilidade |
|---|---|
| `utils/brFormatters.js` | CPF, telefone, validacao simples de nome |
| `utils/inputSanitizers.js` | Sanitizacao e mascaras de campos |
| `utils/agendaDate.js` | Datas locais e ordenacao por horario |
| `utils/appointmentMetrics.js` | No-show e status de comparecimento |
| `utils/communicationEligibility.js` | Elegibilidade LGPD/opt-in para comunicacao |
| `utils/patientIdentity.js` | Resolucao de paciente vinculado ao perfil |
| `utils/theme.js` | Tema padrao, leitura, aplicacao e persistencia |

---

## Limites de Input

Aplicados em `App.jsx` por listeners globais:

| Tipo | Limite |
|---|---|
| Inputs de texto livre | 255 caracteres |
| Textareas | 2.000 caracteres |
| Conteudo rico TipTap/ProseMirror | 12.000 caracteres |

Campos como data, hora, numero, senha, checkbox e file nao recebem esse limite global.

---

## Datas

Evite `new Date('YYYY-MM-DD')` para datas puras, pois o parsing UTC pode deslocar o dia no fuso do Brasil. Use `parseLocalDate()` ou construa `new Date(ano, mes - 1, dia)`.

---

## Tratamento de Erros

`repositoryUtils.js` centraliza:

- `getResponseError()`
- `translateErrorMessage()`
- `normalizeCollection()`
- `normalizeItem()`
- `fetchJsonWithFallback()` para casos pontuais de compatibilidade

O projeto traduz erros comuns de Supabase/Auth/PostgREST para mensagens em pt-BR e evita esconder erros de contrato quando a API recusa dados enviados pelo usuario.

---

## Testes

Pasta: `tests/`

O projeto possui testes de permissao, mappers, repositorios, identidade do paciente, tema, disponibilidade, fila de consultas, notificacoes, sanitizacao e metricas.

Comando:

```bash
npm test
```

Estado verificado nesta revisao: 78 testes passando.
