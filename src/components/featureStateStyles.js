export const featureStateStyles = {
  live: {
    badge: 'hidden',
    panel: 'border-[#404040] bg-[#262626]',
    title: 'text-[#e5e5e5]',
    label: '',
  },
  partial: {
    badge: 'feature-badge-partial border-[#3b82f6]/40 bg-[#3b82f6]/15 text-[#93c5fd]',
    panel: 'feature-panel-partial border-[#3b82f6]/35 bg-[#3b82f6]/8',
    title: 'feature-title-partial text-[#93c5fd]',
    label: 'Parcial',
  },
  wip: {
    badge: 'feature-badge-wip border-rose-500/40 bg-rose-500/15 text-rose-300',
    panel: 'feature-panel-wip border-rose-500/35 bg-rose-500/8',
    title: 'feature-title-wip text-rose-300',
    label: 'WIP',
  },
}

export function featurePanelClass(status = 'partial') {
  const current = featureStateStyles[status] || featureStateStyles.partial
  return current.panel
}
