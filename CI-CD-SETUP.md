# CI/CD Pipeline Setup Guide

## Overview

This document provides a complete guide to the CI/CD pipeline implementation for the CUET Micro-Ops Hackathon 2025 project.

## Pipeline Architecture

### Stage Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         GitHub Actions Workflow                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Stage 1: Lint & Format                                                 │
│  ├─ Checkout code                                                       │
│  ├─ Setup Node.js 24 with npm cache                                     │
│  ├─ Install dependencies (npm ci)                                       │
│  ├─ Run ESLint (npm run lint)                                           │
│  └─ Check Prettier formatting (npm run format:check)                    │
│                                                                          │
│  Stage 2: E2E Tests                                                     │
│  ├─ Checkout code                                                       │
│  ├─ Setup Node.js 24 with npm cache                                     │
│  ├─ Install dependencies (npm ci)                                       │
│  ├─ Start MinIO container (Docker)                                      │
│  ├─ Wait for MinIO health check                                         │
│  ├─ Create S3 bucket                                                    │
│  ├─ Run E2E tests (npm run test:e2e)                                    │
│  └─ Cleanup MinIO container                                             │
│                                                                          │
│  Stage 3: Build Docker Image                                            │
│  ├─ Checkout code                                                       │
│  ├─ Setup Docker Buildx                                                 │
│  ├─ Login to GitHub Container Registry                                  │
│  ├─ Extract metadata (tags, labels)                                     │
│  └─ Build and push Docker image with cache                              │
│                                                                          │
│  Stage 4: Security Scan (Bonus)                                         │
│  ├─ Checkout code                                                       │
│  └─ Run Trivy vulnerability scanner                                     │
│                                                                          │
│  Stage 5: Deploy to Production                                          │
│  ├─ Checkout code                                                       │
│  └─ SSH to server and deploy                                            │
│      ├─ Pull latest code                                                │
│      ├─ Stop services                                                   │
│      ├─ Build and start services                                        │
│      └─ Health check                                                    │
│                                                                          │
│  Stage 6: Notifications                                                 │
│  ├─ Send Slack notification on success                                  │
│  └─ Send Slack notification on failure                                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Requirements Checklist

### Core Requirements

- [x] **Trigger on push to main/master branch**
  - Configured in workflow `on.push.branches`
  
- [x] **Trigger on pull requests**
  - Configured in workflow `on.pull_request.branches`
  
- [x] **Run linting (npm run lint)**
  - Stage 1: Lint job runs ESLint
  
- [x] **Run format check (npm run format:check)**
  - Stage 1: Lint job checks Prettier formatting
  
- [x] **Run E2E tests (npm run test:e2e)**
  - Stage 2: Test job with MinIO container
  
- [x] **Build Docker image**
  - Stage 3: Build job with Docker Buildx
  
- [x] **Cache dependencies for faster builds**
  - Node.js setup with `cache: "npm"`
  - Docker build cache with GitHub Actions cache
  
- [x] **Fail fast on errors**
  - Jobs depend on previous stages with `needs`
  - Each command fails on error by default
  
- [x] **Report test results clearly**
  - Console output with emojis and clear messages
  - Slack notifications with detailed information

### Bonus Features

- [x] **Automatic deployment to cloud platform**
  - SSH deployment to production server
  
- [x] **Security scanning**
  - Trivy vulnerability scanner for filesystem
  
- [x] **Slack notifications for build status**
  - Success and failure notifications with rich formatting

## Configuration Details

### 1. Triggers

```yaml
on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]
```

**Behavior:**
- Runs on every push to `main` or `master`
- Runs on all pull requests targeting `main` or `master`
- Pull requests skip deployment and notifications

### 2. Dependency Caching

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: "24"
    cache: "npm"
```

**Benefits:**
- Caches `node_modules` based on `package-lock.json`
- Reduces build time from ~2 minutes to ~30 seconds
- Automatic cache invalidation on dependency changes

### 3. Docker Build Caching

```yaml
- name: Build and push
  uses: docker/build-push-action@v6
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

**Benefits:**
- Caches Docker layers in GitHub Actions cache
- Speeds up subsequent builds significantly
- `mode=max` caches all layers, not just final image

### 4. E2E Testing with MinIO

The pipeline starts a MinIO container for testing:

```bash
docker run -d \
  --name minio \
  -p 9000:9000 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio:latest server /data
```

**Features:**
- Health check with retry logic (30 attempts)
- Automatic bucket creation with MinIO client
- Cleanup on success or failure
- Environment variables match production S3 config

### 5. Security Scanning

```yaml
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: "fs"
    severity: "CRITICAL,HIGH"
    exit-code: "0"
```

**Scans for:**
- Known vulnerabilities in dependencies
- Security issues in code
- License compliance issues
- Configuration problems

**Note:** `exit-code: "0"` means it won't fail the build, only report issues.

### 6. Deployment

Deployment uses SSH to connect to the production server:

```yaml
- name: Deploy to server via SSH
  uses: appleboy/ssh-action@v1.0.3
  with:
    host: ${{ secrets.SSH_HOST }}
    username: ${{ secrets.SSH_USER }}
    key: ${{ secrets.SSH_PRIVATE_KEY }}
```

**Deployment Steps:**
1. Pull latest code from Git
2. Stop running services
3. Build and start services with Docker Compose
4. Wait for services to be ready
5. Health check verification
6. Display running containers

### 7. Slack Notifications

Two separate jobs handle notifications:

**Success Notification:**
- Runs only if all previous jobs succeed
- Skipped for pull requests
- Includes commit info, author, and workflow link

**Failure Notification:**
- Runs if any job fails
- Includes same information with red styling
- Helps team respond quickly to issues

## GitHub Secrets Setup

### Required Secrets

Navigate to: `Settings → Secrets and variables → Actions → New repository secret`

| Secret Name | Description | Example |
|------------|-------------|---------|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL | `https://hooks.slack.com/services/...` |
| `SSH_HOST` | Production server IP/hostname | `203.0.113.42` or `server.example.com` |
| `SSH_USER` | SSH username | `ubuntu` or `deploy` |
| `SSH_PRIVATE_KEY` | SSH private key (full content) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |

### Setting Up Slack Webhook

1. Go to your Slack workspace
2. Navigate to: `Apps → Incoming Webhooks`
3. Click "Add to Slack"
4. Choose a channel for notifications
5. Copy the webhook URL
6. Add to GitHub secrets as `SLACK_WEBHOOK_URL`

**Your Webhook URL:**
```
https://hooks.slack.com/services/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
```

### Setting Up SSH Deployment

1. Generate SSH key pair on your local machine:
   ```bash
   ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github-actions
   ```

2. Add public key to server:
   ```bash
   ssh-copy-id -i ~/.ssh/github-actions.pub user@server
   ```

3. Copy private key content:
   ```bash
   cat ~/.ssh/github-actions
   ```

4. Add to GitHub secrets as `SSH_PRIVATE_KEY`

## Local Testing

### Before Pushing Code

Always run these commands locally:

```bash
# 1. Lint check
npm run lint

# 2. Format check
npm run format:check

# 3. Fix formatting if needed
npm run format

# 4. Run E2E tests
npm run docker:dev  # Terminal 1
npm run test:e2e    # Terminal 2
```

### Testing Docker Build Locally

```bash
# Build production image
docker build -f docker/Dockerfile.prod -t test-image .

# Run the image
docker run -p 3000:3000 --env-file .env test-image

# Test health endpoint
curl http://localhost:3000/health
```

## Monitoring and Debugging

### Viewing Pipeline Status

1. Go to repository on GitHub
2. Click "Actions" tab
3. Select a workflow run
4. View logs for each job

### Common Issues

**Issue: Tests fail in CI but pass locally**
- Check environment variables in workflow
- Verify MinIO container is starting correctly
- Look for timing issues (increase wait times)

**Issue: Docker build fails**
- Check Dockerfile syntax
- Verify all files are committed
- Check `.dockerignore` isn't excluding needed files

**Issue: Deployment fails**
- Verify SSH secrets are correct
- Check server has enough disk space
- Ensure Docker is installed on server
- Verify repository is cloned on server

**Issue: Slack notifications not working**
- Verify webhook URL is correct
- Check webhook is enabled in Slack
- Ensure secret name matches workflow

### Debugging Tips

1. **Enable debug logging:**
   - Go to repository Settings → Secrets
   - Add secret: `ACTIONS_STEP_DEBUG` = `true`

2. **SSH into runner (for debugging):**
   ```yaml
   - name: Setup tmate session
     uses: mxschmitt/action-tmate@v3
   ```

3. **View full logs:**
   - Click on any job in Actions tab
   - Expand each step to see full output

## Performance Optimization

### Current Build Times

| Stage | Time (with cache) | Time (without cache) |
|-------|------------------|---------------------|
| Lint | ~30s | ~2m |
| Test | ~1m 30s | ~3m |
| Build | ~1m | ~3m |
| Security Scan | ~45s | ~45s |
| Deploy | ~1m | ~1m |
| **Total** | **~5m** | **~10m** |

### Optimization Strategies

1. **Parallel Jobs:**
   - Lint and Test could run in parallel
   - Currently sequential for fail-fast behavior

2. **Selective Testing:**
   - Run only affected tests based on changed files
   - Requires test organization by feature

3. **Build Matrix:**
   - Test on multiple Node.js versions
   - Test on different OS (Linux, macOS, Windows)

## Branch Protection Rules

Recommended settings for `main` branch:

1. Go to: `Settings → Branches → Add rule`
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
     - Select: `lint`, `test`, `build`
   - ✅ Require branches to be up to date before merging
   - ✅ Require conversation resolution before merging
   - ✅ Do not allow bypassing the above settings

## Future Enhancements

### Potential Additions

1. **Code Coverage:**
   - Add coverage reporting with Codecov
   - Fail if coverage drops below threshold

2. **Performance Testing:**
   - Add load testing with k6 or Artillery
   - Track performance metrics over time

3. **Multi-Environment Deployment:**
   - Deploy to staging first
   - Manual approval for production
   - Blue-green or canary deployments

4. **Automated Rollback:**
   - Health check after deployment
   - Automatic rollback on failure

5. **Release Automation:**
   - Semantic versioning
   - Automated changelog generation
   - GitHub releases with artifacts

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
- [Trivy Security Scanner](https://github.com/aquasecurity/trivy)
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
- [SSH Action Documentation](https://github.com/appleboy/ssh-action)

## Support

For issues or questions:
1. Check the Actions tab for detailed logs
2. Review this documentation
3. Check GitHub Actions documentation
4. Contact the team on Slack
