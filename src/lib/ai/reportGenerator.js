// Motor heurístico de geração de rascunho de laudo.
// Recebe { patientName, exam, complaint, template } e devolve campos do editor.

const CLINICAL_BANK = [
  {
    match: ['febre', 'gripe', 'resfriado', 'viral', 'garganta', 'tosse', 'coriza'],
    cidCode: 'J06.9',
    exam: 'Consulta Clínica Geral',
    diagnosis: 'Quadro clínico sugestivo de infecção de vias aéreas superiores, de provável etiologia viral.',
    conclusion: 'Orientado tratamento sintomático, hidratação e repouso. Retorno se piora ou sinais de alerta.',
  },
  {
    match: ['pressao', 'pressão', 'hipertens', 'cardiac', 'coracao', 'coração', 'palpita'],
    cidCode: 'I10',
    exam: 'Avaliação Cardiovascular',
    diagnosis: 'Achados compatíveis com hipertensão arterial sistêmica em acompanhamento.',
    conclusion: 'Mantida conduta anti-hipertensiva e monitorização pressórica. Reavaliar em retorno programado.',
  },
  {
    match: ['hemograma', 'sangue', 'laborator', 'exame de sangue'],
    cidCode: 'Z01.7',
    exam: 'Hemograma completo',
    diagnosis: 'Exame laboratorial avaliado em conjunto com o quadro clínico apresentado.',
    conclusion: 'Resultado sem alterações hematológicas relevantes no momento. Correlacionar com a evolução clínica.',
  },
  {
    match: ['imagem', 'raio-x', 'raio x', 'radiograf', 'ultrassom', 'tomograf', 'ressonan'],
    cidCode: 'Z01.6',
    exam: 'Exame de imagem',
    diagnosis: 'Estruturas avaliadas com morfologia preservada, sem alterações agudas evidentes no estudo atual.',
    conclusion: 'Exame sem alterações significativas. Correlacionar com quadro clínico e exames complementares.',
  },
  {
    match: ['encaminh', 'especialista', 'especializ'],
    cidCode: 'Z75.8',
    exam: 'Encaminhamento médico',
    diagnosis: 'Paciente com necessidade de avaliação especializada conforme quadro descrito.',
    conclusion: 'Solicitada avaliação especializada e continuidade do cuidado compartilhado.',
  },
]

const DEFAULT_ENTRY = {
  cidCode: 'Z00.0',
  exam: 'Consulta médica',
  diagnosis: 'Avaliação clínica realizada conforme queixa apresentada, sem sinais de alarme no momento.',
  conclusion: 'Conduta orientada conforme avaliação clínica. Retorno em caso de piora ou novos sintomas.',
}

export function buildReportDraft({ patientName = '', exam = '', complaint = '', templateTitle = '' } = {}) {
  const haystack = normalize([exam, complaint, templateTitle].join(' '))
  const entry = CLINICAL_BANK.find((item) => item.match.some((word) => haystack.includes(normalize(word)))) || DEFAULT_ENTRY

  const resolvedExam = exam || entry.exam
  const complaintLine = complaint
    ? `Paciente relata: ${complaint.trim()}.`
    : 'Paciente comparece para avaliação clínica.'

  const contentHtml = `
    <div style="font-family:Arial;color:#1e293b;line-height:1.6;">
      <h2 style="margin:0 0 12px;">Rascunho de Laudo — gerado por IA (revisar)</h2>
      <p><strong>Paciente:</strong> ${escapeHtml(patientName || 'Não informado')}</p>
      <p><strong>Exame:</strong> ${escapeHtml(resolvedExam)}</p>
      <h3 style="margin:16px 0 4px;">Queixa / Histórico</h3>
      <p>${escapeHtml(complaintLine)}</p>
      <h3 style="margin:16px 0 4px;">Avaliação</h3>
      <p>${escapeHtml(entry.diagnosis)}</p>
      <h3 style="margin:16px 0 4px;">Conduta / Conclusão</h3>
      <p>${escapeHtml(entry.conclusion)}</p>
      <p style="margin-top:16px;font-size:12px;color:#64748b;">Conteúdo gerado automaticamente como rascunho. Revisão e validação médica obrigatórias antes da liberação.</p>
    </div>
  `.trim()

  return {
    exam: resolvedExam,
    cidCode: entry.cidCode,
    diagnosis: entry.diagnosis,
    conclusion: entry.conclusion,
    contentHtml,
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
