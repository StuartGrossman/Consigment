import React, { useState, useRef, useEffect } from 'react';
import { ConsignmentItem } from '../types';
import { useAuth } from '../hooks/useAuth';
import JsBarcode from 'jsbarcode';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { apiService } from '../services/apiService';

interface BulkBarcodeGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ConsignmentItem[];
  onComplete: (processedItems: ConsignmentItem[]) => void;
}

interface ProcessedItem {
  item: ConsignmentItem;
  barcodeData: string;
  barcodeImageUrl: string;
  status: 'pending' | 'generating' | 'uploading' | 'completing' | 'completed' | 'error';
  error?: string;
}

const BulkBarcodeGenerationModal: React.FC<BulkBarcodeGenerationModalProps> = ({ 
  isOpen, 
  onClose, 
  items, 
  onComplete 
}) => {
  const { user } = useAuth();
  const [processedItems, setProcessedItems] = useState<ProcessedItem[]>([]);
  const [currentStep, setCurrentStep] = useState<'preparing' | 'processing' | 'completed'>('preparing');
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isOpen && items.length > 0) {
      initializeProcessedItems();
    }
  }, [isOpen, items]);

  const initializeProcessedItems = () => {
    const initialItems: ProcessedItem[] = items.map(item => ({
      item,
      barcodeData: generateBarcodeData(item),
      barcodeImageUrl: '',
      status: 'pending'
    }));
    setProcessedItems(initialItems);
    setCurrentStep('preparing');
    setCurrentItemIndex(0);
  };

  const generateBarcodeData = (item: ConsignmentItem): string => {
    const timestamp = Date.now().toString().slice(-8);
    const itemIdShort = item.id.slice(-4);
    return `CSG${timestamp}${itemIdShort}`;
  };

  const startBulkProcessing = async () => {
    setIsProcessing(true);
    setCurrentStep('processing');
    
    for (let i = 0; i < processedItems.length; i++) {
      setCurrentItemIndex(i);
      await processItem(i);
    }
    
    setCurrentStep('completed');
    setIsProcessing(false);
  };

  const processItem = async (index: number): Promise<void> => {
    const processedItem = processedItems[index];
    
    try {
      // Update status to generating
      updateItemStatus(index, 'generating');
      
      // Generate barcode image
      const barcodeImageUrl = await generateBarcodeImage(processedItem.barcodeData, processedItem.item.id);
      
      // Update status to uploading
      updateItemStatus(index, 'uploading');
      
      // Update status to completing
      updateItemStatus(index, 'completing');
      
      // Update item in database with barcode
      await apiService.updateItemWithBarcode(processedItem.item.id, {
        barcodeData: processedItem.barcodeData,
        barcodeImageUrl: barcodeImageUrl,
        status: 'approved'
      });
      
      // Update processed item with image URL and mark as completed
      setProcessedItems(prev => prev.map((item, i) => 
        i === index ? { ...item, barcodeImageUrl, status: 'completed' } : item
      ));
      
    } catch (error) {
      console.error(`Error processing item ${processedItem.item.id}:`, error);
      updateItemStatus(index, 'error', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const updateItemStatus = (index: number, status: ProcessedItem['status'], error?: string) => {
    setProcessedItems(prev => prev.map((item, i) => 
      i === index ? { ...item, status, error } : item
    ));
  };

  const generateBarcodeImage = async (barcodeData: string, itemId: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!canvasRef.current) {
        reject(new Error('Canvas not available'));
        return;
      }

      try {
        // Generate barcode on canvas
        JsBarcode(canvasRef.current, barcodeData, {
          format: 'CODE128',
          width: 2,
          height: 100,
          displayValue: true,
          fontSize: 14,
          margin: 10
        });

        // Convert canvas to blob and upload
        canvasRef.current.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error('Failed to generate barcode image'));
            return;
          }

          try {
            const storageRef = ref(storage, `barcodes/${itemId}_${barcodeData}.png`);
            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);
            resolve(downloadURL);
          } catch (error) {
            reject(error);
          }
        }, 'image/png');
      } catch (error) {
        reject(error);
      }
    });
  };

  const handleComplete = () => {
    const completedItems = processedItems
      .filter(item => item.status === 'completed')
      .map(item => item.item);
    onComplete(completedItems);
  };

  const printAllBarcodes = () => {
    const completedItems = processedItems.filter(item => item.status === 'completed' && item.barcodeImageUrl);
    
    if (completedItems.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bulk Barcode Labels</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .barcode-item { 
              margin-bottom: 30px; 
              page-break-inside: avoid;
              border: 1px solid #ddd;
              padding: 15px;
              border-radius: 8px;
            }
            .item-title { font-weight: bold; margin-bottom: 10px; font-size: 14px; }
            .item-details { font-size: 12px; color: #666; margin-bottom: 10px; }
            .barcode-image { text-align: center; }
            .barcode-data { text-align: center; font-family: monospace; margin-top: 5px; font-size: 12px; }
            @media print {
              body { margin: 0; }
              .barcode-item { page-break-inside: avoid; margin-bottom: 20px; }
            }
          </style>
        </head>
        <body>
          <h1>Barcode Labels - ${completedItems.length} Items</h1>
          ${completedItems.map(processedItem => `
            <div class="barcode-item">
              <div class="item-title">${processedItem.item.title}</div>
              <div class="item-details">
                ${processedItem.item.brand ? `Brand: ${processedItem.item.brand} | ` : ''}
                ${processedItem.item.category ? `Category: ${processedItem.item.category} | ` : ''}
                Price: $${processedItem.item.price}
              </div>
              <div class="barcode-image">
                <img src="${processedItem.barcodeImageUrl}" alt="Barcode" style="max-width: 200px;" />
              </div>
              <div class="barcode-data">${processedItem.barcodeData}</div>
            </div>
          `).join('')}
          
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 1000);
            };
            window.onafterprint = function() {
              window.close();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
  };

  if (!isOpen) return null;

  const completedCount = processedItems.filter(item => item.status === 'completed').length;
  const errorCount = processedItems.filter(item => item.status === 'error').length;
  const progressPercentage = processedItems.length > 0 ? (completedCount / processedItems.length) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Bulk Barcode Generation</h2>
              <p className="text-gray-600 mt-1">
                {currentStep === 'preparing' && `Ready to process ${items.length} items`}
                {currentStep === 'processing' && `Processing ${currentItemIndex + 1} of ${items.length} items...`}
                {currentStep === 'completed' && `Completed: ${completedCount} successful, ${errorCount} failed`}
              </p>
            </div>
            {currentStep === 'completed' && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 p-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {/* Progress Bar */}
          {currentStep === 'processing' && (
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Overall Progress</span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Items List */}
          <div className="max-h-96 overflow-y-auto space-y-3">
            {processedItems.map((processedItem, index) => (
              <div
                key={processedItem.item.id}
                className={`flex items-center p-4 rounded-lg border-2 transition-all ${
                  processedItem.status === 'completed' ? 'border-green-200 bg-green-50' :
                  processedItem.status === 'error' ? 'border-red-200 bg-red-50' :
                  currentStep === 'processing' && index === currentItemIndex ? 'border-blue-200 bg-blue-50' :
                  'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex-shrink-0 mr-4">
                  {processedItem.status === 'completed' && (
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {processedItem.status === 'error' && (
                    <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                  {['pending', 'generating', 'uploading', 'completing'].includes(processedItem.status) && (
                    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
                  )}
                </div>

                <div className="flex-grow">
                  <h4 className="font-medium text-gray-900">{processedItem.item.title}</h4>
                  <p className="text-sm text-gray-600">
                    {processedItem.item.brand && `${processedItem.item.brand} | `}
                    ${processedItem.item.price} | Barcode: {processedItem.barcodeData}
                  </p>
                  <div className="text-sm mt-1">
                    {processedItem.status === 'pending' && <span className="text-gray-500">Waiting...</span>}
                    {processedItem.status === 'generating' && <span className="text-blue-600">Generating barcode...</span>}
                    {processedItem.status === 'uploading' && <span className="text-blue-600">Uploading image...</span>}
                    {processedItem.status === 'completing' && <span className="text-blue-600">Finalizing...</span>}
                    {processedItem.status === 'completed' && <span className="text-green-600">✓ Completed successfully</span>}
                    {processedItem.status === 'error' && <span className="text-red-600">✗ Error: {processedItem.error}</span>}
                  </div>
                </div>

                {processedItem.status === 'completed' && processedItem.barcodeImageUrl && (
                  <div className="flex-shrink-0 ml-4">
                    <img
                      src={processedItem.barcodeImageUrl}
                      alt="Generated barcode"
                      className="h-12 border border-gray-300 rounded"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex justify-between">
            <div>
              {currentStep === 'completed' && completedCount > 0 && (
                <button
                  onClick={printAllBarcodes}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print All {completedCount} Barcode{completedCount > 1 ? 's' : ''}
                </button>
              )}
            </div>
            <div className="flex gap-3">
              {currentStep === 'preparing' && (
                <>
                  <button
                    onClick={onClose}
                    className="px-6 py-2 text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startBulkProcessing}
                    disabled={isProcessing}
                    className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    Start Processing
                  </button>
                </>
              )}
              {currentStep === 'processing' && (
                <div className="text-sm text-gray-600 flex items-center">
                  <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing barcodes...
                </div>
              )}
              {currentStep === 'completed' && (
                <button
                  onClick={handleComplete}
                  className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  Complete ({completedCount} Approved)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden canvas for barcode generation */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default BulkBarcodeGenerationModal; 