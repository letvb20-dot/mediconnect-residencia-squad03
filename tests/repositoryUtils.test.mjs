import assert from 'node:assert/strict'
import test from 'node:test'

import { getResponseError, translateErrorMessage } from '../src/repositories/repositoryUtils.js'

test('traduz erros crus comuns do Supabase para pt-BR', () => {
  assert.equal(translateErrorMessage('Invalid login credentials'), 'E-mail ou senha inválidos.')
  assert.equal(
    translateErrorMessage('new row violates row-level security policy for table "patients"'),
    'Você não tem permissão para realizar esta ação.',
  )
  assert.equal(
    translateErrorMessage('invalid input value for enum appointment_type: "teleconsulta"'),
    'Valor inválido para uma opção do sistema.',
  )
})

test('traduz CPF duplicado mesmo quando a API mistura portugues e erro tecnico', () => {
  assert.equal(
    translateErrorMessage('Falha ao criar registro do paciente: duplicate key value violates unique constraint "patients_cpf_key"'),
    'Já existe um paciente cadastrado com este CPF.',
  )
})

test('getResponseError preserva erros estruturados em portugues da API', async () => {
  const response = new Response(
    JSON.stringify({
      title: 'Erro de Validacao',
      errors: {
        cpf: ['Campo obrigatorio'],
      },
    }),
    { status: 400 },
  )

  const message = await getResponseError(response, 'Erro ao criar usuario.')

  assert.match(message, /Erro ao criar usuario\. \(400\):/)
  assert.match(message, /cpf: Campo obrigatorio/)
})

test('getResponseError entende Problem Details RFC 7807 com invalid_params', async () => {
  const response = new Response(
    JSON.stringify({
      type: 'https://api.mediconnect/errors/validation',
      title: 'Erro de validação',
      status: 400,
      detail: 'CPF inválido.',
      invalid_params: [{ name: 'cpf', reason: 'CPF inválido' }],
    }),
    { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
  )

  const message = await getResponseError(response, 'Erro ao cadastrar paciente.')

  assert.match(message, /Erro ao cadastrar paciente\. \(400\):/)
  assert.match(message, /CPF inválido/)
})

test('getResponseError usa fallback em ingles desconhecido', async () => {
  const response = new Response('Something went wrong in backend', { status: 500 })
  const message = await getResponseError(response, 'Falha ao salvar registro.')

  assert.equal(message, 'Falha ao salvar registro. (500): Falha ao salvar registro.')
})
