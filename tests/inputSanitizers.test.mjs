import assert from 'node:assert/strict'
import test from 'node:test'

import { maskHeight, maskRg, sanitizeFieldValue, sanitizePersonName } from '../src/utils/inputSanitizers.js'
import { isValidPersonName } from '../src/utils/brFormatters.js'

test('maskRg aplica mascara brasileira comum de RG', () => {
  assert.equal(maskRg('123456789'), '12.345.678-9')
})

test('maskHeight aplica mascara de altura em metros', () => {
  assert.equal(maskHeight('170'), '1,70')
  assert.equal(maskHeight('085'), '0,85')
  assert.equal(maskHeight('1,82'), '1,82')
})

test('sanitizeFieldValue nao trata tipos de outros documentos como CPF', () => {
  assert.equal(sanitizeFieldValue('otherDocuments', 'Passaporte'), 'Passaporte')
})

test('sanitizePersonName bloqueia numeros e caracteres especiais', () => {
  assert.equal(sanitizePersonName('Ana 123 @Silva!'), 'Ana  Silva')
  assert.equal(sanitizePersonName('Joao-Maria'), 'JoaoMaria')
})

test('isValidPersonName rejeita nomes com numeros e caracteres especiais', () => {
  assert.equal(isValidPersonName('Ana Silva'), true)
  assert.equal(isValidPersonName('Ana 123'), false)
  assert.equal(isValidPersonName('ana@example.com'), false)
})
