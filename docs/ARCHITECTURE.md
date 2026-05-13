# Arquitetura e Boas Práticas do Front-end (React)

Este documento estabelece as regras canônicas de arquitetura para este projeto. **Qualquer Inteligência Artificial ou desenvolvedor que atuar neste código DEVE ler e seguir estas diretrizes rigorosamente.**

O objetivo desta arquitetura é manter o ecossistema React amigável para desenvolvedores com mentalidade de Backend, priorizando a Separação de Conceitos (Separation of Concerns) e a previsibilidade dos dados.

## 1. A API é a Única Fonte da Verdade (Fim dos Mocks)
- **Regra:** Não crie, não mantenha e não faça fallback para dados mockados (falsos) em produção ou na integração.
- **Motivo:** O banco de dados (Supabase) dita as regras. Se a API falhar, o front-end deve exibir um estado de erro elegante, e não mascarar a falha com dados locais inventados.
- **Ação:** Repositórios (`*Repository.js`) devem apenas fazer o `fetch` seguro para a API e repassar a resposta.

## 2. O Padrão MVC Adaptado (Model-View-Hook)
Para evitar que as Páginas (`*Page.jsx`) se tornem "Componentes Deuses" (fazendo requisições, filtrando dados e renderizando HTML ao mesmo tempo), adotamos o seguinte fluxo:

### A. Repositório (Acesso a Dados)
- Fica na pasta `src/repositories/`.
- Sua ÚNICA função é bater na API, tratar erros HTTP e devolver o JSON puro (Array ou Objeto).
- Não deve conter regras de negócio, filtragem de tela ou formatação de datas.

### B. Mappers (Tradução Estrita)
- Fica na pasta `src/mappers/`.
- Traduz os dados do banco para o formato que a UI espera.
- **Regra de Ouro:** O Mapper deve ser **rígido**. Se o banco retorna `full_name`, o mapper converte para `name` e todo o resto da aplicação usa apenas `name`. Não propague a bagunça do banco para a tela.

### C. Custom Hooks (O Controlador)
- Fica na pasta `src/hooks/` (ex: `useAgenda.js`).
- Puxa os dados do repositório, passa pelo mapper, controla os estados de `loading`, `error`, e lida com a lógica de negócio (como submissão de formulários e filtragem de abas).
- Ele encapsula todos os `useEffect` e `useState` complexos.

### D. Páginas e Componentes (A View Burra)
- Fica em `src/pages/` e `src/components/`.
- As páginas são estritamente cascas visuais (HTML/Tailwind).
- Elas importam o Custom Hook, pegam as variáveis prontas e apenas decidem como desenhar isso na tela.

## 3. Lidar com Datas (Fuso Horário)
- Sempre que a API enviar uma data no formato string `YYYY-MM-DD`, lembre-se que o construtor nativo do JavaScript (`new Date('YYYY-MM-DD')`) converte para o horário UTC e, dependendo do fuso do usuário, pode jogar a data para o dia anterior.
- **Solução:** Use o helper local `parseLocalDate` ou processe os componentes da data (ano, mês, dia) manualmente antes de criar o objeto `Date`.

## Exemplo de Fluxo Ideal
1. A página `PacientesPage.jsx` chama o hook `const { pacientes, loading } = usePacientes()`.
2. O hook `usePacientes` chama o `patientRepository.getAll()`.
3. O repositório faz `fetch` na API.
4. O hook pega o resultado, passa no `patientMapper.toUi()` e atualiza o estado interno.
5. A página renderiza os dados que chegaram do hook.
