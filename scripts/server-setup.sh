#!/bin/bash

# Server Setup Script for CUET Micro-Ops Hackathon 2025
# Run this on your server: ubuntu@36.255.70.250

set -e

echo "🚀 Starting server setup..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker ubuntu
    rm get-docker.sh
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# Install Docker Compose plugin
echo "🐳 Installing Docker Compose..."
if ! docker compose version &> /dev/null; then
    sudo apt install docker-compose-plugin -y
    echo "✅ Docker Compose installed"
else
    echo "✅ Docker Compose already installed"
fi

# Install Node.js 24
echo "📦 Installing Node.js 24..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 24 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
    sudo apt install -y nodejs
    echo "✅ Node.js installed"
else
    echo "✅ Node.js 24+ already installed"
fi

# Install Git
echo "📦 Installing Git..."
if ! command -v git &> /dev/null; then
    sudo apt install git -y
    echo "✅ Git installed"
else
    echo "✅ Git already installed"
fi

# Install UFW (firewall)
echo "🔒 Setting up firewall..."
if ! command -v ufw &> /dev/null; then
    sudo apt install ufw -y
fi

# Configure UFW
sudo ufw --force enable
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw allow 3000/tcp comment 'API Server'
sudo ufw allow 9000/tcp comment 'MinIO API'
sudo ufw allow 9001/tcp comment 'MinIO Console'
sudo ufw allow 16686/tcp comment 'Jaeger UI'
echo "✅ Firewall configured"

# Clone repository if not exists
if [ ! -d "cuet-micro-ops-hackthon-2025-somorpon" ]; then
    echo "📥 Cloning repository..."
    git clone https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon.git
    cd cuet-micro-ops-hackthon-2025-somorpon
else
    echo "✅ Repository already exists"
    cd cuet-micro-ops-hackthon-2025-somorpon
    git pull origin main
fi

# Create .env file if not exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration"
else
    echo "✅ .env file already exists"
fi

# Print versions
echo ""
echo "📊 Installed versions:"
echo "Docker: $(docker --version)"
echo "Docker Compose: $(docker compose version)"
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo "Git: $(git --version)"

echo ""
echo "✅ Server setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file: nano .env"
echo "2. Start services: docker compose -f docker/compose.prod.yml up -d"
echo "3. Check logs: docker compose -f docker/compose.prod.yml logs -f"
echo "4. Test health: curl http://localhost:3000/health"
echo ""
echo "⚠️  IMPORTANT: You need to logout and login again for Docker group to take effect!"
echo "   Run: exit"
echo "   Then: ssh -i somorpon-key.pem ubuntu@36.255.70.250"
