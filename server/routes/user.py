from fastapi import APIRouter, HTTPException, Depends, status, Request
from firebase_init import db
from auth import verify_firebase_token
from models import (
    CartItem, CustomerInfo, PaymentRequest, ItemStatusUpdate,
    StoreCreditTransaction
)
from utils import calculate_earnings, generate_transaction_id
from datetime import datetime, timezone
import logging
import uuid
from typing import List, Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["user"])

@router.post("/submit-item")
async def submit_user_item(
    item_submission: dict,
    user_data: dict = Depends(verify_firebase_token)
):
    """Submit a new item for consignment"""
    try:
        user_uid = user_data.get('uid')
        user_email = user_data.get('email')
        user_name = user_data.get('name', 'Unknown')
        
        logger.info(f"User {user_uid} ({user_email}) submitting new item")
        
        # Validate required fields
        required_fields = ['title', 'description', 'price', 'category']
        for field in required_fields:
            if field not in item_submission or not item_submission[field]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing required field: {field}"
                )
        
        # Create item document
        item_data = {
            'title': str(item_submission['title']).strip(),
            'description': str(item_submission['description']).strip(),
            'price': float(item_submission['price']),
            'originalPrice': float(item_submission.get('originalPrice', item_submission['price'])),
            'category': str(item_submission['category']).strip(),
            'gender': item_submission.get('gender', ''),
            'size': item_submission.get('size', ''),
            'brand': item_submission.get('brand', ''),
            'condition': item_submission.get('condition', 'Good'),
            'material': item_submission.get('material', ''),
            'color': item_submission.get('color', ''),
            'sellerId': user_uid,
            'sellerName': user_name,
            'sellerEmail': user_email,
            'sellerPhone': item_submission.get('sellerPhone', ''),
            'status': 'pending',
            'images': item_submission.get('images', []),
            'tags': item_submission.get('tags', []),
            'createdAt': datetime.now(timezone.utc),
            'notes': item_submission.get('notes', ''),
        }
        
        # Add item to database
        doc_ref = db.collection('items').add(item_data)
        item_id = doc_ref[1].id
        
        logger.info(f"Successfully created item {item_id} for user {user_uid}")
        
        return {
            "success": True,
            "message": "Item submitted successfully and is pending review",
            "item_id": item_id,
            "status": "pending"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit item: {str(e)}"
        )

@router.delete("/remove-item/{item_id}")
async def remove_user_item(item_id: str, request: Request):
    """Remove a user's item"""
    try:
        # Get authorization header for token
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No valid authorization token provided"
            )
        
        # Extract and verify token using our auth module
        from auth import verify_firebase_token_direct
        token = auth_header.replace('Bearer ', '')
        user_data = await verify_firebase_token_direct(token)
        
        user_uid = user_data.get('uid')
        logger.info(f"User {user_uid} attempting to remove item {item_id}")
        
        # Get the item to verify ownership
        item_ref = db.collection('items').document(item_id)
        item_doc = item_ref.get()
        
        if not item_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        item_data = item_doc.to_dict()
        
        # Verify user owns this item
        if item_data.get('sellerId') != user_uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only remove your own items"
            )
        
        # Only allow removal of pending or rejected items
        if item_data.get('status') not in ['pending', 'rejected']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only remove pending or rejected items"
            )
        
        # Remove the item
        item_ref.delete()
        
        logger.info(f"Successfully removed item {item_id} for user {user_uid}")
        
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
    """Update a user's item"""
    try:
        # Get authorization header for token
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No valid authorization token provided"
            )
        
        # Extract and verify token
        from auth import verify_firebase_token_direct
        token = auth_header.replace('Bearer ', '')
        user_data = await verify_firebase_token_direct(token)
        
        user_uid = user_data.get('uid')
        
        # Get request data
        update_data = await request.json()
        
        logger.info(f"User {user_uid} attempting to update item {item_id}")
        
        # Get the item to verify ownership
        item_ref = db.collection('items').document(item_id)
        item_doc = item_ref.get()
        
        if not item_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        item_data = item_doc.to_dict()
        
        # Verify user owns this item
        if item_data.get('sellerId') != user_uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own items"
            )
        
        # Only allow updates to pending or rejected items
        if item_data.get('status') not in ['pending', 'rejected']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only update pending or rejected items"
            )
        
        # Update allowed fields
        allowed_fields = [
            'title', 'description', 'price', 'originalPrice', 'category',
            'gender', 'size', 'brand', 'condition', 'material', 'color',
            'images', 'tags', 'notes', 'sellerPhone'
        ]
        
        update_fields = {}
        for field in allowed_fields:
            if field in update_data:
                if field in ['price', 'originalPrice']:
                    update_fields[field] = float(update_data[field])
                elif field in ['images', 'tags']:
                    update_fields[field] = update_data[field] if isinstance(update_data[field], list) else []
                else:
                    update_fields[field] = str(update_data[field]).strip()
        
        # Add update timestamp
        update_fields['updatedAt'] = datetime.now(timezone.utc)
        
        # If status was rejected, reset to pending
        if item_data.get('status') == 'rejected':
            update_fields['status'] = 'pending'
            update_fields['rejectedAt'] = None
            update_fields['rejectionReason'] = None
        
        # Update the item
        item_ref.update(update_fields)
        
        logger.info(f"Successfully updated item {item_id} for user {user_uid}")
        
        return {
            "success": True,
            "message": "Item updated successfully",
            "updated_fields": list(update_fields.keys())
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
async def get_user_store_credit(user_data: dict = Depends(verify_firebase_token)):
    """Get user's store credit balance and transaction history"""
    try:
        user_uid = user_data.get('uid')
        user_email = user_data.get('email')
        
        logger.info(f"Getting store credit for user {user_uid} ({user_email})")
        
        # Get user's store credit transactions
        transactions_ref = db.collection('storeCredit')
        transactions_query = transactions_ref.where('userId', '==', user_uid).order_by('createdAt', direction='desc')
        
        transactions = []
        total_balance = 0
        
        try:
            for transaction_doc in transactions_query:
                transaction_data = transaction_doc.to_dict()
                transaction_data['id'] = transaction_doc.id
                
                # Convert Firestore timestamp to datetime
                if transaction_data.get('createdAt'):
                    transaction_data['createdAt'] = transaction_data['createdAt'].replace(tzinfo=timezone.utc)
                
                transactions.append(transaction_data)
                
                # Calculate balance
                if transaction_data.get('type') in ['earned', 'added']:
                    total_balance += transaction_data.get('amount', 0)
                elif transaction_data.get('type') == 'used':
                    total_balance -= transaction_data.get('amount', 0)
        
        except Exception as query_error:
            # If query fails due to missing index, return basic info
            logger.error(f"Query failed (likely missing index): {query_error}")
            
            # Get user document for basic store credit balance
            user_doc = db.collection('users').document(user_uid).get()
            if user_doc.exists:
                user_data_doc = user_doc.to_dict()
                total_balance = user_data_doc.get('storeCredit', 0)
            
        logger.info(f"Found ${total_balance} store credit balance and {len(transactions)} transactions for user {user_email}")
        
        return {
            "balance": round(total_balance, 2),
            "transactions": transactions,
            "user_id": user_uid,
            "user_email": user_email
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
        # Get authorization header for token
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No valid authorization token provided"
            )
        
        # Extract and verify token
        from auth import verify_firebase_token_direct
        token = auth_header.replace('Bearer ', '')
        user_data = await verify_firebase_token_direct(token)
        
        user_uid = user_data.get('uid')
        user_email = user_data.get('email')
        
        logger.info(f"Getting purchase history for user {user_uid} ({user_email})")
        
        # Get user's purchases from orders collection
        orders_ref = db.collection('orders')
        orders_query = orders_ref.where('buyerId', '==', user_uid).order_by('createdAt', direction='desc')
        
        purchases = []
        
        for order_doc in orders_query:
            order_data = order_doc.to_dict()
            order_data['id'] = order_doc.id
            
            # Convert timestamps
            for timestamp_field in ['createdAt', 'shippedAt', 'deliveredAt']:
                if order_data.get(timestamp_field):
                    order_data[timestamp_field] = order_data[timestamp_field].replace(tzinfo=timezone.utc)
            
            purchases.append(order_data)
        
        logger.info(f"Found {len(purchases)} purchases for user {user_email}")
        
        return {
            "purchases": purchases,
            "total_orders": len(purchases),
            "user_id": user_uid
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user purchases: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get purchases: {str(e)}"
        )

@router.post("/redeem-points")
async def redeem_rewards_points(request: Request, user_data: dict = Depends(verify_firebase_token)):
    """Redeem rewards points for store credit"""
    try:
        data = await request.json()
        points_to_redeem = data.get('points', 0)
        
        user_uid = user_data.get('uid')
        user_email = user_data.get('email')
        user_name = user_data.get('name', 'Unknown')
        
        logger.info(f"User {user_uid} redeeming {points_to_redeem} points")
        
        if points_to_redeem <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Points to redeem must be greater than 0"
            )
        
        # Get user's current points balance
        user_ref = db.collection('users').document(user_uid)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            # Create user document if it doesn't exist
            user_ref.set({
                'email': user_email,
                'name': user_name,
                'rewardsPoints': 0,
                'storeCredit': 0,
                'createdAt': datetime.now(timezone.utc)
            })
            current_points = 0
        else:
            user_data_doc = user_doc.to_dict()
            current_points = user_data_doc.get('rewardsPoints', 0)
        
        if current_points < points_to_redeem:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient points. You have {current_points} points, but tried to redeem {points_to_redeem}"
            )
        
        # Calculate store credit (typically 1 point = $0.01)
        credit_amount = points_to_redeem * 0.01
        
        # Update user's points and store credit
        user_ref.update({
            'rewardsPoints': current_points - points_to_redeem,
            'storeCredit': db.field_value.ArrayUnion([credit_amount]) if user_doc.exists and user_doc.to_dict().get('storeCredit') else credit_amount
        })
        
        # Create store credit transaction record
        transaction_data = {
            'userId': user_uid,
            'userName': user_name,
            'userEmail': user_email,
            'amount': credit_amount,
            'type': 'earned',
            'description': f'Redeemed {points_to_redeem} rewards points',
            'createdAt': datetime.now(timezone.utc),
            'source': 'points_redemption',
            'pointsRedeemed': points_to_redeem
        }
        
        db.collection('storeCredit').add(transaction_data)
        
        logger.info(f"Successfully redeemed {points_to_redeem} points for ${credit_amount} store credit for user {user_uid}")
        
        return {
            "success": True,
            "message": f"Successfully redeemed {points_to_redeem} points for ${credit_amount:.2f} store credit",
            "points_redeemed": points_to_redeem,
            "credit_earned": round(credit_amount, 2),
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
    """Get user's rewards points balance and history"""
    try:
        user_uid = user_data.get('uid')
        user_email = user_data.get('email')
        
        logger.info(f"Getting rewards info for user {user_uid}")
        
        # Get user document
        user_ref = db.collection('users').document(user_uid)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return {
                "points_balance": 0,
                "store_credit": 0,
                "points_history": [],
                "redemption_history": []
            }
        
        user_data_doc = user_doc.to_dict()
        points_balance = user_data_doc.get('rewardsPoints', 0)
        store_credit = user_data_doc.get('storeCredit', 0)
        
        # Get points history from store credit transactions
        points_history = []
        redemption_history = []
        
        credit_ref = db.collection('storeCredit')
        credit_query = credit_ref.where('userId', '==', user_uid).order_by('createdAt', direction='desc')
        
        try:
            for transaction_doc in credit_query:
                transaction_data = transaction_doc.to_dict()
                
                if transaction_data.get('source') == 'points_redemption':
                    redemption_history.append({
                        'points_redeemed': transaction_data.get('pointsRedeemed', 0),
                        'credit_earned': transaction_data.get('amount', 0),
                        'date': transaction_data.get('createdAt'),
                        'description': transaction_data.get('description', '')
                    })
        except Exception as query_error:
            logger.warning(f"Could not fetch redemption history: {query_error}")
        
        return {
            "points_balance": points_balance,
            "store_credit": store_credit,
            "points_history": points_history,
            "redemption_history": redemption_history,
            "user_id": user_uid
        }
        
    except Exception as e:
        logger.error(f"Error getting user rewards info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get rewards info: {str(e)}"
        ) 