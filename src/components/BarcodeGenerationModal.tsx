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
      setIsConfirming(false);
      
      // Delay barcode generation to ensure canvas is mounted
      const timeoutId = setTimeout(() => {
        // Double-check canvas is available before generating
        if (canvasRef.current) {
          // Initialize canvas dimensions
          canvasRef.current.width = 300;
          canvasRef.current.height = 100;
          generateBarcode();
        } else {
          console.warn('Canvas not yet available, retrying...');
          // Retry after a short delay
          setTimeout(() => {
            if (canvasRef.current) {
              canvasRef.current.width = 300;
              canvasRef.current.height = 100;
              generateBarcode();
            }
          }, 500);
        }
      }, 100); // Small delay to ensure DOM is ready
      
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, item]);

  const generateBarcode = () => {
    if (!item) {
      console.warn('No item provided for barcode generation');
      return;
    }

    setIsGenerating(true);
    
    try {
      // Generate barcode data with timestamp and item info
      const now = new Date();
      const timestamp = now.getTime().toString();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
      
      // Create a unique barcode combining item ID and timestamp
      const barcodeValue = `${item.id.slice(-8)}${dateStr}${timeStr}`.slice(0, 12);
      
      setBarcodeData(barcodeValue);

      // Retry mechanism for canvas availability with exponential backoff
      const tryGenerateBarcode = (attempt = 1, maxAttempts = 5) => {
        if (!canvasRef.current) {
          if (attempt < maxAttempts) {
            console.warn(`⏳ Canvas not ready, attempt ${attempt}/${maxAttempts}. Retrying in ${100 * attempt}ms...`);
            setTimeout(() => tryGenerateBarcode(attempt + 1, maxAttempts), 100 * attempt);
            return;
          } else {
            console.error('❌ Canvas reference not available after multiple attempts');
            setIsGenerating(false);
            return;
          }
        }

        try {
          console.log('🎨 Canvas available, generating barcode...');
          
          // Set canvas dimensions first
          canvasRef.current.width = 320;
          canvasRef.current.height = 120;

          // Clear the canvas first
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
          
          // Generate the barcode with improved settings
          JsBarcode(canvasRef.current, barcodeValue, {
            format: "CODE128",
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 14,
            margin: 15,
            background: "#ffffff",
            lineColor: "#000000",
            textAlign: "center",
            textPosition: "bottom",
            textMargin: 8
          });
          
          console.log('✅ Barcode generated successfully:', barcodeValue);
          console.log('Canvas dimensions:', canvasRef.current.width, 'x', canvasRef.current.height);
          
          setIsGenerating(false);
          
        } catch (barcodeError) {
          console.error('❌ Error generating barcode image:', barcodeError);
          setIsGenerating(false);
        }
      };

      // Start the generation process with retry logic
      tryGenerateBarcode();
      
    } catch (error) {
      console.error('❌ Error in barcode generation setup:', error);
      setIsGenerating(false);
    }
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
    if (!item || !barcodeData || !canvasRef.current) {
      alert('Cannot approve item: Missing item data, barcode, or canvas element. Please try generating the barcode again.');
      return;
    }

    if (!user) {
      console.error('No authenticated user found');
      alert('Authentication error. Please log in again.');
      return;
    }

    console.log('🚀 Starting barcode confirmation process...');
    console.log('📋 Item details:', {
      id: item.id,
      title: item.title,
      barcodeData: barcodeData
    });
    console.log('👤 User details:', {
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
      console.log('🔐 Setting admin status in Firestore...');
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
      
      console.log('📤 Uploading barcode image to storage...');
      
      // Create blob from canvas with error handling
      const blob = await new Promise<Blob | null>((resolve) => {
        canvasRef.current!.toBlob((blob) => {
          resolve(blob);
        }, 'image/png', 1.0);
      });

      if (!blob) {
        throw new Error('Failed to create barcode image blob from canvas');
      }

      // Upload to Firebase Storage
      const storageRef = ref(storage, `barcodes/${item.id}_${barcodeData}.png`);
      const snapshot = await uploadBytes(storageRef, blob);
      barcodeImageUrl = await getDownloadURL(snapshot.ref);
      console.log('✅ Barcode image uploaded successfully:', barcodeImageUrl);

      // Validate the upload was successful
      if (!barcodeImageUrl || !barcodeImageUrl.startsWith('http')) {
        throw new Error('Invalid barcode image URL received from storage');
      }

      // Save barcode data and approve the item via server API
      console.log('🔄 Updating item via server API...');
      console.log('📝 Update data:', {
        itemId: item.id,
        barcodeData: barcodeData,
        barcodeImageUrl: barcodeImageUrl,
        status: 'approved'
      });
      
      // Use the server API to update the item with barcode data and approve it
      const updateResult = await apiService.updateItemWithBarcode(item.id, {
        barcodeData: barcodeData,
        barcodeImageUrl: barcodeImageUrl,
        status: 'approved'
      });

      console.log('✅ Item updated successfully via API:', updateResult);

      // Log the action
      await logUserAction(user, 'item_approved', `Generated barcode ${barcodeData} and approved item`, item.id, item.title);

      console.log('🎉 Item approval process completed successfully!');
      console.log('📊 Summary:', {
        itemId: item.id,
        itemTitle: item.title,
        barcodeData: barcodeData,
        barcodeImageUrl: barcodeImageUrl,
        status: 'approved'
      });

      // Call the parent callback with updated item data
      const updatedItem = {
        ...item,
        status: 'approved' as const,
        barcodeData: barcodeData,
        barcodeImageUrl: barcodeImageUrl,
        approvedAt: new Date(),
        barcodeGeneratedAt: new Date()
      };
      
      onConfirmPrint(updatedItem, barcodeData);
      onClose();
    } catch (error) {
      console.error('❌ Error updating item with barcode:', error);
      console.error('📋 Full error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error',
        code: (error as any)?.code,
        details: (error as any)?.details,
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`❌ Failed to approve item and generate barcode:

${errorMessage}

📋 Details:
• User: ${user.email}
• Admin Status: ${isAdmin}
• Item ID: ${item.id}
• Barcode Data: ${barcodeData}

Please try again or contact support if the issue persists.`);
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden">
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

        <div className="p-6 overflow-y-auto max-h-[calc(95vh-200px)]">
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
              <div className="bg-white border border-gray-200 rounded-lg p-6 inline-block min-h-[140px] flex flex-col items-center justify-center">
                <canvas 
                  ref={canvasRef} 
                  className="mx-auto"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
                {barcodeData && (
                  <div className="mt-4 text-center">
                    <p className="text-sm font-medium text-gray-800">
                      <strong>Barcode ID:</strong> {barcodeData}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      <strong>Generated:</strong> {new Date().toLocaleString()}
                    </p>
                  </div>
                )}
                {!barcodeData && !isGenerating && (
                  <div className="text-center text-gray-500 py-4">
                    <div className="text-2xl mb-2">⚠️</div>
                    <p className="text-sm">Barcode generation failed</p>
                    <button
                      onClick={generateBarcode}
                      className="mt-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm"
                    >
                      Retry Generation
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions - Fixed at bottom */}
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
                Print Label
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