"""
train.py
────────
Treina o Ensemble (VotingClassifier: RandomForest + XGBoost).
Aplica SMOTE para tratar desequilíbrio de classes.
Valida AUC-ROC ≥ 0.85; preserva modelo anterior se validação falhar.
Serializa modelo + preprocessor + metadados via joblib.

Uso via CLI:
  python -m pipeline.train              # usa dados reais do PostgreSQL
  python -m pipeline.train --synthetic  # força geração de dados sintéticos
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

try:
    from imblearn.over_sampling import SMOTE
    from imblearn.pipeline import Pipeline as ImbPipeline
    SMOTE_AVAILABLE = True
except ImportError:
    SMOTE_AVAILABLE = False
    logging.warning("imbalanced-learn não disponível. SMOTE desativado.")

from .data_loader import derive_noshow_label, load_dataset
from .feature_engineering import build_training_dataframe
from .synthetic_data import generate_synthetic_dataset  # definido abaixo no mesmo módulo

load_dotenv()
logger = logging.getLogger(__name__)

# ─── Configuração ─────────────────────────────────────────────────────────────
MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))
MIN_TRAINING_ROWS = int(os.getenv("MIN_TRAINING_ROWS", "200"))
AUC_THRESHOLD = 0.85
ACCURACY_THRESHOLD = 0.85
RANDOM_STATE = 42

MODEL_PATH = MODEL_DIR / "ensemble_model.pkl"
BACKUP_PATH = MODEL_DIR / "ensemble_model_backup.pkl"
META_PATH = MODEL_DIR / "model_meta.json"


# ─── Geração de dados sintéticos (Cold Start) ─────────────────────────────────
def generate_synthetic_dataset(n: int = 1500) -> pd.DataFrame:
    """
    Gera dataset sintético realista para cold start.
    Distribui no-shows com taxa ~22% (média clínica brasileira).
    """
    rng = np.random.default_rng(RANDOM_STATE)
    n_noshow = int(n * 0.22)
    n_show = n - n_noshow

    def make_group(size: int, noshow: int) -> dict:
        today = datetime.today()
        dates = [today.replace(
            year=today.year - rng.integers(0, 2),
            month=rng.integers(1, 13),
            day=rng.integers(1, 28)
        ) for _ in range(size)]

        hist_total = rng.integers(0, 20, size)
        hist_ns = np.where(
            noshow == 1,
            rng.integers(1, 8, size),
            rng.integers(0, 2, size)
        )

        return {
            "scheduled_date": [d.strftime("%Y-%m-%d") for d in dates],
            "scheduled_time": [f"{rng.integers(7, 20):02d}:{rng.choice([0, 15, 30, 45]):02d}" for _ in range(size)],
            "birth_date": [
                f"{today.year - rng.integers(18, 80)}-{rng.integers(1, 13):02d}-{rng.integers(1, 28):02d}"
                for _ in range(size)
            ],
            "gender": rng.choice(["masculino", "feminino"], size=size).tolist(),
            "patient_zip_code": [f"{rng.integers(1000000, 9999999):07d}" for _ in range(size)],
            "patient_state": rng.choice(["SP", "RJ", "MG", "PR", "RS"], size=size).tolist(),
            "modality": rng.choice(["presencial", "teleconsulta", "procedimento"], size=size, p=[0.6, 0.3, 0.1]).tolist(),
            "specialty": rng.choice(["clinica_geral", "cardiologia", "dermatologia", "ortopedia", "pediatria"], size=size).tolist(),
            "is_first_appointment": rng.choice([0, 1], size=size, p=[0.7, 0.3]).tolist(),
            "hist_total_appointments": hist_total.tolist(),
            "hist_no_shows": np.minimum(hist_ns, hist_total).tolist(),
            "hist_confirmed": rng.integers(0, 10, size).tolist(),
            "hist_cancellations": rng.integers(0, 5, size).tolist(),
            "hist_late_arrivals": rng.integers(0, 3, size).tolist(),
            "booking_created_at": [
                (d - pd.Timedelta(days=int(rng.integers(0, 30)))).strftime("%Y-%m-%dT%H:%M:%S")
                for d in dates
            ],
            "no_show": [noshow] * size,
            # Dados climáticos sintéticos
            "precipitation_mm": rng.exponential(5.0, size).tolist(),
            "temp_max_c": (25 + rng.normal(0, 5, size)).tolist(),
            "temp_min_c": (18 + rng.normal(0, 4, size)).tolist(),
            "heavy_rain": (rng.exponential(5.0, size) > 20).astype(int).tolist(),
            "extreme_heat": ((25 + rng.normal(0, 5, size)) > 35).astype(int).tolist(),
            "distance_km": rng.exponential(15.0, size).tolist(),
        }

    df_noshow = pd.DataFrame(make_group(n_noshow, 1))
    df_show = pd.DataFrame(make_group(n_show, 0))
    df = pd.concat([df_noshow, df_show], ignore_index=True)
    return df.sample(frac=1, random_state=RANDOM_STATE).reset_index(drop=True)


# ─── Pipeline de Treinamento ──────────────────────────────────────────────────

def build_ensemble() -> VotingClassifier:
    """Cria o VotingClassifier com Random Forest + XGBoost (soft voting)."""
    rf = RandomForestClassifier(
        n_estimators=300,
        max_depth=8,
        min_samples_leaf=10,
        class_weight="balanced",
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )
    xgb = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=3,        # penaliza erros na classe minoritária
        use_label_encoder=False,
        eval_metric="auc",
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )
    return VotingClassifier(
        estimators=[("rf", rf), ("xgb", xgb)],
        voting="soft",
        weights=[1, 1],
    )


def train(use_synthetic: bool = False) -> dict:
    """
    Executa o pipeline completo de treinamento.
    Retorna dict com métricas e status de validação.
    """
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("=== Iniciando pipeline de treinamento ===")

    # ── 1. Carga de dados ────────────────────────────────────────────────────
    df_raw = None
    is_synthetic = False

    if not use_synthetic:
        df_raw = load_dataset(min_rows=MIN_TRAINING_ROWS)

    if df_raw is None or len(df_raw) < MIN_TRAINING_ROWS:
        logger.warning("Usando dados sintéticos para treinamento (cold start).")
        df_raw = generate_synthetic_dataset(n=2000)
        is_synthetic = True

    df_raw = derive_noshow_label(df_raw)
    logger.info(f"Dataset: {len(df_raw)} linhas | No-show rate: {df_raw['no_show'].mean():.2%}")

    # ── 2. Feature Engineering ───────────────────────────────────────────────
    X, y = build_training_dataframe(df_raw, fetch_external=False)

    # ── 3. Split treino / validação ──────────────────────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=RANDOM_STATE, stratify=y
    )
    logger.info(f"Treino: {len(X_train)} | Teste: {len(X_test)}")
    logger.info(f"No-show no treino: {y_train.mean():.2%} | No-show no teste: {y_test.mean():.2%}")

    # ── 4. SMOTE (balanceamento de classes) ──────────────────────────────────
    if SMOTE_AVAILABLE and y_train.mean() < 0.35:
        try:
            smote = SMOTE(random_state=RANDOM_STATE, k_neighbors=5)
            X_train_res, y_train_res = smote.fit_resample(X_train, y_train)
            logger.info(
                f"SMOTE aplicado: {len(X_train)} → {len(X_train_res)} amostras "
                f"(no-show: {y_train.mean():.2%} → {y_train_res.mean():.2%})"
            )
        except Exception as exc:
            logger.warning(f"SMOTE falhou ({exc}). Usando dataset original com class_weight.")
            X_train_res, y_train_res = X_train, y_train
    else:
        X_train_res, y_train_res = X_train, y_train

    # ── 5. Treinamento do Ensemble ───────────────────────────────────────────
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train_res)
    X_test_scaled = scaler.transform(X_test)

    ensemble = build_ensemble()
    logger.info("Treinando VotingClassifier (RF + XGBoost)...")
    ensemble.fit(X_train_scaled, y_train_res)

    # ── 6. Validação ─────────────────────────────────────────────────────────
    y_pred = ensemble.predict(X_test_scaled)
    y_proba = ensemble.predict_proba(X_test_scaled)[:, 1]

    auc = roc_auc_score(y_test, y_proba)
    acc = accuracy_score(y_test, y_pred)

    logger.info(f"AUC-ROC: {auc:.4f} | Accuracy: {acc:.4f}")
    logger.info("\n" + classification_report(y_test, y_pred, target_names=["show", "no_show"]))

    validation_passed = auc >= AUC_THRESHOLD and acc >= ACCURACY_THRESHOLD

    if not validation_passed:
        logger.warning(
            f"VALIDATION_FAILED: AUC-ROC={auc:.4f} < {AUC_THRESHOLD} "
            f"ou Accuracy={acc:.4f} < {ACCURACY_THRESHOLD}. "
            "Modelo anterior preservado."
        )
        return {
            "status": "validation_failed",
            "auc_roc": auc,
            "accuracy": acc,
            "is_synthetic": is_synthetic,
            "model_saved": False,
        }

    # ── 7. Backup do modelo anterior ─────────────────────────────────────────
    if MODEL_PATH.exists():
        shutil.copy(MODEL_PATH, BACKUP_PATH)
        logger.info("Backup do modelo anterior criado.")

    # ── 8. Serialização ──────────────────────────────────────────────────────
    artifact = {
        "ensemble": ensemble,
        "scaler": scaler,
        "feature_names": list(X.columns),
        "is_synthetic": is_synthetic,
        "trained_at": datetime.utcnow().isoformat(),
        "auc_roc": auc,
        "accuracy": acc,
        "n_samples": len(df_raw),
        "noshow_rate": float(y.mean()),
    }
    joblib.dump(artifact, MODEL_PATH)
    logger.info(f"Modelo salvo em {MODEL_PATH}")

    meta = {k: v for k, v in artifact.items() if k not in ("ensemble", "scaler")}
    META_PATH.write_text(json.dumps(meta, indent=2))

    return {
        "status": "success",
        "auc_roc": auc,
        "accuracy": acc,
        "is_synthetic": is_synthetic,
        "model_saved": True,
        "model_path": str(MODEL_PATH),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser(description="Treinamento do Motor de IA MediConnect")
    parser.add_argument("--synthetic", action="store_true", help="Forçar uso de dados sintéticos")
    args = parser.parse_args()
    result = train(use_synthetic=args.synthetic)
    print(json.dumps(result, indent=2))
