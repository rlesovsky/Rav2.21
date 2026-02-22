# Docker Deployment — Separator Energy Cost Dashboard

**Driftwood Dairy | El Monte, CA | Texas Automation Systems**

This document describes how to run the dashboard with Docker and Docker Compose.

---

## Export images to .tar (for Portainer on a server without build)

If you want to build once (e.g. on your laptop) and deploy on a server that doesn’t have the source code (e.g. via Portainer), you can export the images to a single `.tar` file and load it on the server.

### Option 1: Get the tar from GitHub Actions (no local Docker)

1. Push your code to GitHub (branch `main`).
2. In the repo go to **Actions** → workflow **"Build dashboard images"**.
3. Click **Run workflow** to start a build (or it runs automatically on push when `separator-energy-dashboard/` changes).
4. When the run finishes, open that run and scroll to **Artifacts**.
5. Download **separator-dashboard-images** (GitHub may give you a .zip; unzip it to get `separator-dashboard-images.tar`).
6. Copy the `.tar` to your production server, then load and deploy (see "Load and run on the server" below).

### Option 2: Build and save locally (machine with Docker and the repo)

```bash
cd separator-energy-dashboard
chmod +x export-images.sh
./export-images.sh
```

This script runs `docker compose build`, tags the images, and saves them to **~/Downloads/separator-dashboard-images.tar**. Copy that tar to the server (e.g. `scp`).

### Load and run on the server (Portainer or CLI)

**Option A — Portainer**

1. On the server, load the images (once) in a shell or via Portainer “Images” → “Import” if it supports tar:
   ```bash
   docker load -i /tmp/separator-dashboard-images.tar
   ```
2. Ensure the **industry40** network exists:
   ```bash
   docker network create industry40
   ```
3. In Portainer: **Stacks** → **Add stack**.
4. Paste the contents of **docker-compose.portainer.yml** (from this repo). It uses `image: separator-backend:latest` and `image: separator-frontend:latest` (no `build`).
5. Set environment variables in the stack (or use “Load from .env”) — at least **TIMEBASE_HOST** if the historian isn’t on the same Docker network.
6. Deploy. The dashboard will be at http://&lt;server&gt;:3000 (or your **DASHBOARD_PORT**).

**Option B — CLI on the server**

```bash
docker load -i /tmp/separator-dashboard-images.tar
docker network create industry40  # if not exists
cd /path/to/repo/separator-energy-dashboard
# Use the Portainer compose (uses pre-loaded images)
docker compose -f docker-compose.portainer.yml up -d
```

### Files used for this workflow

| File | Purpose |
|------|---------|
| **export-images.sh** | Builds images, tags them, saves to `separator-dashboard-images.tar` |
| **docker-compose.portainer.yml** | Compose file that uses pre-loaded images (no `build`); use this in Portainer after loading the tar |

---

## Prerequisites

- **Docker** and **Docker Compose** (v2+)
- **External network** `industry40` (used by the stack; create if it doesn’t exist)

Create the network once:

```bash
docker network create industry40
```

---

## Quick start

1. **Go to the dashboard directory**

   ```bash
   cd separator-energy-dashboard
   ```

2. **Configure environment (optional)**

   Copy the example env file and edit as needed:

   ```bash
   cp .env.example .env
   # Edit .env — at minimum set TIMEBASE_HOST if the historian is not named "timebase-historian"
   ```

3. **Build and run**

   ```bash
   docker compose up -d --build
   ```

4. **Open the dashboard**

   - **URL:** http://&lt;host&gt;:3000  
   - Port 3000 is the default; override with `DASHBOARD_PORT` in `.env` if needed.

---

## Architecture (Docker)

| Service              | Image build              | Port (host) | Port (container) | Role                          |
|----------------------|--------------------------|-------------|------------------|-------------------------------|
| **separator-backend**  | `backend/Dockerfile`     | —           | 8000 (expose only) | FastAPI app; not published to host |
| **separator-frontend** | `frontend/Dockerfile`    | 3000        | 80               | Nginx serving Vite build; proxies `/api` to backend |

- Frontend container talks to the backend over the Docker network (`http://separator-backend:8000`).
- Only the frontend port (e.g. 3000) is published; backend is internal.

---

## Docker files reference

| File | Purpose |
|------|---------|
| **docker-compose.yml** | Defines `separator-backend` and `separator-frontend`, env vars, health check, `industry40` network |
| **.env.example** | Example environment variables; copy to `.env` and adjust |
| **backend/Dockerfile** | Python 3.11 slim image; installs deps, runs `uvicorn main:app` on port 8000 |
| **frontend/Dockerfile** | Multi-stage: Node 20 Alpine build (Vite), then Nginx Alpine to serve `dist/` and proxy `/api` |
| **frontend/nginx.conf** | Nginx config: `/api/` and `/health` → backend; `/` → React SPA (try_files) |

---

## Environment variables

All of these can be set in a `.env` file in `separator-energy-dashboard/` or in the Portainer stack.

| Variable | Default | Description |
|----------|---------|-------------|
| **TIMEBASE_HOST** | timebase-historian | TimeBase historian hostname or IP (e.g. `192.254.155.2` if not on Docker network) |
| **TIMEBASE_PORT** | 4511 | TimeBase REST API port |
| **TIMEBASE_DATASET** | Driftwood Historian | Dataset name in TimeBase |
| **DASHBOARD_PORT** | 3000 | Host port for the dashboard (browser access) |
| **FACILITY_TIMEZONE** | US/Pacific | Timezone for shifts and TOU |
| **VOLTAGE** | 460 | 3-phase voltage (V) |
| **POWER_FACTOR** | 0.88 | Motor power factor |
| **DEFAULT_RATE_PER_KWH** | 0.30 | Flat fallback rate ($/kWh) |
| **TOU_SUMMER_*** / **TOU_WINTER_*** | (see .env.example) | SCE TOU-GS-2 rate overrides |
| **LOOKBACK_DAYS** | 7 | Days of history for summary/daily |
| **MIN_GOOD_QUALITY** | 192 | TimeBase quality threshold |
| **CORS_ORIGINS** | localhost:3000,5173 | Allowed CORS origins (comma-separated) |
| **TZ** | America/Los_Angeles | Container timezone |

See **.env.example** for the full list and default values.

---

## Portainer

1. In Portainer, create a new **Stack**.
2. Paste the contents of **docker-compose.yml** (or point the stack to the repo/file).
3. Set environment variables in the stack UI, or add a `.env` file.
4. Deploy; the dashboard will be at http://&lt;host&gt;:3000 (or your `DASHBOARD_PORT`).

**Note:** The stack expects the **industry40** network to already exist. Create it in Portainer (Networks → Add network → name: `industry40`) or via CLI before deploying.

---

## Ports and production

- **3000** — Dashboard (default). Ensure it doesn’t conflict with other stacks (e.g. Grafana 3002, Uptime Kuma 3001).
- **8000** — Backend is **not** exposed to the host; only the frontend container connects to it.

---

## Health check

The backend service has a health check:

- **Command:** `curl -f http://localhost:8000/health`
- **Interval:** 30s | **Timeout:** 10s | **Retries:** 3 | **Start period:** 15s

The frontend container starts only after the backend is healthy (`depends_on: condition: service_healthy`).

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Frontend can’t load data | Backend must be reachable from the frontend container. Ensure both are on the `industry40` network and backend health check is passing. |
| “Network industry40 not found” | Run `docker network create industry40` (or create it in Portainer). |
| TimeBase connection errors | Set **TIMEBASE_HOST** (and **TIMEBASE_PORT** if different) so the backend can reach the historian. If the historian is on the host network, use the host’s IP or a resolvable name. |
| Wrong port for dashboard | Set **DASHBOARD_PORT** in `.env` (e.g. `DASHBOARD_PORT=8080`) and restart the stack. |

---

## Rebuild and restart

After code or config changes:

```bash
docker compose up -d --build
```

To view logs:

```bash
docker compose logs -f
# or per service:
docker compose logs -f separator-backend
docker compose logs -f separator-frontend
```
