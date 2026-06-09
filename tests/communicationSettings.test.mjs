import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getCommunicationSettings,
  saveCommunicationSettings,
} from '../src/utils/communicationSettings.js'

test('getCommunicationSettings retorna valores padrão quando não há nada no localStorage', () => {
  const previousWindow = globalThis.window
  const storage = new Map()

  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  }

  try {
    const settings = getCommunicationSettings()
    assert.equal(settings.sms_confirmation_enabled, true)
    assert.equal(settings.sms_reminder_enabled, true)
    assert.equal(settings.background_automation_enabled, true)
    assert.equal(settings.reminder_hours_ahead, 24)
    assert.match(settings.reminder_sms_template, /Olá {paciente}/)
  } finally {
    globalThis.window = previousWindow
  }
})

test('saveCommunicationSettings salva e recupera as preferências corretamente', () => {
  const previousWindow = globalThis.window
  const storage = new Map()
  let eventDispatched = null

  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    dispatchEvent: (event) => {
      eventDispatched = event
    },
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type
        this.detail = options.detail
      }
    }
  }

  try {
    const newSettings = {
      sms_confirmation_enabled: false,
      sms_reminder_enabled: false,
      background_automation_enabled: false,
      reminder_hours_ahead: 12,
      reminder_sms_template: "Template alterado",
    }

    saveCommunicationSettings(newSettings)
    assert.equal(storage.get('mediconnect.communication.settings.v1'), JSON.stringify(newSettings))

    const loaded = getCommunicationSettings()
    assert.equal(loaded.sms_confirmation_enabled, false)
    assert.equal(loaded.sms_reminder_enabled, false)
    assert.equal(loaded.background_automation_enabled, false)
    assert.equal(loaded.reminder_hours_ahead, 12)
    assert.equal(loaded.reminder_sms_template, "Template alterado")

    assert.ok(eventDispatched)
    assert.equal(eventDispatched.type, 'communication_settings_changed')
    assert.deepEqual(eventDispatched.detail, newSettings)
  } finally {
    globalThis.window = previousWindow
  }
})
