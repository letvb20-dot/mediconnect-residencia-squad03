import assert from 'node:assert/strict'
import test from 'node:test'

// O fluxo de contexto estático foi removido quando o chatbot passou a ser 100%
// agêntico (function calling). Saíram junto: buildContext (src/utils/chatbotContext.js),
// aiClient.chat e o motor heurístico chatEngine.js — e os testes dessas peças.
// Mantemos aqui apenas a verificação de RBAC de rota (permissions.js), que segue
// válida e independente do mecanismo do assistente.
test('canAccess role permissions check', async () => {
  const { canAccess } = await import('../src/config/permissions.js')
  assert.equal(canAccess('paciente', '/pacientes'), false)
  assert.equal(canAccess('paciente', '/laudos'), true)
  assert.equal(canAccess('paciente', '/prontuario/123'), false)
  assert.equal(canAccess('medico', '/prontuario/123'), true)
  assert.equal(canAccess('secretaria', '/prontuario/123'), false)
  assert.equal(canAccess('secretaria', '/laudos'), false)
  assert.equal(canAccess('medico', '/laudos'), true)
})
