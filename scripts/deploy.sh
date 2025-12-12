#!/bin/bash

# Deployment script for production server
# Usage: ./scripts/deploy.sh

set -e

PROJECT_DIR="$HOME/cuet-micro-ops-hackthon-2025-somorpon"

echo "🚀 Starting deployment..."

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ Project directory not found at $PROJECT_DIR"
  echo ""
  echo "Please clone the repository first:"
  echo "git clone https://github.com/YOUR_USERNAME/cuet-micro-ops-hackthon-2025-somorpon.git $PROJECT_DIR"
  exit 1
fi

# Navigate to project directory
cd "$PROJECT_DIR"
echo "📂 Working directory: $(pwd)"

# Check if it's a git repository
if [ ! -d ".git" ]; then
  echo "⚠️  Not a git repository. Initializing..."
  git init
  git remote add origin https://github.com/YOUR_USERNAME/cuet-micro-ops-hackthon-2025-somorpon.git
fi

echo "📥 Pulling latest changes..."
git fetch origin main
git reset --hard origin/main

echo "🐳 Stopping existing services..."
docker compose -f docker/compose.prod.yml down || true

echo "🧹 Cleaning up old images..."
docker system prune -f

echo "🔨 Building and starting services..."
docker compose -f docker/compose.prod.yml up -d --build

echo "⏳ Waiting for services to be ready..."
sleep 30

echo "✅ Checking health endpoint..."
for i in {1..10}; do
  if curl -f http://localhost:3000/health; then
    echo ""
    echo "🎉 Deployment successful!"
    echo ""
    echo "📊 Service status:"
    docker compose -f docker/compose.prod.yml ps
    echo ""
    echo "🌐 Access your services:"
    echo "  - API: http://localhost:3000"
    echo "  - Health: http://localhost:3000/health"
    echo "  - Docs: http://localhost:3000/docs"
    exit 0
  fi
  echo "Waiting for service... ($i/10)"
  sleep 3
done

echo ""
echo "❌ Health check failed"
echo ""
echo "📋 Container logs:"
docker compose -f docker/compose.prod.yml logs --tail=50
echo ""
echo "💡 Troubleshooting tips:"
echo "  1. Check logs: docker compose -f docker/compose.prod.yml logs -f"
echo "  2. Check status: docker compose -f docker/compose.prod.yml ps"
echo "  3. Restart: docker compose -f docker/compose.prod.yml restart"
exit 1
