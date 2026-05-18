const buttonVariants = {
  primary:
    'border-transparent bg-gradient-to-b from-[#4f93f7] to-[#3b82f6] text-white shadow-[0_2px_8px_rgba(59,130,246,0.3)] hover:shadow-[0_4px_12px_rgba(59,130,246,0.4)] hover:brightness-110 focus-visible:outline-[#3b82f6]',
  secondary:
    'border-border-default-v2 bg-surface-card text-text-body hover:bg-surface-card-hover focus-visible:outline-border-strong',
  ghost:
    'border-transparent bg-transparent text-text-muted-v2 hover:bg-surface-card-hover hover:text-text-body focus-visible:outline-border-strong',
  danger:
    'border-rose-600 bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600',
}

export const appCardClass = 'rounded-2xl border border-border-default-v2 bg-surface-card shadow-card transition-shadow hover:shadow-card-hover'
export const appInputClass =
  'h-11 w-full rounded-xl border border-border-default-v2 bg-surface-inset px-3 text-sm text-text-body outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary focus:ring-2 focus:ring-[#3b82f6]/20'
export const appTextareaClass =
  'min-h-28 w-full rounded-xl border border-border-default-v2 bg-surface-inset px-3 py-2 text-sm leading-6 text-text-body outline-none transition placeholder:text-text-muted-v2 focus:border-accent-primary focus:ring-2 focus:ring-[#3b82f6]/20'
export const appLabelClass = 'mb-1.5 block text-xs font-medium text-text-heading'

export function Button({
  children,
  className = '',
  variant = 'primary',
  type = 'button',
  ...props
}) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${buttonVariants[variant]} ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  )
}

export function Card({ children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-border-default-v2 bg-surface-card shadow-card transition-shadow hover:shadow-card-hover ${className}`}>
      {children}
    </section>
  )
}

export function PageHeader({ actions, description, eyebrow, title }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-heading md:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted-v2 md:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  )
}

export function DarkField({ children, label }) {
  return (
    <div className="block">
      <span className={appLabelClass}>{label}</span>
      {children}
    </div>
  )
}
