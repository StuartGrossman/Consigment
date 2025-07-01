# Shared Cart System for Multi-Device POS - Corrected Version

from fastapi import HTTPException, Request
from firebase_admin import firestore
import random
from datetime import datetime, timezone
from firebase_admin import auth

@app.post("/api/shared-cart/create")
async def create_shared_cart(request: Request):
    """Create a new shared cart instance for multi-device POS"""
    try:
        # Verify user authentication
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        user_email = decoded_token.get('email', '')
        
        # Create shared cart document
        shared_cart_data = {
            'created_by': user_id,
            'created_by_email': user_email,
            'created_at': datetime.now(timezone.utc),
            'last_updated': datetime.now(timezone.utc),
            'items': [],
            'total_amount': 0,
            'item_count': 0,
            'status': 'active',  # active, completed, cancelled
            'access_users': [user_id],  # Users who can access this cart
            'device_info': {
                'created_device': 'desktop',  # desktop, mobile, tablet
                'last_accessed_device': 'desktop'
            }
        }
        
        # Add to Firestore
        cart_ref = db.collection('shared_carts').document()
        cart_ref.set(shared_cart_data)
        cart_id = cart_ref.id
        
        logger.info(f"Created shared cart {cart_id} for user {user_email}")
        
        return {
            "success": True,
            "cart_id": cart_id,
            "message": "Shared cart created successfully",
            "created_at": datetime.now().isoformat(),
            "access_code": cart_id[:8].upper()  # Short code for easy sharing
        }
        
    except Exception as e:
        logger.error(f"Error creating shared cart: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create shared cart: {str(e)}")

@app.get("/api/shared-cart/{cart_id}")
async def get_shared_cart(cart_id: str, request: Request):
    """Get shared cart details and items"""
    try:
        # Verify user authentication
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        user_email = decoded_token.get('email', '')
        
        # Get cart document
        cart_ref = db.collection('shared_carts').document(cart_id)
        cart_doc = cart_ref.get()
        
        if not cart_doc.exists:
            raise HTTPException(status_code=404, detail="Shared cart not found")
        
        cart_data = cart_doc.to_dict()
        
        # Check if user has access to this cart
        access_users = cart_data.get('access_users', [])
        if user_id not in access_users:
            # Add user to access list if they're trying to access
            access_users.append(user_id)
            cart_ref.update({'access_users': access_users})
            logger.info(f"Added user {user_email} to shared cart {cart_id} access list")
        
        # Update last accessed info
        cart_ref.update({
            'last_updated': datetime.now(timezone.utc),
            'device_info.last_accessed_device': 'mobile' if 'mobile' in request.headers.get('user-agent', '').lower() else 'desktop'
        })
        
        return {
            "success": True,
            "cart_id": cart_id,
            "cart_data": cart_data,
            "items": cart_data.get('items', []),
            "total_amount": cart_data.get('total_amount', 0),
            "item_count": cart_data.get('item_count', 0)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shared cart {cart_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get shared cart: {str(e)}")

@app.post("/api/shared-cart/{cart_id}/add-item")
async def add_item_to_shared_cart(cart_id: str, request: Request):
    """Add item to shared cart (from barcode scan)"""
    try:
        # Verify user authentication
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        user_email = decoded_token.get('email', '')
        
        # Parse request body
        data = await request.json()
        barcode_data = data.get('barcode_data')
        
        if not barcode_data:
            raise HTTPException(status_code=400, detail="Barcode data is required")
        
        # Look up item by barcode
        items_query = db.collection('items').where('barcodeData', '==', barcode_data).limit(1).get()
        
        if not items_query:
            raise HTTPException(status_code=404, detail=f"No item found with barcode: {barcode_data}")
        
        item_doc = items_query[0]
        item_data = item_doc.to_dict()
        
        # Check if item is available for sale
        if item_data.get('status') not in ['live', 'approved']:
            raise HTTPException(status_code=400, detail=f"Item is not available for sale (status: {item_data.get('status')})")
        
        # Get shared cart
        cart_ref = db.collection('shared_carts').document(cart_id)
        cart_doc = cart_ref.get()
        
        if not cart_doc.exists:
            raise HTTPException(status_code=404, detail="Shared cart not found")
        
        cart_data = cart_doc.to_dict()
        
        # Check if user has access
        if user_id not in cart_data.get('access_users', []):
            raise HTTPException(status_code=403, detail="Access denied to this shared cart")
        
        # Prepare item for cart
        cart_item = {
            'item_id': item_doc.id,
            'title': item_data.get('title', 'Untitled'),
            'price': item_data.get('price', 0),
            'quantity': 1,  # Consignment items are always quantity 1
            'barcode_data': barcode_data,
            'added_by': user_id,
            'added_by_email': user_email,
            'added_at': datetime.now(timezone.utc),
            'seller_id': item_data.get('sellerUid') or item_data.get('sellerId'),
            'seller_name': item_data.get('sellerName', 'Unknown')
        }
        
        # Check if item already exists in cart
        current_items = cart_data.get('items', [])
        item_exists = any(item.get('item_id') == item_doc.id for item in current_items)
        
        if item_exists:
            raise HTTPException(status_code=400, detail="Item already in cart")
        
        # Add item to cart
        current_items.append(cart_item)
        new_total = sum(item.get('price', 0) * item.get('quantity', 1) for item in current_items)
        
        # Update cart
        cart_ref.update({
            'items': current_items,
            'total_amount': new_total,
            'item_count': len(current_items),
            'last_updated': datetime.now(timezone.utc),
            'device_info.last_accessed_device': 'mobile' if 'mobile' in request.headers.get('user-agent', '').lower() else 'desktop'
        })
        
        logger.info(f"Added item {item_data.get('title')} to shared cart {cart_id} by {user_email}")
        
        return {
            "success": True,
            "message": f"Added {item_data.get('title')} to cart",
            "item": cart_item,
            "cart_total": new_total,
            "cart_item_count": len(current_items)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding item to shared cart {cart_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to add item to cart: {str(e)}")

@app.get("/api/shared-cart/user-carts")
async def get_user_shared_carts(request: Request):
    """Get all active shared carts for the current user"""
    try:
        # Verify user authentication
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        user_email = decoded_token.get('email', '')
        
        # Query shared carts where user has access
        carts_query = db.collection('shared_carts').where('access_users', 'array_contains', user_id).where('status', '==', 'active').order_by('created_at', direction='DESCENDING').limit(10).get()
        
        carts = []
        for cart_doc in carts_query:
            cart_data = cart_doc.to_dict()
            carts.append({
                'cart_id': cart_doc.id,
                'created_at': cart_data.get('created_at'),
                'last_updated': cart_data.get('last_updated'),
                'item_count': cart_data.get('item_count', 0),
                'total_amount': cart_data.get('total_amount', 0),
                'created_by_email': cart_data.get('created_by_email'),
                'access_code': cart_doc.id[:8].upper()
            })
        
        return {
            "success": True,
            "carts": carts,
            "total_carts": len(carts)
        }
        
    except Exception as e:
        logger.error(f"Error getting user shared carts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get shared carts: {str(e)}") 