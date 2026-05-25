# Relatorio de Auditoria - Estado Atual dos Repositories e Contratos

**Projeto:** MediConnect / Squad 03
**Escopo:** `src/repositories/`, `src/mappers/`, rotas principais, persistencias locais e pontos de contrato com API.

Este relatorio consolida o estado atual do projeto. O relatorio antigo descrevia uma intervencao pontual contra o Apidog; esta versao prioriza o que o codigo faz hoje.

---

## Sumario Executivo

Foram revisados:

- 16 arquivos em `src/repositories/`
- 2 mappers em `src/mappers/`
- Configuracao de API em `src/config/api.js`
- Regras de permissao em `src/config/permissions.js`
- Inicializacao de tema em `src/main.jsx` e `src/utils/theme.js`
- Testes em `tests/`

Resultado atual:

- O app usa Supabase Auth, REST, Edge Functions e Storage.
- A sessao fica em `sessionStorage` na chave `mediconnect.auth.session`.
- O tema padrao para navegador sem preferencia salva e `light`.
- O tema fica em `localStorage` na chave `mediconnect.theme`.
- Acessibilidade/UI ficam em `localStorage` na chave `mediconnect.settings.ui`.
- A fila de consultas e as notificacoes ainda sao recursos locais.
- O projeto tem 78 testes passando.

---

## Estado dos Repositories

| Repository | Estado atual | Pontos de atencao |
|---|---|---|
| `authRepository` | Alinhado ao fluxo Supabase/Edge Functions | Sem fallback para `/auth/v1/user` |
| `userRepository` | Usa Edge Functions e tabelas de perfil | Depende de `profiles`/`user_profiles`, `user_roles`, `doctors` e `medicos` |
| `patientRepository` | CRUD, auto-cadastro, avatar e anexos | Usa endpoint com senha `register-patient-with-password` e campos estendidos |
| `professionalRepository` | Lista doctors e cria via Edge Function | Mescla perfis quando possivel |
| `appointmentRepository` | CRUD via PostgREST com mapper enxuto | Status normalizado entre pt-BR e enum da API |
| `availabilityRepository` | Disponibilidade/excecoes via REST | Slots sao calculados no front-end, sem Edge Function |
| `reportRepository` | CRUD de reports via REST | Enum atual usa `draft`/`delivered` |
| `communicationRepository` | SMS via Edge Function; logs/templates via tabelas candidatas | Tabelas de comunicacao devem ser formalizadas |
| `medicalRecordRepository` | Prontuario via tabelas candidatas | Pagina existe, mas rota nao esta ligada em `App.jsx` |
| `profileRepository` | Normaliza perfil, atualiza dados e avatar | Procura perfil por varios identificadores |
| `homeRepository` | Calcula painel por dados agregados | Derivado de appointments/patients/professionals |
| `analyticsRepository` | Calcula KPIs e series | Derivado, nao endpoint proprio |
| `notificationRepository` | Notificacoes locais | Persistencia em `localStorage` |
| `settingsRepository` | Secoes estaticas | Preferencias de notificacao usam endpoint local em `SettingsPage` |
| `visitRepository` | Fila local de consultas | Persistencia em `localStorage` |
| `repositoryUtils` | Utilitarios de erro/resposta | `fetchJsonWithFallback` ainda existe para casos de compatibilidade |

---

## Principais Divergencias Encontradas e Corrigidas na Documentacao

### Tema

Documentacao antiga dizia que o tema escuro era padrao e que a chave era `mediconnect.settings.ui`. O codigo atual mostra:

- `DEFAULT_THEME = 'light'`
- chave real: `mediconnect.theme`
- `mediconnect.settings.ui` guarda acessibilidade e preferencias visuais, nao o tema principal

Impacto: novo navegador/usuario sem preferencia salva abre em modo claro. Um usuario novo no mesmo navegador pode herdar um `mediconnect.theme` salvo anteriormente.

### Auto-cadastro de paciente

Documentacao antiga dizia que o auto-cadastro com senha havia sido removido. O codigo atual possui:

- `patientRepository.registerPublic()`
- `patientRepository.registerPublicWithPassword()`
- `RegisterPage` chama `registerPublicWithPassword()`

Impacto: `/cadastro` esta modelado para criar acesso com email, CPF, celular e senha.

### Slots de agenda

Documentacao antiga citava `POST /functions/v1/get-available-slots` como caminho principal. O codigo atual calcula slots no front-end:

- le `doctor_availability`
- le `doctor_exceptions`
- combina disponibilidade regular, disponibilidade extra e bloqueios

Impacto: o endpoint de slots nao e usado por `availabilityRepository.getAvailableSlots()`.

### Reports

Documentacao antiga citava enum `draft|completed`. O mapper atual usa:

- UI: `draft|finalized`
- banco/API: `draft|delivered`

Impacto: contratos e Apidog devem ser conferidos para evitar divergencia entre `completed` e `delivered`.

### Prontuario

`MedicalRecordsPage.jsx` e `medicalRecordRepository.js` existem, e `permissions.js` autoriza `/prontuario` para alguns perfis. Porem `App.jsx` nao possui rota explicita para essa pagina.

Impacto: caminho de prontuario nao esta funcional como rota do app no estado atual.

---

## Mapeamento de API por Dominio

### Autenticacao

| Endpoint | Metodo | Uso |
|---|---|---|
| `/auth/v1/token?grant_type=password` | POST | Login |
| `/auth/v1/otp` | POST | Magic link |
| `/auth/v1/logout` | POST | Logout |
| `/functions/v1/request-password-reset` | POST | Recuperacao de senha |
| `/functions/v1/user-info` | POST | Perfil do usuario logado |

### Usuarios

| Endpoint/tabela | Metodo | Uso |
|---|---|---|
| `/functions/v1/create-user` | POST | Criar usuario |
| `/functions/v1/create-user-with-password` | POST | Criar usuario com senha |
| `/functions/v1/user-info-by-id` | POST | Buscar usuario por id |
| `/functions/v1/delete-user` | POST | Remover usuario |
| `/rest/v1/profiles` | GET/PATCH | Listar/atualizar perfis |
| `/rest/v1/user_profiles` | GET/PATCH | Tabela alternativa de perfis |
| `/rest/v1/user_roles` | GET | Enriquecer roles |

### Pacientes

| Endpoint/tabela | Metodo | Uso |
|---|---|---|
| `/rest/v1/patients` | GET | Listagem e detalhe |
| `/rest/v1/patients?id=eq.{id}` | PATCH | Update em grupos |
| `/rest/v1/patients?id=eq.{id}` | DELETE | Hard delete |
| `/functions/v1/create-patient` | POST | Criacao autenticada |
| `/functions/v1/register-patient` | POST | Auto-cadastro publico sem senha |
| `/functions/v1/register-patient-with-password` | POST | Auto-cadastro publico com senha |
| `/storage/v1/object/avatars/...` | POST | Avatar |
| `/storage/v1/object/{patient-attachments|attachments|avatars}/...` | POST | Anexos |

### Medicos e profissionais

| Endpoint/tabela | Metodo | Uso |
|---|---|---|
| `/rest/v1/doctors` | GET/PATCH | Listar/sincronizar medicos |
| `/rest/v1/medicos` | GET/PATCH | Tabela alternativa |
| `/functions/v1/create-doctor` | POST | Criar medico |

### Agenda e disponibilidade

| Endpoint/tabela | Metodo | Uso |
|---|---|---|
| `/rest/v1/appointments` | GET/POST | Listar/criar agendamentos |
| `/rest/v1/appointments?id=eq.{id}` | PATCH | Atualizar/cancelar |
| `/rest/v1/doctor_availability` | GET/POST | Disponibilidade |
| `/rest/v1/doctor_availability?id=eq.{id}` | PATCH/DELETE | Update/remocao |
| `/rest/v1/doctor_exceptions` | GET/POST | Bloqueios e disponibilidade extra |

### Laudos, comunicacao e prontuarios

| Endpoint/tabela | Metodo | Uso |
|---|---|---|
| `/rest/v1/reports` | GET/POST | Laudos |
| `/rest/v1/reports?id=eq.{id}` | PATCH/DELETE | Update/remocao |
| `/functions/v1/send-sms` | POST | SMS |
| `/rest/v1/communication_logs`, `/message_logs`, `/messages` | GET/POST | Historico de comunicacao |
| `/rest/v1/communication_templates`, `/message_templates` | GET | Templates |
| `/rest/v1/medical_records`, `/patient_records`, `/records` | GET/POST/PATCH | Prontuarios |

---

## Recursos Sem Endpoint Formal no Front-end Atual

| Recurso | Persistencia atual | Risco |
|---|---|---|
| Notificacoes | `localStorage: mediconnect.notifications.v1` | Nao sincroniza entre dispositivos |
| Fila de consultas | `localStorage: mediconnect.consultationQueue.v1` | Nao e compartilhada entre usuarios |
| Preferencias de notificacao | `http://localhost:3333/usuarios/me/preferencias` com fallback | Depende de backend local fora do Supabase |
| Socket | Mock por evento `simulated_socket_push` | Nao ha canal real de realtime |

---

## Validacao Automatizada

Comando:

```bash
npm test
```

Estado verificado nesta revisao:

```text
tests 78
pass 78
fail 0
```

Cobertura funcional atual inclui:

- permissao/RBAC
- mappers de appointments e reports
- repositorios de paciente, usuario, perfil, disponibilidade, notificacoes e fila
- traducao de erros
- tema
- identidade do paciente
- elegibilidade LGPD de comunicacao
- metricas de agenda/no-show
- sanitizacao de campos

---

## Recomendacoes

1. Formalizar no Apidog os endpoints e tabelas que o front usa mas que eram ausentes em documentacao antiga.
2. Decidir se disponibilidade de slots deve continuar no front-end ou ser responsabilidade de uma Edge Function.
3. Conectar `MedicalRecordsPage` a uma rota real ou remover referencias de permissao/menu enquanto a tela nao estiver exposta.
4. Padronizar enum de reports (`delivered` ou `completed`) entre banco, API, mapper e documentacao.
5. Substituir o backend local de preferencias de notificacao por endpoint versionado do projeto ou persistencia Supabase.
6. Avaliar migracao da fila de consultas e notificacoes para persistencia remota se forem recursos multiusuario.
