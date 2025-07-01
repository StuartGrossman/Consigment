from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
import stripe
import os
import logging
from datetime import datetime, timezone

# Import our modular components
from auth import verify_firebase_token, verify_admin_access
from models import PaymentRequest, PaymentResponse, TestSummary
from database import ItemService, UserService, OrderService
from utils import generate_order_number, generate_transaction_id, calculate_earnings, get_current_timestamp
from routes.admin import router as admin_router

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
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:6330",
        "http://localhost:7359",
        "http://localhost:9498",
        "https://consignment-store-4a564.web.app",
        "https://consignment-store-4a564.firebaseapp.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_your_secret_key_here")

# Environment configuration
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
PORT = int(os.getenv("PORT", 8080))
DEBUG = ENVIRONMENT == "development"

logger.info(f"Starting server in {ENVIRONMENT} mode on port {PORT}")

# Include route modules
app.include_router(admin_router)

# Basic endpoints
@app.get("/")
async def read_root():
    return {"message": "Summit Gear Exchange API", "version": "1.0.0", "status": "running"}

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": get_current_timestamp(),
        "services": {
            "database": "connected",
            "stripe": "configured" if stripe.api_key else "not_configured"
        }
    }

@app.post("/api/test-simple")
async def test_simple_post():
    return {"message": "Simple POST test successful", "timestamp": get_current_timestamp()}

# Payment processing
@app.post("/api/process-payment")
async def process_payment(payment_request: PaymentRequest, user_data: dict = Depends(verify_firebase_token)):
    """Process payment for cart items"""
    try:
        logger.info(f"Processing payment for {len(payment_request.cart_items)} items")
        
        # Calculate total amount
        total_amount = sum(item.price * item.quantity for item in payment_request.cart_items)
        
        # Generate order details
        order_id = generate_order_number()
        transaction_id = generate_transaction_id()
        
        # Create payment intent with Stripe (simplified for demo)
        try:
            payment_intent = stripe.PaymentIntent.create(
                amount=int(total_amount * 100),  # Convert to cents
                currency='usd',
                payment_method=payment_request.payment_method_id,
                confirmation_method='manual',
                confirm=True,
                return_url="https://yourdomain.com/payment/success"
            )
            
            if payment_intent.status == 'succeeded':
                # Create order record
                order_data = {
                    'order_id': order_id,
                    'transaction_id': transaction_id,
                    'customer_uid': user_data.get('uid'),
                    'customer_info': payment_request.customer_info.dict(),
                    'items': [item.dict() for item in payment_request.cart_items],
                    'total_amount': total_amount,
                    'payment_status': 'completed',
                    'fulfillment_method': payment_request.fulfillment_method,
                    'stripe_payment_intent_id': payment_intent.id
                }
                
                OrderService.create_order(order_data)
                
                # Update item statuses to sold
                for item in payment_request.cart_items:
                    ItemService.update_item_status(item.item_id, 'sold')
                
                return PaymentResponse(
                    success=True,
                    order_id=order_id,
                    transaction_id=transaction_id,
                    total_amount=total_amount,
                    message="Payment processed successfully"
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Payment failed"
                )
                
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment processing failed: {str(e)}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Payment processing error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payment processing failed"
        )

# User endpoints
@app.post("/api/user/submit-item")
async def submit_user_item(
    item_submission: dict,
    user_data: dict = Depends(verify_firebase_token)
):
    """Submit an item for consignment"""
    try:
        # Create item data
        item_data = {
            'id': item_submission.get('id', ''),
            'title': item_submission.get('title'),
            'brand': item_submission.get('brand'),
            'category': item_submission.get('category'),
            'size': item_submission.get('size'),
            'color': item_submission.get('color'),
            'condition': item_submission.get('condition'),
            'price': float(item_submission.get('price')),
            'originalPrice': float(item_submission.get('originalPrice')),
            'description': item_submission.get('description'),
            'sellerUid': user_data.get('uid'),
            'sellerEmail': user_data.get('email'),
            'sellerName': user_data.get('name'),
            'status': 'pending',
            'images': item_submission.get('images', [])
        }
        
        success = ItemService.create_item(item_data)
        
        if success:
            return {
                "success": True,
                "message": "Item submitted successfully",
                "item_id": item_data['id']
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to submit item"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit item"
        )

@app.get("/api/user/purchases")
async def get_user_purchases(user_data: dict = Depends(verify_firebase_token)):
    """Get user's purchase history"""
    try:
        orders = OrderService.get_orders_by_user(user_data.get('uid'))
        return {
            "success": True,
            "orders": orders,
            "count": len(orders)
        }
        
    except Exception as e:
        logger.error(f"Error getting user purchases: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve purchases"
        )

# Test endpoints
@app.get("/api/test-status")
async def get_test_status():
    """Get the current test status"""
    return {
        "test_status": "running",
        "timestamp": get_current_timestamp(),
        "environment": ENVIRONMENT
    }

@app.get("/api/status")
async def get_detailed_status():
    """Get detailed system status"""
    return {
        "api_status": "operational",
        "database_status": "connected",
        "stripe_status": "configured" if stripe.api_key else "not_configured",
        "environment": ENVIRONMENT,
        "version": "1.0.0",
        "timestamp": get_current_timestamp(),
        "uptime": "Running"
    }

# Message endpoints
@app.post("/api/messages")
async def create_message(message: dict):
    """Create a new message"""
    return {
        "success": True,
        "message": "Message created successfully",
        "timestamp": get_current_timestamp()
    }

@app.get("/api/messages")
async def get_messages():
    """Get all messages"""
    return {
        "messages": [],
        "count": 0,
        "timestamp": get_current_timestamp()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT) 