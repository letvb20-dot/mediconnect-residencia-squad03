export function isCommunicationEligiblePatient(patient) {
  return !isPatientCommunicationOptedOut(patient)
}

export function isPatientCommunicationOptedOut(patient) {
  const explicitOptOut = getFirstDefined(patient, [
    'lgpdOptOut',
    'lgpd_opt_out',
    'communicationOptOut',
    'communication_opt_out',
    'messagesOptOut',
    'messages_opt_out',
    'optOut',
    'opt_out',
    'doNotContact',
    'do_not_contact',
    'unsubscribed',
    'naoReceberMensagens',
    'nao_receber_mensagens',
  ])

  if (explicitOptOut !== undefined) {
    return toBoolean(explicitOptOut)
  }

  const explicitOptIn = getFirstDefined(patient, [
    'lgpdOptIn',
    'lgpd_opt_in',
    'acceptsMessages',
    'accepts_messages',
    'optInMessages',
    'opt_in_messages',
    'receberMensagens',
    'receber_mensagens',
  ])

  if (explicitOptIn !== undefined) {
    return !toBoolean(explicitOptIn)
  }

  return false
}

function getFirstDefined(source, keys) {
  if (!source) return undefined

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key]
  }

  return undefined
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0

  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  if (['false', '0', 'nao', 'no', 'off', 'opt-out', 'opt_out'].includes(normalized)) return false
  if (['true', '1', 'sim', 'yes', 'on', 'opt-in', 'opt_in'].includes(normalized)) return true

  return Boolean(value)
}
