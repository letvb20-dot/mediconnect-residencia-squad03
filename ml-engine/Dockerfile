FROM python:3.11-slim

# Metadados
LABEL maintainer="Squad 03 - RiseUP Residência"
LABEL description="MediConnect ML Engine — Score de Comportamento do Paciente"

# Variáveis de ambiente
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    MODEL_DIR=/app/models \
    LOG_LEVEL=INFO

# Diretório de trabalho
WORKDIR /app

# Dependências do sistema (para psycopg2 e compilações C)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependências Python primeiro (cache de layer)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copiar código
COPY . .

# Criar diretório de modelos
RUN mkdir -p /app/models

# Porta exposta
EXPOSE ${PORT}

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:${PORT}/health').raise_for_status()"

# Entrypoint
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 2"]
