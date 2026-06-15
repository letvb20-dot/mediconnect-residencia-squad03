import { normalizeRole } from '../../../../config/permissions.js'
import {
  buscarConsultas,
  buscarPacientes,
  detalharPaciente,
  buscarProfissionais,
  buscarHorariosDisponiveis,
  buscarJanelasAtendimento,
  buscarExcecoesAgenda,
  buscarListaEspera,
  buscarLaudos,
  buscarProntuarios,
  detalharProntuario,
  buscarMetricas,
  resumoDoDia,
  buscarFilaAtendimento,
  buscarMensagens,
  buscarTemplatesMensagem,
  buscarCampanhas,
  buscarNotificacoes,
  buscarUsuarios,
  detalharUsuario,
} from './readTools.js'
import {
  agendarConsulta,
  adicionarListaEspera,
  criarLaudo,
  criarProntuario,
  cadastrarPaciente,
  cadastrarProfissional,
  criarUsuario,
  criarJanelaAtendimento,
  criarExcecaoAgenda,
  enviarMensagem,
  enfileirarAtendimento,
  cancelarConsulta,
  remarcarConsulta,
  atualizarPaciente,
  atualizarLaudo,
  atualizarProntuario,
  atualizarJanelaAtendimento,
  atualizarUsuario,
  atualizarListaEspera,
  marcarListaEsperaNotificada,
  marcarAtendimentoAgendado,
  marcarNotificacoesLidas,
  removerPaciente,
  removerUsuario,
  removerLaudo,
  removerJanelaAtendimento,
  removerDaListaEspera,
  removerDaFila,
} from './writeTools.js'

// Registro central de ferramentas do agente.
// Leitura (executa direto) + escrita (requiresConfirmation: true, card de
// confirmação). O recorte por papel é o allowedRoles de cada tool (barreira
// principal); o escopo/ownership fino é forçado dentro de cada execute().
const ALL_TOOLS = [
  // Leitura
  buscarConsultas,
  buscarPacientes,
  detalharPaciente,
  buscarProfissionais,
  buscarHorariosDisponiveis,
  buscarJanelasAtendimento,
  buscarExcecoesAgenda,
  buscarListaEspera,
  buscarLaudos,
  buscarProntuarios,
  detalharProntuario,
  buscarMetricas,
  resumoDoDia,
  buscarFilaAtendimento,
  buscarMensagens,
  buscarTemplatesMensagem,
  buscarCampanhas,
  buscarNotificacoes,
  buscarUsuarios,
  detalharUsuario,
  // Escrita — CREATE
  agendarConsulta,
  adicionarListaEspera,
  criarLaudo,
  criarProntuario,
  cadastrarPaciente,
  cadastrarProfissional,
  criarUsuario,
  criarJanelaAtendimento,
  criarExcecaoAgenda,
  enviarMensagem,
  enfileirarAtendimento,
  // Escrita — UPDATE
  cancelarConsulta,
  remarcarConsulta,
  atualizarPaciente,
  atualizarLaudo,
  atualizarProntuario,
  atualizarJanelaAtendimento,
  atualizarUsuario,
  atualizarListaEspera,
  marcarListaEsperaNotificada,
  marcarAtendimentoAgendado,
  marcarNotificacoesLidas,
  // Escrita — DELETE
  removerPaciente,
  removerUsuario,
  removerLaudo,
  removerJanelaAtendimento,
  removerDaListaEspera,
  removerDaFila,
]

// Filtra as ferramentas que o papel pode usar. O RBAC fino (escopo de dados)
// ainda é aplicado dentro de cada execute(); aqui é só o recorte por papel.
export function getToolsForRole(role) {
  const normalized = normalizeRole(role) || 'paciente'
  return ALL_TOOLS.filter((tool) => tool.allowedRoles.includes(normalized))
}
