"""
data_loader.py
──────────────
Extrai o dataset bruto de agendamentos do PostgreSQL (Supabase / Postgres direta).
Retorna um DataFrame unificado pronto para feature engineering.

Tabelas consumidas (em ordem de tentativa para compatibilidade multi-schema):
  appointments  |  patients  |  profiles  |  doctors / professionals
"""
from __future__ import annotations

import os
import logging
from typing import Optional

import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# ─── Configuração ────────────────────────────────────────────────────────────
DATABASE_URL: str = os.getenv("DATABASE_URL", "")

# SQL principal — adapte nomes de colunas se o schema do seu Supabase diferir
APPOINTMENT_QUERY = """
SELECT
    a.id                                AS appointment_id,
    a.patient_id,
    a.doctor_id,
    a.scheduled_date,
    a.scheduled_time,
    a.status,                           -- pendente | confirmado | realizado | cancelado
    a.modality,                         -- presencial | teleconsulta | procedimento
    a.specialty,
    a.is_first_appointment,
    a.created_at                        AS booking_created_at,

    -- Dados do paciente
    p.birth_date,
    p.gender,
    p.zip_code                          AS patient_zip_code,
    p.city                              AS patient_city,
    p.state                             AS patient_state,

    -- Histórico comportamental (calculado via subqueries)
    COALESCE(hist.total_appointments, 0)    AS hist_total_appointments,
    COALESCE(hist.no_shows, 0)              AS hist_no_shows,
    COALESCE(hist.confirmed, 0)             AS hist_confirmed,
    COALESCE(hist.cancellations, 0)         AS hist_cancellations,
    COALESCE(hist.late_arrivals, 0)         AS hist_late_arrivals

FROM appointments a
LEFT JOIN patients p ON p.id = a.patient_id
LEFT JOIN LATERAL (
    SELECT
        COUNT(*)                                    AS total_appointments,
        SUM(CASE WHEN a2.status = 'cancelado'
                  AND a2.no_show = TRUE THEN 1 ELSE 0 END) AS no_shows,
        SUM(CASE WHEN a2.status = 'confirmado' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN a2.status = 'cancelado'
                  AND COALESCE(a2.no_show, FALSE) = FALSE THEN 1 ELSE 0 END) AS cancellations,
        SUM(CASE WHEN a2.arrived_late = TRUE THEN 1 ELSE 0 END) AS late_arrivals
    FROM appointments a2
    WHERE a2.patient_id = a.patient_id
      AND a2.scheduled_date < a.scheduled_date   -- apenas histórico anterior
) hist ON TRUE
WHERE a.scheduled_date >= NOW() - INTERVAL '2 years'
ORDER BY a.scheduled_date DESC;
"""

# Fallback simplificado caso o schema não tenha todas as colunas avançadas
SIMPLE_QUERY = """
SELECT
    a.id            AS appointment_id,
    a.patient_id,
    a.doctor_id,
    a.scheduled_date,
    a.scheduled_time,
    a.status,
    a.modality,
    a.specialty,
    a.created_at    AS booking_created_at,
    p.birth_date,
    p.gender,
    p.zip_code      AS patient_zip_code
FROM appointments a
LEFT JOIN patients p ON p.id = a.patient_id
WHERE a.scheduled_date >= NOW() - INTERVAL '2 years'
ORDER BY a.scheduled_date DESC;
"""


def load_dataset(min_rows: int = 200) -> Optional[pd.DataFrame]:
    """
    Conecta ao PostgreSQL e retorna o DataFrame de agendamentos.
    Retorna None se não for possível conectar ou se a tabela não existir.
    """
    if not DATABASE_URL:
        logger.error("DATABASE_URL não definida no ambiente.")
        return None

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    for query_label, query in [("full", APPOINTMENT_QUERY), ("simple", SIMPLE_QUERY)]:
        try:
            with engine.connect() as conn:
                df = pd.read_sql(text(query), conn)
            logger.info(f"Dataset carregado ({query_label}): {len(df)} linhas")
            if len(df) < min_rows:
                logger.warning(
                    f"Dataset muito pequeno ({len(df)} < {min_rows}). "
                    "Usando dados sintéticos como complemento."
                )
            return df
        except Exception as exc:
            logger.warning(f"Query '{query_label}' falhou: {exc}. Tentando fallback...")

    logger.error("Todas as queries falharam. Impossível carregar dados reais.")
    return None


def derive_noshow_label(df: pd.DataFrame) -> pd.DataFrame:
    """
    Cria a coluna alvo binária `no_show` (1 = faltou, 0 = compareceu).
    Estratégia: status 'cancelado' sem cancelamento prévio = no-show.
    Adapte conforme a semântica do seu schema.
    """
    df = df.copy()
    if "no_show" not in df.columns:
        # Inferência: status realizado = 0; cancelado = 1 (proxy de no-show)
        df["no_show"] = df["status"].apply(
            lambda s: 1 if str(s).lower() in ("cancelado", "no_show", "faltou") else 0
        )
    else:
        df["no_show"] = df["no_show"].astype(int)
    return df
