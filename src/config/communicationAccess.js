import { canAccess } from './permissions.js'

export const COMMUNICATION_CHANNEL_KEYS = ['whatsapp', 'email', 'sms']
export const COMMUNICATION_TAB_KEYS = ['historico', 'templates', 'campanha', 'gerenciamento', 'lembretes']

export function getCommunicationAccess(role) {
  if (!canAccess(role, '/comunicacao')) {
    return {
      canAccessModule: false,
      channelKeys: [],
      tabKeys: [],
    }
  }

  return {
    canAccessModule: true,
    channelKeys: [...COMMUNICATION_CHANNEL_KEYS],
    tabKeys: [...COMMUNICATION_TAB_KEYS],
  }
}
