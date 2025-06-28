#!/bin/bash

# Comprehensive Firestore backup script
set -e

# Configuration
PROJECT_ID="consignment-store-4a564"
BACKUP_BUCKET="gs://${PROJECT_ID}-backups"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_NAME="firestore_backup_${TIMESTAMP}"
RETENTION_DAYS=30

# Alert configuration
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Alert function
send_alert() {
    local severity=$1
    local message=$2
    
    log "ALERT [$severity]: $message"
    
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🔄 Firestore Backup [$severity]: $message\"}" \
            "$SLACK_WEBHOOK" 2>/dev/null || true
    fi
}

# Create backup
create_backup() {
    log "Starting Firestore backup: $BACKUP_NAME"
    
    # Create the backup
    if gcloud firestore export "$BACKUP_BUCKET/$BACKUP_NAME" \
        --project="$PROJECT_ID" \
        --async 2>/dev/null; then
        
        log "Backup initiated successfully: $BACKUP_NAME"
        send_alert "SUCCESS" "Firestore backup initiated: $BACKUP_NAME"
        return 0
    else
        log "Failed to initiate backup"
        send_alert "ERROR" "Failed to initiate Firestore backup"
        return 1
    fi
}

# Wait for backup completion
wait_for_backup() {
    log "Waiting for backup to complete..."
    
    local max_wait=3600  # 1 hour timeout
    local wait_time=0
    local check_interval=60  # Check every minute
    
    while [[ $wait_time -lt $max_wait ]]; do
        # Check if any operations are running
        if operations=$(gcloud firestore operations list \
            --filter="metadata.outputUriPrefix:$BACKUP_BUCKET/$BACKUP_NAME" \
            --format="value(name)" \
            --project="$PROJECT_ID" 2>/dev/null); then
            
            if [[ -z "$operations" ]]; then
                log "Backup completed successfully"
                send_alert "SUCCESS" "Firestore backup completed: $BACKUP_NAME"
                return 0
            fi
        fi
        
        sleep $check_interval
        wait_time=$((wait_time + check_interval))
        log "Still waiting for backup... (${wait_time}s elapsed)"
    done
    
    log "Backup timeout - may still be running"
    send_alert "WARNING" "Firestore backup timeout after ${max_wait}s"
    return 1
}

# Verify backup
verify_backup() {
    log "Verifying backup integrity..."
    
    if gsutil ls "$BACKUP_BUCKET/$BACKUP_NAME" > /dev/null 2>&1; then
        # Get backup size
        local backup_size=$(gsutil du -s "$BACKUP_BUCKET/$BACKUP_NAME" | awk '{print $1}')
        log "Backup verification successful - Size: ${backup_size} bytes"
        send_alert "SUCCESS" "Backup verified - Size: ${backup_size} bytes"
        return 0
    else
        log "Backup verification failed"
        send_alert "ERROR" "Backup verification failed"
        return 1
    fi
}

# Clean old backups
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    local cutoff_date=$(date -d "$RETENTION_DAYS days ago" '+%Y%m%d')
    
    # List all backups and filter by date
    if backup_list=$(gsutil ls "$BACKUP_BUCKET/" 2>/dev/null); then
        echo "$backup_list" | while read -r backup_path; do
            # Extract date from backup name (format: firestore_backup_YYYYMMDD_HHMMSS)
            if [[ $(basename "$backup_path") =~ firestore_backup_([0-9]{8})_ ]]; then
                local backup_date="${BASH_REMATCH[1]}"
                
                if [[ "$backup_date" < "$cutoff_date" ]]; then
                    log "Removing old backup: $(basename "$backup_path")"
                    gsutil -m rm -r "$backup_path" 2>/dev/null || true
                fi
            fi
        done
        
        log "Cleanup completed"
    else
        log "Could not list backups for cleanup"
    fi
}

# Test restore capability (dry run)
test_restore() {
    log "Testing restore capability (dry run)..."
    
    # This would typically test importing to a test project
    # For now, we'll just verify the backup structure
    if gsutil ls "$BACKUP_BUCKET/$BACKUP_NAME/" | grep -q "all_namespaces/"; then
        log "Restore test passed - backup structure is valid"
        return 0
    else
        log "Restore test failed - invalid backup structure"
        send_alert "WARNING" "Backup restore test failed"
        return 1
    fi
}

# Create storage bucket if it doesn't exist
setup_backup_bucket() {
    log "Setting up backup bucket..."
    
    if ! gsutil ls "$BACKUP_BUCKET" > /dev/null 2>&1; then
        log "Creating backup bucket: $BACKUP_BUCKET"
        
        gsutil mb -p "$PROJECT_ID" -c STANDARD -l us-central1 "$BACKUP_BUCKET"
        
        # Set lifecycle policy to auto-delete old backups
        cat > /tmp/lifecycle.json << EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": $((RETENTION_DAYS + 7))}
      }
    ]
  }
}
EOF
        
        gsutil lifecycle set /tmp/lifecycle.json "$BACKUP_BUCKET"
        rm /tmp/lifecycle.json
        
        log "Backup bucket created with lifecycle policy"
    else
        log "Backup bucket already exists"
    fi
}

# Generate backup report
generate_report() {
    local status=$1
    local backup_size=${2:-"unknown"}
    
    cat > "/tmp/backup_report_${TIMESTAMP}.txt" << EOF
Firestore Backup Report
======================
Date: $(date)
Project: $PROJECT_ID
Backup Name: $BACKUP_NAME
Status: $status
Size: $backup_size
Location: $BACKUP_BUCKET/$BACKUP_NAME
Retention: $RETENTION_DAYS days

EOF
    
    log "Backup report generated: /tmp/backup_report_${TIMESTAMP}.txt"
}

# Main backup process
main() {
    log "🔄 Starting Firestore backup process"
    
    # Check prerequisites
    if ! command -v gcloud &> /dev/null; then
        log "❌ gcloud CLI not found"
        send_alert "ERROR" "gcloud CLI not installed"
        exit 1
    fi
    
    if ! command -v gsutil &> /dev/null; then
        log "❌ gsutil not found"
        send_alert "ERROR" "gsutil not installed"
        exit 1
    fi
    
    # Set project
    gcloud config set project "$PROJECT_ID"
    
    # Setup
    setup_backup_bucket
    
    # Main backup process
    if create_backup; then
        if wait_for_backup && verify_backup; then
            cleanup_old_backups
            test_restore
            
            local backup_size=$(gsutil du -s "$BACKUP_BUCKET/$BACKUP_NAME" 2>/dev/null | awk '{print $1}' || echo "unknown")
            generate_report "SUCCESS" "$backup_size"
            
            log "✅ Backup process completed successfully"
            send_alert "SUCCESS" "Firestore backup completed successfully: $BACKUP_NAME"
            exit 0
        else
            generate_report "PARTIAL_FAILURE"
            log "⚠️ Backup process completed with warnings"
            send_alert "WARNING" "Firestore backup completed with warnings"
            exit 1
        fi
    else
        generate_report "FAILURE"
        log "❌ Backup process failed"
        send_alert "ERROR" "Firestore backup failed"
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    --verify-only)
        verify_backup
        exit $?
        ;;
    --cleanup-only)
        cleanup_old_backups
        exit $?
        ;;
    --test-restore)
        test_restore
        exit $?
        ;;
    *)
        main "$@"
        ;;
esac 