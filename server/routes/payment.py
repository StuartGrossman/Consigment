from fastapi import APIRouter, HTTPException, Depends, status, Request
from firebase_init import db
from auth import verify_firebase_token, verify_admin_access
from models import PaymentRequest, PaymentResponse, RefundRecord
from utils import calculate_earnings, generate_order_number, generate_transaction_id
from datetime import datetime, timezone
import stripe
import logging
import uuid
import os
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

# Configure Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_your_secret_key_here")

router = APIRouter(prefix="/api", tags=["payment"])

@router.post("/process-payment")
async def process_payment(payment_request: PaymentRequest, user_data: dict = Depends(verify_firebase_token)):
    """Process online payment for cart items"""
    try:
        logger.info(f"Processing payment for {len(payment_request.cart_items)} items")
        
        # Calculate total amount
        total_amount = sum(item.price * item.quantity for item in payment_request.cart_items)
        
        # Validate cart items exist and are available
        unavailable_items = []
        item_details = {}
        
        for cart_item in payment_request.cart_items:
            item_ref = db.collection('items').document(cart_item.item_id)
            item_doc = item_ref.get()
            
            if not item_doc.exists:
                unavailable_items.append(f"Item '{cart_item.title}' no longer exists")
                continue
            
            item_data = item_doc.to_dict()
            if item_data.get('status') != 'live':
                unavailable_items.append(f"Item '{cart_item.title}' is no longer available")
                continue
            
            item_details[cart_item.item_id] = {
                'doc_ref': item_ref,
                'data': item_data
            }
        
        if unavailable_items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Some items are no longer available: {', '.join(unavailable_items)}"
            )
        
        # Process payment with Stripe
        try:
            payment_intent = stripe.PaymentIntent.create(
                amount=int(total_amount * 100),  # Stripe expects cents
                currency='usd',
                payment_method=payment_request.payment_method_id,
                confirmation_method='manual',
                confirm=True,
                return_url='https://your-domain.com/return',
                metadata={
                    'customer_name': payment_request.customer_info.name,
                    'customer_email': payment_request.customer_info.email,
                    'fulfillment_method': payment_request.fulfillment_method,
                    'items_count': len(payment_request.cart_items)
                }
            )
            
            if payment_intent.status == 'requires_action':
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail={
                        "requires_action": True,
                        "payment_intent_client_secret": payment_intent.client_secret
                    }
                )
            elif payment_intent.status != 'succeeded':
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail="Payment failed"
                )
        
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error: {e}")
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Payment processing failed: {str(e)}"
            )
        
        # Generate order and transaction IDs
        order_id = generate_order_number()
        transaction_id = generate_transaction_id()
        
        # Update items to sold status and create order
        sold_items = []
        seller_earnings = {}
        
        for cart_item in payment_request.cart_items:
            item_detail = item_details[cart_item.item_id]
            item_ref = item_detail['doc_ref']
            item_data = item_detail['data']
            
            # Calculate earnings split
            earnings = calculate_earnings(cart_item.price)
            seller_id = cart_item.seller_id
            
            if seller_id not in seller_earnings:
                seller_earnings[seller_id] = {
                    'seller_name': cart_item.seller_name,
                    'total_earnings': 0,
                    'items_sold': []
                }
            
            seller_earnings[seller_id]['total_earnings'] += earnings['seller_earnings']
            seller_earnings[seller_id]['items_sold'].append({
                'item_id': cart_item.item_id,
                'title': cart_item.title,
                'price': cart_item.price,
                'earnings': earnings['seller_earnings']
            })
            
            # Update item status
            item_ref.update({
                'status': 'sold',
                'soldAt': datetime.now(timezone.utc),
                'soldPrice': cart_item.price,
                'buyerId': user_data.get('uid') if not user_data.get('is_server') else None,
                'buyerName': payment_request.customer_info.name,
                'buyerEmail': payment_request.customer_info.email,
                'paymentId': payment_intent.id,
                'paymentStatus': 'completed',
                'saleTransactionId': transaction_id,
                'saleType': 'online',
                'fulfillmentMethod': payment_request.fulfillment_method,
                'userEarnings': earnings['seller_earnings'],
                'adminEarnings': earnings['store_commission'],
                'buyerInfo': {
                    'name': payment_request.customer_info.name,
                    'email': payment_request.customer_info.email,
                    'phone': payment_request.customer_info.phone,
                    'address': payment_request.customer_info.address or '',
                    'city': payment_request.customer_info.city or '',
                    'zipCode': payment_request.customer_info.zip_code or ''
                }
            })
            
            sold_items.append({
                'item_id': cart_item.item_id,
                'title': cart_item.title,
                'price': cart_item.price,
                'seller_name': cart_item.seller_name
            })
        
        # Create order record
        order_data = {
            'orderId': order_id,
            'transactionId': transaction_id,
            'buyerId': user_data.get('uid') if not user_data.get('is_server') else None,
            'buyerName': payment_request.customer_info.name,
            'buyerEmail': payment_request.customer_info.email,
            'buyerPhone': payment_request.customer_info.phone,
            'items': sold_items,
            'totalAmount': total_amount,
            'fulfillmentMethod': payment_request.fulfillment_method,
            'paymentMethod': 'stripe',
            'paymentIntentId': payment_intent.id,
            'paymentStatus': 'completed',
            'orderStatus': 'pending_fulfillment' if payment_request.fulfillment_method == 'shipping' else 'ready_for_pickup',
            'createdAt': datetime.now(timezone.utc),
            'sellerEarnings': dict(seller_earnings),
            'shippingAddress': {
                'address': payment_request.customer_info.address or '',
                'city': payment_request.customer_info.city or '',
                'zipCode': payment_request.customer_info.zip_code or ''
            } if payment_request.fulfillment_method == 'shipping' else None
        }
        
        db.collection('orders').add(order_data)
        
        # Award purchase points if user is registered
        if user_data.get('uid') and not user_data.get('is_server'):
            try:
                from rewards import award_purchase_points
                await award_purchase_points(user_data.get('uid'), total_amount)
            except Exception as points_error:
                logger.warning(f"Failed to award purchase points: {points_error}")
        
        logger.info(f"Successfully processed payment for order {order_id}")
        
        return PaymentResponse(
            success=True,
            order_id=order_id,
            transaction_id=transaction_id,
            total_amount=total_amount,
            message=f"Payment successful! Order {order_id} has been created."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing payment: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment processing failed: {str(e)}"
        )

@router.post("/admin/process-inhouse-sale")
async def process_inhouse_sale(request: Request, admin_data: dict = Depends(verify_admin_access)):
    """Process in-house sale for walk-in customers"""
    try:
        data = await request.json()
        items = data.get('items', [])
        customer_info = data.get('customer_info', {})
        payment_method = data.get('payment_method', 'cash')
        
        admin_uid = admin_data.get('uid')
        admin_name = admin_data.get('name', 'Admin')
        
        logger.info(f"Processing in-house sale for {len(items)} items by admin {admin_uid}")
        
        if not items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No items provided for sale"
            )
        
        # Validate required customer info
        required_fields = ['name', 'email', 'phone']
        for field in required_fields:
            if field not in customer_info or not customer_info[field]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Customer {field} is required"
                )
        
        # Calculate total and validate items
        total_amount = 0
        seller_earnings = {}
        sold_items = []
        
        for item in items:
            item_id = item.get('id')
            if not item_id:
                continue
            
            # Get item from database
            item_ref = db.collection('items').document(item_id)
            item_doc = item_ref.get()
            
            if not item_doc.exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Item {item_id} not found"
                )
            
            item_data = item_doc.to_dict()
            
            if item_data.get('status') not in ['live', 'approved']:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item '{item_data.get('title')}' is not available for sale"
                )
            
            price = item_data.get('price', 0)
            total_amount += price
            
            # Calculate earnings
            earnings = calculate_earnings(price)
            seller_id = item_data.get('sellerId')
            seller_name = item_data.get('sellerName', 'Unknown')
            
            if seller_id not in seller_earnings:
                seller_earnings[seller_id] = {
                    'seller_name': seller_name,
                    'total_earnings': 0,
                    'items_sold': []
                }
            
            seller_earnings[seller_id]['total_earnings'] += earnings['seller_earnings']
            seller_earnings[seller_id]['items_sold'].append({
                'item_id': item_id,
                'title': item_data.get('title'),
                'price': price,
                'earnings': earnings['seller_earnings']
            })
            
            sold_items.append({
                'item_id': item_id,
                'title': item_data.get('title'),
                'price': price,
                'seller_name': seller_name
            })
        
        # Generate IDs
        order_id = generate_order_number()
        transaction_id = generate_transaction_id()
        
        # Update all items to sold
        for item in items:
            item_id = item.get('id')
            if not item_id:
                continue
            
            item_ref = db.collection('items').document(item_id)
            item_data = item_ref.get().to_dict()
            
            earnings = calculate_earnings(item_data.get('price', 0))
            
            item_ref.update({
                'status': 'sold',
                'soldAt': datetime.now(timezone.utc),
                'soldPrice': item_data.get('price', 0),
                'buyerName': customer_info['name'],
                'buyerEmail': customer_info['email'],
                'saleTransactionId': transaction_id,
                'saleType': 'in-store',
                'paymentMethod': payment_method,
                'paymentStatus': 'completed',
                'userEarnings': earnings['seller_earnings'],
                'adminEarnings': earnings['store_commission'],
                'processedBy': admin_uid,
                'processedByName': admin_name,
                'buyerInfo': {
                    'name': customer_info['name'],
                    'email': customer_info['email'],
                    'phone': customer_info['phone'],
                    'address': '',
                    'city': '',
                    'zipCode': ''
                }
            })
        
        # Create order record
        order_data = {
            'orderId': order_id,
            'transactionId': transaction_id,
            'buyerName': customer_info['name'],
            'buyerEmail': customer_info['email'],
            'buyerPhone': customer_info['phone'],
            'items': sold_items,
            'totalAmount': total_amount,
            'paymentMethod': payment_method,
            'paymentStatus': 'completed',
            'orderStatus': 'completed',
            'saleType': 'in-store',
            'processedBy': admin_uid,
            'processedByName': admin_name,
            'createdAt': datetime.now(timezone.utc),
            'sellerEarnings': dict(seller_earnings)
        }
        
        db.collection('orders').add(order_data)
        
        logger.info(f"Successfully processed in-house sale {order_id} for ${total_amount}")
        
        return {
            "success": True,
            "order_id": order_id,
            "transaction_id": transaction_id,
            "total_amount": total_amount,
            "items_sold": len(sold_items),
            "payment_method": payment_method,
            "message": f"In-house sale completed successfully. Order: {order_id}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing in-house sale: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process in-house sale: {str(e)}"
        )

@router.post("/admin/issue-refund")
async def issue_refund(request: Request, admin_data: dict = Depends(verify_admin_access)):
    """Issue a refund for a sold item"""
    try:
        data = await request.json()
        order_id = data.get('order_id')
        refund_amount = data.get('refund_amount')
        reason = data.get('reason', 'No reason provided')
        
        admin_uid = admin_data.get('uid')
        admin_name = admin_data.get('name', 'Admin')
        
        logger.info(f"Admin {admin_uid} issuing refund for order {order_id}")
        
        if not order_id or not refund_amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Order ID and refund amount are required"
            )
        
        if refund_amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Refund amount must be greater than 0"
            )
        
        # Find the order
        orders_ref = db.collection('orders')
        orders_query = orders_ref.where('orderId', '==', order_id)
        order_docs = list(orders_query.get())
        
        if not order_docs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Order {order_id} not found"
            )
        
        order_doc = order_docs[0]
        order_data = order_doc.to_dict()
        
        # Check if already refunded
        if order_data.get('refundStatus') == 'refunded':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Order has already been refunded"
            )
        
        # Process Stripe refund if it was a Stripe payment
        stripe_refund_id = None
        if order_data.get('paymentIntentId'):
            try:
                stripe_refund = stripe.Refund.create(
                    payment_intent=order_data['paymentIntentId'],
                    amount=int(refund_amount * 100),  # Stripe expects cents
                    metadata={
                        'order_id': order_id,
                        'reason': reason,
                        'refunded_by': admin_name
                    }
                )
                stripe_refund_id = stripe_refund.id
                logger.info(f"Stripe refund created: {stripe_refund_id}")
            except stripe.error.StripeError as e:
                logger.error(f"Stripe refund failed: {e}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Payment refund failed: {str(e)}"
                )
        
        # Update order status
        order_doc.reference.update({
            'refundStatus': 'refunded',
            'refundAmount': refund_amount,
            'refundReason': reason,
            'refundedAt': datetime.now(timezone.utc),
            'refundedBy': admin_uid,
            'refundedByName': admin_name,
            'stripeRefundId': stripe_refund_id
        })
        
        # Find and update associated items
        items_to_update = order_data.get('items', [])
        for item in items_to_update:
            item_id = item.get('item_id')
            if not item_id:
                continue
            
            try:
                item_ref = db.collection('items').document(item_id)
                item_doc = item_ref.get()
                
                if item_doc.exists:
                    item_ref.update({
                        'refundedAt': datetime.now(timezone.utc),
                        'refundReason': reason,
                        'returnedToShop': True,
                        'status': 'live',  # Make item available again
                        'refundAmount': refund_amount / len(items_to_update)  # Split refund across items
                    })
                    
                    # Create refund record
                    item_data = item_doc.to_dict()
                    refund_record = {
                        'itemId': item_id,
                        'itemTitle': item_data.get('title', 'Unknown'),
                        'originalPrice': item_data.get('soldPrice', 0),
                        'refundAmount': refund_amount / len(items_to_update),
                        'reason': reason,
                        'refundedAt': datetime.now(timezone.utc),
                        'refundedBy': admin_uid,
                        'refundedByName': admin_name,
                        'originalBuyerId': order_data.get('buyerId'),
                        'originalBuyerName': order_data.get('buyerName'),
                        'sellerId': item_data.get('sellerId'),
                        'sellerName': item_data.get('sellerName', 'Unknown'),
                        'orderId': order_id,
                        'stripeRefundId': stripe_refund_id
                    }
                    
                    db.collection('refunds').add(refund_record)
                    
            except Exception as item_error:
                logger.error(f"Error updating item {item_id} for refund: {item_error}")
        
        logger.info(f"Successfully issued refund of ${refund_amount} for order {order_id}")
        
        return {
            "success": True,
            "message": f"Refund of ${refund_amount} issued successfully for order {order_id}",
            "refund_amount": refund_amount,
            "order_id": order_id,
            "stripe_refund_id": stripe_refund_id,
            "items_returned": len(items_to_update)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error issuing refund: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to issue refund: {str(e)}"
        ) 