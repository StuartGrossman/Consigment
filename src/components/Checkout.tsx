import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { doc, updateDoc, deleteDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../config/firebase';
import { logUserAction } from '../services/firebaseService';
import { useCriticalActionThrottle } from '../hooks/useButtonThrottle';

// Initialize Stripe with the provided publishable key
const stripePromise = loadStripe('pk_test_51Rbnai4cE043YuFEryAiYmPIDw6WPTfMk0JFoJyi3eSpEZZBDpTY0tIusq95YjDXqttmcrbAePTHNot0kf3J85Q100Gz9jtjn3');

interface CheckoutProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CheckoutForm: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { cartItems, getCartTotal, clearCart } = useCart();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  
  // Button throttling hook for checkout
  const { throttledAction, isActionDisabled, isActionProcessing } = useCriticalActionThrottle();
  const [customerInfo, setCustomerInfo] = useState({
    name: user?.displayName || '',
    email: user?.email || '',
    phone: (user && 'phoneNumber' in user) ? (user as any).phoneNumber : '',
    address: '',
    city: '',
    zipCode: ''
  });
  const [fulfillmentMethod, setFulfillmentMethod] = useState<'pickup' | 'shipping'>('shipping');

  const processPurchaseCompletion = async (purchaseRecord: any) => {
    // Processing purchase completion
    
    // Process each item in the cart
    for (const cartItem of cartItems) {
      try {
        const item = cartItem.item;
        console.log(`Processing sold item: ${item.title} (${item.id})`);

        // 1. Mark item as sold in Firestore (don't delete, just update status)
        const itemRef = doc(db, 'items', item.id);
        await updateDoc(itemRef, {
          status: 'sold',
          soldAt: new Date(),
          soldPrice: item.price,
          buyerId: user?.uid || 'anonymous',
          buyerInfo: {
            name: customerInfo.name,
            email: customerInfo.email,
            phone: customerInfo.phone,
            address: customerInfo.address,
            city: customerInfo.city,
            zipCode: customerInfo.zipCode
          },
          saleTransactionId: purchaseRecord.paymentInfo.transactionId,
          saleType: 'online',
          fulfillmentMethod: fulfillmentMethod,
          trackingNumber: fulfillmentMethod === 'shipping' ? `TRK${Date.now().toString().slice(-8)}` : undefined,
          shippingLabelGenerated: false,
          userEarnings: item.price * 0.75,
          adminEarnings: item.price * 0.25
        });

        // 2. Create a sale record for analytics
        await addDoc(collection(db, 'sales'), {
          itemId: item.id,
          itemTitle: item.title,
          itemCategory: item.category,
          itemBrand: item.brand || 'N/A',
          itemSize: item.size || 'N/A',
          sellerId: item.sellerId,
          sellerName: item.sellerName,
          buyerId: user?.uid || 'anonymous',
          buyerName: customerInfo.name,
          salePrice: item.price,
          sellerEarnings: item.price * 0.75, // 75% to seller
          storeCommission: item.price * 0.25, // 25% to store
          soldAt: new Date(),
          transactionId: purchaseRecord.paymentInfo.transactionId,
          orderNumber: purchaseRecord.orderNumber,
          paymentMethod: purchaseRecord.paymentInfo.method,
          shippingAddress: {
            name: customerInfo.name,
            address: customerInfo.address,
            city: customerInfo.city,
            zipCode: customerInfo.zipCode,
            phone: customerInfo.phone,
            email: customerInfo.email
          }
        });

        // 3. Update seller's store credit (if they have a Firebase account)
        if (item.sellerId && !item.sellerId.startsWith('phone_')) {
          try {
            // Create or update seller's store credit record
            await addDoc(collection(db, 'store_credits'), {
              userId: item.sellerId,
              amount: item.price * 0.75,
              source: 'item_sale',
              itemId: item.id,
              itemTitle: item.title,
              salePrice: item.price,
              transactionId: purchaseRecord.paymentInfo.transactionId,
              createdAt: new Date(),
              description: `Sale of "${item.title}"`
            });
            console.log(`Added store credit for seller ${item.sellerId}: $${(item.price * 0.75).toFixed(2)}`);
          } catch (creditError) {
            console.error('Error updating seller store credit:', creditError);
            // Don't fail the entire transaction for this
          }
        }

        console.log(`Successfully processed sale for item: ${item.title}`);
      } catch (itemError) {
        console.error(`Error processing item ${cartItem.item.title}:`, itemError);
        // Continue processing other items even if one fails
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    await throttledAction('checkout-purchase', async () => {
      setIsProcessing(true);
      setPaymentError(null);

    try {
      // For demo purposes, simulate successful payment after delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create comprehensive purchase record
      if (user) {
        const purchaseRecord = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
          total: getCartTotal() + (fulfillmentMethod === 'shipping' ? 5.99 : 0),
          purchaseDate: new Date().toISOString(),
          items: cartItems.map(cartItem => ({
            id: cartItem.item.id,
            title: cartItem.item.title,
            price: cartItem.item.price,
            quantity: cartItem.quantity,
            category: cartItem.item.category,
            brand: cartItem.item.brand || 'N/A',
            size: cartItem.item.size || 'N/A',
            images: cartItem.item.images || [],
            sellerId: cartItem.item.sellerId,
            sellerName: cartItem.item.sellerName
          })),
          customerInfo: {
            name: customerInfo.name,
            email: customerInfo.email,
            phone: customerInfo.phone,
            address: customerInfo.address,
            city: customerInfo.city,
            zipCode: customerInfo.zipCode
          },
          paymentInfo: {
            method: 'Credit Card',
            last4: '****', // In real implementation, this would come from Stripe
            status: 'completed',
            transactionId: `txn_${Date.now().toString() + Math.random().toString(36).substr(2, 9)}`
          },
          status: 'completed' as const,
          orderStatus: 'processing' as const,
          estimatedDelivery: fulfillmentMethod === 'shipping' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : undefined, // 7 days from now if shipping
          trackingNumber: fulfillmentMethod === 'shipping' ? `TRK${Date.now().toString().slice(-8)}` : undefined,
          fulfillmentMethod: fulfillmentMethod,
          shippingLabelGenerated: false
        };

        try {
          // Save to buyer's purchase history
          const existingHistory = localStorage.getItem(`purchase_history_${user.uid}`);
          const history = existingHistory ? JSON.parse(existingHistory) : [];
          history.unshift(purchaseRecord); // Add to beginning of array
          localStorage.setItem(`purchase_history_${user.uid}`, JSON.stringify(history));
          
          // Process the purchase completion (update Firestore, analytics, etc.)
          await processPurchaseCompletion(purchaseRecord);
          
          // Trigger a storage event to notify other components
          window.dispatchEvent(new StorageEvent('storage', {
            key: `purchase_history_${user.uid}`,
            newValue: JSON.stringify(history),
            storageArea: localStorage
          }));
          
          console.log('Purchase completed successfully:', purchaseRecord);
        } catch (historyError) {
          console.error('Error saving purchase history:', historyError);
          throw historyError; // Re-throw to show error to user
        }
      }
      
      // Log the purchase action
      const totalWithShipping = getCartTotal() + (fulfillmentMethod === 'shipping' ? 5.99 : 0);
      await logUserAction(user, 'item_purchased', `Purchased ${cartItems.length} items for $${totalWithShipping.toFixed(2)} (${fulfillmentMethod})`);
      
      // Clear cart and show success
      console.log('Clearing cart after successful checkout...');
      await clearCart(user);
      
      // Show success message
      onSuccess();
      
      } catch (error) {
        console.error('Payment error:', error);
        setPaymentError('Payment processing failed. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Order Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Order Summary</h3>
        <div className="space-y-2">
          {cartItems.map((cartItem) => (
            <div key={cartItem.item.id} className="flex justify-between text-sm">
              <span>{cartItem.item.title} × {cartItem.quantity}</span>
              <span>${(cartItem.item.price * cartItem.quantity).toFixed(2)}</span>
            </div>
          ))}
          {fulfillmentMethod === 'shipping' && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Shipping</span>
              <span>$5.99</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>Total</span>
            <span>${(getCartTotal() + (fulfillmentMethod === 'shipping' ? 5.99 : 0)).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Fulfillment Method Selection */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">Fulfillment Method</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div 
            className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
              fulfillmentMethod === 'pickup' 
                ? 'border-orange-500 bg-orange-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setFulfillmentMethod('pickup')}
          >
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                name="fulfillmentMethod"
                value="pickup"
                checked={fulfillmentMethod === 'pickup'}
                onChange={() => setFulfillmentMethod('pickup')}
                className="text-orange-500"
              />
              <div>
                <h4 className="font-medium text-gray-900">🏪 Store Pickup</h4>
                <p className="text-sm text-gray-600">Pick up your items at Summit Gear Exchange</p>
                <p className="text-xs text-gray-500 mt-1">Free • Available next business day</p>
              </div>
            </div>
          </div>
          
          <div 
            className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
              fulfillmentMethod === 'shipping' 
                ? 'border-orange-500 bg-orange-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setFulfillmentMethod('shipping')}
          >
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                name="fulfillmentMethod"
                value="shipping"
                checked={fulfillmentMethod === 'shipping'}
                onChange={() => setFulfillmentMethod('shipping')}
                className="text-orange-500"
              />
              <div>
                <h4 className="font-medium text-gray-900">📦 Home Delivery</h4>
                <p className="text-sm text-gray-600">We'll ship your items to your address</p>
                <p className="text-xs text-gray-500 mt-1">$5.99 shipping • 5-7 business days</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Information */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">Contact Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={customerInfo.name}
              onChange={(e) => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={customerInfo.email}
              onChange={(e) => setCustomerInfo(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={customerInfo.phone}
              onChange={(e) => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          {fulfillmentMethod === 'shipping' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  value={customerInfo.address}
                  onChange={(e) => setCustomerInfo(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={customerInfo.city}
                  onChange={(e) => setCustomerInfo(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
                <input
                  type="text"
                  value={customerInfo.zipCode}
                  onChange={(e) => setCustomerInfo(prev => ({ ...prev, zipCode: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Payment Information */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">Payment Information</h3>
        <div className="border border-gray-300 rounded-md p-3 bg-white">
          <CardElement 
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#374151',
                  '::placeholder': {
                    color: '#9CA3AF',
                  },
                },
              },
            }} 
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          🔒 Demo Mode: Payment will be simulated (no actual charge)
        </p>
      </div>

      {/* Error Message */}
      {paymentError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-600 text-sm">{paymentError}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-3 px-6 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing || isActionDisabled('checkout-purchase')}
          className="flex-1 py-3 px-6 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isProcessing || isActionProcessing('checkout-purchase') ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Complete Order - ${(getCartTotal() + (fulfillmentMethod === 'shipping' ? 5.99 : 0)).toFixed(2)}
            </>
          )}
        </button>
      </div>
    </form>
  );
};

const Checkout: React.FC<CheckoutProps> = ({ isOpen, onClose, onSuccess }) => {
  if (!isOpen) return null;

  return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Checkout</h2>
              <p className="text-gray-600 mt-1">Complete your purchase securely</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <Elements stripe={stripePromise}>
            <CheckoutForm onClose={onClose} onSuccess={onSuccess} />
          </Elements>
        </div>
      </div>
    </div>
  );
};

export default Checkout; 