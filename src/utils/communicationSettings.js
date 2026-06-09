const STORAGE_KEY = 'mediconnect.communication.settings.v1';

const DEFAULT_SETTINGS = {
  sms_confirmation_enabled: true,
  sms_reminder_enabled: true,
  background_automation_enabled: true,
  reminder_hours_ahead: 24,
  reminder_sms_template: "Olá {paciente}, lembramos que você tem uma consulta agendada para amanhã, {data} às {hora} com {medico}. Responda SIM para confirmar.",
};

export function getCommunicationSettings() {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (error) {
    console.error('Erro ao ler configurações de comunicação:', error);
    return DEFAULT_SETTINGS;
  }
}

export function saveCommunicationSettings(settings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('communication_settings_changed', { detail: settings }));
  } catch (error) {
    console.error('Erro ao salvar configurações de comunicação:', error);
  }
}
