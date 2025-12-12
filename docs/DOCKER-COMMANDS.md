# Docker Commands Quick Reference

Essential Docker commands for managing the hackathon project.

---

## 🚀 Starting Services

### Development Mode (with hot reload)

```bash
# Start in foreground (see logs)
docker compose -f docker/compose.dev.yml up --build

# Start in background (detached)
docker compose -f docker/compose.dev.yml up --build -d
```

### Production Mode

```bash
# Start in background
docker compose -f docker/compose.prod.yml up --build -d
```

---

## 🛑 Stopping Services

### Stop containers (keep data)

```bash
docker compose -f docker/compose.dev.yml down
```

### Stop and remove volumes (clean slate)

```bash
docker compose -f docker/compose.dev.yml down -v
```

### Stop specific service

```bash
docker compose -f docker/compose.dev.yml stop delineate-app
```

---

## 📋 Viewing Logs

### All services

```bash
docker compose -f docker/compose.dev.yml logs -f
```

### Specific service

```bash
docker compose -f docker/compose.dev.yml logs -f delineate-app
docker compose -f docker/compose.dev.yml logs -f minio
docker compose -f docker/compose.dev.yml logs -f delineate-jaeger
```

### Last 100 lines

```bash
docker compose -f docker/compose.dev.yml logs --tail=100 delineate-app
```

---

## 🔍 Inspecting Services

### List running containers

```bash
docker compose -f docker/compose.dev.yml ps
```

### Check container health

```bash
docker ps
```

### Inspect specific container

```bash
docker inspect delineate-app
docker inspect delineate-minio
```

---

## 🔧 Debugging

### Execute command in running container

```bash
# Open shell in app container
docker exec -it delineate-app sh

# Check network connectivity
docker exec delineate-app ping minio
docker exec delineate-app curl http://minio:9000/minio/health/live
```

### View container resource usage

```bash
docker stats
```

### Restart specific service

```bash
docker compose -f docker/compose.dev.yml restart delineate-app
```

---

## 🧹 Cleanup

### Remove stopped containers

```bash
docker compose -f docker/compose.dev.yml rm
```

### Remove all unused containers, networks, images

```bash
docker system prune -a
```

### Remove volumes (WARNING: deletes data)

```bash
docker volume prune
```

### Complete cleanup (nuclear option)

```bash
docker compose -f docker/compose.dev.yml down -v
docker system prune -a --volumes
```

---

## 🔄 Rebuilding

### Rebuild specific service

```bash
docker compose -f docker/compose.dev.yml build delineate-app
docker compose -f docker/compose.dev.yml up -d delineate-app
```

### Force rebuild (no cache)

```bash
docker compose -f docker/compose.dev.yml build --no-cache
docker compose -f docker/compose.dev.yml up -d
```

---

## 🌐 Accessing Services

| Service       | URL                        | Credentials             |
| ------------- | -------------------------- | ----------------------- |
| API Server    | http://localhost:3000      | -                       |
| API Docs      | http://localhost:3000/docs | -                       |
| MinIO Console | http://localhost:9001      | minioadmin / minioadmin |
| MinIO API     | http://localhost:9000      | -                       |
| Jaeger UI     | http://localhost:16686     | -                       |

---

## 🐛 Common Issues

### Port Already in Use

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port in .env
PORT=3001
```

### MinIO Health Check Failing

```bash
# Check MinIO logs
docker logs delineate-minio

# Manually test health endpoint
docker exec delineate-minio curl http://localhost:9000/minio/health/live

# Restart MinIO
docker compose -f docker/compose.dev.yml restart minio
```

### Container Won't Start

```bash
# Check logs for errors
docker compose -f docker/compose.dev.yml logs <service-name>

# Remove and recreate
docker compose -f docker/compose.dev.yml down -v
docker compose -f docker/compose.dev.yml up --build
```

---

## 📦 Volume Management

### List volumes

```bash
docker volume ls
```

### Inspect volume

```bash
docker volume inspect delineate_minio_data
```

### Backup MinIO data

```bash
docker run --rm -v delineate_minio_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/minio-backup.tar.gz /data
```

### Restore MinIO data

```bash
docker run --rm -v delineate_minio_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/minio-backup.tar.gz -C /
```

---

## 🎯 Quick Workflow

### Fresh Start

```bash
# 1. Clean everything
docker compose -f docker/compose.dev.yml down -v

# 2. Start services
docker compose -f docker/compose.dev.yml up --build

# 3. Wait for "✅ Bucket downloads created successfully!"

# 4. Test health endpoint (in new terminal)
curl http://localhost:3000/health
```

### Development Workflow

```bash
# 1. Start in background
docker compose -f docker/compose.dev.yml up -d

# 2. Watch logs
docker compose -f docker/compose.dev.yml logs -f delineate-app

# 3. Make code changes (hot reload enabled)

# 4. Test changes
curl http://localhost:3000/health

# 5. Stop when done
docker compose -f docker/compose.dev.yml down
```

---

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MinIO Documentation](https://min.io/docs/minio/linux/index.html)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
