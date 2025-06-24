# Security Deployment Guide

## 🔒 Overview of Security Changes

This guide documents the major security improvements implemented to move critical business logic from the frontend to a secure server-side implementation.

## 🚨 Critical Security Issues Addressed

### Before (Insecure):
- ❌ Payment processing handled entirely on frontend
- ❌ Inventory updates performed directly by client
- ❌ Financial calculations done in browser (easily manipulated)
- ❌ Direct Firestore access for critical operations
- ❌ No server-side validation of transactions

### After (Secure):
- ✅ Server-side payment processing with proper validation
- ✅ Secure inventory management through authenticated APIs
- ✅ Server-side financial calculations and commission handling
- ✅ Restricted Firestore access with comprehensive security rules
- ✅ Firebase Authentication integration for API security

## 🏗️ Architecture Changes

### New Server Architecture
```
Frontend (React) → Secure API Server (FastAPI) → Firebase/Stripe
```

### Key Components:
1. **Secure Payment Processing Server** (`server/main.py`)
2. **API Service Layer** (`src/services/apiService.ts`)
3. **Updated Security Rules** (`firestore.rules`)
4. **Environment Configuration** (`server/environment.example`)

## 🛠️ Setup Instructions

### 1. Server Setup

#### Install Dependencies
```bash
cd server
pip install -r requirements.txt
```

#### Environment Configuration
1. Copy `environment.example` to `.env`
2. Configure your environment variables:

```bash
# Required for production
STRIPE_SECRET_KEY=sk_live_your_actual_stripe_key
GOOGLE_APPLICATION_CREDENTIALS=path/to/firebase-admin-key.json

# Security settings
JWT_SECRET=your_secure_random_string
ALLOWED_ORIGINS=https://your-domain.com
```

#### Start the Server
```bash
# Development
python main.py

# Production
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 2. Frontend Configuration

Update the API base URL in `src/services/apiService.ts`:
```typescript
const API_BASE_URL = 'https://your-server-domain.com'; // Production
// const API_BASE_URL = 'http://localhost:8000'; // Development
```

### 3. Firebase Security Rules Deployment

Deploy the updated security rules:
```bash
firebase deploy --only firestore:rules
```

## 🔐 Security Features Implemented

### 1. Server-Side Payment Processing
- **Endpoint**: `POST /api/process-payment`
- **Authentication**: Required (Firebase ID token)
- **Validation**: Server validates all cart items and prices
- **Atomicity**: Database transactions ensure data consistency

### 2. Admin-Only Operations
- **Endpoint**: `POST /api/admin/update-item-status`
- **Authorization**: Admin role verification
- **Audit Trail**: All admin actions are logged

### 3. Firestore Security Rules

#### Critical Collections (Server-Only Access):
- `sales` - Prevents fake sales records
- `orders` - Prevents order manipulation
- `store_credits` - Prevents unauthorized credits
- `payments` - Admin-only financial records

#### User Access Controls:
- Users can only read/modify their own items
- Status changes to "sold" require server processing
- Read access restricted based on item status

### 4. Authentication & Authorization
- Firebase Authentication integration
- JWT token validation on all secure endpoints
- Role-based access control (admin vs. user)

## 🧪 Testing the Secure Implementation

### 1. Health Check
```bash
curl http://localhost:8000/api/health
```

### 2. Payment Processing Test
```bash
# This should return 401 (Unauthorized)
curl -X POST http://localhost:8000/api/process-payment \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 3. Admin Endpoint Test
```bash
# This should return 401 (Unauthorized)
curl -X POST http://localhost:8000/api/admin/sales-summary
```

## 🚀 Production Deployment Checklist

### Server Deployment:
- [ ] Set up production server (AWS, GCP, Azure, etc.)
- [ ] Configure environment variables securely
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (nginx/Apache)
- [ ] Set up monitoring and logging
- [ ] Configure rate limiting
- [ ] Set up backup systems

### Database Security:
- [ ] Deploy updated Firestore security rules
- [ ] Review Firebase project settings
- [ ] Enable audit logging
- [ ] Set up database backups
- [ ] Configure alerting for suspicious activity

### Payment Processing:
- [ ] Switch to live Stripe keys
- [ ] Configure webhook endpoints
- [ ] Test payment flows thoroughly
- [ ] Set up fraud detection
- [ ] Configure payment notifications

### Frontend Deployment:
- [ ] Update API endpoint URLs
- [ ] Configure production environment variables
- [ ] Test all user flows
- [ ] Verify error handling
- [ ] Test authentication flows

## 🔍 Security Monitoring

### Server Logs to Monitor:
- Authentication failures
- Payment processing errors
- Admin action attempts
- Rate limit violations
- Database transaction failures

### Firestore Security Events:
- Unauthorized read/write attempts
- Failed authentication events
- Unusual data access patterns

## 🆘 Emergency Procedures

### If Payment Processing Fails:
1. Check server logs for errors
2. Verify Stripe webhook status
3. Monitor database for incomplete transactions
4. Contact customers about failed orders

### If Security Breach Suspected:
1. Immediately rotate API keys
2. Review audit logs
3. Check for unauthorized database changes
4. Update security rules if needed
5. Notify affected users

## 📝 Additional Security Recommendations

### Short Term:
- Implement request rate limiting
- Add input validation and sanitization
- Set up comprehensive logging
- Add automated security testing

### Long Term:
- Implement end-to-end encryption
- Add advanced fraud detection
- Set up real-time security monitoring
- Regular security audits and penetration testing

## 🔧 Troubleshooting

### Common Issues:

**"Authentication token invalid"**
- Check Firebase configuration
- Verify user is properly signed in
- Check token expiration

**"CORS errors"**
- Update `ALLOWED_ORIGINS` in server configuration
- Verify frontend URL matches allowed origins

**"Payment processing failed"**
- Check Stripe configuration
- Verify server environment variables
- Check network connectivity to Stripe

**"Database permission denied"**
- Verify Firestore security rules are deployed
- Check user authentication status
- Verify admin role assignments

---

## 📞 Support

For deployment assistance or security questions, refer to:
- Firebase Documentation: https://firebase.google.com/docs
- Stripe API Documentation: https://stripe.com/docs
- FastAPI Documentation: https://fastapi.tiangolo.com/ 