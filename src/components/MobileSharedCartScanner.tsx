import React, { useState, useRef, useEffect } from 'react';
import { useSharedCart } from '../hooks/useSharedCart';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

interface MobileSharedCartScannerProps {
  isOpen: boolean;
  onClose: () => void;
}

const MobileSharedCartScanner: React.FC<MobileSharedCartScannerProps> = ({ isOpen, onClose }) => {
  const {
    currentCartId,
    cartData,
    hasActiveCart,
    addItemToSharedCart,
    loadSharedCart,
    getUserSharedCarts,
    userCarts,
    cartItemCount,
    cartTotal,
    error: sharedCartError
  } = useSharedCart();

  // Scanner state
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [useCamera, setUseCamera] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [cartIdInput, setCartIdInput] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  // Load user carts on mount
  useEffect(() => {
    if (isOpen) {
      getUserSharedCarts();
    }
  }, [isOpen, getUserSharedCarts]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraLoading(true);
    setScanError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Use back camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        return new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;
          
          const onLoadedMetadata = () => {
            video.play()
              .then(() => {
                startBarcodeScanning();
                setUseCamera(true);
                setCameraLoading(false);
                resolve();
              })
              .catch(reject);
          };

          video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
          video.addEventListener('error', reject, { once: true });
        });
      }
    } catch (error) {
      console.error('❌ Camera setup failed:', error);
      setScanError('Unable to access camera. Please check permissions.');
      setUseCamera(false);
      setCameraLoading(false);
    }
  };

  const stopCamera = () => {
    // Stop barcode scanning
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
      codeReaderRef.current = null;
    }
    
    // Stop camera stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setUseCamera(false);
    }
  };

  const startBarcodeScanning = async () => {
    if (!videoRef.current) return;
    
    try {
      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;
      
      await codeReader.decodeFromVideoDevice(null, videoRef.current, (result, error) => {
        if (result) {
          processBarcodeResult(result.getText());
        }
        
        if (error && !(error instanceof NotFoundException)) {
          console.log('🔍 Scanning for barcodes...', error.message);
        }
      });
    } catch (error) {
      console.error('❌ Failed to start barcode scanning:', error);
      setScanError('Failed to initialize barcode scanner');
    }
  };

  const processBarcodeResult = async (barcodeText: string) => {
    if (isScanning || !hasActiveCart) return;
    
    setIsScanning(true);
    setScanError(null);
    
    try {
      await addItemToSharedCart(barcodeText);
      
      // Success feedback
      setManualBarcode('');
      setScanError(null);
      
      // Show brief success message
      const successMsg = document.createElement('div');
      successMsg.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg z-50';
      successMsg.textContent = '✅ Item added to cart!';
      document.body.appendChild(successMsg);
      
      setTimeout(() => {
        if (document.body.contains(successMsg)) {
          document.body.removeChild(successMsg);
        }
      }, 2000);
      
    } catch (error) {
      console.error('❌ Error adding item:', error);
      setScanError(error instanceof Error ? error.message : 'Failed to add item to cart');
    } finally {
      setIsScanning(false);
    }
  };

  const handleManualBarcode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcode.trim()) return;
    
    await processBarcodeResult(manualBarcode.trim());
  };

  const handleJoinCart = async () => {
    if (!cartIdInput.trim()) return;
    
    try {
      await loadSharedCart(cartIdInput.trim());
      setCartIdInput('');
      setScanError(null);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Failed to join cart');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white p-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold">📱 Mobile Cart Scanner</h2>
              <p className="text-green-100 text-sm">Scan items for shared cart</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-100px)]">
          {/* Cart Status */}
          {hasActiveCart ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-green-800 font-medium">Active Cart</p>
                  <p className="text-green-600 text-sm">ID: {currentCartId?.slice(0, 8).toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <p className="text-green-800 font-bold">{cartItemCount} items</p>
                  <p className="text-green-600 text-sm">${cartTotal.toFixed(2)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-orange-800 font-medium">No Active Cart</p>
              <p className="text-orange-600 text-sm">Join a cart to start scanning</p>
            </div>
          )}

          {/* Join Cart */}
          {!hasActiveCart && (
            <div className="space-y-3">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={cartIdInput}
                  onChange={(e) => setCartIdInput(e.target.value)}
                  placeholder="Enter Cart ID or Access Code"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleJoinCart}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Join
                </button>
              </div>

              {/* Recent Carts */}
              {userCarts.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Recent Carts:</p>
                  <div className="space-y-2">
                    {userCarts.slice(0, 3).map((cart) => (
                      <button
                        key={cart.cart_id}
                        onClick={() => loadSharedCart(cart.cart_id)}
                        className="w-full text-left p-2 bg-gray-50 rounded-md hover:bg-gray-100 border"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium">{cart.access_code}</p>
                            <p className="text-xs text-gray-600">{cart.created_by_email}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm">{cart.item_count} items</p>
                            <p className="text-xs text-gray-600">${cart.total_amount.toFixed(2)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scanner Controls */}
          {hasActiveCart && (
            <div className="space-y-4">
              {/* Camera Toggle */}
              <button
                onClick={useCamera ? stopCamera : startCamera}
                disabled={isScanning || cameraLoading}
                className={`w-full py-3 rounded-lg font-medium transition-all duration-200 ${
                  useCamera 
                    ? 'bg-red-500 text-white hover:bg-red-600' 
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {cameraLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Starting Camera...</span>
                  </div>
                ) : useCamera ? (
                  'Stop Camera'
                ) : (
                  '📱 Start Camera Scanner'
                )}
              </button>

              {/* Camera View */}
              {useCamera && (
                <div className="relative bg-black rounded-lg overflow-hidden">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted
                    className="w-full h-64 object-cover"
                  />
                  
                  {/* Scanning Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-64 h-16 border-2 border-white border-dashed relative">
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-l-2 border-t-2 border-orange-400"></div>
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-r-2 border-t-2 border-orange-400"></div>
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-l-2 border-b-2 border-orange-400"></div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-r-2 border-b-2 border-orange-400"></div>
                    </div>
                  </div>
                  
                  {isScanning && (
                    <div className="absolute top-2 left-2 bg-green-500 text-white px-2 py-1 rounded text-xs">
                      Processing...
                    </div>
                  )}
                </div>
              )}

              {/* Manual Barcode Input */}
              <form onSubmit={handleManualBarcode} className="space-y-2">
                <input
                  type="text"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  placeholder="Or enter barcode manually"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!manualBarcode.trim() || isScanning}
                  className="w-full py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300"
                >
                  {isScanning ? 'Adding...' : 'Add Item'}
                </button>
              </form>
            </div>
          )}

          {/* Error Display */}
          {(scanError || sharedCartError) && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-red-600 text-sm">{scanError || sharedCartError}</p>
            </div>
          )}

          {/* Cart Items */}
          {hasActiveCart && cartData && cartData.items.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-gray-800">Cart Items:</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {cartData.items.map((item, index) => (
                  <div key={index} className="bg-gray-50 p-2 rounded border">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-gray-600">Added by: {item.added_by_email}</p>
                      </div>
                      <p className="text-sm font-medium">${item.price.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileSharedCartScanner; 