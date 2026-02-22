# =============================================================================
# Dockerfile — Separator Energy Cost Dashboard (Single Image)
# Driftwood Dairy | El Monte, CA | Texas Automation Systems
#
# Stage 1: Build React frontend with Node
# Stage 2: Python + FastAPI serves both API and static files
#
# Dashboard: http://<host>:3030
# =============================================================================

# --- Stage 1: Build the React frontend --------------------------------------
FROM --platform=linux/amd64 node:20-alpine AS frontend-build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# --- Stage 2: Python runtime with API + static files ------------------------
FROM --platform=linux/amd64 python:3.11-slim

WORKDIR /app

# Install curl for Docker healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/ .

# Copy React build output into /app/static
COPY --from=frontend-build /app/dist /app/static

EXPOSE 3030

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3030"]
