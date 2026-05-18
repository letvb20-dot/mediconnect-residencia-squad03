import { createContext, useContext, useEffect, useState } from 'react'

const AccessibilityContext = createContext()

export function AccessibilityProvider({ children }) {
  const [isHighContrast, setIsHighContrast] = useState(() => {
    const stored = localStorage.getItem('mediconnect-high-contrast')
    return stored === 'true'
  })

  useEffect(() => {
    localStorage.setItem('mediconnect-high-contrast', String(isHighContrast))

    if (isHighContrast) {
      document.documentElement.classList.add('high-contrast')
    } else {
      document.documentElement.classList.remove('high-contrast')
    }
  }, [isHighContrast])

  const toggleHighContrast = () => {
    setIsHighContrast((prev) => !prev)
  }

  return (
    <AccessibilityContext.Provider value={{ isHighContrast, toggleHighContrast }}>
      {children}
    </AccessibilityContext.Provider>
  )
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext)
  if (!context) {
    throw new Error('useAccessibility deve ser usado dentro de um AccessibilityProvider')
  }
  return context
}
