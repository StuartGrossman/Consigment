# Shared Cart Endpoints for Multi-Device POS
# These endpoints can be imported into main.py

from fastapi import HTTPException, Request
from firebase_admin import firestore
import random
from datetime import datetime

async def add_item_to_shared_cart(cart_id: str, request: Request, verify_token_func, db, logger):
    """Add item to shared cart (from barcode scan)"""
    try:
        # Verify user authentication
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        user_id, user_email = verify_token_func(token)
        
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
            'added_at': firestore.SERVER_TIMESTAMP,
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
            'last_updated': firestore.SERVER_TIMESTAMP,
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

async def get_user_shared_carts(request: Request, verify_token_func, db, logger):
    """Get all active shared carts for the current user"""
    try:
        # Verify user authentication
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        user_id, user_email = verify_token_func(token)
        
        # Query shared carts where user has access
        carts_query = db.collection('shared_carts').where('access_users', 'array_contains', user_id).where('status', '==', 'active').order_by('created_at', direction=firestore.Query.DESCENDING).limit(10).get()
        
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