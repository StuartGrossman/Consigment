"""
Admin Routes for Summit Gear Exchange API

This module contains all admin-related endpoints including item management,
user management, analytics, and system administration.
"""

from fastapi import APIRouter, HTTPException, Depends, Request, status
from firebase_init import db
from auth import verify_admin_access
from models import ItemStatusUpdate, BulkStatusUpdate, RefundRequest
from utils import calculate_earnings, generate_barcode_data, get_timestamp
import logging
from datetime import datetime, timezone
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/sales-summary")
async def get_sales_summary(admin_data: dict = Depends(verify_admin_access)):
    """Get sales summary for admin dashboard"""
    try:
        # Get all completed orders
        orders_ref = db.collection('orders')
        completed_orders = orders_ref.where('status', '==', 'completed').get()
        
        total_sales = 0
        total_commission = 0
        items_sold = 0
        
        for order_doc in completed_orders:
            order_data = order_doc.to_dict()
            order_total = order_data.get('totalAmount', 0)
            total_sales += order_total
            
            # Calculate commission from items
            for item in order_data.get('items', []):
                items_sold += 1
                item_price = item.get('price', 0)
                earnings = calculate_earnings(item_price)
                total_commission += earnings['store_commission']
        
        return {
            "total_sales": round(total_sales, 2),
            "total_commission": round(total_commission, 2),
            "items_sold": items_sold,
            "orders_completed": len(completed_orders)
        }
        
    except Exception as e:
        logger.error(f"Error getting sales summary: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get sales summary: {str(e)}"
        )


@router.post("/approve-item")
async def approve_pending_item(
    approval_data: dict,
    admin_data: dict = Depends(verify_admin_access)
):
    """Approve a pending item"""
    try:
        item_id = approval_data.get('item_id')
        admin_notes = approval_data.get('admin_notes', '')
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID is required"
            )
        
        # Get item
        item_doc = db.collection('items').document(item_id).get()
        if not item_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        item_data = item_doc.to_dict()
        
        # Check if item is pending
        if item_data.get('status') != 'pending':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only pending items can be approved"
            )
        
        # Update item status
        update_data = {
            'status': 'approved',
            'approvedAt': datetime.now(timezone.utc),
            'approvedBy': admin_data.get('uid'),
            'adminNotes': admin_notes
        }
        
        db.collection('items').document(item_id).update(update_data)
        
        logger.info(f"Admin {admin_data.get('email')} approved item {item_id}")
        
        return {
            "success": True,
            "message": "Item approved successfully",
            "item_id": item_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve item: {str(e)}"
        )


@router.post("/bulk-update-status")
async def bulk_update_item_status(request: Request):
    """Bulk update item statuses"""
    try:
        data = await request.json()
        item_ids = data.get('item_ids', [])
        new_status = data.get('new_status')
        admin_notes = data.get('admin_notes', '')
        
        if not item_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No item IDs provided"
            )
        
        if not new_status:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New status is required"
            )
        
        # Validate status
        valid_statuses = ['pending', 'approved', 'live', 'sold', 'rejected', 'archived']
        if new_status not in valid_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
            )
        
        # Update items in batch
        batch = db.batch()
        updated_count = 0
        
        for item_id in item_ids:
            item_ref = db.collection('items').document(item_id)
            item_doc = item_ref.get()
            
            if item_doc.exists:
                update_data = {
                    'status': new_status,
                    'updatedAt': datetime.now(timezone.utc)
                }
                
                if admin_notes:
                    update_data['adminNotes'] = admin_notes
                
                if new_status == 'approved':
                    update_data['approvedAt'] = datetime.now(timezone.utc)
                elif new_status == 'rejected':
                    update_data['rejectedAt'] = datetime.now(timezone.utc)
                
                batch.update(item_ref, update_data)
                updated_count += 1
        
        batch.commit()
        
        logger.info(f"Bulk updated {updated_count} items to status: {new_status}")
        
        return {
            "success": True,
            "message": f"Successfully updated {updated_count} items",
            "updated_count": updated_count,
            "new_status": new_status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk update: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to bulk update items: {str(e)}"
        )


@router.post("/update-item-with-barcode")
async def update_item_with_barcode(request: Request):
    """Update item and generate barcode"""
    try:
        data = await request.json()
        item_id = data.get('item_id')
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID is required"
            )
        
        # Generate barcode
        barcode_data = generate_barcode_data()
        
        # Update item
        update_data = {
            'barcodeData': barcode_data,
            'barcodeGeneratedAt': datetime.now(timezone.utc),
            'updatedAt': datetime.now(timezone.utc)
        }
        
        # Add any other updates from request
        updatable_fields = ['title', 'brand', 'category', 'size', 'color', 'condition', 'price', 'description']
        for field in updatable_fields:
            if field in data:
                update_data[field] = data[field]
        
        db.collection('items').document(item_id).update(update_data)
        
        logger.info(f"Updated item {item_id} with barcode {barcode_data}")
        
        return {
            "success": True,
            "message": "Item updated with barcode",
            "item_id": item_id,
            "barcode_data": barcode_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating item with barcode: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update item with barcode: {str(e)}"
        )


@router.post("/reject-item")
async def reject_item(request: Request):
    """Reject an item with reason"""
    try:
        data = await request.json()
        item_id = data.get('item_id')
        rejection_reason = data.get('rejection_reason', '')
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID is required"
            )
        
        # Get item
        item_doc = db.collection('items').document(item_id).get()
        if not item_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Update item status
        update_data = {
            'status': 'rejected',
            'rejectedAt': datetime.now(timezone.utc),
            'rejectionReason': rejection_reason,
            'updatedAt': datetime.now(timezone.utc)
        }
        
        db.collection('items').document(item_id).update(update_data)
        
        logger.info(f"Rejected item {item_id} with reason: {rejection_reason}")
        
        return {
            "success": True,
            "message": "Item rejected successfully",
            "item_id": item_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject item: {str(e)}"
        )


@router.post("/edit-item")
async def edit_item(request: Request):
    """Edit item details"""
    try:
        data = await request.json()
        item_id = data.get('item_id')
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID is required"
            )
        
        # Get item
        item_doc = db.collection('items').document(item_id).get()
        if not item_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Update allowed fields
        update_data = {}
        editable_fields = [
            'title', 'brand', 'category', 'size', 'color', 'condition',
            'originalPrice', 'price', 'description', 'material', 'gender',
            'images', 'tags', 'adminNotes'
        ]
        
        for field in editable_fields:
            if field in data:
                update_data[field] = data[field]
        
        if update_data:
            update_data['updatedAt'] = datetime.now(timezone.utc)
            db.collection('items').document(item_id).update(update_data)
            
            logger.info(f"Admin edited item {item_id}")
            
            return {
                "success": True,
                "message": "Item updated successfully",
                "item_id": item_id,
                "updated_fields": list(update_data.keys())
            }
        else:
            return {
                "success": True,
                "message": "No changes made"
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error editing item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to edit item: {str(e)}"
        )


@router.post("/make-item-live")
async def make_item_live(request: Request):
    """Make approved item live for sale"""
    try:
        data = await request.json()
        item_id = data.get('item_id')
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID is required"
            )
        
        # Get item
        item_doc = db.collection('items').document(item_id).get()
        if not item_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        item_data = item_doc.to_dict()
        
        # Check if item is approved
        if item_data.get('status') != 'approved':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only approved items can be made live"
            )
        
        # Update item status
        update_data = {
            'status': 'live',
            'liveAt': datetime.now(timezone.utc),
            'updatedAt': datetime.now(timezone.utc)
        }
        
        db.collection('items').document(item_id).update(update_data)
        
        logger.info(f"Made item {item_id} live for sale")
        
        return {
            "success": True,
            "message": "Item is now live for sale",
            "item_id": item_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error making item live: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to make item live: {str(e)}"
        )


@router.post("/toggle-admin-status")
async def toggle_admin_status(request: Request):
    """Toggle user's admin status"""
    try:
        data = await request.json()
        user_id = data.get('user_id')
        is_admin = data.get('is_admin', False)
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID is required"
            )
        
        # Update user admin status
        user_ref = db.collection('users').document(user_id)
        user_ref.update({
            'isAdmin': is_admin,
            'updatedAt': datetime.now(timezone.utc)
        })
        
        action = "granted" if is_admin else "revoked"
        logger.info(f"Admin access {action} for user {user_id}")
        
        return {
            "success": True,
            "message": f"Admin access {action} successfully",
            "user_id": user_id,
            "is_admin": is_admin
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling admin status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to toggle admin status: {str(e)}"
        )


@router.get("/get-all-users")
async def get_all_users(request: Request):
    """Get all users for admin management"""
    try:
        users = []
        users_ref = db.collection('users')
        
        for user_doc in users_ref.stream():
            user_data = user_doc.to_dict()
            user_data['id'] = user_doc.id
            users.append(user_data)
        
        logger.info(f"Retrieved {len(users)} users for admin")
        
        return {
            "success": True,
            "users": users,
            "total_count": len(users)
        }
        
    except Exception as e:
        logger.error(f"Error getting all users: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get users: {str(e)}"
        )


@router.post("/ban-user")
async def ban_user(request: Request):
    """Ban or unban a user"""
    try:
        data = await request.json()
        user_id = data.get('user_id')
        is_banned = data.get('is_banned', True)
        ban_reason = data.get('ban_reason', '')
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID is required"
            )
        
        # Update user ban status
        update_data = {
            'isBanned': is_banned,
            'updatedAt': datetime.now(timezone.utc)
        }
        
        if is_banned:
            update_data['bannedAt'] = datetime.now(timezone.utc)
            update_data['banReason'] = ban_reason
        else:
            update_data['unbannedAt'] = datetime.now(timezone.utc)
        
        db.collection('users').document(user_id).update(update_data)
        
        action = "banned" if is_banned else "unbanned"
        logger.info(f"User {user_id} {action}")
        
        return {
            "success": True,
            "message": f"User {action} successfully",
            "user_id": user_id,
            "is_banned": is_banned
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error banning user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ban user: {str(e)}"
        )


@router.post("/issue-refund")
async def issue_refund(request: Request):
    """Issue a refund for an order"""
    try:
        data = await request.json()
        order_id = data.get('order_id')
        refund_amount = data.get('refund_amount')
        refund_reason = data.get('refund_reason', '')
        refund_method = data.get('refund_method', 'store_credit')
        
        if not order_id or not refund_amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Order ID and refund amount are required"
            )
        
        # Get order
        order_doc = db.collection('orders').document(order_id).get()
        if not order_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found"
            )
        
        order_data = order_doc.to_dict()
        customer_id = order_data.get('customerId')
        
        if not customer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer ID not found in order"
            )
        
        # Process refund based on method
        if refund_method == 'store_credit':
            # Add store credit
            store_credit_data = {
                'userId': customer_id,
                'amount': refund_amount,
                'description': f'Refund for order {order_id}: {refund_reason}',
                'type': 'refund',
                'createdAt': datetime.now(timezone.utc),
                'orderId': order_id
            }
            db.collection('storeCredit').add(store_credit_data)
        
        # Update order with refund info
        refund_data = {
            'refundIssued': True,
            'refundAmount': refund_amount,
            'refundMethod': refund_method,
            'refundReason': refund_reason,
            'refundedAt': datetime.now(timezone.utc)
        }
        
        db.collection('orders').document(order_id).update(refund_data)
        
        logger.info(f"Issued ${refund_amount} refund for order {order_id}")
        
        return {
            "success": True,
            "message": f"Refund of ${refund_amount} issued successfully",
            "order_id": order_id,
            "refund_amount": refund_amount,
            "refund_method": refund_method
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error issuing refund: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to issue refund: {str(e)}"
        )


@router.get("/search-customers")
async def search_customers(q: str, admin_data: dict = Depends(verify_admin_access)):
    """Search customers by name or email"""
    try:
        # Simple search through users collection
        users_ref = db.collection('users')
        users = users_ref.stream()
        
        matching_customers = []
        search_term = q.lower()
        
        for user_doc in users:
            user_data = user_doc.to_dict()
            user_data['id'] = user_doc.id
            
            # Search in name and email
            name = user_data.get('name', '').lower()
            email = user_data.get('email', '').lower()
            
            if search_term in name or search_term in email:
                matching_customers.append({
                    'id': user_data['id'],
                    'name': user_data.get('name', ''),
                    'email': user_data.get('email', ''),
                    'createdAt': user_data.get('createdAt'),
                    'isAdmin': user_data.get('isAdmin', False),
                    'isBanned': user_data.get('isBanned', False)
                })
        
        return {
            "success": True,
            "customers": matching_customers,
            "total_found": len(matching_customers)
        }
        
    except Exception as e:
        logger.error(f"Error searching customers: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search customers: {str(e)}"
        )


@router.get("/debug-barcodes")
async def debug_barcodes(admin_data: dict = Depends(verify_admin_access)):
    """Debug barcode generation and lookup"""
    try:
        # Get sample items with barcodes
        items_ref = db.collection('items')
        items_with_barcodes = items_ref.where('barcodeData', '!=', '').limit(10).get()
        
        barcode_info = []
        for item_doc in items_with_barcodes:
            item_data = item_doc.to_dict()
            barcode_info.append({
                'item_id': item_doc.id,
                'title': item_data.get('title', ''),
                'barcode_data': item_data.get('barcodeData', ''),
                'barcode_generated_at': item_data.get('barcodeGeneratedAt'),
                'status': item_data.get('status', '')
            })
        
        return {
            "success": True,
            "items_with_barcodes": barcode_info,
            "total_found": len(barcode_info)
        }
        
    except Exception as e:
        logger.error(f"Error debugging barcodes: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to debug barcodes: {str(e)}"
        )


@router.get("/lookup-item-by-barcode/{barcode_data}")
async def lookup_item_by_barcode(barcode_data: str, admin_data: dict = Depends(verify_admin_access)):
    """Look up item by barcode data"""
    try:
        # Search for item with this barcode
        items_ref = db.collection('items')
        items_query = items_ref.where('barcodeData', '==', barcode_data).get()
        
        items = []
        for item_doc in items_query:
            item_data = item_doc.to_dict()
            item_data['id'] = item_doc.id
            items.append(item_data)
        
        if not items:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No item found with barcode: {barcode_data}"
            )
        
        return {
            "success": True,
            "items": items,
            "barcode_data": barcode_data,
            "found_count": len(items)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error looking up barcode {barcode_data}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to lookup barcode: {str(e)}"
        ) 