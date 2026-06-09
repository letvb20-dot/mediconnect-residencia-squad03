"""
scheduler.py
────────────
Retreinamento automático semanal via APScheduler.
Dispara toda segunda-feira às 02:00 (horário de Brasília) por padrão.
Configurável via variável de ambiente RETRAIN_CRON.

Comportamento:
  - Se o treino for bem-sucedido e AUC-ROC ≥ 0.85 → modelo substituído e recarregado.
  - Se o treino falhar ou não passar na validação → modelo anterior preservado.
  - Erros são logados como RETRAIN_FAILED; não quebram o servidor.
"""
from __future__ import annotations

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv

from pipeline.train import train as run_training
from pipeline.predict import reload_model

load_dotenv()
logger = logging.getLogger(__name__)

# Padrão: toda segunda-feira às 02:00
RETRAIN_CRON = os.getenv("RETRAIN_CRON", "0 2 * * 1")
RETRAIN_TIMEZONE = os.getenv("RETRAIN_TIMEZONE", "America/Sao_Paulo")

_scheduler: BackgroundScheduler | None = None


def _retrain_job():
    """Job executado pelo scheduler. Preserva modelo anterior em caso de falha."""
    logger.info("═══ RETRAIN_SCHEDULED: Iniciando retreinamento semanal ═══")
    try:
        result = run_training(use_synthetic=False)
        if result.get("model_saved"):
            reload_model()
            logger.info(
                f"RETRAIN_SUCCESS: AUC-ROC={result.get('auc_roc', 'N/A'):.4f} | "
                f"Accuracy={result.get('accuracy', 'N/A'):.4f} | "
                f"Amostras={result.get('n_samples', 'N/A')}"
            )
        else:
            logger.warning(
                f"RETRAIN_VALIDATION_FAILED: AUC-ROC={result.get('auc_roc', 'N/A'):.4f}. "
                "Modelo anterior mantido em produção."
            )
    except Exception as exc:
        logger.error(f"RETRAIN_FAILED: {exc}", exc_info=True)


def start_scheduler():
    """Inicializa e inicia o scheduler em background."""
    global _scheduler

    # Parse do cron expression (5 campos: minuto hora dia mês dia_semana)
    parts = RETRAIN_CRON.strip().split()
    if len(parts) == 5:
        minute, hour, day, month, day_of_week = parts
    else:
        logger.warning(f"RETRAIN_CRON inválido: '{RETRAIN_CRON}'. Usando padrão segunda 02:00.")
        minute, hour, day, month, day_of_week = "0", "2", "*", "*", "1"

    trigger = CronTrigger(
        minute=minute,
        hour=hour,
        day=day,
        month=month,
        day_of_week=day_of_week,
        timezone=RETRAIN_TIMEZONE,
    )

    _scheduler = BackgroundScheduler(timezone=RETRAIN_TIMEZONE)
    _scheduler.add_job(_retrain_job, trigger=trigger, id="weekly_retrain", replace_existing=True)
    _scheduler.start()

    logger.info(
        f"📅 Scheduler iniciado: retreinamento semanal configurado para "
        f"cron='{RETRAIN_CRON}' timezone='{RETRAIN_TIMEZONE}'"
    )


def stop_scheduler():
    """Para o scheduler graciosamente."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler encerrado.")


def trigger_retrain_now():
    """Dispara o job imediatamente (útil para testes)."""
    _retrain_job()
