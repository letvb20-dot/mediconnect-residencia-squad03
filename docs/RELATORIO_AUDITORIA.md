# Relatório de Auditoria — Conformidade dos Repositórios com a API

**Projeto:** MediConnect / Squad 03
**API Apidog:** https://do5wegrct3.apidog.io/ (LLMs.txt: https://do5wegrct3.apidog.io/llms.txt)
**Server real:** https://yuanqfswhberkoevtmfr.supabase.co
**Data:** 2026-05-14

---

## Sumário executivo

Foram auditados todos os **16 repositórios** (`src/repositories/`) e **2 mappers** (`src/mappers/`) contra os **32 endpoints documentados** no Apidog.

**Decisões aplicadas:**

- **Remover fallbacks** — quando o repositório tentava vários URLs em sequência, manter apenas o endpoint documentado.
- **Não fazer fallback em HTTP 400** — 400 significa "dados inválidos"; mandar de novo com um payload diferente mascara o erro real, esconde bugs e dificulta o debug.
- **Enviar apenas campos do contrato** — campos extras geram 400 do PostgREST (`column "x" does not exist`) ou 400 das Edge Functions (validação).
- **Não chamar endpoints inexistentes** — três endpoints estavam codificados mas nunca foram criados na API.

**Resultado:** 12 arquivos modificados. Todos os 12 testes do projeto continuam passando.

---

## Catálogo dos 32 endpoints documentados

Resumo de referência (extraído do Apidog):

### Autenticação
| Endpoint | Método | Body obrigatório |
|---|---|---|
| `/auth/v1/token?grant_type=password` | POST | `email`, `password` |
| `/auth/v1/otp` | POST | `email` |
| `/auth/v1/logout` | POST | — |
| `/auth/v1/user` | GET | — |

### Usuários (Edge Functions)
| Endpoint | Método | Body obrigatório |
|---|---|---|
| `/functions/v1/create-user` | POST | `email`, `full_name`, `role` |
| `/functions/v1/create-user-with-password` | POST | `email`, `password`, `full_name` |
| `/functions/v1/user-info` | POST | — |
| `/functions/v1/user-info-by-id` | POST | `user_id` (no body, não path) |
| `/functions/v1/delete-user` | POST | `userId` |
| `/functions/v1/request-password-reset` | POST | `email` |

### Pacientes
| Endpoint | Método | Body / Filtros |
|---|---|---|
| `/rest/v1/patients` | GET | filtros: `select, limit, offset, order, full_name, cpf` |
| `/rest/v1/patients` | POST | `full_name, cpf, email, phone_mobile, created_by, birth_date?` |
| `/rest/v1/patients?id=eq.{id}` | PATCH | `full_name?, phone_mobile?, email?` |
| `/rest/v1/patients?id=eq.{id}` | DELETE | — |
| `/functions/v1/create-patient` | POST | `email, full_name, cpf, phone_mobile, birth_date?` |
| `/functions/v1/register-patient` | POST | `email, full_name, phone_mobile (^\d{10,11}$), cpf, birth_date?, redirect_url?` |

### Médicos
| Endpoint | Método | Body / Filtros |
|---|---|---|
| `/rest/v1/doctors` | GET | filtros: `select, active, specialty` |
| `/functions/v1/create-doctor` | POST | `email, full_name, cpf, crm, crm_uf (^[A-Z]{2}$), specialty?, phone_mobile?` |

### Agendamentos
| Endpoint | Método | Body / Filtros |
|---|---|---|
| `/rest/v1/appointments` | GET | filtros: `doctor_id, patient_id, status (requested\|confirmed\|completed\|cancelled)` |
| `/rest/v1/appointments` | POST | `doctor_id, patient_id, scheduled_at, created_by, duration_minutes?, status?` |
| `/functions/v1/get-available-slots` | POST | `doctor_id, date (YYYY-MM-DD)` |

### Disponibilidade
| Endpoint | Método | Body / Filtros |
|---|---|---|
| `/rest/v1/doctor_availability` | GET | filtros: `doctor_id, weekday (0-6), active, appointment_type, select` |
| `/rest/v1/doctor_availability` | POST | `doctor_id, weekday (0-6), start_time, end_time, slot_minutes?, appointment_type? (presencial\|telemedicina), active?` |
| `/rest/v1/doctor_availability?id=eq.{uuid}` | PATCH | `start_time?, end_time?, slot_minutes?, active?, appointment_type?` |
| `/rest/v1/doctor_availability?id=eq.{uuid}` | DELETE | — |
| `/rest/v1/doctor_exceptions` | GET | filtros: `doctor_id, date, kind (bloqueio\|disponibilidade_extra)` |
| `/rest/v1/doctor_exceptions` | POST | `doctor_id, date, kind, created_by, start_time?, end_time?, reason?` |

### Reports (Laudos médicos)
| Endpoint | Método | Body / Filtros |
|---|---|---|
| `/rest/v1/reports` | GET | filtros: `patient_id, status (draft\|completed), created_by, order` |
| `/rest/v1/reports` | POST | `patient_id` obrigatório; restante opcional |
| `/rest/v1/reports?id=eq.{uuid}` | PATCH | mesma estrutura do POST |

### SMS / Storage
| Endpoint | Método | Body |
|---|---|---|
| `/functions/v1/send-sms` | POST | `phone_number, message, patient_id?` |
| `/storage/v1/object/avatars/{path}` | POST | multipart/form-data com `file` |
| `/storage/v1/object/avatars/{path}` | GET | — |

---

## Mudanças por arquivo

### 1. `src/repositories/authRepository.js`

**Antes:** vários métodos tentavam um caminho personalizado e caíam pra Supabase em 404. `getUser()` chamava `/user-info` mas tinha fallback para `/auth/v1/user` em qualquer status ≥ 405.

**Depois:** cada método chama exatamente um endpoint documentado.

| Método | Endpoint chamado |
|---|---|
| `login()` | `POST /auth/v1/token?grant_type=password` |
| `sendMagicLink()` | `POST /auth/v1/otp` |
| `logout()` | `POST /auth/v1/logout` |
| `requestPasswordReset()` | `POST /functions/v1/request-password-reset` |
| `getUser()` | `POST /functions/v1/user-info` |

**Impacto:** elimina chamadas duplicadas em produção (a primeira respondia OK e a segunda nunca era feita, mas o try/catch escondia erros legítimos).

---

### 2. `src/repositories/userRepository.js`

**Problemas encontrados:**

1. `getById()` enviava `{ user_id, userId }` — hedge bet duplicando o mesmo valor com dois nomes. Edge Function valida `user_id` apenas; campo extra pode causar 400 dependendo da implementação.
2. `remove()` enviava `{ userId, user_id }` — mesma coisa invertida. Contrato aceita só `userId`.
3. `create()` enviava `crm`, `crm_uf`, `specialty`, `roles` — esses campos pertencem a `create-doctor`, não a `create-user`.
4. `createWithPassword()` aplicava `buildCreateUserBody` (inflado com campos de médico) e depois adicionava `password`.

**Correções:**

```js
// ANTES
async getById(userId) {
  return fetchJsonWithFallback([
    { url: apiEndpoint('/user-info-by-id'), options: { ..., body: JSON.stringify({ user_id: userId, userId }) } },
    { url: `${apiConfig.functionsUrl}/user-info-by-id`, options: { ..., body: JSON.stringify({ user_id: userId, userId }) } },
  ], 'Erro ao buscar usuário.')
}

// DEPOIS
async getById(userId) {
  const response = await fetch(`${apiConfig.functionsUrl}/user-info-by-id`, {
    method: 'POST',
    headers: getAuthenticatedHeaders(),
    body: JSON.stringify({ user_id: userId }),
  })
  // ...
}
```

`buildCreateUserBody` agora produz exatamente: `email, full_name, phone, role, create_patient_record` e — somente quando `create_patient_record === true` — `cpf` e `phone_mobile` (que viram obrigatórios nesse caso, conforme o contrato).

---

### 3. `src/repositories/patientRepository.js`

**Problemas críticos encontrados:**

1. `create()` usava `/functions/v1/register-patient` (auto-cadastro **público** sem auth) como **primeira opção** para criar paciente como admin/secretária. O endpoint correto é `/functions/v1/create-patient` (com auth e validação).
2. `registerWithPassword()` chamava `/register-patient-with-password` — **endpoint que não existe** na API.
3. `update()` fazia fallback em 400 testando vários payloads. 400 não vai virar 200 trocando o body se a causa é dado inválido.
4. `buildPatientBody` montava ~40 campos (`social_name`, `rg`, `bmi`, `attachments`, `vip`, `lgpd_opt_in`, etc.) e mandava todos. PostgREST devolve 400 quando uma coluna não existe na tabela.

**Correções:**

- `create()` agora chama `POST /functions/v1/create-patient` enviando só os 5 campos documentados: `email, full_name, cpf, phone_mobile, birth_date?`.
- `createWithValidation()` virou alias de `create()` (são o mesmo endpoint).
- `registerPublic()` chama `POST /functions/v1/register-patient` direto, sem fallback. `phone_mobile` é normalizado para somente dígitos (10-11 caracteres) para passar no regex `^\d{10,11}$`.
- `registerWithPassword()` **removido**. A página `AuthPages.jsx` que o chamava foi atualizada para usar `registerPublic()` (que envia magic link por email).
- `update()` PATCH envia somente `full_name`, `phone_mobile`, `email` — os campos documentados no contrato. Sem fallback.

---

### 4. `src/repositories/professionalRepository.js`

**Antes:** `create()` enviava 15 campos: `full_name, email, cpf, crm, crm_uf, phone_mobile, phone2, rg, active, temp_password, specialty, birth_date, cep, street, number, complement, neighborhood, city, state` e tinha fallback entre `apiEndpoint('/create-doctor')` e `${functionsUrl}/create-doctor` (que apontam pro mesmo lugar).

**Depois:** envia só os 7 campos do contrato `/functions/v1/create-doctor`:

```js
{
  email, full_name, cpf (apenas dígitos),
  crm, crm_uf (uppercase ^[A-Z]{2}$),
  specialty?, phone_mobile?
}
```

Sem fallback (chama direto `${functionsUrl}/create-doctor`). O `crm_uf` agora é forçado a uppercase antes de enviar, pra passar no regex documentado.

---

### 5. `src/repositories/appointmentRepository.js` + `src/mappers/appointmentMapper.js`

**Problemas encontrados:**

1. `create()` e `update()` faziam loop com `buildAppointmentPayloads()` que produzia duas variações: payload completo e payload "documentado". Em 400 tentava o próximo.
2. O payload completo do mapper incluía `notes`, `observations`, `room`, `priority`, `high_priority`, `type` — **nenhum desses campos está no contrato** de `/rest/v1/appointments`.
3. `cancel()` enviava `status: 'Cancelado'` (português, capitalizado). O enum API é `cancelled` (inglês, lowercase). O mapper tinha `toApiStatus` que faria a conversão, mas confiar no mapper aqui é fragilidade.
4. `getAll()` filtrava `status` direto sem normalizar, então se a UI passasse "Agendado" ia gerar query inválida.

**Correções:**

- `buildAppointmentPayload()` (singular) extrai do mapper apenas os campos documentados: `doctor_id, patient_id, scheduled_at, duration_minutes, status, appointment_type, created_by`.
- `appointmentMapper.toApi(uiData, 'supabase')` não retorna mais `notes` nem `observations`.
- `cancel()` passa `status: 'cancelled'` diretamente (valor canônico do enum).
- `getAll()` chama `toApiStatus()` no filtro antes de montar a query (`agendado` → `requested`, etc.).
- Sem loops de fallback em 400.

O teste `tests/mappers.test.mjs` "appointmentMapper envia valores aceitos pela API Supabase" foi atualizado: a assertion antiga era `assert.equal('notes' in payload, true)`, que **congelava o bug**. A nova versão asserta `'notes' in payload === false` e `'observations' in payload === false`.

---

### 6. `src/repositories/availabilityRepository.js`

**Problemas encontrados:**

1. `create()` gerava **8 variações** de payload em fallback de 400 (com/sem segundos no time, com/sem `appointment_type`, com/sem `active`).
2. `getAll()` tinha fallback que ia simplificando filtros até retornar algo, mascarando bugs.
3. `getAvailableSlots()` enviava `start_date` e `end_date`, mas o contrato só aceita `date`.
4. `getAvailableSlots()` também fazia fallback em 400.

**Correções:**

- `create()` chama o endpoint uma única vez com payload conforme contrato:
  ```js
  { doctor_id, weekday (0-6), start_time (HH:MM), end_time (HH:MM),
    slot_minutes (default 30), appointment_type (default presencial), active (default true) }
  ```
- `update()` agora monta payload incremental: só inclui as chaves que vieram explicitamente (não força defaults em PATCH).
- `getAll()` constrói query única usando os filtros documentados, sem fallback.
- `getAvailableSlots()` envia apenas `{ doctor_id, date }` conforme contrato.

---

### 7. `src/repositories/reportRepository.js` + `src/mappers/reportMapper.js`

**Problemas encontrados:**

1. `create()` testava **5 variações** de payload (omitindo `content_json`, omitindo flags, etc.) em fallback de 400.
2. `reportMapper.toApi()` enviava `order_number` (gerado pelo banco) e `updated_by` (não está no ReportInput).
3. `normalizeApiStatus()` retornava `'sent'`, mas o enum só aceita `draft | completed`.

**Correções:**

- `reportRepository.create()` envia o payload uma única vez.
- `reportMapper.toApi()` agora envia exatamente os campos do schema `ReportInput`:
  ```
  patient_id*, status, exam, requested_by, cid_code, diagnosis,
  conclusion, content_html, content_json, hide_date, hide_signature, due_at
  ```
- `normalizeApiStatus`: `sent | finalized | completed` → `'completed'`; resto → `'draft'`.
- `reportRepository.getInitialReports()`: a normalização agora vive direto na função `toApiReportStatus`, sem o `filterReportsByStatus` cliente-side que existia pra compensar valores fora do enum.

---

### 8. `src/repositories/communicationRepository.js`

**Problema:** `sendSms()` fazia fallback para `/functions/v1/enviar-sms-via-twilio` (português) — endpoint que **não existe**. Só `/functions/v1/send-sms`.

**Correção:** chamada única para `/functions/v1/send-sms`, sem fallback. Import de `fetchJsonWithFallback` removido (não é mais usado neste arquivo).

---

### 9. `src/repositories/profileRepository.js`

**Problema:** `updateAvatar()` tentava primeiro `/upload-avatar` (Edge Function que **não existe**) e só caía no endpoint correto de storage em 404/405. Funcionava por acidente.

**Correção:** chama direto `POST /storage/v1/object/avatars/{userId}/avatar.{ext}` com header `x-upsert: true`. Removidos imports de `apiEndpoint` e função `normalizeAvatarResponse` que não são mais usados.

---

### 10. `src/pages/AuthPages.jsx`

**Problema:** formulário de auto-cadastro chamava `patientRepository.registerWithPassword(form)`, que apontava para `/register-patient-with-password` — endpoint que não existe.

**Correção:** agora chama `patientRepository.registerPublic(form)`, que usa o endpoint público real `/functions/v1/register-patient` (auto-cadastro via magic link). Mensagem de sucesso ajustada: "Cadastro realizado. Verifique seu email para acessar a plataforma."

> **Nota funcional para a equipe:** a API documentada **não oferece auto-cadastro público com senha** — só com magic link. Se a UX exigir senha no auto-cadastro, é necessário criar uma Edge Function nova ou usar `create-user-with-password` (que exige role admin/gestor/secretaria — ou seja, não é auto-cadastro).

---

### 11. `tests/mappers.test.mjs`

**Problema:** o teste `"appointmentMapper envia valores aceitos pela API Supabase"` afirmava `assert.equal('notes' in payload, true)` — codificando como invariante o bug que enviava `notes` para um endpoint que não tem essa coluna.

**Correção:** teste renomeado para `"appointmentMapper envia apenas campos aceitos pelo contrato da API"` e asserções invertidas: `assert.equal('notes' in payload, false)` e `assert.equal('observations' in payload, false)`.

---

## Repositórios auditados e mantidos sem alteração

Os seguintes não fazem chamadas de rede (dados in-memory) — não havia o que ajustar:

- `homeRepository.js`
- `analyticsRepository.js`
- `notificationRepository.js`
- `settingsRepository.js`
- `visitRepository.js`

E o seguinte usa endpoints **não documentados na API** (`/rest/v1/medical_records`, etc.) — não foi alterado para não inventar contratos:

- `medicalRecordRepository.js`

> **Recomendação:** verificar com o backend se essas tabelas existem mesmo no Supabase real, e em caso afirmativo, documentar os endpoints no Apidog para que o contrato fique rastreável.

E o utilitário `repositoryUtils.js` ficou intacto — a função `fetchJsonWithFallback` continua disponível para casos futuros legítimos (404/405), mas nenhum dos repositórios editados a usa mais.

---

## Tabela consolidada de mudanças

| # | Arquivo | Tipo de mudança | Status |
|---|---|---|---|
| 1 | `repositories/authRepository.js` | Reescrito sem fallbacks | ✅ |
| 2 | `repositories/userRepository.js` | Reescrito; body conforme contrato | ✅ |
| 3 | `repositories/patientRepository.js` | Reescrito; endpoints corretos; removido `registerWithPassword` | ✅ |
| 4 | `repositories/professionalRepository.js` | Reescrito; body conforme contrato | ✅ |
| 5 | `repositories/appointmentRepository.js` | Reescrito sem fallback de payload | ✅ |
| 6 | `mappers/appointmentMapper.js` | `toApi('supabase')` enxuto | ✅ |
| 7 | `repositories/availabilityRepository.js` | Reescrito; slots com `date` único | ✅ |
| 8 | `repositories/reportRepository.js` | Reescrito sem fallback | ✅ |
| 9 | `mappers/reportMapper.js` | Status enum corrigido; `order_number/updated_by` removidos | ✅ |
| 10 | `repositories/communicationRepository.js` | Removido fallback fantasma | ✅ |
| 11 | `repositories/profileRepository.js` | Storage direto, sem `/upload-avatar` fantasma | ✅ |
| 12 | `pages/AuthPages.jsx` | `registerWithPassword` → `registerPublic` | ✅ |
| 13 | `tests/mappers.test.mjs` | Teste atualizado p/ refletir contrato | ✅ |

---

## Validação

```bash
cd src/
node --check repositories/*.js mappers/*.js
# ✅ sem erros de sintaxe

node --test tests/
# tests 12   pass 12   fail 0
```

Os 12 testes do projeto continuam passando:

- `tests/mappers.test.mjs` — 3/3
- `tests/patientRepository.test.mjs` — 1/1
- `tests/permissions.test.mjs` — 4/4
- `tests/repositoryUtils.test.mjs` — 4/4

---

## Recomendações para o time

1. **Adicionar testes de contrato** — cada repositório deveria ter um teste que mocka `fetch` e asserta que (a) o URL chamado bate com a documentação e (b) o body só contém campos do contrato. Os testes existentes assertam comportamento da UI; faltam os de "fronteira API".

2. **Documentar `medical_records`** — esse recurso é usado pela UI mas não está no Apidog. Ou é um endpoint real (e devia estar documentado) ou nunca chegou a existir e a UI vai dar 404.

3. **Centralizar conversões de enum** — `status` de agendamento e de relatório aparecem traduzidos PT↔EN em vários lugares. Vale criar um único módulo `enums.js` com `toApiAppointmentStatus()`, `toApiReportStatus()`, etc., importado de todos os lugares que precisam.

4. **Considerar gerar tipos a partir do OpenAPI** — `openapi-typescript` ou similar produziria tipos TypeScript que travariam esses campos extras em compile-time. Como o projeto é JS puro, uma alternativa intermediária é gerar validadores `zod` ou `joi` por endpoint.

5. **Auto-cadastro com senha** — definir com o backend se vão criar um endpoint público com senha ou se a UI deve abandonar o campo de senha no formulário público.
