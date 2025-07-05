#!/usr/bin/env python3
"""
Script to update existing categories with displayOrder values
This ensures category ordering persists correctly in the application
"""

import firebase_admin
from firebase_admin import credentials, firestore
import os
import sys

def initialize_firebase():
    """Initialize Firebase connection"""
    try:
        # Try to get default app
        firebase_admin.get_app()
    except ValueError:
        # Use the service account key JSON file
        cred = credentials.Certificate('serviceAccountKey.json')
        firebase_admin.initialize_app(cred)
    
    return firestore.client()

def update_categories_with_display_order():
    """Update all categories with displayOrder values"""
    db = initialize_firebase()
    
    # Get all categories
    categories_ref = db.collection('categories')
    categories = list(categories_ref.stream())
    
    if not categories:
        print("No categories found in database. Creating default categories...")
        create_default_categories(db)
        return
    
    print(f"Found {len(categories)} categories. Checking displayOrder values...")
    
    # Check which categories need displayOrder updates
    categories_to_update = []
    for doc in categories:
        category_data = doc.to_dict()
        category_id = doc.id
        
        if 'displayOrder' not in category_data or category_data['displayOrder'] is None:
            categories_to_update.append((category_id, category_data))
    
    if not categories_to_update:
        print("All categories already have displayOrder values!")
        return
    
    print(f"Found {len(categories_to_update)} categories that need displayOrder updates")
    
    # Update categories with displayOrder values
    for i, (category_id, category_data) in enumerate(categories_to_update):
        try:
            # Set displayOrder to current index (maintains existing order)
            new_display_order = i
            
            # Update the category
            categories_ref.document(category_id).update({
                'displayOrder': new_display_order,
                'updatedAt': firestore.SERVER_TIMESTAMP
            })
            
            print(f"✅ Updated category '{category_data.get('name', 'Unknown')}' (ID: {category_id}) with displayOrder: {new_display_order}")
            
        except Exception as e:
            print(f"❌ Error updating category {category_id}: {e}")
    
    print(f"\n🎉 Successfully updated {len(categories_to_update)} categories with displayOrder values!")

def create_default_categories(db):
    """Create default categories with proper displayOrder values"""
    default_categories = [
        {
            'name': 'Hiking',
            'description': 'Trail and backpacking gear',
            'icon': '🥾',
            'bannerImage': '/mountain-trail.jpg',
            'attributes': ['Backpacks', 'Trekking Poles', 'Water Bottles', 'Navigation'],
            'isActive': True,
            'displayOrder': 0,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        },
        {
            'name': 'Climbing',
            'description': 'Rock climbing and bouldering gear',
            'icon': '🧗',
            'bannerImage': '/climbing-action.jpg',
            'attributes': ['Harnesses', 'Ropes', 'Quickdraws', 'Chalk Bags'],
            'isActive': True,
            'displayOrder': 1,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        },
        {
            'name': 'Camping',
            'description': 'Camping and outdoor shelter equipment',
            'icon': '⛺',
            'bannerImage': '/campsite-evening.jpg',
            'attributes': ['Tents', 'Sleeping Bags', 'Camp Stoves', 'Lanterns'],
            'isActive': True,
            'displayOrder': 2,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        },
        {
            'name': 'Skiing',
            'description': 'Alpine and cross-country skiing equipment',
            'icon': '⛷️',
            'bannerImage': '/skiing-powder.jpg',
            'attributes': ['Skis', 'Boots', 'Poles', 'Goggles'],
            'isActive': True,
            'displayOrder': 3,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        },
        {
            'name': 'Snowboarding',
            'description': 'Snowboarding equipment and gear',
            'icon': '🏂',
            'bannerImage': '/snowboard-jump.jpg',
            'attributes': ['Snowboards', 'Boots', 'Bindings', 'Helmets'],
            'isActive': True,
            'displayOrder': 4,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        },
        {
            'name': 'Water Sports',
            'description': 'Water sports and rafting equipment',
            'icon': '🌊',
            'bannerImage': '/whitewater-rafting.jpg',
            'attributes': ['Kayaks', 'Paddles', 'Life Jackets', 'Dry Bags'],
            'isActive': True,
            'displayOrder': 5,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        },
        {
            'name': 'Cycling',
            'description': 'Mountain biking and cycling gear',
            'icon': '🚵',
            'bannerImage': '/mountain-biking.jpg',
            'attributes': ['Bikes', 'Helmets', 'Pumps', 'Tools'],
            'isActive': True,
            'displayOrder': 6,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        },
        {
            'name': 'Apparel',
            'description': 'Outdoor clothing and apparel',
            'icon': '👕',
            'bannerImage': '/outdoor-clothing.jpg',
            'attributes': ['Jackets', 'Pants', 'Base Layers', 'Accessories'],
            'isActive': True,
            'displayOrder': 7,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        }
    ]
    
    categories_ref = db.collection('categories')
    
    for category_data in default_categories:
        try:
            doc_ref = categories_ref.add(category_data)[1]
            print(f"✅ Created category '{category_data['name']}' with ID: {doc_ref.id}, displayOrder: {category_data['displayOrder']}")
        except Exception as e:
            print(f"❌ Error creating category '{category_data['name']}': {e}")
    
    print(f"\n🎉 Successfully created {len(default_categories)} default categories!")

def verify_category_ordering():
    """Verify that categories are properly ordered by displayOrder"""
    db = initialize_firebase()
    
    # Get all categories sorted by displayOrder
    categories_ref = db.collection('categories')
    categories = list(categories_ref.order_by('displayOrder').stream())
    
    if not categories:
        print("No categories found to verify.")
        return
    
    print(f"\n📋 Current category order (by displayOrder):")
    print("-" * 50)
    
    for i, doc in enumerate(categories):
        category_data = doc.to_dict()
        display_order = category_data.get('displayOrder', 'N/A')
        name = category_data.get('name', 'Unknown')
        is_active = category_data.get('isActive', False)
        status = "✅ Active" if is_active else "❌ Inactive"
        
        print(f"{i+1:2d}. {name:<20} (Order: {display_order:2d}) {status}")
    
    print("-" * 50)
    print(f"Total categories: {len(categories)}")

def main():
    """Main function"""
    print("🔄 Category Display Order Update Script")
    print("=" * 50)
    
    try:
        # Update existing categories
        update_categories_with_display_order()
        
        # Verify the ordering
        verify_category_ordering()
        
        print("\n✅ Script completed successfully!")
        print("\n💡 The categories should now display in the correct order on the main page.")
        print("   If you reorder categories in the Category Dashboard, the order will persist.")
        
    except Exception as e:
        print(f"❌ Error running script: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 