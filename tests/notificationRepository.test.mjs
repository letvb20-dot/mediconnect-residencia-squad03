import assert from 'node:assert/strict'
import test from 'node:test'

import { repairMojibake } from '../src/repositories/notificationRepository.js'

test('repairMojibake corrige textos corrompidos de notificacoes antigas', () => {
  assert.equal(repairMojibake('RelatÃ³rio criado'), 'Relatório criado')
  assert.equal(repairMojibake('Consulta de JoÃ£o foi cancelada.'), 'Consulta de João foi cancelada.')
})
