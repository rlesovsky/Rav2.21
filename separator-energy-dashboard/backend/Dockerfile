# =============================================================================
# Backend Dockerfile — Python 3.11 + FastAPI
# Separator Energy Dashboard | Driftwood Dairy | Texas Automation Systems
# =============================================================================
FROM --platform=linux/amd64 python:3.11-slim

WORKDIR /app

# Install curl for Docker healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
