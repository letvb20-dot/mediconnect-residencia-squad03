const buttonVariants = {
  primary:
    'border-sky-700 bg-sky-700 text-white hover:bg-sky-800 focus-visible:outline-sky-700',
  secondary:
    'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-slate-500',
  ghost:
    'border-transparent bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-500',
  danger:
    'border-rose-600 bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600',
}

export const appCardClass = 'rounded-2xl border border-[#404040] bg-[#262626] shadow-sm'
export const appInputClass =
  'h-10 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 text-sm text-[#e5e5e5] outline-none transition placeholder:text-[#a3a3a3] focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]'
export const appTextareaClass =
  'min-h-28 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 py-2 text-sm leading-6 text-[#e5e5e5] outline-none transition placeholder:text-[#a3a3a3] focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]'
export const appLabelClass = 'mb-1.5 block text-xs font-medium text-[#e5e5e5]'

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
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  )
}

export function PageHeader({ actions, description, eyebrow, title }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#3b82f6]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#e5e5e5] md:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#a3a3a3] md:text-base">
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
