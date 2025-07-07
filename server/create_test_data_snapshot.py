#!/usr/bin/env python3
"""
Test Data Snapshot Creator

This script captures the current state of the database items and category banner images
to create a new test data set that can be used by the generate test data functionality.

Usage:
    python create_test_data_snapshot.py

This will:
1. Connect to Firestore and fetch all current items
2. Fetch all current categories with their banner images
3. Create a comprehensive JSON file with all the data
4. Update the main.py generate test data endpoint to use this new data
"""

import os
import sys
import json
import asyncio
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

# Add the server directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.cloud.firestore_v1.base_query import FieldFilter
except ImportError:
    print("❌ Firebase Admin SDK not installed. Run: pip install firebase-admin")
    sys.exit(1)

class TestDataSnapshotCreator:
    def __init__(self):
        self.db = None
        self.snapshot_data = {
            'metadata': {
                'created_at': datetime.now(timezone.utc).isoformat(),
                'description': 'Snapshot of current database state for test data generation',
                'version': '1.0'
            },
            'items': [],
            'categories': [],
            'users': []
        }
        
    def initialize_firebase(self):
        """Initialize Firebase connection"""
        try:
            # Check if Firebase is already initialized
            if not firebase_admin._apps:
                # Try to use service account key if available
                service_account_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
                if os.path.exists(service_account_path):
                    cred = credentials.Certificate(service_account_path)
                    firebase_admin.initialize_app(cred)
                    print("✅ Firebase initialized with service account")
                else:
                    # Use default credentials (for local development)
                    firebase_admin.initialize_app()
                    print("✅ Firebase initialized with default credentials")
            
            self.db = firestore.client()
            print("✅ Firestore client connected")
            return True
            
        except Exception as e:
            print(f"❌ Failed to initialize Firebase: {e}")
            print("Make sure you have proper Firebase credentials configured")
            return False
    
    def serialize_timestamp(self, obj):
        """Convert Firestore timestamps to ISO strings"""
        if hasattr(obj, 'timestamp'):
            return obj.timestamp()
        elif hasattr(obj, 'isoformat'):
            return obj.isoformat()
        elif isinstance(obj, datetime):
            return obj.isoformat()
        return obj
    
    def clean_item_data(self, item_data: Dict[str, Any]) -> Dict[str, Any]:
        """Clean and standardize item data"""
        cleaned = {}
        
        # Standard fields that we want to preserve
        standard_fields = [
            'title', 'description', 'price', 'category', 'subcategory', 'brand',
            'condition', 'size', 'color', 'material', 'weight', 'dimensions',
            'status', 'sellerId', 'sellerName', 'sellerEmail', 'sellerPhone',
            'images', 'tags', 'featured', 'notes', 'adminNotes',
            'createdAt', 'approvedAt', 'liveAt', 'soldAt', 'shippedAt',
            'barcodeData', 'barcodeGeneratedAt', 'printConfirmedAt',
            'fulfillmentMethod', 'paymentType', 'buyerId', 'buyerName',
            'buyerEmail', 'buyerPhone', 'orderNumber', 'transactionId',
            'earnings', 'commission', 'refunded', 'refundedAt', 'refundReason'
        ]
        
        for field in standard_fields:
            if field in item_data:
                value = item_data[field]
                # Handle timestamp fields
                if field.endswith('At') and value is not None:
                    if hasattr(value, 'timestamp'):
                        cleaned[field] = self.serialize_timestamp(value)
                    else:
                        cleaned[field] = value
                else:
                    cleaned[field] = value
        
        return cleaned
    
    def clean_category_data(self, category_data: Dict[str, Any]) -> Dict[str, Any]:
        """Clean and standardize category data"""
        cleaned = {}
        
        # Standard fields for categories
        standard_fields = [
            'name', 'description', 'image', 'icon', 'active', 'order',
            'subcategories', 'itemCount', 'featured', 'color', 'bannerImage'
        ]
        
        for field in standard_fields:
            if field in category_data:
                cleaned[field] = category_data[field]
        
        return cleaned
    
    def clean_user_data(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Clean and standardize user data (anonymized)"""
        cleaned = {}
        
        # Only preserve non-sensitive user data
        safe_fields = [
            'isAdmin', 'totalEarnings', 'totalSales', 'itemsListed',
            'itemsSold', 'memberSince', 'lastSignIn', 'status'
        ]
        
        for field in safe_fields:
            if field in user_data:
                value = user_data[field]
                if field in ['memberSince', 'lastSignIn'] and value is not None:
                    if hasattr(value, 'timestamp'):
                        cleaned[field] = self.serialize_timestamp(value)
                    else:
                        cleaned[field] = value
                else:
                    cleaned[field] = value
        
        # Add anonymized identifiers
        cleaned['displayName'] = 'Test User'
        cleaned['email'] = 'testuser@example.com'
        
        return cleaned
    
    async def fetch_items(self):
        """Fetch all items from Firestore"""
        print("📦 Fetching items from database...")
        
        try:
            items_ref = self.db.collection('items')
            docs = items_ref.stream()
            
            item_count = 0
            for doc in docs:
                item_data = doc.to_dict()
                cleaned_item = self.clean_item_data(item_data)
                cleaned_item['id'] = doc.id  # Preserve the document ID
                self.snapshot_data['items'].append(cleaned_item)
                item_count += 1
            
            print(f"✅ Fetched {item_count} items")
            return True
            
        except Exception as e:
            print(f"❌ Failed to fetch items: {e}")
            return False
    
    async def fetch_categories(self):
        """Fetch all categories from Firestore"""
        print("🏷️ Fetching categories from database...")
        
        try:
            categories_ref = self.db.collection('categories')
            docs = categories_ref.stream()
            
            category_count = 0
            for doc in docs:
                category_data = doc.to_dict()
                cleaned_category = self.clean_category_data(category_data)
                cleaned_category['id'] = doc.id  # Preserve the document ID
                self.snapshot_data['categories'].append(cleaned_category)
                category_count += 1
            
            print(f"✅ Fetched {category_count} categories")
            return True
            
        except Exception as e:
            print(f"❌ Failed to fetch categories: {e}")
            return False
    
    async def fetch_sample_users(self):
        """Fetch a sample of users (anonymized)"""
        print("👥 Fetching sample users from database...")
        
        try:
            users_ref = self.db.collection('users')
            # Limit to first 10 users for sample data
            docs = users_ref.limit(10).stream()
            
            user_count = 0
            for doc in docs:
                user_data = doc.to_dict()
                cleaned_user = self.clean_user_data(user_data)
                cleaned_user['id'] = f"test_user_{user_count + 1}"  # Anonymized ID
                self.snapshot_data['users'].append(cleaned_user)
                user_count += 1
            
            print(f"✅ Fetched {user_count} sample users (anonymized)")
            return True
            
        except Exception as e:
            print(f"❌ Failed to fetch users: {e}")
            return False
    
    def save_snapshot(self, filename: str = 'test_data_snapshot.json'):
        """Save the snapshot to a JSON file"""
        print(f"💾 Saving snapshot to {filename}...")
        
        try:
            # Save to server directory
            filepath = os.path.join(os.path.dirname(__file__), filename)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(self.snapshot_data, f, indent=2, ensure_ascii=False, default=str)
            
            print(f"✅ Snapshot saved to {filepath}")
            
            # Print summary
            print("\n📊 Snapshot Summary:")
            print(f"   Items: {len(self.snapshot_data['items'])}")
            print(f"   Categories: {len(self.snapshot_data['categories'])}")
            print(f"   Sample Users: {len(self.snapshot_data['users'])}")
            print(f"   Created: {self.snapshot_data['metadata']['created_at']}")
            
            return True
            
        except Exception as e:
            print(f"❌ Failed to save snapshot: {e}")
            return False
    
    def create_backup_script(self):
        """Create a backup of the current test data generation code"""
        print("🔄 Creating backup of current test data generation...")
        
        try:
            main_py_path = os.path.join(os.path.dirname(__file__), 'main.py')
            backup_path = os.path.join(os.path.dirname(__file__), 'main_backup_before_snapshot.py')
            
            if os.path.exists(main_py_path):
                import shutil
                shutil.copy2(main_py_path, backup_path)
                print(f"✅ Backup created: {backup_path}")
            
        except Exception as e:
            print(f"⚠️ Could not create backup: {e}")
    
    async def run_snapshot(self):
        """Run the complete snapshot process"""
        print("🚀 Starting test data snapshot creation...")
        print("=" * 50)
        
        # Initialize Firebase
        if not self.initialize_firebase():
            return False
        
        # Create backup
        self.create_backup_script()
        
        # Fetch all data
        success = True
        success &= await self.fetch_items()
        success &= await self.fetch_categories()
        success &= await self.fetch_sample_users()
        
        if not success:
            print("❌ Failed to fetch all data")
            return False
        
        # Save snapshot
        if not self.save_snapshot():
            return False
        
        print("\n🎉 Snapshot creation completed successfully!")
        print("\nNext steps:")
        print("1. Review the generated test_data_snapshot.json file")
        print("2. Update main.py to use this snapshot for test data generation")
        print("3. Test the new test data generation functionality")
        
        return True

def main():
    """Main function"""
    print("Test Data Snapshot Creator")
    print("=" * 50)
    
    creator = TestDataSnapshotCreator()
    
    # Run the snapshot creation
    try:
        result = asyncio.run(creator.run_snapshot())
        if result:
            print("\n✅ Snapshot creation completed successfully!")
            sys.exit(0)
        else:
            print("\n❌ Snapshot creation failed!")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n⚠️ Snapshot creation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 