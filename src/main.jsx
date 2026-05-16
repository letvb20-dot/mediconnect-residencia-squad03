import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyTheme, getStoredTheme } from './utils/theme.js'
import { AccessibilityProvider } from './contexts/AccessibilityContext.jsx'
import { SocketProvider } from './providers/SocketProvider.jsx'
import { ToastProvider } from './components/ui/toast.jsx'

applyTheme(getStoredTheme())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AccessibilityProvider>
      <SocketProvider>
        <ToastProvider />
        <App />
      </SocketProvider>
    </AccessibilityProvider>
  </StrictMode>,
)
