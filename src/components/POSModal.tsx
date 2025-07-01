import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiService } from '../services/apiService';
import { ConsignmentItem } from '../types';
import { useCriticalActionThrottle } from '../hooks/useButtonThrottle';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

interface POSItem {
  item: ConsignmentItem;
  quantity: number;
  total: number;
}

interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
}

interface ReceiptData {
  order_number: string;
  transaction_id: string;
  items: Array<{
    title: string;
    price: number;
    quantity: number;
    total: number;
  }>;
  total_amount: number;
  payment_method: string;
  processed_by: string;
  timestamp: string;
  customer_info: CustomerInfo;
}

interface POSModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const POSModal: React.FC<POSModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<'scanning' | 'item_confirmation' | 'checkout' | 'receipt'>('scanning');
  const [scannedItem, setScannedItem] = useState<ConsignmentItem | null>(null);
  
  // Scanning state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [useCamera, setUseCamera] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  
  // Cart state
  const [posCart, setPosCart] = useState<POSItem[]>([]);
  const [cartTotal, setCartTotal] = useState(0);
  
  // Payment state
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    name: '',
    email: '',
    phone: ''
  });
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  
  // Receipt state
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  
  // Throttling
  const { throttledAction, isActionDisabled } = useCriticalActionThrottle();
  
  // Calculate cart total whenever cart changes
  useEffect(() => {
    const total = posCart.reduce((sum, item) => sum + item.total, 0);
    setCartTotal(total);
    setPaymentAmount(total.toFixed(2));
  }, [posCart]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera(); // This will clean up both camera and barcode scanner
    };
  }, []);
  
  // Generate test item with barcode for debugging
  const generateTestItemWithBarcode = async () => {
    try {
      console.log('🧪 Generating test item with barcode...');
      const response = await apiService.generateTestData();
      
      if (response.success && response.items && response.items.length > 0) {
        const testItem = response.items[0];
        console.log('✅ Test item generated:', testItem);
        
        // Set the barcode input to the generated barcode
        const barcodeData = testItem.barcodeData || `TEST${Date.now()}`;
        setBarcodeInput(barcodeData);
        
        setScanError(null);
        console.log(`🏷️ Test barcode generated: ${barcodeData}`);
        console.log('📊 Try scanning this barcode to test the system');
        
        // Show success message
        alert(`Test item created!\nTitle: ${testItem.title}\nBarcode: ${barcodeData}\n\nThe barcode has been auto-filled in the input field. Click "Lookup" to test!`);
      } else {
        throw new Error('No test items generated');
      }
    } catch (error) {
      console.error('❌ Failed to generate test item:', error);
      setScanError('Failed to generate test item. Check console for details.');
    }
  };

  // Debug function to check database items
  const debugDatabaseItems = async () => {
    try {
      console.log('🔍 Debugging database items...');
      const response = await fetch('http://localhost:8080/api/admin/debug-barcodes', {
        headers: {
          'Authorization': `Bearer ${await user?.getIdToken()}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('📊 Database debug results:', data);
        
        console.log(`✅ Items WITH barcodes (${data.items_with_barcodes.length}):`);
        data.items_with_barcodes.forEach((item: any, index: number) => {
          console.log(`  ${index + 1}. "${item.title}" | Barcode: "${item.barcodeData}" | Status: ${item.status}`);
        });
        
        console.log(`❌ Items WITHOUT barcodes (${data.items_without_barcodes.length}):`);
        data.items_without_barcodes.forEach((item: any, index: number) => {
          console.log(`  ${index + 1}. "${item.title}" | Status: ${item.status}`);
        });
        
        // Show a summary alert
        alert(`Database Debug Results:\n\n✅ ${data.items_with_barcodes.length} items WITH barcodes\n❌ ${data.items_without_barcodes.length} items WITHOUT barcodes\n\nCheck console for detailed list.`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Failed to debug database:', error);
      setScanError('Failed to debug database. Check console for details.');
    }
  };
  
  // Barcode scanning setup
  const startBarcodeScanning = async () => {
    if (!videoRef.current) return;
    
    try {
      console.log('🔍 Starting barcode detection...');
      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;
      
      // Start continuous scanning
      await codeReader.decodeFromVideoDevice(null, videoRef.current, (result, error) => {
        if (result) {
          console.log('📊 Barcode detected:', result.getText());
          // Auto-process the barcode
          processBarcodeResult(result.getText());
        }
        
        if (error && !(error instanceof NotFoundException)) {
          console.log('🔍 Scanning for barcodes...', error.message);
        }
      });
      
      console.log('✅ Barcode scanner initialized');
    } catch (error) {
      console.error('❌ Failed to start barcode scanning:', error);
      setScanError('Failed to initialize barcode scanner');
    }
  };
  
  const stopBarcodeScanning = () => {
    if (codeReaderRef.current) {
      console.log('🛑 Stopping barcode scanner...');
      codeReaderRef.current.reset();
      codeReaderRef.current = null;
    }
  };
  
  const processBarcodeResult = async (barcodeText: string) => {
    console.log('🏷️ Processing barcode:', barcodeText);
    console.log('📏 Barcode length:', barcodeText.length);
    console.log('📋 Barcode format details:', {
      raw: barcodeText,
      trimmed: barcodeText.trim(),
      length: barcodeText.length,
      hasSpecialChars: /[^a-zA-Z0-9]/.test(barcodeText),
      startsWithNumber: /^\d/.test(barcodeText),
      containsLetters: /[a-zA-Z]/.test(barcodeText)
    });
    
    // Prevent processing the same barcode multiple times rapidly
    if (isScanning) return;
    
    setBarcodeInput(barcodeText);
    
    await throttledAction('barcode-lookup', async () => {
      setIsScanning(true);
      setScanError(null);
      
      try {
        console.log('🔍 Sending lookup request for barcode:', barcodeText);
        const result = await apiService.lookupItemByBarcode(barcodeText);
        
        if (result.success && result.available) {
          // Show item confirmation modal
          setScannedItem(result.item);
          setCurrentStep('item_confirmation');
          console.log('✅ Item found:', result.item.title);
        } else {
          console.log('❌ Item lookup failed:', result);
          setScanError(result.message || 'Item not available for sale');
        }
      } catch (error) {
        console.error('❌ Error looking up item:', error);
        
        // Enhanced error logging for debugging
        if (error instanceof Error) {
          console.log('📊 Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
          });
        }
        
        setScanError(`Failed to lookup barcode "${barcodeText}". Please check if this item has a barcode assigned.`);
      } finally {
        setIsScanning(false);
      }
    });
  };

  // Camera setup
  const startCamera = async () => {
    console.log('🎥 Starting camera...');
    setCameraLoading(true);
    setScanError(null);
    setUseCamera(false); // Reset camera state
    
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported by this browser');
      }

      console.log('📱 Requesting camera permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Use back camera if available
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      console.log('✅ Camera permission granted, stream received');
      
      // Wait a bit for the video element to be rendered
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Check if video element is available, with retry logic
      let retryCount = 0;
      const maxRetries = 10;
      
      while (!videoRef.current && retryCount < maxRetries) {
        console.log(`⏳ Waiting for video element... (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 200));
        retryCount++;
      }
      
      if (videoRef.current) {
        console.log('📺 Setting up video element...');
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        return new Promise<void>((resolve, reject) => {
          if (!videoRef.current) {
            reject(new Error('Video element not available'));
            return;
          }

          const video = videoRef.current;
          
          const onLoadedMetadata = () => {
            console.log('📹 Video metadata loaded, starting playback...');
            video.play()
              .then(() => {
                console.log('🎬 Video playing successfully');
                // Start barcode scanning
                startBarcodeScanning();
                setUseCamera(true);
                setScanError(null);
                setCameraLoading(false);
                resolve();
              })
              .catch((playError) => {
                console.error('❌ Video play failed:', playError);
                reject(playError);
              });
          };

          const onError = (event: Event) => {
            console.error('❌ Video error event:', event);
            reject(new Error('Video failed to load'));
          };

          video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
          video.addEventListener('error', onError, { once: true });
          
          // Timeout after 10 seconds
          setTimeout(() => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('error', onError);
            reject(new Error('Camera setup timeout'));
          }, 10000);
        });
      } else {
        throw new Error('Video element ref not available');
      }
    } catch (error) {
      console.error('❌ Camera setup failed:', error);
      
      let errorMessage = 'Unable to access camera. ';
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage += 'Please allow camera access and try again.';
        } else if (error.name === 'NotFoundError') {
          errorMessage += 'No camera found on this device.';
        } else if (error.name === 'NotReadableError') {
          errorMessage += 'Camera is already in use by another application.';
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += 'Unknown error occurred.';
      }
      
      setScanError(errorMessage);
      setUseCamera(false);
      setCameraLoading(false);
    }
  };
  
  const stopCamera = () => {
    // Stop barcode scanning first
    stopBarcodeScanning();
    
    // Stop camera stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setUseCamera(false);
    }
  };
  
  // Barcode scanning
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    
    await throttledAction('barcode-lookup', async () => {
      setIsScanning(true);
      setScanError(null);
      
      try {
        const result = await apiService.lookupItemByBarcode(barcodeInput.trim());
        
        if (result.success && result.available) {
          addItemToCart(result.item);
          setBarcodeInput('');
          setScanError(null);
        } else {
          setScanError(result.message || 'Item not available for sale');
        }
      } catch (error) {
        console.error('Error looking up item:', error);
        setScanError('Failed to lookup item. Please try again.');
      } finally {
        setIsScanning(false);
      }
    });
  };
  
  const addItemToCart = (item: ConsignmentItem) => {
    setPosCart(prevCart => {
      const existingItem = prevCart.find(cartItem => cartItem.item.id === item.id);
      
      if (existingItem) {
        // Update quantity
        return prevCart.map(cartItem =>
          cartItem.item.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1, total: (cartItem.quantity + 1) * cartItem.item.price }
            : cartItem
        );
      } else {
        // Add new item
        return [...prevCart, {
          item,
          quantity: 1,
          total: item.price
        }];
      }
    });
  };
  
  const removeItemFromCart = (itemId: string) => {
    setPosCart(prevCart => prevCart.filter(cartItem => cartItem.item.id !== itemId));
  };
  
  const updateItemQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItemFromCart(itemId);
      return;
    }
    
    setPosCart(prevCart =>
      prevCart.map(cartItem =>
        cartItem.item.id === itemId
          ? { ...cartItem, quantity: newQuantity, total: newQuantity * cartItem.item.price }
          : cartItem
      )
    );
  };
  
  // Payment processing
  const handlePayment = async () => {
    if (!validatePaymentForm()) return;
    
    await throttledAction('process-payment', async () => {
      setIsProcessing(true);
      setPaymentError(null);
      
      try {
        const paymentData = {
          cart_items: posCart.map(cartItem => ({
            item_id: cartItem.item.id,
            quantity: cartItem.quantity
          })),
          customer_info: customerInfo,
          payment_method: paymentMethod,
          payment_amount: parseFloat(paymentAmount)
        };
        
        const result = await apiService.processInhouseSale(paymentData);
        
        if (result.success) {
          setReceiptData(result.receipt_data);
          setCurrentStep('receipt');
        } else {
          setPaymentError(result.message || 'Payment processing failed');
        }
      } catch (error) {
        console.error('Payment error:', error);
        setPaymentError('Payment processing failed. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    });
  };
  
  const validatePaymentForm = () => {
    if (!customerInfo.name.trim()) {
      setPaymentError('Customer name is required');
      return false;
    }
    
    if (posCart.length === 0) {
      setPaymentError('Cart is empty');
      return false;
    }
    
    const paymentAmountNum = parseFloat(paymentAmount);
    if (isNaN(paymentAmountNum) || Math.abs(paymentAmountNum - cartTotal) > 0.01) {
      setPaymentError(`Payment amount must be $${cartTotal.toFixed(2)}`);
      return false;
    }
    
    return true;
  };
  
  // Receipt printing
  const printReceipt = () => {
    if (!receiptData) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${receiptData.order_number}</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 12px; margin: 20px; }
            .receipt { max-width: 300px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
            .item-row { display: flex; justify-content: space-between; margin: 5px 0; }
            .total-row { border-top: 1px solid #000; padding-top: 10px; margin-top: 10px; font-weight: bold; }
            .footer { text-align: center; margin-top: 20px; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="header">
              <h2>SUMMIT GEAR EXCHANGE</h2>
              <p>In-House Sale Receipt</p>
              <p>Order #: ${receiptData.order_number}</p>
              <p>Date: ${receiptData.timestamp}</p>
            </div>
            
            <div class="customer-info">
              <p><strong>Customer:</strong> ${receiptData.customer_info.name}</p>
              ${receiptData.customer_info.email ? `<p><strong>Email:</strong> ${receiptData.customer_info.email}</p>` : ''}
              ${receiptData.customer_info.phone ? `<p><strong>Phone:</strong> ${receiptData.customer_info.phone}</p>` : ''}
            </div>
            
            <div class="items">
              <h3>Items Purchased:</h3>
              ${receiptData.items.map((item: any) => `
                <div class="item-row">
                  <span>${item.title} x${item.quantity}</span>
                  <span>$${item.total.toFixed(2)}</span>
                </div>
              `).join('')}
            </div>
            
            <div class="total-row">
              <div class="item-row">
                <span>TOTAL:</span>
                <span>$${receiptData.total_amount.toFixed(2)}</span>
              </div>
              <div class="item-row">
                <span>Payment Method:</span>
                <span>${receiptData.payment_method}</span>
              </div>
            </div>
            
            <div class="footer">
              <p>Transaction ID: ${receiptData.transaction_id}</p>
              <p>Processed by: ${receiptData.processed_by}</p>
              <p>Thank you for your business!</p>
            </div>
          </div>
          
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
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
  
  // Reset modal
  const resetModal = () => {
    setCurrentStep('scanning');
    setBarcodeInput('');
    setPosCart([]);
    setCustomerInfo({ name: '', email: '', phone: '' });
    setPaymentAmount('');
    setReceiptData(null);
    setScanError(null);
    setPaymentError(null);
    stopCamera(); // This will also stop barcode scanning
  };
  
  // Handle modal close
  const handleClose = () => {
    // If we have items in cart and we're in scanning mode, go to checkout instead of closing
    if (posCart.length > 0 && currentStep === 'scanning') {
      setCurrentStep('checkout');
      return;
    }
    
    // Otherwise, reset and close
    resetModal();
    onClose();
  };
  
  // Don't render if not open
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">🏪 Point of Sale System</h2>
              <p className="text-orange-100 mt-1">In-House Sales & Barcode Scanning</p>
            </div>
            <button
              onClick={handleClose}
              className="text-white hover:text-gray-200 focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Step indicator */}
          <div className="flex justify-center mt-4 space-x-4">
            {['scanning', 'checkout', 'receipt'].map((step, index) => (
              <div
                key={step}
                className={`flex items-center ${index < ['scanning', 'checkout', 'receipt'].indexOf(currentStep === 'item_confirmation' ? 'scanning' : currentStep) ? 'text-green-200' : 
                  (step === currentStep || (currentStep === 'item_confirmation' && step === 'scanning')) ? 'text-white' : 'text-orange-200'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index < ['scanning', 'checkout', 'receipt'].indexOf(currentStep === 'item_confirmation' ? 'scanning' : currentStep) ? 'bg-green-500' :
                  (step === currentStep || (currentStep === 'item_confirmation' && step === 'scanning')) ? 'bg-white text-orange-500' : 'bg-orange-400'
                }`}>
                  {index + 1}
                </div>
                <span className="ml-2 text-sm font-medium capitalize">{step}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Scanning Step */}
          {currentStep === 'scanning' && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Scan Item Barcodes</h3>
                <p className="text-gray-600">Use the camera or enter barcode manually</p>
              </div>
              
              {/* Camera Toggle */}
              <div className="flex justify-center space-x-4">
                <button
                  onClick={useCamera ? stopCamera : startCamera}
                  disabled={isScanning || cameraLoading}
                  className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                    useCamera 
                      ? 'bg-red-500 text-white hover:bg-red-600 hover:shadow-xl' 
                      : 'bg-blue-500 text-white hover:bg-blue-600 hover:shadow-xl'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {cameraLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Starting Camera...</span>
                      </>
                    ) : useCamera ? (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>Stop Camera</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>📱 Start Camera Scanner</span>
                      </>
                    )}
                  </div>
                </button>
                
                {useCamera && (
                  <button
                    onClick={() => {
                      // Focus on the barcode input after stopping camera
                      stopCamera();
                      setTimeout(() => {
                        if (barcodeInputRef.current) {
                          barcodeInputRef.current.focus();
                        }
                      }, 100);
                    }}
                    className="px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium"
                  >
                    📝 Switch to Manual Entry
                  </button>
                )}
              </div>
              
              {/* Camera Loading State */}
              {cameraLoading && (
                <div className="flex flex-col items-center space-y-4 py-8 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                  <p className="text-gray-600 font-medium">Starting camera...</p>
                  <p className="text-sm text-gray-500">Please allow camera access when prompted</p>
                  <div className="text-xs text-gray-400 text-center space-y-1">
                    <p>1. Click "Allow" when browser asks for camera permission</p>
                    <p>2. Wait for camera to initialize</p>
                    <p>3. Camera view will appear below</p>
                  </div>
                </div>
              )}

              {/* Camera View with Barcode Scanner */}
              {(useCamera || cameraLoading) && (
                <div className="flex flex-col items-center space-y-4">
                  {/* Camera Viewfinder */}
                  <div className="relative bg-black rounded-lg overflow-hidden shadow-xl">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted
                      className="w-[640px] h-[480px] object-cover bg-gray-800"
                      onLoadedMetadata={() => {
                        console.log('📹 Camera video metadata loaded');
                        if (videoRef.current) {
                          console.log('📏 Video dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
                        }
                      }}
                      onCanPlay={() => {
                        console.log('📺 Video can play');
                      }}
                      onPlaying={() => {
                        console.log('🎬 Video is playing');
                      }}
                      onError={(e) => {
                        console.error('❌ Video error event:', e);
                        setScanError('Camera video failed to load');
                        setUseCamera(false);
                        setCameraLoading(false);
                      }}
                    />
                    
                    {/* Loading Overlay */}
                    {cameraLoading && (
                      <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                        <div className="text-center text-white">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                          <p className="text-sm">Initializing camera...</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Barcode Scanning Overlay (only when camera is ready) */}
                    {useCamera && !cameraLoading && (
                      <div className="camera-overlay absolute inset-0 flex items-center justify-center pointer-events-none">
                        {/* Lighter overlay with clear scanning area */}
                        <div className="absolute inset-0 bg-black bg-opacity-20"></div>
                        
                        {/* Scanning frame */}
                        <div className="relative z-10 pointer-events-none">
                          {/* Main scanning rectangle */}
                          <div className="w-96 h-24 border-2 border-white border-dashed bg-transparent relative">
                            {/* Corner brackets */}
                            <div className="absolute -top-1 -left-1 w-6 h-6 border-l-4 border-t-4 border-orange-400 bg-white bg-opacity-90"></div>
                            <div className="absolute -top-1 -right-1 w-6 h-6 border-r-4 border-t-4 border-orange-400 bg-white bg-opacity-90"></div>
                            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-l-4 border-b-4 border-orange-400 bg-white bg-opacity-90"></div>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-r-4 border-b-4 border-orange-400 bg-white bg-opacity-90"></div>
                            
                            {/* Scanning line animation */}
                            <div className="absolute inset-0 overflow-hidden">
                              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-pulse"></div>
                            </div>
                          </div>
                          
                          {/* Instructions */}
                          <div className="text-center mt-4">
                            <p className="text-white text-sm font-medium bg-black bg-opacity-80 px-4 py-2 rounded-full shadow-lg">
                              📷 Position barcode within the frame - Auto-detection active
                            </p>
                            {isScanning && (
                              <p className="text-orange-300 text-xs mt-2 bg-black bg-opacity-80 px-3 py-1 rounded-full">
                                🔄 Processing barcode...
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Camera controls overlay (only when ready) */}
                    {useCamera && !cameraLoading && (
                      <div className="absolute top-3 right-3 flex space-x-2">
                        <button
                          onClick={() => {
                            // Toggle overlay to see raw camera feed
                            const overlay = document.querySelector('.camera-overlay') as HTMLElement;
                            if (overlay) {
                              overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
                            }
                          }}
                          className="w-10 h-10 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
                          title="Toggle Overlay"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button
                          onClick={stopCamera}
                          className="w-10 h-10 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
                          title="Stop Camera"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Camera Instructions (only when ready) */}
                  {useCamera && !cameraLoading && (
                    <div className="text-center space-y-2">
                      <p className="text-sm text-gray-600">
                        💡 <strong>Tip:</strong> Hold your device steady and ensure the barcode is well-lit
                      </p>
                      <p className="text-xs text-gray-500">
                        Auto-detection is active - simply point the camera at a barcode and it will be scanned automatically
                      </p>
                      <div className="flex justify-center space-x-6 mt-3">
                        <div className="text-xs text-center">
                          <div className="w-4 h-4 bg-green-400 rounded-full mx-auto mb-1"></div>
                          <span className="text-gray-500">Camera Active</span>
                        </div>
                        <div className="text-xs text-center">
                          <div className={`w-4 h-4 rounded-full mx-auto mb-1 ${isScanning ? 'bg-orange-400 animate-pulse' : 'bg-blue-400 animate-pulse'}`}></div>
                          <span className="text-gray-500">{isScanning ? 'Processing' : 'Auto-Scanning'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Manual Barcode Input */}
              <form onSubmit={handleBarcodeSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {useCamera ? 'Or Enter Barcode Manually' : 'Enter Barcode'}
                  </label>
                  <div className="flex space-x-2">
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      placeholder={useCamera ? "Type barcode here if camera scan fails..." : "Scan or type barcode here..."}
                      className={`flex-1 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                        useCamera 
                          ? 'border-gray-300 focus:ring-orange-500 bg-gray-50' 
                          : 'border-orange-300 focus:ring-orange-500 bg-white shadow-lg'
                      }`}
                      autoFocus={!useCamera}
                    />
                    <button
                      type="button"
                      onClick={generateTestItemWithBarcode}
                      disabled={isScanning}
                      className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium shadow-lg hover:shadow-xl"
                      title="Generate test item with barcode for testing"
                    >
                      <div className="flex items-center space-x-1">
                        <span>🧪</span>
                        <span className="hidden sm:inline">Test</span>
                      </div>
                    </button>
                    <button
                      type="submit"
                      disabled={!barcodeInput.trim() || isScanning || isActionDisabled('barcode-lookup')}
                      className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium shadow-lg hover:shadow-xl"
                    >
                      <div className="flex items-center space-x-2">
                        {isScanning ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            <span>Looking up...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <span>Lookup</span>
                          </>
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              </form>
              
              {/* Debug Panel (only in development) */}
              {import.meta.env.DEV && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p><strong>Debug Info:</strong></p>
                      <p>• Camera Loading: {cameraLoading ? '✅' : '❌'}</p>
                      <p>• Camera Active: {useCamera ? '✅' : '❌'}</p>
                      <p>• Video Ref: {videoRef.current ? '✅' : '❌'}</p>
                      <p>• Video Stream: {videoRef.current?.srcObject ? '✅' : '❌'}</p>
                    </div>
                    <button
                      onClick={debugDatabaseItems}
                      disabled={isScanning}
                      className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:opacity-50"
                      title="Check what items exist in database"
                    >
                      🔍 DB
                    </button>
                  </div>
                  <p className="text-gray-500">Check browser console for detailed logs</p>
                </div>
              )}

              {/* Scan Error */}
              {scanError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-red-600 text-sm">{scanError}</p>
                  <button
                    onClick={() => {
                      setScanError(null);
                      setUseCamera(false);
                      setCameraLoading(false);
                    }}
                    className="mt-2 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                  >
                    Clear Error & Try Manual Entry
                  </button>
                </div>
              )}
              
              {/* Current Cart Preview */}
              {posCart.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-2">Items in Cart ({posCart.length})</h4>
                  <div className="space-y-2">
                    {posCart.slice(0, 3).map((cartItem) => (
                      <div key={cartItem.item.id} className="flex justify-between text-sm">
                        <span>{cartItem.item.title} x{cartItem.quantity}</span>
                        <span>${cartItem.total.toFixed(2)}</span>
                      </div>
                    ))}
                    {posCart.length > 3 && (
                      <p className="text-xs text-gray-500">...and {posCart.length - 3} more items</p>
                    )}
                  </div>
                  <div className="flex justify-between mt-3 pt-2 border-t border-gray-200 font-medium">
                    <span>Total:</span>
                    <span>${cartTotal.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => setCurrentStep('checkout')}
                    className="w-full mt-3 px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors"
                  >
                    Review Cart & Checkout
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Item Confirmation Step */}
          {currentStep === 'item_confirmation' && scannedItem && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Item Found!</h3>
                <p className="text-gray-600">Would you like to add this item to the cart?</p>
              </div>
              
              {/* Item Preview */}
              <div className="bg-white border-2 border-orange-200 rounded-lg p-6">
                <div className="flex space-x-4">
                  <div className="flex-shrink-0">
                    {scannedItem.images && scannedItem.images.length > 0 ? (
                      <img
                        src={scannedItem.images[0]}
                        alt={scannedItem.title}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">{scannedItem.title}</h4>
                    <p className="text-gray-600 text-sm mb-3">{scannedItem.description}</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Price:</span>
                        <span className="font-medium text-green-600">${scannedItem.price.toFixed(2)}</span>
                      </div>
                      {scannedItem.brand && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Brand:</span>
                          <span className="text-gray-700">{scannedItem.brand}</span>
                        </div>
                      )}
                      {scannedItem.category && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Category:</span>
                          <span className="text-gray-700">{scannedItem.category}</span>
                        </div>
                      )}
                      {scannedItem.size && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Size:</span>
                          <span className="text-gray-700">{scannedItem.size}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex space-x-4">
                <button
                  onClick={() => {
                    setCurrentStep('scanning');
                    setScannedItem(null);
                  }}
                  className="flex-1 px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium"
                >
                  Skip Item
                </button>
                <button
                  onClick={() => {
                    addItemToCart(scannedItem);
                    setCurrentStep('scanning');
                    setScannedItem(null);
                    console.log('✅ Item added to cart:', scannedItem.title);
                  }}
                  className="flex-1 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>Add to Cart</span>
                </button>
              </div>
            </div>
          )}
          
          {/* Checkout Step */}
          {currentStep === 'checkout' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-800">Cart Review</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentStep('scanning')}
                    className="px-4 py-2 text-orange-600 hover:text-orange-800 transition-colors"
                  >
                    ← Back to Scanning
                  </button>
                  <button
                    onClick={() => {
                      resetModal();
                      onClose();
                    }}
                    className="px-4 py-2 text-red-600 hover:text-red-800 transition-colors"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>
              
              {posCart.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Cart is empty. Go back to scan items.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {posCart.map((cartItem) => (
                      <div key={cartItem.item.id} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-800">{cartItem.item.title}</h4>
                          <p className="text-sm text-gray-600">
                            {cartItem.item.brand} • {cartItem.item.category} • ${cartItem.item.price.toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => updateItemQuantity(cartItem.item.id, cartItem.quantity - 1)}
                              className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                            >
                              <span className="text-lg font-medium">−</span>
                            </button>
                            <span className="w-8 text-center font-medium">{cartItem.quantity}</span>
                            <button
                              onClick={() => updateItemQuantity(cartItem.item.id, cartItem.quantity + 1)}
                              className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                            >
                              <span className="text-lg font-medium">+</span>
                            </button>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-gray-800">${cartItem.total.toFixed(2)}</p>
                          </div>
                          <button
                            onClick={() => removeItemFromCart(cartItem.item.id)}
                            className="w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center text-red-600"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Customer Information */}
                  <div className="space-y-4 bg-blue-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-800">Customer Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <input
                          type="text"
                          value={customerInfo.name}
                          onChange={(e) => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          value={customerInfo.email}
                          onChange={(e) => setCustomerInfo(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input
                          type="tel"
                          value={customerInfo.phone}
                          onChange={(e) => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Payment Method */}
                  <div className="space-y-4 bg-green-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-800">Payment Method</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                          paymentMethod === 'cash' 
                            ? 'border-orange-500 bg-orange-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setPaymentMethod('cash')}
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="radio"
                            name="paymentMethod"
                            value="cash"
                            checked={paymentMethod === 'cash'}
                            onChange={() => setPaymentMethod('cash')}
                            className="text-orange-500"
                          />
                          <div>
                            <h5 className="font-medium text-gray-900">💵 Cash</h5>
                            <p className="text-sm text-gray-600">Physical cash payment</p>
                          </div>
                        </div>
                      </div>
                      
                      <div
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                          paymentMethod === 'card' 
                            ? 'border-orange-500 bg-orange-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setPaymentMethod('card')}
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="radio"
                            name="paymentMethod"
                            value="card"
                            checked={paymentMethod === 'card'}
                            onChange={() => setPaymentMethod('card')}
                            className="text-orange-500"
                          />
                          <div>
                            <h5 className="font-medium text-gray-900">💳 Card</h5>
                            <p className="text-sm text-gray-600">Credit/Debit card</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Payment Error */}
                  {paymentError && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3">
                      <p className="text-red-600 text-sm">{paymentError}</p>
                    </div>
                  )}
                  
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold text-gray-800">Total Amount:</span>
                      <span className="text-2xl font-bold text-orange-600">${cartTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <button
                    onClick={handlePayment}
                    disabled={isProcessing || isActionDisabled('process-payment')}
                    className="w-full px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Processing Payment...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Complete Sale - ${cartTotal.toFixed(2)}</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
          

          
          {/* Receipt Step */}
          {currentStep === 'receipt' && receiptData && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Sale Completed Successfully!</h3>
                <p className="text-gray-600">Order #{receiptData.order_number}</p>
              </div>
              
              {/* Receipt Preview */}
              <div className="bg-gray-50 rounded-lg p-6 max-w-md mx-auto font-mono text-sm">
                <div className="text-center border-b-2 border-gray-300 pb-4 mb-4">
                  <h4 className="font-bold">SUMMIT GEAR EXCHANGE</h4>
                  <p>In-House Sale Receipt</p>
                  <p>Order #: {receiptData.order_number}</p>
                  <p>Date: {receiptData.timestamp}</p>
                </div>
                
                <div className="mb-4">
                  <p><strong>Customer:</strong> {receiptData.customer_info.name}</p>
                  {receiptData.customer_info.email && <p><strong>Email:</strong> {receiptData.customer_info.email}</p>}
                  {receiptData.customer_info.phone && <p><strong>Phone:</strong> {receiptData.customer_info.phone}</p>}
                </div>
                
                <div className="mb-4">
                  <h5 className="font-bold mb-2">Items Purchased:</h5>
                  {receiptData.items.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between mb-1">
                      <span>{item.title} x{item.quantity}</span>
                      <span>${item.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-gray-300 pt-2">
                  <div className="flex justify-between font-bold">
                    <span>TOTAL:</span>
                    <span>${receiptData.total_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Payment:</span>
                    <span>{receiptData.payment_method}</span>
                  </div>
                </div>
                
                <div className="text-center mt-4 text-xs">
                  <p>Transaction ID: {receiptData.transaction_id}</p>
                  <p>Processed by: {receiptData.processed_by}</p>
                  <p>Thank you for your business!</p>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex space-x-4 justify-center">
                <button
                  onClick={printReceipt}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium flex items-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print Receipt</span>
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
                >
                  New Sale
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default POSModal; 