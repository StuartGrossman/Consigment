# Disaster Recovery Plan - Consignment Store

## Overview

This document outlines the disaster recovery procedures for the Consignment Store application, ensuring minimal downtime and data loss in case of various failure scenarios.

## Recovery Time Objectives (RTO) & Recovery Point Objectives (RPO)

| Component | RTO (Recovery Time) | RPO (Data Loss) | Priority |
|-----------|--------------------|--------------------|----------|
| Firestore Database | 1 hour | 15 minutes | Critical |
| API Service | 30 minutes | 0 minutes | Critical |
| Frontend Application | 15 minutes | 0 minutes | High |
| File Storage | 2 hours | 1 hour | Medium |
| User Authentication | 30 minutes | 0 minutes | Critical |

## Backup Strategy

### Automated Firestore Backups
- **Frequency**: Daily at 2:00 AM UTC
- **Retention**: 30 days
- **Location**: Google Cloud Storage bucket
- **Verification**: Automated integrity checks
- **Testing**: Weekly restore tests to staging environment

### Configuration Backups
- **Frequency**: After each deployment
- **Components**: 
  - Firebase Rules
  - Environment Variables
  - Service Account Keys (encrypted)
  - Application Configuration

### Code Repository
- **Primary**: GitHub with branch protection
- **Backup**: Automated daily mirrors to secondary Git provider
- **Documentation**: All procedures documented in repository

## Failure Scenarios & Response Procedures

### 1. Complete Firestore Database Loss

**Scenario**: Firestore database becomes completely inaccessible or corrupted

**Detection**:
- Database health checks fail
- All database operations return errors
- Monitoring alerts trigger

**Response Procedure**:
```bash
# 1. Assess the situation
curl -f "https://your-api-url/api/status"

# 2. Identify latest backup
gsutil ls gs://consignment-store-4a564-backups/ | tail -1

# 3. Create new Firestore database if needed
gcloud firestore databases create --region=us-central

# 4. Restore from backup
gcloud firestore import gs://consignment-store-4a564-backups/firestore_backup_YYYYMMDD_HHMMSS \
  --project=consignment-store-4a564

# 5. Verify data integrity
./monitoring/health-check.sh

# 6. Update application configuration if needed
# 7. Notify stakeholders of recovery completion
```

**Estimated Recovery Time**: 45-60 minutes

### 2. API Service Failure

**Scenario**: Backend API service becomes unresponsive or crashes

**Detection**:
- Health check endpoints fail
- High error rates in monitoring
- User reports of application issues

**Response Procedure**:
```bash
# 1. Check service status
gcloud run services describe consignment-api --region=us-central1

# 2. Check logs for errors
gcloud logs read "resource.type=cloud_run_revision" --limit=50

# 3. Restart service
gcloud run services update consignment-api --region=us-central1

# 4. If restart fails, redeploy from known good version
cd server && ./deploy.sh

# 5. Verify recovery
curl -f "https://your-api-url/api/health"
```

**Estimated Recovery Time**: 15-30 minutes

### 3. Frontend Application Issues

**Scenario**: Frontend application not loading or functioning

**Detection**:
- Firebase hosting health checks fail
- User reports of blank pages or errors
- Frontend monitoring alerts

**Response Procedure**:
```bash
# 1. Check Firebase hosting status
firebase hosting:sites:list

# 2. Check for recent deployments
firebase hosting:sites:get consignment-store-4a564

# 3. Rollback to previous version if needed
firebase hosting:clone SOURCE_SITE_ID:SOURCE_VERSION_ID TARGET_SITE_ID

# 4. Or redeploy current version
npm run build && firebase deploy --only hosting

# 5. Verify recovery
curl -f "https://consignment-store-4a564.web.app"
```

**Estimated Recovery Time**: 10-15 minutes

### 4. Authentication Service Failure

**Scenario**: Firebase Auth becomes unavailable

**Detection**:
- Login failures across all methods
- Authentication monitoring alerts
- Firebase console shows auth issues

**Response Procedure**:
```bash
# 1. Check Firebase Auth status in console
# 2. Verify service account permissions
gcloud projects get-iam-policy consignment-store-4a564

# 3. If Auth is down globally, enable emergency admin access
# (This requires pre-configured emergency procedures)

# 4. Communicate with users about temporary unavailability
# 5. Monitor Firebase status page for updates
```

**Estimated Recovery Time**: Depends on Firebase service restoration

## Emergency Contacts

### Internal Team
- **Primary Engineer**: [Your Contact]
- **Backup Engineer**: [Backup Contact]
- **Business Owner**: [Business Contact]

### External Vendors
- **Firebase Support**: Via Firebase Console
- **Google Cloud Support**: Via Cloud Console
- **Domain Registrar**: [Registrar Contact]

## Communication Plan

### Internal Communication
1. **Immediate**: Internal team via Slack/phone
2. **15 minutes**: Status update to management
3. **30 minutes**: Detailed incident report
4. **Hourly**: Progress updates during recovery

### External Communication
1. **User Notification**: 
   - Status page update
   - Social media if major outage
   - Email to registered users for extended outages

2. **Business Clients**:
   - Direct notification for service interruptions
   - Estimated recovery time
   - Compensation if applicable

## Recovery Verification Checklist

After any recovery procedure, verify the following:

### Functional Tests
- [ ] User authentication (Google, phone)
- [ ] Item creation and listing
- [ ] Shopping cart functionality
- [ ] Checkout process (demo mode)
- [ ] Admin panel access
- [ ] Item approval workflow
- [ ] File upload functionality
- [ ] Analytics dashboard

### Data Integrity Tests
- [ ] User accounts preserved
- [ ] Items and inventory correct
- [ ] Order history intact
- [ ] User permissions working
- [ ] Admin settings preserved

### Performance Tests
- [ ] Response times under 2 seconds
- [ ] No memory leaks or high resource usage
- [ ] Database queries optimized
- [ ] CDN and caching working

## Preventive Measures

### Monitoring & Alerting
- 24/7 uptime monitoring
- Database performance monitoring
- Error rate tracking
- Response time monitoring
- Resource utilization alerts

### Regular Testing
- **Monthly**: Disaster recovery drills
- **Weekly**: Backup integrity verification
- **Daily**: Automated health checks
- **Continuous**: Integration testing

### Infrastructure Hardening
- Multi-region backup storage
- Automated failover procedures
- Rate limiting and DDoS protection
- Security monitoring and intrusion detection

## Post-Incident Procedures

### Immediate (0-24 hours)
1. Complete incident timeline documentation
2. Root cause analysis
3. Immediate preventive measures
4. Stakeholder notification of resolution

### Short-term (1-7 days)
1. Detailed post-mortem report
2. Process improvements identification
3. Additional monitoring implementation
4. Team training updates

### Long-term (1-4 weeks)
1. Infrastructure improvements
2. Disaster recovery plan updates
3. Tool and process enhancements
4. Third-party vendor evaluations

## Backup Schedule Configuration

### Cron Jobs (for automated backups)
```bash
# Daily Firestore backup at 2:00 AM UTC
0 2 * * * /path/to/backup/firestore-backup.sh >> /var/log/backup.log 2>&1

# Weekly configuration backup on Sundays at 3:00 AM UTC
0 3 * * 0 /path/to/backup/config-backup.sh >> /var/log/config-backup.log 2>&1

# Daily health check every hour during business hours
0 9-17 * * 1-5 /path/to/monitoring/health-check.sh >> /var/log/health-check.log 2>&1
```

### Cloud Scheduler (Google Cloud alternative)
```yaml
# firestore-backup-daily
schedule: "0 2 * * *"
time_zone: "UTC"
target:
  uri: "https://your-backup-function-url"
  http_method: "POST"
```

## Training & Documentation

### Team Training Requirements
- All team members must complete disaster recovery training
- Quarterly disaster recovery simulation exercises
- Updated contact information and access credentials
- Clear escalation procedures for different scenarios

### Documentation Maintenance
- Monthly review of procedures
- Update after each incident
- Version control for all disaster recovery documents
- Regular testing of documented procedures

---

**Document Version**: 1.0  
**Last Updated**: [Current Date]  
**Next Review**: [Date + 3 months]  
**Approved By**: [Name and Title] 