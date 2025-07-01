from firebase_init import db
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import logging

logger = logging.getLogger(__name__)


class DatabaseService:
    """Service class for database operations"""
    
    @staticmethod
    def get_collection(collection_name: str):
        """Get a Firestore collection reference"""
        return db.collection(collection_name)
    
    @staticmethod
    def get_document(collection_name: str, doc_id: str):
        """Get a document from Firestore"""
        try:
            doc_ref = db.collection(collection_name).document(doc_id)
            doc = doc_ref.get()
            if doc.exists:
                return doc.to_dict()
            return None
        except Exception as e:
            logger.error(f"Error getting document {doc_id} from {collection_name}: {e}")
            return None
    
    @staticmethod
    def create_document(collection_name: str, doc_id: str, data: Dict[str, Any]):
        """Create a new document in Firestore"""
        try:
            doc_ref = db.collection(collection_name).document(doc_id)
            doc_ref.set(data)
            logger.info(f"Created document {doc_id} in {collection_name}")
            return True
        except Exception as e:
            logger.error(f"Error creating document {doc_id} in {collection_name}: {e}")
            return False
    
    @staticmethod
    def update_document(collection_name: str, doc_id: str, updates: Dict[str, Any]):
        """Update a document in Firestore"""
        try:
            doc_ref = db.collection(collection_name).document(doc_id)
            doc_ref.update(updates)
            logger.info(f"Updated document {doc_id} in {collection_name}")
            return True
        except Exception as e:
            logger.error(f"Error updating document {doc_id} in {collection_name}: {e}")
            return False
    
    @staticmethod
    def delete_document(collection_name: str, doc_id: str):
        """Delete a document from Firestore"""
        try:
            doc_ref = db.collection(collection_name).document(doc_id)
            doc_ref.delete()
            logger.info(f"Deleted document {doc_id} from {collection_name}")
            return True
        except Exception as e:
            logger.error(f"Error deleting document {doc_id} from {collection_name}: {e}")
            return False
    
    @staticmethod
    def query_documents(collection_name: str, filters: List[tuple] = None, order_by: str = None, limit: int = None):
        """Query documents from Firestore with optional filters, ordering, and limit"""
        try:
            collection_ref = db.collection(collection_name)
            query = collection_ref
            
            # Apply filters
            if filters:
                for field, operator, value in filters:
                    query = query.where(field, operator, value)
            
            # Apply ordering
            if order_by:
                query = query.order_by(order_by)
            
            # Apply limit
            if limit:
                query = query.limit(limit)
            
            docs = query.get()
            results = []
            for doc in docs:
                data = doc.to_dict()
                data['id'] = doc.id
                results.append(data)
            
            return results
        except Exception as e:
            logger.error(f"Error querying {collection_name}: {e}")
            return []


class ItemService:
    """Service class for item-related database operations"""
    
    @staticmethod
    def get_item_by_id(item_id: str) -> Optional[Dict[str, Any]]:
        """Get an item by its ID"""
        return DatabaseService.get_document('items', item_id)
    
    @staticmethod
    def create_item(item_data: Dict[str, Any]) -> bool:
        """Create a new item"""
        item_data['createdAt'] = datetime.now(timezone.utc)
        return DatabaseService.create_document('items', item_data['id'], item_data)
    
    @staticmethod
    def update_item_status(item_id: str, new_status: str, admin_notes: str = None) -> bool:
        """Update an item's status"""
        updates = {
            'status': new_status,
            'updatedAt': datetime.now(timezone.utc)
        }
        
        if new_status == 'approved':
            updates['approvedAt'] = datetime.now(timezone.utc)
        elif new_status == 'live':
            updates['liveAt'] = datetime.now(timezone.utc)
        elif new_status == 'sold':
            updates['soldAt'] = datetime.now(timezone.utc)
        
        if admin_notes:
            updates['adminNotes'] = admin_notes
        
        return DatabaseService.update_document('items', item_id, updates)
    
    @staticmethod
    def get_items_by_status(status: str) -> List[Dict[str, Any]]:
        """Get all items with a specific status"""
        filters = [('status', '==', status)]
        return DatabaseService.query_documents('items', filters=filters)
    
    @staticmethod
    def get_items_by_seller(seller_uid: str) -> List[Dict[str, Any]]:
        """Get all items by a specific seller"""
        filters = [('sellerUid', '==', seller_uid)]
        return DatabaseService.query_documents('items', filters=filters)
    
    @staticmethod
    def get_recent_items(hours: int = 24) -> List[Dict[str, Any]]:
        """Get items with recent activity"""
        # This would need more complex querying logic
        # For now, return all items and filter in application logic
        return DatabaseService.query_documents('items')
    
    @staticmethod
    def bulk_update_items(item_ids: List[str], updates: Dict[str, Any]) -> bool:
        """Bulk update multiple items"""
        try:
            batch = db.batch()
            updates['updatedAt'] = datetime.now(timezone.utc)
            
            for item_id in item_ids:
                doc_ref = db.collection('items').document(item_id)
                batch.update(doc_ref, updates)
            
            batch.commit()
            logger.info(f"Bulk updated {len(item_ids)} items")
            return True
        except Exception as e:
            logger.error(f"Error bulk updating items: {e}")
            return False


class UserService:
    """Service class for user-related database operations"""
    
    @staticmethod
    def get_user_by_uid(user_uid: str) -> Optional[Dict[str, Any]]:
        """Get a user by their UID"""
        return DatabaseService.get_document('users', user_uid)
    
    @staticmethod
    def create_user(user_uid: str, user_data: Dict[str, Any]) -> bool:
        """Create a new user"""
        user_data['createdAt'] = datetime.now(timezone.utc)
        return DatabaseService.create_document('users', user_uid, user_data)
    
    @staticmethod
    def update_user(user_uid: str, updates: Dict[str, Any]) -> bool:
        """Update user data"""
        updates['updatedAt'] = datetime.now(timezone.utc)
        return DatabaseService.update_document('users', user_uid, updates)
    
    @staticmethod
    def set_admin_status(user_uid: str, is_admin: bool) -> bool:
        """Set user's admin status"""
        return DatabaseService.update_document('users', user_uid, {'isAdmin': is_admin})
    
    @staticmethod
    def get_all_users() -> List[Dict[str, Any]]:
        """Get all users"""
        return DatabaseService.query_documents('users')
    
    @staticmethod
    def ban_user(user_uid: str, reason: str, duration_days: int = None) -> bool:
        """Ban a user"""
        ban_data = {
            'isBanned': True,
            'banReason': reason,
            'bannedAt': datetime.now(timezone.utc)
        }
        
        if duration_days:
            ban_end = datetime.now(timezone.utc).replace(
                day=datetime.now(timezone.utc).day + duration_days
            )
            ban_data['banExpiresAt'] = ban_end
        
        return DatabaseService.update_document('users', user_uid, ban_data)


class OrderService:
    """Service class for order-related database operations"""
    
    @staticmethod
    def create_order(order_data: Dict[str, Any]) -> bool:
        """Create a new order"""
        order_data['createdAt'] = datetime.now(timezone.utc)
        return DatabaseService.create_document('orders', order_data['order_id'], order_data)
    
    @staticmethod
    def get_order_by_id(order_id: str) -> Optional[Dict[str, Any]]:
        """Get an order by its ID"""
        return DatabaseService.get_document('orders', order_id)
    
    @staticmethod
    def get_orders_by_user(user_uid: str) -> List[Dict[str, Any]]:
        """Get all orders by a specific user"""
        filters = [('customer_uid', '==', user_uid)]
        return DatabaseService.query_documents('orders', filters=filters)
    
    @staticmethod
    def get_all_orders() -> List[Dict[str, Any]]:
        """Get all orders"""
        return DatabaseService.query_documents('orders', order_by='createdAt')
    
    @staticmethod
    def update_order_status(order_id: str, status: str) -> bool:
        """Update order status"""
        updates = {
            'status': status,
            'updatedAt': datetime.now(timezone.utc)
        }
        return DatabaseService.update_document('orders', order_id, updates)


class RewardsService:
    """Service class for rewards/points-related database operations"""
    
    @staticmethod
    def get_user_points(user_uid: str) -> int:
        """Get user's current points balance"""
        user_data = UserService.get_user_by_uid(user_uid)
        return user_data.get('rewardPoints', 0) if user_data else 0
    
    @staticmethod
    def add_points(user_uid: str, points: int, reason: str) -> bool:
        """Add points to user's account"""
        try:
            # Get current points
            current_points = RewardsService.get_user_points(user_uid)
            new_points = current_points + points
            
            # Update user's points
            UserService.update_user(user_uid, {'rewardPoints': new_points})
            
            # Log the transaction
            transaction_data = {
                'user_uid': user_uid,
                'points_change': points,
                'reason': reason,
                'timestamp': datetime.now(timezone.utc),
                'balance_after': new_points
            }
            DatabaseService.create_document('pointsTransactions', 
                                          f"{user_uid}_{int(datetime.now(timezone.utc).timestamp())}", 
                                          transaction_data)
            
            logger.info(f"Added {points} points to user {user_uid}: {reason}")
            return True
        except Exception as e:
            logger.error(f"Error adding points to user {user_uid}: {e}")
            return False
    
    @staticmethod
    def redeem_points(user_uid: str, points: int, reason: str) -> bool:
        """Redeem points from user's account"""
        current_points = RewardsService.get_user_points(user_uid)
        
        if current_points < points:
            logger.warning(f"User {user_uid} attempted to redeem {points} points but only has {current_points}")
            return False
        
        return RewardsService.add_points(user_uid, -points, reason) 