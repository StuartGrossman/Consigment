# In-Store Pickup Flow with Online Payment

## Overview
This document describes the complete in-store pickup flow that allows customers to pay online for items and pick them up in-store, with proper tracking and status management.

## Flow Summary

### 1. Online Payment for Pickup
When a customer selects "Pickup" and "Online Payment":
- Items are added to **Orders** collection with `pickupStatus: 'pending_pickup'`
- Items are added to **Sold Items** collection with `status: 'sold'` and `pickupStatus: 'pending_pickup'`
- Items appear in **In-Store Pickup** section for admin management

### 2. Admin Management
Admins can view all pickup items in the Analytics dashboard under "In-Store Pickup" tab:
- **Pending Payment Items**: Items reserved but not yet paid (in-store payment required)
- **Paid Online Items**: Items paid online and ready for pickup

### 3. Pickup Confirmation
When admin clicks "Mark Picked Up" for paid online items:
- Item `pickupStatus` is updated to `'picked_up'`
- Item is removed from in-store pickup queue
- Order status is updated to reflect pickup completion
- Sales record is updated with pickup information

## Backend Implementation

### Payment Processing (`/api/process-payment`)
```python
# For online payment + pickup
if payment_request.payment_type == 'online' and payment_request.fulfillment_method == 'pickup':
    item_status = 'sold'
    payment_status = 'completed'
    payment_method = 'Credit Card'
    pickup_status = 'pending_pickup'
```

### In-Store Pickup Items Endpoint (`/api/admin/in-store-pickup-items`)
- Returns both pending payment and paid online items
- Includes pickup type classification
- Shows time remaining for pending items

### Mark as Picked Up Endpoint (`/api/admin/mark-item-picked-up`)
- Updates item pickup status to `'picked_up'`
- Updates sales record
- Updates order status
- Logs admin action

## Frontend Implementation

### Analytics Dashboard
- **In-Store Pickup Tab**: Shows all pickup items with status indicators
- **Pickup Type Column**: Distinguishes between "Paid Online" and "Pending Payment"
- **Actions Column**: 
  - "Add to Cart" for pending payment items
  - "Mark Picked Up" for paid online items

### API Service
- `markItemPickedUp()`: Calls backend to mark items as picked up
- Enhanced `getInStorePickupItems()`: Returns items with pickup type classification

## Data Flow

### 1. Customer Purchase Flow
```
Customer selects pickup + online payment
↓
Payment processed successfully
↓
Item status: 'sold'
Payment status: 'completed'
Pickup status: 'pending_pickup'
↓
Item appears in:
- Orders collection
- Sold Items collection  
- In-Store Pickup queue
```

### 2. Admin Pickup Flow
```
Admin views In-Store Pickup tab
↓
Sees items with pickup type indicators
↓
For paid online items: clicks "Mark Picked Up"
↓
Backend updates:
- Item pickup status: 'picked_up'
- Sales record pickup status
- Order pickup status
↓
Item removed from pickup queue
```

## Status Tracking

### Item Statuses
- `reserved_for_pickup`: Reserved but payment pending
- `sold`: Paid and ready for pickup
- `pickupStatus: 'pending_pickup'`: Paid online, waiting for pickup
- `pickupStatus: 'picked_up'`: Successfully picked up

### Pickup Types
- `paid_online`: Customer paid online, ready for pickup
- `pending_payment`: Reserved for pickup, payment required in-store

## Admin Dashboard Features

### Summary Cards
- **Pending Pickups**: Total items in pickup queue
- **Total Value**: Combined value of all pickup items
- **Expiring Soon**: Items with <6 hours remaining
- **Ready for Payment**: Items needing in-store payment

### Item Management
- **View Details**: See full item information
- **Add to Cart**: For pending payment items (in-store payment flow)
- **Mark Picked Up**: For paid online items (pickup confirmation)

## Testing the Flow

### 1. Create Online Pickup Order
1. Go to main store page
2. Add items to cart
3. Select "Pickup" and "Online Payment"
4. Complete payment process
5. Verify items appear in admin pickup queue

### 2. Admin Pickup Management
1. Go to Analytics → In-Store Pickup tab
2. Verify items show correct pickup type
3. Click "Mark Picked Up" for paid online items
4. Verify items are removed from queue
5. Check that order and sales records are updated

## Benefits

1. **Complete Tracking**: Full visibility of pickup status from payment to pickup
2. **Flexible Payment**: Supports both online and in-store payment for pickup
3. **Admin Control**: Clear interface for managing pickup process
4. **Data Integrity**: Consistent status updates across all collections
5. **User Experience**: Seamless online payment with in-store pickup option

## Future Enhancements

1. **Email Notifications**: Notify customers when items are ready for pickup
2. **Pickup Time Slots**: Allow customers to schedule pickup times
3. **QR Code Pickup**: Generate QR codes for contactless pickup
4. **Pickup History**: Track pickup patterns and optimize store operations
5. **Automated Expiry**: Auto-cancel expired pickup reservations 