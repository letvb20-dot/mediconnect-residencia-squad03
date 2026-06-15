// Card de confirmação de ações de escrita, exibido FORA do fluxo de mensagens
// (entre a lista de mensagens e o campo de input). O loop do agente pausa
// aguardando Aceitar/Recusar — ver onConfirm em runAgent/ChatbotWidget.
export function ConfirmationCard({ resumo, label, onAccept, onReject }) {
  const destrutivo = typeof resumo === 'string' && resumo.includes('⚠️')
  return (
    <div
      className={`border-t px-3 py-3 ${
        destrutivo
          ? 'border-red-500/40 bg-red-500/5'
          : 'border-accent-primary/40 bg-accent-primary/5'
      }`}
    >
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted-v2">
        {label || 'Confirmar ação'}
      </p>
      <p className="mb-2.5 text-sm leading-5 text-text-body">{resumo}</p>
      <div className="flex gap-2">
        <button
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${
            destrutivo ? 'bg-red-600 hover:bg-red-700' : 'bg-accent-primary hover:bg-accent-hover'
          }`}
          onClick={onAccept}
          type="button"
        >
          Aceitar
        </button>
        <button
          className="flex-1 rounded-lg border border-border-default-v2 bg-surface-inset px-3 py-1.5 text-xs font-semibold text-text-body transition hover:bg-surface-card-hover"
          onClick={onReject}
          type="button"
        >
          Recusar
        </button>
      </div>
    </div>
  )
}
