# 🚀 Production Infrastructure Guide

## Overview

This guide covers the production-ready infrastructure improvements for the Consignment Store application, addressing key operational requirements:

- ✅ **Backend Deployment** - Google Cloud Run with auto-scaling
- ✅ **Monitoring & Alerting** - Comprehensive health checks and notifications  
- ✅ **Data Backup & Recovery** - Automated Firestore backups with disaster recovery
- ✅ **Security Hardening** - Production-grade security measures

## Quick Start

### 🚀 One-Command Setup

```bash
./infrastructure-setup.sh
```

This script will guide you through setting up the entire production infrastructure.

### 🔧 Manual Setup

If you prefer to set up components individually:

#### 1. Backend Deployment
```bash
cd server
./deploy.sh
```

#### 2. Monitoring Setup
```bash
./monitoring/health-check.sh
```

#### 3. Backup System
```bash
./backup/firestore-backup.sh
```

## 📁 File Structure

```
Consignment/
├── infrastructure-setup.sh          # Main setup script
├── server/
│   ├── Dockerfile                   # Container configuration
│   ├── deploy.sh                    # Cloud Run deployment
│   └── .dockerignore               # Docker build optimization
├── monitoring/
│   ├── health-check.sh             # Comprehensive health checks
│   ├── monitoring-config.yml       # Monitoring configuration
│   └── .env                        # Environment variables (created during setup)
├── backup/
│   ├── firestore-backup.sh         # Automated backup script
│   └── disaster-recovery-plan.md   # Disaster recovery procedures
└── automation-crontab.txt          # Cron job configuration
```

## 🔧 Components Explained

### 1. Backend Deployment (Google Cloud Run)

**Features:**
- Containerized Python FastAPI application
- Auto-scaling from 0 to 10 instances
- Production logging and monitoring
- Health check endpoints
- Secure service account authentication

**Endpoints:**
- `GET /api/health` - Basic health check
- `GET /api/status` - Detailed system status
- `POST /api/process-payment` - Payment processing
- `POST /api/user/submit-item` - Item submission
- `POST /api/admin/approve-item` - Admin item approval

### 2. Monitoring & Alerting

**Health Checks:**
- ✅ Service availability
- ✅ Database connectivity
- ✅ Response time monitoring
- ✅ Error rate tracking
- ✅ Memory usage verification

**Alert Channels:**
- 📱 Slack notifications (optional)
- 📧 Email alerts (optional)
- 🔔 Google Cloud Monitoring

**Thresholds:**
- Response time: Warning >2s, Critical >5s
- Error rate: Warning >5%, Critical >10%
- Database issues: Immediate alerts

### 3. Backup & Disaster Recovery

**Backup Strategy:**
- 🔄 **Daily automated Firestore exports** at 2:00 AM UTC
- 🗄️ **30-day retention** with automatic cleanup
- ✅ **Backup verification** and integrity checks
- 🧪 **Weekly restore testing** to staging environment

**Disaster Recovery:**
- 📋 **Documented procedures** for all failure scenarios
- ⏱️ **RTO/RPO targets** defined for each component
- 🔄 **Automated restore scripts** for quick recovery
- 📞 **Emergency contact procedures**

### 4. Security Hardening

**Production Security:**
- 🔒 Firebase Admin SDK with service account authentication
- 🛡️ Proper Firestore security rules with user isolation
- 🚫 CORS protection with allowed origins
- 📝 Comprehensive request logging
- 🔐 Secrets management via environment variables

## 📊 Monitoring Dashboard

Once deployed, monitor your application through:

1. **Google Cloud Console:**
   - Cloud Run service metrics
   - Error reporting
   - Log aggregation

2. **Custom Health Checks:**
   ```bash
   # Run manual health check
   ./monitoring/health-check.sh
   ```

3. **Service Status:**
   ```bash
   curl https://your-service-url/api/status
   ```

## 🔄 Automated Operations

### Cron Jobs (Enable with: `sudo crontab automation-crontab.txt`)

```bash
# Daily Firestore backup at 2:00 AM UTC
0 2 * * * /path/to/backup/firestore-backup.sh

# Health checks every 5 minutes during business hours
*/5 9-17 * * 1-5 /path/to/monitoring/health-check.sh

# Weekly log cleanup on Sundays at 3:00 AM
0 3 * * 0 find /var/log/consignment-*.log -mtime +7 -delete
```

### Google Cloud Scheduler
- Automated backup triggers
- Uptime monitoring
- Performance metrics collection

## 🚨 Alert Configuration

### Slack Integration
```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

### Email Alerts
```bash
export ALERT_EMAIL="alerts@yourdomain.com"
```

### Alert Types
- 🔴 **Critical**: Service down, database failure, high error rates
- 🟡 **Warning**: Slow response times, high memory usage
- 🟢 **Info**: Successful backups, deployments completed

## 📈 Performance Targets

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Response Time | <1s | >2s warning, >5s critical |
| Uptime | 99.9% | <99% monthly |
| Error Rate | <1% | >5% warning, >10% critical |
| Database Queries | <500ms | >1s warning, >3s critical |

## 🔧 Troubleshooting

### Common Issues

**Backend Not Responding:**
```bash
# Check service status
gcloud run services describe consignment-api --region=us-central1

# Check logs
gcloud logs read "resource.type=cloud_run_revision" --limit=50

# Redeploy if needed
cd server && ./deploy.sh
```

**Database Connection Issues:**
```bash
# Test database connectivity
curl https://your-service-url/api/status | jq '.checks.database'

# Check Firestore rules
firebase firestore:rules:list
```

**Backup Failures:**
```bash
# Check backup status
./backup/firestore-backup.sh --verify-only

# List recent backups
gsutil ls gs://consignment-store-4a564-backups/
```

## 📚 Additional Resources

### Documentation
- [Disaster Recovery Plan](backup/disaster-recovery-plan.md)
- [Monitoring Configuration](monitoring/monitoring-config.yml)
- [Security Assessment](SECURITY_ASSESSMENT.md)

### Google Cloud Resources
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Firestore Backup/Restore](https://cloud.google.com/firestore/docs/manage-data/export-import)
- [Cloud Monitoring](https://cloud.google.com/monitoring/docs)

## 🎯 Production Checklist

Before going live, ensure:

- [ ] Backend deployed and health checks passing
- [ ] Monitoring alerts configured and tested
- [ ] Backup system operational and verified
- [ ] Disaster recovery procedures tested
- [ ] Frontend updated with production API URL
- [ ] Custom domain configured (optional)
- [ ] SSL certificates valid
- [ ] Performance testing completed
- [ ] Security scan passed
- [ ] Team trained on incident response

## 💰 Cost Optimization

**Expected Monthly Costs:**
- Cloud Run: $5-20 (depending on usage)
- Firestore: $5-15 (based on operations)
- Cloud Storage (backups): $1-5
- Cloud Monitoring: $0-10
- **Total: ~$15-50/month** for small to medium traffic

**Cost Optimization Tips:**
- Set Cloud Run min instances to 0
- Configure appropriate backup retention
- Use Cloud Storage lifecycle policies
- Monitor and optimize database queries

---

## 🚀 Ready to Deploy?

Run the setup script to get started:

```bash
./infrastructure-setup.sh
```

This will guide you through the entire setup process and provide you with a production-ready, scalable, and monitored consignment store application! 