const SPECIAL_CHARS_PATTERN = /[^\p{L}\p{N}\s]/gu
const PERSON_NAME_PATTERN = /[^\p{L}\s]/gu

export function sanitizePlainText(value) {
  return String(value || '').replace(SPECIAL_CHARS_PATTERN, '')
}

export function sanitizePersonName(value) {
  return String(value || '').replace(PERSON_NAME_PATTERN, '')
}

export function sanitizeAlphaNumeric(value) {
  return String(value || '').replace(/[^\p{L}\p{N}]/gu, '')
}

export function limitDigits(value, maxLength = 11) {
  return String(value || '').replace(/\D/g, '').slice(0, maxLength)
}

export function maskCpf(value) {
  const digits = limitDigits(value, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
}

export function maskBrazilianPhone(value) {
  const digits = limitDigits(value, 11)

  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }

  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

export function maskCep(value) {
  const digits = limitDigits(value, 8)
  return digits.replace(/(\d{5})(\d)/, '$1-$2')
}

export function maskHeight(value) {
  const digits = limitDigits(value, 3)
  if (digits.length <= 1) return digits
  return `${digits.slice(0, 1)},${digits.slice(1)}`
}

export function maskRg(value) {
  const digits = limitDigits(value, 9)
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1})$/, '$1-$2')
}

export function sanitizeFieldValue(name, value, { allowEmail = false, allowPassword = false } = {}) {
  if (allowEmail || allowPassword || isEmailField(name) || isPasswordField(name)) return value
  if (isUfField(name)) return String(value || '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()

  if (isRgField(name)) return maskRg(value)
  if (isCpfField(name)) return maskCpf(value)
  if (isPhoneField(name)) return maskBrazilianPhone(value)
  if (isCepField(name)) return maskCep(value)
  if (isNumericField(name)) return limitDigits(value, 11)

  return sanitizePlainText(value)
}

function isEmailField(name) {
  return /email/i.test(String(name || ''))
}

function isPasswordField(name) {
  return /password|senha/i.test(String(name || ''))
}

function isCpfField(name) {
  return /cpf/i.test(String(name || ''))
}

function isRgField(name) {
  return /^rg$/i.test(String(name || ''))
}

function isPhoneField(name) {
  return /phone|telefone|celular/i.test(String(name || ''))
}

function isCepField(name) {
  return /cep|zip/i.test(String(name || ''))
}

function isNumericField(name) {
  return /number|numero|idade|age|crm/i.test(String(name || ''))
}

function isUfField(name) {
  return /(^|_)uf$|crm_uf|crmUf|state|estado/i.test(String(name || ''))
}
