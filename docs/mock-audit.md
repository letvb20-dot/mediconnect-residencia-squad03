# Auditoria de Mocks e Integracoes Parciais

Este documento lista os pontos do sistema que ainda usam dados simulados, fallback local ou integracao parcial. O objetivo e separar comportamento intencional de prototipo de fluxos que ja dependem da API.

## Painel

- Origem atual: dados agregados montados na tela.
- Risco: indicadores podem divergir da base real.
- Acao recomendada: substituir por endpoints de metricas assim que a API disponibilizar indicadores consolidados.

## Analytics

- Origem atual: indicadores calculados a partir de `appointments`, `patients` e `doctors`.
- Risco: faturamento fica zerado quando a agenda nao possui valor financeiro.
- Acao recomendada: criar endpoint consolidado de BI quando houver tabela financeira.

## Consultas

- Origem atual: fila derivada de `appointments`.
- Risco: ainda nao ha endpoint especifico de triagem, sinais vitais ou sala de espera.
- Acao recomendada: evoluir para tabela propria de atendimento quando o backend existir.

## Comunicacao

- Origem atual: historico e templates carregados de tabelas de comunicacao quando existirem; SMS usa Edge Function.
- Risco: se as tabelas nao existirem, a tela mostra estado vazio.
- Acao recomendada: padronizar tabelas `communication_logs` e `communication_templates`.

## Prontuario

- Origem atual: CRUD tenta `medical_records`, `patient_records` e `records`.
- Risco: campos clinicos dependem da nomenclatura real da tabela disponivel.
- Acao recomendada: padronizar schema de prontuario no Supabase.

## Relatorios

- Origem atual: templates de conteudo sao locais em `src/data/reportTemplates.js`.
- Risco: baixo; templates sao conteudo inicial, nao dados clinicos gravados.
- Acao recomendada: manter local se forem padroes do produto ou migrar para configuracao administrativa no futuro.

## Configuracoes

- Origem atual: preferencias visuais locais no navegador.
- Risco: preferencia nao acompanha o usuario em outro dispositivo.
- Acao recomendada: persistir preferencias no perfil quando houver campo/API para isso.
