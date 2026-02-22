# =============================================================================
# Frontend Dockerfile — Multi-stage: Node build + Nginx serve
# Separator Energy Dashboard | Driftwood Dairy | Texas Automation Systems
# =============================================================================

# --- Stage 1: Build the React app -------------------------------------------
FROM --platform=linux/amd64 node:20-alpine AS build

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# --- Stage 2: Serve with Nginx -----------------------------------------------
FROM --platform=linux/amd64 nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built React app from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
