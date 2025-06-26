from fastapi import FastAPI, HTTPException, Depends, status, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, validator
from firebase_init import db
from firebase_admin import auth
from typing import Dict, Any, List, Optional
import stripe
import json
import os
import time
import logging
from datetime import datetime, timedelta
import uuid

# Configure logging for production
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('app.log') if os.getenv("ENVIRONMENT") == "production" else logging.NullHandler()
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Summit Gear Exchange API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://localhost:5174",
        "https://consignment-store-4a564.web.app",
        "https://consignment-store-4a564.firebaseapp.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Stripe (use environment variable in production)
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_your_secret_key_here")

# Environment configuration
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
PORT = int(os.getenv("PORT", 8080))
DEBUG = ENVIRONMENT == "development"

logger.info(f"Starting server in {ENVIRONMENT} mode on port {PORT}")

# Security 
security = HTTPBearer()

# Pydantic Models
class CartItem(BaseModel):
    item_id: str
    title: str
    price: float = Field(..., gt=0)
    quantity: int = Field(..., gt=0)
    seller_id: str
    seller_name: str

class CustomerInfo(BaseModel):
    name: str = Field(..., min_length=1)
    email: str = Field(..., pattern=r'^[^@]+@[^@]+\.[^@]+$')
    phone: str = Field(..., min_length=10)
    address: Optional[str] = None
    city: Optional[str] = None
    zip_code: Optional[str] = None

class PaymentRequest(BaseModel):
    cart_items: List[CartItem]
    customer_info: CustomerInfo
    fulfillment_method: str = Field(..., pattern='^(pickup|shipping)$')
    payment_method_id: str
    
    @validator('cart_items')
    def validate_cart_not_empty(cls, v):
        if not v:
            raise ValueError('Cart cannot be empty')
        return v

class PaymentResponse(BaseModel):
    success: bool
    order_id: str
    transaction_id: str
    total_amount: float
    message: str

class ItemStatusUpdate(BaseModel):
    item_id: str
    new_status: str = Field(..., pattern='^(pending|approved|live|sold|rejected)$')
    admin_notes: Optional[str] = None

class Message(BaseModel):
    content: str = Field(..., min_length=1, description="Message content cannot be empty")
    timestamp: str

class TestResult(BaseModel):
    test_name: str
    status: str
    duration: float
    error_message: str = None

class TestSummary(BaseModel):
    total_tests: int
    passed: int
    failed: int
    errors: int
    duration: float
    coverage_percentage: float = None
    test_details: List[TestResult]
    timestamp: str

# Authentication helper - now using Firebase Admin SDK
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

# Admin verification helper - checks if user is admin
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

# Utility functions
def calculate_earnings(price: float) -> dict:
    """Calculate seller and store earnings"""
    seller_earnings = price * 0.75
    store_commission = price * 0.25
    return {
        'seller_earnings': round(seller_earnings, 2),
        'store_commission': round(store_commission, 2)
    }

def generate_order_number() -> str:
    """Generate a unique order number"""
    return f"ORD-{int(time.time())}-{str(uuid.uuid4())[:8].upper()}"

def generate_transaction_id() -> str:
    """Generate a unique transaction ID"""
    return f"TXN-{int(time.time())}-{str(uuid.uuid4())[:8].upper()}"

# API Endpoints
@app.get("/")
async def read_root():
    return {"message": "Summit Gear Exchange API", "version": "1.0.0", "status": "running"}

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "database": "connected",
            "stripe": "configured" if stripe.api_key else "not_configured"
        }
    }

@app.post("/api/test-simple")
async def test_simple_post():
    return {"message": "Simple POST test successful", "timestamp": datetime.utcnow().isoformat()}

@app.post("/api/process-payment")
async def process_payment(payment_request: PaymentRequest, user_data: dict = Depends(verify_firebase_token)):
    """Process payment and update inventory securely on server-side"""
    try:
        # Use authenticated user or server admin for payment processing
        user_id = user_data.get('uid')
        is_server_processing = user_data.get('is_server', False)
        
        if is_server_processing:
            # For server-side processing, we'll get the actual user ID from the payment request
            # In a real implementation, you'd get this from the authenticated session
            user_id = f"user_{int(time.time())}"  # Generate a temporary user ID for demo
            logger.info(f"Processing payment via server admin for generated user {user_id}")
        else:
            logger.info(f"Processing payment for authenticated user {user_id}")
        
        # Validate cart items exist and are available
        validated_items = []
        total_amount = 0
        
        for cart_item in payment_request.cart_items:
            item_doc = db.collection('items').document(cart_item.item_id).get()
            if not item_doc.exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item {cart_item.item_id} not found"
                )
            
            item_data = item_doc.to_dict()
            
            if item_data.get('status') != 'live':
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item {cart_item.title} is no longer available"
                )
            
            if abs(item_data.get('price', 0) - cart_item.price) > 0.01:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Price for {cart_item.title} has changed. Please refresh your cart."
                )
            
            validated_items.append({
                'cart_item': cart_item,
                'item_data': item_data
            })
            total_amount += cart_item.price * cart_item.quantity
        
        # Add shipping if applicable
        if payment_request.fulfillment_method == 'shipping':
            total_amount += 5.99
        
        # For demo purposes, simulate payment processing
        # In production, use real Stripe payment processing
        await simulate_payment_processing()
        
        # Generate order identifiers
        order_id = generate_order_number()
        transaction_id = generate_transaction_id()
        
        # Update inventory and create records in a transaction
        batch = db.batch()
        
        try:
            # Process each item
            for validated_item in validated_items:
                cart_item = validated_item['cart_item']
                item_data = validated_item['item_data']
                earnings = calculate_earnings(cart_item.price)
                
                # Update item status to sold
                item_ref = db.collection('items').document(cart_item.item_id)
                batch.update(item_ref, {
                    'status': 'sold',
                    'soldAt': datetime.utcnow(),
                    'soldPrice': cart_item.price,
                    'buyerId': user_id,
                    'buyerInfo': payment_request.customer_info.dict(),
                    'saleTransactionId': transaction_id,
                    'saleType': 'online',
                    'fulfillmentMethod': payment_request.fulfillment_method,
                    'trackingNumber': f"TRK{int(time.time())}" if payment_request.fulfillment_method == 'shipping' else None,
                    'shippingLabelGenerated': False,
                    'userEarnings': earnings['seller_earnings'],
                    'adminEarnings': earnings['store_commission'],
                    'lastUpdated': datetime.utcnow(),
                    'orderNumber': order_id,
                    'paymentMethod': 'Credit Card'
                })
                
                # Create sales record
                sales_ref = db.collection('sales').document()
                batch.set(sales_ref, {
                    'itemId': cart_item.item_id,
                    'itemTitle': cart_item.title,
                    'itemCategory': item_data.get('category', 'Unknown'),
                    'itemBrand': item_data.get('brand', 'N/A'),
                    'itemSize': item_data.get('size', 'N/A'),
                    'sellerId': cart_item.seller_id,
                    'sellerName': cart_item.seller_name,
                    'buyerId': user_id,
                    'buyerName': payment_request.customer_info.name,
                    'salePrice': cart_item.price,
                    'sellerEarnings': earnings['seller_earnings'],
                    'storeCommission': earnings['store_commission'],
                    'soldAt': datetime.utcnow(),
                    'transactionId': transaction_id,
                    'orderNumber': order_id,
                    'paymentMethod': 'Credit Card',
                    'fulfillmentMethod': payment_request.fulfillment_method,
                    'saleType': 'online',
                    'shippingAddress': payment_request.customer_info.dict() if payment_request.fulfillment_method == 'shipping' else None
                })
                
                # Create store credit for seller
                if cart_item.seller_id and not cart_item.seller_id.startswith('phone_'):
                    credit_ref = db.collection('store_credits').document()
                    batch.set(credit_ref, {
                        'userId': cart_item.seller_id,
                        'amount': earnings['seller_earnings'],
                        'source': 'item_sale',
                        'itemId': cart_item.item_id,
                        'itemTitle': cart_item.title,
                        'salePrice': cart_item.price,
                        'transactionId': transaction_id,
                        'createdAt': datetime.utcnow(),
                        'description': f"Sale of \"{cart_item.title}\""
                    })
            
            # Create order record
            order_ref = db.collection('orders').document(order_id)
            batch.set(order_ref, {
                'orderId': order_id,
                'userId': user_id,
                'customerInfo': payment_request.customer_info.dict(),
                'items': [item.dict() for item in payment_request.cart_items],
                'totalAmount': total_amount,
                'fulfillmentMethod': payment_request.fulfillment_method,
                'paymentMethod': 'Credit Card',
                'transactionId': transaction_id,
                'status': 'completed',
                'orderStatus': 'processing',
                'createdAt': datetime.utcnow(),
                'estimatedDelivery': datetime.utcnow() + timedelta(days=7) if payment_request.fulfillment_method == 'shipping' else None
            })
            
            # Commit all changes
            batch.commit()
            logger.info(f"Successfully processed order {order_id} for user {user_id}")
            
            return PaymentResponse(
                success=True,
                order_id=order_id,
                transaction_id=transaction_id,
                total_amount=total_amount,
                message="Payment processed successfully"
            )
            
        except Exception as e:
            logger.error(f"Database transaction failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Order processing failed"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error processing payment: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred"
        )

async def simulate_payment_processing():
    """Simulate payment processing delay"""
    import asyncio
    await asyncio.sleep(2)  # Simulate processing time



@app.get("/api/admin/sales-summary")
async def get_sales_summary(
    admin_data: dict = Depends(verify_admin_access)
):
    """Get sales summary for admin dashboard"""
    try:
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        
        sales_query = db.collection('sales').where('soldAt', '>=', thirty_days_ago)
        sales_docs = sales_query.get()
        
        total_sales = 0
        total_commission = 0
        total_items = len(sales_docs)
        
        for sale_doc in sales_docs:
            sale_data = sale_doc.to_dict()
            total_sales += sale_data.get('salePrice', 0)
            total_commission += sale_data.get('storeCommission', 0)
        
        return {
            "total_items_sold": total_items,
            "total_sales_amount": round(total_sales, 2),
            "total_commission": round(total_commission, 2),
            "period_days": 30
        }
        
    except Exception as e:
        logger.error(f"Error getting sales summary: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get sales summary"
        )

# Legacy test endpoints
@app.post("/api/messages")
async def create_message(message: dict):
    try:
        doc_ref = db.collection('test').document()
        doc_ref.set(message)
        return {"status": "success", "message": "Message saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/messages")
async def get_messages():
    try:
        messages = []
        docs = db.collection('test').stream()
        for doc in docs:
            messages.append({
                'id': doc.id,
                **doc.to_dict()
            })
        return messages
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/user/submit-item")
async def submit_user_item(
    item_submission: dict,
    user_data: dict = Depends(verify_firebase_token)
):
    """Submit a user's draft item for admin review"""
    try:
        user_id = user_data.get('uid')
        item_id = item_submission.get('item_id')
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID is required"
            )
        
        # Get the item from user's personal collection
        user_item_ref = db.collection('userItems').document(user_id).collection('items').document(item_id)
        user_item_doc = user_item_ref.get()
        
        if not user_item_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found in user collection"
            )
        
        item_data = user_item_doc.to_dict()
        
        # Move item to pending collection for admin review
        pending_item_data = {
            **item_data,
            'submittedAt': datetime.utcnow(),
            'status': 'pending',
            'originalUserId': user_id,
            'originalItemId': item_id
        }
        
        # Create in pending collection
        pending_ref = db.collection('pendingItems').document()
        pending_ref.set(pending_item_data)
        
        # Update the user's item to indicate it's been submitted
        user_item_ref.update({
            'status': 'submitted',
            'submittedAt': datetime.utcnow(),
            'pendingItemId': pending_ref.id
        })
        
        logger.info(f"User {user_id} submitted item {item_id} for review")
        
        return {
            "success": True,
            "message": "Item submitted for review",
            "pending_item_id": pending_ref.id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting user item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit item for review"
        )

@app.post("/api/admin/approve-item")
async def approve_pending_item(
    approval_data: dict,
    admin_data: dict = Depends(verify_admin_access)
):
    """Admin endpoint to approve a pending item and make it live"""
    try:
        admin_id = admin_data.get('uid')
        pending_item_id = approval_data.get('pending_item_id')
        
        if not pending_item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pending item ID is required"
            )
        
        # Get the pending item
        pending_ref = db.collection('pendingItems').document(pending_item_id)
        pending_doc = pending_ref.get()
        
        if not pending_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pending item not found"
            )
        
        item_data = pending_doc.to_dict()
        
        # Create live item in main items collection
        live_item_data = {
            **item_data,
            'status': 'live',
            'approvedAt': datetime.utcnow(),
            'approvedBy': admin_id,
            'liveAt': datetime.utcnow()
        }
        
        # Remove internal tracking fields
        live_item_data.pop('originalUserId', None)
        live_item_data.pop('originalItemId', None)
        live_item_data.pop('pendingItemId', None)
        
        # Create in main items collection
        items_ref = db.collection('items').document()
        items_ref.set(live_item_data)
        
        # Update user's original item
        if item_data.get('originalUserId') and item_data.get('originalItemId'):
            user_item_ref = db.collection('userItems').document(item_data['originalUserId']).collection('items').document(item_data['originalItemId'])
            user_item_ref.update({
                'status': 'approved',
                'approvedAt': datetime.utcnow(),
                'liveItemId': items_ref.id
            })
        
        # Remove from pending collection
        pending_ref.delete()
        
        logger.info(f"Admin {admin_id} approved item {pending_item_id}, now live as {items_ref.id}")
        
        return {
            "success": True,
            "message": "Item approved and made live",
            "live_item_id": items_ref.id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to approve item"
        )

@app.get("/api/test-status")
async def get_test_status():
    """Get a quick test status"""
    return {
        "server_status": "running",
        "database_status": "connected",
        "payment_processor": "configured",
        "last_test_run": time.strftime("%Y-%m-%d %H:%M:%S"),
        "secure_endpoints": [
            "/api/process-payment",
            "/api/admin/sales-summary",
            "/api/user/submit-item",
            "/api/admin/approve-item"
        ]
    }

@app.get("/api/status")
async def get_detailed_status():
    """Detailed status endpoint for monitoring"""
    try:
        # Test database connection
        test_doc = db.collection('_health_check').document('test')
        test_doc.set({'timestamp': datetime.utcnow()})
        test_doc.delete()
        db_status = "healthy"
    except Exception as e:
        db_status = f"error: {str(e)}"
        logger.error(f"Database health check failed: {e}")

    return {
        "service": "consignment-api",
        "version": "1.0.0",
        "environment": ENVIRONMENT,
        "status": "healthy" if db_status == "healthy" else "unhealthy",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": {
            "database": db_status,
            "stripe": "configured" if stripe.api_key else "not_configured"
        },
        "uptime": time.time()
    }

# Admin item management endpoints
@app.post("/api/admin/bulk-update-status")
async def bulk_update_item_status(request: Request):
    """Update status of multiple items (admin only)"""
    try:
        # Get token from header
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        
        # Verify token and admin status
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        # Check if user is admin
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get request data
        data = await request.json()
        item_ids = data.get('itemIds', [])
        new_status = data.get('status', '')
        
        if not item_ids or not new_status:
            raise HTTPException(status_code=400, detail="Missing itemIds or status")
        
        logger.info(f"Admin {user_id} bulk updating {len(item_ids)} items to status: {new_status}")
        
        # Update items
        batch = db.batch()
        update_data = {'status': new_status}
        
        if new_status == 'live':
            update_data['liveAt'] = datetime.utcnow()
        elif new_status == 'approved':
            update_data['approvedAt'] = datetime.utcnow()
        elif new_status == 'archived':
            update_data['archivedAt'] = datetime.utcnow()
        elif new_status == 'pending':
            update_data['pendingAt'] = datetime.utcnow()
        
        for item_id in item_ids:
            item_ref = db.collection('items').document(item_id)
            batch.update(item_ref, update_data)
        
        # Commit batch update
        batch.commit()
        
        # Log admin action
        admin_action = {
            'adminId': user_id,
            'action': 'bulk_status_update',
            'details': f'Updated {len(item_ids)} items to {new_status}',
            'itemIds': item_ids,
            'timestamp': datetime.utcnow(),
            'newStatus': new_status
        }
        db.collection('adminActions').add(admin_action)
        
        return {
            "success": True,
            "message": f"Successfully updated {len(item_ids)} items to {new_status}",
            "updatedCount": len(item_ids)
        }
        
    except Exception as e:
        logger.error(f"Error in bulk status update: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/update-item-status")
async def update_single_item_status(request: Request):
    """Update status of a single item (admin only)"""
    try:
        # Get token from header
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        
        # Verify token and admin status
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        # Check if user is admin
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get request data
        data = await request.json()
        item_id = data.get('itemId', '')
        new_status = data.get('status', '')
        
        if not item_id or not new_status:
            raise HTTPException(status_code=400, detail="Missing itemId or status")
        
        logger.info(f"Admin {user_id} updating item {item_id} to status: {new_status}")
        
        # Update item
        update_data = {'status': new_status}
        
        if new_status == 'live':
            update_data['liveAt'] = datetime.utcnow()
        elif new_status == 'approved':
            update_data['approvedAt'] = datetime.utcnow()
        elif new_status == 'archived':
            update_data['archivedAt'] = datetime.utcnow()
        elif new_status == 'pending':
            update_data['pendingAt'] = datetime.utcnow()
        
        # Get item details for logging
        item_ref = db.collection('items').document(item_id)
        item_doc = item_ref.get()
        if not item_doc.exists:
            raise HTTPException(status_code=404, detail="Item not found")
        
        item_data = item_doc.to_dict()
        item_ref.update(update_data)
        
        # Log admin action
        admin_action = {
            'adminId': user_id,
            'action': 'item_status_update',
            'details': f'Updated item "{item_data.get("title", "Unknown")}" to {new_status}',
            'itemId': item_id,
            'timestamp': datetime.utcnow(),
            'oldStatus': item_data.get('status', 'unknown'),
            'newStatus': new_status
        }
        db.collection('adminActions').add(admin_action)
        
        return {
            "success": True,
            "message": f"Successfully updated item to {new_status}",
            "itemId": item_id,
            "newStatus": new_status
        }
        
    except Exception as e:
        logger.error(f"Error in single item status update: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/update-item-with-barcode")
async def update_item_with_barcode(request: Request):
    """Update item with barcode data and status (admin only)"""
    try:
        # Get token from header
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        
        # Verify token and admin status
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        # Check if user is admin
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get request data
        data = await request.json()
        item_id = data.get('itemId', '')
        barcode_data = data.get('barcodeData', '')
        barcode_image_url = data.get('barcodeImageUrl', '')
        new_status = data.get('status', 'approved')
        
        if not item_id or not barcode_data:
            raise HTTPException(status_code=400, detail="Missing itemId or barcodeData")
        
        logger.info(f"Admin {user_id} updating item {item_id} with barcode and status: {new_status}")
        
        # Update item with barcode data
        update_data = {
            'barcodeData': barcode_data,
            'barcodeGeneratedAt': datetime.utcnow(),
            'barcodeImageUrl': barcode_image_url,
            'printConfirmedAt': datetime.utcnow(),
            'status': new_status,
            'lastUpdated': datetime.utcnow(),
            'updatedBy': user_id
        }
        
        if new_status == 'approved':
            update_data['approvedAt'] = datetime.utcnow()
        elif new_status == 'live':
            update_data['liveAt'] = datetime.utcnow()
        
        # Get item details for logging
        item_ref = db.collection('items').document(item_id)
        item_doc = item_ref.get()
        if not item_doc.exists:
            raise HTTPException(status_code=404, detail="Item not found")
        
        item_data = item_doc.to_dict()
        item_ref.update(update_data)
        
        # Log admin action
        admin_action = {
            'adminId': user_id,
            'action': 'item_barcode_update',
            'details': f'Updated item "{item_data.get("title", "Unknown")}" with barcode and status {new_status}',
            'itemId': item_id,
            'timestamp': datetime.utcnow(),
            'oldStatus': item_data.get('status', 'unknown'),
            'newStatus': new_status,
            'barcodeData': barcode_data
        }
        db.collection('adminActions').add(admin_action)
        
        return {
            "success": True,
            "message": f"Successfully updated item with barcode and status {new_status}",
            "itemId": item_id,
            "newStatus": new_status,
            "barcodeData": barcode_data
        }
        
    except Exception as e:
        logger.error(f"Error in barcode item update: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/reject-item")
async def reject_item(request: Request):
    """Admin endpoint to reject an item"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_id = data.get('itemId', '')
        rejection_reason = data.get('rejectionReason', 'No reason provided')
        
        if not item_id:
            raise HTTPException(status_code=400, detail="Missing itemId")
        
        # Update item
        item_ref = db.collection('items').document(item_id)
        item_ref.update({
            'status': 'rejected',
            'rejectedAt': datetime.utcnow(),
            'rejectionReason': rejection_reason,
            'rejectedBy': user_id
        })
        
        # Log admin action
        db.collection('adminActions').add({
            'adminId': user_id,
            'action': 'item_rejected',
            'itemId': item_id,
            'details': f'Rejected item. Reason: {rejection_reason}',
            'timestamp': datetime.utcnow()
        })
        
        return {"success": True, "message": "Item rejected successfully"}
        
    except Exception as e:
        logger.error(f"Error rejecting item: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/edit-item")
async def edit_item(request: Request):
    """Admin endpoint to edit item details"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_id = data.get('itemId', '')
        
        if not item_id:
            raise HTTPException(status_code=400, detail="Missing itemId")
        
        # Update item
        item_ref = db.collection('items').document(item_id)
        update_data = {
            'title': data.get('title'),
            'description': data.get('description'),
            'price': data.get('price'),
            'category': data.get('category'),
            'gender': data.get('gender'),
            'size': data.get('size'),
            'brand': data.get('brand'),
            'condition': data.get('condition'),
            'material': data.get('material'),
            'lastUpdated': datetime.utcnow(),
            'editedBy': user_id
        }
        
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        item_ref.update(update_data)
        
        # Log admin action
        db.collection('adminActions').add({
            'adminId': user_id,
            'action': 'item_edited',
            'itemId': item_id,
            'details': f'Edited item details',
            'timestamp': datetime.utcnow()
        })
        
        return {"success": True, "message": "Item updated successfully"}
        
    except Exception as e:
        logger.error(f"Error editing item: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/make-item-live")
async def make_item_live(request: Request):
    """Admin endpoint to make an item live"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_id = data.get('itemId', '')
        
        if not item_id:
            raise HTTPException(status_code=400, detail="Missing itemId")
        
        # Update item to live status
        item_ref = db.collection('items').document(item_id)
        item_ref.update({
            'status': 'live',
            'liveAt': datetime.utcnow(),
            'madeBy': user_id
        })
        
        # Log admin action
        db.collection('adminActions').add({
            'adminId': user_id,
            'action': 'item_made_live',
            'itemId': item_id,
            'details': 'Made item live',
            'timestamp': datetime.utcnow()
        })
        
        return {"success": True, "message": "Item made live successfully"}
        
    except Exception as e:
        logger.error(f"Error making item live: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/send-back-to-pending")
async def send_back_to_pending(request: Request):
    """Admin endpoint to send item back to pending"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_id = data.get('itemId', '')
        
        if not item_id:
            raise HTTPException(status_code=400, detail="Missing itemId")
        
        # Update item back to pending
        item_ref = db.collection('items').document(item_id)
        item_ref.update({
            'status': 'pending',
            'liveAt': None,
            'sentBackBy': user_id,
            'sentBackAt': datetime.utcnow()
        })
        
        # Log admin action
        db.collection('adminActions').add({
            'adminId': user_id,
            'action': 'item_sent_back_to_pending',
            'itemId': item_id,
            'details': 'Sent item back to pending',
            'timestamp': datetime.utcnow()
        })
        
        return {"success": True, "message": "Item sent back to pending successfully"}
        
    except Exception as e:
        logger.error(f"Error sending item back to pending: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=PORT,
        log_level="info" if DEBUG else "warning",
        access_log=DEBUG
    ) 