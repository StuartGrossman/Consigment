import React, { useState, useEffect } from 'react';
import { ConsignmentItem } from '../types';
import { apiService } from '../services/apiService';

interface BulkMakeLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ConsignmentItem[];
  onComplete: (processedItems: ConsignmentItem[]) => void;
}

interface ProcessedLiveItem {
  item: ConsignmentItem;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'retrying';
  error?: string;
  retryCount?: number;
  startTime?: number;
  endTime?: number;
}

const BulkMakeLiveModal: React.FC<BulkMakeLiveModalProps> = ({ 
  isOpen, 
  onClose, 
  items, 
  onComplete 
}) => {
  const [processedItems, setProcessedItems] = useState<ProcessedLiveItem[]>([]);
  const [currentStep, setCurrentStep] = useState<'preparing' | 'processing' | 'completed'>('preparing');
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingErrors, setProcessingErrors] = useState<string[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  
  // Constants for retry and timeout handling
  const MAX_RETRIES = 2;
  const PROCESSING_TIMEOUT = 15000; // 15 seconds per item

  useEffect(() => {
    if (isOpen && items.length > 0) {
      initializeProcessedItems();
    }
  }, [isOpen, items]);

  // Auto-start processing after initialization (fixed dependencies to prevent restart loops)
  useEffect(() => {
    if (isOpen && processedItems.length > 0 && currentStep === 'preparing' && !isProcessing) {
      console.log('⏰ Setting up auto-start timer for bulk make live processing');
      const timeoutId = setTimeout(() => {
        console.log('⏰ Auto-start timer triggered for bulk make live');
        startBulkProcessing();
      }, 800);
      
      return () => {
        console.log('⏰ Auto-start timer cleared for bulk make live');
        clearTimeout(timeoutId);
      };
    }
  }, [isOpen, items.length]); // Fixed: Only depend on isOpen and items.length to prevent restart loops

  const initializeProcessedItems = () => {
    // Don't reinitialize if already processing to prevent restart loops
    if (isProcessing) {
      console.warn('🚫 Skipping initialization - make live processing already in progress');
      return;
    }
    
    // Validate items before processing
    const validationErrors: string[] = [];
    
    if (!items || items.length === 0) {
      validationErrors.push('No items provided for processing');
    }
    
    items.forEach((item, index) => {
      if (!item.id) {
        validationErrors.push(`Item ${index + 1}: Missing item ID`);
      }
      if (!item.title) {
        validationErrors.push(`Item ${index + 1}: Missing item title`);
      }
      if (item.status !== 'approved') {
        validationErrors.push(`Item ${index + 1}: Item must be approved to go live`);
      }
      if (!item.barcodeData || !item.barcodeImageUrl) {
        validationErrors.push(`Item ${index + 1}: Missing barcode - please generate barcode first`);
      }
    });
    
    if (validationErrors.length > 0) {
      setProcessingErrors(validationErrors);
      setShowErrorDetails(true);
      return;
    }
    
    const initialItems: ProcessedLiveItem[] = items.map(item => ({
      item,
      status: 'pending',
      retryCount: 0,
      startTime: undefined,
      endTime: undefined
    }));
    
    setProcessedItems(initialItems);
    setCurrentStep('preparing');
    setCurrentItemIndex(0);
    setProcessingErrors([]);
    setShowErrorDetails(false);
    setIsCancelled(false);
  };

  const startBulkProcessing = async () => {
    if (isProcessing) {
      console.warn('🚫 Bulk make live processing already in progress, ignoring duplicate start request');
      return;
    }
    
    if (currentStep !== 'preparing') {
      console.warn('🚫 Cannot start make live processing, current step is not preparing:', currentStep);
      return;
    }
    
    if (processedItems.length === 0) {
      console.warn('🚫 Cannot start make live processing, no items to process');
      return;
    }
    
    console.log(`🚀 Starting bulk make live processing for ${processedItems.length} items`);
    const startTime = Date.now();
    
    // Set processing state immediately to prevent duplicate starts
    setIsProcessing(true);
    setCurrentStep('processing');
    
    try {
      for (let i = 0; i < processedItems.length; i++) {
        if (!isOpen || isCancelled) break; // Stop if modal is closed or cancelled
        
        setCurrentItemIndex(i);
        await processItem(i);
        
        // Small delay between items
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error('❌ Error during bulk make live processing:', error);
    } finally {
      const endTime = Date.now();
      const totalTime = ((endTime - startTime) / 1000).toFixed(1);
      
      if (isCancelled) {
        console.log(`⏹️ Bulk make live processing cancelled after ${totalTime}s`);
        console.log(`📊 Results before cancellation: ${completedCount} completed, ${errorCount} failed`);
      } else {
        console.log(`✅ Bulk make live processing completed in ${totalTime}s`);
        console.log(`📊 Final results: ${completedCount} completed, ${errorCount} failed`);
      }
      
      setCurrentStep('completed');
      setIsProcessing(false);
    }
  };

  const processItem = async (index: number): Promise<void> => {
    const processedItem = processedItems[index];
    const startTime = Date.now();
    
    // Set start time
    setProcessedItems(prev => prev.map((item, i) => 
      i === index ? { ...item, startTime } : item
    ));
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Processing timeout')), PROCESSING_TIMEOUT);
      });
      
      // Process with timeout
      await Promise.race([
        processItemWithRetry(index),
        timeoutPromise
      ]);
      
    } catch (error) {
      console.error(`Error processing item ${processedItem.item.id}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if we should retry
      const currentRetryCount = processedItem.retryCount || 0;
      if (currentRetryCount < MAX_RETRIES && errorMessage !== 'Processing timeout') {
        console.log(`Retrying item ${processedItem.item.id}, attempt ${currentRetryCount + 1}/${MAX_RETRIES}`);
        updateItemStatus(index, 'retrying', `Retry ${currentRetryCount + 1}/${MAX_RETRIES}: ${errorMessage}`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (currentRetryCount + 1)));
        
        // Increment retry count and try again
        setProcessedItems(prev => prev.map((item, i) => 
          i === index ? { ...item, retryCount: currentRetryCount + 1 } : item
        ));
        
        await processItem(index);
      } else {
        // Final failure
        const endTime = Date.now();
        updateItemStatus(index, 'error', `Final error after ${currentRetryCount} retries: ${errorMessage}`);
        setProcessedItems(prev => prev.map((item, i) => 
          i === index ? { ...item, endTime } : item
        ));
      }
    }
  };

  const processItemWithRetry = async (index: number): Promise<void> => {
    const processedItem = processedItems[index];
    
    try {
      // Update status to processing
      updateItemStatus(index, 'processing');
      
      // Validate item has required barcode data
      if (!processedItem.item.barcodeData || !processedItem.item.barcodeImageUrl) {
        throw new Error('Item missing barcode data - please generate barcode first');
      }
      
      // Validate API service availability
      if (!apiService || !apiService.makeItemLive) {
        throw new Error('API service not available');
      }
      
      // Make item live via API
      await apiService.makeItemLive(processedItem.item.id);
      
      // Mark as completed with end time
      const endTime = Date.now();
      setProcessedItems(prev => prev.map((item, i) => 
        i === index ? { ...item, status: 'completed', endTime } : item
      ));
      
    } catch (error) {
      // Let the parent handle retries
      throw error;
    }
  };

  const updateItemStatus = (index: number, status: ProcessedLiveItem['status'], error?: string) => {
    setProcessedItems(prev => prev.map((item, i) => 
      i === index ? { ...item, status, error } : item
    ));
  };

  const handleCancel = () => {
    console.log('🛑 User cancelled bulk make live processing');
    setIsCancelled(true);
  };

  const handleComplete = () => {
    const completedItems = processedItems
      .filter(item => item.status === 'completed')
      .map(item => item.item);
    onComplete(completedItems);
  };

  if (!isOpen) return null;

  const completedCount = processedItems.filter(item => item.status === 'completed').length;
  const errorCount = processedItems.filter(item => item.status === 'error').length;
  const progressPercentage = processedItems.length > 0 ? (completedCount / processedItems.length) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="mobile-admin-modal-content">
        <div className="mobile-admin-modal-header">
          <div className="flex justify-between items-start">
            <div className="flex-1 mr-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold text-gray-800">🚀 Making Items Live</h2>
                <div className="flex items-center gap-2">
                  {/* Cancel Button during processing */}
                  {currentStep === 'processing' && !isCancelled && (
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Cancel
                    </button>
                  )}
                  {/* Close Button after completion */}
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
              
              <p className="text-gray-600 mb-3">
                {currentStep === 'preparing' && `Ready to make ${items.length} items live`}
                {currentStep === 'processing' && !isCancelled && `Processing ${currentItemIndex + 1} of ${items.length} items...`}
                {currentStep === 'processing' && isCancelled && `Cancelling... (${currentItemIndex + 1} of ${items.length} processed)`}
                {currentStep === 'completed' && !isCancelled && `Completed: ${completedCount} successful, ${errorCount} failed`}
                {currentStep === 'completed' && isCancelled && `Cancelled: ${completedCount} successful, ${errorCount} failed`}
              </p>

              {/* Progress Bar in Header */}
              {(currentStep === 'processing' || currentStep === 'completed') && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Overall Progress</span>
                    <span>{Math.round(progressPercentage)}% ({completedCount + errorCount}/{processedItems.length})</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-300 ${
                        isCancelled 
                          ? 'bg-gradient-to-r from-yellow-400 to-orange-500'
                          : currentStep === 'completed'
                          ? 'bg-gradient-to-r from-green-400 to-green-600'
                          : 'bg-gradient-to-r from-blue-400 to-blue-600'
                      }`}
                      style={{ width: `${(completedCount + errorCount) / processedItems.length * 100}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{completedCount} live • {errorCount} failed</span>
                    {currentStep === 'processing' && !isCancelled && (
                      <span>Est. time remaining: {Math.ceil((processedItems.length - completedCount - errorCount) * 2)}s</span>
                    )}
                    {isCancelled && <span className="text-orange-600">Processing cancelled</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mobile-admin-modal-body">
          {/* Error Summary */}
          {processingErrors.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-red-800 font-medium">⚠️ Validation Errors</h3>
                  <p className="text-red-600 text-sm mt-1">{processingErrors.length} error(s) found</p>
                </div>
                <button
                  onClick={() => setShowErrorDetails(!showErrorDetails)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  {showErrorDetails ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
              {showErrorDetails && (
                <div className="mt-3 space-y-1">
                  {processingErrors.map((error, index) => (
                    <div key={index} className="text-sm text-red-700 bg-red-100 p-2 rounded">
                      {error}
                    </div>
                  ))}
                </div>
              )}
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
                  {['pending', 'processing', 'retrying'].includes(processedItem.status) && (
                    <div className={`w-8 h-8 border-4 rounded-full ${
                      isCancelled 
                        ? 'border-orange-200 border-t-orange-500'
                        : processedItem.status === 'retrying' 
                        ? 'border-yellow-200 border-t-yellow-500 animate-spin'
                        : 'border-blue-200 border-t-blue-500 animate-spin'
                    } ${!isCancelled ? 'animate-spin' : ''}`}></div>
                  )}
                </div>

                <div className="flex-grow">
                  <h4 className="font-medium text-gray-900">{processedItem.item.title}</h4>
                  <p className="text-sm text-gray-600">
                    {processedItem.item.brand && `${processedItem.item.brand} | `}
                    ${processedItem.item.price} | Barcode: {processedItem.item.barcodeData}
                  </p>
                  <div className="text-sm mt-1">
                    {processedItem.status === 'pending' && (
                      <span className={isCancelled ? "text-orange-500" : "text-gray-500"}>
                        {isCancelled ? "⏹️ Cancelled" : "⏳ Waiting in queue..."}
                      </span>
                    )}
                    {processedItem.status === 'processing' && (
                      <span className={isCancelled ? "text-orange-600" : "text-blue-600"}>
                        {isCancelled ? "⏹️ Cancelling..." : "🚀 Making item live..."}
                      </span>
                    )}
                    {processedItem.status === 'retrying' && <span className="text-yellow-600">🔄 Retrying... ({processedItem.retryCount || 0}/{MAX_RETRIES})</span>}
                    {processedItem.status === 'completed' && (
                      <span className="text-green-600">
                        ✓ Now live for customers!
                        {processedItem.startTime && processedItem.endTime && (
                          <span className="text-gray-400 ml-2">
                            ({((processedItem.endTime - processedItem.startTime) / 1000).toFixed(1)}s)
                          </span>
                        )}
                      </span>
                    )}
                    {processedItem.status === 'error' && (
                      <div className="text-red-600">
                        <div>✗ Failed after {processedItem.retryCount || 0} retries</div>
                        <div className="text-xs text-red-500 mt-1">{processedItem.error}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Item Image */}
                {processedItem.item.images && processedItem.item.images[0] && (
                  <div className="flex-shrink-0 ml-4">
                    <img
                      src={processedItem.item.images[0]}
                      alt={processedItem.item.title}
                      className="h-12 w-12 object-cover rounded border border-gray-300"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer with Action Buttons */}
        <div className="mobile-admin-modal-footer">
          <div className="status-info">
            {currentStep === 'completed' && completedCount > 0 && (
              <span className="text-green-600 font-medium">
                🎉 {completedCount} item{completedCount > 1 ? 's are' : ' is'} now live for customers!
              </span>
            )}
            {currentStep === 'processing' && !isCancelled && (
              <span className="text-green-600 flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Making items live...
              </span>
            )}
            {currentStep === 'processing' && isCancelled && (
              <span className="text-yellow-600 flex items-center gap-2">
                <svg className="h-4 w-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Cancelling...
              </span>
            )}
          </div>
          
          <div className="action-buttons">
            {currentStep === 'preparing' && processingErrors.length === 0 && (
              <>
                <button
                  onClick={onClose}
                  className="btn-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={startBulkProcessing}
                  disabled={isProcessing}
                  className="btn-success disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🚀 Start Processing
                </button>
              </>
            )}
            {currentStep === 'completed' && (
              <button
                onClick={handleComplete}
                className={isCancelled ? 'btn-secondary' : 'btn-success'}
              >
                {isCancelled ? `Complete (${completedCount} Live, Cancelled)` : `Complete (${completedCount} Live)`}
              </button>
            )}
            {processingErrors.length > 0 && (
              <button
                onClick={onClose}
                className="btn-danger"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkMakeLiveModal; 