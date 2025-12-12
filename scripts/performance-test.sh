#!/bin/bash

# Performance Testing Script for Delineate Hackathon Challenge API
# Tests latency, throughput, rate limiting, and timeout behavior

set -e

BASE_URL="${1:-http://36.255.70.250:3000}"
RESULTS_FILE="performance-results.txt"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "======================================"
echo "  Performance Testing Suite"
echo "======================================"
echo "Base URL: $BASE_URL"
echo "Results will be saved to: $RESULTS_FILE"
echo ""

# Clear previous results
> "$RESULTS_FILE"

log_result() {
    echo "$1" | tee -a "$RESULTS_FILE"
}

print_header() {
    echo ""
    echo -e "${BLUE}======================================"
    echo -e "$1"
    echo -e "======================================${NC}"
    log_result ""
    log_result "======================================"
    log_result "$1"
    log_result "======================================"
}

print_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    log_result "✓ PASS: $1"
}

print_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    log_result "✗ FAIL: $1"
}

print_info() {
    echo -e "${YELLOW}ℹ INFO${NC}: $1"
    log_result "ℹ INFO: $1"
}

# Check if server is running
print_header "1. Server Availability Check"
if curl -sf "$BASE_URL/health" > /dev/null; then
    print_pass "Server is reachable at $BASE_URL"
else
    print_fail "Server is not reachable at $BASE_URL"
    exit 1
fi

# Test 1: Root Endpoint Latency
print_header "2. Root Endpoint (/) Latency Test"

# Detect if testing localhost or remote
if [[ "$BASE_URL" == *"localhost"* ]] || [[ "$BASE_URL" == *"127.0.0.1"* ]]; then
    THRESHOLD=10
    print_info "Requirement: < ${THRESHOLD}ms average (localhost)"
else
    THRESHOLD=50
    print_info "Requirement: < ${THRESHOLD}ms average (remote server)"
fi

total_time=0
iterations=10
for i in $(seq 1 $iterations); do
    time=$(curl -o /dev/null -s -w '%{time_total}' "$BASE_URL/")
    time_ms=$(echo "$time * 1000" | bc)
    total_time=$(echo "$total_time + $time_ms" | bc)
    echo "  Request $i: ${time_ms}ms"
done

avg_time=$(echo "scale=2; $total_time / $iterations" | bc)
log_result "Average latency: ${avg_time}ms"

if (( $(echo "$avg_time < $THRESHOLD" | bc -l) )); then
    print_pass "Root endpoint latency: ${avg_time}ms (< ${THRESHOLD}ms)"
else
    print_fail "Root endpoint latency: ${avg_time}ms (>= ${THRESHOLD}ms)"
fi

# Test 2: Health Endpoint Latency
print_header "3. Health Endpoint (/health) Latency Test"
print_info "Requirement: < 100ms average"

total_time=0
iterations=10
for i in $(seq 1 $iterations); do
    time=$(curl -o /dev/null -s -w '%{time_total}' "$BASE_URL/health")
    time_ms=$(echo "$time * 1000" | bc)
    total_time=$(echo "$total_time + $time_ms" | bc)
    echo "  Request $i: ${time_ms}ms"
done

avg_time=$(echo "scale=2; $total_time / $iterations" | bc)
log_result "Average latency: ${avg_time}ms"

if (( $(echo "$avg_time < 100" | bc -l) )); then
    print_pass "Health endpoint latency: ${avg_time}ms (< 100ms)"
else
    print_fail "Health endpoint latency: ${avg_time}ms (>= 100ms)"
fi

# Test 3: Download Initiate Latency
print_header "4. Download Initiate Endpoint Latency Test"

# Detect if testing localhost or remote
if [[ "$BASE_URL" == *"localhost"* ]] || [[ "$BASE_URL" == *"127.0.0.1"* ]]; then
    THRESHOLD=10
    print_info "Requirement: < ${THRESHOLD}ms average (localhost - should return immediately)"
else
    THRESHOLD=100
    print_info "Requirement: < ${THRESHOLD}ms average (remote server)"
fi

total_time=0
iterations=10
for i in $(seq 1 $iterations); do
    time=$(curl -o /dev/null -s -w '%{time_total}' \
        -X POST "$BASE_URL/v1/download/initiate" \
        -H "Content-Type: application/json" \
        -d '{"file_ids": [10000, 20000, 30000]}')
    time_ms=$(echo "$time * 1000" | bc)
    total_time=$(echo "$total_time + $time_ms" | bc)
    echo "  Request $i: ${time_ms}ms"
done

avg_time=$(echo "scale=2; $total_time / $iterations" | bc)
log_result "Average latency: ${avg_time}ms"

if (( $(echo "$avg_time < $THRESHOLD" | bc -l) )); then
    print_pass "Download initiate latency: ${avg_time}ms (< ${THRESHOLD}ms)"
else
    print_fail "Download initiate latency: ${avg_time}ms (>= ${THRESHOLD}ms)"
fi

# Test 4: Download Check Latency
print_header "5. Download Check Endpoint Latency Test"
print_info "Requirement: < 100ms average (includes S3 HEAD request)"

total_time=0
iterations=10
for i in $(seq 1 $iterations); do
    time=$(curl -o /dev/null -s -w '%{time_total}' \
        -X POST "$BASE_URL/v1/download/check" \
        -H "Content-Type: application/json" \
        -d '{"file_id": 70000}')
    time_ms=$(echo "$time * 1000" | bc)
    total_time=$(echo "$total_time + $time_ms" | bc)
    echo "  Request $i: ${time_ms}ms"
done

avg_time=$(echo "scale=2; $total_time / $iterations" | bc)
log_result "Average latency: ${avg_time}ms"

if (( $(echo "$avg_time < 100" | bc -l) )); then
    print_pass "Download check latency: ${avg_time}ms (< 100ms)"
else
    print_fail "Download check latency: ${avg_time}ms (>= 100ms)"
fi

# Test 5: Rate Limiting
print_header "6. Rate Limiting Test"
print_info "Requirement: 100 requests per minute per IP"

echo "Sending 105 requests rapidly..."
success_count=0
rate_limited_count=0

for i in $(seq 1 105); do
    status=$(curl -o /dev/null -s -w '%{http_code}' "$BASE_URL/")
    if [ "$status" = "200" ]; then
        ((success_count++))
    elif [ "$status" = "429" ]; then
        ((rate_limited_count++))
    fi
    
    # Show progress every 20 requests
    if [ $((i % 20)) -eq 0 ]; then
        echo "  Progress: $i/105 requests sent"
    fi
done

log_result "Successful requests: $success_count"
log_result "Rate limited requests: $rate_limited_count"

if [ $rate_limited_count -gt 0 ]; then
    print_pass "Rate limiting is working (${rate_limited_count} requests blocked)"
else
    print_info "Rate limiting not triggered (may need more requests or shorter window)"
fi

# Test 6: Request Timeout
print_header "7. Request Timeout Test"
print_info "Requirement: 30 seconds timeout (REQUEST_TIMEOUT_MS=30000)"

echo "Testing with /v1/download/start endpoint (may take 5-15s in dev mode)..."
start_time=$(date +%s)
status=$(curl -o /dev/null -s -w '%{http_code}' -m 35 \
    -X POST "$BASE_URL/v1/download/start" \
    -H "Content-Type: application/json" \
    -d '{"file_id": 70000}')
end_time=$(date +%s)
duration=$((end_time - start_time))

log_result "Request completed in ${duration}s with status $status"

if [ "$status" = "200" ]; then
    if [ $duration -lt 30 ]; then
        print_pass "Request completed successfully in ${duration}s (< 30s timeout)"
    else
        print_info "Request took ${duration}s (may timeout in production with longer delays)"
    fi
else
    print_fail "Request failed with status $status"
fi

# Test 7: Concurrent Requests
print_header "8. Concurrent Request Handling Test"
print_info "Testing server's ability to handle concurrent requests"

echo "Sending 20 concurrent requests to /health endpoint..."
start_time=$(date +%s.%N)

for i in $(seq 1 20); do
    curl -s "$BASE_URL/health" > /dev/null &
done

wait
end_time=$(date +%s.%N)
duration=$(echo "$end_time - $start_time" | bc)
duration_ms=$(echo "$duration * 1000" | bc)

log_result "20 concurrent requests completed in ${duration_ms}ms"
avg_per_request=$(echo "scale=2; $duration_ms / 20" | bc)
log_result "Average time per request: ${avg_per_request}ms"

if (( $(echo "$duration_ms < 2000" | bc -l) )); then
    print_pass "Concurrent requests handled efficiently (${duration_ms}ms total)"
else
    print_fail "Concurrent requests took too long (${duration_ms}ms total)"
fi

# Test 8: Security Headers
print_header "9. Security Headers Verification"

response_headers=$(curl -s -I "$BASE_URL/")

check_header() {
    header_name=$1
    if echo "$response_headers" | grep -qi "$header_name"; then
        print_pass "$header_name header present"
    else
        print_fail "$header_name header missing"
    fi
}

check_header "x-request-id"
check_header "x-content-type-options"
check_header "x-frame-options"
check_header "strict-transport-security"
check_header "ratelimit-limit"
check_header "ratelimit-remaining"
check_header "access-control-allow-origin"

# Test 9: Input Validation
print_header "10. Input Validation Test"

echo "Testing invalid file_id (< 10000)..."
status=$(curl -o /dev/null -s -w '%{http_code}' \
    -X POST "$BASE_URL/v1/download/check" \
    -H "Content-Type: application/json" \
    -d '{"file_id": 100}')

if [ "$status" = "400" ]; then
    print_pass "Invalid file_id rejected with 400 status"
else
    print_fail "Invalid file_id not rejected (status: $status)"
fi

echo "Testing invalid file_id (> 100000000)..."
status=$(curl -o /dev/null -s -w '%{http_code}' \
    -X POST "$BASE_URL/v1/download/check" \
    -H "Content-Type: application/json" \
    -d '{"file_id": 999999999}')

if [ "$status" = "400" ]; then
    print_pass "Invalid file_id rejected with 400 status"
else
    print_fail "Invalid file_id not rejected (status: $status)"
fi

# Test 10: Storage Health Check
print_header "11. Storage Integration Health Check"

health_response=$(curl -s "$BASE_URL/health")
storage_status=$(echo "$health_response" | grep -o '"storage":"[^"]*"' | cut -d'"' -f4)

if [ "$storage_status" = "ok" ]; then
    print_pass "Storage (S3/MinIO) is healthy"
else
    print_fail "Storage check failed (status: $storage_status)"
fi

# Summary
print_header "Performance Test Summary"

echo ""
echo "Full results saved to: $RESULTS_FILE"
echo ""
echo -e "${GREEN}Testing complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Review $RESULTS_FILE for detailed results"
echo "2. Check Jaeger UI for distributed traces: http://localhost:16686"
echo "3. Monitor Docker stats: docker stats delineate-app"
echo "4. Check application logs: docker logs delineate-app"
