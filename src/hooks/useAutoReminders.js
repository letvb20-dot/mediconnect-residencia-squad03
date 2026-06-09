import { useEffect } from 'react'
import { getCommunicationSettings } from '../utils/communicationSettings.js'
import { appointmentRepository } from '../repositories/appointmentRepository.js'
import { patientRepository } from '../repositories/patientRepository.js'
import { professionalRepository } from '../repositories/professionalRepository.js'
import { communicationRepository } from '../repositories/communicationRepository.js'
import { normalizeRole } from '../config/permissions.js'
import { formatLocalDateInput } from '../utils/agendaDate.js'
import { isCommunicationEligiblePatient } from '../utils/communicationEligibility.js'

const AUTOMATION_THROTTLE_KEY = 'mediconnect.reminder_automation.last_run'

export function useAutoReminders(role) {
  useEffect(() => {
    const normalizedRole = normalizeRole(role)
    // Run only for admin, gestor, or secretaria
    if (!['admin', 'gestor', 'secretaria'].includes(normalizedRole)) {
      return
    }

    let active = true

    async function runAutomation() {
      // 1. Check settings
      const settings = getCommunicationSettings()
      if (!settings.background_automation_enabled || !settings.sms_reminder_enabled) {
        return
      }

      // 2. Throttle check (max once every 6 hours)
      const lastRun = window.localStorage.getItem(AUTOMATION_THROTTLE_KEY)
      const now = Date.now()
      const sixHoursMs = 6 * 60 * 60 * 1000

      if (lastRun && now - Number(lastRun) < sixHoursMs) {
        return
      }

      try {
        // 3. Load active appointments and contexts
        const [appts, patients, professionals] = await Promise.all([
          appointmentRepository.getAll(),
          patientRepository.getDirectoryRows().catch(() => []),
          professionalRepository.getAll().catch(() => []),
        ])

        if (!active) return

        // 4. Calculate targets
        // Usually, 24h ahead means tomorrow
        const targetDate = new Date()
        targetDate.setDate(targetDate.getDate() + 1) // Tomorrow
        const targetDateStr = formatLocalDateInput(targetDate)

        // Filter appointments for tomorrow
        const tomorrowAppts = appts.filter((appt) => appt.date === targetDateStr)

        if (tomorrowAppts.length === 0) {
          // Update throttle timestamp anyway, as we checked successfully
          window.localStorage.setItem(AUTOMATION_THROTTLE_KEY, String(now))
          return
        }

        // 5. Load sent reminders from local storage
        const sentReminders = JSON.parse(window.localStorage.getItem('mediconnect.sent_reminders.v1') || '{}')
        const updatedReminders = { ...sentReminders }
        let successCount = 0
        let failCount = 0

        for (const appt of tomorrowAppts) {
          // Skip if already sent successfully
          if (sentReminders[appt.id] && sentReminders[appt.id].status === 'Sucesso') {
            continue
          }

          const patient = patients.find((p) => String(p.id) === String(appt.patientId))
          const prof = professionals.find((p) => String(p.id) === String(appt.professionalId))

          // Filter for eligible patients
          if (!patient || !patient.phone || !isCommunicationEligiblePatient(patient)) {
            continue
          }

          try {
            // Format content
            const formattedDate = formatLocalDatePtBr(appt.date)
            const content = settings.reminder_sms_template
              .replace('{paciente}', patient.name || patient.full_name || 'Paciente')
              .replace('{data}', formattedDate)
              .replace('{hora}', appt.time)
              .replace('{medico}', prof?.name || appt.professional || 'Médico(a)')

            // Send SMS
            await communicationRepository.sendSms({
              patientId: patient.id,
              patientName: patient.name || patient.full_name || 'Paciente',
              phone: patient.phone,
              content,
            })

            updatedReminders[appt.id] = {
              sentAt: new Date().toISOString(),
              status: 'Sucesso',
            }
            successCount++
          } catch (err) {
            console.error('Erro ao enviar lembrete automático:', err)
            updatedReminders[appt.id] = {
              sentAt: new Date().toISOString(),
              status: 'Falha',
            }
            failCount++
          }
        }

        // Save progress if any sent attempt happened
        if (successCount > 0 || failCount > 0) {
          window.localStorage.setItem('mediconnect.sent_reminders.v1', JSON.stringify(updatedReminders))

          // Dispatch Toast
          window.dispatchEvent(
            new CustomEvent('app:show_toast', {
              detail: {
                title: 'Lembretes SMS Automáticos',
                description: `Disparo concluído: ${successCount} enviados com sucesso, ${failCount} falhas.`,
                type: 'success',
              },
            })
          )
        }

        // Update last run time
        window.localStorage.setItem(AUTOMATION_THROTTLE_KEY, String(now))
      } catch (error) {
        console.error('Erro na execução da automação de lembretes:', error)
      }
    }

    // Run after a short delay to not block initial page rendering
    const timer = setTimeout(runAutomation, 3000)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [role])
}

function formatLocalDatePtBr(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
