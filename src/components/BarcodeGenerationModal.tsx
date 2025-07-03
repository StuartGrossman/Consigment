import React, { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { ConsignmentItem } from '../types';
import { doc, updateDoc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { db, storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { logUserAction } from '../services/firebaseService';
import { useAuth } from '../hooks/useAuth';
import { apiService } from '../services/apiService';

interface BarcodeGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ConsignmentItem | null;
  onConfirmPrint: (item: ConsignmentItem, barcodeData: string) => void;
}

const BarcodeGenerationModal: React.FC<BarcodeGenerationModalProps> = ({ 
  isOpen, 
  onClose, 
  item, 
  onConfirmPrint 
}) => {
  const [barcodeData, setBarcodeData] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (isOpen && item) {
      // Initialize canvas dimensions before generating barcode
      if (canvasRef.current) {
        canvasRef.current.width = 300;
        canvasRef.current.height = 100;
      }
      
      generateBarcode();
      setIsConfirming(false);
    }
  }, [isOpen, item]);

  const generateBarcode = () => {
    if (!item) return;

    setIsGenerating(true);
    
    // Add a brief delay for better UX progression
    setTimeout(() => {
      // Generate barcode data with timestamp and item info
      const now = new Date();
      const timestamp = now.getTime().toString();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
      
      // Create a unique barcode combining item ID and timestamp
      const barcodeValue = `${item.id.slice(-8)}${dateStr}${timeStr}`.slice(0, 12);
      
      setBarcodeData(barcodeValue);

      // Generate barcode using jsbarcode
      if (canvasRef.current) {
        try {
          // Clear the canvas first
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
          
          // Generate the barcode
          JsBarcode(canvasRef.current, barcodeValue, {
            format: "CODE128",
            width: 2,
            height: 80,
            displayValue: true,
            fontSize: 12,
            margin: 10,
            background: "#ffffff",
            lineColor: "#000000"
          });
          
          console.log('✅ Barcode generated successfully:', barcodeValue);
          setIsGenerating(false);
        } catch (error) {
          console.error('❌ Error generating barcode:', error);
          setIsGenerating(false);
          
          // Show error message to user
          alert('Error generating barcode. Please try again.');
        }
      } else {
        console.error('❌ Canvas reference not available');
        setIsGenerating(false);
      }
    }, 800); // Brief delay for smooth UX
  };

  const handlePrint = () => {
    if (!canvasRef.current || !item) return;

    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png');
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Item Barcode - ${item.title}</title>
          <style>
            @media print {
              body { margin: 0; }
              .no-print { display: none !important; }
            }
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              text-align: center;
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
            .header h2 {
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
              background-color: #f9f9f9;
              padding: 15px;
              border: 1px solid #ccc;
              border-radius: 5px;
              text-align: left;
            }
            .item-info h3 {
              margin: 0 0 15px 0;
              font-size: 18px;
              color: #000;
              text-align: center;
              font-weight: bold;
            }
            .detail-row {
              margin: 5px 0;
              display: flex;
              justify-content: space-between;
              border-bottom: 1px dotted #ccc;
              padding: 5px 0;
            }
            .label {
              font-weight: bold;
              color: #333;
            }
            .value {
              color: #000;
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
              <h2>🏔️ Summit Gear Exchange</h2>
              <p>Mountain Consignment Store</p>
              <p>Quality Outdoor Equipment</p>
            </div>
            
            <div class="item-info">
              <h3>${item.title}</h3>
              <div class="detail-row">
                <span class="label">Price:</span>
                <span class="value">$${item.price}</span>
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
              <div class="detail-row">
                <span class="label">Status:</span>
                <span class="value">${item.status.toUpperCase()}</span>
              </div>
            </div>
            
            <div class="barcode-container">
              <h4 style="margin: 0 0 15px 0; color: #333;">SCAN BARCODE</h4>
              <img src="${dataURL}" alt="Barcode: ${barcodeData}" />
              <div class="barcode-info">
                <div class="barcode-id">${barcodeData}</div>
                <p style="margin: 5px 0; font-size: 12px;">Generated: ${new Date().toLocaleString()}</p>
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
              <p><strong>Barcode ID:</strong> ${barcodeData}</p>
              <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
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
  };

  const handleConfirmAndApprove = async () => {
    if (!item || !barcodeData || !canvasRef.current) return;

    if (!user) {
      console.error('No authenticated user found');
      alert('Authentication error. Please log in again.');
      return;
    }

    console.log('Starting barcode confirmation process...');
    console.log('User details:', {
      uid: user.uid,
      email: user.email,
      isAdmin: isAdmin
    });

    if (!isAdmin) {
      console.error('User does not have admin privileges');
      alert('Admin privileges required to approve items. Please contact an administrator.');
      return;
    }

    setIsConfirming(true);
    
    try {
      // Ensure admin status is set in Firestore
      console.log('Setting admin status in Firestore...');
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        isAdmin: true,
        email: user.email,
        displayName: user.displayName,
        lastSignIn: new Date()
      }, { merge: true });
      console.log('✅ Admin status confirmed in Firestore');

      // Generate and upload barcode image to Firebase Storage
      let barcodeImageUrl = '';
      
      console.log('Uploading barcode image...');
      await new Promise<void>((resolve) => {
        canvasRef.current!.toBlob(async (blob) => {
          if (blob) {
            try {
              const storageRef = ref(storage, `barcodes/${item.id}_${barcodeData}.png`);
              await uploadBytes(storageRef, blob);
              barcodeImageUrl = await getDownloadURL(storageRef);
              console.log('Barcode image uploaded successfully:', barcodeImageUrl);
            } catch (error) {
              console.error('Error uploading barcode image:', error);
            }
          }
          resolve();
        }, 'image/png');
      });

      // Save barcode data and approve the item via server API
      console.log('Attempting to update item via server API...');
      console.log('Item ID:', item.id);
      console.log('Barcode data:', barcodeData);
      console.log('Barcode image URL:', barcodeImageUrl);
      console.log('Current user admin status:', isAdmin);
      
      // Use the server API to update the item with barcode data and approve it
      await apiService.updateItemWithBarcode(item.id, {
        barcodeData: barcodeData,
        barcodeImageUrl: barcodeImageUrl,
        status: 'approved'
      });

      console.log('Item updated successfully');

      // Log the action
      await logUserAction(user, 'item_approved', 'Generated barcode and approved item', item.id, item.title);

      // Call the parent callback
      onConfirmPrint(item, barcodeData);
      onClose();
    } catch (error) {
      console.error('Error updating item with barcode:', error);
      console.error('Full error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error',
        code: (error as any)?.code,
        details: (error as any)?.details
      });
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to confirm item approval: ${errorMessage}\n\nUser: ${user.email}\nAdmin Status: ${isAdmin}\nItem ID: ${item.id}\n\nPlease try again or contact support if the issue persists.`);
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Approve Item</h2>
              <p className="text-gray-600 mt-1">Generating barcode label that must be printed. After printing, the item will be available to employees for 3 days before going live to all customers.</p>
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

        <div className="p-6 overflow-y-auto">
          {/* Item Information */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">{item.title}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="font-medium">Price:</span> ${item.price}</div>
              <div><span className="font-medium">Category:</span> {item.category}</div>
              <div><span className="font-medium">Brand:</span> {item.brand || 'N/A'}</div>
              <div><span className="font-medium">Size:</span> {item.size || 'N/A'}</div>
              <div><span className="font-medium">Seller:</span> {item.sellerName}</div>
              <div><span className="font-medium">Status:</span> {item.status}</div>
            </div>
          </div>

          {/* Barcode Generation */}
          <div className="text-center mb-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Generated Barcode</h4>
            
            {isGenerating ? (
              <div className="flex flex-col items-center py-8">
                <div className="relative">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-200 border-t-orange-500"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h4" />
                    </svg>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <div className="text-lg font-medium text-gray-800">Generating Barcode...</div>
                  <div className="text-sm text-gray-600 mt-1">Creating unique identifier for this item</div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-6 inline-block">
                <canvas ref={canvasRef} className="mx-auto" />
                {barcodeData && (
                  <div className="mt-3 text-sm text-gray-600">
                    <p><strong>Barcode ID:</strong> {barcodeData}</p>
                    <p><strong>Generated:</strong> {new Date().toLocaleString()}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Print Section */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-gray-800 mb-2">Print Label</h4>
                <p className="text-sm text-gray-600">
                  Print this barcode label and attach it to the item before adding to inventory.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <button
                  onClick={handlePrint}
                  disabled={isGenerating || !barcodeData}
                  className="px-6 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white disabled:text-gray-500"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
              </div>
            </div>


          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
            >
              Cancel
            </button>
            <div className="flex gap-3">
              <button
                onClick={handlePrint}
                disabled={isGenerating || !barcodeData}
                className="px-6 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white disabled:text-gray-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print
              </button>
              <button
                onClick={handleConfirmAndApprove}
                disabled={isConfirming || isGenerating || !barcodeData}
                className="px-6 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-500"
              >
                {isConfirming ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Sending to Approved...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Send to Approved
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodeGenerationModal; 