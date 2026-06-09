"""
external_data.py
────────────────
Coleta dados externos usados como features:
  1. Clima no dia da consulta (Open-Meteo — gratuito, sem chave de API)
  2. Distância aproximada paciente → clínica via haversine (CEP → coords)
  3. Feriados nacionais e estaduais brasileiros (holidays-br)
"""
from __future__ import annotations

import os
import math
import logging
import functools
from datetime import date, datetime
from typing import Optional, Tuple

import httpx
import holidays
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

CLINIC_LAT: float = float(os.getenv("CLINIC_LAT", "-23.550520"))
CLINIC_LON: float = float(os.getenv("CLINIC_LON", "-46.633308"))

# Cache em memória para evitar chamadas repetidas durante o treino
_viacep_cache: dict[str, Tuple[float, float]] = {}
_weather_cache: dict[str, dict] = {}


# ──────────────────────────────────────────────────────────────
# 1. CLIMA — Open-Meteo (histórico + previsão)
# ──────────────────────────────────────────────────────────────

OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


def get_weather_for_date(
    appt_date: date,
    lat: float = CLINIC_LAT,
    lon: float = CLINIC_LON,
) -> dict:
    """
    Retorna condições climáticas para a data da consulta.
    Para datas passadas: usa API histórica do Open-Meteo.
    Para datas futuras (≤ 7 dias): usa previsão do Open-Meteo.
    Para datas futuras (> 7 dias): retorna médias sazonais do mês.

    Retorna dict com:
      precipitation_mm, temp_max_c, temp_min_c,
      heavy_rain (bool), extreme_heat (bool)
    """
    cache_key = f"{lat:.4f},{lon:.4f},{appt_date.isoformat()}"
    if cache_key in _weather_cache:
        return _weather_cache[cache_key]

    today = date.today()
    days_diff = (appt_date - today).days

    defaults = {
        "precipitation_mm": 0.0,
        "temp_max_c": 25.0,
        "temp_min_c": 18.0,
        "heavy_rain": False,
        "extreme_heat": False,
    }

    try:
        if days_diff < 0:
            # Data passada — API histórica
            url = OPEN_METEO_URL
            params = {
                "latitude": lat,
                "longitude": lon,
                "start_date": appt_date.isoformat(),
                "end_date": appt_date.isoformat(),
                "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min",
                "timezone": "America/Sao_Paulo",
            }
        elif days_diff <= 7:
            # Previsão curto prazo
            url = OPEN_METEO_FORECAST_URL
            params = {
                "latitude": lat,
                "longitude": lon,
                "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min",
                "timezone": "America/Sao_Paulo",
                "forecast_days": days_diff + 1,
            }
        else:
            # Futuro distante — retorna defaults sazonais
            logger.debug(f"Data {appt_date} muito futura; usando defaults sazonais.")
            _weather_cache[cache_key] = defaults
            return defaults

        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        daily = data.get("daily", {})
        precip = daily.get("precipitation_sum", [0.0])
        temp_max = daily.get("temperature_2m_max", [25.0])
        temp_min = daily.get("temperature_2m_min", [18.0])

        # Pega o índice correto (última entrada = dia solicitado em forecast)
        idx = -1 if days_diff > 0 else 0
        result = {
            "precipitation_mm": float(precip[idx] or 0.0),
            "temp_max_c": float(temp_max[idx] or 25.0),
            "temp_min_c": float(temp_min[idx] or 18.0),
            "heavy_rain": float(precip[idx] or 0.0) > 20.0,  # > 20mm = chuva forte
            "extreme_heat": float(temp_max[idx] or 25.0) > 35.0,  # > 35°C = calor extremo
        }
        _weather_cache[cache_key] = result
        return result

    except Exception as exc:
        logger.warning(f"Falha ao buscar clima para {appt_date}: {exc}. Usando defaults.")
        _weather_cache[cache_key] = defaults
        return defaults


# ──────────────────────────────────────────────────────────────
# 2. DISTÂNCIA — CEP → coords (ViaCEP) + haversine
# ──────────────────────────────────────────────────────────────

VIACEP_URL = "https://viacep.com.br/ws/{cep}/json/"

# Coords aproximadas por estado para fallback quando CEP inválido
STATE_COORDS: dict[str, Tuple[float, float]] = {
    "SP": (-23.5505, -46.6333),
    "RJ": (-22.9068, -43.1729),
    "MG": (-19.9167, -43.9345),
    "RS": (-30.0346, -51.2177),
    "PR": (-25.4284, -49.2733),
    "SC": (-27.5954, -48.5480),
    "BA": (-12.9714, -38.5014),
    "PE": (-8.0476, -34.8770),
    "CE": (-3.7172, -38.5433),
    "GO": (-16.6869, -49.2648),
}


def _cep_to_coords(cep: Optional[str]) -> Tuple[float, float]:
    """Converte CEP em (lat, lon) via ViaCEP + fallback por estado."""
    if not cep:
        return CLINIC_LAT, CLINIC_LON  # Sem CEP → distância = 0 (mesma localização)

    cep_clean = "".join(filter(str.isdigit, str(cep)))[:8]
    if len(cep_clean) != 8:
        return CLINIC_LAT, CLINIC_LON

    if cep_clean in _viacep_cache:
        return _viacep_cache[cep_clean]

    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(VIACEP_URL.format(cep=cep_clean))
            resp.raise_for_status()
            data = resp.json()

        if data.get("erro"):
            raise ValueError("CEP não encontrado")

        uf = data.get("uf", "SP")
        coords = STATE_COORDS.get(uf, (CLINIC_LAT, CLINIC_LON))
        _viacep_cache[cep_clean] = coords
        return coords

    except Exception:
        # Fallback: usa coordenadas do estado a partir dos 2 primeiros dígitos
        prefix = cep_clean[:2]
        fallback = {
            "01": (-23.55, -46.63), "02": (-23.51, -46.62),  # SP capital
            "20": (-22.90, -43.17), "21": (-22.88, -43.33),  # RJ
            "30": (-19.91, -43.93), "31": (-19.88, -43.95),  # BH
            "40": (-12.97, -38.50), "41": (-12.98, -38.48),  # SSA
            "50": (-8.05, -34.88), "51": (-8.05, -34.92),    # Recife
            "60": (-3.71, -38.54), "61": (-3.80, -38.60),    # Fortaleza
            "70": (-15.78, -47.93), "71": (-15.80, -47.95),  # Brasília
            "80": (-25.43, -49.27), "81": (-25.45, -49.29),  # Curitiba
            "90": (-30.03, -51.22), "91": (-30.05, -51.25),  # Porto Alegre
        }
        coords = fallback.get(prefix, (CLINIC_LAT, CLINIC_LON))
        _viacep_cache[cep_clean] = coords
        return coords


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distância em km entre dois pontos geográficos."""
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)
    a = math.sin(Δφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_patient_distance_km(patient_zip: Optional[str]) -> float:
    """Retorna a distância aproximada (km) entre o CEP do paciente e a clínica."""
    lat, lon = _cep_to_coords(patient_zip)
    return haversine_km(lat, lon, CLINIC_LAT, CLINIC_LON)


# ──────────────────────────────────────────────────────────────
# 3. FERIADOS — holidays-br
# ──────────────────────────────────────────────────────────────

@functools.lru_cache(maxsize=10)
def _get_holidays(year: int, state: str = "SP") -> set:
    """Retorna set de datas de feriados para o ano e estado."""
    try:
        br = holidays.Brazil(state=state, years=year)
        return set(br.keys())
    except Exception:
        return set()


def is_holiday(appt_date: date, state: str = "SP") -> bool:
    """Verifica se a data é feriado nacional ou estadual."""
    return appt_date in _get_holidays(appt_date.year, state)


def days_to_nearest_holiday(appt_date: date, state: str = "SP", window: int = 7) -> int:
    """Retorna quantos dias a consulta está do feriado mais próximo (0–7)."""
    holidays_set = _get_holidays(appt_date.year, state)
    for delta in range(window + 1):
        from datetime import timedelta
        if appt_date + timedelta(days=delta) in holidays_set:
            return delta
        if appt_date - timedelta(days=delta) in holidays_set:
            return delta
    return window + 1
