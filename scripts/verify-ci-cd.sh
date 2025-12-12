#!/bin/bash

# CI/CD Verification Script
# This script verifies that all CI/CD components are properly configured

set -e

echo "🔍 CI/CD Pipeline Verification"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✅${NC} $1 exists"
        return 0
    else
        echo -e "${RED}❌${NC} $1 missing"
        return 1
    fi
}

check_content() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} $1 contains '$2'"
        return 0
    else
        echo -e "${RED}❌${NC} $1 missing '$2'"
        return 1
    fi
}

# Track failures
FAILURES=0

echo "📁 Checking CI/CD Files..."
echo ""

# Check workflow file
check_file ".github/workflows/ci.yml" || ((FAILURES++))

# Check documentation
check_file "CI-CD-SETUP.md" || ((FAILURES++))
check_file "GITHUB-SECRETS-SETUP.md" || ((FAILURES++))
check_file "../docs/CI-CD-COMPLETE.md" || ((FAILURES++))

echo ""
echo "🔧 Checking Workflow Configuration..."
echo ""

# Check workflow stages
check_content ".github/workflows/ci.yml" "lint:" || ((FAILURES++))
check_content ".github/workflows/ci.yml" "test:" || ((FAILURES++))
check_content ".github/workflows/ci.yml" "build:" || ((FAILURES++))
check_content ".github/workflows/ci.yml" "security-scan:" || ((FAILURES++))
check_content ".github/workflows/ci.yml" "deploy:" || ((FAILURES++))
check_content ".github/workflows/ci.yml" "notify-success:" || ((FAILURES++))
check_content ".github/workflows/ci.yml" "notify-failure:" || ((FAILURES++))

echo ""
echo "📋 Checking Required Features..."
echo ""

# Check triggers
check_content ".github/workflows/ci.yml" "push:" || ((FAILURES++))
check_content ".github/workflows/ci.yml" "pull_request:" || ((FAILURES++))

# Check caching
check_content ".github/workflows/ci.yml" "cache: \"npm\"" || ((FAILURES++))
check_content ".github/workflows/ci.yml" "cache-from: type=gha" || ((FAILURES++))

# Check MinIO
check_content ".github/workflows/ci.yml" "minio/minio" || ((FAILURES++))

# Check Slack
check_content ".github/workflows/ci.yml" "SLACK_WEBHOOK_URL" || ((FAILURES++))

# Check SSH deployment
check_content ".github/workflows/ci.yml" "SSH_HOST" || ((FAILURES++))

echo ""
echo "📚 Checking Documentation..."
echo ""

# Check README
check_content "README.md" "CI/CD" || ((FAILURES++))
check_content "README.md" "badge" || ((FAILURES++))
check_content "README.md" "Running Tests Locally" || ((FAILURES++))

# Check CI-CD-SETUP.md
check_content "CI-CD-SETUP.md" "Pipeline Architecture" || ((FAILURES++))
check_content "CI-CD-SETUP.md" "GitHub Secrets Setup" || ((FAILURES++))

echo ""
echo "🧪 Checking Package Scripts..."
echo ""

# Check package.json scripts
check_content "package.json" "\"lint\":" || ((FAILURES++))
check_content "package.json" "\"format:check\":" || ((FAILURES++))
check_content "package.json" "\"test:e2e\":" || ((FAILURES++))

echo ""
echo "================================"
echo ""

if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✅ All CI/CD components verified successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Configure GitHub secrets (see GITHUB-SECRETS-SETUP.md)"
    echo "2. Push to GitHub to trigger the pipeline"
    echo "3. Check Actions tab for pipeline status"
    echo "4. Verify Slack notification"
    echo ""
    exit 0
else
    echo -e "${RED}❌ $FAILURES check(s) failed${NC}"
    echo ""
    echo "Please review the errors above and fix any issues."
    echo ""
    exit 1
fi
