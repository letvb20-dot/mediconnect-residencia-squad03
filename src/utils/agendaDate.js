export function parseLocalDate(dateString) {
  if (!dateString || typeof dateString !== 'string') return null

  const parts = dateString.split('T')[0].split('-')
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number)
    return new Date(year, month - 1, day)
  }

  const parsed = new Date(dateString)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatLocalDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTimeSortValue(timeString) {
  const normalized = String(timeString || '').trim()
  const match = normalized.match(/^(\d{1,2}):(\d{2})/)

  if (!match) return Number.MAX_SAFE_INTEGER

  return Number(match[1]) * 60 + Number(match[2])
}

export function sortAppointmentsByTime(appointments) {
  return [...appointments].sort((a, b) => {
    const difference = getTimeSortValue(a.time) - getTimeSortValue(b.time)

    if (difference !== 0) {
      return difference
    }

    return String(a.patient || '').localeCompare(String(b.patient || ''), 'pt-BR')
  })
}
