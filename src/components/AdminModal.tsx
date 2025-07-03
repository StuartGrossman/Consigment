import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, AuthUser, Category } from '../types';
import BarcodeGenerationModal from './BarcodeGenerationModal';
import BulkBarcodeGenerationModal from './BulkBarcodeGenerationModal';
import { apiService } from '../services/apiService';
import { useCriticalActionThrottle } from '../hooks/useButtonThrottle';
import { useCategories } from '../hooks/useCategories';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onDataChanged?: () => void;
}

const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose, user, onDataChanged }) => {
  const { categories } = useCategories(true); // Only get active categories
  const [pendingItems, setPendingItems] = useState<ConsignmentItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ConsignmentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  
  // Multi-select state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  
  // Button throttling hook
  const { throttledAction, isActionDisabled, isActionProcessing } = useCriticalActionThrottle();
  
  // Modal states
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showBulkRejectModal, setShowBulkRejectModal] = useState(false);
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [showBulkBarcodeModal, setShowBulkBarcodeModal] = useState(false);

  const [selectedItem, setSelectedItem] = useState<ConsignmentItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [editingItem, setEditingItem] = useState<ConsignmentItem | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      fetchPendingItems();
    }
  }, [isOpen, user]);

  // Filter items based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredItems(pendingItems);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = pendingItems.filter(item =>
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        (item.brand && item.brand.toLowerCase().includes(query)) ||
        (item.category && item.category.toLowerCase().includes(query)) ||
        (item.sellerName && item.sellerName.toLowerCase().includes(query)) ||
        (item.barcodeData && item.barcodeData.toLowerCase().includes(query))
      );
      setFilteredItems(filtered);
    }
  }, [pendingItems, searchQuery]);

  const fetchPendingItems = async () => {
    setLoading(true);
    try {
      const itemsRef = collection(db, 'items');
      const q = query(itemsRef, where('status', '==', 'pending'));
      const querySnapshot = await getDocs(q);
      
      const items: ConsignmentItem[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          approvedAt: data.approvedAt?.toDate(),
          liveAt: data.liveAt?.toDate()
        } as ConsignmentItem);
      });

      // Sort by creation date (newest first)
      items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setPendingItems(items);
    } catch (error: any) {
      // Silent fallback for permission errors - don't log to console
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        return; // Fail silently for permission issues
      }
      console.error('Error fetching pending items:', error);
    } finally {
      setLoading(false);
    }
  };

  // Multi-select functions
  const toggleSelectItem = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  const selectAllItems = () => {
    const allIds = new Set(filteredItems.map(item => item.id));
    setSelectedItems(allIds);
    setShowBulkActions(true);
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
    setShowBulkActions(false);
  };

  // Bulk actions
  const handleBulkApprove = async () => {
    if (selectedItems.size === 0) return;
    // Skip confirmation modal and go directly to bulk barcode generation
    setShowBulkBarcodeModal(true);
  };

  const confirmBulkApprove = async () => {
    if (selectedItems.size === 0) return;
    
    setShowBulkApproveModal(false);
    setShowBulkBarcodeModal(true);
  };

  const handleBulkReject = async () => {
    if (selectedItems.size === 0) return;
    setShowBulkRejectModal(true);
  };

  const confirmBulkReject = async () => {
    if (selectedItems.size === 0) return;
    
    await throttledAction('bulk-reject', async () => {
      setShowBulkRejectModal(false);
      setProcessingItemId('bulk');
      let successCount = 0;
      let failCount = 0;
      
      try {
        await apiService.bulkRejectItems(Array.from(selectedItems), rejectionReason || 'No reason provided');
        successCount = selectedItems.size;
      } catch (error) {
        console.error('Failed to bulk reject items:', error);
        failCount = selectedItems.size;
      }
      
      // Remove successful items from the list
      if (successCount > 0) {
        setPendingItems(prev => prev.filter(item => !selectedItems.has(item.id)));
        // Trigger data refresh in parent component
        onDataChanged?.();
      }
      
      setModalMessage(`${successCount} items rejected successfully${failCount > 0 ? `, ${failCount} failed` : ''}.`);
      setShowSuccessModal(true);
      clearSelection();
      setRejectionReason('');
      setProcessingItemId(null);
    });
  };

  const handleApproveClick = async (item: ConsignmentItem) => {
    await throttledAction(`approve-${item.id}`, async () => {
      setSelectedItem(item);
      // Skip confirmation modal and go directly to barcode generation
      setShowBarcodeModal(true);
    });
  };

  const handleRejectClick = async (item: ConsignmentItem) => {
    await throttledAction(`reject-${item.id}`, async () => {
      setSelectedItem(item);
      setRejectionReason('');
      setShowRejectModal(true);
    });
  };

  const confirmApprove = async () => {
    if (!selectedItem) return;
    
    await throttledAction(`confirm-approve-${selectedItem.id}`, async () => {
      setShowApproveModal(false);
      setShowBarcodeModal(true);
    });
  };

  const handleBarcodeConfirmed = async (item: ConsignmentItem, barcodeData: string) => {
    // Remove from pending list since it's now approved with barcode
    setPendingItems(prev => prev.filter(i => i.id !== item.id));
    setSelectedItem(null);
    
    // Trigger data refresh in parent component
    onDataChanged?.();
    
    // Show success message
    setModalMessage(`"${item.title}" has been approved and moved to the approved items list. The barcode label has been generated and is ready for printing.`);
    setShowSuccessModal(true);
  };

  const handleBarcodeModalClose = () => {
    setShowBarcodeModal(false);
    setSelectedItem(null);
  };

  const confirmReject = async () => {
    if (!selectedItem) return;
    
    await throttledAction(`confirm-reject-${selectedItem.id}`, async () => {
      setProcessingItemId(selectedItem.id);
      setShowRejectModal(false);
      
      try {
        await apiService.rejectItem(selectedItem.id, rejectionReason || 'No reason provided');
        
        // Remove from pending list
        setPendingItems(prev => prev.filter(item => item.id !== selectedItem.id));
        // Trigger data refresh in parent component
        onDataChanged?.();
        setModalMessage('Item rejected.');
        setShowSuccessModal(true);
      } catch (error) {
        console.error('Error rejecting item:', error);
        setModalMessage('Error rejecting item. Please try again.');
        setShowErrorModal(true);
      } finally {
        setProcessingItemId(null);
        setSelectedItem(null);
      }
    });
  };

  const handleEdit = async (item: ConsignmentItem) => {
    await throttledAction(`edit-${item.id}`, async () => {
      setEditingItem(item);
    });
  };

  const handleSaveEdit = async (updatedItem: ConsignmentItem) => {
    await throttledAction(`save-edit-${updatedItem.id}`, async () => {
      setProcessingItemId(updatedItem.id);
      try {
        await apiService.editItem(updatedItem.id, {
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
        setPendingItems(prev => prev.map(item => 
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
    });
  };

  if (!isOpen) return null;

  return (
    <div className="mobile-admin-modal">
      <div className="mobile-admin-modal-content">
        <div className="mobile-admin-modal-header">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Manage Pending Items</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Review and approve items for consignment ({filteredItems.length} items)
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
          {/* Search Bar */}
          {!loading && pendingItems.length > 0 && (
            <div className="mb-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by title, brand, category, seller, or barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}
          
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
            </div>
          ) : pendingItems.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-500 text-lg">No pending items to review</p>
              <p className="text-gray-400 text-sm mt-2">All items have been processed!</p>
            </div>
          ) : (
            <>
              {/* Bulk Selection Controls - Sticky at Top */}
              {filteredItems.length > 0 && (
                <div className="sticky top-0 z-10 mb-4 p-3 bg-gray-50 rounded-lg border-b border-gray-200 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={selectedItems.size === filteredItems.length && filteredItems.length > 0 ? clearSelection : selectAllItems}
                        className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className={`w-4 h-4 border-2 rounded flex items-center justify-center ${
                          selectedItems.size === filteredItems.length && filteredItems.length > 0
                            ? 'bg-orange-500 border-orange-500' 
                            : selectedItems.size > 0 
                              ? 'bg-orange-200 border-orange-400' 
                              : 'border-gray-300'
                        }`}>
                          {selectedItems.size === filteredItems.length && filteredItems.length > 0 && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {selectedItems.size > 0 && selectedItems.size < filteredItems.length && (
                            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                          )}
                        </div>
                        <span>
                          {selectedItems.size === 0 ? 'Select All' : 
                           selectedItems.size === filteredItems.length ? 'Deselect All' : 
                           `${selectedItems.size} Selected`}
                        </span>
                      </button>
                      
                      {selectedItems.size > 0 && (
                        <span className="text-sm text-gray-600">
                          {selectedItems.size} of {filteredItems.length} items selected
                        </span>
                      )}
                    </div>
                    
                    {/* Bulk Action Buttons */}
                    {showBulkActions && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleBulkApprove}
                          disabled={processingItemId === 'bulk' || isActionDisabled('bulk-approve')}
                          className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          {processingItemId === 'bulk' ? 'Processing...' : `📄 Approve ${selectedItems.size} Item${selectedItems.size > 1 ? 's' : ''}`}
                        </button>
                        <button
                          onClick={handleBulkReject}
                          disabled={processingItemId === 'bulk' || isActionDisabled('bulk-reject')}
                          className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          {`❌ Reject ${selectedItems.size} Item${selectedItems.size > 1 ? 's' : ''}`}
                        </button>
                        <button
                          onClick={clearSelection}
                          className="px-3 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-4 sm:space-y-6">
                {filteredItems.map((item) => (
                  <div 
                    key={item.id} 
                    className={`mobile-admin-item-card relative transition-all duration-200 cursor-pointer hover:shadow-md ${
                      selectedItems.has(item.id) 
                        ? 'ring-2 ring-orange-500 bg-orange-50 border-orange-200' 
                        : 'hover:bg-gray-50 hover:border-gray-300 hover:ring-1 hover:ring-orange-300'
                    }`}
                    onClick={() => toggleSelectItem(item.id)}
                  >
                    <div className="mobile-admin-item-layout">
                      {/* Selection Checkbox */}
                      <div className="absolute top-3 left-3 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectItem(item.id);
                          }}
                          className={`w-6 h-6 border-2 rounded flex items-center justify-center transition-colors ${
                            selectedItems.has(item.id)
                              ? 'bg-orange-500 border-orange-500'
                              : 'bg-white border-gray-300 hover:border-orange-400'
                          }`}
                        >
                          {selectedItems.has(item.id) && (
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </div>
                      
                      {/* Images */}
                      <div className="mobile-admin-item-image">
                        {(item.images && item.images.length > 0) ? (
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
                          <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                            <div className="text-center">
                              <svg className="w-8 h-8 mx-auto mb-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <p className="text-xs text-gray-500">No Image</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="mobile-admin-item-content">
                        <h3 className="mobile-admin-item-title">{item.title}</h3>
                        <p className="mobile-admin-item-description">{item.description}</p>
                        
                        <div className="mobile-admin-item-details">
                          <div>
                            <span className="font-medium text-gray-900">${item.price}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">By: </span>
                            <span className="text-gray-700">{item.sellerName}</span>
                          </div>
                          {item.category && (
                            <div>
                              <span className="text-gray-500">Category: </span>
                              <span className="text-gray-700">{item.category}</span>
                            </div>
                          )}
                          {item.size && (
                            <div>
                              <span className="text-gray-500">Size: </span>
                              <span className="text-gray-700">{item.size}</span>
                            </div>
                          )}
                          {item.brand && (
                            <div>
                              <span className="text-gray-500">Brand: </span>
                              <span className="text-gray-700">{item.brand}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-gray-500">Submitted: </span>
                            <span className="text-gray-700">{item.createdAt.toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="mobile-admin-item-actions">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(item);
                            }}
                            disabled={processingItemId === item.id || isActionDisabled(`edit-${item.id}`)}
                            className="mobile-admin-button mobile-admin-button-edit disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isActionProcessing(`edit-${item.id}`) ? 'Opening...' : 'Edit Details'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApproveClick(item);
                            }}
                            disabled={processingItemId === item.id || isActionDisabled(`approve-${item.id}`)}
                            className="mobile-admin-button mobile-admin-button-approve disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingItemId === item.id ? 'Processing...' : 
                             isActionProcessing(`approve-${item.id}`) ? 'Opening...' : 'Approve Item'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRejectClick(item);
                            }}
                            disabled={processingItemId === item.id || isActionDisabled(`reject-${item.id}`)}
                            className="mobile-admin-button mobile-admin-button-reject disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingItemId === item.id ? 'Processing...' : 
                             isActionProcessing(`reject-${item.id}`) ? 'Opening...' : 'Reject Item'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bulk Reject Modal */}
      {showBulkRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                <span className="text-red-600 text-xl">⚠️</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Reject {selectedItems.size} Items</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Please provide a reason for rejecting these {selectedItems.size} items. This reason will be visible to the item owners.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
              rows={4}
            />
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowBulkRejectModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkReject}
                disabled={isActionDisabled('bulk-reject')}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isActionProcessing('bulk-reject') ? 'Processing...' : 'Reject Items'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {showApproveModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                <span className="text-green-600 text-xl">✅</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Approve Item</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Approving "<span className="font-medium">{selectedItem.title}</span>" will generate a barcode label that must be printed.
              After printing, the item will be available to employees for 3 days before going live to all customers.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmApprove}
                disabled={selectedItem ? isActionDisabled(`confirm-approve-${selectedItem.id}`) : false}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedItem && isActionProcessing(`confirm-approve-${selectedItem.id}`) ? 'Processing...' : 'Generate Label & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                <span className="text-red-600 text-xl">❌</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Reject Item</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Are you sure you want to reject "<span className="font-medium">{selectedItem.title}</span>"?
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for rejection (optional)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                rows={3}
                placeholder="Enter reason for rejection..."
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                disabled={selectedItem ? isActionDisabled(`confirm-reject-${selectedItem.id}`) : false}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedItem && isActionProcessing(`confirm-reject-${selectedItem.id}`) ? 'Processing...' : 'Reject Item'}
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

      {/* Edit Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onSave={handleSaveEdit}
          onCancel={() => setEditingItem(null)}
          isProcessing={processingItemId === editingItem.id}
          categories={categories}
        />
      )}

      {/* Barcode Generation Modal */}
      {showBarcodeModal && selectedItem && (
        <BarcodeGenerationModal
          isOpen={showBarcodeModal}
          onClose={handleBarcodeModalClose}
          item={selectedItem}
          onConfirmPrint={handleBarcodeConfirmed}
        />
      )}

      {/* Bulk Approve Confirmation Modal */}
      {showBulkApproveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                <span className="text-green-600 text-xl">📄</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Bulk Approve Items</h3>
            </div>
            <p className="text-gray-600 mb-6">
              You are about to approve <span className="font-medium">{selectedItems.size} items</span>. 
              This will generate barcode labels for each item that must be printed.
              Each item will be available to employees for 3 days before going live to all customers.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
              <div className="flex">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-800">
                  <strong>Note:</strong> Barcode generation may take a few moments for multiple items.
                  Please wait for the process to complete before printing.
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowBulkApproveModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkApprove}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Generate {selectedItems.size} Barcode{selectedItems.size > 1 ? 's' : ''} & Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Barcode Generation Modal */}
      {showBulkBarcodeModal && (
        <BulkBarcodeGenerationModal
          isOpen={showBulkBarcodeModal}
          onClose={() => {
            setShowBulkBarcodeModal(false);
            clearSelection();
          }}
          items={pendingItems.filter(item => selectedItems.has(item.id))}
          onComplete={(processedItems: ConsignmentItem[]) => {
            // Remove approved items from pending list
            setPendingItems(prev => prev.filter(item => !selectedItems.has(item.id)));
            // Trigger data refresh in parent component
            onDataChanged?.();
            clearSelection();
            setShowBulkBarcodeModal(false);
            setModalMessage(`Successfully approved ${processedItems.length} items with barcodes generated. Labels are ready for printing.`);
            setShowSuccessModal(true);
          }}
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
  categories: Category[];
}

const EditItemModal: React.FC<EditItemModalProps> = ({ item, onSave, onCancel, isProcessing, categories }) => {
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
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name} {cat.icon}
                    </option>
                  ))}
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

export default AdminModal; 