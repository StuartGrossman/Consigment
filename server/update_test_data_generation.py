#!/usr/bin/env python3
"""
Update Test Data Generation Script

This script updates the main.py file to use the snapshot data created by
create_test_data_snapshot.py instead of the hardcoded test data.
"""

import os
import json
import re
from datetime import datetime

def load_snapshot_data():
    """Load the snapshot data from the JSON file"""
    snapshot_file = os.path.join(os.path.dirname(__file__), 'test_data_snapshot.json')
    
    if not os.path.exists(snapshot_file):
        print(f"❌ Snapshot file not found: {snapshot_file}")
        print("Please run create_test_data_snapshot.py first")
        return None
    
    try:
        with open(snapshot_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        print(f"✅ Loaded snapshot data:")
        print(f"   Items: {len(data['items'])}")
        print(f"   Categories: {len(data['categories'])}")
        print(f"   Users: {len(data['users'])}")
        print(f"   Created: {data['metadata']['created_at']}")
        
        return data
    except Exception as e:
        print(f"❌ Failed to load snapshot data: {e}")
        return None

def create_new_generate_test_data_function(snapshot_data):
    """Create the new generate test data function using snapshot data"""
    
    function_code = '''
@app.post("/api/admin/generate-test-data")
async def generate_test_data(request: Request, admin_data: dict = Depends(verify_admin_access)):
    """Admin endpoint to generate test data using real database snapshot"""
    try:
        admin_user_id = admin_data.get('uid')
        logger.info(f"Admin {admin_user_id} generating test data from snapshot")
        
        # Load snapshot data
        import json
        import os
        
        snapshot_file = os.path.join(os.path.dirname(__file__), 'test_data_snapshot.json')
        
        if not os.path.exists(snapshot_file):
            logger.error("Snapshot file not found")
            raise HTTPException(status_code=500, detail="Test data snapshot not found")
        
        with open(snapshot_file, 'r', encoding='utf-8') as f:
            snapshot_data = json.load(f)
        
        items_created = 0
        categories_created = 0
        users_created = 0
        
        # Create categories first
        for category_data in snapshot_data.get('categories', []):
            try:
                # Create new document ID
                category_ref = db.collection('categories').document()
                
                # Prepare category data
                category_doc = {
                    'name': category_data.get('name', 'Unknown Category'),
                    'description': category_data.get('description', ''),
                    'image': category_data.get('image', ''),
                    'icon': category_data.get('icon', ''),
                    'active': category_data.get('active', True),
                    'order': category_data.get('order', 0),
                    'subcategories': category_data.get('subcategories', []),
                    'itemCount': 0,  # Will be updated as items are added
                    'featured': category_data.get('featured', False),
                    'color': category_data.get('color', '#6B7280'),
                    'bannerImage': category_data.get('bannerImage', ''),
                    'isTestData': True,
                    'createdAt': firestore.SERVER_TIMESTAMP
                }
                
                # Remove None values
                category_doc = {k: v for k, v in category_doc.items() if v is not None}
                
                category_ref.set(category_doc)
                categories_created += 1
                logger.info(f"Created category: {category_data.get('name')}")
                
            except Exception as e:
                logger.error(f"Failed to create category {category_data.get('name', 'Unknown')}: {e}")
                continue
        
        # Create test users
        for user_data in snapshot_data.get('users', []):
            try:
                # Create new document ID
                user_ref = db.collection('users').document()
                
                # Prepare user data with test identifiers
                user_doc = {
                    'displayName': f"Test User {users_created + 1}",
                    'email': f"testuser{users_created + 1}@example.com",
                    'isAdmin': user_data.get('isAdmin', False),
                    'totalEarnings': user_data.get('totalEarnings', 0),
                    'totalSales': user_data.get('totalSales', 0),
                    'itemsListed': user_data.get('itemsListed', 0),
                    'itemsSold': user_data.get('itemsSold', 0),
                    'memberSince': firestore.SERVER_TIMESTAMP,
                    'lastSignIn': firestore.SERVER_TIMESTAMP,
                    'status': user_data.get('status', 'active'),
                    'isTestData': True
                }
                
                user_ref.set(user_doc)
                users_created += 1
                logger.info(f"Created test user: {user_doc['displayName']}")
                
            except Exception as e:
                logger.error(f"Failed to create test user: {e}")
                continue
        
        # Create items using snapshot data
        for item_data in snapshot_data.get('items', []):
            try:
                # Create new document ID
                item_ref = db.collection('items').document()
                
                # Prepare item data
                item_doc = {
                    'title': item_data.get('title', 'Unknown Item'),
                    'description': item_data.get('description', ''),
                    'price': float(item_data.get('price', 0)),
                    'category': item_data.get('category', 'General'),
                    'subcategory': item_data.get('subcategory', ''),
                    'brand': item_data.get('brand', ''),
                    'condition': item_data.get('condition', 'Good'),
                    'size': item_data.get('size', ''),
                    'color': item_data.get('color', ''),
                    'material': item_data.get('material', ''),
                    'weight': item_data.get('weight', ''),
                    'dimensions': item_data.get('dimensions', ''),
                    'status': 'pending',  # Always start as pending for test data
                    'sellerId': admin_user_id,  # Use current admin as seller
                    'sellerName': 'Test Seller',
                    'sellerEmail': 'testseller@example.com',
                    'sellerPhone': '+1234567890',
                    'images': item_data.get('images', []),
                    'tags': item_data.get('tags', []),
                    'featured': item_data.get('featured', False),
                    'notes': item_data.get('notes', ''),
                    'adminNotes': 'Generated from database snapshot',
                    'createdAt': firestore.SERVER_TIMESTAMP,
                    'isTestData': True
                }
                
                # Add optional fields if they exist
                if item_data.get('fulfillmentMethod'):
                    item_doc['fulfillmentMethod'] = item_data['fulfillmentMethod']
                if item_data.get('paymentType'):
                    item_doc['paymentType'] = item_data['paymentType']
                if item_data.get('barcodeData'):
                    item_doc['barcodeData'] = item_data['barcodeData']
                
                # Remove None values
                item_doc = {k: v for k, v in item_doc.items() if v is not None}
                
                item_ref.set(item_doc)
                items_created += 1
                logger.info(f"Created item: {item_data.get('title')}")
                
            except Exception as e:
                logger.error(f"Failed to create item {item_data.get('title', 'Unknown')}: {e}")
                continue
        
        logger.info(f"Test data generation completed: {items_created} items, {categories_created} categories, {users_created} users")
        
        return {
            'success': True,
            'message': f'Successfully generated test data from snapshot',
            'items_created': items_created,
            'categories_created': categories_created,
            'users_created': users_created,
            'snapshot_metadata': snapshot_data.get('metadata', {})
        }
        
    except Exception as e:
        logger.error(f"Error generating test data: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
'''
    
    return function_code

def update_main_py(snapshot_data):
    """Update the main.py file with the new test data generation function"""
    
    main_py_path = os.path.join(os.path.dirname(__file__), 'main.py')
    
    if not os.path.exists(main_py_path):
        print(f"❌ main.py not found: {main_py_path}")
        return False
    
    try:
        # Read the current main.py
        with open(main_py_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find the current generate_test_data function
        pattern = r'@app\.post\("/api/admin/generate-test-data"\).*?(?=@app\.|$)'
        match = re.search(pattern, content, re.DOTALL)
        
        if not match:
            print("❌ Could not find generate-test-data endpoint in main.py")
            return False
        
        # Create the new function
        new_function = create_new_generate_test_data_function(snapshot_data)
        
        # Replace the old function with the new one
        new_content = content[:match.start()] + new_function + content[match.end():]
        
        # Write the updated content back
        with open(main_py_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        print("✅ Successfully updated main.py with snapshot-based test data generation")
        return True
        
    except Exception as e:
        print(f"❌ Failed to update main.py: {e}")
        return False

def main():
    """Main function"""
    print("Test Data Generation Updater")
    print("=" * 50)
    
    # Load snapshot data
    snapshot_data = load_snapshot_data()
    if not snapshot_data:
        return False
    
    # Update main.py
    if update_main_py(snapshot_data):
        print("\n🎉 Test data generation has been updated!")
        print("\nThe generate test data endpoint now uses your real database snapshot.")
        print("You can test it by going to Application Test & Performance and clicking 'Generate Test Data'")
        return True
    else:
        print("\n❌ Failed to update test data generation")
        return False

if __name__ == "__main__":
    main() 