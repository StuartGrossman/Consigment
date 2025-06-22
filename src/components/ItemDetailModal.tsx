import React, { useEffect, useRef, useState } from 'react';
import { ConsignmentItem } from '../types';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { db, storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { logUserAction } from '../services/firebaseService';
import JsBarcode from 'jsbarcode';
import { useFormSubmitThrottle } from '../hooks/useButtonThrottle';

interface ItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ConsignmentItem | null;
  onItemUpdated?: () => void;
}

// Helper function to safely convert Firebase Timestamps to Date objects
const safeToDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  try {
    if (timestamp instanceof Date) return timestamp;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000);
    }
    return new Date(timestamp);
  } catch (error) {
    console.error('Error converting timestamp:', error);
    return null;
  }
};

// Helper function to format dates safely
const formatDate = (timestamp: any): string => {
  const date = safeToDate(timestamp);
  return date ? date.toLocaleDateString() : 'N/A';
};

const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ isOpen, onClose, item, onItemUpdated }) => {
  const { 
    addToCart, 
    isInCart, 
    getCartItemQuantity, 
    toggleBookmark, 
    isBookmarked,
    cartItems,
    bookmarkedItems,
    isCartActionDisabled,
    isCartActionProcessing
  } = useCart();
  
  const { isAdmin, user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Button throttling hook
  const { throttledAction, isActionDisabled, isActionProcessing } = useFormSubmitThrottle();
  
  // Mark as Sold state
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [soldPrice, setSoldPrice] = useState('');
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundPassword, setRefundPassword] = useState('');
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);

  // Track bookmark state changes
  useEffect(() => {
    // Component updated with bookmark changes
  }, [bookmarkedItems, item, isBookmarked]);

  // Initialize sold price when modal opens
  useEffect(() => {
    if (item) {
      setSoldPrice(item.price.toString());
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'live': return 'bg-green-100 text-green-800';
      case 'sold': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending Review';
      case 'approved': return 'Approved';
      case 'live': return 'Live';
      case 'sold': return 'Sold';
      default: return status;
    }
  };

  const handleAddToCart = async () => {
    await addToCart(item, user);
    
    // Show a brief success message
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg';
    toast.textContent = `${item.title} added to cart!`;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 2000);
  };

  const handleBookmarkToggle = async () => {
    await throttledAction(`bookmark-${item.id}`, async () => {
      const wasBookmarked = isBookmarked(item.id);
      
      await toggleBookmark(item.id, user);
      
      // Show a brief success message
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg';
      toast.textContent = wasBookmarked ? `Removed ${item.title} from bookmarks` : `${item.title} bookmarked!`;
      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 2000);
    });
  };

  const canPurchase = item.status === 'live';

  // Mark as Sold functionality
  const handleMarkAsSold = () => {
    setShowSoldModal(true);
  };

  const handleConfirmSold = async () => {
    if (!soldPrice || parseFloat(soldPrice) <= 0) return;
    
    setIsProcessingSale(true);
    try {
      const itemRef = doc(db, 'items', item.id);
      const salePrice = parseFloat(soldPrice);
      
      await updateDoc(itemRef, {
        status: 'sold',
        soldAt: new Date(),
        soldPrice: salePrice,
        saleType: 'in-store' // Admin marked as sold = in-store sale
      });

      // Log the action
      await logUserAction(user, 'item_marked_sold', `Marked item as sold for $${salePrice}`, item.id, item.title);

      setShowSoldModal(false);
      setSoldPrice('');
      
      // Show success message briefly
      setTimeout(() => {
        onClose();
      }, 2000);
    } finally {
      setIsProcessingSale(false);
    }
  };

  const handleIssueRefund = () => {
    setShowRefundModal(true);
  };

  const handleCancelRefund = () => {
    setShowRefundModal(false);
    setRefundReason('');
    setRefundPassword('');
  };

  const handleCancelSold = () => {
    setShowSoldModal(false);
    setSoldPrice('');
  };

  const handleConfirmRefund = async () => {
    if (!refundReason.trim()) {
      alert('Please provide a reason for the refund.');
      return;
    }
    
    if (refundPassword !== '123') {
      alert('Invalid password. Please enter the correct password.');
      return;
    }

    setIsProcessingRefund(true);
    try {
      // Create refund record
      const refundRecord = {
        id: `refund_${item.id}_${Date.now()}`,
        itemId: item.id,
        itemTitle: item.title,
        originalPrice: item.soldPrice || item.price,
        refundAmount: item.soldPrice || item.price,
        reason: refundReason.trim(),
        refundedAt: new Date(),
        refundedBy: user?.uid || '',
        refundedByName: user?.displayName || user?.email || 'Admin',
        originalBuyerId: item.buyerId || '',
        originalBuyerName: item.buyerName || item.buyerInfo?.name || 'Unknown Buyer',
        sellerName: item.sellerName,
        sellerId: item.sellerId
      };

      // Add refund record to Firebase
      const refundsRef = collection(db, 'refunds');
      await addDoc(refundsRef, refundRecord);

      // Update item status back to approved
      const itemRef = doc(db, 'items', item.id);
      await updateDoc(itemRef, {
        status: 'approved',
        soldAt: null,
        soldPrice: null,
        buyerId: null,
        buyerName: null,
        buyerEmail: null,
        saleType: null,
        refundedAt: new Date(),
        refundReason: refundReason.trim()
      });

      // Log the action
      await logUserAction(user, 'item_refunded', `Issued refund: ${refundReason}`, item.id, item.title);

      setShowRefundModal(false);
      setRefundReason('');
      setRefundPassword('');
      
      // Close modal after brief delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error processing refund:', error);
      alert('Error processing refund. Please try again.');
    } finally {
      setIsProcessingRefund(false);
    }
  };

  // Generate barcode and save as image to Firebase Storage
  const generateAndSaveBarcode = async (barcodeData: string): Promise<string | null> => {
    if (!canvasRef.current) return null;
    
    try {
      // Generate barcode using jsbarcode
      JsBarcode(canvasRef.current, barcodeData, {
        format: "CODE128",
        width: 2,
        height: 80,
        displayValue: true,
        fontSize: 12,
        margin: 10
      });

      // Convert canvas to blob
      return new Promise((resolve) => {
        canvasRef.current!.toBlob(async (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }

          try {
            // Upload to Firebase Storage
            const storageRef = ref(storage, `barcodes/${item.id}_${barcodeData}.png`);
            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);
            resolve(downloadURL);
          } catch (error) {
            console.error('Error uploading barcode:', error);
            resolve(null);
          }
        }, 'image/png');
      });
    } catch (error) {
      console.error('Error generating barcode:', error);
      return null;
    }
  };

  // Print barcode from stored image
  const printBarcode = (barcodeImageUrl: string) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Barcode Label - ${item.title}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; text-align: center; }
              .item-info { margin-bottom: 20px; border: 1px solid #ccc; padding: 15px; background-color: #f9f9f9; }
              .barcode-container { margin: 20px 0; }
              .print-info { margin-top: 20px; font-size: 12px; color: #666; }
              h2 { color: #333; margin-bottom: 10px; }
              .detail-row { margin: 5px 0; text-align: left; }
              .label { font-weight: bold; display: inline-block; width: 100px; }
            </style>
          </head>
          <body>
            <h2>Summit Gear Exchange</h2>
            <div class="item-info">
              <h3>${item.title}</h3>
              <div class="detail-row">
                <span class="label">Price:</span> $${item.price}
              </div>
              <div class="detail-row">
                <span class="label">Category:</span> ${item.category}
              </div>
              <div class="detail-row">
                <span class="label">Brand:</span> ${item.brand || 'N/A'}
              </div>
              <div class="detail-row">
                <span class="label">Size:</span> ${item.size || 'N/A'}
              </div>
              <div class="detail-row">
                <span class="label">Seller:</span> ${item.sellerName}
              </div>
              <div class="detail-row">
                <span class="label">Status:</span> ${item.status}
              </div>
            </div>
            <div class="barcode-container">
              <img src="${barcodeImageUrl}" alt="Barcode: ${item.barcodeData}" style="max-width: 100%; height: auto;" />
            </div>
            <div class="print-info">
              <p>Barcode: ${item.barcodeData}</p>
              <p>Generated: ${formatDate(item.barcodeGeneratedAt) || formatDate(new Date())}</p>
              <p>Printed: ${new Date().toLocaleString()}</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  const handleAdminAction = async (action: string) => {
    if (!item) return;
    
    try {
      const itemRef = doc(db, 'items', item.id);
      const updateData: any = { status: action };
      
      if (action === 'live') {
        updateData.liveAt = new Date();
      } else if (action === 'approved') {
        updateData.approvedAt = new Date();
      } else if (action === 'archived') {
        updateData.archivedAt = new Date();
      } else if (action === 'pending') {
        // Reset approval and live dates when moving back to pending
        updateData.approvedAt = null;
        updateData.liveAt = null;
      }
      
      await updateDoc(itemRef, updateData);
      
      // Log the admin action
      const actionText = action === 'live' ? 'made item live' : 
                        action === 'approved' ? 'moved item to approved' : 
                        action === 'archived' ? 'removed/archived item' :
                        action === 'pending' ? 'moved item back to pending' : 
                        `updated item to ${action}`;
      await logUserAction(user, `item_${action}`, `Admin ${actionText}`, item.id, item.title);
      
      // Show success message
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg';
      const successMessage = action === 'live' ? 'made live' : 
                             action === 'approved' ? 'moved to approved' : 
                             action === 'archived' ? 'removed from listings' :
                             action === 'pending' ? 'moved to pending review' :
                             `updated to ${action}`;
      toast.textContent = `Item ${successMessage} successfully!`;
      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 2000);
      
      // Call refresh callback if provided
      if (onItemUpdated) {
        onItemUpdated();
      }
      
      // Close modal after action
      onClose();
    } catch (error) {
      console.error('Error updating item:', error);
      
      // Show error message
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg';
      toast.textContent = 'Error updating item. Please try again.';
      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4">
      <div className={`bg-white rounded-xl shadow-2xl ${item.status === 'sold' ? 'max-w-7xl' : 'max-w-4xl'} w-full max-h-[90vh] overflow-hidden`}>
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-gray-800">{item.title}</h2>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(item.status)}`}>
                  {getStatusText(item.status)}
                </span>
                <span className="text-2xl font-bold text-green-600">${item.price}</span>
              </div>
              
              {/* Admin Actions - Only show for non-sold items */}
              {isAdmin && item.status !== 'sold' && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {item.status === 'approved' && (
                    <button
                      onClick={handleMarkAsSold}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-500 text-white hover:bg-slate-600 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Mark as Sold
                    </button>
                  )}
                  
                  {item.status !== 'pending' && (
                    <button
                      onClick={() => handleAdminAction('pending')}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-500 text-white hover:bg-slate-600 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Send to Pending
                    </button>
                  )}
                  
                  {item.status !== 'approved' && (
                    <button
                      onClick={() => handleAdminAction('approved')}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-500 text-white hover:bg-slate-600 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Send Back to Approved Items
                    </button>
                  )}
                  
                  {/* Barcode Print Button */}
                  {item.barcodeImageUrl && (
                    <button
                      onClick={() => printBarcode(item.barcodeImageUrl!)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-500 text-white hover:bg-slate-600 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Print Barcode
                    </button>
                  )}
                </div>
              )}

              {/* Admin Actions for Sold Items - Issue Refund */}
              {isAdmin && item.status === 'sold' && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={handleIssueRefund}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
                    </svg>
                    Issue Refund
                  </button>
                  
                  {/* Barcode Print Button */}
                  {item.barcodeImageUrl && (
                    <button
                      onClick={() => printBarcode(item.barcodeImageUrl!)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-500 text-white hover:bg-slate-600 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Print Barcode
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none ml-4"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Static Content - No Scrolling */}
        <div className="p-6">
          {/* Item Images and Details - Side by Side for Sold Items */}
          <div className={`${item.status === 'sold' ? 'grid grid-cols-1 lg:grid-cols-2 gap-8' : ''}`}>
            {/* Item Images */}
            {item.images && item.images.length > 0 && (
              <div className="mb-6">
                <div className={`grid ${item.status === 'sold' ? 'grid-cols-2 gap-2' : 'grid-cols-1 md:grid-cols-2 gap-4'}`}>
                  {item.images.slice(0, 4).map((image, index) => (
                    <div key={index} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                      <img 
                        src={image} 
                        alt={`${item.title} ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
                {item.images.length > 4 && (
                  <p className="text-sm text-gray-500 mt-2">
                    +{item.images.length - 4} more images
                  </p>
                )}
              </div>
            )}

            {/* Item Details */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Description</h3>
                <p className="text-gray-600 whitespace-pre-wrap">{item.description}</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <h4 className="font-medium text-gray-800">Category</h4>
                  <p className="text-gray-600">{item.category}</p>
                </div>
                
                {item.brand && (
                  <div>
                    <h4 className="font-medium text-gray-800">Brand</h4>
                    <p className="text-gray-600">{item.brand}</p>
                  </div>
                )}
                
                {item.size && (
                  <div>
                    <h4 className="font-medium text-gray-800">Size</h4>
                    <p className="text-gray-600">{item.size}</p>
                  </div>
                )}
                
                {item.color && (
                  <div>
                    <h4 className="font-medium text-gray-800">Color</h4>
                    <p className="text-gray-600">{item.color}</p>
                  </div>
                )}
                
                {item.condition && (
                  <div>
                    <h4 className="font-medium text-gray-800">Condition</h4>
                    <p className="text-gray-600">{item.condition}</p>
                  </div>
                )}
                
                {item.gender && (
                  <div>
                    <h4 className="font-medium text-gray-800">Gender</h4>
                    <p className="text-gray-600">{item.gender}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Additional Information Sections */}
          <div className={`${item.status === 'sold' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6' : 'mt-6'}`}>
            {/* Seller Information */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-800 mb-2">Seller Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">Name:</span>
                  <span className="ml-2 font-medium">{item.sellerName}</span>
                </div>
                <div>
                  <span className="text-gray-600">Email:</span>
                  <span className="ml-2">{item.sellerEmail}</span>
                </div>
                <div>
                  <span className="text-gray-600">Listed:</span>
                  <span className="ml-2">{formatDate(item.createdAt)}</span>
                </div>
                {item.approvedAt && (
                  <div>
                    <span className="text-gray-600">Approved:</span>
                    <span className="ml-2">{formatDate(item.approvedAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Barcode Information (Admin Only) */}
            {isAdmin && item.barcodeData && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-2">Barcode Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Barcode ID:</span>
                    <span className="ml-2 font-mono text-xs">{item.barcodeData}</span>
                  </div>
                  {item.barcodeGeneratedAt && (
                    <div>
                      <span className="text-gray-600">Generated:</span>
                      <span className="ml-2">{formatDate(item.barcodeGeneratedAt)}</span>
                    </div>
                  )}
                  {item.barcodeImageUrl && (
                    <div className="md:col-span-2">
                      <span className="text-gray-600">Barcode Image:</span>
                      <div className="mt-2">
                        <img 
                          src={item.barcodeImageUrl} 
                          alt={`Barcode: ${item.barcodeData}`}
                          className="max-w-xs bg-white p-2 border rounded"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {!isAdmin && canPurchase ? (
          /* User Actions - Only show for live items */
          <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6">
            <div className="flex gap-3">
              {/* Bookmark Button */}
              <button
                onClick={handleBookmarkToggle}
                disabled={isActionDisabled(`bookmark-${item.id}`)}
                className={`flex-shrink-0 p-3 rounded-lg border-2 transition-all duration-200 ${
                  isBookmarked(item.id)
                    ? 'border-red-500 bg-red-50 text-red-600'
                    : 'border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-500'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isActionProcessing(`bookmark-${item.id}`) ? 'Processing...' : isBookmarked(item.id) ? 'Remove from bookmarks' : 'Add to bookmarks'}
              >
                <svg className="w-6 h-6" fill={isBookmarked(item.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>

              {/* Add to Cart Button */}
              <button
                onClick={handleAddToCart}
                disabled={isCartActionDisabled(`add-to-cart-${item.id}`)}
                className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all duration-200 ${
                  isInCart(item.id)
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                } flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.8 7.2M7 13l-1.8 7.2M7 13h10m0 0v8a2 2 0 01-2 2H9a2 2 0 01-2-2v-8m8 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
                </svg>
                {isCartActionProcessing(`add-to-cart-${item.id}`) ? (
                  <span>Adding...</span>
                ) : isInCart(item.id) ? (
                  <span>In Cart ({getCartItemQuantity(item.id)})</span>
                ) : (
                  <span>Add to Cart - ${item.price}</span>
                )}
              </button>
            </div>

            {/* Purchase Info */}
            <div className="mt-3 text-center">
              <p className="text-xs text-gray-500">
                ✓ Secure checkout with Stripe • ✓ Quality guaranteed • ✓ Local pickup available
              </p>
            </div>
          </div>
        ) : null}

        {/* Status Message for Non-Live Items */}
        {!canPurchase && item.status !== 'sold' && (
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6">
            <div className="text-center">
              <p className="text-gray-600 font-medium">
                {item.status === 'pending' && 'This item is currently under review'}
                {item.status === 'approved' && 'This item is approved and will be available soon'}
                {item.status === 'archived' && 'This item is no longer available'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Check back later or browse our other available items
              </p>
            </div>
          </div>
        )}

        {/* Sold Item Actions */}
        {item.status === 'sold' && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6">
            <div className="space-y-4">
              {/* Sale Information */}
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium text-green-800">Item Sold</span>
                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    item.saleType === 'online' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {item.saleType === 'online' ? '🌐 Online' : '🏪 In-Store'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Sold Price:</span>
                    <span className="ml-2 font-semibold text-green-700">${item.soldPrice || item.price}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Sold Date:</span>
                    <span className="ml-2 font-medium">{formatDate(item.soldAt)}</span>
                  </div>
                  {item.saleTransactionId && (
                    <div className="col-span-2">
                      <span className="text-gray-600">Transaction ID:</span>
                      <span className="ml-2 font-mono text-xs">{item.saleTransactionId}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {/* Barcode Label */}
                {item.barcodeData && (
                  <button
                    onClick={() => {
                      // Generate and print barcode
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html>
                            <head>
                              <title>Barcode Label - ${item.title}</title>
                              <style>
                                body { font-family: Arial, sans-serif; margin: 20px; text-align: center; }
                                .barcode-container { margin: 20px 0; }
                                .item-info { margin-bottom: 20px; }
                              </style>
                            </head>
                            <body>
                              <div class="item-info">
                                <h3>${item.title}</h3>
                                <p>Price: $${item.soldPrice || item.price} | Sold: ${formatDate(item.soldAt)}</p>
                              </div>
                              <div class="barcode-container">
                                <p>Barcode: ${item.barcodeData}</p>
                                <p>Generated: ${formatDate(item.barcodeGeneratedAt) || formatDate(new Date())}</p>
                              </div>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                        printWindow.print();
                      }
                    }}
                    className="flex-1 py-2 px-4 rounded-lg font-medium bg-gray-500 text-white hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print Barcode
                  </button>
                )}

                {/* Shipping Label - Only for online sales */}
                {item.saleType === 'online' && item.buyerInfo && (
                  <button
                    onClick={() => {
                      // Generate and print shipping label
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html>
                            <head>
                              <title>Shipping Label - ${item.title}</title>
                              <style>
                                body { font-family: Arial, sans-serif; margin: 20px; }
                                .shipping-label { border: 2px solid #000; padding: 20px; max-width: 600px; margin: 0 auto; }
                                .from, .to { margin-bottom: 20px; }
                                .to { border-top: 2px solid #000; padding-top: 20px; }
                                .item-details { margin-top: 20px; border-top: 1px solid #ccc; padding-top: 10px; }
                                h3 { margin: 0 0 10px 0; }
                              </style>
                            </head>
                            <body>
                              <div class="shipping-label">
                                <div class="from">
                                  <h3>FROM:</h3>
                                  <p><strong>Summit Gear Exchange</strong><br>
                                  123 Mountain View Drive<br>
                                  Summit, CO 80424<br>
                                  Phone: (555) 123-4567</p>
                                </div>
                                                                 <div class="to">
                                   <h3>TO:</h3>
                                   <p><strong>${item.buyerInfo?.name || 'N/A'}</strong><br>
                                   ${item.buyerInfo?.address || 'N/A'}<br>
                                   ${item.buyerInfo?.city || 'N/A'}, ${item.buyerInfo?.zipCode || 'N/A'}<br>
                                   Phone: ${item.buyerInfo?.phone || 'N/A'}</p>
                                 </div>
                                <div class="item-details">
                                  <p><strong>Item:</strong> ${item.title}</p>
                                  <p><strong>Order ID:</strong> ${item.saleTransactionId || 'N/A'}</p>
                                  <p><strong>Sold Date:</strong> ${formatDate(item.soldAt)}</p>
                                </div>
                              </div>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                        printWindow.print();
                      }
                    }}
                    className="flex-1 py-2 px-4 rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2V7" />
                    </svg>
                    Print Shipping Label
                  </button>
                )}
              </div>

              {/* Buyer Information - Only for online sales */}
              {item.saleType === 'online' && item.buyerInfo && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 mb-2">Buyer Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-600">Name:</span> <span className="ml-1">{item.buyerInfo?.name || 'N/A'}</span></div>
                    <div><span className="text-gray-600">Email:</span> <span className="ml-1">{item.buyerInfo?.email || 'N/A'}</span></div>
                    <div><span className="text-gray-600">Phone:</span> <span className="ml-1">{item.buyerInfo?.phone || 'N/A'}</span></div>
                    <div className="md:col-span-2">
                      <span className="text-gray-600">Address:</span> 
                      <span className="ml-1">{item.buyerInfo?.address || 'N/A'}, {item.buyerInfo?.city || 'N/A'}, {item.buyerInfo?.zipCode || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mark as Sold Modal */}
      {showSoldModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[90]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Mark Item as Sold</h3>
            <p className="text-gray-600 mb-4">Enter the sale price for this item:</p>
            <input
              type="number"
              value={soldPrice}
              onChange={(e) => setSoldPrice(e.target.value)}
              placeholder="Enter sale price"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
              min="0"
              step="0.01"
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancelSold}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                disabled={isProcessingSale}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSold}
                disabled={isProcessingSale || !soldPrice || parseFloat(soldPrice) <= 0}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                {isProcessingSale ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  'Confirm Sale'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[90]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Issue Refund</h3>
            <div className="mb-4">
              <p className="text-gray-600 mb-2">Item: <strong>{item.title}</strong></p>
              <p className="text-gray-600 mb-4">Refund Amount: <strong>${item.soldPrice || item.price}</strong></p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Refund <span className="text-red-500">*</span>
              </label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Please describe why this refund is being issued..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                rows={3}
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Admin Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={refundPassword}
                onChange={(e) => setRefundPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Testing password: 123</p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancelRefund}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                disabled={isProcessingRefund}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRefund}
                disabled={isProcessingRefund || !refundReason.trim() || !refundPassword}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                {isProcessingRefund ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  'Issue Refund'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden canvas for barcode generation */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default ItemDetailModal; 