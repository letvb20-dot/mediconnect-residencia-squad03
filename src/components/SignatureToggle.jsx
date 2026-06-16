// Toggle "Assinar digitalmente" usado nos editores de laudo.
// ON  → o nome do médico aparece na linha de assinatura do laudo gerado.
// OFF → a linha fica vazia para o médico assinar manualmente após imprimir.

export function SignatureToggle({ checked, onChange }) {
  return (
    <label
      className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs font-semibold transition focus-within:ring-2 focus-within:ring-accent-primary/40 ${
        checked
          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
          : 'border-border-default-v2 bg-surface-card-hover text-text-muted-v2 hover:border-border-strong hover:text-text-body'
      }`}
      title={checked
        ? 'Quando ativado, o nome do médico aparece impresso na linha de assinatura.'
        : 'Quando desativado, a linha fica em branco para assinatura manual após imprimir.'}
    >
      <input
        checked={checked}
        className="sr-only"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="m17 3 4 4-11 11H6v-4L17 3z" />
        <path d="m13.5 6.5 4 4" />
      </svg>
      <span>Assinar digitalmente</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition ${checked ? 'bg-emerald-500/80' : 'bg-border-default-v2'}`}
      >
        <span className={`inline-block size-3 rounded-full bg-white shadow-sm transition ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
      </span>
    </label>
  )
}
