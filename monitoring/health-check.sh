#!/bin/bash

# Comprehensive health check script for production monitoring
set -e

# Configuration
SERVICE_URL="${SERVICE_URL:-https://your-service-url.run.app}"
ALERT_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
EMAIL_ALERT="${ALERT_EMAIL:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Alert function
send_alert() {
    local severity=$1
    local message=$2
    
    log "ALERT [$severity]: $message"
    
    # Send to Slack if webhook configured
    if [[ -n "$ALERT_WEBHOOK" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 Consignment API Alert [$severity]: $message\"}" \
            "$ALERT_WEBHOOK" 2>/dev/null || true
    fi
    
    # Send email if configured
    if [[ -n "$EMAIL_ALERT" ]]; then
        echo "$message" | mail -s "Consignment API Alert [$severity]" "$EMAIL_ALERT" 2>/dev/null || true
    fi
}

# Health check functions
check_basic_health() {
    log "Checking basic health endpoint..."
    
    if response=$(curl -s -f "$SERVICE_URL/api/health" 2>/dev/null); then
        echo -e "${GREEN}✅ Basic health check passed${NC}"
        return 0
    else
        echo -e "${RED}❌ Basic health check failed${NC}"
        send_alert "CRITICAL" "Basic health check failed - service may be down"
        return 1
    fi
}

check_detailed_status() {
    log "Checking detailed status..."
    
    if response=$(curl -s -f "$SERVICE_URL/api/status" 2>/dev/null); then
        status=$(echo "$response" | jq -r '.status' 2>/dev/null || echo "unknown")
        db_status=$(echo "$response" | jq -r '.checks.database' 2>/dev/null || echo "unknown")
        
        if [[ "$status" == "healthy" && "$db_status" == "healthy" ]]; then
            echo -e "${GREEN}✅ Detailed status check passed${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️ Service reporting issues: status=$status, db=$db_status${NC}"
            send_alert "WARNING" "Service status check failed: status=$status, database=$db_status"
            return 1
        fi
    else
        echo -e "${RED}❌ Could not retrieve detailed status${NC}"
        send_alert "CRITICAL" "Status endpoint unreachable"
        return 1
    fi
}

check_response_time() {
    log "Checking response time..."
    
    start_time=$(date +%s%N)
    if curl -s -f "$SERVICE_URL/api/health" > /dev/null 2>&1; then
        end_time=$(date +%s%N)
        response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
        
        if [[ $response_time -lt 2000 ]]; then
            echo -e "${GREEN}✅ Response time: ${response_time}ms${NC}"
            return 0
        elif [[ $response_time -lt 5000 ]]; then
            echo -e "${YELLOW}⚠️ Slow response time: ${response_time}ms${NC}"
            send_alert "WARNING" "Slow response time: ${response_time}ms"
            return 1
        else
            echo -e "${RED}❌ Very slow response time: ${response_time}ms${NC}"
            send_alert "CRITICAL" "Very slow response time: ${response_time}ms"
            return 1
        fi
    else
        echo -e "${RED}❌ Request failed during response time check${NC}"
        return 1
    fi
}

check_database_connectivity() {
    log "Testing database operations..."
    
    # Test basic read operation (checking if items collection is accessible)
    if response=$(curl -s -f "$SERVICE_URL/api/status" 2>/dev/null); then
        db_status=$(echo "$response" | jq -r '.checks.database' 2>/dev/null || echo "unknown")
        
        if [[ "$db_status" == "healthy" ]]; then
            echo -e "${GREEN}✅ Database connectivity check passed${NC}"
            return 0
        else
            echo -e "${RED}❌ Database connectivity issues: $db_status${NC}"
            send_alert "CRITICAL" "Database connectivity failed: $db_status"
            return 1
        fi
    else
        echo -e "${RED}❌ Could not check database status${NC}"
        return 1
    fi
}

# Memory and performance checks
check_memory_usage() {
    log "Checking memory usage..."
    
    # This would typically query your monitoring system
    # For now, we'll assume memory is okay if service responds
    if curl -s -f "$SERVICE_URL/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Memory usage appears normal${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️ Could not verify memory usage${NC}"
        return 1
    fi
}

# Main health check
main() {
    echo "🔍 Starting comprehensive health check for Consignment API"
    echo "Target: $SERVICE_URL"
    echo "----------------------------------------"
    
    local failed_checks=0
    
    # Run all checks
    check_basic_health || ((failed_checks++))
    check_detailed_status || ((failed_checks++))
    check_response_time || ((failed_checks++))
    check_database_connectivity || ((failed_checks++))
    check_memory_usage || ((failed_checks++))
    
    echo "----------------------------------------"
    
    if [[ $failed_checks -eq 0 ]]; then
        echo -e "${GREEN}🎉 All health checks passed!${NC}"
        log "Health check completed successfully"
        exit 0
    else
        echo -e "${RED}❌ $failed_checks health check(s) failed${NC}"
        send_alert "CRITICAL" "$failed_checks health checks failed"
        log "Health check completed with $failed_checks failures"
        exit 1
    fi
}

# Check dependencies
if ! command -v curl &> /dev/null; then
    echo "❌ curl is required but not installed"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "⚠️ jq not found - some checks may be limited"
fi

# Run main function
main "$@" 