import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, AuthUser } from '../types';
import { apiService } from '../services/apiService';

interface MyPendingItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
}

const MyPendingItemsModal: React.FC<MyPendingItemsModalProps> = ({ isOpen, onClose, user }) => {
  const [myItems, setMyItems] = useState<ConsignmentItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ConsignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<ConsignmentItem | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      fetchMyItems();
    }
  }, [isOpen, user]);

  useEffect(() => {
    // Filter to show only pending and rejected items
    const filtered = myItems.filter(item => 
      item.status === 'pending' || item.status === 'rejected'
    );
    setFilteredItems(filtered);
  }, [myItems]);

  const fetchMyItems = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const itemsRef = collection(db, 'items');
      const q = query(
        itemsRef, 
        where('sellerId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      
      const items: ConsignmentItem[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          approvedAt: data.approvedAt?.toDate(),
          liveAt: data.liveAt?.toDate(),
          rejectedAt: data.rejectedAt?.toDate(),
          soldAt: data.soldAt?.toDate()
        } as ConsignmentItem);
      });

      setMyItems(items);
    } catch (error: any) {
      console.error('Error fetching my items:', error);
      // Try fallback query without ordering if index not ready
      try {
        const itemsRef = collection(db, 'items');
        const q = query(itemsRef, where('sellerId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        
        const items: ConsignmentItem[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            approvedAt: data.approvedAt?.toDate(),
            liveAt: data.liveAt?.toDate(),
            rejectedAt: data.rejectedAt?.toDate(),
            soldAt: data.soldAt?.toDate()
          } as ConsignmentItem);
        });

        // Sort manually
        items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setMyItems(items);
      } catch (fallbackError) {
        console.error('Error fetching my items (fallback):', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (item: ConsignmentItem) => {
    if (item.status === 'pending') {
      setEditingItem(item);
    }
  };

  const handleRemoveItem = async (item: ConsignmentItem) => {
    if (item.status !== 'pending') {
      alert('Only pending items can be removed');
      return;
    }

    const confirmMessage = `Are you sure you want to remove "${item.title}"? This action cannot be undone and you'll need to resubmit the item if you change your mind.`;
    if (!confirm(confirmMessage)) return;

    setProcessingAction(`remove-${item.id}`);
    try {
      await apiService.removeUserItem(item.id);
      
      // Remove from local state
      setMyItems(prev => prev.filter(i => i.id !== item.id));
      alert('Item removed successfully');
    } catch (error) {
      console.error('Error removing item:', error);
      alert('Failed to remove item. Please try again.');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleSaveEdit = async (updatedItem: ConsignmentItem) => {
    setProcessingAction(`edit-${updatedItem.id}`);
    try {
      await apiService.updateUserItem(updatedItem.id, {
        title: updatedItem.title,
        description: updatedItem.description,
        price: updatedItem.price,
        category: updatedItem.category,
        gender: updatedItem.gender,
        size: updatedItem.size,
        brand: updatedItem.brand,
        condition: updatedItem.condition,
        material: updatedItem.material
      });

      // Update local state
      setMyItems(prev => prev.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      ));
      
      setEditingItem(null);
      alert('Item updated successfully');
    } catch (error) {
      console.error('Error updating item:', error);
      alert('Failed to update item. Please try again.');
    } finally {
      setProcessingAction(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-blue-100 text-blue-800';
      case 'live':
        return 'bg-green-100 text-green-800';
      case 'sold':
        return 'bg-purple-100 text-purple-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusDescription = (item: ConsignmentItem) => {
    switch (item.status) {
      case 'pending':
        return 'Your item is waiting for admin review. Please bring the physical item to the front desk.';
      case 'rejected':
        return 'Your item was rejected during review. You can edit and resubmit it.';
      default:
        return 'Status unknown.';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="mobile-admin-modal">
      <div className="mobile-admin-modal-content">
        <div className="mobile-admin-modal-header">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800">My Pending Items</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Track your pending and rejected items • Click to edit pending items
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 -m-2 mobile-touch-target"
            >
              <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mobile-admin-modal-body">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-6m-10 0h6m0 0L12 18l-4-5" />
                </svg>
              </div>
              <p className="text-gray-500 text-lg">No pending or rejected items</p>
              <p className="text-gray-400 text-sm mt-2">Items that are approved, live, or sold are not shown here</p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {filteredItems.map((item) => (
                <div 
                  key={item.id} 
                  className={`border border-gray-200 rounded-lg p-4 sm:p-6 bg-white transition-colors ${
                    item.status === 'pending' ? 'hover:bg-gray-50 cursor-pointer' : ''
                  }`}
                  onClick={() => item.status === 'pending' && handleEditItem(item)}
                >
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Item Image */}
                    <div className="flex-shrink-0 self-center sm:self-start">
                      {item.images.length > 0 ? (
                        <div className="relative">
                          <img
                            src={item.images[0]}
                            alt={item.title}
                            className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg"
                          />
                          {item.images.length > 1 && (
                            <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                              +{item.images.length - 1}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-3">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">
                          {item.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold text-green-600">
                            ${item.price.toFixed(2)}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(item.status)}`}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                        {item.description}
                      </p>

                      {/* Status Information */}
                      <div className="bg-gray-50 rounded-lg p-3 mb-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Status Update</h4>
                        <p className="text-sm text-gray-700 mb-2">
                          {getStatusDescription(item)}
                        </p>
                        
                        {/* Rejection Reason */}
                        {item.status === 'rejected' && item.rejectionReason && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                            <h5 className="text-sm font-medium text-red-900 mb-1">Rejection Reason:</h5>
                            <p className="text-sm text-red-800">{item.rejectionReason}</p>
                            <p className="text-xs text-red-600 mt-2">
                              You can edit and resubmit this item, or contact us if you have questions.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      {item.status === 'pending' && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditItem(item);
                            }}
                            disabled={processingAction === `edit-${item.id}`}
                            className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                          >
                            {processingAction === `edit-${item.id}` ? 'Updating...' : '✏️ Edit Details'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveItem(item);
                            }}
                            disabled={processingAction === `remove-${item.id}`}
                            className="px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                          >
                            {processingAction === `remove-${item.id}` ? 'Removing...' : '🗑️ Remove'}
                          </button>
                        </div>
                      )}

                      {/* Instructions for pending items */}
                      {item.status === 'pending' && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                          <p className="text-sm text-blue-800">
                            💡 <strong>Click anywhere on this item</strong> to edit details, or use the buttons above to edit or remove it.
                          </p>
                        </div>
                      )}

                      {/* Timeline */}
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>
                          <span className="font-medium">Submitted:</span> {item.createdAt.toLocaleDateString()} at {item.createdAt.toLocaleTimeString()}
                        </div>
                        {item.rejectedAt && (
                          <div>
                            <span className="font-medium">Rejected:</span> {item.rejectedAt.toLocaleDateString()} at {item.rejectedAt.toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <EditUserItemModal
          item={editingItem}
          onSave={handleSaveEdit}
          onCancel={() => setEditingItem(null)}
          isProcessing={processingAction === `edit-${editingItem.id}`}
        />
      )}
    </div>
  );
};

// Edit Item Modal Component for User's Own Items
interface EditUserItemModalProps {
  item: ConsignmentItem;
  onSave: (item: ConsignmentItem) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

const EditUserItemModal: React.FC<EditUserItemModalProps> = ({ item, onSave, onCancel, isProcessing }) => {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [price, setPrice] = useState(item.price.toString());
  const [category, setCategory] = useState(item.category || '');
  const [gender, setGender] = useState(item.gender || '');
  const [size, setSize] = useState(item.size || '');
  const [brand, setBrand] = useState(item.brand || '');
  const [condition, setCondition] = useState(item.condition || '');
  const [material, setMaterial] = useState(item.material || '');
  const [showValidationError, setShowValidationError] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');

  const handleSave = () => {
    if (!title.trim() || !description.trim() || !price.trim()) {
      setValidationMessage('Please fill in all required fields');
      setShowValidationError(true);
      return;
    }

    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue <= 0) {
      setValidationMessage('Please enter a valid price greater than 0');
      setShowValidationError(true);
      return;
    }

    onSave({
      ...item,
      title: title.trim(),
      description: description.trim(),
      price: priceValue,
      category: category || undefined,
      gender: (gender as 'Men' | 'Women' | 'Unisex' | '') || undefined,
      size: size || undefined,
      brand: brand.trim() || undefined,
      condition: (condition as 'New' | 'Like New' | 'Good' | 'Fair' | '') || undefined,
      material: material.trim() || undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-800">Edit Item Details</h3>
          <p className="text-sm text-gray-600 mt-1">Update your item before admin review</p>
        </div>
        
        <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
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

          {/* Additional Details */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Additional Details</h4>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Category</option>
                  <option value="Climbing">Climbing 🧗</option>
                  <option value="Skiing">Skiing ⛷️</option>
                  <option value="Hiking">Hiking 🥾</option>
                  <option value="Camping">Camping ⛺</option>
                  <option value="Mountaineering">Mountaineering 🏔️</option>
                  <option value="Snowboarding">Snowboarding 🏂</option>
                  <option value="Cycling">Cycling 🚵</option>
                  <option value="Water Sports">Water Sports 🚣</option>
                  <option value="Apparel">Apparel 👕</option>
                  <option value="Footwear">Footwear 👟</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Gender</option>
                  <option value="Men">Men</option>
                  <option value="Women">Women</option>
                  <option value="Unisex">Unisex</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Size</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
                  <option value="8">8</option>
                  <option value="9">9</option>
                  <option value="10">10</option>
                  <option value="11">11</option>
                  <option value="12">12</option>
                  <option value="13">13</option>
                  <option value="One Size">One Size</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Condition</option>
                  <option value="New">New - Never used</option>
                  <option value="Like New">Like New - Minimal wear</option>
                  <option value="Good">Good - Some wear but functional</option>
                  <option value="Fair">Fair - Well used but still works</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Patagonia, REI"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
                <input
                  type="text"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Gore-Tex, Cotton"
                />
              </div>
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

        {/* Validation Error Modal */}
        {showValidationError && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-red-600 text-xl">⚠️</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Validation Error</h3>
              </div>
              <p className="text-gray-600 mb-6">{validationMessage}</p>
              <div className="flex justify-end">
                <button
                  onClick={() => setShowValidationError(false)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyPendingItemsModal; 