import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isCommunicationEligiblePatient,
  isPatientCommunicationOptedOut,
} from '../src/utils/communicationEligibility.js'

test('pacientes com opt-out explicito nao sao elegiveis para comunicacao', () => {
  assert.equal(isPatientCommunicationOptedOut({ opt_out: true }), true)
  assert.equal(isCommunicationEligiblePatient({ opt_out: true }), false)
})

test('pacientes sem opt-in LGPD nao sao elegiveis para comunicacao', () => {
  assert.equal(isPatientCommunicationOptedOut({ lgpdOptIn: false }), true)
  assert.equal(isCommunicationEligiblePatient({ lgpdOptIn: false }), false)
})

test('pacientes com opt-in LGPD permanecem elegiveis', () => {
  assert.equal(isPatientCommunicationOptedOut({ lgpd_opt_in: true }), false)
  assert.equal(isCommunicationEligiblePatient({ lgpd_opt_in: true }), true)
})
