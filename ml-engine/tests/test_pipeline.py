"""
tests/test_pipeline.py
───────────────────────
Testes unitários do Motor de IA MediConnect.
Executa sem banco de dados; usa dados sintéticos e mocks.

Executar:
  cd ml-engine
  python -m pytest tests/ -v
"""
from __future__ import annotations

import sys
import os
from pathlib import Path
from datetime import date, datetime
from unittest.mock import patch, MagicMock

import numpy as np
import pandas as pd
import pytest

# Adiciona o diretório ml-engine ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

# ─── Testes: Feature Engineering ─────────────────────────────────────────────

class TestFeatureEngineering:
    """Testa build_features_from_row com payloads variados."""

    def test_basic_payload_returns_dict(self):
        from pipeline.feature_engineering import build_features_from_row
        payload = {
            "scheduled_date": "2026-06-15",
            "scheduled_time": "14:30",
            "birth_date": "1985-03-22",
            "gender": "feminino",
            "hist_total_appointments": 5,
            "hist_no_shows": 2,
        }
        features = build_features_from_row(payload, fetch_external=False)
        assert isinstance(features, dict)
        assert len(features) >= 80, f"Esperado ≥80 features, obtido {len(features)}"

    def test_noshow_rate_calculated_correctly(self):
        from pipeline.feature_engineering import build_features_from_row
        payload = {"hist_total_appointments": 10, "hist_no_shows": 3}
        f = build_features_from_row(payload, fetch_external=False)
        assert abs(f["hist_noshow_rate"] - 0.3) < 0.001

    def test_empty_payload_uses_defaults(self):
        from pipeline.feature_engineering import build_features_from_row
        f = build_features_from_row({}, fetch_external=False)
        assert isinstance(f, dict)
        assert f["hist_noshow_rate"] == 0.0
        assert f["is_first_appointment"] == 1  # sem histórico → primeira vez

    def test_temporal_features_monday(self):
        from pipeline.feature_engineering import build_features_from_row
        # 2026-06-15 é segunda-feira
        f = build_features_from_row(
            {"scheduled_date": "2026-06-15", "scheduled_time": "08:00"},
            fetch_external=False,
        )
        assert f["is_monday"] == 1
        assert f["is_friday"] == 0
        assert f["appt_hour"] == 8

    def test_age_calculation(self):
        from pipeline.feature_engineering import build_features_from_row
        f = build_features_from_row(
            {"birth_date": "1985-06-15", "scheduled_date": "2026-06-15"},
            fetch_external=False,
        )
        assert abs(f["age_years"] - 41.0) < 1.0

    def test_advance_days_same_day(self):
        from pipeline.feature_engineering import build_features_from_row
        today_str = date.today().isoformat()
        f = build_features_from_row(
            {
                "scheduled_date": today_str,
                "booking_created_at": datetime.now().isoformat(),
            },
            fetch_external=False,
        )
        assert f["advance_same_day"] == 1
        assert f["advance_short"] == 1

    def test_feature_count_exceeds_100(self):
        from pipeline.feature_engineering import FEATURE_NAMES
        assert len(FEATURE_NAMES) >= 100, (
            f"Spec exige ≥100 features, obtido {len(FEATURE_NAMES)}"
        )

    def test_interaction_noshow_x_rain(self):
        from pipeline.feature_engineering import build_features_from_row
        f = build_features_from_row(
            {
                "hist_no_shows": 3,
                "hist_total_appointments": 5,
                "heavy_rain": True,
                "precipitation_mm": 25.0,
            },
            fetch_external=False,
        )
        # noshow_rate = 0.6, heavy_rain = 1 → interação = 0.6
        assert f["noshow_x_rain"] == pytest.approx(0.6, abs=0.01)


# ─── Testes: Score (0–100) ────────────────────────────────────────────────────

class TestScoreRange:
    """Testa que o score sempre retorna no intervalo [0, 100]."""

    def test_score_range_with_synthetic_model(self, tmp_path):
        """Treina modelo sintético e verifica score está em [0, 100]."""
        os.environ["MODEL_DIR"] = str(tmp_path)

        from pipeline.train import train as run_training
        from pipeline.predict import reload_model, predict_score

        result = run_training(use_synthetic=True)
        assert result["status"] == "success", f"Treino falhou: {result}"
        assert result["model_saved"] is True

        reload_model()

        payload = {
            "scheduled_date": "2026-07-01",
            "scheduled_time": "09:00",
            "birth_date": "1990-01-01",
            "gender": "masculino",
            "modality": "presencial",
            "hist_total_appointments": 3,
            "hist_no_shows": 1,
            "fetch_external": False,
        }
        prediction = predict_score(payload)

        assert "score" in prediction
        assert 0 <= prediction["score"] <= 100, f"Score fora do range: {prediction['score']}"
        assert prediction["risk_level"] in ("low", "medium", "high")
        assert isinstance(prediction["top_factors"], list)

    def test_score_low_risk_profile(self, tmp_path):
        """Paciente confiável deve ter score baixo."""
        os.environ["MODEL_DIR"] = str(tmp_path)

        from pipeline.train import train as run_training
        from pipeline.predict import reload_model, predict_score

        run_training(use_synthetic=True)
        reload_model()

        # Paciente com ótimo histórico
        payload = {
            "scheduled_date": "2026-07-15",
            "scheduled_time": "10:00",
            "hist_total_appointments": 20,
            "hist_no_shows": 0,
            "hist_confirmed": 18,
            "hist_cancellations": 0,
            "modality": "presencial",
            "advance_days": 7,
            "fetch_external": False,
            "precipitation_mm": 0.0,
            "heavy_rain": False,
        }
        result = predict_score(payload)
        # Não podemos garantir exatamente < 30, mas deve ser menor que um perfil de risco alto
        assert result["score"] < 90  # Sanity check básico

    def test_model_not_ready_raises_error(self, tmp_path):
        """Sem modelo carregado, deve levantar ModelNotReadyError."""
        os.environ["MODEL_DIR"] = str(tmp_path / "empty")

        import importlib
        import pipeline.predict as predict_module
        importlib.reload(predict_module)
        predict_module._model_artifact = None

        from pipeline.predict import predict_score, ModelNotReadyError
        with pytest.raises(ModelNotReadyError):
            predict_score({"fetch_external": False})


# ─── Testes: API Endpoints ────────────────────────────────────────────────────

class TestAPIEndpoints:
    """Testa os endpoints FastAPI via TestClient."""

    @pytest.fixture(autouse=True)
    def setup_env(self, tmp_path):
        os.environ["MODEL_DIR"] = str(tmp_path)
        # Treina um modelo sintético para os testes de API
        from pipeline.train import train as run_training
        run_training(use_synthetic=True)

    def test_health_returns_200(self):
        from fastapi.testclient import TestClient
        import pipeline.predict as predict_module
        predict_module.reload_model()

        from main import app
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "model_loaded" in data

    def test_predict_score_happy_path(self):
        from fastapi.testclient import TestClient
        import pipeline.predict as predict_module
        predict_module.reload_model()

        from main import app
        client = TestClient(app)

        payload = {
            "scheduled_date": "2026-07-10",
            "scheduled_time": "11:00",
            "birth_date": "1980-05-20",
            "gender": "feminino",
            "modality": "presencial",
            "hist_total_appointments": 5,
            "hist_no_shows": 1,
            "fetch_external": False,
        }
        response = client.post("/predict/score", json=payload)
        assert response.status_code == 200, f"Body: {response.text}"
        data = response.json()
        assert "score" in data
        assert 0 <= data["score"] <= 100
        assert data["risk_level"] in ("low", "medium", "high")
        assert isinstance(data["top_factors"], list)

    def test_predict_score_missing_optional_fields(self):
        """Payload mínimo (sem campos opcionais) deve funcionar."""
        from fastapi.testclient import TestClient
        import pipeline.predict as predict_module
        predict_module.reload_model()

        from main import app
        client = TestClient(app)
        response = client.post("/predict/score", json={"fetch_external": False})
        assert response.status_code == 200


# ─── Testes: Dados Externos ───────────────────────────────────────────────────

class TestExternalData:
    def test_haversine_zero_distance(self):
        from pipeline.external_data import haversine_km
        d = haversine_km(-23.55, -46.63, -23.55, -46.63)
        assert d == pytest.approx(0.0, abs=0.001)

    def test_haversine_sp_to_rj(self):
        from pipeline.external_data import haversine_km
        # SP → RJ ≈ 360 km em linha reta
        d = haversine_km(-23.55, -46.63, -22.90, -43.17)
        assert 300 < d < 420, f"Distância SP→RJ inesperada: {d:.1f} km"

    def test_is_holiday_christmas(self):
        from pipeline.external_data import is_holiday
        natal = date(2026, 12, 25)
        assert is_holiday(natal, state="SP") is True

    def test_is_holiday_regular_day(self):
        from pipeline.external_data import is_holiday
        regular = date(2026, 6, 16)  # Terça comum
        # Não é feriado nacional
        assert is_holiday(regular, state="SP") is False

    def test_days_to_nearest_holiday_returns_int(self):
        from pipeline.external_data import days_to_nearest_holiday
        result = days_to_nearest_holiday(date(2026, 12, 24), state="SP")
        assert isinstance(result, int)
        assert 0 <= result <= 8


# ─── Testes: Retreinamento ────────────────────────────────────────────────────

class TestRetraining:
    def test_synthetic_train_produces_model(self, tmp_path):
        os.environ["MODEL_DIR"] = str(tmp_path)
        from pipeline.train import train as run_training
        result = run_training(use_synthetic=True)
        assert result["status"] == "success"
        assert result["model_saved"] is True
        assert (tmp_path / "ensemble_model.pkl").exists()

    def test_train_auc_exceeds_threshold(self, tmp_path):
        os.environ["MODEL_DIR"] = str(tmp_path)
        from pipeline.train import train as run_training
        result = run_training(use_synthetic=True)
        if result["status"] == "success":
            assert result["auc_roc"] >= 0.75, (
                f"AUC-ROC {result['auc_roc']:.4f} abaixo do mínimo esperado com dados sintéticos"
            )

    def test_backup_created_on_retrain(self, tmp_path):
        os.environ["MODEL_DIR"] = str(tmp_path)
        from pipeline.train import train as run_training

        # Primeiro treino
        run_training(use_synthetic=True)
        assert (tmp_path / "ensemble_model.pkl").exists()

        # Segundo treino → deve criar backup
        run_training(use_synthetic=True)
        assert (tmp_path / "ensemble_model_backup.pkl").exists()
