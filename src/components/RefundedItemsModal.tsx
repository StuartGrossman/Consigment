import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiService } from '../services/apiService';

interface RefundedItem {
  id: string;
  title: string;
  price: number;
  originalPrice?: number;
  category: string;
  originalCategory?: string;
  sellerName: string;
  sellerId: string;
  refundedAt: string;
  refundReason: string;
  reactivatedAt?: string;
  reactivatedBy?: string;
  reactivationNotes?: string;
  images?: string[];
  condition: string;
  brand?: string;
}

interface RefundedItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RefundedItemsModal: React.FC<RefundedItemsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [refundedItems, setRefundedItems] = useState<RefundedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [reactivating, setReactivating] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Pending Items');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RefundedItem | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchRefundedItems();
    }
  }, [isOpen]);

  const fetchRefundedItems = async () => {
    setLoading(true);
    try {
      const response = await apiService.getItemsByStatus('refunded');
      if (response.success) {
        setRefundedItems(response.items || []);
      }
    } catch (error) {
      console.error('Error fetching refunded items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async (item: RefundedItem) => {
    setSelectedItem(item);
    setSelectedCategory(item.originalCategory || 'Pending Items');
    setAdminNotes('');
    setShowReactivateModal(true);
  };

  const confirmReactivate = async () => {
    if (!selectedItem) return;
    
    setReactivating(selectedItem.id);
    try {
      const response = await apiService.reactivateRefundedItem({
        itemId: selectedItem.id,
        newCategory: selectedCategory,
        adminNotes: adminNotes
      });
      
      if (response.success) {
        console.log('✅ Item reactivated successfully!');
        // Remove item from list and refresh
        setRefundedItems(prev => prev.filter(item => item.id !== selectedItem.id));
        setShowReactivateModal(false);
        setSelectedItem(null);
      }
    } catch (error) {
      console.error('❌ Failed to reactivate item:', error);
    } finally {
      setReactivating(null);
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">
            🔄 Refunded Items Management
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
              <div className="text-6xl mb-4">🔄</div>
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                No Refunded Items
              </h3>
              <p className="text-gray-500">
                There are currently no items in the Refunded category.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {refundedItems.map((item) => (
                <div
                  key={item.id}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
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
                            Original Category: {item.originalCategory || 'Unknown'}
                          </p>
                          <div className="flex gap-4 mt-2 text-sm">
                            <span className="text-green-600 font-medium">
                              ${item.price}
                            </span>
                            {item.originalPrice && item.originalPrice !== item.price && (
                              <span className="text-gray-500 line-through">
                                ${item.originalPrice}
                              </span>
                            )}
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
                        </div>
                      </div>
                      
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => handleReactivate(item)}
                          disabled={reactivating === item.id}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {reactivating === item.id ? 'Reactivating...' : '🔄 Reactivate'}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedItem(item);
                            setShowReactivateModal(true);
                          }}
                          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
                        >
                          📋 View Details
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reactivate Modal */}
        {showReactivateModal && selectedItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-xl font-bold mb-4">
                Reactivate Item
              </h3>
              <div className="mb-4">
                <p className="text-gray-600 mb-2">
                  <strong>Item:</strong> {selectedItem.title}
                </p>
                <p className="text-gray-600 mb-4">
                  <strong>Original Category:</strong> {selectedItem.originalCategory || 'Unknown'}
                </p>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                >
                  <option value="Pending Items">Pending Items</option>
                  <option value="Approved Items">Approved Items</option>
                  <option value="Live Items">Live Items</option>
                </select>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Notes (Optional)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about the reactivation..."
                  className="w-full p-2 border border-gray-300 rounded-lg h-20"
                />
              </div>
              
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowReactivateModal(false)}
                  className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReactivate}
                  disabled={reactivating === selectedItem.id}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {reactivating === selectedItem.id ? 'Reactivating...' : 'Reactivate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RefundedItemsModal; 