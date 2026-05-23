import assert from 'node:assert/strict'
import test from 'node:test'

import { canAccess, hasCapability, normalizeRole, ROLE_NAV_ITEMS } from '../src/config/permissions.js'

test('normaliza aliases de perfis conhecidos', () => {
  assert.equal(normalizeRole('doctor'), 'medico')
  assert.equal(normalizeRole('Médico(a)'), 'medico')
  assert.equal(normalizeRole('Gestao / Coordenacao'), 'gestor')
  assert.equal(normalizeRole('administrator'), 'admin')
  assert.equal(normalizeRole('secretary'), 'secretaria')
  assert.equal(normalizeRole('Secretária clínica'), 'secretaria')
})

test('medico acessa painel, profissionais, consultas, pacientes e prontuario, mas nao analytics', () => {
  assert.equal(canAccess('medico', '/pacientes'), true)
  assert.equal(canAccess('medico', '/profissionais'), true)
  assert.equal(canAccess('medico', '/profissionais/doctor-1'), false)
  assert.equal(canAccess('medico', '/consultas'), true)
  assert.equal(canAccess('Médico(a)', '/consultas'), true)
  assert.equal(canAccess('medico', '/prontuario/123'), true)
  assert.equal(canAccess('medico', '/inicio'), true)
  assert.equal(canAccess('medico', '/relatorios'), false)
  assert.equal(canAccess('secretaria', '/prontuario/123'), false)
  assert.equal(canAccess('paciente', '/prontuario/123'), false)
  assert.equal(ROLE_NAV_ITEMS.medico.some((item) => item.path === '/profissionais'), true)
})

test('secretaria acessa painel, agenda, consultas e pacientes', () => {
  assert.equal(canAccess('secretaria', '/inicio'), true)
  assert.equal(canAccess('secretaria', '/agenda'), true)
  assert.equal(canAccess('secretaria', '/profissionais'), true)
  assert.equal(canAccess('secretaria', '/consultas'), true)
  assert.equal(canAccess('Secretária clínica', '/consultas'), true)
  assert.equal(canAccess('secretaria', '/pacientes'), true)
})

test('paciente acessa agendamento, relatorios clinicos, configuracoes e perfil', () => {
  assert.equal(canAccess('paciente', '/agenda'), false)
  assert.equal(canAccess('paciente', '/agendamento'), true)
  assert.equal(canAccess('paciente', '/agendamento/doctor-1'), true)
  assert.equal(canAccess('paciente', '/profissionais'), false)
  assert.equal(canAccess('paciente', '/profissionais/doctor-1'), false)
  assert.equal(canAccess('paciente', '/laudos'), true)
  assert.equal(canAccess('paciente', '/configuracoes'), true)
  assert.equal(canAccess('paciente', '/perfil'), true)
  assert.equal(canAccess('paciente', '/inicio'), false)
  assert.equal(canAccess('paciente', '/pacientes'), false)
  assert.equal(canAccess('paciente', '/relatorios'), false)
  assert.equal(canAccess('paciente', '/comunicacao'), false)
})

test('roles administrativos mantem capacidades criticas', () => {
  assert.equal(hasCapability('admin', 'manageUsers'), true)
  assert.equal(hasCapability('gestor', 'hardDeletePatients'), true)
  assert.equal(hasCapability('medico', 'hardDeletePatients'), false)
})
