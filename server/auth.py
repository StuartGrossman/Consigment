from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth
from firebase_init import db
import logging

logger = logging.getLogger(__name__)

# Security 
security = HTTPBearer()

async def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False))):
    """Verify Firebase token from Authorization header"""
    if not credentials:
        # For payment processing, we'll use server-side admin credentials
        # This allows the server to process payments on behalf of users
        logger.info("No token provided - using server admin context for payment processing")
        return {
            'uid': 'server_admin',
            'email': 'server@consignment-store.com',
            'name': 'Server Admin',
            'is_server': True
        }
    
    try:
        # Verify the token using Firebase Admin SDK
        decoded_token = auth.verify_id_token(credentials.credentials)
        logger.info(f"Token verified for user: {decoded_token.get('uid')}")
        return {
            'uid': decoded_token.get('uid'),
            'email': decoded_token.get('email'),
            'name': decoded_token.get('name', 'Unknown'),
            'is_server': False
        }
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )

async def verify_admin_access(user_data: dict = Depends(verify_firebase_token)):
    """Verify user has admin privileges"""
    # Server admin always has access
    if user_data.get('is_server'):
        return user_data
    
    try:
        # Check if user is admin in the database
        user_uid = user_data.get('uid')
        user_doc = db.collection('users').document(user_uid).get()
        
        if user_doc.exists and user_doc.to_dict().get('isAdmin'):
            logger.info(f"Admin access granted for user: {user_uid}")
            return user_data
        else:
            logger.warning(f"Admin access denied for user: {user_uid}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying admin access: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to verify admin access"
        )

async def get_user_by_uid(user_uid: str):
    """Get user document from Firestore by UID"""
    try:
        user_doc = db.collection('users').document(user_uid).get()
        if user_doc.exists:
            return user_doc.to_dict()
        return None
    except Exception as e:
        logger.error(f"Error fetching user {user_uid}: {e}")
        return None

async def is_user_admin(user_uid: str) -> bool:
    """Check if user has admin privileges"""
    try:
        user_data = await get_user_by_uid(user_uid)
        return user_data and user_data.get('isAdmin', False)
    except Exception as e:
        logger.error(f"Error checking admin status for user {user_uid}: {e}")
        return False

async def update_user_admin_status(user_uid: str, is_admin: bool):
    """Update user's admin status in Firestore"""
    try:
        user_ref = db.collection('users').document(user_uid)
        user_ref.update({'isAdmin': is_admin})
        logger.info(f"Updated admin status for user {user_uid}: {is_admin}")
        return True
    except Exception as e:
        logger.error(f"Error updating admin status for user {user_uid}: {e}")
        return False 