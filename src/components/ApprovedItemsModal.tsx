import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem } from '../types';

interface ApprovedItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

const ApprovedItemsModal: React.FC<ApprovedItemsModalProps> = ({ isOpen, onClose, user }) => {
  const [approvedItems, setApprovedItems] = useState<ConsignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<ConsignmentItem | null>(null);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      fetchApprovedItems();
    }
  }, [isOpen, user]);

  const fetchApprovedItems = async () => {
    setLoading(true);
    try {
      const itemsRef = collection(db, 'items');
      const q = query(itemsRef, where('status', '==', 'approved'));
      const querySnapshot = await getDocs(q);
      
      const items: ConsignmentItem[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          approvedAt: data.approvedAt?.toDate() || new Date(),
          liveAt: data.liveAt?.toDate()
        } as ConsignmentItem);
      });

      // Sort by approval date (newest first)
      items.sort((a, b) => (b.approvedAt?.getTime() || 0) - (a.approvedAt?.getTime() || 0));
      setApprovedItems(items);
    } catch (error) {
      console.error('Error fetching approved items:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTimeRemaining = (approvedAt: Date) => {
    const threeDaysInMs = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds
    const goLiveTime = new Date(approvedAt.getTime() + threeDaysInMs);
    const now = new Date();
    const timeLeft = goLiveTime.getTime() - now.getTime();

    if (timeLeft <= 0) {
      return { expired: true, text: 'Ready to go live!' };
    }

    const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
    const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

    return {
      expired: false,
      text: `${days}d ${hours}h ${minutes}m remaining`,
      goLiveTime: goLiveTime.toLocaleDateString() + ' ' + goLiveTime.toLocaleTimeString()
    };
  };

  const handleMakeLive = async (itemId: string) => {
    setProcessingItemId(itemId);
    try {
      await updateDoc(doc(db, 'items', itemId), {
        status: 'live',
        liveAt: serverTimestamp()
      });
      
      // Remove from approved list
      setApprovedItems(prev => prev.filter(item => item.id !== itemId));
      alert('Item is now live!');
    } catch (error) {
      console.error('Error making item live:', error);
      alert('Error making item live. Please try again.');
    } finally {
      setProcessingItemId(null);
    }
  };

  const handleEdit = (item: ConsignmentItem) => {
    setEditingItem(item);
  };

  const handleSaveEdit = async (updatedItem: ConsignmentItem) => {
    setProcessingItemId(updatedItem.id);
    try {
      await updateDoc(doc(db, 'items', updatedItem.id), {
        title: updatedItem.title,
        description: updatedItem.description,
        price: updatedItem.price
      });
      
      // Update local state
      setApprovedItems(prev => prev.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      ));
      setEditingItem(null);
      alert('Item updated successfully!');
    } catch (error) {
      console.error('Error updating item:', error);
      alert('Error updating item. Please try again.');
    } finally {
      setProcessingItemId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200 rounded-t-xl">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Approved Items (Employee Preview)</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Items approved for 3-day employee preview before going live to all customers
          </p>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
            </div>
          ) : approvedItems.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-500 text-lg">No approved items</p>
              <p className="text-gray-400 text-sm mt-2">Items will appear here after approval</p>
            </div>
          ) : (
            <div className="space-y-6">
              {approvedItems.map((item) => {
                const timeInfo = calculateTimeRemaining(item.approvedAt!);
                return (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-6 bg-gradient-to-r from-orange-50 to-yellow-50">
                    <div className="flex gap-6">
                      {/* Images */}
                      <div className="flex-shrink-0">
                        {item.images.length > 0 ? (
                          <div className="relative">
                            <img
                              src={item.images[0]}
                              alt={item.title}
                              className="w-32 h-32 object-cover rounded-lg"
                            />
                            {item.images.length > 1 && (
                              <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                                +{item.images.length - 1}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-grow">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-xl font-semibold text-gray-900">{item.title}</h3>
                          <div className="text-2xl font-bold text-green-600">
                            ${item.price.toFixed(2)}
                          </div>
                        </div>
                        
                        <p className="text-gray-600 mb-4">{item.description}</p>
                        
                        {/* Timer and Status */}
                        <div className="bg-white rounded-lg p-3 mb-4 border border-orange-200">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className={`font-medium ${timeInfo.expired ? 'text-green-600' : 'text-orange-600'}`}>
                              {timeInfo.text}
                            </span>
                          </div>
                          {!timeInfo.expired && timeInfo.goLiveTime && (
                            <p className="text-xs text-gray-500">Goes live: {timeInfo.goLiveTime}</p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-500 mb-4">
                          <div>
                            <strong>Seller:</strong> {item.sellerName}
                          </div>
                          <div>
                            <strong>Approved:</strong> {item.approvedAt?.toLocaleDateString()}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleEdit(item)}
                            disabled={processingItemId === item.id}
                            className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Edit Details
                          </button>
                          <button
                            onClick={() => handleMakeLive(item.id)}
                            disabled={processingItemId === item.id}
                            className="flex-1 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {processingItemId === item.id ? 'Processing...' : 'Make Live Now'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onSave={handleSaveEdit}
          onCancel={() => setEditingItem(null)}
          isProcessing={processingItemId === editingItem.id}
        />
      )}
    </div>
  );
};

// Edit Item Modal Component
interface EditItemModalProps {
  item: ConsignmentItem;
  onSave: (item: ConsignmentItem) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

const EditItemModal: React.FC<EditItemModalProps> = ({ item, onSave, onCancel, isProcessing }) => {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [price, setPrice] = useState(item.price.toString());

  const handleSave = () => {
    if (!title.trim() || !description.trim() || !price.trim()) {
      alert('Please fill in all fields');
      return;
    }

    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue <= 0) {
      alert('Please enter a valid price');
      return;
    }

    onSave({
      ...item,
      title: title.trim(),
      description: description.trim(),
      price: priceValue
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-800">Edit Item Details</h3>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
              <input
                type="text"
                value={price}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setPrice(value);
                  }
                }}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isProcessing}
            className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isProcessing ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApprovedItemsModal; 