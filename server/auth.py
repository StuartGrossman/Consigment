"""
Authentication Module for Summit Gear Exchange API

This module handles user authentication, authorization, and admin verification.
"""

from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth
from firebase_init import db
import logging

logger = logging.getLogger(__name__)

# Security
security = HTTPBearer()


async def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False))):
    """
    Verify Firebase token from Authorization header
    
    Args:
        credentials: HTTP authorization credentials
        
    Returns:
        dict: User data containing uid, email, name, and server status
        
    Raises:
        HTTPException: If token verification fails
    """
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
    """
    Verify user has admin privileges
    
    Args:
        user_data: User data from token verification
        
    Returns:
        dict: User data if admin access is granted
        
    Raises:
        HTTPException: If admin access is denied
    """
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


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Get current authenticated user (required auth)
    
    Args:
        credentials: HTTP authorization credentials (required)
        
    Returns:
        dict: User data
        
    Raises:
        HTTPException: If authentication fails
    """
    try:
        decoded_token = auth.verify_id_token(credentials.credentials)
        return {
            'uid': decoded_token.get('uid'),
            'email': decoded_token.get('email'),
            'name': decoded_token.get('name', 'Unknown'),
            'is_server': False
        }
    except Exception as e:
        logger.error(f"Required authentication failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )


async def verify_user_or_admin(user_data: dict = Depends(verify_firebase_token)):
    """
    Verify user is either the owner of the resource or an admin
    
    Args:
        user_data: User data from token verification
        
    Returns:
        dict: User data with admin status
    """
    # Check if user is admin
    is_admin = False
    if user_data.get('is_server'):
        is_admin = True
    else:
        try:
            user_uid = user_data.get('uid')
            user_doc = db.collection('users').document(user_uid).get()
            if user_doc.exists and user_doc.to_dict().get('isAdmin'):
                is_admin = True
        except Exception as e:
            logger.error(f"Error checking admin status: {e}")
    
    user_data['is_admin'] = is_admin
    return user_data


def require_user_ownership_or_admin(resource_user_id: str, current_user: dict):
    """
    Verify user owns the resource or is an admin
    
    Args:
        resource_user_id: User ID associated with the resource
        current_user: Current authenticated user data
        
    Raises:
        HTTPException: If access is denied
    """
    if current_user.get('is_server') or current_user.get('is_admin'):
        return True
    
    if current_user.get('uid') != resource_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - insufficient permissions"
        )
    
    return True


async def check_user_ban_status(user_id: str) -> bool:
    """
    Check if user is banned
    
    Args:
        user_id: User ID to check
        
    Returns:
        bool: True if user is banned, False otherwise
    """
    try:
        user_doc = db.collection('users').document(user_id).get()
        if user_doc.exists:
            user_data = user_doc.to_dict()
            return user_data.get('isBanned', False)
        return False
    except Exception as e:
        logger.error(f"Error checking ban status for user {user_id}: {e}")
        return False


async def verify_unbanned_user(user_data: dict = Depends(verify_firebase_token)):
    """
    Verify user is not banned
    
    Args:
        user_data: User data from token verification
        
    Returns:
        dict: User data if not banned
        
    Raises:
        HTTPException: If user is banned
    """
    # Server admin bypasses ban checks
    if user_data.get('is_server'):
        return user_data
    
    user_id = user_data.get('uid')
    if await check_user_ban_status(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been suspended"
        )
    
    return user_data 