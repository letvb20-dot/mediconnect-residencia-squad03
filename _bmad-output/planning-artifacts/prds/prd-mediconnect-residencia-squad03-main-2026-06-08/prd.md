---
title: MediConnect
status: rascunho
created: 2026-06-08
updated: 2026-06-08
projeto: mediconnect-residencia-squad03-main
squad: Squad 03 — Residência RiseUP
---

# PRD: MediConnect — Plataforma de Gestão Clínica

## 0. Propósito do Documento

Este PRD define os requisitos de produto do **MediConnect**, uma plataforma de gestão clínica voltada para clínicas médicas brasileiras. Destina-se ao time de produto (PM, UX, arquitetura), ao squad de desenvolvimento (Squad 03 — Residência RiseUP) e aos responsáveis pelos fluxos downstream (épicos, histórias, design).

O documento segue vocabulário ancorado em Glossário. Todas as funcionalidades são agrupadas com Requisitos Funcionais (RFs) aninhados e com IDs globais estáveis. Premissas são marcadas inline com `[PREMISSA]` e indexadas no §9. Artefatos de UX e arquitetura se constroem sobre este PRD — não o duplicam.

---

## 1. Visão

O MediConnect é uma plataforma web de gestão clínica all-in-one criada para clínicas médicas brasileiras. Ele unifica quatro ferramentas tradicionalmente separadas — prontuários, agendamento de consultas, laudos clínicos e analytics operacional — em uma SPA com controle de acesso por perfil. Ao mesmo tempo, ataca diretamente a principal dor operacional das clínicas brasileiras: o absenteísmo de consultas, que corrói receita e reduz a capacidade de atendimento.

A plataforma resolve esse problema por meio de um **motor anti-absenteísmo automatizado**: uma camada de comunicação multicanal (WhatsApp, SMS, e-mail) que confirma, lembra e reengaja pacientes proativamente. Complementando isso, uma **Fila de Espera Inteligente com IA** prevê risco de cancelamento, rankeia pacientes por urgência e compatibilidade, e preenche automaticamente horários liberados — transformando cada cancelamento em uma oportunidade imediata de reagendamento.

O MediConnect atende cinco perfis de usuário — Admin, Gestor, Médico, Secretária e Paciente — cada um com visão e permissões específicas. Pacientes interagem via fluxo de agendamento self-service e perfil próprio. Os demais perfis operam via shell autenticado do backoffice. O resultado é uma plataforma operacional que reduz absenteísmo, automatiza burocracia clínica e oferece visibilidade em tempo real da performance da clínica — sem substituir o julgamento clínico do profissional de saúde.

---

## 2. Usuário-Alvo

### 2.1 Jobs To Be Done

**Admin / Gestor**
- Saber de relance se o dia da clínica está no trilho (ocupação, faltas, risco de receita).
- Parar de perder receita para horários vazios por cancelamentos de última hora.
- Gerenciar usuários, perfis e acessos sem depender de TI.
- Ver a efetividade agregada da comunicação (SMS enviados, taxa de resposta, tendência de redução de faltas).

**Médico**
- Acessar minha própria agenda e lista de pacientes sem ver dados não relacionados à clínica.
- Redigir e finalizar laudos clínicos rapidamente, com assistência de IA para seções padrão.
- Saber o status dos pacientes da minha fila de espera sem precisar ligar para a secretaria.

**Secretária**
- Agendar, remarcar e cancelar consultas em uma única tela, sem alternar entre ferramentas.
- Enviar lembretes e confirmações via WhatsApp/SMS/e-mail com um clique.
- Receber notificação automática quando um cancelamento ocorrer e um paciente da fila de espera for notificado.

**Paciente**
- Me cadastrar e agendar uma consulta online sem precisar ligar para a clínica.
- Receber lembretes oportunos e saber que minha consulta está confirmada.
- Acessar meus laudos por um portal do paciente.

### 2.2 Não-Usuários (v1)

- Operadoras de saúde / planos médicos (sem integração com pagadores na v1). `[PREMISSA]`
- Sistemas externos de laboratório (sem integração HL7/FHIR na v1). `[PREMISSA]`
- Pacientes menores de 18 anos (sem fluxo de responsável legal na v1). `[PREMISSA]`

### 2.3 Jornadas de Usuário

**JU-1. Secretária preenche um horário cancelado antes do fim do dia.**
- **Persona + contexto:** Maria, secretária de uma clínica de médio porte, percebendo que o horário das 10h30 acabou de ser liberado às 9h45.
- **Estado inicial:** Autenticada como `secretaria`, na tela de Agenda.
- **Caminho:**
  1. Um cancelamento chega; ela clica em "Cancelar" no card da consulta.
  2. O sistema dispara automaticamente a busca na fila de espera para aquele médico/horário.
  3. O sistema seleciona o paciente mais bem rankeado (urgência + tempo de espera) e envia notificação automática pelo canal preferido (WhatsApp, SMS ou e-mail).
  4. Maria vê um toast confirmando: "Pedro Alves notificado via WhatsApp para o horário das 10h30."
  5. Ela navega para a página de Fila de Espera para ver respostas pendentes.
- **Clímax:** O horário é preenchido sem uma única ligação manual.
- **Resolução:** A consulta aparece na agenda como "pendente de confirmação"; Pedro recebe um link para confirmar. `[PREMISSA: fluxo de link de confirmação]`
- **Caso extremo:** Nenhum paciente na fila corresponde ao médico/modalidade → toast informa Maria, horário permanece livre.

---

**JU-2. Médico gera um laudo clínico com assistência de IA.**
- **Persona + contexto:** Dra. Ana, cardiologista, encerrando uma consulta de paciente.
- **Estado inicial:** Autenticada como `medico`, na página de Laudos, criando um novo relatório.
- **Caminho:**
  1. Abre "Novo Relatório", seleciona o paciente, escolhe o modelo de laudo.
  2. Digita a queixa principal no campo de entrada.
  3. Clica em "Gerar com IA."
  4. O módulo de IA pré-preenche: descrição do exame, CID-10, diagnóstico, conclusão e corpo HTML em rascunho.
  5. Ela revisa, edita o rascunho e clica em "Finalizar."
- **Clímax:** Laudo salvo com status `entregue`, visível para perfis autorizados e para o paciente.
- **Resolução:** Dra. Ana passa para o próximo paciente. O laudo aparece no perfil do paciente.

---

**JU-3. Gestor revisa a performance da clínica no fim do mês.**
- **Persona + contexto:** Carlos, gerente da clínica, preparando um relatório mensal para o proprietário.
- **Estado inicial:** Autenticado como `gestor`, na página de Analytics (Relatórios).
- **Caminho:**
  1. Seleciona o filtro de período mensal.
  2. Visualiza cards de KPI: total de consultas, taxa de cancelamento, taxa de absenteísmo, ocupação média.
  3. Analisa o gráfico de performance por médico.
  4. Exporta ou captura a visualização de analytics. `[PREMISSA: funcionalidade de exportação]`
- **Clímax:** Carlos tem uma visão quantificada da performance sem precisar consultar o banco de dados bruto.
- **Resolução:** Ele sai da página de Analytics e compartilha os insights com o proprietário da clínica.

---

**JU-4. Paciente se cadastra e agenda uma consulta.**
- **Persona + contexto:** João, 35 anos, encaminhado à clínica pelo seu clínico geral. Ainda não cadastrado.
- **Estado inicial:** Não autenticado, na landing page pública da clínica.
- **Caminho:**
  1. Clica em "Agendar Consulta" na landing page.
  2. Navega para `/cadastro` — preenche nome, CPF, telefone, e-mail e cria uma senha.
  3. Redirecionado para o fluxo de agendamento `/agendamento` — seleciona especialidade, médico e horário disponível.
  4. Confirma o agendamento.
- **Clímax:** João recebe uma notificação de confirmação (SMS/WhatsApp/e-mail). A consulta aparece na agenda da clínica.
- **Resolução:** João está cadastrado como paciente e pode fazer login para acompanhar o status da sua consulta.

---

## 3. Glossário

- **Agendamento** — Registro de consulta vinculando um Paciente a um Médico em data/hora específica. Ciclo de status: `pendente → confirmado → realizado → cancelado`.
- **Laudo / Relatório** — Documento clínico redigido pelo Médico após consulta ou exame. Ciclo de status (UI): `rascunho → finalizado`. Ciclo de status (API/BD): `draft → delivered`.
- **Prontuário** — Registro longitudinal de saúde de um paciente. Distinto dos Laudos: o Prontuário agrega todo o histórico de saúde; um Laudo é um documento clínico pontual.
- **Fila de Espera (Waitlist)** — Lista de Pacientes que querem uma consulta mas ainda não estão agendados, rankeados por urgência e tempo de espera. Persistência atual: `localStorage` chave `mediconnect.waitlist.v1`.
- **Fila de Consultas** — Lista ordenada de pacientes presentes na clínica em um determinado dia, aguardando atendimento. Persistência atual: `localStorage` chave `mediconnect.consultationQueue.v1`.
- **Absenteísmo** — Taxa de não comparecimento: percentual de consultas agendadas em que o paciente não apareceu sem cancelar.
- **Slot** — Janela de tempo específica na agenda de um Médico disponível para agendamento. Slots são calculados no frontend a partir de `doctor_availability` e `doctor_exceptions`.
- **Perfil / Role** — Um dos cinco níveis de autorização: `admin`, `gestor`, `medico`, `secretaria`, `paciente`. Determina acesso a rotas, dados e capacidades.
- **Canal de Comunicação** — Canal de entrega de notificação: WhatsApp (via Edge Function `send-whatsapp`), SMS (via Twilio/Edge Function `send-sms`), ou e-mail (sem função de envio implementada na v1).
- **RBAC** — Controle de Acesso por Perfil (Role-Based Access Control). Implementado via `src/config/permissions.js`.
- **BaaS** — Backend-as-a-Service. O projeto usa Supabase (Auth, PostgREST, Edge Functions, Storage).
- **Edge Function** — Função serverless implantada na rede edge do Supabase, usada para operações sensíveis (criação de usuário, envio de SMS/WhatsApp, redefinição de senha).
- **aiClient** — Camada de abstração de IA (`src/lib/ai/aiClient.js`) que roteia requisições para a API Claude quando uma chave está presente, ou para motores heurísticos locais caso contrário.
- **LGPD** — Lei Geral de Proteção de Dados Pessoais. O opt-in de comunicação é regido por `utils/communicationEligibility.js`.

---

## 4. Funcionalidades

### 4.1 Autenticação e Gestão de Sessão

**Descrição:** O MediConnect usa Supabase Auth para toda autenticação de usuários. Login é por e-mail e senha. Pacientes podem se auto-cadastrar em `/cadastro`. Há fluxo de redefinição de senha. Sessões são armazenadas em `sessionStorage` por aba do navegador; fechar a aba encerra a sessão. No login, o perfil e a role do usuário são resolvidos via Edge Functions do Supabase e guiam todas as decisões de RBAC subsequentes.

**Requisitos Funcionais:**

#### RF-1: Login por E-mail e Senha
Um Usuário pode se autenticar usando e-mail e senha via `POST /auth/v1/token?grant_type=password`. Realiza JU-1, JU-2, JU-3.

**Consequências (testáveis):**
- Credencial válida retorna token de acesso e persiste sessão em `sessionStorage` chave `mediconnect.auth.session`.
- Credencial inválida exibe mensagem de erro traduzida em pt-BR.
- Fechar a aba do navegador limpa a sessão.

---

#### RF-2: Auto-Cadastro de Paciente
Um Paciente pode se auto-cadastrar em `/cadastro` fornecendo nome, CPF, telefone, e-mail e senha, usando a Edge Function `register-patient-with-password`. Realiza JU-4.

**Consequências (testáveis):**
- Cadastro bem-sucedido cria um registro de `patient` e uma conta de usuário autenticado.
- CPF ou e-mail duplicado retorna erro de validação antes da submissão.

---

#### RF-3: Recuperação de Senha
Um Usuário pode solicitar link de redefinição de senha em `/recuperar-senha`, acionando a Edge Function `request-password-reset`.

**Consequências (testáveis):**
- Um e-mail de redefinição é enviado para o endereço cadastrado.
- Nenhuma confirmação sobre a existência do e-mail é dada (previne enumeração). `[PREMISSA]`

---

#### RF-4: Resolução de Perfil (Role)
A cada login, o sistema resolve a role e o perfil do usuário via `POST /functions/v1/user-info` e armazena na sessão. A camada de RBAC (`permissions.js`) governa todo acesso a rotas e capacidades.

**Consequências (testáveis):**
- Um usuário `medico` pode ver apenas suas próprias consultas (`ownAppointmentsOnly = true`).
- Um usuário `paciente` não pode acessar `/agenda`, `/laudos`, `/usuarios` ou `/relatorios`.
- Um `admin` pode acessar todas as rotas.

---

### 4.2 Agendamento e Gestão de Agenda

**Descrição:** A Agenda é o núcleo operacional do MediConnect. Oferece interface de calendário completa (visões diária, semanal e mensal) para criar, visualizar, editar e cancelar consultas. Médicos veem apenas suas próprias consultas; todos os outros perfis autorizados veem a agenda completa da clínica. A disponibilidade de slots é calculada no frontend a partir das regras de disponibilidade e exceções do médico. Realiza JU-1, JU-4.

**Requisitos Funcionais:**

#### RF-5: Visões de Calendário
Um Usuário autenticado (Admin, Gestor, Médico, Secretária) pode visualizar a agenda da clínica nos formatos de calendário diário, semanal ou mensal.

**Consequências (testáveis):**
- A role `medico` vê apenas consultas onde `doctor_id` corresponde ao seu próprio perfil.
- Alternar entre visões diária/semanal/mensal não recarrega a página; rerrenderiza o mesmo conjunto de dados.

---

#### RF-6: Criar Agendamento
Um Admin, Gestor ou Secretária pode criar uma nova consulta para um Paciente, selecionando médico, data, hora e modalidade.

**Consequências (testáveis):**
- O sistema apresenta apenas slots dentro da `doctor_availability` do médico e que não sejam bloqueados por `doctor_exceptions`.
- Criar agendamento para data passada é impedido por validação. `[PREMISSA]`

---

#### RF-7: Cancelar Consulta e Acionamento Automático da Fila de Espera
Um Admin, Gestor ou Secretária pode cancelar uma consulta existente. No cancelamento, se o slot liberado corresponder aos critérios de algum paciente da fila de espera (médico + modalidade), o sistema seleciona automaticamente o paciente com maior score e envia notificação pelo Canal de Comunicação preferido dele. Realiza JU-1.

**Consequências (testáveis):**
- Toast de confirmação exibe o paciente notificado e o canal utilizado.
- Se não houver paciente correspondente na fila, o slot permanece livre e um toast informa o usuário.
- O cancelamento é refletido no status da consulta (`cancelado`) imediatamente.

---

#### RF-8: Auto-Agendamento pelo Paciente
Um Paciente autenticado pode navegar pelos slots disponíveis e agendar sua própria consulta via `/agendamento`. Realiza JU-4.

**Consequências (testáveis):**
- Apenas slots com status disponível são exibidos.
- Após o agendamento, o Paciente recebe uma notificação de confirmação.

---

#### RF-9: Ciclo de Status da Consulta
O sistema acompanha o status da consulta por: `pendente → confirmado → realizado → cancelado`.

**Consequências (testáveis):**
- Transições de status são registradas e visíveis no registro da consulta.
- Apenas perfis autorizados podem alterar o status (ex.: apenas Admin/Gestor/Secretária podem marcar como `realizado`). `[PREMISSA]`

---

### 4.3 Gestão de Pacientes

**Descrição:** Os perfis Admin, Gestor e Secretária podem criar e gerenciar registros de pacientes. Médicos podem visualizar registros e prontuários, mas não criar ou excluir. Pacientes podem visualizar seu próprio perfil. Exclusão permanente (hard delete) é restrita a Admin e Gestor.

**Requisitos Funcionais:**

#### RF-10: Lista e Busca de Pacientes
Um Admin, Gestor, Médico ou Secretária pode visualizar a lista completa de pacientes e buscar/filtrar por nome, CPF ou outros identificadores.

**Consequências (testáveis):**
- Resultados são paginados ou virtualizados para grandes volumes de dados. `[PREMISSA]`
- Um `medico` pode visualizar a lista, mas não editar ou excluir registros.

---

#### RF-11: CRUD de Pacientes
Um Admin, Gestor ou Secretária pode criar e editar registros de pacientes. Admin e Gestor podem excluir permanentemente (hard delete) um registro.

**Consequências (testáveis):**
- CPF é validado no formato brasileiro antes de salvar.
- Exclusão suave (soft delete) não é implementada; a exclusão é permanente. `[PREMISSA: sem soft delete na v1]`

---

#### RF-12: Detalhe do Paciente e Anexos
Um Usuário autorizado pode visualizar o perfil completo de um paciente, incluindo dados demográficos, contato, consultas vinculadas, laudos e anexos (arquivos enviados).

**Consequências (testáveis):**
- Upload de anexo envia arquivos para o Supabase Storage (buckets `patient-attachments` ou `attachments`).
- Upload de avatar é separado dos anexos.

---

### 4.4 Laudos Clínicos

**Descrição:** Médicos, Gestores e Admins podem criar, editar, finalizar e excluir laudos clínicos. Os laudos usam editor de texto rico (TipTap 3) para formatação. A funcionalidade de geração assistida por IA pré-preenche seções do laudo a partir da queixa do paciente. O status do laudo na UI é `rascunho/finalizado`; no banco de dados é `draft/delivered`. Realiza JU-2.

**Requisitos Funcionais:**

#### RF-13: CRUD de Laudos
Um Médico, Gestor ou Admin pode criar um novo laudo vinculado a um paciente, editá-lo no editor de texto rico e finalizá-lo ou excluí-lo.

**Consequências (testáveis):**
- Conteúdo rico é armazenado e renderizado como HTML.
- Limite de conteúdo: 12.000 caracteres (aplicado pelo limite global do TipTap/ProseMirror).
- `finalizado` na UI mapeia para `delivered` no banco de dados/API.

---

#### RF-14: Geração de Laudo Assistida por IA
Um Médico, Gestor ou Admin pode clicar em "Gerar com IA" no modal de novo laudo, fornecendo uma queixa principal (queixa), para receber um rascunho pré-preenchido com: descrição do exame, CID-10, diagnóstico, conclusão e corpo HTML. Realiza JU-2.

**Consequências (testáveis):**
- Se `VITE_ANTHROPIC_API_KEY` estiver presente, a API Claude (`claude-haiku-4-5` por padrão) é chamada.
- Se não houver chave, o motor heurístico local (`reportGenerator.js`) gera o rascunho.
- O conteúdo gerado é claramente marcado como rascunho pendente de revisão do médico.
- O botão de IA é visível apenas para os perfis `medico`, `gestor` e `admin`.

**NFRs específicos da funcionalidade:**
- Segurança: chamar a API Claude diretamente do navegador é aceitável apenas no escopo de demonstração/residência atual. Em produção, essa chamada deve ser proxied por uma Supabase Edge Function para proteger a chave de API. `[NOTA PARA PM: este é um bloqueador de segurança pré-produção]`

---

### 4.5 Prontuários

**Descrição:** Os prontuários fornecem uma visão longitudinal do histórico de saúde de um paciente, distinta dos laudos individuais. A página (`MedicalRecordsPage.jsx`) e o repositório (`medicalRecordRepository.js`) existem no código, e o RBAC está configurado, mas a rota não está conectada em `App.jsx` na implementação atual. O repositório tenta três nomes de tabela em sequência (`medical_records`, `patient_records`, `records`) como padrão de fallback — a tabela real depende do schema Supabase existente. Esta é uma **lacuna conhecida** que deve ser resolvida.

**Requisitos Funcionais:**

#### RF-15: Rota e Acesso a Prontuários
Os perfis Admin, Gestor e Médico podem navegar para `/prontuario/:id` e visualizar o prontuário de um paciente.

**Consequências (testáveis):**
- A rota `/prontuario/:id` é registrada em `App.jsx` e resolve para `MedicalRecordsPage`.
- Um usuário `secretaria` ou `paciente` tentando acessar `/prontuario/:id` é redirecionado para página de 403/Não Encontrado.
- O código já implementa fallback automático entre as tabelas `medical_records`, `patient_records` e `records`; a tabela que responder com HTTP 200 é usada.

**Notas:** Este RF resolve a lacuna conhecida documentada em `docs/RELATORIO_AUDITORIA.md` (Item 3). A rota deve ser conectada antes do lançamento do MVP. `[NOTA PARA PM: conexão da rota é bloqueador pré-lançamento]`

---

### 4.6 Fila de Espera Inteligente

**Descrição:** A Fila de Espera Inteligente é uma funcionalidade de gerenciamento de fila potencializada por IA, permitindo que pacientes registrem interesse em um slot de consulta. O motor rankeia pacientes por score de urgência, tempo de espera e compatibilidade com médico/modalidade. Prevê risco de cancelamento para consultas existentes (baixo/médio/alto), identifica slots de encaixe potenciais nos próximos 7 dias e envia notificações multicanal para pacientes compatíveis.

> **Estado atual da persistência:** A Fila de Espera usa **`localStorage`** (chave `mediconnect.waitlist.v1`). Isso significa que os dados não são compartilhados entre diferentes usuários/navegadores. A migração para uma tabela Supabase é necessária para colaboração real entre secretárias e médicos e está documentada como requisito pós-MVP na §6.2.

Realiza JU-1.

**Requisitos Funcionais:**

#### RF-16: Cadastro de Paciente na Fila de Espera
Uma Secretária, Gestor ou Admin pode adicionar um paciente à fila de espera, capturando: paciente, preferência de médico, preferência de modalidade, urgência (escala 1–5), motivo e Canal de Comunicação preferido (WhatsApp, SMS ou e-mail).

**Consequências (testáveis):**
- Um registro da fila é criado e persistido em `localStorage` chave `mediconnect.waitlist.v1`.
- O registro aparece na tabela da fila com rank e tempo de espera.

---

#### RF-17: Rankeamento por IA
O sistema rankeia pacientes da fila usando score composto: peso de urgência + tempo de espera + compatibilidade com médico/modalidade. O ranking atualiza quando um novo registro é adicionado ou um slot se torna disponível.

**Consequências (testáveis):**
- A função `rankWaitlist()` em `waitlistEngine.js` é sempre local (sem chamada à API Claude).
- Registros são exibidos em ordem rankeada na página da Fila de Espera.

---

#### RF-18: Predição de Risco de Cancelamento
O sistema pontua consultas existentes para risco de cancelamento com base em: status de confirmação, hora do dia (horários de pico de faltas), modalidade (teleconsulta tem risco maior) e antecedência da consulta.

**Consequências (testáveis):**
- Cada consulta em risco é rotulada `baixo` / `médio` / `alto`.
- A função `predictCancellations()` é sempre local (determinística, sem API externa).

---

#### RF-19: Preenchimento Automático no Cancelamento
Quando uma Secretária, Admin ou Gestor cancela uma consulta, o sistema consulta a fila de espera pelo melhor paciente correspondente (mesmo médico + modalidade) e dispara automaticamente uma notificação pelo canal preferido do paciente.

**Consequências (testáveis):**
- Acionado dentro de `handleCancelAppointment` em `useAgenda.js`.
- Notificação é enviada via `notificationRepository` e o provedor específico do canal.
- Toast de confirmação aparece na UI: "{Nome do Paciente} notificado via {Canal}."

---

#### RF-20: Acesso à Fila de Espera por Perfil
Secretária, Gestor e Admin podem criar e gerenciar registros na fila de espera. Médico tem acesso somente leitura ao contexto da própria fila de espera.

**Consequências (testáveis):**
- Médico não pode adicionar ou remover registros da fila de espera.
- O perfil `paciente` não tem acesso a `/lista-espera`.

---

### 4.7 Comunicação Multicanal

**Descrição:** O MediConnect suporta três canais de comunicação para contato com pacientes: WhatsApp, SMS e e-mail.

- **SMS:** Enviado via Edge Function `send-sms` (integração Twilio ativa).
- **WhatsApp:** Enviado via Edge Function `send-whatsapp` (integração com provedor externo implementada no código; funcionalidade depende de credenciais/configuração no Supabase).
- **E-mail:** Canal reconhecido nos logs e filtros, mas **sem função de envio implementada** na v1. `[NOTA PARA PM: e-mail é simulado/registrado mas não há Edge Function de envio]`

O opt-in de LGPD é aplicado via `communicationEligibility.js`. Logs de comunicação são armazenados em tabelas Supabase para fins de auditoria.

**Requisitos Funcionais:**

#### RF-21: Enviar Comunicação
Um Admin, Gestor, Médico ou Secretária pode manualmente enviar uma mensagem para um paciente via um dos três canais disponíveis, a partir da página de Comunicação (Mensagens) ou da ação de notificação da Fila de Espera.

**Consequências (testáveis):**
- Envio de SMS chama `POST /functions/v1/send-sms` (Twilio). Retorna `sid` em caso de sucesso.
- Envio de WhatsApp chama `POST /functions/v1/send-whatsapp`. Retorna `message_id` em caso de sucesso.
- Um paciente que não deu opt-in (LGPD) não pode receber comunicações; `communicationEligibility.js` retorna `false` e a UI exibe aviso de inelegibilidade.
- Eventos de comunicação são registrados nas tabelas `communication_logs`, `message_logs` ou `messages` (fallback automático entre tabelas).

---

#### RF-22: Histórico de Comunicação
Um Admin, Gestor, Médico ou Secretária pode visualizar o histórico de todas as comunicações enviadas a um paciente.

**Consequências (testáveis):**
- Logs exibem: data, canal, trecho da mensagem, status de entrega.
- Logs são somente leitura.

---

### 4.8 Analytics e Inteligência Operacional

**Descrição:** A página de Analytics oferece aos gestores da clínica (Admin e Gestor) cards de KPI e gráficos de séries temporais derivados de dados agregados de consultas e pacientes. Não existe endpoint de analytics dedicado; os dados são calculados no frontend pelo `analyticsRepository.js` a partir das tabelas existentes. Realiza JU-3.

**Requisitos Funcionais:**

#### RF-23: Cards de KPI no Dashboard
Um Admin ou Gestor pode visualizar cards de KPI na página de Analytics: total de consultas, taxa de cancelamento, taxa de absenteísmo e ocupação média.

**Consequências (testáveis):**
- KPIs são calculados no frontend a partir dos dados de `appointments` e `patients`.
- Dados refletem o filtro de período selecionado.

---

#### RF-24: Gráficos de Performance por Médico
Um Admin ou Gestor pode visualizar métricas de performance por médico: total de consultas, taxa de cancelamento, taxa de absenteísmo.

**Consequências (testáveis):**
- Gráficos renderizam corretamente para uma clínica com 1–20 médicos. `[PREMISSA: limite superior]`
- Um médico sem consultas no período selecionado é excluído ou exibido como zero.

---

#### RF-25: Dashboard Inicial (Home)
Todos os usuários autenticados veem um painel inicial com informações relevantes ao seu perfil em `/inicio`: consultas do dia, alertas de cancelamento, notificações da fila de espera.

**Consequências (testáveis):**
- Um `medico` vê apenas as consultas do próprio dia.
- Uma `secretaria` vê total de consultas do dia, lacunas na agenda e contagem da fila de espera.
- Um `paciente` vê suas próximas consultas e laudos recentes.

---

### 4.9 Gestão de Usuários

**Descrição:** Admins e Gestores podem gerenciar usuários do sistema. Admins podem criar usuários de qualquer perfil. Gestores podem criar contas de Médico, Secretária e Paciente. A criação de usuários passa por Edge Functions do Supabase para garantir criação atômica de usuário de auth + perfil.

**Requisitos Funcionais:**

#### RF-26: Criar Usuário
Um Admin pode criar usuários de qualquer perfil. Um Gestor pode criar usuários Médico, Secretária ou Paciente.

**Consequências (testáveis):**
- Criação de usuário chama `POST /functions/v1/create-user` ou `create-user-with-password`.
- Um Admin não pode ser criado por um Gestor.
- E-mail duplicado retorna erro de validação antes da submissão para a API.

---

#### RF-27: Visualizar e Editar Usuários
Um Admin ou Gestor pode listar, pesquisar e editar perfis de usuários existentes.

**Consequências (testáveis):**
- Lista de usuários é filtrável por perfil.
- Atualizações de perfil persistem nas tabelas `profiles` ou `user_profiles`.

---

#### RF-28: Excluir Usuário
Um Admin ou Gestor pode remover um usuário via `POST /functions/v1/delete-user`.

**Consequências (testáveis):**
- Exclusão é permanente (sem soft delete na v1). `[PREMISSA]`
- Excluir um usuário não apaga em cascata suas consultas ou laudos. `[PREMISSA: política de retenção de dados a definir]`

---

### 4.10 Chatbot Assistente com IA

**Descrição:** Um widget de chatbot flutuante (`ChatbotWidget.jsx`) está disponível em todas as telas autenticadas via AppShell. Fornece assistência de navegação somente leitura e resumos contextuais de dados adaptados ao perfil do usuário. Não executa ações destrutivas. O histórico do chat é preservado em `sessionStorage` durante a sessão do navegador.

**Requisitos Funcionais:**

#### RF-29: Chatbot Ciente do Perfil
Todos os usuários autenticados podem interagir com o chatbot. Respostas são delimitadas ao perfil do usuário e ao contexto de dados disponível (consultas, fila de espera, perfil).

**Consequências (testáveis):**
- Resposta do chatbot para `medico` referencia apenas suas próprias consultas.
- O chatbot pode sugerir navegação ("Onde vejo os laudos?" → resposta com botão "Abrir →").
- O chatbot não altera nenhum dado (somente leitura).

---

#### RF-30: Indicador de Modo de IA
O chatbot exibe "IA conectada" quando `VITE_ANTHROPIC_API_KEY` está presente e válida; caso contrário exibe "Modo local."

**Consequências (testáveis):**
- Em "Modo local," respostas são geradas pela heurística de `chatEngine.js`.
- Em "IA conectada," respostas são geradas pela API Claude.

---

### 4.11 Configurações e Perfil

**Descrição:** Todos os usuários autenticados podem acessar Configurações e o próprio Perfil. Configurações incluem alternância de tema (claro/escuro) e preferências de acessibilidade. Edição de perfil está disponível para perfis Admin, Gestor e Paciente. Tema é persistido na chave `localStorage` `mediconnect.theme`; preferências de acessibilidade em `mediconnect.settings.ui`.

**Requisitos Funcionais:**

#### RF-31: Alternância de Tema
Qualquer usuário autenticado pode alternar entre modo claro e escuro nas Configurações.

**Consequências (testáveis):**
- Tema persiste entre recarregamentos via `localStorage`.
- Tema padrão para nova sessão sem preferência salva é `claro` (`light`).

---

#### RF-32: Edição de Perfil
Um Admin, Gestor ou Paciente pode atualizar o próprio perfil (nome, avatar, informações de contato). Médico e Secretária podem visualizar, mas não editar seus perfis na v1. `[PREMISSA: confirmar se edição de perfil para médico/secretária é necessária]`

**Consequências (testáveis):**
- Upload de avatar envia para o Supabase Storage (bucket `avatars`).
- Atualizações de perfil persistem na tabela `profiles` via PATCH.

---

## 5. Não-Objetivos (Explícitos)

- **Sem integração com planos de saúde** — O MediConnect não integra com operadoras de saúde, faturamento TISS/TUSS ou sistemas de reembolso na v1.
- **Sem WebSocket em tempo real** — O `SocketProvider` usa evento de push simulado (`simulated_socket_push`). Nenhuma conexão Supabase Realtime ou WebSocket real é estabelecida na v1.
- **Sem app mobile nativo** — O MediConnect é uma aplicação web responsiva. Apps nativos iOS/Android estão fora do escopo.
- **Sem integração com laboratórios externos** — Integrações HL7, FHIR ou sistemas diretos de laboratório não estão planejadas para a v1.
- **Sem módulo financeiro ou de faturamento** — Geração de faturas, processamento de pagamentos e relatórios financeiros estão fora do escopo.
- **Sem gestão multi-clínica / multi-tenant** — A plataforma gerencia uma única instância de clínica por deploy. Recursos SaaS multi-tenant são adiados.
- **Sem fine-tuning de modelo de IA** — A camada de IA usa Claude out-of-the-box (ou heurísticas locais). Treinamento de modelo customizado não está no escopo.
- **Sem conformidade HIPAA** — O MediConnect atende clínicas brasileiras sob LGPD; conformidade HIPAA dos EUA está fora do escopo.
- **Sem envio de e-mail nativo** — Não há Edge Function de envio de e-mail implementada na v1. E-mail aparece como canal nos logs mas não é enviado ativamente.

---

## 6. Escopo do MVP

### 6.1 No Escopo

- Ciclo completo de autenticação (login, cadastro, recuperação de senha, logout).
- Controle de acesso por perfil para os 5 perfis.
- Agenda com visões diária/semanal/mensal, criar/editar/cancelar e ciclo de status.
- CRUD de pacientes com anexos e avatar.
- Fluxo de auto-agendamento do paciente (`/agendamento`).
- Laudos clínicos (TipTap editor de texto rico) com geração assistida por IA.
- **Correção de rota de Prontuários (RF-15)** — conectar `MedicalRecordsPage` a `/prontuario/:id`.
- Fila de Espera Inteligente com rankeamento por IA, predição de cancelamento e acionamento automático de preenchimento.
- Comunicação multicanal (SMS e WhatsApp via Edge Functions Supabase; e-mail como canal de log).
- Dashboard de analytics (KPIs e performance por médico).
- Painel inicial com resumos por perfil e alertas.
- Gestão de usuários (criar, listar, editar, excluir usuários por perfil).
- Chatbot assistente com IA (heurísticas locais + API Claude opcional).
- Configurações (tema, acessibilidade) e gestão de perfil.
- 78 testes automatizados passando (manter/expandir cobertura para novos RFs).

### 6.2 Fora do Escopo do MVP

- **Migração da Fila de Espera para Supabase** — Atualmente `localStorage`; migração para tabela Supabase é prioridade pós-MVP. Bloqueia colaboração multiusuário na fila de espera. `[NOTA PARA PM: necessário para uso real em produção com múltiplos usuários]`
- **Migração da Fila de Consultas para Supabase** — Igual ao item acima. Atualmente `localStorage`.
- **Backend de preferências de notificação** — `SettingsPage` atualmente tenta `http://localhost:3333/usuarios/me/preferencias`. Substituir por endpoint Supabase na v2.
- **WebSocket em tempo real** — Adiar para v2. Substituir `simulated_socket_push` por Supabase Realtime.
- **Envio de e-mail real** — Implementar Edge Function de envio de e-mail (SendGrid/Resend/SMTP) como item pós-MVP.
- **Gestão segura de chave de API de IA** — Mover chamada Claude do lado do cliente para Supabase Edge Function antes do lançamento em produção. `[NOTA PARA PM: bloqueador de segurança pré-produção]`
- **Exportação de dados de analytics / PDF** — Funcionalidade de download para relatórios de analytics é adiada. `[NOTA PARA PM: alta demanda do persona Gestor]`
- **Link de confirmação de consulta ao paciente** — Fechar o loop de notificação da fila de espera com URL de confirmação voltada ao paciente é pós-MVP.
- **CRUD completo de Prontuários** — A v1 entrega a correção de rota e visão de leitura. Criar/editar/excluir registros completos de prontuário é v2.

---

## 7. Métricas de Sucesso

**Primárias**

- **MS-1: Redução da Taxa de Absenteísmo** — Redução percentual de faltas em consultas mês a mês após adoção. Meta: ≥15% de redução em 60 dias. Valida RF-7, RF-16, RF-17, RF-18, RF-19.
- **MS-2: Taxa de Preenchimento de Slots** — Percentual de slots cancelados que são preenchidos com sucesso por paciente da fila de espera no mesmo dia. Meta: ≥40% dos cancelamentos resultam em preenchimento no mesmo dia em 30 dias do lançamento. Valida RF-7, RF-19.

**Secundárias**

- **MS-3: Adoção de Geração de Laudos com IA** — Percentual de novos laudos criados usando "Gerar com IA" vs. redigidos manualmente. Meta: ≥50% dos novos laudos usam rascunho de IA no mês 2. Valida RF-14.
- **MS-4: Taxa de Auto-Cadastro de Pacientes** — Percentual de novos pacientes que se auto-cadastram via `/cadastro` vs. criados por staff. Meta: ≥30% auto-cadastrados em 60 dias. Valida RF-2, RF-8.
- **MS-5: Saúde da Suite de Testes** — 100% dos testes automatizados passando a cada merge na branch principal. Valida todos os RFs com cobertura automatizada.

**Contra-métricas (não otimizar em detrimento de)**

- **MC-1: Taxa de Revisão de Rascunhos de IA** — Percentual de laudos gerados por IA que são editados antes da finalização. Deve permanecer **alta** (>80% editados). Se cair, médicos podem estar aprovando rascunhos de IA sem revisão — risco de segurança do paciente. Contrabalança MS-3.
- **MC-2: Taxa de Abuso do Canal de Comunicação** — Número de mensagens automatizadas enviadas por paciente por dia. Não deve exceder 2/dia. Contrabalança MS-1 e MS-2: notificação agressiva para preencher slots pode corroer a confiança do paciente. Valida RF-21.

---

## 8. Perguntas em Aberto

1. **Persistência da Fila de Espera** — A Fila de Espera e a Fila de Consultas devem ser migradas para tabelas Supabase neste ciclo de desenvolvimento, ou documentadas como v2? A decisão impacta RF-16 e a colaboração multiusuário.
2. **Provedor de WhatsApp** — Qual provedor externo está configurado (ou deve ser configurado) na Edge Function `send-whatsapp`? As credenciais já estão no ambiente Supabase da equipe?
3. **Schema canônico de Prontuários** — Qual tabela Supabase é canônica: `medical_records`, `patient_records` ou `records`? O repositório atual tenta as três em sequência como fallback. Confirmar e padronizar.
4. **Enum de status de Laudos** — O enum do banco de dados deve ser padronizado em `delivered` ou `completed`? Atualmente o mapper converte `finalizado → delivered`. O Apidog deve ser atualizado para corresponder.
5. **Edição de perfil para Médico** — Médicos podem atualizar seus próprios dados profissionais (especialidade, CRM, horários)? O RBAC atual diz não; confirmar se é intencional para v1.
6. **Exportação de analytics** — Exportação em PDF ou CSV da página de Analytics é necessária para o MVP ou adiada?
7. **Loop de confirmação de consulta** — A notificação da fila de espera deve incluir um link voltado ao paciente para confirmar o slot, ou a confirmação acontece por ligação telefônica?
8. **Persistência da sessão** — A implementação atual em `sessionStorage` perde a sessão ao fechar a aba. Um "Lembrar de mim" / sessão persistente é necessário para algum perfil?
9. **Landing Page** — `LandingPage.jsx` (disponível também em `docs/LandingPage.before-clinic.jsx`) é a página pública em `/`. Qual é o conteúdo pretendido e CTA para a landing page do MVP?
10. **E-mail como canal de envio real** — Há plano de implementar Edge Function de envio de e-mail (ex.: SendGrid, Resend) no escopo atual, ou e-mail permanece apenas como canal de log/filtro?

---

## 9. Índice de Premissas

- `[PREMISSA §2.2 P1]` — Operadoras de saúde, laboratórios externos e menores de idade (com responsável) são excluídos do escopo da v1.
- `[PREMISSA §RF-1 P2]` — Fechar a aba do navegador é intencional para encerrar a sessão (sem login persistente por design).
- `[PREMISSA §RF-3 P3]` — Redefinição de senha não confirma se um endereço de e-mail está cadastrado (previne enumeração de usuários).
- `[PREMISSA §RF-6 P4]` — Criar agendamentos para datas passadas é bloqueado por validação no cliente.
- `[PREMISSA §RF-9 P5]` — Apenas Admin/Gestor/Secretária podem marcar uma consulta como `realizado`. O paciente não pode auto-reportar comparecimento.
- `[PREMISSA §RF-10 P6]` — Lista de pacientes é paginada ou virtualizada para clínicas com mais de 100 pacientes.
- `[PREMISSA §RF-11 P7]` — Sem soft delete para pacientes na v1. Exclusão é permanente.
- `[PREMISSA §RF-16 P8]` — Registros da Fila de Espera permanecem em `localStorage` para o MVP. Migração para Supabase é pós-MVP.
- `[PREMISSA §RF-28 P9]` — Excluir um usuário não apaga em cascata suas consultas ou laudos. Política de retenção de dados a definir.
- `[PREMISSA §RF-32 P10]` — Perfis de Médico e Secretária são somente leitura na v1. Apenas Admin, Gestor e Paciente podem editar o próprio perfil.
- `[PREMISSA §JU-1 P11]` — Notificação da fila de espera aciona um link de confirmação voltado ao paciente. Fluxo real de URL de confirmação é item da v2.
- `[PREMISSA §JU-3 P12]` — Exportação de dados de analytics (PDF/CSV) não é necessária para o MVP.
