export const THEME_STORAGE_KEY = 'mediconnect.theme'
export const DEFAULT_THEME = 'light'

function normalizeTheme(theme) {
  return theme === 'dark' ? 'dark' : DEFAULT_THEME
}

export function getStoredTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return normalizeTheme(storedTheme)
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return

  const normalizedTheme = normalizeTheme(theme)
  document.documentElement.dataset.theme = normalizedTheme
  document.documentElement.style.colorScheme = normalizedTheme
}

export function setStoredTheme(theme) {
  const normalizedTheme = normalizeTheme(theme)

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme)
  }

  applyTheme(normalizedTheme)
  return normalizedTheme
}
