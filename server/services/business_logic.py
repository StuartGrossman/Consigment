"""
Business Logic Services

This module contains high-level business logic and orchestration functions
that coordinate between different components of the system.
"""

from firebase_init import db
from models import ConsignmentItem, UserAnalytics, PaymentRecord, StoreCreditTransaction
from utils import calculate_earnings, generate_order_number, generate_transaction_id
from datetime import datetime, timezone, timedelta
import logging
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

class ItemLifecycleService:
    """Manages the complete lifecycle of consignment items"""
    
    @staticmethod
    async def submit_item(user_data: dict, item_data: dict) -> dict:
        """Submit a new item for consignment with validation and processing"""
        try:
            user_uid = user_data.get('uid')
            user_email = user_data.get('email')
            user_name = user_data.get('name', 'Unknown')
            
            # Validate required fields
            required_fields = ['title', 'description', 'price', 'category']
            missing_fields = [field for field in required_fields if not item_data.get(field)]
            
            if missing_fields:
                return {
                    "success": False,
                    "error": f"Missing required fields: {', '.join(missing_fields)}"
                }
            
            # Create standardized item document
            standardized_item = ItemLifecycleService._standardize_item_data(
                item_data, user_uid, user_email, user_name
            )
            
            # Add item to database
            doc_ref = db.collection('items').add(standardized_item)
            item_id = doc_ref[1].id
            
            # Log submission
            await ItemLifecycleService._log_item_action(
                item_id, user_uid, 'submitted', 'Item submitted for review'
            )
            
            logger.info(f"Successfully submitted item {item_id} for user {user_uid}")
            
            return {
                "success": True,
                "item_id": item_id,
                "status": "pending",
                "message": "Item submitted successfully and is pending review"
            }
            
        except Exception as e:
            logger.error(f"Error submitting item: {e}")
            return {
                "success": False,
                "error": f"Failed to submit item: {str(e)}"
            }
    
    @staticmethod
    def _standardize_item_data(item_data: dict, user_uid: str, user_email: str, user_name: str) -> dict:
        """Standardize item data format"""
        return {
            'title': str(item_data['title']).strip(),
            'description': str(item_data['description']).strip(),
            'price': float(item_data['price']),
            'originalPrice': float(item_data.get('originalPrice', item_data['price'])),
            'category': str(item_data['category']).strip(),
            'gender': item_data.get('gender', ''),
            'size': item_data.get('size', ''),
            'brand': item_data.get('brand', ''),
            'condition': item_data.get('condition', 'Good'),
            'material': item_data.get('material', ''),
            'color': item_data.get('color', ''),
            'sellerId': user_uid,
            'sellerName': user_name,
            'sellerEmail': user_email,
            'sellerPhone': item_data.get('sellerPhone', ''),
            'status': 'pending',
            'images': item_data.get('images', []),
            'tags': item_data.get('tags', []),
            'createdAt': datetime.now(timezone.utc),
            'notes': item_data.get('notes', ''),
        }
    
    @staticmethod
    async def approve_item(item_id: str, admin_data: dict, barcode_data: str = None) -> dict:
        """Approve an item and generate barcode"""
        try:
            admin_uid = admin_data.get('uid')
            admin_name = admin_data.get('name', 'Admin')
            
            item_ref = db.collection('items').document(item_id)
            item_doc = item_ref.get()
            
            if not item_doc.exists:
                return {"success": False, "error": "Item not found"}
            
            item_data = item_doc.to_dict()
            
            if item_data.get('status') != 'pending':
                return {"success": False, "error": "Only pending items can be approved"}
            
            # Generate barcode if not provided
            if not barcode_data:
                barcode_data = ItemLifecycleService._generate_barcode()
            
            # Update item status
            update_data = {
                'status': 'approved',
                'approvedAt': datetime.now(timezone.utc),
                'approvedBy': admin_uid,
                'approvedByName': admin_name,
                'barcodeData': barcode_data,
                'barcodeGeneratedAt': datetime.now(timezone.utc)
            }
            
            item_ref.update(update_data)
            
            # Log approval
            await ItemLifecycleService._log_item_action(
                item_id, admin_uid, 'approved', f'Item approved with barcode {barcode_data}'
            )
            
            logger.info(f"Successfully approved item {item_id} with barcode {barcode_data}")
            
            return {
                "success": True,
                "message": "Item approved successfully",
                "barcode_data": barcode_data
            }
            
        except Exception as e:
            logger.error(f"Error approving item {item_id}: {e}")
            return {"success": False, "error": f"Failed to approve item: {str(e)}"}
    
    @staticmethod
    async def make_item_live(item_id: str, admin_data: dict) -> dict:
        """Make an approved item live for sale"""
        try:
            admin_uid = admin_data.get('uid')
            admin_name = admin_data.get('name', 'Admin')
            
            item_ref = db.collection('items').document(item_id)
            item_doc = item_ref.get()
            
            if not item_doc.exists:
                return {"success": False, "error": "Item not found"}
            
            item_data = item_doc.to_dict()
            
            if item_data.get('status') != 'approved':
                return {"success": False, "error": "Only approved items can be made live"}
            
            # Update item to live status
            update_data = {
                'status': 'live',
                'liveAt': datetime.now(timezone.utc),
                'madeLiveBy': admin_uid,
                'madeLineByName': admin_name
            }
            
            item_ref.update(update_data)
            
            # Log status change
            await ItemLifecycleService._log_item_action(
                item_id, admin_uid, 'made_live', 'Item made live for sale'
            )
            
            logger.info(f"Successfully made item {item_id} live")
            
            return {"success": True, "message": "Item is now live for sale"}
            
        except Exception as e:
            logger.error(f"Error making item {item_id} live: {e}")
            return {"success": False, "error": f"Failed to make item live: {str(e)}"}
    
    @staticmethod
    def _generate_barcode() -> str:
        """Generate a unique barcode for an item"""
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
        return f"CSG{timestamp}{str(hash(timestamp))[-4:]}"
    
    @staticmethod
    async def _log_item_action(item_id: str, user_id: str, action: str, description: str):
        """Log an item action for audit trail"""
        try:
            log_entry = {
                'itemId': item_id,
                'userId': user_id,
                'action': action,
                'description': description,
                'timestamp': datetime.now(timezone.utc)
            }
            
            db.collection('itemAuditLog').add(log_entry)
        except Exception as e:
            logger.warning(f"Failed to log item action: {e}")

class AnalyticsService:
    """Provides business analytics and reporting"""
    
    @staticmethod
    async def get_user_analytics(user_id: str) -> UserAnalytics:
        """Get comprehensive analytics for a user"""
        try:
            # Get all user's items
            items_ref = db.collection('items')
            user_items_query = items_ref.where('sellerId', '==', user_id)
            
            items = []
            for doc in user_items_query.get():
                item_data = doc.to_dict()
                item_data['id'] = doc.id
                items.append(item_data)
            
            # Categorize items
            active_items = [item for item in items if item.get('status') in ['pending', 'approved', 'live']]
            sold_items = [item for item in items if item.get('status') == 'sold']
            pending_items = [item for item in items if item.get('status') == 'pending']
            approved_items = [item for item in items if item.get('status') == 'approved']
            archived_items = [item for item in items if item.get('status') == 'archived']
            
            # Calculate earnings
            total_earnings = sum(item.get('userEarnings', 0) for item in sold_items)
            
            # Get payment records
            payments_ref = db.collection('payments')
            user_payments_query = payments_ref.where('userId', '==', user_id)
            
            total_paid = 0
            for payment_doc in user_payments_query.get():
                payment_data = payment_doc.to_dict()
                total_paid += payment_data.get('amount', 0)
            
            outstanding_balance = total_earnings - total_paid
            
            # Get store credit
            user_ref = db.collection('users').document(user_id)
            user_doc = user_ref.get()
            store_credit = 0
            user_name = 'Unknown'
            user_email = 'unknown@example.com'
            
            if user_doc.exists:
                user_data = user_doc.to_dict()
                store_credit = user_data.get('storeCredit', 0)
                user_name = user_data.get('name', 'Unknown')
                user_email = user_data.get('email', 'unknown@example.com')
            
            return UserAnalytics(
                userId=user_id,
                userName=user_name,
                userEmail=user_email,
                totalItemsListed=len(items),
                totalItemsSold=len(sold_items),
                totalEarnings=total_earnings,
                totalPaid=total_paid,
                outstandingBalance=outstanding_balance,
                storeCredit=store_credit,
                activeItems=active_items,
                soldItems=sold_items,
                pendingItems=pending_items,
                approvedItems=approved_items,
                archivedItems=archived_items
            )
            
        except Exception as e:
            logger.error(f"Error getting user analytics for {user_id}: {e}")
            raise
    
    @staticmethod
    async def get_sales_analytics(date_range: Optional[Tuple[datetime, datetime]] = None) -> dict:
        """Get comprehensive sales analytics"""
        try:
            # Default to last 30 days if no range provided
            if not date_range:
                end_date = datetime.now(timezone.utc)
                start_date = end_date - timedelta(days=30)
                date_range = (start_date, end_date)
            
            start_date, end_date = date_range
            
            # Get orders in date range
            orders_ref = db.collection('orders')
            orders_query = orders_ref.where('createdAt', '>=', start_date).where('createdAt', '<=', end_date)
            
            total_sales = 0
            total_orders = 0
            total_items_sold = 0
            payment_methods = {}
            daily_sales = {}
            
            for order_doc in orders_query.get():
                order_data = order_doc.to_dict()
                
                total_orders += 1
                order_amount = order_data.get('totalAmount', 0)
                total_sales += order_amount
                total_items_sold += len(order_data.get('items', []))
                
                # Track payment methods
                payment_method = order_data.get('paymentMethod', 'unknown')
                payment_methods[payment_method] = payment_methods.get(payment_method, 0) + 1
                
                # Track daily sales
                order_date = order_data.get('createdAt')
                if order_date:
                    day_key = order_date.strftime('%Y-%m-%d')
                    daily_sales[day_key] = daily_sales.get(day_key, 0) + order_amount
            
            # Calculate average order value
            avg_order_value = total_sales / total_orders if total_orders > 0 else 0
            
            return {
                'period': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat()
                },
                'totals': {
                    'sales': round(total_sales, 2),
                    'orders': total_orders,
                    'items_sold': total_items_sold,
                    'avg_order_value': round(avg_order_value, 2)
                },
                'breakdown': {
                    'payment_methods': payment_methods,
                    'daily_sales': daily_sales
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting sales analytics: {e}")
            raise

class NotificationService:
    """Handles system notifications and alerts"""
    
    @staticmethod
    async def create_item_notification(item_id: str, user_id: str, notification_type: str, message: str):
        """Create a notification for an item action"""
        try:
            notification_data = {
                'itemId': item_id,
                'userId': user_id,
                'type': notification_type,
                'message': message,
                'read': False,
                'createdAt': datetime.now(timezone.utc)
            }
            
            db.collection('notifications').add(notification_data)
            logger.info(f"Created notification for user {user_id}: {message}")
            
        except Exception as e:
            logger.error(f"Error creating notification: {e}")
    
    @staticmethod
    async def get_user_notifications(user_id: str, limit: int = 50) -> List[dict]:
        """Get notifications for a user"""
        try:
            notifications_ref = db.collection('notifications')
            notifications_query = notifications_ref.where('userId', '==', user_id).order_by('createdAt', direction='desc').limit(limit)
            
            notifications = []
            for doc in notifications_query.get():
                notification_data = doc.to_dict()
                notification_data['id'] = doc.id
                notifications.append(notification_data)
            
            return notifications
            
        except Exception as e:
            logger.error(f"Error getting notifications for user {user_id}: {e}")
            return []
    
    @staticmethod
    async def mark_notification_read(notification_id: str):
        """Mark a notification as read"""
        try:
            notification_ref = db.collection('notifications').document(notification_id)
            notification_ref.update({
                'read': True,
                'readAt': datetime.now(timezone.utc)
            })
            
        except Exception as e:
            logger.error(f"Error marking notification {notification_id} as read: {e}")

class ValidationService:
    """Provides data validation and business rule enforcement"""
    
    @staticmethod
    def validate_item_data(item_data: dict) -> Tuple[bool, List[str]]:
        """Validate item data against business rules"""
        errors = []
        
        # Required fields
        required_fields = ['title', 'description', 'price', 'category']
        for field in required_fields:
            if not item_data.get(field):
                errors.append(f"{field} is required")
        
        # Price validation
        try:
            price = float(item_data.get('price', 0))
            if price <= 0:
                errors.append("Price must be greater than 0")
            elif price > 10000:
                errors.append("Price cannot exceed $10,000")
        except (ValueError, TypeError):
            errors.append("Price must be a valid number")
        
        # Title length
        title = item_data.get('title', '')
        if len(title) > 100:
            errors.append("Title cannot exceed 100 characters")
        
        # Description length
        description = item_data.get('description', '')
        if len(description) > 1000:
            errors.append("Description cannot exceed 1000 characters")
        
        # Category validation
        valid_categories = [
            'Jackets', 'Pants', 'Shirts', 'Footwear', 'Backpacks', 
            'Climbing Gear', 'Sleep Systems', 'Cooking Gear', 
            'Base Layers', 'Socks', 'Vests', 'Outerwear', 'Accessories'
        ]
        category = item_data.get('category', '')
        if category and category not in valid_categories:
            errors.append(f"Category must be one of: {', '.join(valid_categories)}")
        
        # Condition validation
        valid_conditions = ['New', 'Like New', 'Good', 'Fair']
        condition = item_data.get('condition', '')
        if condition and condition not in valid_conditions:
            errors.append(f"Condition must be one of: {', '.join(valid_conditions)}")
        
        return len(errors) == 0, errors
    
    @staticmethod
    def validate_payment_data(payment_data: dict) -> Tuple[bool, List[str]]:
        """Validate payment data"""
        errors = []
        
        # Required customer info
        customer_info = payment_data.get('customer_info', {})
        required_customer_fields = ['name', 'email', 'phone']
        
        for field in required_customer_fields:
            if not customer_info.get(field):
                errors.append(f"Customer {field} is required")
        
        # Email validation
        email = customer_info.get('email', '')
        if email and '@' not in email:
            errors.append("Valid email address is required")
        
        # Cart items validation
        cart_items = payment_data.get('cart_items', [])
        if not cart_items:
            errors.append("Cart cannot be empty")
        
        # Fulfillment method validation
        fulfillment_method = payment_data.get('fulfillment_method', '')
        if fulfillment_method not in ['pickup', 'shipping']:
            errors.append("Fulfillment method must be 'pickup' or 'shipping'")
        
        # Shipping address validation
        if fulfillment_method == 'shipping':
            required_shipping_fields = ['address', 'city', 'zip_code']
            for field in required_shipping_fields:
                if not customer_info.get(field):
                    errors.append(f"Shipping {field} is required")
        
        return len(errors) == 0, errors
    
    @staticmethod
    def can_user_modify_item(item_data: dict, user_id: str, is_admin: bool = False) -> Tuple[bool, str]:
        """Check if a user can modify an item"""
        # Admins can modify any item
        if is_admin:
            return True, ""
        
        # Users can only modify their own items
        if item_data.get('sellerId') != user_id:
            return False, "You can only modify your own items"
        
        # Users can only modify pending or rejected items
        status = item_data.get('status')
        if status not in ['pending', 'rejected']:
            return False, "You can only modify pending or rejected items"
        
        return True, "" 