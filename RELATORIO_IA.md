# Relatório — Inteligência Artificial no MediConnect

Documento descreve como a IA funciona **atualmente** no projeto após a implementação.

---

## 1. Visão geral

Foram adicionadas três funcionalidades de IA, disponíveis conforme o perfil do usuário:

1. **Chatbot assistente** — ajuda de navegação e consultas de dados, em todas as telas.
2. **Geração automática de laudo/relatório** — rascunho de laudo dentro do editor de Relatórios.
3. **Lista de Espera Virtual Inteligente** — priorização, predição de cancelamentos, encaixes e notificação automática.

### Restrição de arquitetura
O projeto **não tem acesso ao backend (Supabase)** para hospedar uma função que guarde uma chave de API com segurança. Por isso a IA roda em **modo heurístico/local** por padrão (sem custo, sem chave, funciona offline), atrás de uma camada de abstração que está **pronta para usar a API do Claude** quando uma chave for fornecida.

---

## 2. Camada central: `aiClient`

Arquivo: `src/lib/ai/aiClient.js`

Toda a interface de IA passa por este módulo. Cada função decide a origem da resposta:

- Se existir `VITE_ANTHROPIC_API_KEY` no ambiente → chama a **API do Claude** direto do navegador (header `anthropic-dangerous-direct-browser-access`, modelo padrão `claude-haiku-4-5`).
- Caso contrário → usa o **motor heurístico local** correspondente.

Funções expostas:

| Função | Uso | Origem |
|---|---|---|
| `chat({ messages, role, data })` | Chatbot | Claude se houver chave; senão `chatEngine` |
| `generateReport({ patientName, exam, complaint, templateTitle })` | Laudo | Claude se houver chave; senão `reportGenerator` |
| `rankWaitlist({ waitlist, slot })` | Priorização da espera | Sempre local (`waitlistEngine`) |
| `predictCancellations({ appointments })` | Risco de cancelamento | Sempre local (`waitlistEngine`) |

`aiClient.isLive()` indica se a IA generativa real está ativa (chave presente).

---

## 3. Funcionalidade 1 — Chatbot

- **UI:** `src/components/ai/ChatbotWidget.jsx`, montado globalmente no `AppShell` (botão flutuante no canto inferior direito). Histórico guardado em `sessionStorage`.
- **Motor local:** `src/lib/ai/chatEngine.js` — casa a intenção da mensagem (palavras-chave) com dados de contexto e devolve `{ text, route? }`.
- **Dados de contexto:** o widget carrega, conforme o perfil, consultas (`appointmentRepository`), lista de espera (`waitlistRepository`) e perfil (`profileRepository`), calculando: consultas de hoje, total, taxa de cancelamento e nº na espera.

**Comportamento por perfil:**
- **Médico** — consultas da própria agenda, lista de espera.
- **Secretária** — consultas do dia, lacunas, espera.
- **Gestor/Admin** — métricas agregadas (taxa de cancelamento, total).
- **Paciente** — como agendar, status de laudos.
- **Todos** — navegação ("onde vejo os laudos?") com botão "Abrir →".

O chatbot é somente leitura/orientação — não executa ações destrutivas.

---

## 4. Funcionalidade 2 — Geração de laudo com IA

- **UI:** botão **"Gerar com IA"** + campo de queixa no editor de relatórios (`src/pages/ReportsPage.jsx`, modal "Novo relatório").
- **Motor local:** `src/lib/ai/reportGenerator.js` — banco de frases clínicas por tipo de quadro (viral, hipertensão, hemograma, imagem, encaminhamento). A partir da queixa/exame/modelo escolhido, gera **exame, CID-10, diagnóstico, conclusão e conteúdo HTML** do rascunho.
- **Fluxo:** o médico digita a queixa → clica em "Gerar com IA" → os campos do editor são pré-preenchidos → revisa e salva pelo fluxo normal (`reportRepository.create`). O conteúdo gerado é marcado como **rascunho a ser revisado**.
- **Acesso:** médico, gestor e admin (perfis com a rota `/laudos`).

---

## 5. Funcionalidade 3 — Lista de Espera Inteligente

- **Página:** `src/pages/WaitlistPage.jsx` (rota `/lista-espera`).
- **Persistência:** `src/repositories/waitlistRepository.js` (em `localStorage`, evento `mediconnect:waitlist-changed`).
- **Motor local:** `src/lib/ai/waitlistEngine.js`.

**Recursos:**
- **Inscrição** com paciente, médico (preferência), modalidade, **urgência (1–5)**, motivo e **canal de contato** (WhatsApp/SMS/E-mail).
- **Priorização (matching):** score = peso da urgência + tempo de espera + casamento de médico/modalidade.
- **Predição de cancelamentos:** pontua agendamentos (não confirmados, horário de pico de faltas, teleconsulta, antecedência) e classifica em risco **baixo/médio/alto**.
- **Encaixes sugeridos:** cruza lacunas de agenda (próximos 7 dias, via `availabilityRepository.getAvailableSlots`) com a lista de espera.
- **Notificação multicanal:** botão "Notificar" registra uma notificação no canal escolhido (reaproveita `notificationRepository` + sino/toast do AppShell).

**Disparo automático no cancelamento:** em `src/hooks/useAgenda.js` (`handleCancelAppointment`), após a promoção da fila slot-específica já existente (`visitRepository`), se o horário continuar livre, o melhor paciente da lista de espera (mesmo médico/modalidade) é selecionado e **notificado automaticamente**.

**Acesso:** secretária, gestor e admin gerenciam; **médico em modo leitura**.

---

## 6. Como ativar a IA generativa (Claude)

Hoje funciona em modo local. Para usar respostas reais do Claude:

1. Edite o arquivo `.env` na raiz do projeto.
2. Preencha `VITE_ANTHROPIC_API_KEY=` com sua chave da Anthropic.
3. (Opcional) ajuste `VITE_ANTHROPIC_MODEL`.
4. Reinicie o `npm run dev`.

O chatbot passará a exibir "IA conectada" e usará o Claude no chatbot e na geração de laudo. A priorização e a predição da lista de espera permanecem locais (são cálculos determinísticos, sem custo).

> Observação de segurança: chamar a API do navegador expõe a chave no cliente. É adequado apenas para demonstração/uso local. Em produção, a chamada deveria passar por um backend (ex.: Supabase Edge Function).

---

## 7. Arquivos

**Criados:**
- `src/lib/ai/aiClient.js`
- `src/lib/ai/chatEngine.js`
- `src/lib/ai/reportGenerator.js`
- `src/lib/ai/waitlistEngine.js`
- `src/components/ai/ChatbotWidget.jsx`
- `src/repositories/waitlistRepository.js`
- `src/pages/WaitlistPage.jsx`

**Modificados:**
- `src/components/AppShell.jsx` (chatbot + item de menu)
- `src/pages/ReportsPage.jsx` (botão Gerar com IA)
- `src/hooks/useAgenda.js` (gatilho da espera no cancelamento)
- `src/config/permissions.js` (rota/menu da lista de espera)
- `src/App.jsx` (rota `/lista-espera`)

---

## 8. Verificação realizada
- `npm run lint` — sem erros.
- `npm test` — 78/78 testes passando.
- `npm run build` — build de produção OK.
- Navegador (login real como médico) — chatbot responde com escopo do perfil, geração de laudo preenche os campos, página de lista de espera renderiza; **sem erros no console**.
