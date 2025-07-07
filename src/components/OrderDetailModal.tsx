import React from 'react';

interface OrderItem {
  id: string;
  title: string;
  price: number;
  quantity: number;
  seller: string;
  category: string;
  status: string;
  shippedAt?: string;
  trackingNumber?: string;
  brand: string;
  size: string;
  condition: string;
}

interface Order {
  id: string;
  orderId: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  status: string;
  items: OrderItem[];
  createdAt: string;
  shippedAt?: string;
  trackingNumber?: string;
  shippingAddress?: {
    address?: string;
    city?: string;
    zip_code?: string;
  };
  fulfillmentMethod: string;
  notes: string;
  transactionId: string;
  estimatedDelivery?: string;
}

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
}

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ isOpen, onClose, order }) => {
  if (!isOpen || !order) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Order Details</h2>
              <p className="text-gray-600">Order #{order.orderId}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Order Information */}
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Order ID:</span>
                    <span className="font-medium">{order.orderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Transaction ID:</span>
                    <span className="font-medium text-sm">{order.transactionId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Order Date:</span>
                    <span className="font-medium">{formatDate(order.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="font-bold text-green-600">{formatCurrency(order.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Payment Method:</span>
                    <span className="font-medium">{order.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fulfillment:</span>
                    <span className="font-medium capitalize">{order.fulfillmentMethod}</span>
                  </div>
                </div>
              </div>

              {/* Order Status */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Status</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Order Status:</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Payment Status:</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(order.paymentStatus)}`}>
                      {order.paymentStatus}
                    </span>
                  </div>
                  {order.shippedAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Shipped Date:</span>
                      <span className="font-medium">{formatDate(order.shippedAt)}</span>
                    </div>
                  )}
                  {order.trackingNumber && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tracking Number:</span>
                      <span className="font-medium">{order.trackingNumber}</span>
                    </div>
                  )}
                  {order.estimatedDelivery && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Estimated Delivery:</span>
                      <span className="font-medium">{formatDate(order.estimatedDelivery)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Customer Information */}
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-600">Name:</span>
                    <p className="font-medium">{order.customerName}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Email:</span>
                    <p className="font-medium">{order.customerEmail}</p>
                  </div>
                  {order.customerPhone && (
                    <div>
                      <span className="text-gray-600">Phone:</span>
                      <p className="font-medium">{order.customerPhone}</p>
                    </div>
                  )}
                  {order.shippingAddress && (
                    <div>
                      <span className="text-gray-600">Shipping Address:</span>
                      <div className="font-medium">
                        {order.shippingAddress.address && <p>{order.shippingAddress.address}</p>}
                        {order.shippingAddress.city && <p>{order.shippingAddress.city}</p>}
                        {order.shippingAddress.zip_code && <p>{order.shippingAddress.zip_code}</p>}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Items:</span>
                    <span className="font-medium">{order.items.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Items:</span>
                    <span className="font-medium">
                      {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  </div>
                  {order.fulfillmentMethod === 'shipping' && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Shipping:</span>
                      <span className="font-medium">$5.99</span>
                    </div>
                  )}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between">
                      <span className="text-gray-900 font-semibold">Total:</span>
                      <span className="font-bold text-green-600">{formatCurrency(order.totalAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h3>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seller</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {order.items.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{item.title}</div>
                          <div className="text-sm text-gray-500">
                            {item.brand} • {item.size} • {item.condition}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{item.seller}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{item.category}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{item.quantity}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{formatCurrency(item.price)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        {formatCurrency(item.price * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
            >
              Close
            </button>
            <button
              onClick={() => {
                // Handle print order
                window.print();
              }}
              className="px-4 py-2 bg-slate-600 text-white rounded-md text-sm font-medium hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
            >
              Print Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailModal; 