#!/usr/bin/env python3
"""
Script to normalize category displayOrder values with proper spacing
This ensures no conflicts and consistent ordering
"""

import firebase_admin
from firebase_admin import credentials, firestore
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

def normalize_category_orders():
    """Normalize all category displayOrder values with proper spacing"""
    db = initialize_firebase()
    
    # Get all categories sorted by current displayOrder
    categories_ref = db.collection('categories')
    categories = list(categories_ref.order_by('displayOrder').stream())
    
    if not categories:
        print("No categories found to normalize.")
        return
    
    print(f"Found {len(categories)} categories. Normalizing displayOrder values...")
    
    # Update categories with normalized displayOrder values (increments of 10)
    for i, doc in enumerate(categories):
        category_data = doc.to_dict()
        category_id = doc.id
        current_order = category_data.get('displayOrder', 0)
        new_order = i * 10
        
        if current_order != new_order:
            try:
                categories_ref.document(category_id).update({
                    'displayOrder': new_order,
                    'updatedAt': firestore.SERVER_TIMESTAMP
                })
                print(f"✅ Normalized '{category_data.get('name', 'Unknown')}' (ID: {category_id}) from {current_order} to {new_order}")
            except Exception as e:
                print(f"❌ Error updating category {category_id}: {e}")
        else:
            print(f"ℹ️  '{category_data.get('name', 'Unknown')}' (ID: {category_id}) already has correct order: {current_order}")
    
    print(f"\n🎉 Successfully normalized {len(categories)} categories!")

def verify_normalized_ordering():
    """Verify that categories are properly ordered after normalization"""
    db = initialize_firebase()
    
    # Get all categories sorted by displayOrder
    categories_ref = db.collection('categories')
    categories = list(categories_ref.order_by('displayOrder').stream())
    
    if not categories:
        print("No categories found to verify.")
        return
    
    print(f"\n📋 Normalized category order (by displayOrder):")
    print("-" * 60)
    
    for i, doc in enumerate(categories):
        category_data = doc.to_dict()
        display_order = category_data.get('displayOrder', 'N/A')
        name = category_data.get('name', 'Unknown')
        is_active = category_data.get('isActive', False)
        status = "✅ Active" if is_active else "❌ Inactive"
        
        print(f"{i+1:2d}. {name:<20} (Order: {display_order:3d}) {status}")
    
    print("-" * 60)
    print(f"Total categories: {len(categories)}")
    
    # Check for any duplicate displayOrder values
    orders = [doc.to_dict().get('displayOrder', 0) for doc in categories]
    duplicates = [order for order in set(orders) if orders.count(order) > 1]
    
    if duplicates:
        print(f"⚠️  WARNING: Found duplicate displayOrder values: {duplicates}")
    else:
        print("✅ All displayOrder values are unique!")

def main():
    """Main function"""
    print("🔄 Category Display Order Normalization Script")
    print("=" * 60)
    
    try:
        # Normalize existing categories
        normalize_category_orders()
        
        # Verify the ordering
        verify_normalized_ordering()
        
        print("\n✅ Normalization completed successfully!")
        print("\n💡 Categories now have proper spacing (increments of 10).")
        print("   This prevents conflicts during reordering operations.")
        
    except Exception as e:
        print(f"❌ Error running script: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 