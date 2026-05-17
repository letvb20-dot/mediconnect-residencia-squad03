import { useEffect, useState } from 'react'

import { AccessibilityContext } from './accessibilityContext.js'

const SETTINGS_UI_KEY = 'mediconnect.settings.ui'

function getStoredUiSettings() {
  try {
    return { animations: true, contrast: false, typographicScale: 'standard', language: 'pt-br', ...JSON.parse(localStorage.getItem(SETTINGS_UI_KEY) || '{}') }
  } catch {
    return { animations: true, contrast: false, typographicScale: 'standard', language: 'pt-br' }
  }
}

export function AccessibilityProvider({ children }) {
  const [ui, setUi] = useState(getStoredUiSettings)

  useEffect(() => {
    localStorage.setItem(SETTINGS_UI_KEY, JSON.stringify(ui))
    document.documentElement.classList.toggle('settings-animations-off', !ui.animations)
    document.documentElement.classList.toggle('settings-high-contrast', ui.contrast)
    
    document.documentElement.classList.remove('text-scale-sm', 'text-scale-standard', 'text-scale-lg')
    if (ui.typographicScale) {
      document.documentElement.classList.add(`text-scale-${ui.typographicScale}`)
    }
  }, [ui])

  function updateUi(field, value) {
    setUi((current) => ({ ...current, [field]: value }))
  }

  return (
    <AccessibilityContext.Provider value={{ ui, updateUi }}>
      {children}
    </AccessibilityContext.Provider>
  )
}
