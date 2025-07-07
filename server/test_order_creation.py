#!/usr/bin/env python3
"""
Test script to verify order creation functionality
"""

import requests
import json
import time
from datetime import datetime

# Test server URL
BASE_URL = "http://localhost:8000"

def test_order_creation():
    """Test that orders are created when payments are processed"""
    
    print("🧪 Testing Order Creation...")
    
    # Test payment request data
    payment_data = {
        "cart_items": [
            {
                "item_id": "test_item_1",
                "title": "Test Hiking Boots",
                "price": 89.99,
                "quantity": 1,
                "seller_id": "test_seller_1",
                "seller_name": "Test Seller"
            },
            {
                "item_id": "test_item_2", 
                "title": "Test Backpack",
                "price": 45.50,
                "quantity": 1,
                "seller_id": "test_seller_2",
                "seller_name": "Test Seller 2"
            }
        ],
        "customer_info": {
            "name": "Test Customer",
            "email": "test@example.com",
            "phone": "555-123-4567",
            "address": "123 Test St",
            "city": "Test City",
            "zip_code": "12345"
        },
        "fulfillment_method": "shipping",
        "payment_method_id": "test_payment_method"
    }
    
    try:
        # Make payment request
        print("📤 Sending payment request...")
        response = requests.post(
            f"{BASE_URL}/api/process-payment",
            json=payment_data,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            payment_result = response.json()
            print(f"✅ Payment processed successfully!")
            print(f"   Order ID: {payment_result.get('order_id')}")
            print(f"   Transaction ID: {payment_result.get('transaction_id')}")
            print(f"   Total Amount: ${payment_result.get('total_amount')}")
            
            # Wait a moment for the order to be created
            time.sleep(2)
            
            # Test fetching orders
            print("\n📋 Fetching orders from admin endpoint...")
            orders_response = requests.get(f"{BASE_URL}/api/admin/orders")
            
            if orders_response.status_code == 200:
                orders = orders_response.json()
                print(f"✅ Found {len(orders)} orders in database")
                
                # Look for our test order
                test_order = None
                for order in orders:
                    if order.get('orderId') == payment_result.get('order_id'):
                        test_order = order
                        break
                
                if test_order:
                    print(f"✅ Test order found in database!")
                    print(f"   Customer: {test_order.get('customerName')}")
                    print(f"   Items: {len(test_order.get('items', []))}")
                    print(f"   Total: ${test_order.get('totalAmount')}")
                    print(f"   Status: {test_order.get('status')}")
                    
                    # Verify order details
                    items = test_order.get('items', [])
                    if len(items) == 2:
                        print("✅ Order contains correct number of items")
                    else:
                        print(f"❌ Expected 2 items, found {len(items)}")
                    
                    if test_order.get('totalAmount') == payment_result.get('total_amount'):
                        print("✅ Order total amount matches payment")
                    else:
                        print(f"❌ Order total mismatch: ${test_order.get('totalAmount')} vs ${payment_result.get('total_amount')}")
                        
                else:
                    print("❌ Test order not found in database")
                    
            else:
                print(f"❌ Failed to fetch orders: {orders_response.status_code}")
                print(orders_response.text)
                
        else:
            print(f"❌ Payment failed: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"❌ Error during test: {e}")

def test_order_structure():
    """Test the structure of orders in the database"""
    
    print("\n🔍 Testing Order Structure...")
    
    try:
        response = requests.get(f"{BASE_URL}/api/admin/orders")
        
        if response.status_code == 200:
            orders = response.json()
            
            if orders:
                order = orders[0]  # Get the first order
                print("✅ Order structure:")
                print(f"   - ID: {order.get('id')}")
                print(f"   - Order ID: {order.get('orderId')}")
                print(f"   - Customer: {order.get('customerName')}")
                print(f"   - Email: {order.get('customerEmail')}")
                print(f"   - Total: ${order.get('totalAmount')}")
                print(f"   - Status: {order.get('status')}")
                print(f"   - Payment Status: {order.get('paymentStatus')}")
                print(f"   - Fulfillment: {order.get('fulfillmentMethod')}")
                print(f"   - Items: {len(order.get('items', []))}")
                print(f"   - Created: {order.get('createdAt')}")
                
                # Check items structure
                items = order.get('items', [])
                if items:
                    item = items[0]
                    print("✅ Item structure:")
                    print(f"   - ID: {item.get('id')}")
                    print(f"   - Title: {item.get('title')}")
                    print(f"   - Price: ${item.get('price')}")
                    print(f"   - Quantity: {item.get('quantity')}")
                    print(f"   - Seller: {item.get('seller')}")
                    print(f"   - Category: {item.get('category')}")
                    print(f"   - Brand: {item.get('brand')}")
                    print(f"   - Size: {item.get('size')}")
                    print(f"   - Condition: {item.get('condition')}")
            else:
                print("ℹ️  No orders found in database")
        else:
            print(f"❌ Failed to fetch orders: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error testing order structure: {e}")

if __name__ == "__main__":
    print("🚀 Starting Order Creation Tests...")
    print("=" * 50)
    
    # Test order creation
    test_order_creation()
    
    # Test order structure
    test_order_structure()
    
    print("\n" + "=" * 50)
    print("🏁 Order Creation Tests Complete!") 