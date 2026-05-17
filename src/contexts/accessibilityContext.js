import { createContext, useContext } from 'react'

export const AccessibilityContext = createContext()

export function useAccessibility() {
  return useContext(AccessibilityContext)
}
