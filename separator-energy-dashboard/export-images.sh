#!/usr/bin/env bash
# =============================================================================
# export-images.sh — Build and save Docker images to a .tar for Portainer
# Driftwood Dairy | Texas Automation Systems
#
# Run from: separator-energy-dashboard/
# Prereq:   Docker running, network "industry40" not required for build/save
#
# Usage:
#   ./export-images.sh
#
# Creates: ~/Downloads/separator-dashboard-images.tar (backend + frontend images)
# =============================================================================

set -e
cd "$(dirname "$0")"

echo "Building images with docker compose..."
docker compose build

# Compose names built images as {project}-{service}:latest (directory name = project)
PROJECT_NAME="${PWD##*/}"
BACKEND_IMAGE="${PROJECT_NAME}-separator-backend:latest"
FRONTEND_IMAGE="${PROJECT_NAME}-separator-frontend:latest"

if ! docker image inspect "$BACKEND_IMAGE" >/dev/null 2>&1; then
  echo "Expected image not found: $BACKEND_IMAGE"
  echo "Built images:"
  docker compose images
  exit 1
fi
if ! docker image inspect "$FRONTEND_IMAGE" >/dev/null 2>&1; then
  echo "Expected image not found: $FRONTEND_IMAGE"
  docker compose images
  exit 1
fi

# Tag with simple names so the Portainer stack can use them after load
echo "Tagging images..."
docker tag "$BACKEND_IMAGE"  separator-backend:latest
docker tag "$FRONTEND_IMAGE" separator-frontend:latest

# Save to user's Downloads folder
DOWNLOAD_DIR="${HOME}/Downloads"
mkdir -p "$DOWNLOAD_DIR"
OUTPUT_TAR="${DOWNLOAD_DIR}/separator-dashboard-images.tar"
echo "Saving to $OUTPUT_TAR..."
docker save -o "$OUTPUT_TAR" separator-backend:latest separator-frontend:latest

echo "Done. Created $(ls -lh "$OUTPUT_TAR" | awk '{print $5}') $OUTPUT_TAR"
echo ""
echo "On the server:"
echo "  1. Copy the tar from Downloads to the server (e.g. scp)."
echo "  2. docker load -i $OUTPUT_TAR"
echo "  3. In Portainer, create a Stack and use docker-compose.portainer.yml"
echo "     (or paste its contents). Ensure the industry40 network exists."
