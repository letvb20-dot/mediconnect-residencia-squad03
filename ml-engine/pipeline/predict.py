"""
predict.py
──────────
Inferência a partir do modelo serializado.
Transforma um payload de agendamento em score 0-100 + risk_level + top_factors.

Carregamento:
  O modelo é carregado uma vez na startup do FastAPI e armazenado em memória.
  Recarregue chamando `reload_model()` após um retrain.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv

from .feature_engineering import build_features_from_row

load_dotenv()
logger = logging.getLogger(__name__)

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))
MODEL_PATH = MODEL_DIR / "ensemble_model.pkl"

# Estado global do modelo em memória
_model_artifact: Optional[dict] = None


def reload_model() -> bool:
    """
    Carrega ou recarrega o artefato do modelo do disco.
    Retorna True se bem-sucedido, False caso contrário.
    """
    global _model_artifact
    if not MODEL_PATH.exists():
        logger.warning(f"Modelo não encontrado em {MODEL_PATH}. Rode pipeline/train.py primeiro.")
        _model_artifact = None
        return False
    try:
        _model_artifact = joblib.load(MODEL_PATH)
        logger.info(
            f"Modelo carregado: AUC-ROC={_model_artifact.get('auc_roc', 'N/A'):.4f} | "
            f"Treinado em: {_model_artifact.get('trained_at', 'N/A')} | "
            f"Sintético: {_model_artifact.get('is_synthetic', False)}"
        )
        return True
    except Exception as exc:
        logger.error(f"Falha ao carregar modelo: {exc}")
        _model_artifact = None
        return False


def is_model_ready() -> bool:
    return _model_artifact is not None


def get_model_meta() -> dict:
    if not _model_artifact:
        return {"status": "not_loaded"}
    return {
        "status": "loaded",
        "trained_at": _model_artifact.get("trained_at"),
        "auc_roc": _model_artifact.get("auc_roc"),
        "accuracy": _model_artifact.get("accuracy"),
        "is_synthetic": _model_artifact.get("is_synthetic"),
        "n_samples": _model_artifact.get("n_samples"),
        "noshow_rate": _model_artifact.get("noshow_rate"),
        "feature_count": len(_model_artifact.get("feature_names", [])),
    }


def _score_to_risk_level(score: int) -> str:
    if score < 30:
        return "low"
    elif score < 65:
        return "medium"
    else:
        return "high"


def _get_top_factors(
    feature_vector: np.ndarray,
    feature_names: list[str],
    ensemble,
    n: int = 5,
) -> list[str]:
    """
    Extrai as top N features mais influentes para esta predição.
    Usa feature_importances_ do RandomForest (estimador índice 0).

    Retorna lista de strings legíveis pela secretária.
    """
    # Labels legíveis para apresentar na UI
    READABLE_LABELS = {
        "hist_noshow_rate": "Histórico de faltas anterior",
        "hist_no_shows": "Número de faltas anteriores",
        "advance_days": "Antecedência da marcação",
        "advance_short": "Marcação de última hora (< 2 dias)",
        "is_first_appointment": "Primeira consulta",
        "distance_km": "Distância até a clínica",
        "distance_very_far": "Paciente muito distante (> 50km)",
        "heavy_rain": "Previsão de chuva forte",
        "extreme_heat": "Previsão de calor extremo",
        "is_holiday": "Feriado no dia da consulta",
        "near_holiday": "Consulta próxima a feriado",
        "is_teleconsulta": "Modalidade teleconsulta",
        "hist_cancel_rate": "Alta taxa de cancelamentos anteriores",
        "hist_late_rate": "Histórico de atrasos",
        "age_group_senior": "Paciente idoso (> 60 anos)",
        "is_evening": "Horário noturno",
        "hour_bucket_noite": "Consulta no período noturno",
        "hour_bucket_fim_tarde": "Horário fim de tarde",
        "is_friday": "Consulta às sextas-feiras",
        "is_monday": "Consulta às segundas-feiras",
        "hist_confirm_rate": "Baixa taxa de confirmações anteriores",
        "is_summer": "Período de verão",
        "is_carnival_period": "Período de carnaval",
    }

    try:
        rf_estimator = None
        for name, est in ensemble.estimators_:
            if name == "rf":
                rf_estimator = est
                break

        if rf_estimator is None:
            return []

        importances = rf_estimator.feature_importances_
        # Pesa pela magnitude do valor atual (features ativas importam mais)
        weighted = importances * np.abs(feature_vector)
        top_indices = np.argsort(weighted)[::-1][:n]

        factors = []
        for idx in top_indices:
            if idx < len(feature_names):
                raw_name = feature_names[idx]
                readable = READABLE_LABELS.get(raw_name, raw_name.replace("_", " ").capitalize())
                factors.append(readable)

        return factors

    except Exception as exc:
        logger.warning(f"Não foi possível extrair top_factors: {exc}")
        return []


def predict_score(payload: dict) -> dict:
    """
    Prediz o score de risco de no-show para um agendamento.

    payload: dict com campos do agendamento (veja API schema)
    Retorna: { score: int, risk_level: str, top_factors: list[str], meta: dict }
    """
    if not is_model_ready():
        raise ModelNotReadyError("Modelo não carregado. Execute o treinamento primeiro.")

    artifact = _model_artifact
    ensemble = artifact["ensemble"]
    scaler = artifact["scaler"]
    feature_names = artifact["feature_names"]

    # ── Feature engineering do payload ──────────────────────────────────────
    fetch_external = payload.get("fetch_external", True)
    features_dict = build_features_from_row(payload, fetch_external=fetch_external)

    # Alinha as features com o schema do modelo treinado (imputa 0 para ausentes)
    features_aligned = {name: features_dict.get(name, 0.0) for name in feature_names}
    feature_vector = np.array(list(features_aligned.values())).reshape(1, -1)

    # ── Scaling ──────────────────────────────────────────────────────────────
    feature_vector_scaled = scaler.transform(feature_vector)

    # ── Predição ─────────────────────────────────────────────────────────────
    proba_noshow = float(ensemble.predict_proba(feature_vector_scaled)[0, 1])
    score = int(round(proba_noshow * 100))
    score = max(0, min(100, score))  # Garante intervalo [0, 100]

    risk_level = _score_to_risk_level(score)
    top_factors = _get_top_factors(
        feature_vector[0], feature_names, ensemble, n=5
    )

    return {
        "score": score,
        "risk_level": risk_level,
        "top_factors": top_factors,
        "meta": {
            "probability_noshow": round(proba_noshow, 4),
            "model_trained_at": artifact.get("trained_at"),
            "is_synthetic_model": artifact.get("is_synthetic", False),
        },
    }


class ModelNotReadyError(Exception):
    pass
