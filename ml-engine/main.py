"""
main.py — FastAPI Application
──────────────────────────────
Motor de IA do MediConnect: API de inferência do Score de Comportamento do Paciente.

Endpoints:
  GET  /health              → status do serviço e do modelo
  POST /predict/score       → retorna score de risco 0-100
  POST /retrain             → dispara retreinamento manual (protegido por API key)

Integração com Node.js:
  O backend Node.js faz POST /predict/score com o payload do agendamento
  e recebe { score, risk_level, top_factors } para exibir na UI da secretária.

Segurança:
  - CORS configurado para permitir o frontend React + backend Node
  - /retrain protegido por header X-API-Key
  - Sem dados sensíveis no log (apenas IDs)
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pipeline.predict import (
    ModelNotReadyError,
    get_model_meta,
    is_model_ready,
    predict_score,
    reload_model,
)
from pipeline.train import train as run_training
from scheduler import start_scheduler

load_dotenv()
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

RETRAIN_API_KEY = os.getenv("RETRAIN_API_KEY", "mediconnect-ml-secret")
PORT = int(os.getenv("PORT", "8000"))


# ─── Lifespan (startup / shutdown) ────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Carrega o modelo e inicia o scheduler na startup."""
    logger.info("🚀 MediConnect ML Engine iniciando...")
    reload_model()
    start_scheduler()
    logger.info("✅ Serviço pronto.")
    yield
    logger.info("ML Engine encerrando.")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="MediConnect ML Engine",
    description=(
        "Motor de IA para predição de risco de no-show de pacientes. "
        "Retorna Score de Comportamento (0–100) consumido pelo backend Node.js."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ─── Schemas Pydantic ─────────────────────────────────────────────────────────

class AppointmentPayload(BaseModel):
    """
    Payload enviado pelo backend Node.js para obter o score de risco.
    Todos os campos opcionais; o modelo imputa medianas para ausentes.
    """
    # Identificação (não usados no modelo, apenas para rastreabilidade)
    appointment_id: Optional[str] = Field(None, description="ID do agendamento (para log)")
    patient_id: Optional[str] = Field(None, description="ID do paciente (para log)")

    # Dados temporais
    scheduled_date: Optional[str] = Field(None, example="2026-06-15", description="Data da consulta (ISO)")
    scheduled_time: Optional[str] = Field(None, example="14:30", description="Hora da consulta")
    booking_created_at: Optional[str] = Field(None, description="Quando o agendamento foi criado (ISO)")

    # Dados clínicos
    modality: Optional[str] = Field("presencial", example="teleconsulta")
    specialty: Optional[str] = Field("clinica_geral", example="cardiologia")
    is_first_appointment: Optional[bool] = Field(None)

    # Dados do paciente
    birth_date: Optional[str] = Field(None, example="1985-03-22")
    gender: Optional[str] = Field(None, example="feminino")
    patient_zip_code: Optional[str] = Field(None, example="01310100")
    patient_state: Optional[str] = Field("SP", example="SP")

    # Histórico comportamental (calculado pelo backend antes de chamar a API)
    hist_total_appointments: Optional[int] = Field(0)
    hist_no_shows: Optional[int] = Field(0)
    hist_confirmed: Optional[int] = Field(0)
    hist_cancellations: Optional[int] = Field(0)
    hist_late_arrivals: Optional[int] = Field(0)

    # Dados externos pré-calculados (opcional — se não enviados, a API busca)
    distance_km: Optional[float] = Field(None)
    precipitation_mm: Optional[float] = Field(None)
    temp_max_c: Optional[float] = Field(None)
    heavy_rain: Optional[bool] = Field(None)
    extreme_heat: Optional[bool] = Field(None)

    # Controle
    fetch_external: Optional[bool] = Field(
        False,
        description="Se True, a API busca clima e distância automaticamente. "
                    "False (padrão) usa dados pré-calculados no payload."
    )


class ScoreResponse(BaseModel):
    score: int = Field(..., ge=0, le=100, description="Score de risco 0-100 (100 = máximo risco)")
    risk_level: str = Field(..., description="'low' | 'medium' | 'high'")
    top_factors: list[str] = Field(..., description="Principais fatores de risco em linguagem natural")
    meta: dict = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_meta: dict
    timestamp: str


class RetrainResponse(BaseModel):
    status: str
    auc_roc: Optional[float] = None
    accuracy: Optional[float] = None
    model_saved: Optional[bool] = None
    message: str


# ─── Dependências ─────────────────────────────────────────────────────────────

def verify_retrain_key(x_api_key: str = Header(...)):
    if x_api_key != RETRAIN_API_KEY:
        raise HTTPException(status_code=403, detail="API key inválida")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    """Verifica se o serviço está ativo e o modelo está carregado."""
    return HealthResponse(
        status="ok",
        model_loaded=is_model_ready(),
        model_meta=get_model_meta(),
        timestamp=datetime.utcnow().isoformat() + "Z",
    )


@app.post(
    "/predict/score",
    response_model=ScoreResponse,
    tags=["Prediction"],
    summary="Calcula o Score de Risco de No-Show",
    description=(
        "Recebe os dados de um agendamento e retorna um score de 0 a 100 indicando "
        "a probabilidade do paciente faltar (100 = certeza de falta). "
        "Consumido pelo backend Node.js do MediConnect."
    ),
)
def predict_noshow_score(payload: AppointmentPayload):
    """
    **Endpoint principal** — chamado pelo Node.js para cada agendamento que
    a secretária visualiza na agenda.

    Exemplo de resposta:
    ```json
    {
      "score": 78,
      "risk_level": "high",
      "top_factors": ["Histórico de faltas anterior", "Marcação de última hora"],
      "meta": { "probability_noshow": 0.78, "model_trained_at": "2026-06-08T..." }
    }
    ```
    """
    if not is_model_ready():
        raise HTTPException(
            status_code=503,
            detail={"error": "model_not_ready", "message": "Modelo não carregado. Contate o administrador."},
        )

    try:
        payload_dict = payload.model_dump(exclude_none=False)
        result = predict_score(payload_dict)
        return ScoreResponse(**result)
    except ModelNotReadyError as exc:
        raise HTTPException(status_code=503, detail={"error": "model_not_ready", "message": str(exc)})
    except Exception as exc:
        logger.exception(f"Erro na inferência (appointment_id={payload.appointment_id}): {exc}")
        raise HTTPException(status_code=500, detail={"error": "inference_error", "message": str(exc)})


@app.post(
    "/retrain",
    response_model=RetrainResponse,
    tags=["Admin"],
    dependencies=[Depends(verify_retrain_key)],
    summary="Dispara retreinamento manual do modelo",
)
def manual_retrain(use_synthetic: bool = False):
    """
    Dispara o pipeline de retreinamento imediatamente.
    Requer header `X-API-Key: <RETRAIN_API_KEY>`.
    Útil para forçar retreinamento após carga de novos dados.
    """
    try:
        logger.info("Retreinamento manual disparado via API.")
        result = run_training(use_synthetic=use_synthetic)
        if result.get("model_saved"):
            reload_model()
            message = "Modelo retreinado e carregado com sucesso."
        else:
            message = "Retreinamento executado mas validação falhou. Modelo anterior mantido."

        return RetrainResponse(message=message, **result)

    except Exception as exc:
        logger.exception(f"Erro no retreinamento manual: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
