export const reportTemplates = [
  {
    id: 'consulta-medica',
    category: 'Relatórios',
    title: 'Relatório de Consulta Médica',
    description: 'Consulta clínica completa com histórico, exame físico, sinais vitais e conduta.',
    popular: true,
    tags: ['consulta', 'clínico', 'prontuário'],
    exam: 'Consulta Clínica Geral',
    cidCode: 'J06.9',
    diagnosis: 'Quadro sugestivo de infecção viral de vias aéreas superiores.',
    conclusion: 'Paciente orientado quanto a medicação, hidratação e sinais de alerta.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #dbeafe;">
        <div style="background:#2563eb;color:white;padding:22px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Relatório Médico</h1>
          <p style="margin:8px 0 0;">Atendimento Clínico Ambulatorial</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:25px;">
          <div style="background:white;padding:18px;border-radius:14px;">
            <h3>Paciente</h3>
            <p><strong>Nome:</strong> Mariana Alves dos Santos</p>
            <p><strong>Idade:</strong> 34 anos</p>
            <p><strong>Sexo:</strong> Feminino</p>
            <p><strong>CPF:</strong> 123.456.789-00</p>
          </div>

          <div style="background:white;padding:18px;border-radius:14px;">
            <h3>Dados da Consulta</h3>
            <p><strong>Data:</strong> 17/05/2026</p>
            <p><strong>Especialidade:</strong> Clínica Geral</p>
            <p><strong>Médico:</strong> Dr. Ricardo Menezes</p>
            <p><strong>CRM:</strong> 45879-SE</p>
          </div>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Queixa Principal</h3>
          <p>Paciente relata febre baixa, dor no corpo, fadiga e congestão nasal há aproximadamente 4 dias.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>História Clínica</h3>
          <p>Paciente sem histórico recente de internações. Refere contato com familiares gripados nos últimos dias. Nega alergias medicamentosas e doenças crônicas relevantes.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Sinais Vitais</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#eff6ff;">
              <th style="padding:10px;border:1px solid #dbeafe;">PA</th>
              <th style="padding:10px;border:1px solid #dbeafe;">FC</th>
              <th style="padding:10px;border:1px solid #dbeafe;">Temperatura</th>
              <th style="padding:10px;border:1px solid #dbeafe;">Saturação</th>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #dbeafe;">120x80 mmHg</td>
              <td style="padding:10px;border:1px solid #dbeafe;">82 bpm</td>
              <td style="padding:10px;border:1px solid #dbeafe;">37.8&deg;C</td>
              <td style="padding:10px;border:1px solid #dbeafe;">98%</td>
            </tr>
          </table>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Exame Físico</h3>
          <p>Paciente em bom estado geral, consciente e orientada. Orofaringe hiperemiada, ausculta pulmonar sem ruídos adventícios, abdome sem alterações relevantes.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Conduta Médica</h3>
          <p>Prescrito antitérmico, repouso relativo e aumento da ingestão hídrica. Solicitado retorno em caso de piora do quadro clínico.</p>
        </div>

        <div style="margin-top:30px;text-align:right;">
          <p><strong>Dr. Ricardo Menezes</strong></p>
          <p>CRM 45879-SE</p>
        </div>
      </div>
    `,
  },
  {
    id: 'evolucao-clinica',
    category: 'Relatórios',
    title: 'Evolução Clínica',
    description: 'Evolução hospitalar detalhada para acompanhamento diário do paciente.',
    tags: ['internação', 'hospitalar', 'evolução'],
    exam: 'Evolução Clínica',
    cidCode: 'I10',
    diagnosis: 'Hipertensão arterial sistêmica controlada.',
    conclusion: 'Paciente permanece estável e sem intercorrências.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #ccfbf1;">
        <div style="background:#0f766e;color:white;padding:20px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Evolução Clínica Hospitalar</h1>
          <p style="margin:8px 0 0;">Registro diário multiprofissional</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Paciente</h3>
            <p><strong>Nome:</strong> Carlos Henrique Oliveira</p>
            <p><strong>Leito:</strong> 204-B</p>
            <p><strong>Diagnóstico:</strong> Hipertensão arterial sistêmica</p>
          </div>

          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Sinais Vitais</h3>
            <p><strong>PA:</strong> 130x80 mmHg</p>
            <p><strong>FC:</strong> 76 bpm</p>
            <p><strong>Temperatura:</strong> 36.7&deg;C</p>
          </div>
        </div>

        <div style="background:white;padding:20px;border-radius:14px;margin-bottom:18px;">
          <h3>Evolução</h3>
          <p>Paciente apresenta melhora progressiva do quadro clínico, mantendo estabilidade hemodinâmica. Alimentando-se bem, sem queixas álgicas importantes e aceitando medicações prescritas.</p>
        </div>

        <div style="background:white;padding:20px;border-radius:14px;margin-bottom:18px;">
          <h3>Plano Terapêutico</h3>
          <ul>
            <li>Manter monitorização pressórica.</li>
            <li>Ajustar medicação conforme necessidade clínica.</li>
            <li>Reavaliar conduta em 24 horas.</li>
          </ul>
        </div>

        <div style="margin-top:30px;text-align:right;">
          <p><strong>Equipe Assistencial</strong></p>
          <p>Registro em prontuário</p>
        </div>
      </div>
    `,
  },
  {
    id: 'hemograma',
    category: 'Laudos',
    title: 'Laudo de Hemograma',
    description: 'Interpretação clínica de hemograma com correlação diagnóstica.',
    tags: ['laboratorial', 'sangue', 'hemograma'],
    exam: 'Hemograma completo',
    cidCode: 'Z01.7',
    diagnosis: 'Exame laboratorial avaliado em conjunto com quadro clínico e exames complementares.',
    conclusion: 'Resultado analisado e correlacionado com a hipótese diagnóstica descrita.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #fee2e2;">
        <div style="background:#b91c1c;color:white;padding:20px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Laudo de Hemograma</h1>
          <p style="margin:8px 0 0;">Análise laboratorial e correlação clínica</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Identificação da Amostra</h3>
            <p><strong>Material:</strong> Sangue periférico</p>
            <p><strong>Coleta:</strong> 17/05/2026 - 08:20</p>
            <p><strong>Método:</strong> Análise automatizada com revisão microscópica quando indicada</p>
          </div>

          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Contexto Clínico</h3>
            <p><strong>Indicação:</strong> Investigação de quadro infeccioso e avaliação hematológica geral.</p>
            <p><strong>Solicitante:</strong> Dr. Ricardo Menezes</p>
          </div>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Série Vermelha</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#fef2f2;">
              <th style="padding:10px;border:1px solid #fee2e2;">Parâmetro</th>
              <th style="padding:10px;border:1px solid #fee2e2;">Resultado</th>
              <th style="padding:10px;border:1px solid #fee2e2;">Referência</th>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #fee2e2;">Hemoglobina</td>
              <td style="padding:10px;border:1px solid #fee2e2;">13.8 g/dL</td>
              <td style="padding:10px;border:1px solid #fee2e2;">12.0 - 16.0 g/dL</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #fee2e2;">Hematocrito</td>
              <td style="padding:10px;border:1px solid #fee2e2;">41%</td>
              <td style="padding:10px;border:1px solid #fee2e2;">36 - 46%</td>
            </tr>
          </table>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Série Branca e Plaquetas</h3>
          <p>Leucócitos dentro da faixa de referência, sem desvio significativo à esquerda. Plaquetas preservadas, sem sinais laboratoriais de plaquetopenia.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;">
          <h3>Conclusão</h3>
          <p>Hemograma sem alterações hematológicas relevantes no momento. Correlacionar com dados clínicos e repetir conforme evolução.</p>
        </div>
      </div>
    `,
  },
  {
    id: 'imagem',
    category: 'Laudos',
    title: 'Laudo de Imagem',
    description: 'Modelo para exames de imagem com descrição técnica e impressão diagnóstica.',
    popular: true,
    tags: ['imagem', 'radiologia', 'exame'],
    exam: 'Exame de imagem',
    cidCode: 'Z01.6',
    diagnosis: 'Achados de imagem descritos conforme exame realizado e indicação clínica.',
    conclusion: 'Impressão diagnóstica registrada conforme achados do exame.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #e0e7ff;">
        <div style="background:#4338ca;color:white;padding:20px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Laudo de Imagem</h1>
          <p style="margin:8px 0 0;">Descrição técnica e impressão diagnóstica</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Dados do Exame</h3>
            <p><strong>Modalidade:</strong> Ultrassonografia / Radiografia / Tomografia</p>
            <p><strong>Região avaliada:</strong> A definir</p>
            <p><strong>Data:</strong> 17/05/2026</p>
          </div>

          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Indicação Clínica</h3>
            <p>Exame solicitado para investigação diagnóstica conforme sintomas e evolução clínica informados.</p>
          </div>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Técnica</h3>
          <p>Exame realizado conforme protocolo institucional, com aquisição de imagens em múltiplos planos e documentação dos principais achados.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Achados</h3>
          <p>Estruturas avaliadas com dimensões e morfologia preservadas. Não há evidências de coleções, massas expansivas ou alterações agudas relevantes no estudo atual.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;">
          <h3>Impressão Diagnóstica</h3>
          <p>Exame sem alterações significativas. Correlacionar com quadro clínico e exames laboratoriais quando necessário.</p>
        </div>
      </div>
    `,
  },
  {
    id: 'pre-operatorio',
    category: 'Relatórios',
    title: 'Avaliação Pré-operatória',
    description: 'Avaliação clínica para estratificação de risco e liberação cirúrgica.',
    tags: ['pre-op', 'cirurgia', 'risco'],
    exam: 'Avaliação pré-operatória',
    cidCode: 'Z01.8',
    diagnosis: 'Paciente em avaliação pré-operatória, com risco definido conforme dados clínicos disponíveis.',
    conclusion: 'Conduta pré-operatória orientada conforme avaliação clínica e exames apresentados.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #fed7aa;">
        <div style="background:#c2410c;color:white;padding:20px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Avaliação Pré-operatória</h1>
          <p style="margin:8px 0 0;">Estratificação de risco e orientações cirúrgicas</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Paciente</h3>
            <p><strong>Nome:</strong> Ana Paula Rodrigues</p>
            <p><strong>Idade:</strong> 52 anos</p>
            <p><strong>Procedimento:</strong> Colecistectomia videolaparoscópica</p>
          </div>

          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Antecedentes</h3>
            <p><strong>Comorbidades:</strong> Hipertensão controlada</p>
            <p><strong>Alergias:</strong> Nega alergias medicamentosas conhecidas</p>
            <p><strong>Medicamentos:</strong> Losartana 50 mg/dia</p>
          </div>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Avaliação Clínica</h3>
          <p>Paciente em bom estado geral, sem sinais de descompensação cardiopulmonar. Exames laboratoriais e eletrocardiograma avaliados no contexto do procedimento proposto.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Estratificação de Risco</h3>
          <p>Risco cirúrgico estimado como baixo a moderado, condicionado à manutenção das medidas clínicas e anestésicas indicadas.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;">
          <h3>Orientações</h3>
          <ul>
            <li>Manter jejum conforme orientação anestésica.</li>
            <li>Levar exames recentes no dia do procedimento.</li>
            <li>Comunicar febre, sintomas respiratórios ou piora clínica antes da cirurgia.</li>
          </ul>
        </div>
      </div>
    `,
  },
  {
    id: 'encaminhamento',
    category: 'Encaminhamentos',
    title: 'Encaminhamento Especializado',
    description: 'Encaminhamento com justificativa clínica e resumo do caso.',
    tags: ['encaminhamento', 'especialista', 'conduta'],
    exam: 'Encaminhamento médico',
    cidCode: 'Z75.8',
    diagnosis: 'Paciente encaminhado(a) para avaliação especializada por necessidade clínica descrita.',
    conclusion: 'Solicitada avaliação especializada e continuidade do cuidado compartilhado.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #d9f99d;">
        <div style="background:#4d7c0f;color:white;padding:20px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Encaminhamento Especializado</h1>
          <p style="margin:8px 0 0;">Resumo clínico e continuidade do cuidado</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Paciente</h3>
            <p><strong>Nome:</strong> João Pereira Lima</p>
            <p><strong>Idade:</strong> 46 anos</p>
            <p><strong>Contato:</strong> (79) 99999-0000</p>
          </div>

          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Destino</h3>
            <p><strong>Especialidade:</strong> Cardiologia</p>
            <p><strong>Prioridade:</strong> Eletiva com acompanhamento programado</p>
            <p><strong>Origem:</strong> Atenção primária / ambulatório</p>
          </div>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Resumo Clínico</h3>
          <p>Paciente acompanhado por hipertensão arterial, com queixa de palpitações ocasionais e necessidade de avaliação especializada para ajuste terapêutico e investigação complementar.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Motivo do Encaminhamento</h3>
          <p>Solicita-se avaliação cardiológica para estratificação de risco cardiovascular, revisão medicamentosa e definição de exames complementares.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;">
          <h3>Exames Anexos</h3>
          <ul>
            <li>Pressão arterial seriada.</li>
            <li>Eletrocardiograma recente.</li>
            <li>Exames laboratoriais básicos.</li>
          </ul>
        </div>
      </div>
    `,
  },
]
