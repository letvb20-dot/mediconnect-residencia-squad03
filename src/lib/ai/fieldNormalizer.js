// Normaliza valores transcritos em texto para o formato esperado por cada tipo de campo.
// A maioria dos tipos é resolvida localmente; apenas date e enum chamam o Gemini.

import { aiClient } from './aiClient.js'

/**
 * Normaliza um transcrito de voz para o formato esperado pelo campo.
 *
 * @param {object} params
 * @param {string} params.transcript - texto bruto vindo do reconhecimento de voz
 * @param {object} params.field - { name, label, type, options?, hint? }
 * @returns {Promise<string>} valor pronto para entrar no formData
 */
export async function normalizeFieldValue({ transcript, field }) {
  const raw = String(transcript || '').trim()
  if (!raw) return ''

  switch (field.type) {
    case 'document':
      return normalizeDocument(raw, field.digits || 11)
    case 'cep':
      return normalizeCep(raw)
    case 'phone':
      return normalizePhone(raw)
    case 'number':
      return normalizeNumber(raw)
    case 'date':
      return aiClient.normalizeViaGemini({ transcript: raw, field }).catch(() => raw)
    case 'enum':
      return aiClient.normalizeViaGemini({ transcript: raw, field }).catch(() => raw)
    case 'email':
      return normalizeEmail(raw)
    case 'text':
    default:
      return normalizeText(raw)
  }
}

function extractDigits(text) {
  return String(text || '')
    // Converte palavras simples para dígitos antes de filtrar.
    .toLowerCase()
    .replace(/\bzero\b/g, '0')
    .replace(/\b(um|uma)\b/g, '1')
    .replace(/\bdois\b/g, '2')
    .replace(/\btres\b/g, '3')
    .replace(/\btrês\b/g, '3')
    .replace(/\bquatro\b/g, '4')
    .replace(/\bcinco\b/g, '5')
    .replace(/\bseis\b/g, '6')
    .replace(/\bmeia\b/g, '6')
    .replace(/\bsete\b/g, '7')
    .replace(/\boito\b/g, '8')
    .replace(/\bnove\b/g, '9')
    .replace(/\D+/g, '')
}

function normalizeDocument(text, expectedDigits) {
  const digits = extractDigits(text).slice(0, expectedDigits)
  if (expectedDigits === 11 && digits.length === 11) {
    // CPF
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
  }
  return digits
}

function normalizeCep(text) {
  const digits = extractDigits(text).slice(0, 8)
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`
  }
  return digits
}

function normalizePhone(text) {
  const digits = extractDigits(text).slice(0, 11)
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return digits
}

function normalizeNumber(text) {
  // Pega o primeiro grupo de dígitos, possivelmente com vírgula decimal.
  const cleaned = String(text || '').replace(',', '.').match(/\d+(\.\d+)?/)
  return cleaned ? cleaned[0].replace('.', ',') : ''
}

function normalizeEmail(text) {
  // O ditado costuma vir como "joão arroba teste ponto com br".
  return String(text || '')
    .toLowerCase()
    .replace(/\s+arroba\s+/g, '@')
    .replace(/\s+@\s+/g, '@')
    .replace(/\s+ponto\s+/g, '.')
    .replace(/\s+/g, '')
    .trim()
}

function normalizeText(text) {
  // Remove pontuação no final que vem do reconhecedor automático.
  return String(text || '').replace(/[.,;:!?]+$/g, '').trim()
}
