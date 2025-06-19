import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, AuthUser } from '../types';

interface ApprovedItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
}

const ApprovedItemsModal: React.FC<ApprovedItemsModalProps> = ({ isOpen, onClose, user }) => {
  const [approvedItems, setApprovedItems] = useState<ConsignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<ConsignmentItem | null>(null);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  
  // Modal states
  const [showMakeLiveModal, setShowMakeLiveModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ConsignmentItem | null>(null);
  const [modalMessage, setModalMessage] = useState('');

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
          liveAt: data.liveAt?.toDate(),
          barcodeGeneratedAt: data.barcodeGeneratedAt?.toDate(),
          printConfirmedAt: data.printConfirmedAt?.toDate()
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

  const handleMakeLiveClick = (item: ConsignmentItem) => {
    setSelectedItem(item);
    setShowMakeLiveModal(true);
  };

  const confirmMakeLive = async () => {
    if (!selectedItem) return;
    
    setShowMakeLiveModal(false);
    setProcessingItemId(selectedItem.id);
    
    try {
      await updateDoc(doc(db, 'items', selectedItem.id), {
        status: 'live',
        liveAt: serverTimestamp()
      });
      
      // Remove from approved list since it's now live
      setApprovedItems(prev => prev.filter(i => i.id !== selectedItem.id));
      setModalMessage('Item is now live!');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error making item live:', error);
      setModalMessage('Error making item live. Please try again.');
      setShowErrorModal(true);
    } finally {
      setProcessingItemId(null);
      setSelectedItem(null);
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
        price: updatedItem.price,
        category: updatedItem.category || null,
        gender: updatedItem.gender || null,
        size: updatedItem.size || null,
        brand: updatedItem.brand || null,
        condition: updatedItem.condition || null,
        material: updatedItem.material || null
      });
      
      // Update local state
      setApprovedItems(prev => prev.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      ));
      setEditingItem(null);
      setModalMessage('Item updated successfully!');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error updating item:', error);
      setModalMessage('Error updating item. Please try again.');
      setShowErrorModal(true);
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
                          {item.barcodeData && (
                            <>
                              <div>
                                <strong>Barcode:</strong> {item.barcodeData}
                              </div>
                              <div>
                                <strong>Label Generated:</strong> {
                                  item.barcodeGeneratedAt 
                                    ? (item.barcodeGeneratedAt instanceof Date 
                                        ? item.barcodeGeneratedAt.toLocaleDateString()
                                        : new Date(item.barcodeGeneratedAt).toLocaleDateString())
                                    : 'N/A'
                                }
                              </div>
                            </>
                          )}
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
                            onClick={() => handleMakeLiveClick(item)}
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

      {/* Make Live Confirmation Modal */}
      {showMakeLiveModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                <span className="text-green-600 text-xl">🚀</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Make Item Live</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to make "<span className="font-medium">{selectedItem.title}</span>" live? 
              This will make it available to all customers immediately.
              {selectedItem.barcodeData ? (
                <span className="block mt-2 text-green-600 text-sm">✓ Barcode label has been generated and printed.</span>
              ) : (
                <span className="block mt-2 text-amber-600 text-sm">⚠ Note: No barcode label has been generated for this item.</span>
              )}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowMakeLiveModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmMakeLive}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Make Live Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                <span className="text-green-600 text-xl">🎉</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Success!</h3>
            </div>
            <p className="text-gray-600 mb-6">{modalMessage}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowSuccessModal(false)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                <span className="text-red-600 text-xl">⚠️</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Error</h3>
            </div>
            <p className="text-gray-600 mb-6">{modalMessage}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowErrorModal(false)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-800">Edit Item Details</h3>
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

export default ApprovedItemsModal; 