# Deployment Guide

Complete guide for deploying to your server at `36.255.70.250`.

---

## 🔒 Security Group Configuration

### Required Ports (Inbound Rules)

| Port      | Protocol | Service             | Source    | Purpose                         |
| --------- | -------- | ------------------- | --------- | ------------------------------- |
| **22**    | TCP      | SSH                 | Your IP   | Server management               |
| **80**    | TCP      | HTTP                | 0.0.0.0/0 | Web traffic (redirect to HTTPS) |
| **443**   | TCP      | HTTPS               | 0.0.0.0/0 | Secure web traffic              |
| **3000**  | TCP      | API Server          | 0.0.0.0/0 | Main application API            |
| **9000**  | TCP      | MinIO API           | 0.0.0.0/0 | S3-compatible storage API       |
| **9001**  | TCP      | MinIO Console       | Your IP   | MinIO admin interface           |
| **16686** | TCP      | Jaeger UI           | Your IP   | Distributed tracing dashboard   |
| **5173**  | TCP      | Frontend (optional) | 0.0.0.0/0 | React dashboard (Milestone 4)   |

### Security Group Rules (AWS/Cloud Provider Format)

```
# SSH Access (restrict to your IP for security)
Type: SSH
Protocol: TCP
Port: 22
Source: YOUR_IP_ADDRESS/32
Description: SSH access for deployment

# HTTP (for Let's Encrypt and redirects)
Type: HTTP
Protocol: TCP
Port: 80
Source: 0.0.0.0/0
Description: HTTP traffic

# HTTPS (production traffic)
Type: HTTPS
Protocol: TCP
Port: 443
Source: 0.0.0.0/0
Description: HTTPS traffic

# API Server
Type: Custom TCP
Protocol: TCP
Port: 3000
Source: 0.0.0.0/0
Description: Main API server

# MinIO S3 API
Type: Custom TCP
Protocol: TCP
Port: 9000
Source: 0.0.0.0/0
Description: MinIO S3-compatible API

# MinIO Console (restrict to your IP)
Type: Custom TCP
Protocol: TCP
Port: 9001
Source: YOUR_IP_ADDRESS/32
Description: MinIO admin console

# Jaeger UI (restrict to your IP)
Type: Custom TCP
Protocol: TCP
Port: 16686
Source: YOUR_IP_ADDRESS/32
Description: Jaeger tracing dashboard

# Frontend (if implementing Milestone 4)
Type: Custom TCP
Protocol: TCP
Port: 5173
Source: 0.0.0.0/0
Description: React frontend dashboard
```

### Minimal Production Setup (Public Access)

If you want to minimize exposed ports:

```
Port 22  → SSH (Your IP only)
Port 80  → HTTP (All)
Port 443 → HTTPS (All)
Port 3000 → API (All)
```

Then use Nginx reverse proxy to route:

- `/` → Frontend
- `/api` → API Server
- `/minio` → MinIO (internal only)
- `/jaeger` → Jaeger (internal only)

---

## 🚀 Server Setup

### Step 1: Connect to Server

```bash
ssh -i somorpon-key.pem ubuntu@36.255.70.250
```

### Step 2: Install Prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Verify installations
docker --version
docker compose version

# Install Node.js 24 (for local testing)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js
node --version
npm --version

# Install Git
sudo apt install git -y

# Logout and login again for docker group to take effect
exit
```

### Step 3: Clone Repository

```bash
ssh -i somorpon-key.pem ubuntu@36.255.70.250

# Clone your repository
git clone https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon.git
cd cuet-micro-ops-hackthon-2025-somorpon

# Create .env file
cp .env.example .env
nano .env
```

### Step 4: Configure Environment

Edit `.env` file:

```env
# Server Configuration
NODE_ENV=production
PORT=3000

# S3 Configuration (MinIO)
S3_REGION=us-east-1
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=downloads
S3_FORCE_PATH_STYLE=true

# Observability (optional)
SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=http://delineate-jaeger:4318

# Rate Limiting
REQUEST_TIMEOUT_MS=30000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGINS=*

# Download Delay Simulation (production mode)
DOWNLOAD_DELAY_ENABLED=true
DOWNLOAD_DELAY_MIN_MS=10000
DOWNLOAD_DELAY_MAX_MS=120000
```

### Step 5: Start Services

```bash
# Start in production mode
docker compose -f docker/compose.prod.yml up -d

# Check logs
docker compose -f docker/compose.prod.yml logs -f

# Wait for "✅ Bucket downloads created!"
```

### Step 6: Verify Deployment

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test from outside
curl http://36.255.70.250:3000/health
```

---

## 🔄 CI/CD Setup with GitHub Actions

### Step 1: Add Server SSH Key to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to: **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:

| Secret Name       | Value                          |
| ----------------- | ------------------------------ |
| `SSH_PRIVATE_KEY` | Contents of `somorpon-key.pem` |
| `SSH_HOST`        | `36.255.70.250`                |
| `SSH_USER`        | `ubuntu`                       |

**To get SSH_PRIVATE_KEY value:**

```bash
cat somorpon-key.pem
# Copy the entire output including:
# -----BEGIN RSA PRIVATE KEY-----
# ...
# -----END RSA PRIVATE KEY-----
```

### Step 2: Update CI/CD Workflow

The workflow will now include automatic deployment to your server.

---

## 🌐 Access URLs

After deployment, access your services:

| Service           | URL                              | Credentials             |
| ----------------- | -------------------------------- | ----------------------- |
| **API Server**    | http://36.255.70.250:3000        | -                       |
| **API Docs**      | http://36.255.70.250:3000/docs   | -                       |
| **Health Check**  | http://36.255.70.250:3000/health | -                       |
| **MinIO Console** | http://36.255.70.250:9001        | minioadmin / minioadmin |
| **Jaeger UI**     | http://36.255.70.250:16686       | -                       |

---

## 🔧 Management Commands

### View Logs

```bash
ssh -i somorpon-key.pem ubuntu@36.255.70.250
cd cuet-micro-ops-hackthon-2025-somorpon
docker compose -f docker/compose.prod.yml logs -f
```

### Restart Services

```bash
docker compose -f docker/compose.prod.yml restart
```

### Update Deployment

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose -f docker/compose.prod.yml up -d --build
```

### Stop Services

```bash
docker compose -f docker/compose.prod.yml down
```

### Clean Restart

```bash
docker compose -f docker/compose.prod.yml down -v
docker compose -f docker/compose.prod.yml up -d --build
```

---

## 🔒 Security Hardening (Recommended)

### 1. Change MinIO Credentials

Edit `.env`:

```env
S3_ACCESS_KEY_ID=your_secure_access_key
S3_SECRET_ACCESS_KEY=your_secure_secret_key_min_8_chars
```

Restart services:

```bash
docker compose -f docker/compose.prod.yml down
docker compose -f docker/compose.prod.yml up -d
```

### 2. Set Up Firewall (UFW)

```bash
# Enable UFW
sudo ufw enable

# Allow SSH (IMPORTANT: Do this first!)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow API
sudo ufw allow 3000/tcp

# Allow MinIO API
sudo ufw allow 9000/tcp

# Allow MinIO Console (from your IP only)
sudo ufw allow from YOUR_IP_ADDRESS to any port 9001

# Allow Jaeger (from your IP only)
sudo ufw allow from YOUR_IP_ADDRESS to any port 16686

# Check status
sudo ufw status
```

### 3. Set Up Nginx Reverse Proxy (Optional)

```bash
# Install Nginx
sudo apt install nginx -y

# Create configuration
sudo nano /etc/nginx/sites-available/delineate
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name 36.255.70.250;

    # API endpoints
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000/health;
    }

    # API docs
    location /docs {
        proxy_pass http://localhost:3000/docs;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/delineate /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Set Up SSL with Let's Encrypt (Optional)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is set up automatically
```

---

## 📊 Monitoring

### Check Service Status

```bash
docker compose -f docker/compose.prod.yml ps
```

### Check Resource Usage

```bash
docker stats
```

### Check Disk Space

```bash
df -h
```

### Check Logs

```bash
# All services
docker compose -f docker/compose.prod.yml logs --tail=100

# Specific service
docker compose -f docker/compose.prod.yml logs -f delineate-app
```

---

## 🐛 Troubleshooting

### Services Won't Start

```bash
# Check Docker status
sudo systemctl status docker

# Check logs
docker compose -f docker/compose.prod.yml logs

# Clean restart
docker compose -f docker/compose.prod.yml down -v
docker system prune -a
docker compose -f docker/compose.prod.yml up -d --build
```

### Port Already in Use

```bash
# Find process using port
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

### Out of Disk Space

```bash
# Clean Docker
docker system prune -a --volumes

# Check disk usage
du -sh /var/lib/docker
```

---

## 🎯 Production Checklist

- [ ] Security group configured with required ports
- [ ] Server prerequisites installed (Docker, Docker Compose, Git)
- [ ] Repository cloned to server
- [ ] `.env` file configured
- [ ] Services started successfully
- [ ] Health endpoint returns "ok"
- [ ] MinIO console accessible
- [ ] Jaeger UI accessible
- [ ] GitHub secrets configured for CI/CD
- [ ] Firewall (UFW) configured
- [ ] MinIO credentials changed from defaults
- [ ] Nginx reverse proxy set up (optional)
- [ ] SSL certificate installed (optional)

---

## 📞 Quick Reference

**Server:** `36.255.70.250`  
**SSH:** `ssh -i somorpon-key.pem ubuntu@36.255.70.250`  
**Project Path:** `/home/ubuntu/cuet-micro-ops-hackthon-2025-somorpon`  
**Logs:** `docker compose -f docker/compose.prod.yml logs -f`  
**Restart:** `docker compose -f docker/compose.prod.yml restart`

---

**Your deployment is ready! 🚀**
