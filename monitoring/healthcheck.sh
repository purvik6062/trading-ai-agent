#!/bin/bash

# Trading AI Agent Health Check Script
# Use this for production monitoring

BASE_URL="http://localhost:3000"
LOG_FILE="/app/logs/healthcheck.log"
ALERT_WEBHOOK="your_slack_webhook_url"

timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

log() {
    echo "[$(timestamp)] $1" | tee -a $LOG_FILE
}

send_alert() {
    local message="$1"
    log "ALERT: $message"
    
    # Send to Slack (optional)
    if [ ! -z "$ALERT_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 Trading Agent Alert: $message\"}" \
            $ALERT_WEBHOOK
    fi
}

check_api_health() {
    local response=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/health" --max-time 10)
    
    if [ "$response" = "200" ]; then
        log "✅ API Health Check: OK"
        return 0
    else
        send_alert "API Health Check Failed (HTTP $response)"
        return 1
    fi
}

check_vault_connection() {
    local response=$(curl -s "$BASE_URL/vault" --max-time 15)
    
    if echo "$response" | grep -q "portfolioValue"; then
        log "✅ Vault Connection: OK"
        return 0
    else
        send_alert "Vault Connection Failed"
        return 1
    fi
}

check_memory_usage() {
    local memory_usage=$(docker stats trading-agent --no-stream --format "{{.MemPerc}}" | sed 's/%//')
    
    if (( $(echo "$memory_usage > 80" | bc -l) )); then
        send_alert "High Memory Usage: ${memory_usage}%"
        return 1
    else
        log "✅ Memory Usage: ${memory_usage}%"
        return 0
    fi
}

check_active_positions() {
    local response=$(curl -s "$BASE_URL/positions" --max-time 10)
    local total_positions=$(echo "$response" | jq -r '.total // 0')
    
    log "📊 Active Positions: $total_positions"
    
    if [ "$total_positions" -gt 10 ]; then
        send_alert "High number of active positions: $total_positions"
    fi
}

# Main health check routine
main() {
    log "🔍 Starting health check..."
    
    local failed_checks=0
    
    check_api_health || ((failed_checks++))
    check_vault_connection || ((failed_checks++))
    check_memory_usage || ((failed_checks++))
    check_active_positions
    
    if [ $failed_checks -eq 0 ]; then
        log "✅ All health checks passed"
    else
        log "❌ $failed_checks health checks failed"
        exit 1
    fi
}

main "$@" 