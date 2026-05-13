export function BrandLogo({
  className = '',
  iconClassName = 'size-10 rounded-[6px]',
  iconButtonLabel = 'MediConnect',
  markClassName = 'size-6',
  onIconClick,
  textClassName = 'text-2xl font-bold leading-8 tracking-[-0.025em] text-white',
}) {
  const icon = (
    <div className={`grid place-items-center bg-[#3b82f6] text-white ${iconClassName}`}>
      <StethoscopeIcon className={markClassName} />
    </div>
  )

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {onIconClick ? (
        <button
          aria-label={iconButtonLabel}
          className="shrink-0 rounded-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50"
          onClick={onIconClick}
          title={iconButtonLabel}
          type="button"
        >
          {icon}
        </button>
      ) : (
        icon
      )}
      <p className={textClassName}>MediConnect</p>
    </div>
  )
}

export function StethoscopeIcon({ className = 'size-6' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M11 2v2" />
      <path d="M5 2v2" />
      <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" />
      <path d="M8 15a6 6 0 0 0 12 0v-3" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  )
}
