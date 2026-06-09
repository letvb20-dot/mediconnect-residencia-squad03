"""
feature_engineering.py
───────────────────────
Constrói o vetor de 100+ features por agendamento.

Grupos de features:
  A) Comportamentais  (histórico do paciente)
  B) Demográficas     (idade, gênero, etc.)
  C) Clínicas         (tipo de consulta, especialidade, modalidade)
  D) Temporais        (horário, dia da semana, antecedência)
  E) Geográficas      (distância ao CEP da clínica)
  F) Externas         (clima, feriados, sazonalidade)
  G) Interações       (produtos e razões entre variáveis)

Retorna:
  - X: DataFrame de features (pré-transformado para o Preprocessor)
  - y: Série do alvo (0/1) [only when building training set]
  - feature_names: list[str] na ordem certa
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd

from .external_data import (
    get_weather_for_date,
    get_patient_distance_km,
    is_holiday,
    days_to_nearest_holiday,
)

logger = logging.getLogger(__name__)

# ─── Constantes de domínio ────────────────────────────────────────────────────
MODALITY_MAP = {"presencial": 0, "teleconsulta": 1, "procedimento": 2, "exame": 3}
SPECIALTY_LIST = [
    "clinica_geral", "cardiologia", "dermatologia", "ortopedia", "ginecologia",
    "pediatria", "neurologia", "psiquiatria", "oftalmologia", "urologia",
    "endocrinologia", "gastroenterologia", "pneumologia", "reumatologia", "other",
]
HOUR_BUCKETS = {  # Faixas de horário com risco elevado de no-show
    "madrugada": (0, 7),    # incomum
    "manha_cedo": (7, 9),   # rush matinal
    "manha": (9, 12),       # melhor comparecimento
    "almoco": (12, 14),     # risco médio
    "tarde": (14, 17),      # bom
    "fim_tarde": (17, 19),  # risco médio
    "noite": (19, 24),      # risco alto
}


def _age_from_birthdate(birth_date: Optional[str | date], reference_date: date) -> float:
    """Calcula idade em anos; retorna 35.0 se inválida."""
    try:
        if isinstance(birth_date, str):
            birth_date = datetime.fromisoformat(birth_date).date()
        delta = reference_date - birth_date
        return delta.days / 365.25
    except Exception:
        return 35.0  # Mediana típica da população clínica


def _advance_days(booking_created_at: Optional[str | datetime], scheduled_date: date) -> float:
    """Dias de antecedência entre marcação e consulta."""
    try:
        if isinstance(booking_created_at, str):
            booking_created_at = datetime.fromisoformat(booking_created_at)
        created_date = booking_created_at.date()
        return max(0.0, (scheduled_date - created_date).days)
    except Exception:
        return 7.0  # Mediana padrão


def build_features_from_row(row: dict, fetch_external: bool = True) -> dict:
    """
    Constrói o dicionário de features para UM agendamento.
    row deve conter as chaves do data_loader (ou do payload da API).
    """
    features: dict = {}

    # ── Resolve data e hora ──────────────────────────────────────────────────
    scheduled_date_raw = row.get("scheduled_date") or row.get("data_consulta")
    scheduled_time_raw = row.get("scheduled_time") or row.get("hora_consulta", "09:00")

    if isinstance(scheduled_date_raw, str):
        appt_date = datetime.fromisoformat(scheduled_date_raw).date()
    elif isinstance(scheduled_date_raw, (date, datetime)):
        appt_date = scheduled_date_raw if isinstance(scheduled_date_raw, date) else scheduled_date_raw.date()
    else:
        appt_date = date.today()

    try:
        hour = int(str(scheduled_time_raw).split(":")[0])
    except Exception:
        hour = 9

    # ── A) Features Comportamentais ──────────────────────────────────────────
    total = int(row.get("hist_total_appointments", 0))
    no_shows = int(row.get("hist_no_shows", 0))
    confirmados = int(row.get("hist_confirmed", 0))
    cancelamentos = int(row.get("hist_cancellations", 0))
    atrasos = int(row.get("hist_late_arrivals", 0))

    features["hist_total_appointments"] = total
    features["hist_no_shows"] = no_shows
    features["hist_confirmed"] = confirmados
    features["hist_cancellations"] = cancelamentos
    features["hist_late_arrivals"] = atrasos
    features["hist_noshow_rate"] = no_shows / max(total, 1)
    features["hist_confirm_rate"] = confirmados / max(total, 1)
    features["hist_cancel_rate"] = cancelamentos / max(total, 1)
    features["hist_late_rate"] = atrasos / max(total, 1)
    features["is_first_appointment"] = int(
        bool(row.get("is_first_appointment", total == 0))
    )
    # Tendência recente de comparecimento (últimas 5 vs históricas)
    features["has_prior_noshow"] = int(no_shows > 0)
    features["repeated_noshow"] = int(no_shows >= 2)

    # ── B) Features Demográficas ─────────────────────────────────────────────
    age = _age_from_birthdate(row.get("birth_date"), appt_date)
    features["age_years"] = age
    features["age_group_child"] = int(age < 18)
    features["age_group_young_adult"] = int(18 <= age < 35)
    features["age_group_adult"] = int(35 <= age < 60)
    features["age_group_senior"] = int(age >= 60)

    gender_raw = str(row.get("gender", "")).lower()
    features["gender_male"] = int(gender_raw in ("m", "male", "masculino"))
    features["gender_female"] = int(gender_raw in ("f", "female", "feminino"))
    features["gender_unknown"] = int(gender_raw not in ("m", "male", "masculino", "f", "female", "feminino"))

    # ── C) Features Clínicas ─────────────────────────────────────────────────
    modality = str(row.get("modality", "presencial")).lower()
    features["modality_code"] = MODALITY_MAP.get(modality, 0)
    features["is_teleconsulta"] = int(modality == "teleconsulta")
    features["is_procedure"] = int(modality == "procedimento")

    specialty = str(row.get("specialty", "clinica_geral")).lower().replace(" ", "_")
    for spec in SPECIALTY_LIST:
        features[f"specialty_{spec}"] = int(specialty == spec)

    # ── D) Features Temporais ────────────────────────────────────────────────
    features["appt_hour"] = hour
    features["appt_hour_sin"] = float(np.sin(2 * np.pi * hour / 24))
    features["appt_hour_cos"] = float(np.cos(2 * np.pi * hour / 24))

    for bucket_name, (h_min, h_max) in HOUR_BUCKETS.items():
        features[f"hour_bucket_{bucket_name}"] = int(h_min <= hour < h_max)

    weekday = appt_date.weekday()  # 0=Segunda, 6=Domingo
    features["weekday"] = weekday
    features["weekday_sin"] = float(np.sin(2 * np.pi * weekday / 7))
    features["weekday_cos"] = float(np.cos(2 * np.pi * weekday / 7))
    features["is_monday"] = int(weekday == 0)
    features["is_friday"] = int(weekday == 4)
    features["is_weekend"] = int(weekday >= 5)

    month = appt_date.month
    features["month"] = month
    features["month_sin"] = float(np.sin(2 * np.pi * month / 12))
    features["month_cos"] = float(np.cos(2 * np.pi * month / 12))
    features["is_summer"] = int(month in (12, 1, 2))    # Verão BR
    features["is_winter"] = int(month in (6, 7, 8))     # Inverno BR
    features["is_carnival_period"] = int(month == 2)     # Carnaval proxy
    features["is_year_end"] = int(month == 12)

    features["day_of_month"] = appt_date.day
    features["week_of_year"] = appt_date.isocalendar()[1]

    advance = _advance_days(row.get("booking_created_at"), appt_date)
    features["advance_days"] = advance
    features["advance_days_log"] = float(np.log1p(advance))
    features["advance_short"] = int(advance <= 2)     # Marcou muito em cima
    features["advance_medium"] = int(3 <= advance <= 14)
    features["advance_long"] = int(advance > 14)
    features["advance_same_day"] = int(advance == 0)

    # ── E) Features Geográficas ──────────────────────────────────────────────
    patient_zip = row.get("patient_zip_code") or row.get("zip_code")
    if fetch_external and patient_zip:
        distance_km = get_patient_distance_km(patient_zip)
    else:
        distance_km = float(row.get("distance_km", 10.0))

    features["distance_km"] = distance_km
    features["distance_km_log"] = float(np.log1p(distance_km))
    features["distance_short"] = int(distance_km <= 5)
    features["distance_medium"] = int(5 < distance_km <= 20)
    features["distance_far"] = int(distance_km > 20)
    features["distance_very_far"] = int(distance_km > 50)

    # ── F) Features Externas (Clima + Feriados) ──────────────────────────────
    if fetch_external:
        weather = get_weather_for_date(appt_date)
    else:
        weather = {
            "precipitation_mm": row.get("precipitation_mm", 0.0),
            "temp_max_c": row.get("temp_max_c", 25.0),
            "temp_min_c": row.get("temp_min_c", 18.0),
            "heavy_rain": bool(row.get("heavy_rain", False)),
            "extreme_heat": bool(row.get("extreme_heat", False)),
        }

    features["precipitation_mm"] = weather["precipitation_mm"]
    features["temp_max_c"] = weather["temp_max_c"]
    features["temp_min_c"] = weather["temp_min_c"]
    features["temp_range_c"] = weather["temp_max_c"] - weather["temp_min_c"]
    features["heavy_rain"] = int(weather["heavy_rain"])
    features["extreme_heat"] = int(weather["extreme_heat"])
    features["has_rain"] = int(weather["precipitation_mm"] > 5.0)
    features["light_rain"] = int(5.0 < weather["precipitation_mm"] <= 20.0)

    state = str(row.get("patient_state", "SP")).upper()[:2]
    features["is_holiday"] = int(is_holiday(appt_date, state=state))
    features["days_to_holiday"] = days_to_nearest_holiday(appt_date, state=state)
    features["near_holiday"] = int(features["days_to_holiday"] <= 3)

    # ── G) Features de Interação ─────────────────────────────────────────────
    features["noshow_x_rain"] = features["hist_noshow_rate"] * features["heavy_rain"]
    features["noshow_x_distance"] = features["hist_noshow_rate"] * features["distance_km_log"]
    features["noshow_x_advance"] = features["hist_noshow_rate"] * features["advance_days_log"]
    features["first_x_rain"] = features["is_first_appointment"] * features["heavy_rain"]
    features["first_x_distance"] = features["is_first_appointment"] * features["distance_km_log"]
    features["age_x_distance"] = features["age_years"] * features["distance_km_log"]
    features["tele_x_rain"] = features["is_teleconsulta"] * features["heavy_rain"]
    features["evening_x_noshow"] = features["hour_bucket_fim_tarde"] * features["hist_noshow_rate"]
    features["monday_x_noshow"] = features["is_monday"] * features["hist_noshow_rate"]
    features["holiday_x_noshow"] = features["is_holiday"] * features["hist_noshow_rate"]

    return features


def build_training_dataframe(df_raw: pd.DataFrame, fetch_external: bool = False) -> tuple[pd.DataFrame, pd.Series]:
    """
    Aplica build_features_from_row em todo o DataFrame de treino.
    `fetch_external=False` por padrão para evitar chamadas massivas em lote;
    use True somente para amostras pequenas ou em predict individual.
    """
    logger.info(f"Construindo features para {len(df_raw)} agendamentos...")
    rows = df_raw.to_dict(orient="records")
    feature_dicts = [build_features_from_row(r, fetch_external=fetch_external) for r in rows]
    X = pd.DataFrame(feature_dicts).fillna(0)

    # Rótulo alvo
    if "no_show" in df_raw.columns:
        y = df_raw["no_show"].astype(int).reset_index(drop=True)
    else:
        from .data_loader import derive_noshow_label
        df_labeled = derive_noshow_label(df_raw)
        y = df_labeled["no_show"].astype(int).reset_index(drop=True)

    logger.info(f"Features construídas: {X.shape[1]} variáveis. No-show rate: {y.mean():.2%}")
    return X, y


FEATURE_NAMES: list[str] = list(build_features_from_row({}, fetch_external=False).keys())
