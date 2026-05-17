import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  setStoredTheme,
} from '../src/utils/theme.js'

test('getStoredTheme usa tema claro quando nao existe preferencia salva', () => {
  const previousWindow = globalThis.window
  const storage = new Map()

  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  }

  try {
    assert.equal(DEFAULT_THEME, 'light')
    assert.equal(getStoredTheme(), 'light')
  } finally {
    globalThis.window = previousWindow
  }
})

test('applyTheme normaliza valores ausentes ou invalidos para claro', () => {
  const previousDocument = globalThis.document
  const documentElement = { dataset: {}, style: {} }

  globalThis.document = { documentElement }

  try {
    applyTheme()
    assert.equal(documentElement.dataset.theme, 'light')
    assert.equal(documentElement.style.colorScheme, 'light')

    applyTheme('unknown')
    assert.equal(documentElement.dataset.theme, 'light')
    assert.equal(documentElement.style.colorScheme, 'light')
  } finally {
    globalThis.document = previousDocument
  }
})

test('setStoredTheme preserva dark explicito e salva light para valores invalidos', () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const storage = new Map()
  const documentElement = { dataset: {}, style: {} }

  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  }
  globalThis.document = { documentElement }

  try {
    assert.equal(setStoredTheme('dark'), 'dark')
    assert.equal(storage.get(THEME_STORAGE_KEY), 'dark')
    assert.equal(documentElement.dataset.theme, 'dark')

    assert.equal(setStoredTheme('invalid'), 'light')
    assert.equal(storage.get(THEME_STORAGE_KEY), 'light')
    assert.equal(documentElement.dataset.theme, 'light')
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})
