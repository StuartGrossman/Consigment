#!/usr/bin/env python3
"""
Enhanced development server that processes payments AND updates Firebase
Includes fulfillment method saving and inventory management
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import List, Optional
import time
import uuid
from datetime import datetime, timedelta

# Firebase imports
import os
import sys
sys.path.append(os.path.dirname(__file__))

try:
    # Try to import Firebase functionality
    from firebase_admin import firestore
    import firebase_admin
    from firebase_admin import credentials
    
    # Initialize Firebase Admin SDK for simple server
    if not firebase_admin._apps:
        try:
            # Try to initialize with default credentials
            firebase_admin.initialize_app(credentials.ApplicationDefault(), {
                'projectId': 'consignment-store-4a564'
            })
            print("✅ Firebase initialized successfully")
        except Exception as e:
            print(f"⚠️ Firebase initialization failed: {e}")
            print("📝 Running in mock mode - orders will not be saved to database")
            firestore = None
    
    if firestore:
        db = firestore.client()
    else:
        db = None
        
except ImportError as e:
    print(f"⚠️ Firebase dependencies not available: {e}")
    print("📝 Running in mock mode - orders will not be saved to database")
    db = None

app = FastAPI(title="Enhanced Dev Server", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple data models
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
    payment_type: str = Field(..., pattern='^(online|in_store)$')
    payment_method_id: Optional[str] = None  # Optional for in-store payments
    
    @validator('cart_items')
    def validate_cart_not_empty(cls, v):
        if not v:
            raise ValueError('Cart cannot be empty')
        return v
    
    @validator('payment_method_id')
    def validate_payment_method_for_online(cls, v, values):
        payment_type = values.get('payment_type')
        if payment_type == 'online' and not v:
            raise ValueError('Payment method ID is required for online payments')
        return v

class PaymentResponse(BaseModel):
    success: bool
    order_id: str
    transaction_id: str
    total_amount: float
    message: str

def generate_order_number() -> str:
    return f"ORD-{int(time.time())}-{str(uuid.uuid4())[:8].upper()}"

def generate_transaction_id() -> str:
    return f"TXN-{int(time.time())}-{str(uuid.uuid4())[:8].upper()}"

def calculate_earnings(price: float) -> dict:
    """Calculate seller and store earnings"""
    seller_earnings = price * 0.75
    store_commission = price * 0.25
    return {
        'seller_earnings': round(seller_earnings, 2),
        'store_commission': round(store_commission, 2)
    }

async def update_firebase_after_payment(payment_request: PaymentRequest, order_id: str, transaction_id: str, total_amount: float) -> bool:
    """Update Firebase with payment and inventory changes"""
    if not db:
        print("⚠️ Firebase not available - skipping database updates")
        return False
    
    try:
        # Start a batch transaction
        batch = db.batch()
        user_id = 'dev_user_123'  # Development user ID
        
        print(f"📝 Updating Firebase for order {order_id}")
        print(f"💳 Payment type: {payment_request.payment_type}")
        
        # Determine status based on payment type
        item_status = 'sold' if payment_request.payment_type == 'online' else 'reserved'
        order_status = 'completed' if payment_request.payment_type == 'online' else 'pending'
        order_processing_status = 'processing' if payment_request.payment_type == 'online' else 'reserved'
        
        # Calculate hold expiration for in-store payments (24 hours)
        hold_expires_at = datetime.utcnow() + timedelta(hours=24) if payment_request.payment_type == 'in_store' else None
        
        # Process each cart item
        for cart_item in payment_request.cart_items:
            print(f"🔄 Processing item {cart_item.item_id}: {cart_item.title}")
            
            # Update item status
            item_ref = db.collection('items').document(cart_item.item_id)
            item_doc = item_ref.get()
            
            if item_doc.exists:
                item_data = item_doc.to_dict()
                earnings = calculate_earnings(cart_item.price)
                
                # Update item with appropriate status
                item_update_data = {
                    'status': item_status,
                    'soldAt': datetime.utcnow() if payment_request.payment_type == 'online' else None,
                    'reservedAt': datetime.utcnow() if payment_request.payment_type == 'in_store' else None,
                    'holdExpiresAt': hold_expires_at,
                    'soldPrice' if payment_request.payment_type == 'online' else 'reservedPrice': cart_item.price,
                    'buyerId': user_id,
                    'buyerInfo': payment_request.customer_info.dict(),
                    'saleTransactionId': transaction_id,
                    'saleType': payment_request.payment_type,
                    'fulfillmentMethod': payment_request.fulfillment_method,
                    'trackingNumber': f"TRK{int(time.time())}" if (payment_request.fulfillment_method == 'shipping' and payment_request.payment_type == 'online') else None,
                    'shippingLabelGenerated': False,
                    'lastUpdated': datetime.utcnow(),
                    'orderNumber': order_id,
                    'paymentMethod': 'Credit Card' if payment_request.payment_type == 'online' else 'Pay in Store'
                }
                
                # Only add earnings for completed online sales
                if payment_request.payment_type == 'online':
                    item_update_data.update({
                        'userEarnings': earnings['seller_earnings'],
                        'adminEarnings': earnings['store_commission']
                    })
                
                batch.update(item_ref, item_update_data)
                
                # Create sales record only for completed online sales
                if payment_request.payment_type == 'online':
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
                    
                    # Create store credit for seller (if not phone user) - only for completed sales
                    if cart_item.seller_id and not cart_item.seller_id.startswith('phone_'):
                        credit_ref = db.collection('storeCredit').document()
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
                else:
                    # For in-store payments, create a reservation record
                    reservation_ref = db.collection('reservations').document(order_id)
                    batch.set(reservation_ref, {
                        'itemId': cart_item.item_id,
                        'itemTitle': cart_item.title,
                        'itemCategory': item_data.get('category', 'Unknown'),
                        'itemBrand': item_data.get('brand', 'N/A'),
                        'itemSize': item_data.get('size', 'N/A'),
                        'sellerId': cart_item.seller_id,
                        'sellerName': cart_item.seller_name,
                        'buyerId': user_id,
                        'buyerName': payment_request.customer_info.name,
                        'reservedPrice': cart_item.price,
                        'reservedAt': datetime.utcnow(),
                        'holdExpiresAt': hold_expires_at,
                        'transactionId': transaction_id,
                        'orderNumber': order_id,
                        'paymentMethod': 'Pay in Store',
                        'fulfillmentMethod': payment_request.fulfillment_method,
                        'status': 'active'
                    })
                    
                print(f"✅ Prepared updates for item {cart_item.item_id}")
            else:
                print(f"⚠️ Item {cart_item.item_id} not found in database")
        
        # Create order record with appropriate status
        order_ref = db.collection('orders').document(order_id)
        order_data = {
            'orderId': order_id,
            'userId': user_id,
            'customerInfo': payment_request.customer_info.dict(),
            'items': [item.dict() for item in payment_request.cart_items],
            'totalAmount': total_amount,
            'fulfillmentMethod': payment_request.fulfillment_method,
            'paymentType': payment_request.payment_type,
            'paymentMethod': 'Credit Card' if payment_request.payment_type == 'online' else 'Pay in Store',
            'transactionId': transaction_id,
            'status': order_status,
            'orderStatus': order_processing_status,
            'createdAt': datetime.utcnow(),
        }
        
        # Add delivery/pickup specific fields
        if payment_request.fulfillment_method == 'shipping' and payment_request.payment_type == 'online':
            order_data['estimatedDelivery'] = datetime.utcnow() + timedelta(days=7)
        elif payment_request.payment_type == 'in_store':
            order_data['holdExpiresAt'] = hold_expires_at
            order_data['pickupInstructions'] = 'Items will be held for 24 hours. Please bring ID and order confirmation.'
        
        batch.set(order_ref, order_data)
        
        # Commit all changes atomically
        batch.commit()
        print(f"✅ Successfully updated Firebase for order {order_id}")
        print(f"📦 Fulfillment method: {payment_request.fulfillment_method}")
        print(f"💰 Total amount: ${total_amount:.2f}")
        
        if payment_request.payment_type == 'in_store':
            print(f"⏰ Hold expires at: {hold_expires_at}")
        
        return True
        
    except Exception as e:
        print(f"❌ Failed to update Firebase: {e}")
        return False

@app.get("/")
async def read_root():
    return {"message": "Enhanced Dev Server", "version": "1.0.0", "status": "running", "firebase": db is not None}

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "database": "connected" if db else "mock",
            "stripe": "mock"
        }
    }

@app.post("/api/process-payment")
async def process_payment(payment_request: PaymentRequest) -> PaymentResponse:
    """Process payment with Firebase integration for inventory management"""
    try:
        print(f"📦 Processing {payment_request.payment_type} payment for {len(payment_request.cart_items)} items")
        print(f"🚚 Fulfillment method: {payment_request.fulfillment_method}")
        print(f"💳 Payment type: {payment_request.payment_type}")
        print(f"👤 Customer: {payment_request.customer_info.name} ({payment_request.customer_info.email})")
        
        # Validate payment method requirements
        if payment_request.payment_type == 'online' and not payment_request.payment_method_id:
            raise HTTPException(
                status_code=400,
                detail="Payment method ID is required for online payments"
            )
        
        # Validate that in-store payments are only for pickup
        if payment_request.payment_type == 'in_store' and payment_request.fulfillment_method != 'pickup':
            raise HTTPException(
                status_code=400,
                detail="In-store payments are only available for store pickup"
            )
        
        # Validate that items exist and are available (if Firebase is connected)
        if db:
            for cart_item in payment_request.cart_items:
                item_doc = db.collection('items').document(cart_item.item_id).get()
                if not item_doc.exists:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Item {cart_item.item_id} not found"
                    )
                
                item_data = item_doc.to_dict()
                if item_data.get('status') != 'live':
                    raise HTTPException(
                        status_code=400,
                        detail=f"Item {cart_item.title} is no longer available"
                    )
                
                # Verify price hasn't changed
                if abs(item_data.get('price', 0) - cart_item.price) > 0.01:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Price for {cart_item.title} has changed. Please refresh your cart."
                    )
        
        # Calculate total
        total_amount = sum(item.price * item.quantity for item in payment_request.cart_items)
        
        # Add shipping if applicable
        if payment_request.fulfillment_method == 'shipping':
            total_amount += 5.99
        
        # Generate IDs
        order_id = generate_order_number()
        transaction_id = generate_transaction_id()
        
        # Simulate processing delay
        import asyncio
        await asyncio.sleep(1)  # 1 second delay
        
        # Update Firebase with payment results
        firebase_success = await update_firebase_after_payment(
            payment_request, order_id, transaction_id, total_amount
        )
        
        if db and not firebase_success:
            print("⚠️ Firebase update failed, but payment was processed")
        
        # Generate appropriate success message
        if payment_request.payment_type == 'online':
            action = "purchased"
            status_msg = "Payment processed successfully"
            inventory_msg = "💾 Inventory updated - items removed from live listings"
        else:
            action = "reserved"
            status_msg = "Items reserved successfully"
            inventory_msg = "💾 Inventory updated - items reserved for 24 hours"
        
        print(f"✅ Payment processed successfully: Order {order_id}, Total ${total_amount:.2f}")
        print(f"🎯 Items {action} for {payment_request.fulfillment_method}")
        
        if db:
            print(inventory_msg)
        
        return PaymentResponse(
            success=True,
            order_id=order_id,
            transaction_id=transaction_id,
            total_amount=total_amount,
            message=status_msg + (" - Inventory updated" if db else " (Mock)")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Payment processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting enhanced development server on http://localhost:8000")
    print("🔧 Payment processing with Firebase integration!")
    print(f"🔥 Firebase status: {'Connected' if db else 'Mock mode'}")
    uvicorn.run(app, host="0.0.0.0", port=8000) 