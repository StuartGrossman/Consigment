import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiService } from '../services/apiService';

interface RefundedItemPending {
  id: string;
  title: string;
  price: number;
  category: string;
  sellerName: string;
  sellerId: string;
  refundedAt: string;
  refundReason: string;
  images?: string[];
  condition: string;
  brand?: string;
  originalBuyerName?: string;
  originalBuyerEmail?: string;
  refundAmount?: number;
}

interface RefundedItemsPendingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RefundedItemsPendingModal: React.FC<RefundedItemsPendingModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [refundedItems, setRefundedItems] = useState<RefundedItemPending[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchRefundedItemsPending();
    }
  }, [isOpen]);

  const fetchRefundedItemsPending = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Use the dedicated endpoint for refunded items pending
      const response = await apiService.getRefundedItemsPending();
      if (response.success) {
        const items = response.items || [];
        console.log('🔍 Refunded items pending:', items);
        setRefundedItems(items);
      }
    } catch (error) {
      console.error('Error fetching refunded items pending:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 pt-16">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">
            🔄 Refunded Items - Now Pending for Resale
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : refundedItems.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                No Refunded Items Pending
              </h3>
              <p className="text-gray-500">
                All refunded items have been processed and are available for resale.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-blue-800">
                      {refundedItems.length} items refunded and returned to pending status
                    </p>
                    <p className="text-sm text-blue-600">
                      These items are now available for resale in their original categories
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                {refundedItems.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
                  >
                    <div className="flex items-start gap-4">
                      {item.images && item.images[0] && (
                        <img
                          src={item.images[0]}
                          alt={item.title}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-lg text-gray-800">
                              {item.title}
                            </h3>
                            <p className="text-gray-600 text-sm">
                              Seller: {item.sellerName}
                            </p>
                            <p className="text-gray-600 text-sm">
                              Category: {item.category}
                            </p>
                            <div className="flex gap-4 mt-2 text-sm">
                              <span className="text-green-600 font-medium">
                                ${item.price}
                              </span>
                              <span className="text-gray-500">
                                {item.condition}
                              </span>
                              {item.brand && (
                                <span className="text-gray-500">
                                  {item.brand}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-500">
                              Refunded: {formatDate(item.refundedAt)}
                            </p>
                            <p className="text-sm text-red-600 font-medium">
                              Reason: {item.refundReason}
                            </p>
                            {item.refundAmount && (
                              <p className="text-sm text-blue-600">
                                Refund: ${item.refundAmount}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {item.originalBuyerName && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">
                              <strong>Original Buyer:</strong> {item.originalBuyerName}
                              {item.originalBuyerEmail && (
                                <span className="block text-xs text-gray-500">
                                  Email: {item.originalBuyerEmail}
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                        
                        <div className="mt-3 flex gap-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ✅ Ready for Resale
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            🔄 Pending Approval
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RefundedItemsPendingModal; 