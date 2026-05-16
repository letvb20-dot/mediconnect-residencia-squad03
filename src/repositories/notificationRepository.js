import { profileRepository } from './profileRepository.js'

const STORAGE_KEY = 'mediconnect.notifications.v1'
export const NOTIFICATIONS_CHANGED_EVENT = 'mediconnect:notifications-changed'
export const NOTIFICATION_ACTION_EVENT = 'mediconnect:notification-action'
export const PENDING_NOTIFICATION_ACTION_KEY = 'mediconnect.pendingNotificationAction'

export const notificationRepository = {
  async getForCurrentUser() {
    const profile = await profileRepository.getCurrentUserProfile().catch(() => null)
    return getStoredNotifications()
      .filter((notification) => isNotificationForProfile(notification, profile))
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
