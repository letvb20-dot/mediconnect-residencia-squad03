import { useEffect, useState } from 'react'

export function ToastProvider() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    function handleShowToast(e) {
      const { title, description, type = 'default' } = e.detail
      const id = Date.now()
      setToasts((prev) => [...prev, { id, title, description, type }])
      
      // Auto-dismiss
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 5000)
    }

    window.addEventListener('app:show_toast', handleShowToast)
    return () => window.removeEventListener('app:show_toast', handleShowToast)
  }, [])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto min-w-[300px] max-w-sm rounded-md border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4 shadow-lg animate-in slide-in-from-bottom-5 fade-in-50 duration-300"
        >
          <div className="flex items-start gap-3">
            <div className={`grid size-8 shrink-0 place-items-center rounded-full ${
              toast.type === 'error' 
                ? 'bg-red-500/15 text-red-500' 
                : toast.type === 'success'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-[var(--accent-primary, #3b82f6)]/15 text-[var(--accent-primary, #3b82f6)]'
            }`}>
              {toast.type === 'error' ? (
                <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              ) : toast.type === 'success' ? (
                <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              ) : (
                <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">{toast.title}</h4>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{toast.description}</p>
            </div>
            <button 
              onClick={() => setToasts(t => t.filter(x => x.id !== toast.id))}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              aria-label="Fechar"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
