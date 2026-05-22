export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

export function formatCpf(value) {
  const digits = onlyDigits(value)
  if (digits.length !== 11) return String(value || '').trim()

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export function formatBrazilianPhone(value) {
  const digits = onlyDigits(value)
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  return String(value || '').trim()
}

export function isEmailLike(value) {
  return /\S+@\S+\.\S+/.test(String(value || '').trim())
}

export function cleanPersonName(...candidates) {
  for (const candidate of candidates) {
    const name = String(candidate || '').trim()
    if (name && !isEmailLike(name)) return name
  }

  return ''
}

export function isValidPersonName(value) {
  const name = String(value || '').trim()
  return name.length >= 3 && !isEmailLike(name) && /^[\p{L}\s]+$/u.test(name)
}
