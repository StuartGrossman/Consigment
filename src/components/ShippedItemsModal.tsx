import React, { useState, useEffect, useRef } from 'react';
import { ConsignmentItem } from '../types';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../hooks/useAuth';
import { logUserAction } from '../services/firebaseService';
import JsBarcode from 'jsbarcode';

interface ShippedItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemClick?: (item: ConsignmentItem) => void;
}

const ShippedItemsModal: React.FC<ShippedItemsModalProps> = ({ isOpen, onClose, onItemClick }) => {
  const [shippedItems, setShippedItems] = useState<ConsignmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ConsignmentItem | null>(null);
  const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState<ConsignmentItem | null>(null);
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchShippedItems();
    }
  }, [isOpen]);

  const fetchShippedItems = async () => {
    setLoading(true);
    try {
      const itemsRef = collection(db, 'items');
      const q = query(
        itemsRef, 
        where('status', '==', 'sold'),
        where('saleType', '==', 'online'),
        where('fulfillmentMethod', '==', 'shipping')
      );
      const querySnapshot = await getDocs(q);
      const items: ConsignmentItem[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Only include items that have been shipped
        if (data.shippedAt) {
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            soldAt: data.soldAt?.toDate() || new Date(),
            shippedAt: data.shippedAt?.toDate(),
            barcodeGeneratedAt: data.barcodeGeneratedAt?.toDate(),
          } as ConsignmentItem);
        }
      });

      // Sort by most recent first
      items.sort((a, b) => {
        const aTime = a.shippedAt || a.soldAt || a.createdAt;
        const bTime = b.shippedAt || b.soldAt || b.createdAt;
        return bTime.getTime() - aTime.getTime();
      });

      setShippedItems(items);
    } catch (error) {
      console.error('Error fetching shipped items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewBarcode = (item: ConsignmentItem) => {
    setSelectedBarcode(item);
    setShowBarcodeModal(true);
  };

  const handleViewDetails = (item: ConsignmentItem) => {
    if (onItemClick) {
      onItemClick(item);
    }
  };

  const reprintShippingLabel = (item: ConsignmentItem) => {
    if (!item.buyerInfo || !item.trackingNumber) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Shipping Label - ${item.title}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              line-height: 1.4;
            }
            .shipping-label {
              border: 2px solid #000;
              padding: 20px;
              max-width: 600px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 1px solid #000;
              padding-bottom: 15px;
              margin-bottom: 15px;
            }
            .section {
              margin: 15px 0;
            }
            .section-title {
              font-weight: bold;
              font-size: 14px;
              margin-bottom: 5px;
              text-transform: uppercase;
            }
            .address-block {
              border: 1px solid #000;
              padding: 10px;
              margin: 10px 0;
            }
            .tracking-section {
              text-align: center;
              margin: 20px 0;
            }
            .item-details {
              background-color: #f5f5f5;
              padding: 10px;
              margin: 10px 0;
            }
          </style>
        </head>
        <body>
          <div class="shipping-label">
            <div class="header">
              <h2>Summit Gear Exchange</h2>
              <p>Shipping Label - REPRINT</p>
            </div>
            
            <div class="section">
              <div class="section-title">Ship To:</div>
              <div class="address-block">
                <strong>${item.buyerInfo.name}</strong><br>
                ${item.buyerInfo.address}<br>
                ${item.buyerInfo.city}, ${item.buyerInfo.zipCode}<br>
                Phone: ${item.buyerInfo.phone}<br>
                Email: ${item.buyerInfo.email}
              </div>
            </div>

            <div class="section">
              <div class="section-title">Ship From:</div>
              <div class="address-block">
                <strong>Summit Gear Exchange</strong><br>
                123 Mountain View Drive<br>
                Boulder, CO 80301<br>
                Phone: (303) 555-0123
              </div>
            </div>

            <div class="tracking-section">
              <div class="section-title">Tracking Number:</div>
              <h3>${item.trackingNumber}</h3>
              ${item.barcodeImageUrl ? `<img src="${item.barcodeImageUrl}" alt="Tracking Barcode" />` : ''}
            </div>

            <div class="item-details">
              <div class="section-title">Item Details:</div>
              <strong>Item:</strong> ${item.title}<br>
              <strong>Price:</strong> $${item.soldPrice || item.price}<br>
              <strong>Category:</strong> ${item.category || 'N/A'}<br>
              <strong>Brand:</strong> ${item.brand || 'N/A'}<br>
              <strong>Size:</strong> ${item.size || 'N/A'}<br>
              <strong>Order Date:</strong> ${item.soldAt?.toLocaleDateString() || 'N/A'}<br>
              <strong>Shipped Date:</strong> ${item.shippedAt?.toLocaleDateString() || 'N/A'}
            </div>

            <div class="section">
              <div class="section-title">Shipping Status:</div>
              <p>✅ SHIPPED - ${item.shippedAt?.toLocaleDateString()}</p>
            </div>
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden">
          <div className="sticky top-0 bg-white p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Shipped Items</h2>
                <p className="text-gray-600 mt-1">Online orders that have been shipped ({shippedItems.length})</p>
              </div>
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
              </div>
            ) : shippedItems.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">📦</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Shipped Items</h3>
                <p className="text-gray-600">No online orders have been shipped yet.</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seller</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Buyer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tracking</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shipped Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {shippedItems.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {item.images && item.images[0] && (
                                <img className="h-12 w-12 rounded-lg object-cover mr-3" src={item.images[0]} alt={item.title} />
                              )}
                              <div>
                                <div className="text-sm font-medium text-gray-900 max-w-xs truncate">{item.title}</div>
                                <div className="flex items-center gap-1 mt-1">
                                  <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                                  <span className="text-xs text-yellow-600 font-medium">Shipped</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{item.sellerName}</div>
                            <div className="text-xs text-gray-500">{item.sellerEmail}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{item.buyerInfo?.name || 'N/A'}</div>
                            <div className="text-xs text-gray-500">{item.buyerInfo?.email || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                            {formatCurrency(item.soldPrice || item.price)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{item.trackingNumber || 'N/A'}</div>
                            {item.trackingNumber && (
                              <div className="text-xs text-gray-500">Track: TRK-{item.trackingNumber.slice(-4)}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {item.shippedAt?.toLocaleDateString() || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex flex-col space-y-2">
                              <button
                                onClick={() => handleViewDetails(item)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors text-center"
                              >
                                View Details
                              </button>
                              {item.barcodeImageUrl && (
                                <button
                                  onClick={() => handleViewBarcode(item)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors text-center"
                                >
                                  View Barcode
                                </button>
                              )}
                              <button
                                onClick={() => reprintShippingLabel(item)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500 text-white hover:bg-green-600 transition-colors text-center"
                              >
                                Reprint Label
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Hidden canvas for barcode generation */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      </div>

      {/* Barcode Viewing Modal */}
      {showBarcodeModal && selectedBarcode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Item Barcode</h3>
                  <p className="text-gray-600">{selectedBarcode.title}</p>
                </div>
                <button
                  onClick={() => setShowBarcodeModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6 text-center">
              {selectedBarcode.barcodeImageUrl ? (
                <div className="space-y-4">
                  <img 
                    src={selectedBarcode.barcodeImageUrl} 
                    alt="Item Barcode" 
                    className="mx-auto border border-gray-200 rounded-lg p-4 bg-white max-w-full h-auto"
                  />
                  <div className="text-sm text-gray-600">
                    <p><strong>Barcode ID:</strong> {selectedBarcode.barcodeData}</p>
                    <p><strong>Generated:</strong> {selectedBarcode.barcodeGeneratedAt?.toLocaleDateString()}</p>
                  </div>
                  <div className="flex justify-center gap-3 mt-4">
                    <button
                      onClick={() => {
                        if (selectedBarcode.barcodeImageUrl) {
                          const printWindow = window.open('', '_blank');
                          if (printWindow) {
                            printWindow.document.write(`
                              <html>
                                <head>
                                  <title>Barcode - ${selectedBarcode.title}</title>
                                  <style>
                                    body { font-family: Arial, sans-serif; text-align: center; margin: 20px; }
                                    .barcode-container { margin: 20px 0; }
                                    img { max-width: 100%; height: auto; }
                                  </style>
                                </head>
                                <body>
                                  <h2>${selectedBarcode.title}</h2>
                                  <div class="barcode-container">
                                    <img src="${selectedBarcode.barcodeImageUrl}" alt="Barcode" />
                                  </div>
                                  <p>Barcode ID: ${selectedBarcode.barcodeData}</p>
                                  <p>Generated: ${selectedBarcode.barcodeGeneratedAt?.toLocaleDateString()}</p>
                                </body>
                              </html>
                            `);
                            printWindow.document.close();
                            printWindow.focus();
                            printWindow.print();
                          }
                        }
                      }}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      Print Barcode
                    </button>
                    <button
                      onClick={() => setShowBarcodeModal(false)}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-8">
                  <div className="text-gray-400 text-4xl mb-4">📊</div>
                  <p className="text-gray-500">No barcode image available</p>
                  <button
                    onClick={() => setShowBarcodeModal(false)}
                    className="mt-4 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ShippedItemsModal; 