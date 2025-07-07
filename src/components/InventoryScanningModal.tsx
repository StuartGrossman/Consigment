import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiService } from '../services/apiService';
import { ConsignmentItem } from '../types';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

interface InventoryScanningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemAdded?: (item: ConsignmentItem) => void;
}

const InventoryScanningModal: React.FC<InventoryScanningModalProps> = ({ 
  isOpen, 
  onClose, 
  onItemAdded 
}) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<'scanning' | 'editing'>('scanning');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string>('');
  const [foundItem, setFoundItem] = useState<ConsignmentItem | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  // Item form state
  const [itemForm, setItemForm] = useState({
    title: '',
    description: '',
    category: '',
    brand: '',
    condition: 'good',
    gender: 'unisex',
    size: '',
    color: '',
    price: 0,
    barcodeData: ''
  });

  // Enhanced cleanup function
  const cleanupCamera = useCallback(() => {
    console.log('🧹 Performing comprehensive camera cleanup...');
    stopCamera();
    
    // Additional cleanup to ensure camera is fully released
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      // Force release any remaining camera handles
      navigator.mediaDevices.getUserMedia({ video: false })
        .then(stream => {
          stream.getTracks().forEach(track => {
            console.log(`🧹 Force stopping track: ${track.kind}`);
            track.stop();
          });
        })
        .catch(error => {
          console.log('🧹 Expected error during cleanup (no camera access):', error);
        });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🗑️ Component unmounting - cleaning up camera');
      cleanupCamera();
    };
  }, [cleanupCamera]);

  // Reset modal when opened
  useEffect(() => {
    if (isOpen) {
      console.log('🔓 InventoryScanningModal opened - resetting state');
      setCurrentStep('scanning');
      setScannedBarcode('');
      setFoundItem(null);
      setIsNewItem(false);
      setScanError(null);
      setIsProcessing(false);
      setItemForm({
        title: '',
        description: '',
        category: '',
        brand: '',
        condition: 'good',
        gender: 'unisex',
        size: '',
        color: '',
        price: 0,
        barcodeData: ''
      });
    } else {
      // Ensure camera is stopped when modal closes
      console.log('🚪 Modal closed - ensuring camera cleanup');
      cleanupCamera();
    }
  }, [isOpen, cleanupCamera]);

  // Start camera when scanning step is active
  useEffect(() => {
    if (isOpen && currentStep === 'scanning') {
      console.log('📹 Starting camera for scanning step');
      startCamera();
    } else {
      console.log('🛑 Stopping camera - not in scanning step or modal closed');
      stopCamera();
    }
  }, [isOpen, currentStep]);

  // Ensure camera is stopped when modal closes
  useEffect(() => {
    if (!isOpen) {
      console.log('🚪 Modal closed - stopping camera');
      cleanupCamera();
    }
  }, [isOpen, cleanupCamera]);

  const startCamera = async () => {
    if (!videoRef.current) {
      console.error('❌ Video ref not available');
      return;
    }
    
    try {
      console.log('📹 Starting camera initialization...');
      setCameraLoading(true);
      setScanError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      console.log('✅ Camera stream obtained');
      videoRef.current.srcObject = stream;
      
      videoRef.current.onloadedmetadata = () => {
        console.log('✅ Camera metadata loaded - starting barcode scanning');
        setCameraLoading(false);
        startBarcodeScanning();
      };
      
      videoRef.current.onerror = (event) => {
        console.error('❌ Camera error event:', event);
        setScanError('Failed to access camera');
        setCameraLoading(false);
      };
      
    } catch (error) {
      console.error('❌ Camera access error:', error);
      setScanError('Camera access denied. Please allow camera permissions.');
      setCameraLoading(false);
    }
  };

  const stopCamera = () => {
    console.log('🛑 Stopping camera and cleaning up...');
    
    // Stop all media tracks
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      console.log(`🛑 Stopping ${stream.getTracks().length} media tracks`);
      stream.getTracks().forEach(track => {
        console.log(`🛑 Stopping track: ${track.kind} (${track.label})`);
        track.stop();
      });
      videoRef.current.srcObject = null;
    }
    
    // Reset barcode reader
    if (codeReaderRef.current) {
      console.log('🛑 Resetting barcode reader');
      try {
        codeReaderRef.current.reset();
      } catch (error) {
        console.log('🛑 Error resetting barcode reader (expected):', error);
      }
      codeReaderRef.current = null;
    }
    
    // Reset video element
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.src = '';
      videoRef.current.load();
    }
    
    setIsScanning(false);
    setCameraLoading(false);
  };

  const startBarcodeScanning = async () => {
    if (!videoRef.current) {
      console.error('❌ Video ref not available for barcode scanning');
      return;
    }
    
    try {
      console.log('🔍 Initializing barcode scanner...');
      setIsScanning(true);
      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;
      
      await codeReader.decodeFromVideoDevice(null, videoRef.current, (result, error) => {
        if (result) {
          const barcodeText = result.getText();
          console.log('🎯 Barcode detected successfully:', barcodeText);
          console.log('📊 Barcode format:', result.getBarcodeFormat());
          processBarcodeResult(barcodeText);
        }
        
        if (error && !(error instanceof NotFoundException)) {
          console.log('🔍 Scanning in progress...', error.message);
        }
      });
      
      console.log('✅ Barcode scanner initialized and running');
    } catch (error) {
      console.error('❌ Failed to start barcode scanning:', error);
      setScanError('Failed to initialize barcode scanner');
      setIsScanning(false);
    }
  };

  const processBarcodeResult = async (barcodeText: string) => {
    console.log('🏷️ Processing barcode result:', barcodeText);
    setScannedBarcode(barcodeText);
    
    try {
      // Stop scanning to prevent multiple detections
      console.log('🛑 Stopping scanner to prevent multiple detections');
      stopCamera();
      
      // Look up item by barcode
      console.log('🔍 Looking up item by barcode in database...');
      const response = await apiService.lookupItemByBarcode(barcodeText);
      
      if (response.success && response.item) {
        console.log('✅ Found existing item:', response.item);
        console.log('📋 Item details:', {
          id: response.item.id,
          title: response.item.title,
          price: response.item.price,
          status: response.item.status,
          barcodeData: response.item.barcodeData
        });
        
        setFoundItem(response.item);
        setIsNewItem(false);
        
        // Pre-fill form with existing item data
        setItemForm({
          title: response.item.title || '',
          description: response.item.description || '',
          category: response.item.category || '',
          brand: response.item.brand || '',
          condition: response.item.condition || 'good',
          gender: response.item.gender || 'unisex',
          size: response.item.size || '',
          color: response.item.color || '',
          price: response.item.price || 0,
          barcodeData: barcodeText
        });
        
        // Add item to in-store cart immediately
        await addItemToInStoreCart(response.item.id);
        
      } else {
        console.log('🆕 No existing item found for barcode:', barcodeText);
        setFoundItem(null);
        setIsNewItem(true);
        
        // Pre-fill barcode only
        setItemForm(prev => ({
          ...prev,
          barcodeData: barcodeText
        }));
        
        // Move to editing step for new item creation
        setCurrentStep('editing');
      }
      
    } catch (error) {
      console.error('❌ Error processing barcode:', error);
      setScanError('Failed to process barcode. Please try again.');
      // Restart scanning
      setTimeout(() => {
        if (isOpen && currentStep === 'scanning') {
          console.log('🔄 Restarting camera after error');
          startCamera();
        }
      }, 2000);
    }
  };

  const addItemToInStoreCart = async (itemId: string) => {
    try {
      console.log('🛒 Adding item to in-store cart:', itemId);
      setIsProcessing(true);
      
      const response = await apiService.addToInStoreCart(itemId);
      
      if (response.success) {
        console.log('✅ Item added to in-store cart successfully');
        console.log('📊 Cart details:', {
          cart_item: response.cart_item,
          total_amount: response.total_amount,
          items_count: response.items_count
        });
        
        // Close modal and notify parent
        console.log('🚪 Closing modal after successful cart addition');
        onItemAdded?.(foundItem!);
        onClose();
      } else {
        throw new Error(response.message || 'Failed to add item to cart');
      }
      
    } catch (error) {
      console.error('❌ Error adding item to in-store cart:', error);
      setScanError(`Failed to add item to cart: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsProcessing(false);
    }
  };

  const handleFormChange = (field: string, value: string | number) => {
    setItemForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveItem = async () => {
    try {
      console.log('💾 Saving new item...');
      setIsProcessing(true);
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const itemData = {
        ...itemForm,
        seller_id: user.uid,
        seller_name: user.displayName || user.email || 'Unknown',
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      console.log('📋 Creating new item with data:', itemData);
      const response = await apiService.createItem(itemData);
      
      if (response.success) {
        console.log('✅ New item created successfully:', response.itemId);
        
        // Create a proper ConsignmentItem object for the callback
        const newItem: ConsignmentItem = {
          id: response.itemId,
          title: itemData.title,
          description: itemData.description,
          price: itemData.price,
          images: [],
          sellerId: itemData.seller_id,
          sellerName: itemData.seller_name,
          sellerEmail: user?.email || '',
          status: response.status as any,
          createdAt: new Date(),
          category: itemData.category,
          brand: itemData.brand,
          condition: itemData.condition as any,
          gender: itemData.gender as any,
          size: itemData.size,
          color: itemData.color,
          barcodeData: itemData.barcodeData
        };
        
        console.log('🛒 Adding newly created item to in-store cart');
        await addItemToInStoreCart(response.itemId);
        
      } else {
        throw new Error(response.message || 'Failed to create item');
      }
      
    } catch (error) {
      console.error('❌ Error saving new item:', error);
      setScanError(`Failed to save item: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    console.log('🚪 Closing inventory scanning modal');
    cleanupCamera();
    onClose();
  };

  const handleRescan = () => {
    console.log('🔄 Rescanning - resetting to scanning step');
    setCurrentStep('scanning');
    setScannedBarcode('');
    setFoundItem(null);
    setIsNewItem(false);
    setScanError(null);
    setIsProcessing(false);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {currentStep === 'scanning' ? '📷 Scan Barcode' : '✏️ Edit Item'}
              </h2>
              <p className="text-gray-600 mt-1">
                {currentStep === 'scanning' 
                  ? 'Point camera at barcode to scan and add to cart' 
                  : `${isNewItem ? 'Create new item' : 'Update existing item'}`
                }
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {currentStep === 'scanning' ? (
            /* Scanning Step */
            <div className="space-y-6">
              {/* Camera View */}
              <div className="relative bg-gray-900 rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-64 object-cover"
                  autoPlay
                  playsInline
                  muted
                />
                
                {/* Scanning Overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="border-2 border-orange-500 rounded-lg p-4 bg-black bg-opacity-50">
                    <div className="text-white text-center">
                      <div className="text-2xl mb-2">📷</div>
                      <div className="text-sm">Point camera at barcode</div>
                      <div className="text-xs mt-1">Item will be added to cart automatically</div>
                    </div>
                  </div>
                </div>
                
                {/* Loading Overlay */}
                {cameraLoading && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-2"></div>
                      <div>Starting camera...</div>
                    </div>
                  </div>
                )}
                
                {/* Processing Overlay */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-2"></div>
                      <div>Adding to cart...</div>
                    </div>
                  </div>
                )}
                
                {/* Scanning Status */}
                {isScanning && !cameraLoading && !isProcessing && (
                  <div className="absolute bottom-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm">
                    🔍 Scanning...
                  </div>
                )}
              </div>

              {/* Error Display */}
              {scanError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="text-red-500 mr-2">❌</div>
                    <div className="text-red-700">{scanError}</div>
                  </div>
                </div>
              )}

              {/* Manual Input Option */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Manual Entry</h3>
                <p className="text-gray-600 text-sm mb-3">
                  If scanning doesn't work, you can manually enter a barcode
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter barcode manually"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const value = e.currentTarget.value.trim();
                        if (value) {
                          console.log('🔢 Manual barcode entry:', value);
                          processBarcodeResult(value);
                        }
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const input = document.querySelector('input[placeholder="Enter barcode manually"]') as HTMLInputElement;
                      if (input && input.value.trim()) {
                        console.log('🔢 Manual barcode lookup:', input.value.trim());
                        processBarcodeResult(input.value.trim());
                      }
                    }}
                    className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    Lookup
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Editing Step */
            <div className="space-y-6">
              {/* Barcode Display */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Scanned Barcode</h3>
                    <p className="text-gray-600 font-mono text-lg">{scannedBarcode}</p>
                  </div>
                  <button
                    onClick={handleRescan}
                    className="bg-gray-500 text-white px-3 py-1 rounded-lg hover:bg-gray-600 transition-colors text-sm"
                  >
                    Rescan
                  </button>
                </div>
              </div>

              {/* Item Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={itemForm.title}
                    onChange={(e) => handleFormChange('title', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Item title"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={itemForm.brand}
                    onChange={(e) => handleFormChange('brand', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Brand name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={itemForm.category}
                    onChange={(e) => handleFormChange('category', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select category</option>
                    <option value="clothing">Clothing</option>
                    <option value="footwear">Footwear</option>
                    <option value="accessories">Accessories</option>
                    <option value="equipment">Equipment</option>
                    <option value="electronics">Electronics</option>
                    <option value="books">Books</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                  <select
                    value={itemForm.condition}
                    onChange={(e) => handleFormChange('condition', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="new">New</option>
                    <option value="like-new">Like New</option>
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select
                    value={itemForm.gender}
                    onChange={(e) => handleFormChange('gender', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="unisex">Unisex</option>
                    <option value="men">Men</option>
                    <option value="women">Women</option>
                    <option value="boys">Boys</option>
                    <option value="girls">Girls</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                  <input
                    type="text"
                    value={itemForm.size}
                    onChange={(e) => handleFormChange('size', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g., M, 10, Large"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  <input
                    type="text"
                    value={itemForm.color}
                    onChange={(e) => handleFormChange('color', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Color"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500">$</span>
                    <input
                      type="number"
                      value={itemForm.price}
                      onChange={(e) => handleFormChange('price', parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={itemForm.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  rows={3}
                  placeholder="Describe the item..."
                />
              </div>

              {/* Error Display */}
              {scanError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="text-red-500 mr-2">❌</div>
                    <div className="text-red-700">{scanError}</div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={handleClose}
                  className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveItem}
                  disabled={!itemForm.title || itemForm.price <= 0 || isProcessing}
                  className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Create & Add to Cart
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryScanningModal; 