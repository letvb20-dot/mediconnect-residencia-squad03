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

test('getResponseError usa fallback em ingles desconhecido', async () => {
  const response = new Response('Something went wrong in backend', { status: 500 })
  const message = await getResponseError(response, 'Falha ao salvar registro.')

  assert.equal(message, 'Falha ao salvar registro. (500): Falha ao salvar registro.')
})
