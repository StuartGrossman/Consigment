import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ConsignmentItem } from '../types';
import { apiService } from '../services/apiService';
import { useCriticalActionThrottle } from '../hooks/useButtonThrottle';
import { useUserRateLimiter } from '../hooks/useUserRateLimiter';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

interface AdminCartItem {
  item: ConsignmentItem;
  quantity: number;
  total: number;
}

interface CustomerInfo {
  uid?: string;
  name: string;
  email: string;
  phone: string;
  points?: number;
}

interface AdminCartModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ConsignmentItem[];
}

const AdminCartModal: React.FC<AdminCartModalProps> = ({ isOpen, onClose, items }) => {
  const { user } = useAuth();
  
  // Load cart state from localStorage on component mount
  const loadCartState = () => {
    try {
      const savedCart = localStorage.getItem('adminCart');
      const savedCustomer = localStorage.getItem('adminCartCustomer');
      const savedPoints = localStorage.getItem('adminCartPoints');
      const savedPaymentMethod = localStorage.getItem('adminCartPaymentMethod');
      
      return {
        cart: savedCart ? JSON.parse(savedCart) : [],
        customer: savedCustomer ? JSON.parse(savedCustomer) : null,
        points: savedPoints ? parseInt(savedPoints) : 0,
        paymentMethod: savedPaymentMethod ? JSON.parse(savedPaymentMethod) : 'cash'
      };
    } catch (error) {
      console.error('Error loading admin cart state:', error);
      return { cart: [], customer: null, points: 0, paymentMethod: 'cash' };
    }
  };

  const saveCartState = (cart: AdminCartItem[], customer: any, points: number, paymentMethod: string) => {
    try {
      localStorage.setItem('adminCart', JSON.stringify(cart));
      localStorage.setItem('adminCartCustomer', JSON.stringify(customer));
      localStorage.setItem('adminCartPoints', points.toString());
      localStorage.setItem('adminCartPaymentMethod', JSON.stringify(paymentMethod));
    } catch (error) {
      console.error('Error saving admin cart state:', error);
    }
  };

  const clearCartState = () => {
    try {
      localStorage.removeItem('adminCart');
      localStorage.removeItem('adminCartCustomer');
      localStorage.removeItem('adminCartPoints');
      localStorage.removeItem('adminCartPaymentMethod');
    } catch (error) {
      console.error('Error clearing admin cart state:', error);
    }
  };

  const initialState = loadCartState();
  
  const [adminCart, setAdminCart] = useState<AdminCartItem[]>(initialState.cart);
  const [cartTotal, setCartTotal] = useState(0);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    name: '',
    email: '',
    phone: ''
  });
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(initialState.customer);
  const [pointsToApply, setPointsToApply] = useState(initialState.points);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'points'>(initialState.paymentMethod);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [cardReaderAvailable, setCardReaderAvailable] = useState(false);
  const [isCheckingCardReader, setIsCheckingCardReader] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ConsignmentItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [inventoryWarning, setInventoryWarning] = useState<string | null>(null);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);

  // Barcode mapping state
  const [showBarcodeMapping, setShowBarcodeMapping] = useState(false);
  const [physicalBarcode, setPhysicalBarcode] = useState<string>('');
  const [selectedSystemBarcode, setSelectedSystemBarcode] = useState<string>('');
  const [isMappingBarcode, setIsMappingBarcode] = useState(false);

  // Barcode scanning state
  const [useCamera, setUseCamera] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraPopupOpen, setCameraPopupOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  // Throttling and rate limiting
  const { executeWithRateLimit } = useUserRateLimiter();

  // Check for card reader availability
  const checkCardReader = async () => {
    setIsCheckingCardReader(true);
    try {
      console.log('💳 [CARD READER] Checking for card reader...');
      
      // Check if Web Serial API is available (for USB card readers)
      if ('serial' in navigator) {
        console.log('💳 [CARD READER] Web Serial API available');
        setCardReaderAvailable(true);
        return;
      }
      
      // Check if Web USB API is available
      if ('usb' in navigator) {
        console.log('💳 [CARD READER] Web USB API available');
        setCardReaderAvailable(true);
        return;
      }
      
      // Check for Bluetooth API (for wireless card readers)
      if ('bluetooth' in navigator) {
        console.log('💳 [CARD READER] Web Bluetooth API available');
        setCardReaderAvailable(true);
        return;
      }
      
      // Check for HID API (Human Interface Device - for some card readers)
      if ('hid' in navigator) {
        console.log('💳 [CARD READER] Web HID API available');
        setCardReaderAvailable(true);
        return;
      }
      
      console.log('💳 [CARD READER] No card reader APIs available');
      setCardReaderAvailable(false);
      
    } catch (error) {
      console.error('❌ [CARD READER] Error checking card reader:', error);
      setCardReaderAvailable(false);
    } finally {
      setIsCheckingCardReader(false);
    }
  };

  // Calculate cart total whenever cart changes
  useEffect(() => {
    const total = adminCart.reduce((sum, item) => sum + item.total, 0);
    setCartTotal(total);
  }, [adminCart]);

  // Update available points when customer is selected
  useEffect(() => {
    if (selectedCustomer && selectedCustomer.points) {
      setAvailablePoints(selectedCustomer.points);
      if (pointsToApply === 0) {
        setPointsToApply(0);
      }
    } else {
      setAvailablePoints(0);
      setPointsToApply(0);
    }
  }, [selectedCustomer, pointsToApply]);

  // Save cart state whenever it changes
  useEffect(() => {
    saveCartState(adminCart, selectedCustomer, pointsToApply, paymentMethod);
  }, [adminCart, selectedCustomer, pointsToApply, paymentMethod]);

  // Initialize customer info when selectedCustomer is loaded from localStorage
  useEffect(() => {
    if (selectedCustomer) {
      setCustomerInfo({
        uid: selectedCustomer.uid,
        name: selectedCustomer.displayName || selectedCustomer.email || 'Unknown Customer',
        email: selectedCustomer.email || '',
        phone: selectedCustomer.phoneNumber || '',
        points: selectedCustomer.points || 0
      });
    }
  }, [selectedCustomer]);

  // Note: Auto-add functionality removed - items should only be added manually or via scanning

  // Calculate final total after points
  const finalTotal = Math.max(0, cartTotal - (pointsToApply * 0.01)); // Assuming 1 point = $0.01

  // Check for card reader on mount
  useEffect(() => {
    checkCardReader();
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (useCamera || cameraPopupOpen) {
        console.log('🧹 Cleaning up camera on unmount');
        stopCamera();
      }
    };
  }, [useCamera, cameraPopupOpen]);

  // Debug camera popup state
  useEffect(() => {
    console.log('🎥 Camera popup state changed:', { cameraPopupOpen, useCamera, cameraLoading });
  }, [cameraPopupOpen, useCamera, cameraLoading]);

  // Camera and barcode scanning functions
  const startCamera = async () => {
    console.log('📱 [CAMERA] Starting camera...');
    console.log('📱 [CAMERA] Camera loading state:', cameraLoading);
    console.log('📱 [CAMERA] Camera popup state:', cameraPopupOpen);
    console.log('📱 [CAMERA] Use camera state:', useCamera);
    
    setCameraLoading(true);
    setScanError(null);
    
    // Immediately open the camera popup
    setCameraPopupOpen(true);
    setUseCamera(true);
    
    try {
      console.log('📱 [CAMERA] Requesting camera permissions...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Use back camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      console.log('📱 [CAMERA] Camera stream obtained:', stream);
      console.log('📱 [CAMERA] Video tracks:', stream.getVideoTracks());
      
      if (videoRef.current) {
        console.log('📱 [CAMERA] Setting video source object...');
        videoRef.current.srcObject = stream;
        
        return new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;
          
          const onLoadedMetadata = () => {
            console.log('📱 [CAMERA] Video metadata loaded, starting playback...');
            video.play()
              .then(() => {
                console.log('📱 [CAMERA] Camera started successfully');
                console.log('📱 [CAMERA] Video dimensions:', video.videoWidth, 'x', video.videoHeight);
                startBarcodeScanning();
                setCameraLoading(false);
                resolve();
              })
              .catch((playError) => {
                console.error('📱 [CAMERA] Video play failed:', playError);
                reject(playError);
              });
          };

          video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
          video.addEventListener('error', (videoError) => {
            console.error('📱 [CAMERA] Video error event:', videoError);
            reject(videoError);
          }, { once: true });
        });
      } else {
        console.error('📱 [CAMERA] Video ref is null!');
        throw new Error('Video element not available');
      }
    } catch (error) {
      console.error('❌ [CAMERA] Camera setup failed:', error);
      console.error('❌ [CAMERA] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown error type'
      });
      setScanError('Unable to access camera. Please check permissions.');
      setUseCamera(false);
      setCameraLoading(false);
      setCameraPopupOpen(false); // Close popup on error
    }
  };

  const stopCamera = () => {
    console.log('🛑 Stopping camera and closing popup');
    
    // Stop barcode scanning
    if (codeReaderRef.current) {
      console.log('🛑 Resetting code reader...');
      codeReaderRef.current.reset();
      codeReaderRef.current = null;
    }
    
    // Stop camera stream
    if (videoRef.current && videoRef.current.srcObject) {
      console.log('🛑 Stopping camera stream...');
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => {
        console.log('🛑 Stopping track:', track.kind);
        track.stop();
      });
      videoRef.current.srcObject = null;
    }
    
    // Reset all camera states
    setUseCamera(false);
    setCameraPopupOpen(false);
    setCameraLoading(false);
    setScanError(null);
  };

  const closeCameraPopup = () => {
    console.log('🛑 Closing camera popup');
    setCameraPopupOpen(false);
    stopCamera();
  };

  const startBarcodeScanning = async () => {
    console.log('🔍 [SCANNER] Starting barcode scanning...');
    console.log('🔍 [SCANNER] Video ref exists:', !!videoRef.current);
    console.log('🔍 [SCANNER] Video ref current:', videoRef.current);
    
    if (!videoRef.current) {
      console.error('🔍 [SCANNER] Video ref is null, cannot start scanning');
      return;
    }
    
    try {
      console.log('🔍 [SCANNER] Creating BrowserMultiFormatReader...');
      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;
      console.log('🔍 [SCANNER] Code reader created:', codeReader);
      
      console.log('🔍 [SCANNER] Setting up decode callback...');
      
      // Use optimized settings for faster scanning
      await codeReader.decodeFromVideoDevice(null, videoRef.current, (result: any, error: any) => {
        if (result) {
          console.log('✅ [SCANNER] Barcode detected!');
          console.log('✅ [SCANNER] Barcode text:', result.getText());
          console.log('📊 [SCANNER] Barcode format:', result.getBarcodeFormat());
          console.log('🎯 [SCANNER] Processing barcode result...');
          processBarcodeResult(result.getText());
        }
        
        if (error) {
          if (error instanceof NotFoundException) {
            // This is normal - no barcode found in current frame
            // Reduced logging for better performance
            if (Math.random() < 0.05) { // Log only 5% of NotFoundException errors
              console.log('🔍 [SCANNER] Scanning...');
            }
          } else {
            console.log('⚠️ [SCANNER] Scanning error:', error.message);
          }
        }
      });
      
      console.log('🎥 [SCANNER] Barcode scanner initialized successfully');
      console.log('🎥 [SCANNER] Scanner is now active and listening for barcodes');
      
      // Add a periodic log to confirm scanning is active (less frequent for better performance)
      const scanInterval = setInterval(() => {
        if (codeReaderRef.current && useCamera) {
          console.log('🔍 [SCANNER] Scanner active...');
        } else {
          clearInterval(scanInterval);
        }
      }, 5000); // Log every 5 seconds instead of 3
      
      // Store the interval ID for cleanup
      const cleanupInterval = () => {
        clearInterval(scanInterval);
      };
      
      // Clean up interval when component unmounts or camera stops
      return cleanupInterval;
    } catch (error) {
      console.error('❌ [SCANNER] Failed to start barcode scanning:', error);
      console.error('❌ [SCANNER] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown error type',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      setScanError('Failed to initialize barcode scanner');
    }
  };

  // Show detailed success message for scanned items
  const showScanSuccessMessage = (item: ConsignmentItem, isUpdate: boolean, quantity: number) => {
    const successMsg = document.createElement('div');
    successMsg.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-md';
    
    successMsg.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-white">
            ${isUpdate ? 'Cart Updated!' : 'Item Added to Cart!'}
          </p>
          <p class="text-sm text-green-100 mt-1 truncate">
            <strong>${item.title}</strong>
          </p>
          <div class="text-xs text-green-100 mt-1 space-y-1">
            <div>Price: <span class="font-medium">$${item.price}</span></div>
            <div>Quantity: <span class="font-medium">${quantity}</span></div>
            <div>Total: <span class="font-medium">$${(item.price * quantity).toFixed(2)}</span></div>
            ${item.brand ? `<div>Brand: <span class="font-medium">${item.brand}</span></div>` : ''}
            ${item.category ? `<div>Category: <span class="font-medium">${item.category}</span></div>` : ''}
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(successMsg);
    
    setTimeout(() => {
      if (document.body.contains(successMsg)) {
        document.body.removeChild(successMsg);
      }
    }, 3000);
  };

  const processBarcodeResult = async (barcodeText: string) => {
    console.log('🔄 [PROCESS] Starting to process barcode:', barcodeText);
    console.log('🔄 [PROCESS] Current scanning state:', isScanning);
    console.log('🔄 [PROCESS] Last scanned barcode:', lastScannedBarcode);
    
    setLastScannedBarcode(barcodeText);
    
    if (isScanning) {
      console.log('⏳ [PROCESS] Already processing barcode, skipping:', barcodeText);
      return;
    }
    
    console.log('🔄 [PROCESS] Setting scanning state to true...');
    setIsScanning(true);
    setScanError(null);
    
    try {
      console.log('🌐 [PROCESS] Calling API to lookup item by barcode...');
      console.log('🌐 [PROCESS] Barcode text being sent:', barcodeText);
      console.log('🌐 [PROCESS] API service instance:', apiService);
      
      const result = await apiService.lookupItemByBarcode(barcodeText);
      console.log('📡 [PROCESS] API response received:', result);
      console.log('📡 [PROCESS] Response success:', result.success);
      console.log('📡 [PROCESS] Response available:', result.available);
      console.log('📡 [PROCESS] Response message:', result.message);
      console.log('📡 [PROCESS] Response item:', result.item);
      
      if (result.success && result.available) {
        console.log('✅ [PROCESS] Item found and available:', result.item?.title);
        console.log('✅ [PROCESS] Adding item to cart...');
        
        // Check if item already exists in cart BEFORE adding
        const existingCartItem = adminCart.find(cartItem => cartItem.item.id === result.item.id);
        const isUpdate = existingCartItem !== undefined;
        const newQuantity = isUpdate ? existingCartItem.quantity + 1 : 1;
        
        // Add item to cart
        await addItemToCart(result.item);
        setScanError(null);
        
        // Stop scanning and close camera popup after a brief delay
        if (codeReaderRef.current) {
          console.log('🔄 [PROCESS] Resetting code reader...');
          codeReaderRef.current.reset();
        }
        
        // Show detailed success message immediately after adding
        console.log('🔄 [PROCESS] Creating detailed success message...');
        showScanSuccessMessage(result.item, isUpdate, newQuantity);
        
        // Close camera popup after showing success message
        setTimeout(() => {
          console.log('🔄 [PROCESS] Closing camera popup after success...');
          closeCameraPopup();
        }, 1500);
      } else {
        console.log('❌ [PROCESS] Item lookup failed:', result.message);
        console.log('❌ [PROCESS] Setting scan error...');
        setScanError(result.message || 'Item not available for sale');
        // Show barcode mapping option for failed lookups
        setShowBarcodeMapping(true);
        setPhysicalBarcode(barcodeText);
      }
    } catch (error) {
      console.error('❌ [PROCESS] Error looking up item:', error);
      console.error('❌ [PROCESS] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown error type',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      setScanError('Failed to lookup item. Please try again.');
      // Show barcode mapping option for failed lookups
      setShowBarcodeMapping(true);
      setPhysicalBarcode(barcodeText);
    } finally {
      console.log('🏁 [PROCESS] Finished processing barcode');
      console.log('🏁 [PROCESS] Setting scanning state to false...');
      setIsScanning(false);
    }
  };

  const mapBarcode = async () => {
    if (!physicalBarcode || !selectedSystemBarcode) {
      setScanError('Please select a system barcode to map to');
      return;
    }

    setIsMappingBarcode(true);
    try {
      // Find the item with the selected system barcode
      const item = items.find(item => item.barcodeData === selectedSystemBarcode);
      if (!item) {
        setScanError('Selected system barcode not found in items');
        return;
      }

      // Call the API to create the barcode mapping
      const response = await fetch(`http://localhost:8080/api/admin/map-barcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user?.getIdToken()}`
        },
        body: JSON.stringify({
          physical_barcode: physicalBarcode,
          system_barcode: selectedSystemBarcode,
          item_id: item.id
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Barcode mapping created:', result);
        
        // Now try to lookup the item again with the mapped barcode
        const lookupResult = await apiService.lookupItemByBarcode(physicalBarcode);
        if (lookupResult.success && lookupResult.available) {
          await addItemToCart(lookupResult.item, true);
          setScanError(null);
          setShowBarcodeMapping(false);
          setPhysicalBarcode('');
          setSelectedSystemBarcode('');
        } else {
          setScanError('Barcode mapped but item lookup still failed');
        }
      } else {
        const errorData = await response.json();
        setScanError(`Failed to map barcode: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error mapping barcode:', error);
      setScanError('Failed to map barcode. Please try again.');
    } finally {
      setIsMappingBarcode(false);
    }
  };

  const cancelBarcodeMapping = () => {
    setShowBarcodeMapping(false);
    setPhysicalBarcode('');
    setSelectedSystemBarcode('');
    setScanError(null);
  };

  const searchItems = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Only search for items that are live (available for purchase)
      const filteredItems = items.filter(item => 
        item.status === 'live' && (
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.brand?.toLowerCase().includes(query.toLowerCase()) ||
          item.category?.toLowerCase().includes(query.toLowerCase()) ||
          item.barcodeData?.includes(query)
        )
      );
      setSearchResults(filteredItems.slice(0, 10)); // Limit to 10 results
    } catch (error) {
      console.error('Error searching items:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const addItemToCart = async (item: ConsignmentItem, showSuccessMessage: boolean = false) => {
    console.log('🛒 [CART] Adding item to cart:', item);
    console.log('🛒 [CART] Item details:', {
      id: item.id,
      title: item.title,
      price: item.price,
      inventory: item.inventory,
      status: item.status,
      barcodeData: item.barcodeData
    });
    
    // Check current inventory from database if item has barcode
    let currentInventory = item.inventory || 1;
    
    if (item.barcodeData) {
      try {
        console.log('🔍 [INVENTORY] Checking current inventory for item:', item.title);
        const response = await apiService.lookupItemByBarcode(item.barcodeData);
        
        if (response.success && response.item) {
          currentInventory = response.item.inventory || 1;
          console.log('🔍 [INVENTORY] Current inventory from database:', currentInventory);
        } else {
          console.log('🔍 [INVENTORY] Item not found in database, using item inventory:', currentInventory);
        }
      } catch (error) {
        console.error('❌ [INVENTORY] Error checking inventory:', error);
        // Fall back to item inventory if API call fails
      }
    }
    
    // Track cart state for success message
    const existingItem = adminCart.find(cartItem => cartItem.item.id === item.id);
    const isUpdate = existingItem !== undefined;
    const newQuantity = isUpdate ? existingItem.quantity + 1 : 1;
    
    setAdminCart(prevCart => {
      console.log('🛒 [CART] Previous cart state:', prevCart);
      const existingCartItem = prevCart.find(cartItem => cartItem.item.id === item.id);
      console.log('🛒 [CART] Existing item found:', existingCartItem);
      
      if (existingCartItem) {
        console.log('🛒 [CART] Item already in cart, updating quantity...');
        const newQty = existingCartItem.quantity + 1;
        console.log('🛒 [CART] New quantity calculation:', {
          currentQuantity: existingCartItem.quantity,
          maxQuantity: currentInventory,
          newQuantity: newQty
        });
        
        if (newQty > currentInventory) {
          console.log('🛒 [CART] Cannot add more due to inventory limit');
          setInventoryWarning(`⚠️ Only ${currentInventory} available in inventory for "${item.title}"`);
          setTimeout(() => setInventoryWarning(null), 3000);
          return prevCart;
        }
        
        const updatedCart = prevCart.map(cartItem =>
          cartItem.item.id === item.id
            ? { ...cartItem, quantity: newQty, total: newQty * cartItem.item.price }
            : cartItem
        );
        console.log('🛒 [CART] Updated cart (existing item):', updatedCart);
        
        // Show success message if requested
        if (showSuccessMessage) {
          setTimeout(() => showScanSuccessMessage(item, true, newQty), 100);
        }
        
        return updatedCart;
      } else {
        console.log('🛒 [CART] Adding new item to cart...');
        // Add new item
        const newCart = [...prevCart, {
          item,
          quantity: 1,
          total: item.price
        }];
        console.log('🛒 [CART] Updated cart (new item):', newCart);
        
        // Show success message if requested
        if (showSuccessMessage) {
          setTimeout(() => showScanSuccessMessage(item, false, 1), 100);
        }
        
        return newCart;
      }
    });
    setSearchQuery('');
    setSearchResults([]);
    console.log('🛒 [CART] Cart update completed');
  };

  const removeFromCart = (itemId: string) => {
    setAdminCart(prevCart => prevCart.filter(item => item.item.id !== itemId));
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity < 1) {
      removeFromCart(itemId);
      return;
    }

    // Find the item in the cart
    const cartItem = adminCart.find(item => item.item.id === itemId);
    if (!cartItem) return;

    // Check current inventory from database if item has barcode
    let currentInventory = cartItem.item.inventory || 1;
    
    if (cartItem.item.barcodeData) {
      try {
        console.log('🔍 [INVENTORY] Checking current inventory for item:', cartItem.item.title);
        const response = await apiService.lookupItemByBarcode(cartItem.item.barcodeData);
        
        if (response.success && response.item) {
          currentInventory = response.item.inventory || 1;
          console.log('🔍 [INVENTORY] Current inventory from database:', currentInventory);
        } else {
          console.log('🔍 [INVENTORY] Item not found in database, using cart inventory:', currentInventory);
        }
      } catch (error) {
        console.error('❌ [INVENTORY] Error checking inventory:', error);
        // Fall back to cart inventory if API call fails
      }
    }

    // Check if requested quantity exceeds available inventory
    if (quantity > currentInventory) {
      console.log('⚠️ [INVENTORY] Requested quantity exceeds available inventory:', {
        requested: quantity,
        available: currentInventory
      });
      setInventoryWarning(`⚠️ Only ${currentInventory} available in inventory for "${cartItem.item.title}"`);
      setTimeout(() => setInventoryWarning(null), 3000);
      
      // Set quantity to maximum available
      quantity = currentInventory;
    }

    setAdminCart(prevCart => 
      prevCart.map(item => {
        if (item.item.id === itemId) {
          return { 
            ...item, 
            quantity: quantity, 
            total: quantity * item.item.price 
          };
        }
        return item;
      })
    );
  };

  const searchCustomers = async (query: string) => {
    console.log('👥 [CUSTOMER SEARCH] Starting customer search with query:', query);
    
    if (!query.trim()) {
      console.log('👥 [CUSTOMER SEARCH] Empty query, clearing results');
      setCustomerSearchResults([]);
      return;
    }

    setIsSearchingCustomer(true);
    try {
      console.log('👥 [CUSTOMER SEARCH] Calling API to search users...');
      const result = await apiService.searchUsers(query);
      console.log('👥 [CUSTOMER SEARCH] API response:', result);
      
      if (result.success) {
        // Handle both 'users' and 'customers' properties from API response
        const users = result.users || result.customers || [];
        console.log('👥 [CUSTOMER SEARCH] Found users:', users);
        setCustomerSearchResults(Array.isArray(users) ? users : []);
      } else {
        console.log('👥 [CUSTOMER SEARCH] Search failed:', result);
        setCustomerSearchResults([]);
      }
    } catch (error) {
      console.error('❌ [CUSTOMER SEARCH] Error searching customers:', error);
      console.error('❌ [CUSTOMER SEARCH] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown error type'
      });
      setCustomerSearchResults([]);
    } finally {
      setIsSearchingCustomer(false);
      console.log('👥 [CUSTOMER SEARCH] Search completed');
    }
  };

  const selectCustomer = async (customer: any) => {
    console.log('👥 [CUSTOMER SELECT] Selecting customer:', customer);
    
    setSelectedCustomer(customer);
    setCustomerInfo({
      uid: customer.uid,
      name: customer.displayName || customer.email || 'Unknown Customer',
      email: customer.email || '',
      phone: customer.phoneNumber || '',
      points: 0 // Will be updated below
    });
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
    
    // Fetch user's rewards points
    if (customer.uid) {
      try {
        console.log('👥 [CUSTOMER SELECT] Fetching rewards info for user:', customer.uid);
        const rewardsInfo = await apiService.getUserRewardsInfoById(customer.uid);
        console.log('👥 [CUSTOMER SELECT] Rewards info:', rewardsInfo);
        
        if (rewardsInfo.success) {
          setAvailablePoints(rewardsInfo.totalPoints);
          setCustomerInfo(prev => ({
            ...prev,
            points: rewardsInfo.totalPoints
          }));
          console.log('👥 [CUSTOMER SELECT] Set available points:', rewardsInfo.totalPoints);
        } else {
          console.log('👥 [CUSTOMER SELECT] Failed to get rewards info, using default 0 points');
          setAvailablePoints(0);
        }
      } catch (error) {
        console.error('❌ [CUSTOMER SELECT] Error fetching rewards info:', error);
        setAvailablePoints(0);
      }
    } else {
      console.log('👥 [CUSTOMER SELECT] No UID, setting points to 0');
      setAvailablePoints(0);
    }
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerInfo({ name: '', email: '', phone: '' });
    setAvailablePoints(0);
    setPointsToApply(0);
  };

  const validateCheckout = () => {
    if (!customerInfo.name.trim()) {
      setPaymentError('Customer name is required');
      return false;
    }
    
    if (adminCart.length === 0) {
      setPaymentError('Cart is empty');
      return false;
    }
    
    if (pointsToApply > availablePoints) {
      setPaymentError('Cannot apply more points than available');
      return false;
    }
    
    if (paymentMethod === 'card' && !cardReaderAvailable) {
      setPaymentError('Card reader not detected. Please connect a card reader or choose a different payment method.');
      return false;
    }
    
    return true;
  };

  const processCheckout = async () => {
    if (!validateCheckout()) return;

    setIsProcessing(true);
    setPaymentError(null);

    try {
      const result = await executeWithRateLimit('checkout', async () => {
        console.log('🛒 Processing admin checkout for items:', adminCart);

        // Process each item in the cart
        for (const cartItem of adminCart) {
          try {
            // Check if this is an in-store pickup item
            if (cartItem.item.pickupType === 'pending_payment' || cartItem.item.paymentStatus === 'pending') {
              console.log('💰 Processing in-store pickup payment for item:', cartItem.item.id);
              
              // Call the backend API to process in-store pickup payment
              const paymentResult = await apiService.processInStorePickupPayment(
                cartItem.item.id,
                paymentMethod,
                cartItem.total
              );
              
              console.log('✅ In-store pickup payment processed:', paymentResult);
            } else {
              // Regular item sale - update status to sold
              console.log('🛍️ Processing regular sale for item:', cartItem.item.id);
              
              // Update item status to sold
              await apiService.updateItemStatus(
                cartItem.item.id,
                'sold',
                `Sold via admin cart - ${paymentMethod} payment`
              );
            }
          } catch (error) {
            console.error('❌ Error processing item:', cartItem.item.id, error);
            throw error;
          }
        }

        // Create purchase record
        const purchaseRecord = {
          orderId: `ADMIN-${Date.now()}`,
          customerInfo,
          items: adminCart.map(cartItem => ({
            itemId: cartItem.item.id,
            title: cartItem.item.title,
            price: cartItem.item.price,
            quantity: cartItem.quantity,
            total: cartItem.total
          })),
          totalAmount: cartTotal,
          pointsApplied: pointsToApply,
          finalAmount: finalTotal,
          paymentMethod,
          processedBy: user?.email || user?.uid,
          processedAt: new Date().toISOString(),
          status: 'completed'
        };

        console.log('✅ Admin checkout completed:', purchaseRecord);

        // Apply points if used
        if (pointsToApply > 0 && selectedCustomer?.uid) {
          console.log(`Applying ${pointsToApply} points for customer ${selectedCustomer.uid}`);
          // TODO: Implement points redemption API call
        }

        // Clear cart and show success
        setAdminCart([]);
        setCustomerInfo({ name: '', email: '', phone: '' });
        setSelectedCustomer(null);
        setPointsToApply(0);
        setPaymentError(null);
        clearCartState();
        
        // Show success message
        console.log('✅ Checkout completed successfully!');
        onClose();
        
        // Trigger refresh of analytics data
        window.dispatchEvent(new CustomEvent('adminDashboardRefresh', { 
          detail: { action: 'checkout_completed' } 
        }));
        
        return purchaseRecord;
      });

      if (!result.success) {
        setPaymentError(result.error || 'Checkout failed due to rate limiting');
      }
    } catch (error) {
      console.error('❌ Checkout error:', error);
      setPaymentError('Checkout failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    // Stop camera if it's running
    if (useCamera || cameraPopupOpen) {
      stopCamera();
    }
    
    // Just close the modal without clearing the cart
    onClose();
  };

  const handleClearCart = async () => {
    try {
      // Clear the cart in the database
      await apiService.clearInStoreCart();
      
      // Clear local state
      setAdminCart([]);
      setCustomerInfo({ name: '', email: '', phone: '' });
      setSelectedCustomer(null);
      setPointsToApply(0);
      setPaymentError(null);
      clearCartState();
      
      console.log('✅ Cart cleared successfully from database and local state');
    } catch (error) {
      console.error('❌ Failed to clear cart:', error);
      // Still clear local state even if database clear fails
      setAdminCart([]);
      setCustomerInfo({ name: '', email: '', phone: '' });
      setSelectedCustomer(null);
      setPointsToApply(0);
      setPaymentError(null);
      clearCartState();
    }
  };

  // Print barcode function
  const printBarcode = (item: ConsignmentItem) => {
    if (!item.barcodeData) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Barcode Label - ${item.title}</title>
            <style>
              @media print {
                body { margin: 0; }
                .no-print { display: none !important; }
              }
              body { 
                font-family: Arial, sans-serif; 
                margin: 20px; 
                background-color: white; 
                color: black;
              }
              .label-container { 
                max-width: 400px; 
                margin: 0 auto; 
                border: 2px solid #000; 
                padding: 15px;
                background-color: white;
              }
              .header { 
                text-align: center; 
                border-bottom: 2px solid #000; 
                padding-bottom: 10px; 
                margin-bottom: 15px; 
              }
              .header h1 { 
                margin: 0; 
                font-size: 18px; 
                color: #000;
                font-weight: bold;
              }
              .item-info { 
                margin-bottom: 15px; 
                background-color: #f8f9fa; 
                padding: 10px; 
                border: 1px solid #ddd;
                border-radius: 3px;
                font-size: 12px;
              }
              .detail-row { 
                display: flex; 
                justify-content: space-between; 
                padding: 2px 0;
                border-bottom: 1px dotted #ccc;
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
                margin: 20px 0; 
                padding: 15px;
                background-color: white;
                border: 2px dashed #333;
              }
              .barcode-id { 
                font-family: 'Courier New', monospace; 
                font-size: 14px; 
                font-weight: bold; 
                background-color: #f0f0f0; 
                padding: 6px; 
                border: 1px solid #ccc;
                display: inline-block;
                margin: 8px 0;
              }
            </style>
          </head>
          <body>
            <div class="label-container">
              <div class="header">
                <h1>🏔️ Summit Gear Exchange</h1>
                <p style="margin: 5px 0; font-size: 12px;">Mountain Consignment Store</p>
              </div>
              
              <div class="item-info">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; text-align: center;">${item.title}</h3>
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
                  <span class="label">Status:</span>
                  <span class="value">${item.status.toUpperCase()}</span>
                </div>
              </div>
              
              <div class="barcode-container">
                <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px;">SCAN BARCODE</h4>
                <div class="barcode-info">
                  <div class="barcode-id">${item.barcodeData}</div>
                  <p style="margin: 5px 0; font-size: 10px;">Generated: ${new Date().toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Copy barcode function
  const copyBarcode = (barcodeData: string) => {
    navigator.clipboard.writeText(barcodeData);
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg';
    toast.textContent = 'Barcode copied to clipboard!';
    document.body.appendChild(toast);
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="mobile-admin-modal">
      <div className="mobile-admin-modal-content">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4 sm:p-6">
          <div className="flex justify-between items-start sm:items-center">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900">🛒 Admin Cart - In Store Checkout</h2>
              <p className="text-gray-600 mt-1 text-sm sm:text-base">
                Process customer purchases and apply rewards points
                {adminCart.length > 0 && (
                  <span className="ml-2 text-orange-600">• Cart restored from previous session</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {adminCart.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-red-600 hover:text-red-800 focus:outline-none px-3 py-1 rounded border border-red-200 hover:bg-red-50 transition-colors"
                  title="Clear Cart"
                >
                  Clear Cart
                </button>
              )}
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="mobile-admin-modal-body">
          <div className="flex flex-col lg:flex-row h-full">
            {/* Left Panel - Item Search and Cart */}
            <div className="w-full lg:w-1/2 lg:border-r border-gray-200 flex flex-col">
              {/* Item Search */}
              <div className="p-3 sm:p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Items</h3>
                
                {/* Barcode Scanner Button */}
                <div className="mb-4">
                  <button
                    onClick={useCamera ? stopCamera : startCamera}
                    disabled={cameraLoading}
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
                      <div className="flex items-center justify-center space-x-2">
                        <span>📱 Stop Camera Scanner</span>
                        {cameraPopupOpen && (
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        )}
                      </div>
                    ) : (
                      '📱 Start Camera Scanner'
                    )}
                  </button>
                </div>

                {/* Scan Error */}
                {scanError && (
                  <div className="mb-4 bg-red-600 border-2 border-red-800 rounded-md p-4 flex flex-col items-start shadow-lg animate-pulse">
                    <p className="text-white text-base font-semibold flex items-center gap-2">
                      <svg className="w-5 h-5 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-1.414 1.414M6.343 17.657l-1.414-1.414M5.636 5.636l1.414 1.414M17.657 17.657l1.414-1.414M12 8v4m0 4h.01" /></svg>
                      Scan Error: {scanError}
                    </p>
                    <button
                      onClick={() => setScanError(null)}
                      className="mt-3 px-4 py-1 bg-white text-red-700 border border-red-400 rounded shadow hover:bg-red-100 text-xs font-bold"
                    >
                      Clear Error
                    </button>
                    <button
                      onClick={() => {
                        console.log(`🔍 Last scanned barcode: ${lastScannedBarcode || 'N/A'}\nError: ${scanError}`);
                      }}
                      className="mt-2 px-3 py-1 bg-gray-800 text-white rounded text-xs hover:bg-gray-700"
                    >
                      Debug Scan
                    </button>
                  </div>
                )}

                {/* Manual Search Input */}
                <div className="mb-4">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        searchItems(e.target.value);
                      }}
                      placeholder="Search items..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                    />
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="mt-4 max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        onClick={async () => await addItemToCart(item, true)}
                        className="w-full p-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 flex items-center gap-3"
                      >
                        {item.images && item.images.length > 0 ? (
                          <img 
                            src={item.images[0]} 
                            alt={item.title}
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                          <p className="text-sm text-gray-600">{item.brand} • {item.category}</p>
                          <p className="text-sm font-semibold text-orange-600">${item.price}</p>
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cart Items */}
              <div className="flex-1 p-3 sm:p-6 overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Cart Items ({adminCart.length})
                  </h3>
                  {adminCart.length > 0 && (
                    <button
                      onClick={handleClearCart}
                      className="text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                      title="Clear all items from cart"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clear Cart
                    </button>
                  )}
                </div>
                
                {/* Inventory Warning */}
                {inventoryWarning && (
                  <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-sm text-orange-700">{inventoryWarning}</p>
                  </div>
                )}
                
                {adminCart.length === 0 ? (
                  <div>
                    <div className="text-center py-8">
                      <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l-1 7H6l-1-7z" />
                      </svg>
                      <p className="text-gray-500">No items in cart. Search and add items above.</p>
                    </div>
                    
                    {/* Show available items for manual addition */}
                    {items.length > 0 && (
                      <div className="mt-6">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <h4 className="font-medium text-blue-800">Items Available to Add</h4>
                          </div>
                          <p className="text-sm text-blue-700 mb-3">
                            Click to add items to your cart:
                          </p>
                        </div>
                        
                        <div className="space-y-3">
                          {items.map((item) => (
                            <div key={item.id} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <div className="flex items-center gap-3">
                                {item.images && item.images.length > 0 ? (
                                  <img 
                                    src={item.images[0]} 
                                    alt={item.title}
                                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                                  <p className="text-sm text-gray-600">{item.brand} • {item.category}</p>
                                  <p className="text-sm font-semibold text-blue-600">${item.price}</p>
                                </div>
                                <button
                                  onClick={async () => await addItemToCart(item, true)}
                                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                  </svg>
                                  Add to Cart
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {adminCart.map((cartItem) => (
                      <div key={cartItem.item.id} className="p-3 bg-gray-50 rounded-lg">
                        {/* Desktop Layout */}
                        <div className="hidden md:flex items-center space-x-4">
                        {cartItem.item.images && cartItem.item.images.length > 0 ? (
                          <img 
                            src={cartItem.item.images[0]} 
                            alt={cartItem.item.title}
                            className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-800 truncate">{cartItem.item.title}</h4>
                              <p className="text-sm text-gray-600">
                                {cartItem.item.brand} • {cartItem.item.category} • ${cartItem.item.price}
                              </p>
                            </div>
                            {/* Print and Copy Barcode Buttons - Desktop Header */}
                            {cartItem.item.barcodeData && (
                              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                                <button
                                  onClick={() => printBarcode(cartItem.item)}
                                  className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                  title="Print Barcode"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => copyBarcode(cartItem.item.barcodeData!)}
                                  className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors"
                                  title="Copy Barcode"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                          {cartItem.item.barcodeData && (
                            <div className="mt-2">
                              <p className="text-xs text-gray-500 mb-1">📊 Barcode:</p>
                              <div className="bg-gray-50 border border-gray-200 rounded px-2 py-1">
                                <code className="text-xs font-mono text-gray-800 break-words leading-relaxed select-all">
                                  {cartItem.item.barcodeData}
                                </code>
                              </div>
                            </div>
                          )}
                          {cartItem.item.inventory !== undefined && cartItem.quantity >= cartItem.item.inventory && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                                ⚠️ Inventory limit reached
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={async () => await updateQuantity(cartItem.item.id, cartItem.quantity - 1)}
                            className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                          </button>
                          <div className="flex flex-col items-center min-w-[3rem]">
                            <span className="text-center font-medium">{cartItem.quantity}</span>
                            {cartItem.item.inventory !== undefined && (
                              <span className="text-xs text-gray-500">
                                of {cartItem.item.inventory}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={async () => await updateQuantity(cartItem.item.id, cartItem.quantity + 1)}
                            disabled={cartItem.item.inventory !== undefined && cartItem.quantity >= cartItem.item.inventory}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                              cartItem.item.inventory !== undefined && cartItem.quantity >= cartItem.item.inventory
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-200 hover:bg-gray-300'
                            }`}
                            title={
                              cartItem.item.inventory !== undefined && cartItem.quantity >= cartItem.item.inventory
                                ? `Only ${cartItem.item.inventory} available in inventory`
                                : 'Increase quantity'
                            }
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                          </button>
                          <span className="font-semibold text-gray-800 w-16 text-right">
                            ${cartItem.total.toFixed(2)}
                          </span>
                          <button
                            onClick={() => removeFromCart(cartItem.item.id)}
                            className="w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors"
                          >
                            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Mobile Layout */}
                      <div className="md:hidden space-y-3">
                        {/* Item Image and Basic Info */}
                        <div className="flex items-start space-x-3">
                          {cartItem.item.images && cartItem.item.images.length > 0 ? (
                            <img 
                              src={cartItem.item.images[0]} 
                              alt={cartItem.item.title}
                              className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-800">{cartItem.item.title}</h4>
                                <p className="text-sm text-gray-600">
                                  {cartItem.item.brand} • {cartItem.item.category} • ${cartItem.item.price}
                                </p>
                                {cartItem.item.inventory !== undefined && cartItem.quantity >= cartItem.item.inventory && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                                      ⚠️ Inventory limit reached
                                    </span>
                                  </div>
                                )}
                              </div>
                              {/* Print and Copy Barcode Buttons - Mobile Header */}
                              {cartItem.item.barcodeData && (
                                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                                  <button
                                    onClick={() => printBarcode(cartItem.item)}
                                    className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                    title="Print Barcode"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => copyBarcode(cartItem.item.barcodeData!)}
                                    className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors"
                                    title="Copy Barcode"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromCart(cartItem.item.id)}
                            className="w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors flex-shrink-0"
                          >
                            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>

                        {/* Barcode Display - Mobile Layout */}
                        {cartItem.item.barcodeData && (
                          <div className="bg-white border border-gray-300 rounded-lg p-3">
                            <p className="text-sm font-medium text-gray-700 mb-2">📊 Barcode:</p>
                            <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2">
                              <code className="text-sm font-mono text-gray-800 break-words leading-relaxed select-all">
                                {cartItem.item.barcodeData}
                              </code>
                            </div>
                          </div>
                        )}

                        {/* Quantity Controls and Total */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <button
                              onClick={async () => await updateQuantity(cartItem.item.id, cartItem.quantity - 1)}
                              className="w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                              </svg>
                            </button>
                            <div className="flex flex-col items-center min-w-[4rem]">
                              <span className="text-lg font-medium">{cartItem.quantity}</span>
                              {cartItem.item.inventory !== undefined && (
                                <span className="text-xs text-gray-500">
                                  of {cartItem.item.inventory}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={async () => await updateQuantity(cartItem.item.id, cartItem.quantity + 1)}
                              disabled={cartItem.item.inventory !== undefined && cartItem.quantity >= cartItem.item.inventory}
                              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                                cartItem.item.inventory !== undefined && cartItem.quantity >= cartItem.item.inventory
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-gray-200 hover:bg-gray-300'
                              }`}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            </button>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-orange-600">
                              ${cartItem.total.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            </div>

            {/* Right Panel - Customer Info and Checkout */}
            <div className="w-full lg:w-1/2 flex flex-col">
              <div className="flex-1 p-3 sm:p-6 overflow-y-auto">
                {/* Customer Search */}
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Customer Information</h3>
                  
                  {!selectedCustomer ? (
                    <div className="space-y-4">
                      <div className="relative">
                        <input
                          type="text"
                          value={customerSearchQuery}
                          onChange={(e) => {
                            setCustomerSearchQuery(e.target.value);
                            searchCustomers(e.target.value);
                          }}
                          placeholder="Search for existing customer..."
                          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>

                      {/* Customer Search Results */}
                      {Array.isArray(customerSearchResults) && customerSearchResults.length > 0 && (
                        <div className="border border-gray-200 rounded-lg max-h-32 overflow-y-auto">
                          {customerSearchResults.map((customer) => (
                            <button
                              key={customer.uid}
                              onClick={() => selectCustomer(customer)}
                              className="w-full p-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                            >
                              <div className="font-medium text-gray-900">{customer.displayName}</div>
                              <div className="text-sm text-gray-600">{customer.email}</div>
                              <div className="text-sm text-orange-600 font-medium">⭐ {customer.points || 0} points available</div>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="text-center">
                        <span className="text-gray-500 text-sm">or</span>
                      </div>

                      <div className="space-y-3">
                        <input
                          type="text"
                          value={customerInfo.name}
                          onChange={(e) => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Customer Name"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                        <input
                          type="email"
                          value={customerInfo.email}
                          onChange={(e) => setCustomerInfo(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="Customer Email (optional)"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                        <input
                          type="tel"
                          value={customerInfo.phone}
                          onChange={(e) => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="Customer Phone (optional)"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{selectedCustomer.displayName}</h4>
                          <p className="text-sm text-gray-600">{selectedCustomer.email}</p>
                          <p className="text-sm text-gray-600">{selectedCustomer.phoneNumber}</p>
                          <div className="mt-2 p-2 bg-green-100 rounded-lg border border-green-300">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-green-800">⭐ Available Points:</span>
                              <span className="text-lg font-bold text-green-700">{availablePoints}</span>
                            </div>
                            <div className="text-xs text-green-600 mt-1">
                              Value: ${(availablePoints * 0.01).toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={clearCustomer}
                          className="text-gray-400 hover:text-gray-600 ml-3"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Points Application */}
                {selectedCustomer && availablePoints > 0 && (
                  <div className="mb-4 sm:mb-6">
                    <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                      <span>⭐</span>
                      <span>Apply Rewards Points</span>
                    </h4>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Available Points:</span>
                        <span className="font-bold text-orange-700 text-lg">{availablePoints}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <input
                          type="number"
                          value={pointsToApply}
                          onChange={(e) => {
                            const value = Math.min(parseInt(e.target.value) || 0, availablePoints);
                            setPointsToApply(value);
                          }}
                          min="0"
                          max={availablePoints}
                          className="flex-1 px-3 py-2 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                          placeholder="Points to apply"
                        />
                        <button
                          onClick={() => setPointsToApply(availablePoints)}
                          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
                        >
                          Use All
                        </button>
                      </div>
                      {pointsToApply > 0 && (
                        <div className="bg-white border border-orange-300 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">Points Applied:</span>
                            <span className="font-bold text-green-600">{pointsToApply}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-sm text-gray-600">Discount Value:</span>
                            <span className="font-bold text-green-600">-${(pointsToApply * 0.01).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment Method */}
                <div className="mb-4 sm:mb-6">
                  <h4 className="font-medium text-gray-800 mb-3">Payment Method</h4>
                  {!cardReaderAvailable && (
                    <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-600">⚠️</span>
                          <span className="text-sm text-yellow-700">Card reader not detected</span>
                        </div>
                        <button
                          onClick={checkCardReader}
                          disabled={isCheckingCardReader}
                          className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded hover:bg-yellow-200 transition-colors disabled:opacity-50"
                        >
                          {isCheckingCardReader ? 'Checking...' : 'Retry'}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => setPaymentMethod('cash')}
                      className={`p-3 border-2 rounded-lg transition-all ${
                        paymentMethod === 'cash' 
                          ? 'border-orange-500 bg-orange-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-center">
                        <div className="text-2xl mb-1">💵</div>
                        <div className="text-sm font-medium">Cash</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setPaymentMethod('card')}
                      disabled={!cardReaderAvailable}
                      className={`p-3 border-2 rounded-lg transition-all ${
                        paymentMethod === 'card' 
                          ? 'border-orange-500 bg-orange-50' 
                          : !cardReaderAvailable
                          ? 'border-gray-200 bg-gray-100 cursor-not-allowed'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      title={!cardReaderAvailable ? 'Card reader not detected. Please connect a card reader to use card payments.' : 'Pay with card'}
                    >
                      <div className="text-center">
                        <div className="text-2xl mb-1">
                          {isCheckingCardReader ? '⏳' : '💳'}
                        </div>
                        <div className="text-sm font-medium">
                          {isCheckingCardReader ? 'Checking...' : 'Card'}
                        </div>
                        {!cardReaderAvailable && !isCheckingCardReader && (
                          <div className="text-xs text-gray-500 mt-1">No Reader</div>
                        )}
                      </div>
                    </button>
                    {selectedCustomer && availablePoints > 0 && (
                      <button
                        onClick={() => setPaymentMethod('points')}
                        className={`p-3 border-2 rounded-lg transition-all ${
                          paymentMethod === 'points' 
                            ? 'border-orange-500 bg-orange-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-center">
                          <div className="text-2xl mb-1">⭐</div>
                          <div className="text-sm font-medium">Points</div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>

                {/* Payment Error */}
                {paymentError && (
                  <div className="mb-4 sm:mb-6 bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
                    <p className="text-red-600 text-sm">{paymentError}</p>
                  </div>
                )}
              </div>

              {/* Checkout Summary */}
              <div className="border-t border-gray-200 p-6 bg-gray-50">
                {/* Points Summary Banner */}
                {pointsToApply > 0 && (
                  <div className="mb-4 bg-gradient-to-r from-green-50 to-orange-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">⭐</span>
                        <div>
                          <div className="text-sm font-semibold text-green-800">
                            Rewards Points Applied
                          </div>
                          <div className="text-xs text-green-600">
                            {pointsToApply} points = ${(pointsToApply * 0.01).toFixed(2)} discount
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-700">
                          -${(pointsToApply * 0.01).toFixed(2)}
                        </div>
                        <div className="text-xs text-green-600">
                          {(availablePoints - pointsToApply)} points remaining
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>${cartTotal.toFixed(2)}</span>
                  </div>
                  {pointsToApply > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-green-600 font-medium">
                        <span>⭐ Points Applied ({pointsToApply}):</span>
                        <span>-${(pointsToApply * 0.01).toFixed(2)}</span>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                        <div className="text-xs text-green-700 text-center">
                          Customer will have {(availablePoints - pointsToApply)} points remaining
                        </div>
                      </div>
                    </>
                  )}
                  <div className="border-t pt-3 flex justify-between items-center">
                    <span className="text-lg font-semibold text-gray-800">Total:</span>
                    <span className="text-2xl font-bold text-orange-600">${finalTotal.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={handleClose}
                      className="flex-1 py-3 px-6 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={processCheckout}
                      disabled={isProcessing || adminCart.length === 0 || !customerInfo.name.trim()}
                      className="flex-1 py-3 px-6 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Complete Checkout - ${finalTotal.toFixed(2)}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Popup */}
      {cameraPopupOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-[9999] flex items-center justify-center p-1 sm:p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Camera Popup Header */}
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold">📱 Barcode Scanner</h3>
                  <p className="text-blue-100 text-sm">Point camera at barcode to scan</p>
                </div>
                <button
                  onClick={closeCameraPopup}
                  className="text-white hover:text-gray-200 focus:outline-none"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Camera View */}
            <div className="p-2 sm:p-4 flex-1 flex flex-col items-center justify-center">
              <div className="relative bg-black rounded-lg overflow-hidden flex items-center justify-center w-full h-[40vh] sm:h-[60vh]">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted
                  className="w-full h-full object-cover"
                />
                
                {/* Scanning Overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[90vw] max-w-xl h-40 border-8 border-white border-dashed relative">
                    <div className="absolute -top-2 -left-2 w-8 h-8 border-l-8 border-t-8 border-orange-400"></div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 border-r-8 border-t-8 border-orange-400"></div>
                    <div className="absolute -bottom-2 -left-2 w-8 h-8 border-l-8 border-b-8 border-orange-400"></div>
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 border-r-8 border-b-8 border-orange-400"></div>
                  </div>
                </div>
                {/* Scanning Status Indicators */}
                <div className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs">
                  🔍 Scanning...
                </div>
                {isScanning && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs">
                    Processing...
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="mt-4 text-center">
                <p className="text-gray-600 text-sm">
                  Position the barcode within the scanning area. The item will be automatically added to the cart.
                </p>
                <div className="mt-2 text-xs text-gray-500 space-y-1">
                  <p>💡 <strong>Tips for faster scanning:</strong></p>
                  <p>• Hold the barcode steady and parallel to the camera</p>
                  <p>• Ensure good lighting and avoid shadows</p>
                  <p>• Keep the barcode within the orange border</p>
                  <p>• Try different distances if scanning is slow</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Mapping Modal */}
      {showBarcodeMapping && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-[9999] flex items-center justify-center p-1 sm:p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col m-2">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold">🔗 Map Barcode</h3>
                  <p className="text-orange-100 text-sm">Link physical barcode to system item</p>
                </div>
                <button
                  onClick={cancelBarcodeMapping}
                  className="text-white hover:text-gray-200 focus:outline-none"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {/* Physical Barcode Display */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-2">Physical Barcode Scanned</h4>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="font-mono text-lg text-gray-800 break-all">{physicalBarcode}</div>
                  <p className="text-sm text-gray-600 mt-2">This physical barcode doesn't match any system barcode. This usually happens when:</p>
                  <ul className="text-sm text-gray-600 mt-1 ml-4 list-disc">
                    <li>You have old physical barcodes printed in a different format</li>
                    <li>The item was approved before the barcode format was standardized</li>
                    <li>There's a mismatch between physical and system barcodes</li>
                  </ul>
                  <p className="text-sm text-gray-600 mt-2">Please select the correct item below to link this physical barcode.</p>
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                    <strong>System Barcode Format:</strong> CSG + timestamp + random suffix (e.g., CSG202507071744347F09)
                  </div>
                </div>
              </div>

              {/* System Barcode Selection */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-2">Select System Item</h4>
                <p className="text-sm text-gray-600 mb-3">Choose the item this physical barcode should be linked to:</p>
                
                {/* Search Box */}
                <div className="mb-3">
                  <input
                    type="text"
                    placeholder="Search items by title, brand, or category..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    onChange={(e) => searchItems(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2 max-h-32 sm:max-h-48 md:max-h-60 overflow-y-auto">
                  {(searchResults.length > 0 ? searchResults : items.filter(item => item.status === 'live' && item.barcodeData))
                    .map(item => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedSystemBarcode(item.barcodeData!)}
                        className={`w-full p-3 border rounded-lg text-left transition-colors ${
                          selectedSystemBarcode === item.barcodeData
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium text-gray-800">{item.title}</div>
                            <div className="text-sm text-gray-600">
                              {item.brand && `${item.brand} • `}{item.category} • ${item.size || 'N/A'}
                            </div>
                            <div className="text-sm font-medium text-green-600">${item.price}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-xs text-gray-500 break-all">
                              {item.barcodeData}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
                
                {items.filter(item => item.status === 'live' && item.barcodeData).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">📦</div>
                    <p>No items with barcodes found</p>
                    <p className="text-sm">All items must have system barcodes to be mapped</p>
                  </div>
                )}
              </div>

              {/* Error Display */}
              {scanError && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm">{scanError}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={cancelBarcodeMapping}
                  className="flex-1 py-3 px-6 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={mapBarcode}
                  disabled={!selectedSystemBarcode || isMappingBarcode}
                  className="flex-1 py-3 px-6 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isMappingBarcode ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Mapping...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Map Barcode
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCartModal; 