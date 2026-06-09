---
title: 'ML Patient No-Show Score Engine (Microsserviço Python)'
type: 'feature'
created: '2026-06-08'
status: 'done'
context:
  - 'docs/ARCHITECTURE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** MediConnect has no automated way to predict which patients will miss their appointments. Clinic staff cannot proactively intervene, resulting in costly empty slots and high absenteeism.

**Approach:** Build a standalone Python FastAPI microservice (Motor de IA / Score de Comportamento) that trains a VotingClassifier Ensemble (Random Forest + XGBoost) on appointment history from PostgreSQL, exposes a `POST /predict/score` endpoint returning a 0–100 risk score, and automatically retrains weekly via a cron job — without modifying any existing React/Supabase code.

## Boundaries & Constraints

**Always:**
- Return `{ score: int(0-100), risk_level: "low"|"medium"|"high", top_factors: [...] }` from `POST /predict/score`.
- Model must achieve AUC-ROC ≥ 0.85 and Accuracy ≥ 0.85 on hold-out set; if validation fails, log warning and keep previous model.
- Apply SMOTE (or `class_weight='balanced'`) to handle class imbalance (no-shows are the minority class).
- All secrets (DB_URL, weather API key) come from environment variables / `.env` file — never hardcoded.
- Microservice lives in `ml-engine/` at project root; zero changes to `src/` React code.

**Ask First:**
- If AUC-ROC < 0.85 on first train (cold-start with synthetic data), keep synthetic baseline model or halt?
- Weather API provider selection (OpenWeatherMap vs. Open-Meteo) — Open-Meteo is free/no-key, recommended default.

**Never:**
- Do not modify `src/`, `tests/`, or any existing Supabase Edge Functions.
- Do not use deep learning (CNNs, Transformers) — Random Forest + XGBoost ensemble only.
- Do not store model artifacts in PostgreSQL; use local filesystem `ml-engine/models/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Happy path — score request | Valid appointment JSON payload | `{ score: 72, risk_level: "high", top_factors: [...] }` | N/A |
| No trained model on disk | `POST /predict/score` called before first train | HTTP 503 with `{ error: "model_not_ready" }` | Retorna 503; não crasha |
| Missing optional features | Payload sem `weather_condition` ou `distance_km` | Imputa medianas treinadas; retorna score normal | Aviso no log, não erro |
| PostgreSQL unreachable (retrain job) | DB offline durante cron | Retrain abortado; modelo anterior preservado | Log `RETRAIN_FAILED`; alarme via stderr |
| Class imbalance | Dataset com < 5% no-show | SMOTE aplicado; AUC-ROC alvo ainda ≥ 0.85 | Log do ratio original e pós-SMOTE |
| Validation fails (AUC < 0.85) | Novo modelo retreinado | Modelo anterior mantido; log `VALIDATION_FAILED` | Não substitui modelo em produção |

</frozen-after-approval>

## Code Map

- `ml-engine/` — raiz do microsserviço Python; isolado do resto do projeto
- `ml-engine/main.py` — app FastAPI; rotas `/health`, `/predict/score`, `/retrain`
- `ml-engine/pipeline/feature_engineering.py` — extração e transformação de 100+ variáveis
- `ml-engine/pipeline/train.py` — treinamento do Ensemble + validação + serialização
- `ml-engine/pipeline/predict.py` — inferência a partir do modelo serializado
- `ml-engine/pipeline/data_loader.py` — conexão PostgreSQL + extração do dataset
- `ml-engine/pipeline/external_data.py` — clima (Open-Meteo), distância (haversine), feriados (holidays-br)
- `ml-engine/scheduler.py` — cron job semanal via APScheduler
- `ml-engine/models/` — artefatos joblib (`ensemble_model.pkl`, `preprocessor.pkl`)
- `ml-engine/requirements.txt` — dependências Python fixadas
- `ml-engine/.env.example` — template de variáveis de ambiente
- `ml-engine/Dockerfile` — containerização opcional
- `ml-engine/tests/test_pipeline.py` — testes unitários do pipeline

## Tasks & Acceptance

**Execution:**
- [ ] `ml-engine/requirements.txt` -- CREATE -- Pin all Python dependencies (fastapi, uvicorn, scikit-learn, xgboost, imbalanced-learn, pandas, numpy, psycopg2-binary, sqlalchemy, apscheduler, joblib, httpx, holidays, python-dotenv)
- [ ] `ml-engine/.env.example` -- CREATE -- Template com DB_URL, WEATHER_API_KEY, CLINIC_LAT, CLINIC_LON, MODEL_PATH, PORT
- [ ] `ml-engine/pipeline/data_loader.py` -- CREATE -- Extrai appointments + patients + doctors do PostgreSQL via SQLAlchemy; retorna DataFrame
- [ ] `ml-engine/pipeline/external_data.py` -- CREATE -- Busca clima Open-Meteo por data/lat/lon; calcula distância haversine por CEP→coords; detecta feriados BR com `holidays`
- [ ] `ml-engine/pipeline/feature_engineering.py` -- CREATE -- Constrói 100+ features: comportamentais, demográficas, clínicas, temporais, geográficas, externas; aplica imputação e encoding
- [ ] `ml-engine/pipeline/train.py` -- CREATE -- Treina VotingClassifier(RandomForest + XGBoost), SMOTE, GridSearchCV leve, valida AUC-ROC≥0.85, serializa com joblib
- [ ] `ml-engine/pipeline/predict.py` -- CREATE -- Carrega modelo+preprocessor; transforma payload em vetor; retorna score 0-100 + risk_level + top_factors via feature importances
- [ ] `ml-engine/main.py` -- CREATE -- FastAPI app com `/health`, `POST /predict/score`, `POST /retrain` (manual trigger); carrega modelo na startup
- [ ] `ml-engine/scheduler.py` -- CREATE -- APScheduler CronTrigger toda segunda-feira às 02:00; chama pipeline de retrain; preserva modelo anterior se falhar
- [ ] `ml-engine/Dockerfile` -- CREATE -- Imagem Python 3.11-slim; expõe porta 8000
- [ ] `ml-engine/tests/test_pipeline.py` -- CREATE -- Testes unitários: feature_engineering com dados sintéticos, predict retorna 0-100, endpoint /health retorna 200

**Acceptance Criteria:**
- Given a valid appointment JSON, when `POST /predict/score` is called, then response is `{ score: int, risk_level: str, top_factors: list }` in < 200 ms.
- Given no model on disk, when the endpoint is called, then HTTP 503 is returned with `{ "error": "model_not_ready" }`.
- Given a PostgreSQL connection and ≥ 500 appointment rows, when `train.py` runs, then AUC-ROC ≥ 0.85 and model is saved to `models/`.
- Given a new week, when the cron job fires, then retrain runs, and if validation fails, the previous model is preserved.
- Given an appointment payload missing `weather_condition`, when predict is called, then median imputation is applied and score is returned without error.
- Given 100 synthetic samples (30% no-show), when SMOTE is applied, then class ratio is balanced before training.

## Design Notes

**Class Imbalance Strategy:** Estatisticamente, faltas representam ~15–30% dos agendamentos. Usamos duas camadas de defesa: (1) `SMOTE` (Synthetic Minority Oversampling Technique) do `imbalanced-learn` no conjunto de treino para balancear classes sinteticamente; (2) `class_weight='balanced'` em ambos os estimadores como fallback, caso SMOTE não seja aplicável (dataset muito pequeno). A métrica primária é **AUC-ROC** (não Accuracy), pois AUC é robusta a desequilíbrio de classes.

**Score Calibration:** O score 0–100 é derivado de `predict_proba[:, 1]` (probabilidade de no-show) multiplicada por 100 e arredondada. Thresholds: `score < 30` → low, `30 ≤ score < 65` → medium, `score ≥ 65` → high.

**Cold Start:** Na primeira execução sem dados reais, o pipeline gera 1.000 amostras sintéticas realistas para treinar um modelo baseline funcional. O modelo é marcado com `is_synthetic=True` nos metadados.

**Feature Importance → top_factors:** Usa `feature_importances_` do RandomForest (via VotingClassifier.estimators_[0]) para rankear as 5 features com maior peso para aquela predição específica, retornadas como lista de strings legíveis pela secretária.

## Verification

**Commands:**
- `cd ml-engine && pip install -r requirements.txt` -- expected: exit 0, sem conflitos
- `cd ml-engine && python -m pytest tests/ -v` -- expected: todos os testes passam
- `cd ml-engine && python pipeline/train.py --synthetic` -- expected: `models/ensemble_model.pkl` criado, AUC-ROC logado
- `cd ml-engine && uvicorn main:app --reload` + `curl -X POST http://localhost:8000/predict/score -H 'Content-Type: application/json' -d '{...}'` -- expected: JSON com score

**Manual checks (if no CLI):**
- Verificar que `ml-engine/models/ensemble_model.pkl` existe após treino
- Confirmar que `POST /predict/score` retorna `score` entre 0 e 100
- Confirmar que `GET /health` retorna `{ "status": "ok", "model_loaded": true }`
