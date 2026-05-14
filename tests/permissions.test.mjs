import assert from 'node:assert/strict'
import test from 'node:test'

import { canAccess, hasCapability, normalizeRole } from '../src/config/permissions.js'

test('normaliza aliases de perfis conhecidos', () => {
  assert.equal(normalizeRole('doctor'), 'medico')
  assert.equal(normalizeRole('Gestao / Coordenacao'), 'gestor')
  assert.equal(normalizeRole('administrator'), 'admin')
  assert.equal(normalizeRole('secretary'), 'secretaria')
})

test('medico acessa painel, pacientes e prontuario, mas nao analytics', () => {
  assert.equal(canAccess('medico', '/pacientes'), true)
  assert.equal(canAccess('medico', '/prontuario/123'), true)
  assert.equal(canAccess('medico', '/inicio'), true)
  assert.equal(canAccess('medico', '/relatorios'), false)
  assert.equal(canAccess('secretaria', '/prontuario/123'), false)
  assert.equal(canAccess('paciente', '/prontuario/123'), false)
})

test('secretaria acessa painel, agenda e pacientes', () => {
  assert.equal(canAccess('secretaria', '/inicio'), true)
  assert.equal(canAccess('secretaria', '/agenda'), true)
  assert.equal(canAccess('secretaria', '/pacientes'), true)
})

test('roles administrativos mantem capacidades criticas', () => {
  assert.equal(hasCapability('admin', 'manageUsers'), true)
  assert.equal(hasCapability('gestor', 'hardDeletePatients'), true)
  assert.equal(hasCapability('medico', 'hardDeletePatients'), false)
})
