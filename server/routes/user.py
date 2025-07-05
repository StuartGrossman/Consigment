"""
User Routes for Summit Gear Exchange API

This module contains all user-related endpoints including item submission,
purchases, store credit, and rewards.
"""

from fastapi import APIRouter, HTTPException, Depends, Request, status
from firebase_init import db
from auth import verify_firebase_token, verify_unbanned_user, get_current_user
from models import ConsignmentItem
from utils import calculate_earnings, generate_order_number, get_timestamp
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["user"])


@router.post("/submit-item")
async def submit_user_item(
    item_submission: dict,
    user_data: dict = Depends(verify_unbanned_user)
):
    """Submit a new item for consignment"""
    try:
        logger.info(f"User {user_data.get('email')} submitting item: {item_submission.get('title', 'Unknown')}")
        
        # Generate unique item ID
        import uuid
        item_id = str(uuid.uuid4())
        
        # Prepare item data with user info
        item_data = {
            'id': item_id,
            'title': item_submission.get('title', ''),
            'brand': item_submission.get('brand', ''),
            'category': item_submission.get('category', ''),
            'size': item_submission.get('size', ''),
            'color': item_submission.get('color', ''),
            'condition': item_submission.get('condition', 'Good'),
            'originalPrice': float(item_submission.get('originalPrice', 0)),
            'price': float(item_submission.get('price', 0)),
            'description': item_submission.get('description', ''),
            'material': item_submission.get('material', ''),
            'gender': item_submission.get('gender', ''),
            'sellerEmail': user_data.get('email', ''),
            'sellerPhone': item_submission.get('sellerPhone', ''),
            'sellerId': user_data.get('uid'),
            'sellerName': user_data.get('name', 'Unknown'),
            'status': 'pending',
            'images': item_submission.get('images', []),
            'tags': item_submission.get('tags', []),
            'createdAt': datetime.now(timezone.utc),
            'submittedAt': datetime.now(timezone.utc)
        }
        
        # Save to database
        db.collection('items').document(item_id).set(item_data)
        
        logger.info(f"Successfully saved item {item_id} for user {user_data.get('email')}")
        
        return {
            "success": True,
            "message": "Item submitted successfully for approval",
            "item_id": item_id,
            "status": "pending"
        }
        
    except Exception as e:
        logger.error(f"Error submitting item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit item: {str(e)}"
        )


@router.delete("/remove-item/{item_id}")
async def remove_user_item(item_id: str, request: Request):
    """Remove user's own item"""
    try:
        # Get user data from request
        user_data = await verify_firebase_token()
        
        # Get item to verify ownership
        item_doc = db.collection('items').document(item_id).get()
        if not item_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        item_data = item_doc.to_dict()
        
        # Verify user owns this item
        if item_data.get('sellerId') != user_data.get('uid'):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only remove your own items"
            )
        
        # Check if item can be removed (not sold)
        if item_data.get('status') == 'sold':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove sold items"
            )
        
        # Remove item
        db.collection('items').document(item_id).delete()
        
        logger.info(f"User {user_data.get('email')} removed item {item_id}")
        
        return {
            "success": True,
            "message": "Item removed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing item {item_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove item: {str(e)}"
        )


@router.put("/update-item/{item_id}")
async def update_user_item(item_id: str, request: Request):
    """Update user's own item"""
    try:
        data = await request.json()
        user_data = await verify_firebase_token()
        
        # Get item to verify ownership
        item_doc = db.collection('items').document(item_id).get()
        if not item_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        item_data = item_doc.to_dict()
        
        # Verify user owns this item
        if item_data.get('sellerId') != user_data.get('uid'):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own items"
            )
        
        # Check if item can be updated (pending or approved only)
        if item_data.get('status') in ['sold', 'rejected']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update sold or rejected items"
            )
        
        # Update allowed fields
        update_data = {}
        updatable_fields = [
            'title', 'brand', 'category', 'size', 'color', 'condition',
            'originalPrice', 'price', 'description', 'material', 'gender',
            'sellerPhone', 'images', 'tags'
        ]
        
        for field in updatable_fields:
            if field in data:
                update_data[field] = data[field]
        
        if update_data:
            update_data['updatedAt'] = datetime.now(timezone.utc)
            # Reset to pending if approved item is updated
            if item_data.get('status') == 'approved':
                update_data['status'] = 'pending'
            
            db.collection('items').document(item_id).update(update_data)
            
            logger.info(f"User {user_data.get('email')} updated item {item_id}")
            
            return {
                "success": True,
                "message": "Item updated successfully",
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
        logger.error(f"Error updating item {item_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update item: {str(e)}"
        )


@router.get("/store-credit")
async def get_user_store_credit(request: Request):
    """Get user's store credit balance and transaction history"""
    try:
        # Get user data from Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header required"
            )
        
        token = auth_header.split(' ')[1]
        
        # Verify token
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token.get('uid')
        user_email = decoded_token.get('email')
        
        logger.info(f"Getting store credit for user {user_id} ({user_email})")
        
        # Get store credit transaction history
        transactions = []
        try:
            # Use simple query without ordering to avoid index requirement  
            transactions_query = db.collection('storeCredit').where('userId', '==', user_id).get()
            
            for transaction_doc in transactions_query:
                transaction_data = transaction_doc.to_dict()
                transactions.append({
                    'id': transaction_doc.id,
                    'amount': transaction_data.get('amount', 0),
                    'description': transaction_data.get('description', ''),
                    'createdAt': transaction_data.get('createdAt'),
                    'type': transaction_data.get('type', 'credit')
                })
                
        except Exception as e:
            logger.error(f"Error fetching store credit transactions: {e}")
            # Continue with empty transactions list
        
        # Calculate current balance
        current_balance = sum(t['amount'] for t in transactions)
        
        logger.info(f"Found ${current_balance} store credit balance and {len(transactions)} transactions for user {user_email}")
        
        return {
            "success": True,
            "current_balance": current_balance,
            "transactions": transactions,
            "user_id": user_id
        }
        
    except Exception as e:
        logger.error(f"Error getting user store credit: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get store credit: {str(e)}"
        )


@router.get("/purchases")
async def get_user_purchases(request: Request):
    """Get user's purchase history"""
    try:
        # Get user data from Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header required"
            )
        
        token = auth_header.split(' ')[1]
        
        # Verify token
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token.get('uid')
        user_email = decoded_token.get('email')
        
        logger.info(f"Getting purchases for user {user_id} ({user_email})")
        
        # Get user's orders
        orders = []
        try:
            orders_query = db.collection('orders').where('customerId', '==', user_id).get()
            
            for order_doc in orders_query:
                order_data = order_doc.to_dict()
                orders.append({
                    'id': order_doc.id,
                    'order_number': order_data.get('orderNumber', ''),
                    'total_amount': order_data.get('totalAmount', 0),
                    'status': order_data.get('status', 'pending'),
                    'fulfillment_method': order_data.get('fulfillmentMethod', 'pickup'),
                    'items': order_data.get('items', []),
                    'created_at': order_data.get('createdAt'),
                    'customer_info': order_data.get('customerInfo', {})
                })
                
        except Exception as e:
            logger.error(f"Error fetching user purchases: {e}")
            # Continue with empty orders list
        
        logger.info(f"Found {len(orders)} orders for user {user_email}")
        
        return {
            "success": True,
            "orders": orders,
            "total_orders": len(orders),
            "user_id": user_id
        }
        
    except Exception as e:
        logger.error(f"Error getting user purchases: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get purchases: {str(e)}"
        )


@router.post("/redeem-points")
async def redeem_rewards_points(request: Request, user_data: dict = Depends(verify_firebase_token)):
    """Redeem reward points for store credit"""
    try:
        data = await request.json()
        points_to_redeem = data.get('points', 0)
        
        if points_to_redeem <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Points to redeem must be greater than 0"
            )
        
        user_id = user_data.get('uid')
        
        # Get current user rewards info
        rewards_doc = db.collection('rewards').document(user_id).get()
        if not rewards_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No rewards account found"
            )
        
        rewards_data = rewards_doc.to_dict()
        current_points = rewards_data.get('points', 0)
        
        if current_points < points_to_redeem:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient points. Available: {current_points}, Requested: {points_to_redeem}"
            )
        
        # Get rewards configuration
        config_doc = db.collection('rewards_config').document('default').get()
        config = config_doc.to_dict() if config_doc.exists else {}
        redemption_rate = config.get('redemption_rate', 100)  # 100 points = $1
        min_redemption = config.get('minimum_redemption_points', 100)
        
        if points_to_redeem < min_redemption:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Minimum redemption is {min_redemption} points"
            )
        
        # Calculate store credit amount
        store_credit_amount = points_to_redeem / redemption_rate
        
        # Start transaction
        from firebase_admin import firestore
        transaction = db.transaction()
        
        @firestore.transactional
        def redeem_transaction(transaction):
            # Deduct points
            new_points = current_points - points_to_redeem
            transaction.update(rewards_doc.reference, {
                'points': new_points,
                'lastRedemption': datetime.now(timezone.utc),
                'totalRedeemed': rewards_data.get('totalRedeemed', 0) + points_to_redeem
            })
            
            # Add store credit
            store_credit_ref = db.collection('storeCredit').document()
            transaction.set(store_credit_ref, {
                'userId': user_id,
                'amount': store_credit_amount,
                'description': f'Redeemed {points_to_redeem} reward points',
                'type': 'redemption',
                'createdAt': datetime.now(timezone.utc),
                'pointsRedeemed': points_to_redeem
            })
        
        redeem_transaction(transaction)
        
        logger.info(f"User {user_data.get('email')} redeemed {points_to_redeem} points for ${store_credit_amount}")
        
        return {
            "success": True,
            "message": f"Successfully redeemed {points_to_redeem} points",
            "store_credit_earned": store_credit_amount,
            "remaining_points": current_points - points_to_redeem
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error redeeming points: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to redeem points: {str(e)}"
        )


@router.get("/rewards-info")
async def get_user_rewards_info(user_data: dict = Depends(verify_firebase_token)):
    """Get user's rewards information"""
    try:
        user_id = user_data.get('uid')
        
        # Get rewards data
        rewards_doc = db.collection('rewards').document(user_id).get()
        if not rewards_doc.exists:
            # Create new rewards account
            initial_rewards = {
                'userId': user_id,
                'points': 0,
                'totalEarned': 0,
                'totalRedeemed': 0,
                'createdAt': datetime.now(timezone.utc)
            }
            db.collection('rewards').document(user_id).set(initial_rewards)
            rewards_data = initial_rewards
        else:
            rewards_data = rewards_doc.to_dict()
        
        # Get rewards configuration
        config_doc = db.collection('rewards_config').document('default').get()
        config = config_doc.to_dict() if config_doc.exists else {
            'points_per_dollar_spent': 1,
            'points_per_dollar_sold': 2,
            'redemption_rate': 100,
            'minimum_redemption_points': 100
        }
        
        return {
            "success": True,
            "rewards": {
                "current_points": rewards_data.get('points', 0),
                "total_earned": rewards_data.get('totalEarned', 0),
                "total_redeemed": rewards_data.get('totalRedeemed', 0),
                "points_value": rewards_data.get('points', 0) / config.get('redemption_rate', 100)
            },
            "config": config
        }
        
    except Exception as e:
        logger.error(f"Error getting rewards info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get rewards info: {str(e)}"
        ) 