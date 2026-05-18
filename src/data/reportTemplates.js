export const reportTemplates = [
  {
    id: 'consulta-medica',
    category: 'Relatorios',
    title: 'Relatorio de Consulta Medica',
    description: 'Consulta clinica completa com historico, exame fisico, sinais vitais e conduta.',
    popular: true,
    tags: ['consulta', 'clinico', 'prontuario'],
    exam: 'Consulta Clinica Geral',
    cidCode: 'J06.9',
    diagnosis: 'Quadro sugestivo de infeccao viral de vias aereas superiores.',
    conclusion: 'Paciente orientado quanto a medicacao, hidratacao e sinais de alerta.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #dbeafe;">
        <div style="background:#2563eb;color:white;padding:22px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Relatorio Medico</h1>
          <p style="margin:8px 0 0;">Atendimento Clinico Ambulatorial</p>
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
            <p><strong>Especialidade:</strong> Clinica Geral</p>
            <p><strong>Medico:</strong> Dr. Ricardo Menezes</p>
            <p><strong>CRM:</strong> 45879-SE</p>
          </div>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Queixa Principal</h3>
          <p>Paciente relata febre baixa, dor no corpo, fadiga e congestao nasal ha aproximadamente 4 dias.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Historia Clinica</h3>
          <p>Paciente sem historico recente de internacoes. Refere contato com familiares gripados nos ultimos dias. Nega alergias medicamentosas e doen&ccedil;as cronicas relevantes.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Sinais Vitais</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#eff6ff;">
              <th style="padding:10px;border:1px solid #dbeafe;">PA</th>
              <th style="padding:10px;border:1px solid #dbeafe;">FC</th>
              <th style="padding:10px;border:1px solid #dbeafe;">Temperatura</th>
              <th style="padding:10px;border:1px solid #dbeafe;">Saturacao</th>
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
          <h3>Exame Fisico</h3>
          <p>Paciente em bom estado geral, consciente e orientada. Orofaringe hiperemiada, ausculta pulmonar sem ruidos adventicios, abdome sem alteracoes relevantes.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Conduta Medica</h3>
          <p>Prescrito antitermico, repouso relativo e aumento da ingestao hidrica. Solicitado retorno em caso de piora do quadro clinico.</p>
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
    category: 'Relatorios',
    title: 'Evolucao Clinica',
    description: 'Evolucao hospitalar detalhada para acompanhamento diario do paciente.',
    tags: ['internacao', 'hospitalar', 'evolucao'],
    exam: 'Evolucao Clinica',
    cidCode: 'I10',
    diagnosis: 'Hipertensao arterial sistemica controlada.',
    conclusion: 'Paciente permanece estavel e sem intercorrencias.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #ccfbf1;">
        <div style="background:#0f766e;color:white;padding:20px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Evolucao Clinica Hospitalar</h1>
          <p style="margin:8px 0 0;">Registro diario multiprofissional</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Paciente</h3>
            <p><strong>Nome:</strong> Carlos Henrique Oliveira</p>
            <p><strong>Leito:</strong> 204-B</p>
            <p><strong>Diagnostico:</strong> Hipertensao arterial sistemica</p>
          </div>

          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Sinais Vitais</h3>
            <p><strong>PA:</strong> 130x80 mmHg</p>
            <p><strong>FC:</strong> 76 bpm</p>
            <p><strong>Temperatura:</strong> 36.7&deg;C</p>
          </div>
        </div>

        <div style="background:white;padding:20px;border-radius:14px;margin-bottom:18px;">
          <h3>Evolucao</h3>
          <p>Paciente apresenta melhora progressiva do quadro clinico, mantendo estabilidade hemodinamica. Alimentando-se bem, sem queixas algicas importantes e aceitando medicacoes prescritas.</p>
        </div>

        <div style="background:white;padding:20px;border-radius:14px;margin-bottom:18px;">
          <h3>Plano Terapeutico</h3>
          <ul>
            <li>Manter monitorizacao pressorica.</li>
            <li>Ajustar medicacao conforme necessidade clinica.</li>
            <li>Reavaliar conduta em 24 horas.</li>
          </ul>
        </div>

        <div style="margin-top:30px;text-align:right;">
          <p><strong>Equipe Assistencial</strong></p>
          <p>Registro em prontuario</p>
        </div>
      </div>
    `,
  },
  {
    id: 'hemograma',
    category: 'Laudos',
    title: 'Laudo de Hemograma',
    description: 'Interpretacao clinica de hemograma com correlacao diagnostica.',
    tags: ['laboratorial', 'sangue', 'hemograma'],
    exam: 'Hemograma completo',
    cidCode: 'Z01.7',
    diagnosis: 'Exame laboratorial avaliado em conjunto com quadro clinico e exames complementares.',
    conclusion: 'Resultado analisado e correlacionado com a hipotese diagnostica descrita.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #fee2e2;">
        <div style="background:#b91c1c;color:white;padding:20px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Laudo de Hemograma</h1>
          <p style="margin:8px 0 0;">Analise laboratorial e correlacao clinica</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Identificacao da Amostra</h3>
            <p><strong>Material:</strong> Sangue periferico</p>
            <p><strong>Coleta:</strong> 17/05/2026 - 08:20</p>
            <p><strong>Metodo:</strong> Analise automatizada com revisao microscopica quando indicada</p>
          </div>

          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Contexto Clinico</h3>
            <p><strong>Indicacao:</strong> Investigacao de quadro infeccioso e avaliacao hematologica geral.</p>
            <p><strong>Solicitante:</strong> Dr. Ricardo Menezes</p>
          </div>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Serie Vermelha</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#fef2f2;">
              <th style="padding:10px;border:1px solid #fee2e2;">Parametro</th>
              <th style="padding:10px;border:1px solid #fee2e2;">Resultado</th>
              <th style="padding:10px;border:1px solid #fee2e2;">Referencia</th>
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
          <h3>Serie Branca e Plaquetas</h3>
          <p>Leucocitos dentro da faixa de referencia, sem desvio significativo a esquerda. Plaquetas preservadas, sem sinais laboratoriais de plaquetopenia.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;">
          <h3>Conclusao</h3>
          <p>Hemograma sem alteracoes hematologicas relevantes no momento. Correlacionar com dados clinicos e repetir conforme evolucao.</p>
        </div>
      </div>
    `,
  },
  {
    id: 'imagem',
    category: 'Laudos',
    title: 'Laudo de Imagem',
    description: 'Modelo para exames de imagem com descricao tecnica e impressao diagnostica.',
    popular: true,
    tags: ['imagem', 'radiologia', 'exame'],
    exam: 'Exame de imagem',
    cidCode: 'Z01.6',
    diagnosis: 'Achados de imagem descritos conforme exame realizado e indicacao clinica.',
    conclusion: 'Impressao diagnostica registrada conforme achados do exame.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #e0e7ff;">
        <div style="background:#4338ca;color:white;padding:20px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Laudo de Imagem</h1>
          <p style="margin:8px 0 0;">Descricao tecnica e impressao diagnostica</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Dados do Exame</h3>
            <p><strong>Modalidade:</strong> Ultrassonografia / Radiografia / Tomografia</p>
            <p><strong>Regiao avaliada:</strong> A definir</p>
            <p><strong>Data:</strong> 17/05/2026</p>
          </div>

          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Indicacao Clinica</h3>
            <p>Exame solicitado para investigacao diagnostica conforme sintomas e evolucao clinica informados.</p>
          </div>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Tecnica</h3>
          <p>Exame realizado conforme protocolo institucional, com aquisicao de imagens em multiplos planos e documentacao dos principais achados.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Achados</h3>
          <p>Estruturas avaliadas com dimensoes e morfologia preservadas. Nao ha evidencias de colecoes, massas expansivas ou alteracoes agudas relevantes no estudo atual.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;">
          <h3>Impressao Diagnostica</h3>
          <p>Exame sem alteracoes significativas. Correlacionar com quadro clinico e exames laboratoriais quando necessario.</p>
        </div>
      </div>
    `,
  },
  {
    id: 'pre-operatorio',
    category: 'Relatorios',
    title: 'Avaliacao Pre-operatoria',
    description: 'Avaliacao clinica para estratificacao de risco e liberacao cirurgica.',
    tags: ['pre-op', 'cirurgia', 'risco'],
    exam: 'Avaliacao pre-operatoria',
    cidCode: 'Z01.8',
    diagnosis: 'Paciente em avaliacao pre-operatoria, com risco definido conforme dados clinicos disponiveis.',
    conclusion: 'Conduta pre-operatoria orientada conforme avaliacao clinica e exames apresentados.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #fed7aa;">
        <div style="background:#c2410c;color:white;padding:20px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Avaliacao Pre-operatoria</h1>
          <p style="margin:8px 0 0;">Estratificacao de risco e orientacoes cirurgicas</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Paciente</h3>
            <p><strong>Nome:</strong> Ana Paula Rodrigues</p>
            <p><strong>Idade:</strong> 52 anos</p>
            <p><strong>Procedimento:</strong> Colecistectomia videolaparoscopica</p>
          </div>

          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Antecedentes</h3>
            <p><strong>Comorbidades:</strong> Hipertensao controlada</p>
            <p><strong>Alergias:</strong> Nega alergias medicamentosas conhecidas</p>
            <p><strong>Medicamentos:</strong> Losartana 50 mg/dia</p>
          </div>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Avaliacao Clinica</h3>
          <p>Paciente em bom estado geral, sem sinais de descompensacao cardiopulmonar. Exames laboratoriais e eletrocardiograma avaliados no contexto do procedimento proposto.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Estratificacao de Risco</h3>
          <p>Risco cirurgico estimado como baixo a moderado, condicionado a manutencao das medidas clinicas e anestesicas indicadas.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;">
          <h3>Orientacoes</h3>
          <ul>
            <li>Manter jejum conforme orientacao anestesica.</li>
            <li>Levar exames recentes no dia do procedimento.</li>
            <li>Comunicar febre, sintomas respiratorios ou piora clinica antes da cirurgia.</li>
          </ul>
        </div>
      </div>
    `,
  },
  {
    id: 'encaminhamento',
    category: 'Encaminhamentos',
    title: 'Encaminhamento Especializado',
    description: 'Encaminhamento com justificativa clinica e resumo do caso.',
    tags: ['encaminhamento', 'especialista', 'conduta'],
    exam: 'Encaminhamento medico',
    cidCode: 'Z75.8',
    diagnosis: 'Paciente encaminhado(a) para avaliacao especializada por necessidade clinica descrita.',
    conclusion: 'Solicitada avaliacao especializada e continuidade do cuidado compartilhado.',
    contentHtml: `
      <div style="background:#f8fafc;padding:35px;border-radius:20px;font-family:Arial;color:#1e293b;border:1px solid #d9f99d;">
        <div style="background:#4d7c0f;color:white;padding:20px;border-radius:14px;margin-bottom:25px;">
          <h1 style="margin:0;font-size:28px;">Encaminhamento Especializado</h1>
          <p style="margin:8px 0 0;">Resumo clinico e continuidade do cuidado</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Paciente</h3>
            <p><strong>Nome:</strong> Joao Pereira Lima</p>
            <p><strong>Idade:</strong> 46 anos</p>
            <p><strong>Contato:</strong> (79) 99999-0000</p>
          </div>

          <div style="background:white;padding:20px;border-radius:14px;">
            <h3>Destino</h3>
            <p><strong>Especialidade:</strong> Cardiologia</p>
            <p><strong>Prioridade:</strong> Eletiva com acompanhamento programado</p>
            <p><strong>Origem:</strong> Atencao primaria / ambulatorio</p>
          </div>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Resumo Clinico</h3>
          <p>Paciente acompanhado por hipertensao arterial, com queixa de palpitacoes ocasionais e necessidade de avaliacao especializada para ajuste terapeutico e investigacao complementar.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;margin-bottom:18px;">
          <h3>Motivo do Encaminhamento</h3>
          <p>Solicita-se avaliacao cardiologica para estratificacao de risco cardiovascular, revisao medicamentosa e definicao de exames complementares.</p>
        </div>

        <div style="background:white;padding:22px;border-radius:14px;">
          <h3>Exames Anexos</h3>
          <ul>
            <li>Pressao arterial seriada.</li>
            <li>Eletrocardiograma recente.</li>
            <li>Exames laboratoriais basicos.</li>
          </ul>
        </div>
      </div>
    `,
  },
]
