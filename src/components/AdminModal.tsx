import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem } from '../types';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose, user }) => {
  const [pendingItems, setPendingItems] = useState<ConsignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  
  // Modal states
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ConsignmentItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [modalMessage, setModalMessage] = useState('');

  useEffect(() => {
    if (isOpen && user) {
      fetchPendingItems();
    }
  }, [isOpen, user]);

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
    } catch (error) {
      console.error('Error fetching pending items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveClick = (item: ConsignmentItem) => {
    setSelectedItem(item);
    setShowApproveModal(true);
  };

  const handleRejectClick = (item: ConsignmentItem) => {
    setSelectedItem(item);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const confirmApprove = async () => {
    if (!selectedItem) return;
    
    setProcessingItemId(selectedItem.id);
    setShowApproveModal(false);
    
    try {
      await updateDoc(doc(db, 'items', selectedItem.id), {
        status: 'approved',
        approvedAt: serverTimestamp()
      });
      
      // Remove from pending list
      setPendingItems(prev => prev.filter(item => item.id !== selectedItem.id));
      setModalMessage('Item approved! It will be available to employees for 3 days before going live.');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error approving item:', error);
      setModalMessage('Error approving item. Please try again.');
      setShowErrorModal(true);
    } finally {
      setProcessingItemId(null);
      setSelectedItem(null);
    }
  };

  const confirmReject = async () => {
    if (!selectedItem) return;
    
    setProcessingItemId(selectedItem.id);
    setShowRejectModal(false);
    
    try {
      await updateDoc(doc(db, 'items', selectedItem.id), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectionReason: rejectionReason || 'No reason provided'
      });
      
      // Remove from pending list
      setPendingItems(prev => prev.filter(item => item.id !== selectedItem.id));
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
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200 rounded-t-xl">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Manage Pending Items</h2>
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
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
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
            <div className="space-y-6">
              {pendingItems.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-6 bg-gray-50">
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
                      
                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-500 mb-4">
                        <div>
                          <strong>Seller:</strong> {item.sellerName}
                        </div>
                        <div>
                          <strong>Email:</strong> {item.sellerEmail}
                        </div>
                        <div>
                          <strong>Submitted:</strong> {item.createdAt.toLocaleDateString()}
                        </div>
                        <div>
                          <strong>Images:</strong> {item.images.length}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleApproveClick(item)}
                          disabled={processingItemId === item.id}
                          className="flex-1 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {processingItemId === item.id ? 'Processing...' : 'Approve Item'}
                        </button>
                        <button
                          onClick={() => handleRejectClick(item)}
                          disabled={processingItemId === item.id}
                          className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {processingItemId === item.id ? 'Processing...' : 'Reject Item'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
              Are you sure you want to approve "<span className="font-medium">{selectedItem.title}</span>"? 
              This will make it available to employees for 3 days before going live to all customers.
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
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Approve Item
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
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Reject Item
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

export default AdminModal; 