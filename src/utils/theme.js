export const THEME_STORAGE_KEY = 'mediconnect.theme'

export function getStoredTheme() {
  if (typeof window === 'undefined') return 'light'

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return storedTheme === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return

  const normalizedTheme = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = normalizedTheme
  document.documentElement.style.colorScheme = normalizedTheme
}

export function setStoredTheme(theme) {
  const normalizedTheme = theme === 'light' ? 'light' : 'dark'

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme)
  }

  applyTheme(normalizedTheme)
  return normalizedTheme
}
