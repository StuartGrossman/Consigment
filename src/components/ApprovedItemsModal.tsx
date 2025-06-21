import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, AuthUser } from '../types';
import { useCriticalActionThrottle } from '../hooks/useButtonThrottle';

interface ApprovedItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
}

const ApprovedItemsModal: React.FC<ApprovedItemsModalProps> = ({ isOpen, onClose, user }) => {
  const [approvedItems, setApprovedItems] = useState<ConsignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  
  // Button throttling hook
  const { throttledAction, isActionDisabled, isActionProcessing } = useCriticalActionThrottle();
  
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
        await updateDoc(doc(db, 'items', selectedItem.id), {
          status: 'live',
          liveAt: serverTimestamp()
        });
        
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
        await updateDoc(doc(db, 'items', item.id), {
          status: 'pending',
          liveAt: null,
          // Keep barcode data but remove live status
        });
        
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
            <div className="space-y-4 sm:space-y-6">
              {approvedItems.map((item) => {
                const timeInfo = calculateTimeRemaining(item.approvedAt!);
                return (
                  <div key={item.id} className="mobile-admin-item-card bg-gradient-to-r from-orange-50 to-yellow-50">
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

                        <div className="mobile-admin-item-details">
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