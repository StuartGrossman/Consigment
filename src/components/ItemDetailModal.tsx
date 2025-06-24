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
    removeFromCart,
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

  const handleCartAction = async () => {
    if (isInCart(item.id)) {
      await removeFromCart(item.id, user);
      
      // Show a brief success message
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg';
      toast.textContent = `${item.title} removed from cart!`;
      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 2000);
    } else {
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
    }
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
      // Show error toast
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg';
      toast.textContent = 'Please provide a reason for the refund.';
      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 3000);
      return;
    }
    
    if (refundPassword !== '123') {
      // Show error toast
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg';
      toast.textContent = 'Invalid password. Please enter the correct password.';
      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 3000);
      return;
    }

    setIsProcessingRefund(true);
    try {
      // Create refund record with proper fallback values
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
        sellerName: item.sellerName || 'Unknown Seller',
        sellerId: item.sellerId || 'unknown_seller' // Add fallback for sellerId
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
      // Show error toast
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg';
      toast.textContent = 'Error processing refund. Please try again.';
      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 3000);
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
              @media print {
                body { margin: 0; }
                .no-print { display: none !important; }
                .print-break { page-break-after: always; }
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
              .header h1 { 
                margin: 0; 
                font-size: 24px; 
                color: #000;
                font-weight: bold;
              }
              .header p { 
                margin: 5px 0 0 0; 
                font-size: 14px; 
                color: #666; 
              }
              .item-info { 
                margin-bottom: 20px; 
                background-color: #f8f9fa; 
                padding: 15px; 
                border: 1px solid #ddd;
                border-radius: 5px;
              }
              .item-info h3 { 
                margin: 0 0 15px 0; 
                font-size: 18px; 
                color: #000;
                text-align: center;
                font-weight: bold;
              }
              .detail-grid { 
                display: grid; 
                grid-template-columns: 1fr 1fr; 
                gap: 10px; 
              }
              .detail-row { 
                display: flex; 
                justify-content: space-between; 
                padding: 5px 0;
                border-bottom: 1px dotted #ccc;
              }
              .label { 
                font-weight: bold; 
                color: #333; 
              }
              .value { 
                color: #000; 
                font-weight: normal;
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
              .barcode-info { 
                margin-top: 15px; 
                text-align: center;
              }
              .barcode-id { 
                font-family: 'Courier New', monospace; 
                font-size: 16px; 
                font-weight: bold; 
                background-color: #f0f0f0; 
                padding: 8px; 
                border: 1px solid #ccc;
                display: inline-block;
                margin: 10px 0;
              }
              .print-info { 
                margin-top: 30px; 
                border-top: 1px solid #ccc; 
                padding-top: 15px; 
                font-size: 12px; 
                color: #666; 
                text-align: center;
              }
              .instructions { 
                margin-top: 20px; 
                padding: 15px; 
                background-color: #fff3cd; 
                border: 1px solid #ffeaa7; 
                border-radius: 5px;
                font-size: 12px;
              }
              .instructions h4 { 
                margin: 0 0 10px 0; 
                color: #856404; 
              }
              .instructions ul { 
                margin: 0; 
                padding-left: 20px; 
              }
              .instructions li { 
                margin: 5px 0; 
                color: #856404; 
              }
            </style>
          </head>
          <body>
            <div class="label-container">
              <div class="header">
                <h1>🏔️ Summit Gear Exchange</h1>
                <p>Mountain Consignment Store</p>
                <p>Quality Outdoor Equipment</p>
              </div>
              
              <div class="item-info">
                <h3>${item.title}</h3>
                <div class="detail-grid">
                  <div class="detail-row">
                    <span class="label">Price:</span>
                    <span class="value">$${item.price}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Status:</span>
                    <span class="value">${item.status.toUpperCase()}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Category:</span>
                    <span class="value">${item.category}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Brand:</span>
                    <span class="value">${item.brand || 'N/A'}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Size:</span>
                    <span class="value">${item.size || 'N/A'}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Color:</span>
                    <span class="value">${item.color || 'N/A'}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Condition:</span>
                    <span class="value">${item.condition || 'N/A'}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Seller:</span>
                    <span class="value">${item.sellerName}</span>
                  </div>
                </div>
              </div>
              
              <div class="barcode-container">
                <h4 style="margin: 0 0 15px 0; color: #333;">SCAN BARCODE</h4>
                <img src="${barcodeImageUrl}" alt="Barcode: ${item.barcodeData}" />
                <div class="barcode-info">
                  <div class="barcode-id">${item.barcodeData}</div>
                  <p style="margin: 5px 0; font-size: 12px;">Generated: ${formatDate(item.barcodeGeneratedAt) || formatDate(new Date())}</p>
                </div>
              </div>
              
              <div class="instructions no-print">
                <h4>📋 Barcode Usage Instructions:</h4>
                <ul>
                  <li>Use this barcode to quickly identify and track this item</li>
                  <li>Scan with any barcode scanner or smartphone app</li>
                  <li>Keep this label with the item during storage and handling</li>
                  <li>Reference the Barcode ID when communicating about this item</li>
                </ul>
              </div>
              
              <div class="print-info">
                <p><strong>Barcode ID:</strong> ${item.barcodeData}</p>
                <p><strong>Generated:</strong> ${formatDate(item.barcodeGeneratedAt) || formatDate(new Date())}</p>
                <p><strong>Printed:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Item ID:</strong> ${item.id}</p>
                <p style="margin-top: 15px; font-style: italic;">Summit Gear Exchange - Your Mountain Equipment Marketplace</p>
              </div>
            </div>
            
            <script>
              // Auto-print when page loads
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 500);
              };
              
              // Close window after printing
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
    <div className="modal-backdrop flex items-center justify-center p-4">
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

        {/* Scrollable Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6">
            {/* Barcode Section - Prominent at Top for Admins */}
            {isAdmin && item.barcodeData && (
              <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                    </svg>
                    Item Barcode
                  </h3>
                  {item.barcodeImageUrl && (
                    <button
                      onClick={() => printBarcode(item.barcodeImageUrl!)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Print Barcode
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
                  {/* Barcode Image */}
                  {item.barcodeImageUrl && (
                    <div className="flex justify-center lg:justify-start">
                      <div className="bg-white p-4 rounded-lg border-2 border-blue-200 shadow-sm">
                        <img 
                          src={item.barcodeImageUrl} 
                          alt={`Barcode: ${item.barcodeData}`}
                          className="max-w-full h-auto max-h-24"
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Barcode Information */}
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium text-blue-700">Barcode ID:</span>
                      <div className="mt-1 p-2 bg-white rounded border border-blue-200">
                        <span className="font-mono text-sm text-gray-800">{item.barcodeData}</span>
                      </div>
                    </div>
                    {item.barcodeGeneratedAt && (
                      <div>
                        <span className="text-sm font-medium text-blue-700">Generated:</span>
                        <div className="mt-1 text-sm text-gray-700">{formatDate(item.barcodeGeneratedAt)}</div>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          // Copy barcode to clipboard
                          navigator.clipboard.writeText(item.barcodeData!);
                          const toast = document.createElement('div');
                          toast.className = 'fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg';
                          toast.textContent = 'Barcode copied to clipboard!';
                          document.body.appendChild(toast);
                          setTimeout(() => {
                            if (document.body.contains(toast)) {
                              document.body.removeChild(toast);
                            }
                          }, 2000);
                        }}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors text-sm flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy ID
                      </button>
                      {item.barcodeImageUrl && (
                        <button
                          onClick={() => printBarcode(item.barcodeImageUrl!)}
                          className="px-3 py-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors text-sm flex items-center gap-1"
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
              {/* Seller Information - Admin Only */}
              {isAdmin && (
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
              )}


            </div>

            {/* Sold Item Information - Additional Details */}
            {item.status === 'sold' && (
              <div className="mt-6 space-y-4">
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

                {/* Buyer Information */}
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

              {/* Cart Action Button */}
              <button
                onClick={handleCartAction}
                disabled={isCartActionDisabled(`cart-action-${item.id}`)}
                className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all duration-200 ${
                  isInCart(item.id)
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                } flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l-1 7H6l-1-7z" />
                </svg>
                {isCartActionProcessing(`cart-action-${item.id}`) ? (
                  <span>Processing...</span>
                ) : isInCart(item.id) ? (
                  <span>Remove from Cart</span>
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                    </svg>
                    Print Barcode Label
                  </button>
                )}

                {/* Shipping Label */}
                {item.saleType === 'online' && item.buyerInfo && (
                  <button
                    onClick={() => {
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
                                  <p><strong>Order Total:</strong> $${item.soldPrice || item.price}</p>
                                  <p><strong>Date:</strong> ${formatDate(item.soldAt)}</p>
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Print Shipping Label
                  </button>
                )}

                {/* Issue Refund Button */}
                <button
                  onClick={() => setShowRefundModal(true)}
                  className="py-2 px-4 rounded-lg font-medium bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
                  </svg>
                  Issue Refund
                </button>
              </div>
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