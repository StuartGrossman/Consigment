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
  status: 'pending' | 'generating' | 'uploading' | 'completing' | 'completed' | 'error' | 'retrying';
  error?: string;
  retryCount?: number;
  startTime?: number;
  endTime?: number;
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
  const [processingErrors, setProcessingErrors] = useState<string[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Constants for retry and timeout handling
  const MAX_RETRIES = 2; // Reduced from 3 to prevent long retry loops
  const PROCESSING_TIMEOUT = 15000; // Reduced from 30s to 15s per item
  const CANVAS_GENERATION_TIMEOUT = 5000; // Reduced from 10s to 5s for canvas operations

  useEffect(() => {
    if (isOpen && items.length > 0) {
      initializeProcessedItems();
    }
  }, [isOpen, items]);

  // Separate effect for auto-starting to avoid race conditions
  useEffect(() => {
    if (isOpen && processedItems.length > 0 && currentStep === 'preparing' && !isProcessing) {
      console.log('⏰ Setting up auto-start timer for bulk processing');
      const timeoutId = setTimeout(() => {
        console.log('⏰ Auto-start timer triggered');
        startBulkProcessing();
      }, 1000);
      
      return () => {
        console.log('⏰ Auto-start timer cleared');
        clearTimeout(timeoutId);
      };
    }
  }, [isOpen, currentStep]); // Removed processedItems and isProcessing to prevent retriggering

  // Component lifecycle logging
  useEffect(() => {
    if (isOpen) {
      console.log('🔧 BulkBarcodeGenerationModal opened/mounted');
      console.log(`🔧 Initial state: items=${items.length}, step=${currentStep}, processing=${isProcessing}`);
    }
    
    return () => {
      if (isOpen) {
        console.log('🔧 BulkBarcodeGenerationModal closing/unmounting');
      }
    };
  }, [isOpen]);

  // State validation during processing - reduced frequency to prevent interference
  useEffect(() => {
    if (currentStep === 'processing' && processedItems.length > 0 && isProcessing) {
      console.log('🔍 Setting up periodic state validation');
      const validationInterval = setInterval(() => {
        console.log('🔍 Running periodic state validation...');
        validateState();
      }, 15000); // Validate every 15 seconds instead of 5 to reduce interference
      
      return () => {
        console.log('🔍 Clearing state validation interval');
        clearInterval(validationInterval);
      };
    }
  }, [currentStep]); // Removed other dependencies to prevent restarts

  // Monitor for unexpected state changes
  useEffect(() => {
    console.log(`🔄 State change detected: step=${currentStep}, index=${currentItemIndex}, processing=${isProcessing}, items=${processedItems.length}`);
  }, [currentStep, currentItemIndex, isProcessing, processedItems.length]);

  // Cleanup effect to detect premature closing
  useEffect(() => {
    return () => {
      if (isProcessing && currentStep === 'processing') {
        console.warn('🚨 Modal closing while processing is active!');
        console.warn(`🚨 Processing state: item ${currentItemIndex + 1}/${processedItems.length}, completed=${processedItems.filter(i => i.status === 'completed').length}`);
        console.warn('🚨 This may cause progress bar corruption on next open');
      }
    };
  }, [isProcessing, currentStep, currentItemIndex, processedItems]);

  // Ensure canvas is always available
  const ensureCanvasAvailable = (): boolean => {
    if (!canvasRef.current) {
      console.warn('🎨 Canvas not available, attempting to recreate...');
      // Try to recreate canvas element
      const canvas = document.createElement('canvas');
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
      // Update ref
      if (canvasRef) {
        (canvasRef as any).current = canvas;
      }
      const success = !!canvasRef.current;
      console.log(`🎨 Canvas recreation ${success ? 'successful' : 'failed'}`);
      return success;
    }
    return true;
  };

  // Validate state consistency
  const validateState = () => {
    const issues: string[] = [];
    
    if (processedItems.length === 0 && currentStep === 'processing') {
      issues.push('Processing with no items');
    }
    
    if (currentItemIndex >= processedItems.length && currentStep === 'processing') {
      issues.push(`Current index (${currentItemIndex}) exceeds items length (${processedItems.length})`);
    }
    
    if (currentItemIndex < -1) {
      issues.push(`Invalid current index: ${currentItemIndex}`);
    }
    
    const statusCounts = processedItems.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const totalProcessed = (statusCounts.completed || 0) + (statusCounts.error || 0);
    const totalPending = statusCounts.pending || 0;
    const totalProcessing = Object.keys(statusCounts).reduce((sum, key) => {
      if (['generating', 'uploading', 'completing', 'retrying'].includes(key)) {
        return sum + statusCounts[key];
      }
      return sum;
    }, 0);
    
    if (totalProcessed + totalPending + totalProcessing !== processedItems.length) {
      issues.push(`Status count mismatch: ${totalProcessed + totalPending + totalProcessing} vs ${processedItems.length}`);
    }
    
    if (issues.length > 0) {
      console.error('🚨 State validation failed:', issues);
      console.error('🚨 Current state:', {
        currentStep,
        currentItemIndex,
        isProcessing,
        itemsLength: processedItems.length,
        statusCounts
      });
    }
    
    return issues.length === 0;
  };

  const initializeProcessedItems = () => {
    // Don't reinitialize if already processing to prevent restart loops
    if (isProcessing) {
      console.warn('🚫 Skipping initialization - processing already in progress');
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
      if (typeof item.price !== 'number' || item.price <= 0) {
        validationErrors.push(`Item ${index + 1}: Invalid price`);
      }
    });
    
    if (validationErrors.length > 0) {
      setProcessingErrors(validationErrors);
      setShowErrorDetails(true);
      return;
    }
    
    const initialItems: ProcessedItem[] = items.map(item => ({
      item,
      barcodeData: generateBarcodeData(item),
      barcodeImageUrl: '',
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

  const generateBarcodeData = (item: ConsignmentItem): string => {
    const timestamp = Date.now().toString().slice(-8);
    const itemIdShort = item.id.slice(-4).toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Ensure we have at least 4 characters for the item ID part
    const paddedItemId = itemIdShort.padEnd(4, '0').slice(0, 4);
    return `CSG${timestamp}${paddedItemId}`;
  };

  const startBulkProcessing = async () => {
    if (isProcessing) {
      console.warn('🚫 Bulk processing already in progress, ignoring duplicate start request');
      return;
    }
    
    if (currentStep !== 'preparing') {
      console.warn('🚫 Cannot start processing, current step is not preparing:', currentStep);
      return;
    }
    
    if (processedItems.length === 0) {
      console.warn('🚫 Cannot start processing, no items to process');
      return;
    }
    
    console.log(`🚀 Starting bulk barcode processing for ${processedItems.length} items`);
    const startTime = Date.now();
    
    // Set processing state immediately to prevent duplicate starts
    setIsProcessing(true);
    setCurrentStep('processing');
    setCurrentItemIndex(0);
    
    try {
      for (let i = 0; i < processedItems.length; i++) {
        // Check if we should stop processing (modal might be closed or cancelled)
        if (!isOpen || isCancelled) {
          console.warn(`🛑 ${isCancelled ? 'Processing cancelled' : 'Modal closed'}, stopping processing at item ${i + 1}/${processedItems.length}`);
          break;
        }
        
        const itemStartTime = Date.now();
        console.log(`📋 Processing item ${i + 1}/${processedItems.length}: ${processedItems[i].item.title}`);
        
        // Update current index before processing
        setCurrentItemIndex(i);
        
        // Log progress calculation
        const completedSoFar = processedItems.filter(item => item.status === 'completed').length;
        const errorsSoFar = processedItems.filter(item => item.status === 'error').length;
        const progressPercent = Math.round(((completedSoFar + errorsSoFar) / processedItems.length) * 100);
        console.log(`📊 Progress: ${progressPercent}% (${completedSoFar + errorsSoFar}/${processedItems.length}) - Processing item ${i + 1}`);
        
        // Process item with robust error handling
        await processItemSafely(i);
        
        const itemEndTime = Date.now();
        const itemDuration = itemEndTime - itemStartTime;
        console.log(`✅ Completed item ${i + 1} in ${itemDuration}ms`);
        
        // Small delay between items to prevent overwhelming the server and canvas
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Log memory usage every 10 items
        if ((i + 1) % 10 === 0) {
          try {
            const perf = performance as any;
            if (perf.memory) {
              console.log(`💾 Memory usage at item ${i + 1}: ${Math.round(perf.memory.usedJSHeapSize / 1024 / 1024)}MB`);
            }
          } catch (e) {
            // Memory API not available, skip logging
          }
        }
      }
    } catch (error) {
      console.error('💥 Fatal error during bulk processing:', error);
      console.error('💥 Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    } finally {
      const totalTime = Date.now() - startTime;
      
      if (isCancelled) {
        console.log(`⏹️ Bulk barcode processing cancelled after ${totalTime}ms (${Math.round(totalTime / 1000)}s)`);
      } else {
        console.log(`🏁 Bulk barcode processing completed in ${totalTime}ms (${Math.round(totalTime / 1000)}s)`);
      }
      
      setCurrentStep('completed');
      setIsProcessing(false);
      setCurrentItemIndex(-1); // Reset index when completed
      
      // Final progress summary
      const finalCompleted = processedItems.filter(item => item.status === 'completed').length;
      const finalErrors = processedItems.filter(item => item.status === 'error').length;
      const statusText = isCancelled ? 'cancelled' : 'completed';
      console.log(`📈 Final results (${statusText}): ${finalCompleted} completed, ${finalErrors} failed, ${processedItems.length - finalCompleted - finalErrors} remaining`);
    }
  };

  const processItemSafely = async (index: number): Promise<void> => {
    const processedItem = processedItems[index];
    const startTime = Date.now();
    
    console.log(`🔄 Starting safe processing for item ${index}: ${processedItem.item.title}`);
    
    // Set start time
    setProcessedItems(prev => prev.map((item, i) => 
      i === index ? { ...item, startTime } : item
    ));
    
    let retryCount = 0;
    let lastError: string = '';
    
    while (retryCount <= MAX_RETRIES) {
      try {
        console.log(`🎯 Processing attempt ${retryCount + 1}/${MAX_RETRIES + 1} for item ${index}`);
        
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Processing timeout')), PROCESSING_TIMEOUT);
        });
        
        // Update retry count if this is a retry
        if (retryCount > 0) {
          console.log(`🔁 Retry ${retryCount}/${MAX_RETRIES} for item ${index} after error: ${lastError}`);
          setProcessedItems(prev => prev.map((item, i) => 
            i === index ? { ...item, retryCount } : item
          ));
          updateItemStatus(index, 'retrying', `Retry ${retryCount}/${MAX_RETRIES}: ${lastError}`);
          
          // Wait before retry with exponential backoff
          const backoffDelay = 1000 * retryCount;
          console.log(`⏱️ Waiting ${backoffDelay}ms before retry for item ${index}`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
        
        // Process with timeout
        console.log(`⚡ Starting actual processing for item ${index}`);
        await Promise.race([
          processItemWithRetry(index),
          timeoutPromise
        ]);
        
        // If we get here, processing was successful
        const endTime = Date.now();
        const duration = endTime - startTime;
        console.log(`✅ Successfully processed item ${index} in ${duration}ms after ${retryCount} retries`);
        return;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        lastError = errorMessage;
        
        console.error(`❌ Error processing item ${index} (attempt ${retryCount + 1}):`, errorMessage);
        if (error instanceof Error && error.stack) {
          console.error(`🔍 Error stack for item ${index}:`, error.stack);
        }
        
        // Check if we should retry
        if (retryCount < MAX_RETRIES && errorMessage !== 'Processing timeout') {
          retryCount++;
          console.warn(`🔄 Will retry item ${index}, attempt ${retryCount}/${MAX_RETRIES}`);
        } else {
          // Final failure
          const endTime = Date.now();
          const duration = endTime - startTime;
          console.error(`💀 Final failure for item ${index} after ${retryCount} retries in ${duration}ms: ${errorMessage}`);
          updateItemStatus(index, 'error', `Final error after ${retryCount} retries: ${errorMessage}`);
          setProcessedItems(prev => prev.map((item, i) => 
            i === index ? { ...item, endTime, retryCount } : item
          ));
          return;
        }
      }
    }
  };
  
  const processItemWithRetry = async (index: number): Promise<void> => {
    const processedItem = processedItems[index];
    
    try {
      // Ensure canvas is available before processing
      if (!ensureCanvasAvailable()) {
        throw new Error('Canvas not available for barcode generation - unable to recreate');
      }
      
      // Update status to generating
      updateItemStatus(index, 'generating');
      
      // Generate barcode image with validation
      if (!processedItem.barcodeData || processedItem.barcodeData.length < 5) {
        throw new Error('Invalid barcode data generated');
      }
      
      const barcodeImageUrl = await generateBarcodeImage(processedItem.barcodeData, processedItem.item.id);
      
      if (!barcodeImageUrl || !barcodeImageUrl.startsWith('http')) {
        throw new Error('Failed to upload barcode image');
      }
      
      // Update status to uploading
      updateItemStatus(index, 'uploading');
      
      // Update status to completing
      updateItemStatus(index, 'completing');
      
      // Validate API service availability
      if (!apiService || !apiService.updateItemWithBarcode) {
        throw new Error('API service not available');
      }
      
      // Update item in database with barcode
      await apiService.updateItemWithBarcode(processedItem.item.id, {
        barcodeData: processedItem.barcodeData,
        barcodeImageUrl: barcodeImageUrl,
        status: 'approved'
      });
      
      // Mark as completed with end time
      const endTime = Date.now();
      setProcessedItems(prev => prev.map((item, i) => 
        i === index ? { ...item, barcodeImageUrl, status: 'completed', endTime } : item
      ));
      
    } catch (error) {
      // Let the parent handle retries
      throw error;
    }
  };

  const updateItemStatus = (index: number, status: ProcessedItem['status'], error?: string) => {
    console.log(`📝 Updating item ${index} status: ${status}${error ? ` (${error})` : ''}`);
    
    setProcessedItems(prev => {
      const updated = prev.map((item, i) => 
        i === index ? { ...item, status, error } : item
      );
      
      // Log status distribution for debugging
      const statusCounts = updated.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log(`📊 Status distribution after updating item ${index}:`, statusCounts);
      return updated;
    });
  };

  const generateBarcodeImage = async (barcodeData: string, itemId: string): Promise<string> => {
    console.log(`🎨 Starting barcode generation for item ${itemId} with data: ${barcodeData}`);
    
    return new Promise((resolve, reject) => {
      if (!ensureCanvasAvailable()) {
        console.error(`❌ Canvas not available for item ${itemId}`);
        reject(new Error('Canvas not available - unable to recreate'));
        return;
      }

      console.log(`✅ Canvas available for item ${itemId}`);

      // Set canvas generation timeout
      const canvasTimeout = setTimeout(() => {
        console.error(`⏰ Canvas generation timeout for item ${itemId} after ${CANVAS_GENERATION_TIMEOUT}ms`);
        reject(new Error('Canvas generation timeout'));
      }, CANVAS_GENERATION_TIMEOUT);

      try {
        // Validate barcode data format for CODE128 (supports ASCII characters 0-127)
        if (!/^[A-Za-z0-9]+$/.test(barcodeData)) {
          console.error(`❌ Invalid barcode format for item ${itemId}: ${barcodeData}`);
          throw new Error('Invalid barcode data format');
        }

        console.log(`✅ Barcode format valid for item ${itemId}`);

        // Get canvas reference
        const canvas = canvasRef.current;
        if (!canvas) {
          console.error(`❌ Canvas reference lost for item ${itemId}`);
          throw new Error('Canvas reference lost during processing');
        }

        console.log(`🖼️ Generating barcode on canvas for item ${itemId}`);

        // Generate barcode on canvas
        JsBarcode(canvas, barcodeData, {
          format: 'CODE128',
          width: 2,
          height: 100,
          displayValue: true,
          fontSize: 14,
          margin: 10
        });

        console.log(`✅ Barcode generated on canvas for item ${itemId}, dimensions: ${canvas.width}x${canvas.height}`);

        // Validate canvas content
        if (canvas.width === 0 || canvas.height === 0) {
          console.error(`❌ Invalid canvas dimensions for item ${itemId}: ${canvas.width}x${canvas.height}`);
          throw new Error('Canvas generation failed - invalid dimensions');
        }

        console.log(`📦 Converting canvas to blob for item ${itemId}`);

        // Convert canvas to blob and upload
        canvas.toBlob(async (blob) => {
          clearTimeout(canvasTimeout);
          
          if (!blob) {
            console.error(`❌ Failed to generate blob for item ${itemId}`);
            reject(new Error('Failed to generate barcode image blob'));
            return;
          }

          console.log(`✅ Blob generated for item ${itemId}, size: ${blob.size} bytes`);

          // Validate blob size
          if (blob.size === 0) {
            console.error(`❌ Empty blob generated for item ${itemId}`);
            reject(new Error('Generated barcode image is empty'));
            return;
          }

          if (blob.size > 5 * 1024 * 1024) { // 5MB limit
            console.error(`❌ Blob too large for item ${itemId}: ${blob.size} bytes`);
            reject(new Error('Generated barcode image is too large'));
            return;
          }

          try {
            // Validate storage availability
            if (!storage) {
              console.error(`❌ Firebase storage not available for item ${itemId}`);
              throw new Error('Firebase storage not available');
            }

            console.log(`☁️ Starting upload to Firebase for item ${itemId}`);
            const uploadStartTime = Date.now();

            const storageRef = ref(storage, `barcodes/${itemId}_${barcodeData}_${Date.now()}.png`);
            
            // Upload with metadata
            const metadata = {
              contentType: 'image/png',
              customMetadata: {
                'itemId': itemId,
                'barcodeData': barcodeData,
                'generatedAt': new Date().toISOString()
              }
            };
            
            await uploadBytes(storageRef, blob, metadata);
            const uploadDuration = Date.now() - uploadStartTime;
            console.log(`✅ Upload completed for item ${itemId} in ${uploadDuration}ms`);

            console.log(`🔗 Getting download URL for item ${itemId}`);
            const downloadURL = await getDownloadURL(storageRef);
            
            // Validate download URL
            if (!downloadURL || !downloadURL.startsWith('http')) {
              console.error(`❌ Invalid download URL for item ${itemId}: ${downloadURL}`);
              throw new Error('Invalid download URL received');
            }
            
            console.log(`✅ Barcode generation complete for item ${itemId}: ${downloadURL.substring(0, 100)}...`);
            resolve(downloadURL);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown storage error';
            console.error(`❌ Storage upload failed for item ${itemId}:`, errorMessage);
            reject(new Error(`Storage upload failed: ${errorMessage}`));
          }
        }, 'image/png');
      } catch (error) {
        clearTimeout(canvasTimeout);
        reject(new Error(`Barcode generation failed: ${error instanceof Error ? error.message : 'Unknown canvas error'}`));
      }
    });
  };

  const handleCancel = () => {
    console.log('🛑 User cancelled bulk barcode processing');
    setIsCancelled(true);
    setIsProcessing(false);
    setCurrentStep('completed');
    // Close the modal after a brief delay to show cancellation status
    setTimeout(() => {
      onClose();
    }, 1000);
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
  const inProgressCount = processedItems.filter(item => 
    ['generating', 'uploading', 'completing', 'retrying'].includes(item.status)
  ).length;
  
  // Calculate progress more accurately - include current item being processed
  const effectiveProgress = currentStep === 'processing' 
    ? Math.max(completedCount + errorCount, currentItemIndex)
    : completedCount + errorCount;
    
  const progressPercentage = processedItems.length > 0 
    ? Math.min(100, (effectiveProgress / processedItems.length) * 100)
    : 0;

  // Debug logging for progress calculation (only when processing)
  if (currentStep === 'processing' && processedItems.length > 0) {
    const debugInfo = {
      totalItems: processedItems.length,
      completedCount,
      errorCount,
      inProgressCount,
      currentItemIndex,
      effectiveProgress,
      progressPercentage: Math.round(progressPercentage),
      currentStep,
      isProcessing
    };
    
    // Detect potential progress corruption
    const possibleIssues = [];
    if (currentItemIndex > processedItems.length) {
      possibleIssues.push('Current index exceeds total items');
    }
    if (effectiveProgress > processedItems.length) {
      possibleIssues.push('Effective progress exceeds total items');
    }
    if (progressPercentage > 100) {
      possibleIssues.push('Progress percentage over 100%');
    }
    if (currentItemIndex < 0 && currentStep === 'processing') {
      possibleIssues.push('Negative current index during processing');
    }
    
         if (possibleIssues.length > 0) {
       console.error('🚨 Progress corruption detected:', possibleIssues);
       console.error('🚨 Debug info:', debugInfo);
       // Log corruption but don't auto-fix during processing to avoid restart loops
       console.warn('🚨 Corruption detected but not fixing automatically to prevent restart loops');
     }
    
    // Log every 5 items or when there's a significant change
    const shouldLog = currentItemIndex % 5 === 0 || 
                     progressPercentage % 10 < 1 || 
                     (completedCount + errorCount) !== effectiveProgress ||
                     possibleIssues.length > 0;
    
    if (shouldLog) {
      console.log(`📈 Progress calculation:`, debugInfo);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div className="flex-1 mr-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold text-gray-800">📊 Bulk Barcode Generation</h2>
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
                {currentStep === 'preparing' && `Ready to process ${items.length} items`}
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
                    <span>
                      {completedCount} completed
                      {errorCount > 0 && ` • ${errorCount} failed`}
                      {inProgressCount > 0 && ` • ${inProgressCount} processing`}
                    </span>
                    {currentStep === 'processing' && !isCancelled && (
                      <span>
                        Item {currentItemIndex + 1} of {processedItems.length}
                        {processedItems.length - completedCount - errorCount > 0 && 
                          ` • Est. ${Math.ceil((processedItems.length - completedCount - errorCount) * 3)}s remaining`
                        }
                      </span>
                    )}
                    {isCancelled && <span className="text-orange-600">Processing cancelled</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 flex-1 overflow-hidden flex flex-col">
          {/* Error Summary */}
          {processingErrors.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex-shrink-0">
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
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
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
                  {['pending', 'generating', 'uploading', 'completing', 'retrying'].includes(processedItem.status) && (
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
                    ${processedItem.item.price} | Barcode: {processedItem.barcodeData}
                  </p>
                  <div className="text-sm mt-1">
                    {processedItem.status === 'pending' && (
                      <span className={isCancelled ? "text-orange-500" : "text-gray-500"}>
                        {isCancelled ? "⏹️ Cancelled" : "⏳ Waiting in queue..."}
                      </span>
                    )}
                    {processedItem.status === 'generating' && (
                      <span className={isCancelled ? "text-orange-600" : "text-blue-600"}>
                        {isCancelled ? "⏹️ Cancelling..." : "🔄 Generating barcode..."}
                      </span>
                    )}
                    {processedItem.status === 'uploading' && (
                      <span className={isCancelled ? "text-orange-600" : "text-blue-600"}>
                        {isCancelled ? "⏹️ Cancelling..." : "☁️ Uploading to cloud storage..."}
                      </span>
                    )}
                    {processedItem.status === 'completing' && (
                      <span className={isCancelled ? "text-orange-600" : "text-blue-600"}>
                        {isCancelled ? "⏹️ Cancelling..." : "✅ Updating database..."}
                      </span>
                    )}
                    {processedItem.status === 'retrying' && <span className="text-yellow-600">🔄 Retrying... ({processedItem.retryCount || 0}/{MAX_RETRIES})</span>}
                    {processedItem.status === 'completed' && (
                      <span className="text-green-600">
                        ✓ Completed successfully
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
        <div className="p-6 border-t border-gray-200 flex-shrink-0">
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
                  {!isCancelled ? (
                    <>
                      <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing barcodes...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-orange-600">Cancelling...</span>
                    </>
                  )}
                </div>
              )}
              {currentStep === 'completed' && (
                <button
                  onClick={handleComplete}
                  className={`px-6 py-2 text-white rounded-lg transition-colors ${
                    isCancelled 
                      ? 'bg-orange-500 hover:bg-orange-600'
                      : 'bg-green-500 hover:bg-green-600'
                  }`}
                >
                  {isCancelled ? `Complete (${completedCount} Generated, Cancelled)` : `Complete (${completedCount} Approved)`}
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