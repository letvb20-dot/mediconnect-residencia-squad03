# Auditoria de Implementacao e Mapeamento da API

Este documento resume como o codigo atual conecta repositories, tabelas REST, Edge Functions, Storage e recursos locais. Ele substitui mapeamentos antigos que ainda mencionavam fallbacks removidos ou endpoints que mudaram.

---

## Regras de leitura

- `apiConfig.restUrl` aponta para `/rest/v1`.
- `apiConfig.functionsUrl` aponta para `/functions/v1`.
- `apiConfig.storageUrl` aponta para `/storage/v1`.
- Rotas autenticadas usam `getAuthenticatedHeaders()`.
- Rotas publicas usam `getAnonHeaders()` ou `getPublicHeaders()`.
- Alguns repositories usam tabelas candidatas por compatibilidade com nomes diferentes no backend real.

---

## Autenticacao

Arquivo: `src/repositories/authRepository.js`

| Metodo | Chamada atual | Observacao |
|---|---|---|
| `login` | `POST /auth/v1/token?grant_type=password` | Salva sessao em `sessionStorage` |
| `requestPasswordReset` | `POST /functions/v1/request-password-reset` | Envia `redirect_url` para `/login` |
| `sendMagicLink` | `POST /auth/v1/otp` | Usa headers anonimos |
| `getUser` | `POST /functions/v1/user-info` | Nao ha fallback para `/auth/v1/user` |
| `logout` | `POST /auth/v1/logout` | Limpa sessao local mesmo se a rede falhar |

---

## Usuarios e Perfis

Arquivo: `src/repositories/userRepository.js`

| Metodo | Chamada atual | Observacao |
|---|---|---|
| `getAll` | `GET /rest/v1/profiles`, depois `GET /rest/v1/user_profiles` | Tabelas candidatas; tambem consulta `user_roles` e doctors |
| `getById` | `POST /functions/v1/user-info-by-id` | Body `{ user_id }`, nao path param |
| `create` | `POST /functions/v1/create-user` | Pode acionar criacao/sincronizacao de paciente |
| `createWithPassword` | `POST /functions/v1/create-user-with-password` | Usado por criacao administrativa com senha |
| `update` | `PATCH /rest/v1/{profiles|user_profiles}?id=eq.{id}` | Atualiza perfil e tenta sincronizar medico/paciente |
| `remove` | `POST /functions/v1/delete-user` | Body `{ userId }` |

Consultas auxiliares:

- `GET /rest/v1/user_roles`
- `GET /rest/v1/doctors`
- `GET /rest/v1/medicos`
- `PATCH /rest/v1/doctors` ou `PATCH /rest/v1/medicos` para sincronizar dados medicos quando aplicavel.

---

## Pacientes

Arquivo: `src/repositories/patientRepository.js`

| Metodo | Chamada atual | Observacao |
|---|---|---|
| `getAll` | `GET /rest/v1/patients` | Filtros: `select`, `limit`, `offset`, `order`, `full_name`, `cpf` |
| `getById` | `GET /rest/v1/patients?id=eq.{id}` + appointments | Monta detalhe enriquecido |
| `getDirectoryRows` | `GET /rest/v1/patients` + `GET /rest/v1/appointments` | Calcula ultima/proxima consulta |
| `create` | `POST /functions/v1/create-patient` | Envia payload validado e enriquecido |
| `createWithValidation` | Alias de `create` | Mantido por compatibilidade interna |
| `registerPublic` | `POST /functions/v1/register-patient` | Auto-cadastro publico sem senha |
| `registerPublicWithPassword` | `POST /functions/v1/register-patient-with-password` | Auto-cadastro publico com senha, usado pela tela `/cadastro` |
| `update` | `PATCH /rest/v1/patients?id=eq.{id}` | Envia grupo core e grupos opcionais, sem mascarar erro da API |
| `uploadAvatar` | `POST /storage/v1/object/avatars/patients/{id}/avatar.{ext}` | Depois persiste `avatar_url` em patients |
| `uploadAttachment` | `POST /storage/v1/object/{bucket}/patients/{id}/attachments/...` | Tenta `patient-attachments`, `attachments`, `avatars` |
| `remove` | `DELETE /rest/v1/patients?id=eq.{id}` | Hard delete |

Ponto de atencao: o codigo atual usa campos estendidos em `create`/`update` quando existem no backend. Se o banco recusar algum campo enviado, a UI deve mostrar o erro, nao manter apenas estado local.

---

## Profissionais / Medicos

Arquivo: `src/repositories/professionalRepository.js`

| Metodo | Chamada atual | Observacao |
|---|---|---|
| `getAll` | `GET /rest/v1/doctors` | Mescla dados de `profiles`/`user_profiles` quando possivel |
| `create` | `POST /functions/v1/create-doctor` | Envia dados exigidos de medico |

---

## Agendamentos

Arquivo: `src/repositories/appointmentRepository.js`

| Metodo | Chamada atual | Observacao |
|---|---|---|
| `getAll` | `GET /rest/v1/appointments` | Select inclui `patients(full_name)` e `doctors(full_name)` |
| `create` | `POST /rest/v1/appointments` | Usa `Prefer: return=representation` |
| `update` | `PATCH /rest/v1/appointments?id=eq.{id}` | Usa mapper supabase |
| `cancel` | `PATCH /rest/v1/appointments?id=eq.{id}` | Normaliza status para `cancelled` |

Campos enviados pelo mapper supabase:

- `doctor_id`
- `patient_id`
- `scheduled_at`
- `duration_minutes`
- `status`
- `created_by` quando necessario

Status aceitos no codigo:

- UI: `Agendado`, `Confirmado`, `Realizado`, `Cancelado`
- API: `requested`, `confirmed`, `completed`, `cancelled`

---

## Disponibilidade e Excecoes

Arquivo: `src/repositories/availabilityRepository.js`

| Metodo | Chamada atual | Observacao |
|---|---|---|
| `getAll` | `GET /rest/v1/doctor_availability` | Filtros por medico, weekday, active, appointment_type |
| `create` | `POST /rest/v1/doctor_availability` | Valida medico, dia, horario e slot |
| `update` | `PATCH /rest/v1/doctor_availability?id=eq.{id}` | Payload incremental |
| `remove` | `DELETE /rest/v1/doctor_availability?id=eq.{id}` | Remove disponibilidade |
| `getExceptions` | `GET /rest/v1/doctor_exceptions` | Filtros por medico, data e tipo |
| `createException` | `POST /rest/v1/doctor_exceptions` | Usa `created_by` da sessao |
| `getAvailableSlots` | Sem chamada a Edge Function | Calcula slots localmente a partir de availability + exceptions |

Ponto importante: o endpoint `POST /functions/v1/get-available-slots` nao e usado no codigo atual. A disponibilidade exibida no modal vem do cadastro local de disponibilidade e excecoes.

---

## Laudos / Relatorios Clinicos

Arquivos: `src/repositories/reportRepository.js`, `src/mappers/reportMapper.js`

| Metodo | Chamada atual | Observacao |
|---|---|---|
| `getInitialReports` | `GET /rest/v1/reports` | Filtros por paciente, status, `created_by` e `order` |
| `create` | `POST /rest/v1/reports` | Usa `Prefer: return=representation` |
| `update` | `PATCH /rest/v1/reports?id=eq.{id}` | Usa mapper |
| `remove` | `DELETE /rest/v1/reports?id=eq.{id}` | DELETE PostgREST padrao; nao estava no catalogo antigo |

Status atual:

- UI: `draft` ou `finalized`
- Banco/API usada pelo codigo: `draft` ou `delivered`

O mapper tambem aceita aliases como `completed`, `sent`, `enviado` e normaliza para `delivered`.

---

## Comunicacao

Arquivo: `src/repositories/communicationRepository.js`

| Metodo | Chamada atual | Observacao |
|---|---|---|
| `sendSms` | `POST /functions/v1/send-sms` | Prefixa mensagem com `[MediConnect]` |
| `registerMessage` | `POST /rest/v1/{communication_logs|message_logs|messages}` | Tabelas candidatas |
| `getInitialMessages` | `GET /rest/v1/{communication_logs|message_logs|messages}` | Retorna `[]` se tabelas candidatas nao existem |
| `getInitialTemplates` | `GET /rest/v1/{communication_templates|message_templates}` | Retorna `[]` se tabelas candidatas nao existem |
| `getCampaigns` | Sem rede | Gera campanhas a partir de pacientes carregados |

---

## Prontuarios

Arquivo: `src/repositories/medicalRecordRepository.js`

| Metodo | Chamada atual | Observacao |
|---|---|---|
| `getInitialRecords` | `GET /rest/v1/{medical_records|patient_records|records}` | Tabelas candidatas |
| `create` | `POST /rest/v1/{medical_records|patient_records|records}` | Tenta payloads compatibilizados |
| `getById` | `GET /rest/v1/{medical_records|patient_records|records}?id=eq.{id}` | Retorna `null` se nao encontrar |
| `update` | `PATCH /rest/v1/{medical_records|patient_records|records}?id=eq.{id}` | Tabelas candidatas |

Ponto de atencao: `MedicalRecordsPage.jsx` existe, mas a rota de prontuario ainda nao esta conectada em `App.jsx`.

---

## Perfil e Avatar

Arquivo: `src/repositories/profileRepository.js`

| Metodo | Chamada atual | Observacao |
|---|---|---|
| `getCurrentUserProfile` | `authRepository.getUser()` | Normaliza perfil, role, medico/paciente e avatar |
| `updateCurrentUserProfile` | `PATCH /rest/v1/{profiles|user_profiles}` | Busca por `id`, `user_id`, `auth_user_id` ou `email` |
| `updateAvatar` | `POST /storage/v1/object/avatars/{profileId}/avatar.{ext}` | Depois atualiza profile e, se paciente, patients |
| `downloadAvatar` | `GET /storage/v1/object/avatars/{path}` | Retorna blob e content-type |

Eventos:

- `mediconnect:profile-changed`

---

## Recursos Locais

| Repository/Modulo | Armazenamento |
|---|---|
| `notificationRepository` | `localStorage: mediconnect.notifications.v1` |
| `visitRepository` | `localStorage: mediconnect.consultationQueue.v1` |
| `theme.js` | `localStorage: mediconnect.theme` |
| `AccessibilityContext` | `localStorage: mediconnect.settings.ui` |
| Auth/session | `sessionStorage: mediconnect.auth.session` |

`SettingsPage` tambem tenta `GET/PATCH http://localhost:3333/usuarios/me/preferencias` para preferencias de notificacao. Quando esse backend local nao responde, a UI usa fallback visual.

---

## Pendencias de Contrato

1. Documentar no Apidog, se forem oficiais, os endpoints/tabelas usados por compatibilidade: `register-patient-with-password`, `medical_records`, `patient_records`, `records`, `communication_logs`, `message_logs`, `messages`, `communication_templates`, `message_templates`, `user_roles`, `profiles`, `user_profiles` e `medicos`.
2. Decidir se os slots de agenda devem continuar calculados no front-end ou voltar para `get-available-slots`.
3. Conectar ou remover a rota de prontuario em `App.jsx` para alinhar codigo, permissao e UI.
4. Padronizar o enum de reports entre documentacao da API e codigo atual (`delivered` vs `completed` em referencias antigas).
5. Remover a dependencia de `http://localhost:3333/usuarios/me/preferencias` ou formalizar esse servico.
