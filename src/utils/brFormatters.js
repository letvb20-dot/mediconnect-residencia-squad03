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

// Validação do dígito verificador do CPF (algoritmo oficial da Receita Federal).
// Rejeita CPFs com formato inválido, sequências repetidas (00000000000, 11111111111...)
// e qualquer combinação cujos dígitos verificadores não fechem.
export function isValidCpf(value) {
  const digits = onlyDigits(value)
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false // todos iguais

  const calcDigit = (slice) => {
    const length = slice.length + 1
    let sum = 0
    for (let i = 0; i < slice.length; i += 1) {
      sum += Number(slice[i]) * (length - i)
    }
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }

  const firstNine = digits.slice(0, 9)
  const firstCheck = calcDigit(firstNine)
  if (firstCheck !== Number(digits[9])) return false

  const firstTen = digits.slice(0, 10)
  const secondCheck = calcDigit(firstTen)
  if (secondCheck !== Number(digits[10])) return false

  return true
}
