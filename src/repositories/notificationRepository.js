import { profileRepository } from './profileRepository.js'

const STORAGE_KEY = 'mediconnect.notifications.v1'
const PREFS_KEY = 'mediconnect.notificationPrefs.v1'
export const NOTIFICATIONS_CHANGED_EVENT = 'mediconnect:notifications-changed'
export const NOTIFICATION_ACTION_EVENT = 'mediconnect:notification-action'
export const PENDING_NOTIFICATION_ACTION_KEY = 'mediconnect.pendingNotificationAction'

const DOMAIN_PREF_MAP = {
  agenda: 'notificacoes_agenda',
  communication: 'notificacoes_comunicacao',
  comunicacao: 'notificacoes_comunicacao',
  'medical-records': 'notificacoes_prontuario',
  medical_records: 'notificacoes_prontuario',
  prontuario: 'notificacoes_prontuario',
  reports: 'notificacoes_relatorios',
  relatorios: 'notificacoes_relatorios',
}

const DEFAULT_PREFS = {
  notificacoes_agenda: true,
  notificacoes_comunicacao: true,
  notificacoes_prontuario: true,
  notificacoes_relatorios: true,
}

export const notificationRepository = {
  async getForCurrentUser() {
    const profile = await profileRepository.getCurrentUserProfile().catch(() => null)
    const prefs = getNotificationPrefs()
    return getStoredNotifications()
      .filter((notification) => isNotificationForProfile(notification, profile))
      .filter((notification) => isDomainEnabled(notification.domain, prefs))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  },

  async notifyCurrentUser({ action = null, detail, domain, patientId, relatedUserIds = [], route = '', title }) {
    const profile = await profileRepository.getCurrentUserProfile().catch(() => null)
    if (!isProfileInvolved(profile, relatedUserIds)) return null

    const notification = {
      id: globalThis.crypto?.randomUUID?.() || `notification-${Date.now()}`,
      title: repairMojibake(title),
      detail: repairMojibake(detail),
      domain,
      patientId: patientId || '',
      route,
      action,
      relatedUserIds: normalizeIds(relatedUserIds),
      createdAt: new Date().toISOString(),
      read: false,
    }

    const notifications = [notification, ...getStoredNotifications()].slice(0, 80)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT))

    // Entrega em "tempo real": alimenta o socket para exibir o toast,
    // respeitando as preferências de notificação do usuário.
    if (isDomainEnabled(notification.domain, getNotificationPrefs()) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('simulated_socket_push', {
        detail: { event: 'nova_notificacao', payload: notification },
      }))
    }

    return notification
  },

  async markAllReadForCurrentUser() {
    const profile = await profileRepository.getCurrentUserProfile().catch(() => null)
    const notifications = getStoredNotifications().map((notification) =>
      isNotificationForProfile(notification, profile)
        ? { ...notification, read: true }
        : notification,
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT))
  },
}

export function getNotificationPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    return {
      notificacoes_agenda: stored.notificacoes_agenda !== false,
      notificacoes_comunicacao: stored.notificacoes_comunicacao !== false,
      notificacoes_prontuario: stored.notificacoes_prontuario !== false,
      notificacoes_relatorios: stored.notificacoes_relatorios !== false,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveNotificationPrefs(prefs) {
  const normalized = { ...DEFAULT_PREFS, ...prefs }
  localStorage.setItem(PREFS_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT))
  return normalized
}

function isDomainEnabled(domain, prefs) {
  const key = DOMAIN_PREF_MAP[String(domain || '').toLowerCase()]
  if (!key) return true
  return prefs[key] !== false
}

function getStoredNotifications() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(data) ? data.map(normalizeNotificationText) : []
  } catch {
    return []
  }
}

function normalizeNotificationText(notification) {
  return {
    ...notification,
    detail: repairMojibake(notification.detail),
    title: repairMojibake(notification.title),
  }
}

function isNotificationForProfile(notification, profile) {
  if (!notification.relatedUserIds?.length) return true
  return isProfileInvolved(profile, notification.relatedUserIds)
}

function isProfileInvolved(profile, relatedUserIds) {
  if (!relatedUserIds?.length) return true
  const profileIds = normalizeIds([
    profile?.id,
    profile?.userId,
    profile?.authUserId,
    profile?.doctorId,
    profile?.professionalId,
    profile?.email,
  ])
  return normalizeIds(relatedUserIds).some((id) => profileIds.includes(id))
}

function normalizeIds(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

export function repairMojibake(value) {
  const text = String(value || '')
  if (!/[ÃÂâ]/.test(text)) return text

  try {
    const bytes = Uint8Array.from([...text].map((char) => char.charCodeAt(0) & 0xff))
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    return decoded.replace(/\uFFFD/g, '').trim() || text
  } catch {
    try {
      return decodeURIComponent(escape(text))
    } catch {
      return text
    }
  }
}
