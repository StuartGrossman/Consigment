import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, AuthUser } from '../types';
import { useCriticalActionThrottle } from '../hooks/useButtonThrottle';
import { apiService } from '../services/apiService';

interface ApprovedItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
}

const ApprovedItemsModal: React.FC<ApprovedItemsModalProps> = ({ isOpen, onClose, user }) => {
  const [approvedItems, setApprovedItems] = useState<ConsignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  
  // Multi-select state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  
  // Button throttling hook
  const { throttledAction, isActionDisabled, isActionProcessing } = useCriticalActionThrottle();
  
  // Modal states
  const [showMakeLiveModal, setShowMakeLiveModal] = useState(false);
  const [showBulkMakeLiveModal, setShowBulkMakeLiveModal] = useState(false);
  const [showBulkSendBackModal, setShowBulkSendBackModal] = useState(false);
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
    const allIds = new Set(approvedItems.map(item => item.id));
    setSelectedItems(allIds);
    setShowBulkActions(true);
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
    setShowBulkActions(false);
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

  const handleMakeLiveClick = async (item: ConsignmentItem) => {
    await throttledAction(`make-live-${item.id}`, async () => {
      setSelectedItem(item);
      setShowMakeLiveModal(true);
    });
  };

  const confirmMakeLive = async () => {
    if (!selectedItem) return;
    
    await throttledAction(`confirm-make-live-${selectedItem.id}`, async () => {
      setShowMakeLiveModal(false);
      setProcessingItemId(selectedItem.id);
      
      try {
        await apiService.makeItemLive(selectedItem.id);
        
        // Remove from approved list since it's now live
        setApprovedItems(prev => prev.filter(i => i.id !== selectedItem.id));
        
        // Close the main modal immediately without showing success modal
        onClose();
      } catch (error) {
        console.error('Error making item live:', error);
        setModalMessage('Error making item live. Please try again.');
        setShowErrorModal(true);
      } finally {
        setProcessingItemId(null);
        setSelectedItem(null);
      }
    });
  };

  const handleSendBackToPending = async (item: ConsignmentItem) => {
    await throttledAction(`send-back-${item.id}`, async () => {
      setProcessingItemId(item.id);
      
      try {
        await apiService.sendBackToPending(item.id);
        
        // Remove from approved list since it's now pending
        setApprovedItems(prev => prev.filter(i => i.id !== item.id));
        setModalMessage('Item sent back to pending queue.');
        setShowSuccessModal(true);
      } catch (error) {
        console.error('Error sending item back to pending:', error);
        setModalMessage('Error sending item back to pending. Please try again.');
        setShowErrorModal(true);
      } finally {
        setProcessingItemId(null);
      }
    });
  };

  // Bulk actions
  const handleBulkMakeLive = async () => {
    if (selectedItems.size === 0) return;
    setShowBulkMakeLiveModal(true);
  };

  const confirmBulkMakeLive = async () => {
    if (selectedItems.size === 0) return;
    
    await throttledAction('bulk-make-live', async () => {
      setShowBulkMakeLiveModal(false);
      setProcessingItemId('bulk');
      let successCount = 0;
      let failCount = 0;
      
      try {
        // Process each selected item
        for (const itemId of selectedItems) {
          try {
            await apiService.makeItemLive(itemId);
            successCount++;
          } catch (error) {
            console.error(`Failed to make item ${itemId} live:`, error);
            failCount++;
          }
        }
        
        // Remove successful items from the list
        if (successCount > 0) {
          setApprovedItems(prev => prev.filter(item => !selectedItems.has(item.id)));
        }
        
        setModalMessage(`${successCount} items made live successfully${failCount > 0 ? `, ${failCount} failed` : ''}.`);
        setShowSuccessModal(true);
        clearSelection();
        setProcessingItemId(null);
      } catch (error) {
        console.error('Error in bulk make live:', error);
        setModalMessage('Error processing bulk action. Please try again.');
        setShowErrorModal(true);
        setProcessingItemId(null);
      }
    });
  };

  const handleBulkSendBack = async () => {
    if (selectedItems.size === 0) return;
    setShowBulkSendBackModal(true);
  };

  const confirmBulkSendBack = async () => {
    if (selectedItems.size === 0) return;
    
    await throttledAction('bulk-send-back', async () => {
      setShowBulkSendBackModal(false);
      setProcessingItemId('bulk');
      let successCount = 0;
      let failCount = 0;
      
      try {
        // Process each selected item
        for (const itemId of selectedItems) {
          try {
            await apiService.sendBackToPending(itemId);
            successCount++;
          } catch (error) {
            console.error(`Failed to send item ${itemId} back to pending:`, error);
            failCount++;
          }
        }
        
        // Remove successful items from the list
        if (successCount > 0) {
          setApprovedItems(prev => prev.filter(item => !selectedItems.has(item.id)));
        }
        
        setModalMessage(`${successCount} items sent back to pending successfully${failCount > 0 ? `, ${failCount} failed` : ''}.`);
        setShowSuccessModal(true);
        clearSelection();
        setProcessingItemId(null);
      } catch (error) {
        console.error('Error in bulk send back:', error);
        setModalMessage('Error processing bulk action. Please try again.');
        setShowErrorModal(true);
        setProcessingItemId(null);
      }
    });
  };

  // Print barcode from stored image
  const printBarcode = (item: ConsignmentItem) => {
    if (!item.barcodeImageUrl) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Barcode Label - ${item.title}</title>
            <style>
              @media print {
                body { margin: 0; }
                .no-print { display: none !important; }
              }
              body { 
                font-family: Arial, sans-serif; 
                margin: 20px; 
                background-color: white; 
                color: black;
              }
              .label-container { 
                max-width: 600px; 
                margin: 0 auto; 
                border: 2px solid #000; 
                padding: 20px;
                background-color: white;
              }
              .header { 
                text-align: center; 
                border-bottom: 2px solid #000; 
                padding-bottom: 15px; 
                margin-bottom: 20px; 
              }
              .barcode-container { 
                text-align: center; 
                margin: 30px 0; 
                padding: 20px;
                background-color: white;
                border: 2px dashed #333;
              }
              .barcode-container img { 
                max-width: 100%; 
                height: auto; 
                background-color: white;
                padding: 10px;
              }
            </style>
          </head>
          <body>
            <div class="label-container">
              <div class="header">
                <h1>🏔️ Summit Gear Exchange</h1>
                <p>Mountain Consignment Store</p>
              </div>
              
              <div class="item-info">
                <h3>${item.title}</h3>
                <p>Price: $${item.price} | Status: ${item.status.toUpperCase()}</p>
              </div>
              
              <div class="barcode-container">
                <h4>SCAN BARCODE</h4>
                <img src="${item.barcodeImageUrl}" alt="Barcode: ${item.barcodeData}" />
                <div class="barcode-info">
                  <p><strong>Barcode ID:</strong> ${item.barcodeData}</p>
                  <p><strong>Generated:</strong> ${item.barcodeGeneratedAt ? new Date(item.barcodeGeneratedAt).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>
            </div>
            
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 500);
              };
              window.onafterprint = function() {
                window.close();
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="mobile-admin-modal">
      <div className="mobile-admin-modal-content">
        <div className="mobile-admin-modal-header">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Approved Items</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Employee preview before going live
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
            <>
              {/* Bulk Selection Controls */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={selectedItems.size === approvedItems.length ? clearSelection : selectAllItems}
                      className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className={`w-4 h-4 border-2 rounded flex items-center justify-center ${
                        selectedItems.size === approvedItems.length 
                          ? 'bg-orange-500 border-orange-500' 
                          : selectedItems.size > 0 
                            ? 'bg-orange-200 border-orange-400' 
                            : 'border-gray-300'
                      }`}>
                        {selectedItems.size === approvedItems.length && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {selectedItems.size > 0 && selectedItems.size < approvedItems.length && (
                          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        )}
                      </div>
                      <span>
                        {selectedItems.size === 0 ? 'Select All' : 
                         selectedItems.size === approvedItems.length ? 'Deselect All' : 
                         `${selectedItems.size} Selected`}
                      </span>
                    </button>
                    
                    {selectedItems.size > 0 && (
                      <span className="text-sm text-gray-600">
                        {selectedItems.size} of {approvedItems.length} items selected
                      </span>
                    )}
                  </div>
                  
                  {/* Bulk Action Buttons */}
                  {showBulkActions && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleBulkMakeLive}
                        disabled={processingItemId === 'bulk' || isActionDisabled('bulk-make-live')}
                        className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {processingItemId === 'bulk' ? 'Processing...' : `🚀 Make ${selectedItems.size} Live`}
                      </button>
                      <button
                        onClick={handleBulkSendBack}
                        disabled={processingItemId === 'bulk' || isActionDisabled('bulk-send-back')}
                        className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {`↶ Send ${selectedItems.size} Back`}
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
              <div className="space-y-4 sm:space-y-6">
                {approvedItems.map((item) => {
                  const timeInfo = calculateTimeRemaining(item.approvedAt!);
                  return (
                    <div key={item.id} className={`mobile-admin-item-card bg-gradient-to-r from-orange-50 to-yellow-50 relative transition-all duration-200 ${
                      selectedItems.has(item.id) ? 'ring-2 ring-orange-500 bg-orange-100' : ''
                    }`}>
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
                      
                      <div className="mobile-admin-item-layout">
                      {/* Images */}
                      <div className="mobile-admin-item-image">
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
                          <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="mobile-admin-item-content">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
                          <h3 className="mobile-admin-item-title">{item.title}</h3>
                          <div className="text-xl sm:text-2xl font-bold text-green-600 text-center sm:text-right">
                            ${item.price.toFixed(2)}
                          </div>
                        </div>
                        
                        <p className="mobile-admin-item-description">{item.description}</p>
                        
                        {/* Timer and Status */}
                        <div className="bg-white rounded-lg p-2 sm:p-3 border border-orange-200">
                          <div className="flex items-center gap-2 mb-1 sm:mb-2">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className={`text-sm sm:text-base font-medium ${timeInfo.expired ? 'text-green-600' : 'text-orange-600'}`}>
                              {timeInfo.text}
                            </span>
                          </div>
                          {!timeInfo.expired && timeInfo.goLiveTime && (
                            <p className="text-xs text-gray-500">Goes live: {timeInfo.goLiveTime}</p>
                          )}
                        </div>

                        {/* Barcode Section */}
                        {item.barcodeData && (
                          <div className="bg-blue-50 rounded-lg p-2 sm:p-3 border border-blue-200">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                                </svg>
                                <span className="text-sm sm:text-base font-medium text-blue-800">Item Barcode</span>
                              </div>
                              {item.barcodeImageUrl && (
                                <button
                                  onClick={() => printBarcode(item)}
                                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                  </svg>
                                  Print
                                </button>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                              {/* Barcode Image */}
                              {item.barcodeImageUrl ? (
                                <div className="flex justify-center sm:justify-start">
                                  <div className="bg-white p-2 rounded border border-blue-200 shadow-sm">
                                    <img 
                                      src={item.barcodeImageUrl} 
                                      alt={`Barcode: ${item.barcodeData}`}
                                      className="max-w-full h-auto max-h-16 sm:max-h-20"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="flex justify-center sm:justify-start">
                                  <div className="bg-gray-100 p-3 rounded border border-gray-200 text-center">
                                    <svg className="w-8 h-8 mx-auto text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                                    </svg>
                                    <p className="text-xs text-gray-500">No image</p>
                                  </div>
                                </div>
                              )}
                              
                              {/* Barcode Information */}
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-blue-700">Barcode ID:</div>
                                <div className="font-mono text-xs bg-white px-2 py-1 rounded border border-blue-200 break-all">
                                  {item.barcodeData}
                                </div>
                                <div className="text-xs text-blue-600">
                                  Generated: {item.barcodeGeneratedAt 
                                    ? (item.barcodeGeneratedAt instanceof Date 
                                        ? item.barcodeGeneratedAt.toLocaleDateString()
                                        : new Date(item.barcodeGeneratedAt).toLocaleDateString())
                                    : 'N/A'
                                  }
                                </div>
                                <div className="flex gap-1 mt-2">
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(item.barcodeData!);
                                      // Show a brief success message
                                      const toast = document.createElement('div');
                                      toast.className = 'fixed top-4 right-4 z-50 bg-green-500 text-white px-3 py-1 rounded text-sm';
                                      toast.textContent = 'Barcode copied!';
                                      document.body.appendChild(toast);
                                      setTimeout(() => {
                                        if (document.body.contains(toast)) {
                                          document.body.removeChild(toast);
                                        }
                                      }, 2000);
                                    }}
                                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors flex items-center gap-1"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    Copy
                                  </button>
                                  {item.barcodeImageUrl && (
                                    <button
                                      onClick={() => printBarcode(item)}
                                      className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors flex items-center gap-1"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                      </svg>
                                      Print
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="mobile-admin-item-details">
                          <div>
                            <strong>Seller:</strong> {item.sellerName}
                          </div>
                          <div>
                            <strong>Approved:</strong> {item.approvedAt?.toLocaleDateString()}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mobile-admin-item-actions">
                          <button
                            onClick={() => handleSendBackToPending(item)}
                            disabled={processingItemId === item.id || isActionDisabled(`send-back-${item.id}`)}
                            className="mobile-admin-button mobile-admin-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingItemId === item.id ? 'Processing...' : 
                             isActionProcessing(`send-back-${item.id}`) ? 'Sending...' : 'Send Back to Pending'}
                          </button>
                          <button
                            onClick={() => handleMakeLiveClick(item)}
                            disabled={processingItemId === item.id || isActionDisabled(`make-live-${item.id}`)}
                            className="mobile-admin-button mobile-admin-button-approve disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingItemId === item.id ? 'Processing...' : 
                             isActionProcessing(`make-live-${item.id}`) ? 'Opening...' : 'Mark as Live'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>



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
                disabled={selectedItem ? isActionDisabled(`confirm-make-live-${selectedItem.id}`) : false}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedItem && isActionProcessing(`confirm-make-live-${selectedItem.id}`) ? 'Processing...' : 'Make Live Now'}
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

      {/* Bulk Make Live Confirmation Modal */}
      {showBulkMakeLiveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                <span className="text-green-600 text-xl">🚀</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Bulk Make Live</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to make {selectedItems.size} items live? This will make them available to all customers immediately.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowBulkMakeLiveModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkMakeLive}
                disabled={isActionDisabled('bulk-make-live')}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isActionProcessing('bulk-make-live') ? 'Processing...' : `Make ${selectedItems.size} Items Live`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Send Back Confirmation Modal */}
      {showBulkSendBackModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mr-3">
                <span className="text-gray-600 text-xl">↶</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Bulk Send Back to Pending</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to send {selectedItems.size} items back to pending? They will need to be re-approved.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowBulkSendBackModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkSendBack}
                disabled={isActionDisabled('bulk-send-back')}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isActionProcessing('bulk-send-back') ? 'Processing...' : `Send ${selectedItems.size} Items Back`}
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



export default ApprovedItemsModal; 