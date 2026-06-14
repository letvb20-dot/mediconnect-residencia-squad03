import { normalizeRole } from '../../../../config/permissions.js'
import { buscarConsultas } from './readTools.js'

// Registro central de ferramentas do agente.
// Fase 1: apenas buscarConsultas (esqueleto andante).
const ALL_TOOLS = [buscarConsultas]

// Filtra as ferramentas que o papel pode usar. O RBAC fino (escopo de dados)
// ainda é aplicado dentro de cada execute(); aqui é só o recorte por papel.
export function getToolsForRole(role) {
  const normalized = normalizeRole(role) || 'paciente'
  return ALL_TOOLS.filter((tool) => tool.allowedRoles.includes(normalized))
}
