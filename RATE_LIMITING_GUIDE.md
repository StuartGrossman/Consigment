# Rate Limiting and IP Banning System

## Overview

This comprehensive rate limiting and IP banning system protects the consignment application from spam, abuse, and DoS attacks. It implements intelligent rate limiting with automatic ban functionality and admin management tools.

## Features

### 🚦 Rate Limiting
- **Action-specific limits**: Different rate limits for different types of actions
- **Time-based windows**: Rate limits reset after configurable time periods
- **User and IP tracking**: Tracks attempts per user and IP address
- **Graceful degradation**: Provides clear error messages when limits exceeded

### 🚫 IP Banning
- **Automatic banning**: Auto-ban IPs after severe violations
- **Manual banning**: Admin tools for manual IP management
- **Temporary bans**: Configurable ban durations
- **Ban bypass protection**: Prevents circumvention attempts

### 👤 User Banning
- **Account-level bans**: Ban specific user accounts
- **Cross-session persistence**: Bans persist across login sessions
- **Admin override**: Admin tools for user management
- **Appeal process**: Framework for ban appeals

### 📊 Monitoring & Analytics
- **Violation logging**: Comprehensive logging of all violations
- **Admin dashboard**: Real-time monitoring of bans and violations
- **Analytics**: Detailed reporting on abuse patterns
- **Audit trail**: Complete audit trail of all ban actions

## Rate Limit Configurations

### Authentication Actions
```typescript
login: { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 30 * 60 * 1000 }
register: { maxAttempts: 3, windowMs: 60 * 60 * 1000, blockDurationMs: 60 * 60 * 1000 }
password_reset: { maxAttempts: 3, windowMs: 60 * 60 * 1000, blockDurationMs: 60 * 60 * 1000 }
```

### Item Management Actions
```typescript
item_create: { maxAttempts: 10, windowMs: 60 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 }
item_update: { maxAttempts: 20, windowMs: 60 * 60 * 1000, blockDurationMs: 10 * 60 * 1000 }
item_delete: { maxAttempts: 5, windowMs: 60 * 60 * 1000, blockDurationMs: 30 * 60 * 1000 }
```

### Purchase Actions
```typescript
purchase: { maxAttempts: 3, windowMs: 5 * 60 * 1000, blockDurationMs: 10 * 60 * 1000 }
checkout: { maxAttempts: 5, windowMs: 10 * 60 * 1000, blockDurationMs: 15 * 60 * 1000 }
```

### Admin Actions
```typescript
admin_action: { maxAttempts: 50, windowMs: 60 * 60 * 1000, blockDurationMs: 30 * 60 * 1000 }
bulk_action: { maxAttempts: 10, windowMs: 60 * 60 * 1000, blockDurationMs: 60 * 60 * 1000 }
export_data: { maxAttempts: 5, windowMs: 60 * 60 * 1000, blockDurationMs: 30 * 60 * 1000 }
```

### Browse & Search Actions
```typescript
search: { maxAttempts: 100, windowMs: 60 * 60 * 1000, blockDurationMs: 5 * 60 * 1000 }
browse: { maxAttempts: 200, windowMs: 60 * 60 * 1000, blockDurationMs: 2 * 60 * 1000 }
api_call: { maxAttempts: 1000, windowMs: 60 * 60 * 1000, blockDurationMs: 5 * 60 * 1000 }
```

## Auto-Ban Thresholds

The system automatically bans users/IPs when they exceed severe violation thresholds:

- **Login attempts**: 10 failed attempts → 24-hour ban
- **Registration attempts**: 5 attempts → 24-hour ban  
- **Item creation**: 50 attempts → 24-hour ban
- **Purchase attempts**: 10 attempts → 24-hour ban
- **Default actions**: 100 attempts → 24-hour ban

## Implementation

### 1. Rate Limiter Hook

```typescript
import { useRateLimiter } from '../hooks/useRateLimiter';

const MyComponent = () => {
  const { executeWithRateLimit } = useRateLimiter();
  
  const handleAction = async () => {
    const result = await executeWithRateLimit('action_name', async () => {
      // Your action logic here
      return await performAction();
    });
    
    if (result.success) {
      // Action succeeded
      console.log('Success:', result.data);
    } else {
      // Action was rate limited
      alert(result.error);
    }
  };
};
```

### 2. Custom Rate Limits

```typescript
const result = await executeWithRateLimit('custom_action', actionFn, {
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000, // 10 minutes
  blockDurationMs: 30 * 60 * 1000 // 30 minutes
});
```

### 3. Ban Checking

```typescript
const { checkIPBan, checkUserBan } = useRateLimiter();

// Check if IP is banned
const isIPBanned = await checkIPBan('192.168.1.100');

// Check if user is banned
const isUserBanned = await checkUserBan('user-id-123');
```

## Admin Management

### Ban Management Modal

Administrators can access the ban management system through the Admin Modal:

1. **View Active Bans**: See all currently active IP and user bans
2. **View Violations**: Monitor rate limit violations in real-time
3. **Manual Banning**: Manually ban IPs or users with custom reasons and durations
4. **Unban Actions**: Remove bans and restore access
5. **Ban from Violations**: Convert rate limit violations into bans

### Features:
- **Real-time Updates**: Live data from Firebase
- **Detailed Information**: Full context for each ban and violation
- **Audit Trail**: Complete logging of all admin actions
- **Bulk Actions**: Manage multiple bans efficiently

## Database Schema

### Rate Limit Violations
```typescript
interface RateLimitViolation {
  action: string;
  userId?: string;
  ip: string;
  attempts: number;
  maxAttempts: number;
  timestamp: Date;
  userAgent: string;
  url: string;
}
```

### Banned IPs
```typescript
interface BannedIP {
  ip: string;
  reason: string;
  bannedAt: Date;
  expiresAt: Date;
  active: boolean;
  autoGenerated?: boolean;
  bannedBy?: string;
}
```

### Banned Users
```typescript
interface BannedUser {
  userId: string;
  email?: string;
  reason: string;
  bannedAt: Date;
  expiresAt: Date;
  active: boolean;
  autoGenerated?: boolean;
  bannedBy?: string;
}
```

## Security Features

### 1. Input Validation
- All inputs are validated and sanitized
- XSS protection on all text fields
- SQL injection prevention
- NoSQL injection prevention

### 2. Privacy Protection
- IP addresses are hashed for privacy
- User data is minimized in logs
- GDPR compliance considerations
- Data retention policies

### 3. Bypass Prevention
- Multiple tracking mechanisms (IP + User + Session)
- Browser fingerprinting resistance
- VPN/Proxy detection
- Rate limit stacking prevention

### 4. Monitoring
- Real-time violation alerts
- Suspicious pattern detection
- Automated threat response
- Comprehensive logging

## Testing

### Unit Tests
```bash
npm run test -- rate-limiting.test.ts
```

### Integration Tests
```bash
npm run test:integration -- rate-limiting
```

### Security Tests
```bash
npm run test:security -- rate-limiting
```

## Configuration

### Environment Variables
```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_STRICT_MODE=false
AUTO_BAN_ENABLED=true
IP_GEOLOCATION_ENABLED=true
```

### Firebase Rules
The system includes comprehensive Firestore security rules:
- Rate limit violation logging
- Ban management collections
- Admin-only write access
- User privacy protection

## Monitoring & Alerts

### Metrics Tracked
- Rate limit violations per minute/hour/day
- Auto-ban triggers
- Manual ban actions
- Ban circumvention attempts
- False positive rates

### Alert Conditions
- Spike in violations (>100 per minute)
- Mass auto-ban events (>10 per hour)
- Admin ban actions
- System errors or failures

## Best Practices

### 1. Rate Limit Design
- Set appropriate limits for each action type
- Consider user experience impact
- Implement graceful degradation
- Provide clear error messages

### 2. Ban Management
- Document all manual bans with clear reasons
- Set appropriate ban durations
- Monitor for false positives
- Implement appeal processes

### 3. Security
- Regular security audits
- Monitor for new attack vectors
- Update rate limits based on usage patterns
- Coordinate with other security measures

### 4. Performance
- Efficient database queries
- Caching for frequently checked bans
- Asynchronous processing
- Resource usage monitoring

## Troubleshooting

### Common Issues

1. **False Positives**: Legitimate users getting banned
   - Solution: Review rate limits, implement whitelist
   
2. **Performance Issues**: Rate limiting causing slowdowns
   - Solution: Optimize queries, implement caching
   
3. **Bypass Attempts**: Users circumventing bans
   - Solution: Enhanced tracking, stricter validation

4. **Admin Access**: Admins locked out by rate limits
   - Solution: Admin bypass mechanisms, emergency access

### Debug Commands
```bash
# Check rate limit status
npm run debug:rate-limits

# View active bans
npm run debug:bans

# Monitor violations
npm run debug:violations
```

## Future Enhancements

### Planned Features
- Machine learning for anomaly detection
- Geographic IP blocking
- Advanced bot detection
- Reputation scoring system
- Integration with external threat feeds

### API Extensions
- REST API for external monitoring
- Webhook notifications
- Bulk ban import/export
- Advanced analytics dashboard

## Support

For issues or questions regarding the rate limiting system:

1. Check the troubleshooting section
2. Review system logs
3. Contact the development team
4. Submit a bug report with detailed information

---

**Note**: This system is designed to be both secure and user-friendly. Regular monitoring and adjustment of rate limits ensures optimal performance while maintaining security. 