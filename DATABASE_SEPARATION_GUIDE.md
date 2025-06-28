# Database Separation Implementation Guide

## Overview

This guide documents the implementation of clean separation between user-side and admin-side database operations to resolve Firebase rules conflicts and improve security.

## Architecture Changes

### Before: Shared Collections (Problematic)
```
items/          - Mixed user and admin operations
actionLogs/     - Mixed logging
users/          - Basic user profiles
sales/          - Server-only but conflicted rules
orders/         - Server-only but conflicted rules
```

### After: Separated Collections (Clean)

#### 🔵 User-Side Collections (User Read/Write)
```
userItems/{userId}/items/{itemId}     - User's item drafts
userCarts/{userId}                    - User's cart data  
userBookmarks/{userId}                - User's bookmarks
userActions/{userId}/actions/{id}     - User's action history
userPurchases/{userId}/orders/{id}    - User's purchase history (local copy)
```

#### 🟢 Public Collections (Controlled Access)
```
items/{itemId}                        - Live items only (server writes, public reads)
users/{userId}                        - User profiles (user write own, admin read all)
```

#### 🔴 Admin-Only Collections
```
pendingItems/{itemId}                 - Items awaiting admin approval
adminActions/{actionId}               - Admin action logs
sales/{saleId}                        - Sales records (server-only write)
orders/{orderId}                      - Order records (server-only write)
store_credits/{creditId}              - Store credits (server-only write)
refunds/{refundId}                    - Refund records (admin-only)
```

## Key Improvements

### 1. **Clean Permission Boundaries**
- **User operations** → User-specific subcollections
- **Admin operations** → Admin-only collections  
- **Server operations** → Server-only collections with admin credentials

### 2. **Proper Server Authentication**
- ✅ Firebase Admin Service Account configured
- ✅ Server uses admin credentials for protected operations
- ✅ Payment processing uses server authority

### 3. **Simplified Firebase Rules**
```firestore
// Clean separation example
match /userItems/{userId}/items/{itemId} {
  allow read, write: if request.auth.uid == userId;
}

match /items/{itemId} {
  allow read: if resource.data.status == 'live';
  allow write: if false; // Server-only
}
```

## Implementation Details

### User Item Creation Flow

**Old Flow (Problematic):**
```
User creates item → items/ collection (status: 'pending') → Admin approves
```

**New Flow (Clean):**
```
1. User creates item → userItems/{userId}/items/ (status: 'draft')
2. User submits item → Server moves to pendingItems/ (status: 'pending')  
3. Admin approves → Server moves to items/ (status: 'live')
```

### Purchase Flow

**Server-side processing with proper auth:**
```
1. User adds to cart → userCarts/{userId}
2. User checks out → Server API (with admin credentials)
3. Server updates items/{itemId} (status: 'sold')
4. Server creates sales/{saleId}
5. Server creates orders/{orderId}
6. Server creates userPurchases/{userId}/orders/ (user copy)
```

## New API Endpoints

### User Endpoints
```
POST /api/user/submit-item
- Moves user draft to pending review
- Requires user authentication
```

### Admin Endpoints
```
POST /api/admin/approve-item  
- Moves pending item to live
- Requires admin authentication

POST /api/admin/update-item-status
- Updates item status
- Requires admin authentication
```

### Server Endpoints
```
POST /api/process-payment
- Processes payments with server admin authority
- Creates sales, orders, credits
```

## Security Improvements

### 1. **Service Account Protection**
```bash
# Service account key secured
server/serviceAccountKey.json  # Added to .gitignore
```

### 2. **Collection-Level Security**
- Users can't write to `items/` directly
- Users can't create fake `sales/` or `orders/`
- Admins can't interfere with user personal data

### 3. **Rate Limiting Collections**
```
banned_ips/{ipId}
banned_users/{userId}  
rate_limit_violations/{violationId}
```

## Testing the New Architecture

### 1. **Test User Item Creation**
```javascript
// User creates item draft
const itemId = await saveUserItem(userId, itemData);

// User submits for review  
await fetch('/api/user/submit-item', {
  method: 'POST',
  body: JSON.stringify({ item_id: itemId })
});
```

### 2. **Test Admin Approval**
```javascript
// Admin approves pending item
await fetch('/api/admin/approve-item', {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ pending_item_id: pendingId })
});
```

### 3. **Test Payment Processing**
```javascript
// Payment with server authority
await fetch('/api/process-payment', {
  method: 'POST',
  body: JSON.stringify(paymentData)
});
```

## Migration Strategy

### Phase 1: Server Setup ✅
- [x] Firebase Admin Service Account configured
- [x] Server authentication updated
- [x] New Firebase rules deployed

### Phase 2: User Operations
- [x] User service updated for new collections
- [x] AddItemModal updated to use user collections
- [ ] Update cart operations to use userCarts/
- [ ] Update bookmark operations to use userBookmarks/

### Phase 3: Admin Operations  
- [ ] Update AdminModal to use pendingItems/
- [ ] Update admin analytics to use admin collections
- [ ] Migrate existing admin workflows

### Phase 4: Data Migration
- [ ] Migrate existing items to appropriate collections
- [ ] Clean up old shared collections
- [ ] Verify all operations work correctly

## Troubleshooting

### Firebase Rules Errors
If you see permission denied errors:

1. **Check collection path**: Ensure using user-specific paths
2. **Verify authentication**: Check user is properly authenticated  
3. **Review rules**: Ensure rules match new collection structure

### Server Authentication Issues
If server operations fail:

1. **Verify service account**: Check `serviceAccountKey.json` exists
2. **Check credentials**: Ensure Firebase project ID matches
3. **Review logs**: Check server logs for initialization errors

### Collection Access Problems
If users can't access their data:

1. **Check user ID**: Ensure using correct user identifier
2. **Verify subcollections**: Check collection path structure
3. **Test rules**: Use Firebase Rules simulator

## Benefits Achieved

### 🚀 **Performance**
- Reduced rule complexity
- Faster permission checks
- Cleaner data access patterns

### 🔒 **Security** 
- Clear permission boundaries
- Server-only sensitive operations
- Protected service account credentials

### 🛠️ **Maintainability**
- Separated concerns
- Easier to debug
- Clearer data flows

### 📊 **Scalability**
- User-specific subcollections scale better
- Reduced cross-collection queries
- Better Firebase billing optimization

## Next Steps

1. **Deploy new rules** to Firebase Console
2. **Update frontend components** to use new user service functions
3. **Test thoroughly** with both user and admin accounts
4. **Monitor performance** and adjust as needed
5. **Plan data migration** for existing items

This architecture provides a solid foundation for secure, scalable user and admin operations without Firebase rules conflicts. 