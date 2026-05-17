export function resolveCurrentPatient(profile, patients = []) {
  const explicitIds = [
    profile?.patientId,
    profile?.patient_id,
    profile?.patient?.id,
    profile?.id,
    profile?.userId,
    profile?.authUserId,
  ].map(normalizeIdentifier).filter(Boolean)

  const byId = patients.find((patient) =>
    [
      patient?.id,
      patient?.patientId,
      patient?.patient_id,
      patient?.user_id,
      patient?.auth_user_id,
      patient?.profile_id,
    ].map(normalizeIdentifier).some((id) => id && explicitIds.includes(id)),
  )
  if (byId) return byId

  const profileEmail = normalizeIdentifier(profile?.email)
  if (profileEmail) {
    const byEmail = patients.find((patient) =>
      normalizeIdentifier(patient?.email || patient?.mail || patient?.user_email) === profileEmail,
    )
    if (byEmail) return byEmail
  }

  const profileCpf = normalizeDigits(profile?.cpf || profile?.document || profile?.documento)
  if (profileCpf) {
    const byCpf = patients.find((patient) =>
      normalizeDigits(patient?.cpf || patient?.document || patient?.documento) === profileCpf,
    )
    if (byCpf) return byCpf
  }

  return null
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '')
}
