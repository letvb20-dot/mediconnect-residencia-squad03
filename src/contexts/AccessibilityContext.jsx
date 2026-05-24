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

  // ── Side-effect: sync state → localStorage + DOM classes ──
  useEffect(() => {
    localStorage.setItem(SETTINGS_UI_KEY, JSON.stringify(ui))

    // Animations toggle
    document.documentElement.classList.toggle('settings-animations-off', !ui.animations)

    // High Contrast — applies "high-contrast" class on <html> (document.documentElement)
    // This single class activates the comprehensive CSS token overrides in index.css
    // Because it lives on the root <html> element, it affects ALL routes globally
    document.documentElement.classList.toggle('high-contrast', ui.contrast)

    // Typographic scale
    document.documentElement.classList.remove('text-scale-sm', 'text-scale-standard', 'text-scale-lg')
    if (ui.typographicScale) {
      document.documentElement.classList.add(`text-scale-${ui.typographicScale}`)
    }
  }, [ui])

  function updateUi(field, value) {
    setUi((current) => ({ ...current, [field]: value }))
  }

  /** Convenience toggle for the high contrast switch */
  function toggleHighContrast() {
    setUi((current) => ({ ...current, contrast: !current.contrast }))
  }

  return (
    <AccessibilityContext.Provider value={{ ui, updateUi, toggleHighContrast, isHighContrast: ui.contrast }}>
      {children}
    </AccessibilityContext.Provider>
  )
}
