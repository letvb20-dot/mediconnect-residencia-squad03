# Auditoria de Implementacao e Mapeamento da API

Este documento resume as APIs do Apidog conectadas no projeto `riseup_squad_03`.

## Autenticacao

- `POST /auth/v1/token?grant_type=password` em `authRepository.login`
- `POST /auth/v1/otp` em `authRepository.sendMagicLink`
- `POST /functions/v1/request-password-reset` em `authRepository.requestPasswordReset`
- `GET /auth/v1/user` em `authRepository.getUser` como fallback
- `POST /functions/v1/user-info` em `authRepository.getUser`
- `POST /auth/v1/logout` em `authRepository.logout`

## Usuarios

- `POST /functions/v1/create-user` em `userRepository.create`
- `POST /functions/v1/create-user-with-password` em `userRepository.createWithPassword`
- `POST /functions/v1/user-info-by-id/:id` em `userRepository.getById`
- `POST /functions/v1/delete-user` em `userRepository.remove`
- Listagem de perfis via REST em `profiles` / `user_profiles` em `userRepository.getAll`

## Pacientes

- `GET /rest/v1/patients` em `patientRepository.getAll`
- `POST /rest/v1/patients` em `patientRepository.create`
- `PATCH /rest/v1/patients?id=eq.ID` em `patientRepository.update`
- `DELETE /rest/v1/patients?id=eq.ID` em `patientRepository.remove`
- `POST /functions/v1/create-patient` em `patientRepository.createWithValidation`
- `POST /functions/v1/register-patient` em `patientRepository.registerPublic`

## Medicos

- `GET /rest/v1/doctors` em `professionalRepository.getAll`
- `POST /functions/v1/create-doctor` em `professionalRepository.create`

## Agendamentos

- `GET /rest/v1/appointments` em `appointmentRepository.getAll`
- `POST /rest/v1/appointments` em `appointmentRepository.create`
- `PATCH /rest/v1/appointments?id=eq.ID` em `appointmentRepository.update`
- Cancelamento via `PATCH /rest/v1/appointments?id=eq.ID` em `appointmentRepository.cancel`

## Disponibilidade e Slots

- `GET /rest/v1/doctor_availability` em `availabilityRepository.getAll`
- `POST /rest/v1/doctor_availability` em `availabilityRepository.create`
- `PATCH /rest/v1/doctor_availability?id=eq.ID` em `availabilityRepository.update`
- `DELETE /rest/v1/doctor_availability?id=eq.ID` em `availabilityRepository.remove`
- `GET /rest/v1/doctor_exceptions` em `availabilityRepository.getExceptions`
- `POST /rest/v1/doctor_exceptions` em `availabilityRepository.createException`
- `POST /functions/v1/get-available-slots` em `availabilityRepository.getAvailableSlots`

## Reports / Laudos Medicos

- `GET /rest/v1/reports` em `reportRepository.getInitialReports`
- `POST /rest/v1/reports` em `reportRepository.create`
- `PATCH /rest/v1/reports?id=eq.ID` em `reportRepository.update`

## SMS / Comunicacao

- `POST /functions/v1/send-sms` em `communicationRepository.sendSms`

## Storage

- `POST /storage/v1/object/avatars/{path}` em `profileRepository.updateAvatar`
- `GET /storage/v1/object/avatars/{path}` em `profileRepository.downloadAvatar`

## Observacoes

- O Supabase real responde as rotas REST em `/rest/v1/...`.
- As Edge Functions reais respondem em `/functions/v1/...`.
- Algumas rotas curtas do Apidog retornam `404` no ambiente real; o codigo usa o caminho que respondeu em producao.
- `Schemas` no Apidog nao sao endpoints executaveis, apenas contratos de dados.
