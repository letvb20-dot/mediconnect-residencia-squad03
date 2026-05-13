import { featureStateStyles } from './featureStateStyles.js'

export function FeatureBadge({ className = '', status = 'partial', text }) {
  const current = featureStateStyles[status] || featureStateStyles.partial

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${current.badge} ${className}`}
    >
      {text || current.label}
    </span>
  )
}

export function FeatureCallout({ className = '', description, status = 'partial', title }) {
  const current = featureStateStyles[status] || featureStateStyles.partial

  return (
    <div className={`rounded-2xl border px-4 py-3 ${current.panel} ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <FeatureBadge status={status} />
        {title ? <p className={`text-sm font-semibold ${current.title}`}>{title}</p> : null}
      </div>
      {description ? <p className="mt-2 text-sm leading-6 text-[#d4d4d4]">{description}</p> : null}
    </div>
  )
}

export function FeatureLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#404040] bg-[#202020] px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a3a3a3]">Legenda</span>
      <FeatureBadge status="live" />
      <FeatureBadge status="partial" />
      <FeatureBadge status="mock" />
      <FeatureBadge status="wip" />
    </div>
  )
}
