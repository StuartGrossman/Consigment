import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { logUserActionSafe } from '../services/userService';
import { useCriticalActionThrottle } from '../hooks/useButtonThrottle';
import { useUserRateLimiter } from '../hooks/useUserRateLimiter';
import { apiService } from '../services/apiService';
import type { PaymentRequest, CartItem as ApiCartItem, CustomerInfo as ApiCustomerInfo } from '../services/apiService';

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
  const [cardError, setCardError] = useState<string | null>(null);
  const [isCardComplete, setIsCardComplete] = useState(false);
  
  // Button throttling hook for checkout
  const { throttledAction, isActionDisabled, isActionProcessing } = useCriticalActionThrottle();
  
  // Rate limiting hook
  const { executeWithRateLimit } = useUserRateLimiter();
  const [customerInfo, setCustomerInfo] = useState({
    name: user?.displayName || '',
    email: user?.email || '',
    phone: (user && 'phoneNumber' in user) ? (user as any).phoneNumber || '(555) 123-4567' : '(555) 123-4567',
    address: '',
    city: '',
    zipCode: ''
  });
  const [fulfillmentMethod, setFulfillmentMethod] = useState<'pickup' | 'shipping'>('shipping');
  const [paymentType, setPaymentType] = useState<'online' | 'in_store'>('online');

  // Handle card element changes
  const handleCardChange = (event: any) => {
    setCardError(event.error ? event.error.message : null);
    setIsCardComplete(event.complete);
  };

  // Validate form before submission
  const validateForm = () => {
    const errors: string[] = [];

    // Basic customer info validation
    if (!customerInfo.name.trim()) errors.push('Name is required');
    if (!customerInfo.email.trim()) errors.push('Email is required');
    if (!customerInfo.phone.trim()) errors.push('Phone number is required');

    // Address validation for shipping
    if (fulfillmentMethod === 'shipping') {
      if (!customerInfo.address.trim()) errors.push('Address is required for shipping');
      if (!customerInfo.city.trim()) errors.push('City is required for shipping');
      if (!customerInfo.zipCode.trim()) errors.push('ZIP code is required for shipping');
    }

    // Payment validation
    if (paymentType === 'online') {
      if (!isCardComplete) {
        errors.push('Please complete your card information');
      }
      if (cardError) {
        errors.push(cardError);
      }
    }

    return errors;
  };

  const processPaymentSecurely = async (): Promise<{ success: boolean; orderData?: any; error?: string }> => {
    try {
      // Convert cart items to API format with fallback values
      const apiCartItems: ApiCartItem[] = cartItems.map(cartItem => ({
        item_id: cartItem.item.id,
        title: cartItem.item.title,
        price: cartItem.item.price,
        quantity: cartItem.quantity,
        seller_id: cartItem.item.sellerId || 'unknown_seller',
        seller_name: cartItem.item.sellerName || 'Unknown Seller'
      }));

      // Convert customer info to API format with required phone field
      const apiCustomerInfo: ApiCustomerInfo = {
        name: customerInfo.name.trim() || 'Guest User',
        email: customerInfo.email.trim() || user?.email || 'guest@example.com',
        phone: customerInfo.phone.trim() || '(555) 123-4567',
        address: customerInfo.address.trim(),
        city: customerInfo.city.trim(),
        zip_code: customerInfo.zipCode.trim()
      };

      let paymentMethodId: string | undefined;

      // Only process Stripe payment for online payments
      if (paymentType === 'online') {
        if (!stripe || !elements) {
          throw new Error('Stripe not initialized');
        }

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
          throw new Error('Card element not found');
        }

        // Create payment method with Stripe
        const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
          billing_details: {
            name: customerInfo.name,
            email: customerInfo.email,
            phone: customerInfo.phone,
            address: fulfillmentMethod === 'shipping' ? {
              line1: customerInfo.address,
              city: customerInfo.city,
              postal_code: customerInfo.zipCode,
            } : undefined,
          },
        });

        if (stripeError) {
          throw new Error(stripeError.message || 'Failed to process card information');
        }

        paymentMethodId = paymentMethod?.id;
      }

      const paymentRequest: PaymentRequest = {
        cart_items: apiCartItems,
        customer_info: apiCustomerInfo,
        fulfillment_method: fulfillmentMethod,
        payment_type: paymentType,
        payment_method_id: paymentMethodId
      };

      console.log(`🔒 Sending ${paymentType} payment request to secure server...`);
      const result = await apiService.processPayment(paymentRequest);
      
      console.log(`✅ ${paymentType} payment processed successfully on server`);
      return { 
        success: true, 
        orderData: {
          orderId: result.order_id,
          transactionId: result.transaction_id,
          totalAmount: result.total_amount,
          message: result.message
        }
      };
    } catch (error) {
      console.error(`❌ ${paymentType} payment processing failed:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Payment processing failed' 
      };
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    // Validate form
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setPaymentError(validationErrors.join('. '));
      return;
    }

    // For online payments, ensure Stripe is loaded
    if (paymentType === 'online' && (!stripe || !elements)) {
      setPaymentError('Payment system not ready. Please try again.');
      return;
    }

    const result = await executeWithRateLimit('purchase', async () => {
      setIsProcessing(true);
      setPaymentError(null);

      try {
        // Process payment securely through server
        const paymentResult = await processPaymentSecurely();
        
        if (!paymentResult.success) {
          throw new Error(paymentResult.error || 'Payment processing failed');
        }

        const orderData = paymentResult.orderData;
        console.log(`✅ ${paymentType} payment completed successfully:`, orderData);

        // Create comprehensive purchase record for local storage
        if (user) {
          const purchaseRecord = {
            id: orderData.orderId,
            orderNumber: orderData.orderId,
            total: orderData.totalAmount,
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
              method: paymentType === 'online' ? 'Credit Card' : 'Pay in Store',
              last4: paymentType === 'online' ? '****' : 'N/A',
              status: paymentType === 'online' ? 'completed' : 'pending',
              transactionId: orderData.transactionId
            },
            status: paymentType === 'online' ? 'completed' as const : 'pending' as const,
            orderStatus: paymentType === 'online' ? 'processing' as const : 'reserved' as const,
            estimatedDelivery: fulfillmentMethod === 'shipping' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : undefined,
            trackingNumber: fulfillmentMethod === 'shipping' && paymentType === 'online' ? `TRK${Date.now().toString().slice(-8)}` : undefined,
            fulfillmentMethod: fulfillmentMethod,
            paymentType: paymentType,
            holdExpiresAt: paymentType === 'in_store' ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined,
            shippingLabelGenerated: false
          };

          try {
            // Save to buyer's purchase history
            const existingHistory = localStorage.getItem(`purchase_history_${user.uid}`);
            const history = existingHistory ? JSON.parse(existingHistory) : [];
            history.unshift(purchaseRecord);
            localStorage.setItem(`purchase_history_${user.uid}`, JSON.stringify(history));
            
            // Trigger a storage event to notify other components
            window.dispatchEvent(new StorageEvent('storage', {
              key: `purchase_history_${user.uid}`,
              newValue: JSON.stringify(history),
              storageArea: localStorage
            }));

            // Trigger refresh events for UI updates
            window.dispatchEvent(new CustomEvent('itemsUpdated', { 
              detail: { 
                action: paymentType === 'online' ? 'purchase_completed' : 'item_reserved', 
                orderId: orderData.orderId,
                timestamp: new Date().toISOString()
              } 
            }));

            // Log the action
            await logUserActionSafe(user, paymentType === 'online' ? 'item_purchased' : 'item_reserved', 
              `${paymentType === 'online' ? 'Purchased' : 'Reserved'} ${cartItems.length} items for $${orderData.totalAmount.toFixed(2)} (${fulfillmentMethod}, ${paymentType})`);
            
            // Clear cart and show success
            console.log('Clearing cart after successful checkout...');
            await clearCart(user);
            
            // Show success message
            onSuccess();
            return true;
            
          } catch (historyError) {
            console.error('Error saving purchase history:', historyError);
            // Don't throw here - payment was successful, just local storage failed
            onSuccess();
            return true;
          }
        }
      } catch (error) {
        console.error('Payment error:', error);
        throw error;
      }
    });

    if (!result.success) {
      setPaymentError(result.error || 'Payment processing failed. Please try again.');
    }
    setIsProcessing(false);
  };

  const isCheckoutDisabled = () => {
    if (isProcessing || isActionDisabled('checkout-purchase')) return true;
    
    // Basic info validation
    if (!customerInfo.name.trim() || !customerInfo.email.trim() || !customerInfo.phone.trim()) return true;
    
    // Shipping address validation
    if (fulfillmentMethod === 'shipping' && (!customerInfo.address.trim() || !customerInfo.city.trim() || !customerInfo.zipCode.trim())) return true;
    
    // Payment validation for online payments
    if (paymentType === 'online' && (!stripe || !isCardComplete || cardError)) return true;
    
    return false;
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

      {/* Payment Method Selection */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">Payment Method</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div 
            className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
              paymentType === 'online' 
                ? 'border-orange-500 bg-orange-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setPaymentType('online')}
          >
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                name="paymentType"
                value="online"
                checked={paymentType === 'online'}
                onChange={() => setPaymentType('online')}
                className="text-orange-500"
              />
              <div>
                <h4 className="font-medium text-gray-900">💳 Pay Online</h4>
                <p className="text-sm text-gray-600">Pay securely with your credit card</p>
                <p className="text-xs text-gray-500 mt-1">Instant processing • Secure checkout</p>
              </div>
            </div>
          </div>
          
          {fulfillmentMethod === 'pickup' && (
            <div 
              className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                paymentType === 'in_store' 
                  ? 'border-orange-500 bg-orange-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setPaymentType('in_store')}
            >
              <div className="flex items-center space-x-3">
                <input
                  type="radio"
                  name="paymentType"
                  value="in_store"
                  checked={paymentType === 'in_store'}
                  onChange={() => setPaymentType('in_store')}
                  className="text-orange-500"
                />
                <div>
                  <h4 className="font-medium text-gray-900">🏪 Pay in Store</h4>
                  <p className="text-sm text-gray-600">Pay when you pick up your items</p>
                  <p className="text-xs text-yellow-600 mt-1">⏰ 24-hour hold • Cash or card accepted</p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {paymentType === 'in_store' && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L5.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="text-sm">
                <p className="text-yellow-800 font-medium">Important: 24-Hour Hold Policy</p>
                <p className="text-yellow-700 mt-1">
                  Your items will be reserved for <strong>24 hours</strong>. If not picked up within this time, 
                  they will automatically return to the online store and you'll be notified via email.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Customer Information */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">Contact Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={customerInfo.name}
              onChange={(e) => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              value={customerInfo.email}
              onChange={(e) => setCustomerInfo(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                <input
                  type="text"
                  value={customerInfo.address}
                  onChange={(e) => setCustomerInfo(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                <input
                  type="text"
                  value={customerInfo.city}
                  onChange={(e) => setCustomerInfo(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code *</label>
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

      {/* Payment Information - Only for online payments */}
      {paymentType === 'online' && (
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
              onChange={handleCardChange}
            />
          </div>
          {cardError && (
            <p className="text-red-600 text-sm mt-2">{cardError}</p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            🔒 Demo Mode: Payment will be simulated (no actual charge)
          </p>
        </div>
      )}

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
          disabled={isCheckoutDisabled()}
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
              {paymentType === 'online' 
                ? `Complete Order - $${(getCartTotal() + (fulfillmentMethod === 'shipping' ? 5.99 : 0)).toFixed(2)}`
                : `Reserve Items - $${(getCartTotal() + (fulfillmentMethod === 'shipping' ? 5.99 : 0)).toFixed(2)}`
              }
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