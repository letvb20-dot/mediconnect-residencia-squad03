// Botão compacto de gravação por voz exibido no cabeçalho do card de Laudo.
// Compartilhado entre AtendimentoPage e ReportsPage.

function formatElapsed(ms) {
  if (!ms || ms < 0) return '00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function RecordingToolbar({ aiAvailable, elapsedMs, onStart, onStop, recordingState, supported }) {
  const isRecording = recordingState === 'recording'
  const isBusy = recordingState === 'transcribing'

  if (isRecording) {
    return (
      <button
        className="inline-flex h-10 items-center gap-2 rounded-md bg-red-600 px-3.5 text-xs font-bold text-white shadow-card transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        onClick={onStop}
        type="button"
      >
        <span className="relative flex size-3 items-center justify-center">
          <span className="absolute size-3 animate-ping rounded-full bg-white/40" />
          <span className="size-2 rounded-sm bg-white" />
        </span>
        <span className="tabular-nums">Parar · {formatElapsed(elapsedMs)}</span>
      </button>
    )
  }

  if (isBusy) {
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-md border border-border-default-v2 bg-surface-card-hover px-3.5 text-xs font-semibold text-text-muted-v2">
        <span className="size-2 animate-pulse rounded-full bg-accent-primary" />
        Transcrevendo...
      </span>
    )
  }

  const isDone = recordingState === 'ready'
  const isError = recordingState === 'error'
  return (
    <button
      className={`inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-card-hover disabled:text-text-muted-v2 ${
        isDone
          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
          : 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/15'
      }`}
      disabled={!supported}
      onClick={onStart}
      title={!aiAvailable ? 'Configure VITE_GEMINI_API_KEY no .env para habilitar' : undefined}
      type="button"
    >
      <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect height="14" rx="3" width="6" x="9" y="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
      {isDone ? 'Gravar novamente' : isError ? 'Tentar de novo' : 'Preencher por voz'}
    </button>
  )
}
