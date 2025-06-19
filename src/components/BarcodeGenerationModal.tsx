import React, { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { ConsignmentItem } from '../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { logUserAction } from '../services/firebaseService';
import { useAuth } from '../hooks/useAuth';

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
  const { user } = useAuth();

  useEffect(() => {
    if (isOpen && item) {
      generateBarcode();
      setIsConfirming(false);
    }
  }, [isOpen, item]);

  const generateBarcode = () => {
    if (!item) return;

    setIsGenerating(true);
    
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
        JsBarcode(canvasRef.current, barcodeValue, {
          format: "CODE128",
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 12,
          margin: 10
        });
        setIsGenerating(false);
      } catch (error) {
        console.error('Error generating barcode:', error);
        setIsGenerating(false);
      }
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
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              text-align: center;
            }
            .item-info {
              margin-bottom: 20px;
              border: 1px solid #ccc;
              padding: 15px;
              background-color: #f9f9f9;
            }
            .barcode-container {
              margin: 20px 0;
            }
            .print-info {
              margin-top: 20px;
              font-size: 12px;
              color: #666;
            }
            h2 {
              color: #333;
              margin-bottom: 10px;
            }
            .detail-row {
              margin: 5px 0;
              text-align: left;
            }
            .label {
              font-weight: bold;
              display: inline-block;
              width: 100px;
            }
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
              <span class="label">Approved:</span> ${new Date().toLocaleString()}
            </div>
          </div>
          <div class="barcode-container">
            <img src="${dataURL}" alt="Barcode: ${barcodeData}" />
          </div>
          <div class="print-info">
            <p>Barcode: ${barcodeData}</p>
            <p>Generated: ${new Date().toLocaleString()}</p>
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleConfirmAndApprove = async () => {
    if (!item || !barcodeData || !canvasRef.current) return;

    setIsConfirming(true);
    
    try {
      // Generate and upload barcode image to Firebase Storage
      let barcodeImageUrl = '';
      
      await new Promise<void>((resolve) => {
        canvasRef.current!.toBlob(async (blob) => {
          if (blob) {
            try {
              const storageRef = ref(storage, `barcodes/${item.id}_${barcodeData}.png`);
              await uploadBytes(storageRef, blob);
              barcodeImageUrl = await getDownloadURL(storageRef);
            } catch (error) {
              console.error('Error uploading barcode image:', error);
            }
          }
          resolve();
        }, 'image/png');
      });

      // Save barcode data and approve the item
      const itemRef = doc(db, 'items', item.id);
      await updateDoc(itemRef, {
        barcodeData: barcodeData,
        barcodeGeneratedAt: new Date(),
        barcodeImageUrl: barcodeImageUrl,
        printConfirmedAt: new Date(),
        status: 'approved',
        approvedAt: new Date()
      });

      // Log the action
      await logUserAction(user, 'item_approved', 'Generated barcode and approved item', item.id, item.title);

      // Call the parent callback
      onConfirmPrint(item, barcodeData);
      onClose();
    } catch (error) {
      console.error('Error updating item with barcode:', error);
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
              <h2 className="text-2xl font-bold text-gray-800">Generate Item Barcode</h2>
              <p className="text-gray-600 mt-1">Create and print barcode before approving item</p>
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
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                <span className="ml-2 text-gray-600">Generating barcode...</span>
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
                    Print Label
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
            <button
              onClick={handleConfirmAndApprove}
              disabled={isConfirming || isGenerating || !barcodeData}
              className="px-6 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-500"
            >
              {isConfirming ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Confirming...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Confirm Printed
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodeGenerationModal; 