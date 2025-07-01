from fastapi import APIRouter, HTTPException, Depends, status, Request
from firebase_init import db
from auth import verify_firebase_token, verify_admin_access
from utils import generate_transaction_id
from datetime import datetime, timezone, timedelta
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["rewards"])

# Default rewards configuration
DEFAULT_REWARDS_CONFIG = {
    'pointsPerDollar': 1,  # 1 point per dollar spent
    'redemptionRate': 0.01,  # $0.01 per point
    'minimumRedemption': 100,  # Minimum 100 points to redeem
    'maximumRedemption': 10000,  # Maximum 10,000 points per transaction
    'welcomeBonus': 100,  # 100 points for signing up
    'enabled': True
}

@router.get("/admin/rewards-config")
async def get_rewards_config(admin_data: dict = Depends(verify_admin_access)):
    """Get current rewards system configuration"""
    try:
        logger.info("Admin fetching rewards configuration")
        
        # Get rewards config from database
        config_ref = db.collection('config').document('rewards')
        config_doc = config_ref.get()
        
        if config_doc.exists:
            config = config_doc.to_dict()
        else:
            # Return default config if none exists
            config = DEFAULT_REWARDS_CONFIG.copy()
            # Save default config to database
            config_ref.set(config)
        
        return {
            "success": True,
            "config": config
        }
        
    except Exception as e:
        logger.error(f"Error getting rewards config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get rewards config: {str(e)}"
        )

@router.post("/admin/update-rewards-config")
async def update_rewards_config(request: Request, admin_data: dict = Depends(verify_admin_access)):
    """Update rewards system configuration"""
    try:
        data = await request.json()
        config = data.get('config', {})
        
        admin_uid = admin_data.get('uid')
        admin_name = admin_data.get('name', 'Admin')
        
        logger.info(f"Admin {admin_uid} updating rewards configuration")
        
        # Validate config values
        if 'pointsPerDollar' in config and (config['pointsPerDollar'] < 0 or config['pointsPerDollar'] > 100):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Points per dollar must be between 0 and 100"
            )
        
        if 'redemptionRate' in config and (config['redemptionRate'] < 0 or config['redemptionRate'] > 1):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Redemption rate must be between 0 and 1"
            )
        
        if 'minimumRedemption' in config and config['minimumRedemption'] < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Minimum redemption must be positive"
            )
        
        if 'maximumRedemption' in config and config['maximumRedemption'] < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum redemption must be positive"
            )
        
        # Add update metadata
        config['updatedAt'] = datetime.now(timezone.utc)
        config['updatedBy'] = admin_uid
        config['updatedByName'] = admin_name
        
        # Update configuration
        config_ref = db.collection('config').document('rewards')
        config_ref.set(config, merge=True)
        
        logger.info(f"Successfully updated rewards configuration")
        
        return {
            "success": True,
            "message": "Rewards configuration updated successfully",
            "config": config
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating rewards config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update rewards config: {str(e)}"
        )

@router.get("/admin/rewards-analytics")
async def get_rewards_analytics(admin_data: dict = Depends(verify_admin_access)):
    """Get rewards system analytics"""
    try:
        logger.info("Admin fetching rewards analytics")
        
        # Get all users with rewards points
        users_ref = db.collection('users')
        users_query = users_ref.where('rewardsPoints', '>', 0)
        
        total_points_issued = 0
        total_points_redeemed = 0
        active_users = 0
        points_distribution = {}
        
        try:
            for user_doc in users_query.get():
                user_data = user_doc.to_dict()
                user_points = user_data.get('rewardsPoints', 0)
                
                if user_points > 0:
                    active_users += 1
                    total_points_issued += user_points
                    
                    # Points distribution buckets
                    if user_points < 100:
                        bucket = '0-99'
                    elif user_points < 500:
                        bucket = '100-499'
                    elif user_points < 1000:
                        bucket = '500-999'
                    elif user_points < 5000:
                        bucket = '1000-4999'
                    else:
                        bucket = '5000+'
                    
                    points_distribution[bucket] = points_distribution.get(bucket, 0) + 1
        
        except Exception as users_error:
            logger.warning(f"Could not fetch all users data: {users_error}")
        
        # Get redemption history from store credit transactions
        redemption_stats = {
            'total_redemptions': 0,
            'total_points_redeemed': 0,
            'total_credit_issued': 0,
            'recent_redemptions': []
        }
        
        try:
            credit_ref = db.collection('storeCredit')
            credit_query = credit_ref.where('source', '==', 'points_redemption')
            
            for transaction_doc in credit_query.get():
                transaction_data = transaction_doc.to_dict()
                
                redemption_stats['total_redemptions'] += 1
                redemption_stats['total_points_redeemed'] += transaction_data.get('pointsRedeemed', 0)
                redemption_stats['total_credit_issued'] += transaction_data.get('amount', 0)
                
                # Add to recent redemptions if within last 30 days
                created_at = transaction_data.get('createdAt')
                if created_at and created_at > (datetime.now(timezone.utc) - timedelta(days=30)):
                    redemption_stats['recent_redemptions'].append({
                        'user_name': transaction_data.get('userName', 'Unknown'),
                        'points_redeemed': transaction_data.get('pointsRedeemed', 0),
                        'credit_earned': transaction_data.get('amount', 0),
                        'date': created_at
                    })
        
        except Exception as redemption_error:
            logger.warning(f"Could not fetch redemption data: {redemption_error}")
        
        # Calculate engagement metrics
        total_points_redeemed = redemption_stats['total_points_redeemed']
        redemption_rate = (total_points_redeemed / total_points_issued * 100) if total_points_issued > 0 else 0
        
        # Get current config
        config_ref = db.collection('config').document('rewards')
        config_doc = config_ref.get()
        current_config = config_doc.to_dict() if config_doc.exists else DEFAULT_REWARDS_CONFIG
        
        analytics = {
            'overview': {
                'total_points_issued': total_points_issued,
                'total_points_redeemed': total_points_redeemed,
                'total_credit_issued': round(redemption_stats['total_credit_issued'], 2),
                'active_users': active_users,
                'redemption_rate': round(redemption_rate, 2),
                'total_redemptions': redemption_stats['total_redemptions']
            },
            'distribution': points_distribution,
            'recent_activity': redemption_stats['recent_redemptions'][:10],  # Last 10 redemptions
            'config': current_config
        }
        
        return analytics
        
    except Exception as e:
        logger.error(f"Error getting rewards analytics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get rewards analytics: {str(e)}"
        )

@router.post("/admin/adjust-user-points")
async def adjust_user_points(request: Request, admin_data: dict = Depends(verify_admin_access)):
    """Manually adjust a user's rewards points"""
    try:
        data = await request.json()
        user_id = data.get('user_id')
        adjustment = data.get('adjustment', 0)
        reason = data.get('reason', 'Manual adjustment by admin')
        
        admin_uid = admin_data.get('uid')
        admin_name = admin_data.get('name', 'Admin')
        
        logger.info(f"Admin {admin_uid} adjusting points for user {user_id} by {adjustment}")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID is required"
            )
        
        if adjustment == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Adjustment amount cannot be zero"
            )
        
        # Get user document
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        user_data = user_doc.to_dict()
        current_points = user_data.get('rewardsPoints', 0)
        new_points = max(0, current_points + adjustment)  # Don't allow negative points
        
        # Update user's points
        user_ref.update({
            'rewardsPoints': new_points,
            'updatedAt': datetime.now(timezone.utc)
        })
        
        # Create audit log
        audit_log = {
            'userId': user_id,
            'userName': user_data.get('name', 'Unknown'),
            'userEmail': user_data.get('email', 'Unknown'),
            'adjustment': adjustment,
            'previousPoints': current_points,
            'newPoints': new_points,
            'reason': reason,
            'adjustedBy': admin_uid,
            'adjustedByName': admin_name,
            'createdAt': datetime.now(timezone.utc),
            'type': 'manual_adjustment'
        }
        
        db.collection('pointsAudit').add(audit_log)
        
        logger.info(f"Successfully adjusted user {user_id} points from {current_points} to {new_points}")
        
        return {
            "success": True,
            "message": f"User points adjusted successfully",
            "user_id": user_id,
            "previous_points": current_points,
            "adjustment": adjustment,
            "new_points": new_points
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adjusting user points: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to adjust user points: {str(e)}"
        )

@router.post("/user/redeem-points")
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
        
        # Get current rewards config
        config_ref = db.collection('config').document('rewards')
        config_doc = config_ref.get()
        config = config_doc.to_dict() if config_doc.exists else DEFAULT_REWARDS_CONFIG
        
        # Check minimum redemption
        if points_to_redeem < config.get('minimumRedemption', 100):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Minimum redemption is {config.get('minimumRedemption', 100)} points"
            )
        
        # Check maximum redemption
        if points_to_redeem > config.get('maximumRedemption', 10000):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum redemption is {config.get('maximumRedemption', 10000)} points"
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
        
        # Calculate store credit
        redemption_rate = config.get('redemptionRate', 0.01)
        credit_amount = points_to_redeem * redemption_rate
        
        # Update user's points and store credit
        current_store_credit = user_data_doc.get('storeCredit', 0) if user_doc.exists else 0
        
        user_ref.update({
            'rewardsPoints': current_points - points_to_redeem,
            'storeCredit': current_store_credit + credit_amount,
            'updatedAt': datetime.now(timezone.utc)
        })
        
        # Create store credit transaction record
        transaction_data = {
            'id': generate_transaction_id(),
            'userId': user_uid,
            'userName': user_name,
            'userEmail': user_email,
            'amount': credit_amount,
            'type': 'earned',
            'description': f'Redeemed {points_to_redeem} rewards points',
            'createdAt': datetime.now(timezone.utc),
            'source': 'points_redemption',
            'pointsRedeemed': points_to_redeem,
            'redemptionRate': redemption_rate
        }
        
        db.collection('storeCredit').add(transaction_data)
        
        logger.info(f"Successfully redeemed {points_to_redeem} points for ${credit_amount} store credit for user {user_uid}")
        
        return {
            "success": True,
            "message": f"Successfully redeemed {points_to_redeem} points for ${credit_amount:.2f} store credit",
            "points_redeemed": points_to_redeem,
            "credit_earned": round(credit_amount, 2),
            "remaining_points": current_points - points_to_redeem,
            "new_store_credit": round(current_store_credit + credit_amount, 2)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error redeeming points: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to redeem points: {str(e)}"
        )

@router.get("/user/rewards-info")
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
                "redemption_history": [],
                "config": DEFAULT_REWARDS_CONFIG
            }
        
        user_data_doc = user_doc.to_dict()
        points_balance = user_data_doc.get('rewardsPoints', 0)
        store_credit = user_data_doc.get('storeCredit', 0)
        
        # Get redemption history from store credit transactions
        redemption_history = []
        
        try:
            credit_ref = db.collection('storeCredit')
            credit_query = credit_ref.where('userId', '==', user_uid).where('source', '==', 'points_redemption').order_by('createdAt', direction='desc').limit(10)
            
            for transaction_doc in credit_query.get():
                transaction_data = transaction_doc.to_dict()
                
                redemption_history.append({
                    'points_redeemed': transaction_data.get('pointsRedeemed', 0),
                    'credit_earned': transaction_data.get('amount', 0),
                    'date': transaction_data.get('createdAt'),
                    'description': transaction_data.get('description', ''),
                    'redemption_rate': transaction_data.get('redemptionRate', 0.01)
                })
        except Exception as query_error:
            logger.warning(f"Could not fetch redemption history: {query_error}")
        
        # Get current rewards config
        config_ref = db.collection('config').document('rewards')
        config_doc = config_ref.get()
        current_config = config_doc.to_dict() if config_doc.exists else DEFAULT_REWARDS_CONFIG
        
        return {
            "points_balance": points_balance,
            "store_credit": round(store_credit, 2),
            "redemption_history": redemption_history,
            "config": current_config,
            "user_id": user_uid
        }
        
    except Exception as e:
        logger.error(f"Error getting user rewards info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get rewards info: {str(e)}"
        )

async def award_purchase_points(user_id: str, purchase_amount: float):
    """Award points to user for a purchase"""
    try:
        # Get current rewards config
        config_ref = db.collection('config').document('rewards')
        config_doc = config_ref.get()
        config = config_doc.to_dict() if config_doc.exists else DEFAULT_REWARDS_CONFIG
        
        if not config.get('enabled', True):
            return
        
        points_per_dollar = config.get('pointsPerDollar', 1)
        points_to_award = int(purchase_amount * points_per_dollar)
        
        if points_to_award <= 0:
            return
        
        # Get user document
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            logger.warning(f"User {user_id} not found for points award")
            return
        
        user_data = user_doc.to_dict()
        current_points = user_data.get('rewardsPoints', 0)
        
        # Update user's points
        user_ref.update({
            'rewardsPoints': current_points + points_to_award,
            'updatedAt': datetime.now(timezone.utc)
        })
        
        # Create audit log
        audit_log = {
            'userId': user_id,
            'userName': user_data.get('name', 'Unknown'),
            'userEmail': user_data.get('email', 'Unknown'),
            'pointsAwarded': points_to_award,
            'purchaseAmount': purchase_amount,
            'pointsPerDollar': points_per_dollar,
            'previousPoints': current_points,
            'newPoints': current_points + points_to_award,
            'createdAt': datetime.now(timezone.utc),
            'type': 'purchase_reward'
        }
        
        db.collection('pointsAudit').add(audit_log)
        
        logger.info(f"Awarded {points_to_award} points to user {user_id} for ${purchase_amount} purchase")
        
    except Exception as e:
        logger.error(f"Error awarding purchase points: {e}")
        # Don't raise exception as this is a background operation 