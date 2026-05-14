import assert from 'node:assert/strict'
import test from 'node:test'

import { maskRg, sanitizeFieldValue } from '../src/utils/inputSanitizers.js'

test('maskRg aplica mascara brasileira comum de RG', () => {
  assert.equal(maskRg('123456789'), '12.345.678-9')
})

test('sanitizeFieldValue nao trata tipos de outros documentos como CPF', () => {
  assert.equal(sanitizeFieldValue('otherDocuments', 'Passaporte'), 'Passaporte')
})
