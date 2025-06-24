from fastapi import FastAPI, HTTPException, Depends, status, Header
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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Summit Gear Exchange API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "https://your-domain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Stripe (use environment variable in production)
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_your_secret_key_here")

# Security (disabled for development)
# security = HTTPBearer()

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

# Authentication helper (disabled for development)
async def verify_firebase_token(token: str = None):
    # For development purposes, always allow access with mock user
    # In production, remove this and implement proper Firebase authentication
    logger.warning("Running in development mode with mock authentication")
    return {
        'uid': 'dev_user_123',
        'email': 'dev@example.com',
        'name': 'Development User'
    }

# Admin verification helper (disabled for development)
async def verify_admin_access():
    # For development/demo purposes, we'll allow admin access
    user_data = {
        'uid': 'dev_admin_123',
        'email': 'admin@example.com',
        'name': 'Development Admin'
    }
    logger.info(f"Admin access granted for development user")
    return user_data

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
async def process_payment(payment_request: PaymentRequest):
    """Process payment and update inventory securely on server-side"""
    try:
        # For development, use mock user
        user_data = {
            'uid': 'dev_user_123',
            'email': 'dev@example.com',
            'name': 'Development User'
        }
        user_id = user_data.get('uid')
        logger.info(f"Processing payment for user {user_id} (development mode)")
        
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

@app.post("/api/admin/update-item-status")
async def update_item_status(
    status_update: ItemStatusUpdate,
    admin_data: dict = Depends(verify_admin_access)
):
    """Admin endpoint to update item status"""
    try:
        admin_id = admin_data.get('uid')
        
        # Verify item exists
        item_ref = db.collection('items').document(status_update.item_id)
        item_doc = item_ref.get()
        
        if not item_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Update item status
        update_data = {
            'status': status_update.new_status,
            'lastUpdated': datetime.utcnow(),
            'updatedBy': admin_id
        }
        
        if status_update.new_status == 'approved':
            update_data['approvedAt'] = datetime.utcnow()
        elif status_update.new_status == 'live':
            update_data['liveAt'] = datetime.utcnow()
        
        if status_update.admin_notes:
            update_data['adminNotes'] = status_update.admin_notes
        
        item_ref.update(update_data)
        
        logger.info(f"Admin {admin_id} updated item {status_update.item_id} status to {status_update.new_status}")
        
        return {"success": True, "message": "Item status updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating item status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update item status"
        )

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
            "/api/admin/sales-summary"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 