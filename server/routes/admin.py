from fastapi import APIRouter, HTTPException, Depends, status, Request
from typing import List
from ..auth import verify_admin_access
from ..models import ItemStatusUpdate, BulkItemUpdate, UserBan, ItemApproval
from ..database import ItemService, UserService, OrderService
from ..utils import generate_barcode_data, generate_item_id, get_current_timestamp
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
        
        # Get the current item
        item = ItemService.get_item_by_id(item_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Update item status to approved
        success = ItemService.update_item_status(item_id, 'approved', admin_notes)
        
        if success:
            logger.info(f"Admin {admin_data.get('uid')} approved item {item_id}")
            return {
                "success": True,
                "message": "Item approved successfully",
                "item_id": item_id
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to approve item"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to approve item"
        )


@router.post("/update-item-status")
async def update_single_item_status(request: Request):
    """Update the status of a single item"""
    try:
        data = await request.json()
        item_id = data.get('item_id')
        new_status = data.get('new_status')
        admin_notes = data.get('admin_notes', '')
        
        if not item_id or not new_status:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID and new status are required"
            )
        
        success = ItemService.update_item_status(item_id, new_status, admin_notes)
        
        if success:
            return {
                "success": True,
                "message": f"Item status updated to {new_status}",
                "item_id": item_id,
                "new_status": new_status
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update item status"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating item status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update item status"
        )


@router.post("/bulk-update-status")
async def bulk_update_item_status(request: Request):
    """Bulk update the status of multiple items"""
    try:
        data = await request.json()
        item_ids = data.get('item_ids', [])
        new_status = data.get('new_status')
        admin_notes = data.get('admin_notes', '')
        
        if not item_ids or not new_status:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item IDs and new status are required"
            )
        
        updates = {'status': new_status}
        if admin_notes:
            updates['adminNotes'] = admin_notes
        
        success = ItemService.bulk_update_items(item_ids, updates)
        
        if success:
            return {
                "success": True,
                "message": f"Updated {len(item_ids)} items to {new_status}",
                "updated_count": len(item_ids)
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to bulk update items"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error bulk updating items: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to bulk update items"
        )


@router.post("/update-item-with-barcode")
async def update_item_with_barcode(request: Request):
    """Update item with barcode and status"""
    try:
        data = await request.json()
        item_id = data.get('item_id')
        new_status = data.get('new_status', 'approved')
        
        logger.info(f"Admin updating item {item_id} with barcode and status: {new_status}")
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID is required"
            )
        
        # Generate barcode
        barcode_data = generate_barcode_data()
        
        # Update item with barcode and status
        updates = {
            'status': new_status,
            'barcodeData': barcode_data,
            'barcodeGeneratedAt': get_current_timestamp()
        }
        
        success = ItemService.update_item_status(item_id, new_status)
        
        if success:
            return {
                "success": True,
                "message": f"Item updated with barcode: {barcode_data}",
                "item_id": item_id,
                "barcode_data": barcode_data,
                "status": new_status
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update item with barcode"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating item with barcode: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update item with barcode"
        )


@router.post("/reject-item")
async def reject_item(request: Request):
    """Reject an item with reason"""
    try:
        data = await request.json()
        item_id = data.get('item_id')
        rejection_reason = data.get('rejection_reason', 'No reason provided')
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID is required"
            )
        
        success = ItemService.update_item_status(item_id, 'rejected', rejection_reason)
        
        if success:
            return {
                "success": True,
                "message": "Item rejected successfully",
                "item_id": item_id,
                "reason": rejection_reason
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to reject item"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reject item"
        )


@router.post("/make-item-live")
async def make_item_live(request: Request):
    """Make an approved item live in the store"""
    try:
        data = await request.json()
        item_id = data.get('item_id')
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID is required"
            )
        
        success = ItemService.update_item_status(item_id, 'live')
        
        if success:
            return {
                "success": True,
                "message": "Item is now live in the store",
                "item_id": item_id
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to make item live"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error making item live: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to make item live"
        )


@router.post("/send-back-to-pending")
async def send_back_to_pending(request: Request):
    """Send an item back to pending status"""
    try:
        data = await request.json()
        item_id = data.get('item_id')
        reason = data.get('reason', 'Sent back for review')
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID is required"
            )
        
        success = ItemService.update_item_status(item_id, 'pending', reason)
        
        if success:
            return {
                "success": True,
                "message": "Item sent back to pending",
                "item_id": item_id
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send item back to pending"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending item back to pending: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send item back to pending"
        )


@router.get("/get-all-users")
async def get_all_users(admin_data: dict = Depends(verify_admin_access)):
    """Get all users (admin only)"""
    try:
        users = UserService.get_all_users()
        return {
            "success": True,
            "users": users,
            "count": len(users)
        }
        
    except Exception as e:
        logger.error(f"Error getting all users: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve users"
        )


@router.post("/ban-user")
async def ban_user(request: Request):
    """Ban a user (admin only)"""
    try:
        data = await request.json()
        user_id = data.get('user_id')
        reason = data.get('reason')
        duration_days = data.get('duration_days')
        
        if not user_id or not reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID and reason are required"
            )
        
        success = UserService.ban_user(user_id, reason, duration_days)
        
        if success:
            return {
                "success": True,
                "message": f"User {user_id} has been banned",
                "user_id": user_id,
                "reason": reason
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to ban user"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error banning user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to ban user"
        )


@router.get("/orders")
async def get_all_orders(admin_data: dict = Depends(verify_admin_access)):
    """Get all orders (admin only)"""
    try:
        orders = OrderService.get_all_orders()
        return {
            "success": True,
            "orders": orders,
            "count": len(orders)
        }
        
    except Exception as e:
        logger.error(f"Error getting all orders: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve orders"
        ) 