import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, AuthUser } from '../types';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ItemDetailModal from './ItemDetailModal';

interface UserAnalyticsProps {
  user: AuthUser | null;
}

interface UserStats {
  totalItemsListed: number;
  totalItemsSold: number;
  totalEarnings: number;
  storeCredit: number;
  activeListings: number;
  pendingListings: number;
  totalPurchases: number;
  totalSpent: number;
}

interface PurchaseHistory {
  id: string;
  orderNumber: string;
  total: number;
  purchaseDate: Date;
  items: {
    id: string;
    title: string;
    price: number;
    quantity: number;
    category: string;
    brand: string;
    size: string;
    images: string[];
  }[];
  customerInfo: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    zipCode: string;
  };
  paymentInfo: {
    method: string;
    last4: string;
    status: string;
    transactionId: string;
  };
  status: 'completed' | 'pending';
  orderStatus: 'processing' | 'shipped' | 'delivered' | 'cancelled';
  estimatedDelivery: string;
  trackingNumber: string;
}

interface SoldItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ConsignmentItem | null;
}

const UserAnalytics: React.FC<UserAnalyticsProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'listings' | 'sales' | 'purchases' | 'orders' | 'credit'>('overview');
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [myListings, setMyListings] = useState<ConsignmentItem[]>([]);
  const [mySales, setMySales] = useState<ConsignmentItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ConsignmentItem | null>(null);
  const [isItemDetailModalOpen, setIsItemDetailModalOpen] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistory[]>([]);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [selectedTracking, setSelectedTracking] = useState<{
    trackingNumber: string;
    orderNumber: string;
    estimatedDelivery: string;
  } | null>(null);
  const [showSoldItemModal, setShowSoldItemModal] = useState(false);
  const [selectedSoldItem, setSelectedSoldItem] = useState<ConsignmentItem | null>(null);

  // Use refs to prevent excessive re-renders
  const lastFetchRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);

  // Memoize the purchase history getter to prevent excessive calls
  const getPurchaseHistory = useCallback((): PurchaseHistory[] => {
    if (!user) return [];
    
    try {
      const savedHistory = localStorage.getItem(`purchase_history_${user.uid}`);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        return parsed.map((item: any) => ({
          ...item,
          purchaseDate: new Date(item.purchaseDate),
          orderNumber: item.orderNumber || `ORD-${item.id.slice(-6)}`,
          customerInfo: item.customerInfo || {
            name: 'N/A',
            email: 'N/A',
            phone: 'N/A',
            address: 'N/A',
            city: 'N/A',
            zipCode: 'N/A'
          },
          paymentInfo: item.paymentInfo || {
            method: 'Credit Card',
            last4: '****',
            status: 'completed',
            transactionId: `txn_${item.id.slice(-8)}`
          },
          orderStatus: item.orderStatus || 'delivered',
          estimatedDelivery: item.estimatedDelivery || new Date(item.purchaseDate).toISOString(),
          trackingNumber: item.trackingNumber || `TRK${item.id.slice(-8)}`,
          items: item.items.map((orderItem: any) => ({
            ...orderItem,
            category: orderItem.category || 'N/A',
            brand: orderItem.brand || 'N/A',
            size: orderItem.size || 'N/A',
            images: orderItem.images || []
          }))
        }));
      }
    } catch (error) {
      console.error('Error loading purchase history:', error);
    }
    return [];
  }, [user]);

  // Throttled refresh function to prevent excessive calls
  const refreshPurchaseHistory = useCallback(() => {
    if (!user) return;
    
    const now = Date.now();
    if (now - lastFetchRef.current < 5000) { // Throttle to max once per 5 seconds
      return;
    }
    lastFetchRef.current = now;
    
    const updatedPurchaseHistory = getPurchaseHistory();
    setPurchaseHistory(updatedPurchaseHistory);
    
    // Recalculate user stats with updated purchase data
    const totalSpent = updatedPurchaseHistory.reduce((sum: number, purchase: PurchaseHistory) => sum + purchase.total, 0);
    setUserStats(prev => prev ? { ...prev, totalPurchases: updatedPurchaseHistory.length, totalSpent } : null);
  }, [user, getPurchaseHistory]);

  const fetchMyListings = useCallback(async () => {
    if (!user) return;

    try {
      const itemsRef = collection(db, 'items');
      let q;
      let items: ConsignmentItem[] = [];

      try {
        // Try the optimized query with index first
        q = query(itemsRef, where('sellerId', '==', user.uid), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            approvedAt: data.approvedAt?.toDate(),
            liveAt: data.liveAt?.toDate(),
            soldAt: data.soldAt?.toDate(),
          } as ConsignmentItem);
        });
      } catch (indexError: any) {
        // If index is not ready, fall back to simple query without ordering
        console.warn('Index not ready, using fallback query:', indexError.message);
        q = query(itemsRef, where('sellerId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            approvedAt: data.approvedAt?.toDate(),
            liveAt: data.liveAt?.toDate(),
            soldAt: data.soldAt?.toDate(),
          } as ConsignmentItem);
        });
        
        // Sort manually if index is not available
        items.sort((a, b) => {
          const dateA = a.createdAt || new Date(0);
          const dateB = b.createdAt || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
      }

      setMyListings(items);
      
      // Calculate user stats
      const soldItems = items.filter(item => item.status === 'sold');
      const activeItems = items.filter(item => item.status === 'live');
      const pendingItems = items.filter(item => item.status === 'pending');
      
      const totalEarnings = soldItems.reduce((sum, item) => {
        const soldPrice = item.soldPrice || item.price;
        return sum + (soldPrice * 0.75); // 75% to seller, 25% to store
      }, 0);

      // Get purchase history
      const purchaseHistoryData = getPurchaseHistory();
      setPurchaseHistory(purchaseHistoryData);
      const totalSpent = purchaseHistoryData.reduce((sum: number, purchase: PurchaseHistory) => sum + purchase.total, 0);
      
      // For demo purposes, simulate some store credit usage
      const storeCredit = Math.max(0, totalEarnings - (totalSpent * 0.1)); // Some credit used for purchases

      setUserStats({
        totalItemsListed: items.length,
        totalItemsSold: soldItems.length,
        totalEarnings,
        storeCredit,
        activeListings: activeItems.length,
        pendingListings: pendingItems.length,
        totalPurchases: purchaseHistoryData.length,
        totalSpent
      });

      setMySales(soldItems);
    } catch (error) {
      console.error('Error fetching my listings:', error);
      // Set empty state if there's a critical error
      setMyListings([]);
      setMySales([]);
      setUserStats({
        totalItemsListed: 0,
        totalItemsSold: 0,
        totalEarnings: 0,
        storeCredit: 0,
        activeListings: 0,
        pendingListings: 0,
        totalPurchases: 0,
        totalSpent: 0
      });
    }
  }, [user, getPurchaseHistory]);

  const fetchUserData = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await fetchMyListings();
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  }, [user, fetchMyListings]);

  // Main effect for initial data loading
  useEffect(() => {
    if (user && isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      fetchUserData();
    }
  }, [user, fetchUserData]);

  // Optimized window focus handler with throttling
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const handleWindowFocus = () => {
      if (user && !isInitialLoadRef.current) {
        // Debounce the refresh to prevent excessive calls
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          refreshPurchaseHistory();
        }, 1000); // Wait 1 second after focus before refreshing
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      clearTimeout(timeoutId);
    };
  }, [user, refreshPurchaseHistory]);

  // Optimized storage change handler with throttling
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `purchase_history_${user?.uid}` && user && !isInitialLoadRef.current) {
        // Debounce the refresh to prevent excessive calls
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          refreshPurchaseHistory();
        }, 500); // Wait 500ms after storage change before refreshing
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearTimeout(timeoutId);
    };
  }, [user, refreshPurchaseHistory]);

  const handleItemClick = (item: ConsignmentItem) => {
    setSelectedItem(item);
    setIsItemDetailModalOpen(true);
  };

  const handleItemDetailModalClose = () => {
    setSelectedItem(null);
    setIsItemDetailModalOpen(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'live': return 'bg-green-100 text-green-800';
      case 'sold': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Under Review';
      case 'approved': return 'Approved';
      case 'live': return 'Live';
      case 'sold': return 'Sold';
      default: return status;
    }
  };

  const chartData = userStats ? [
    { name: 'Sold', value: userStats.totalItemsSold, color: '#10b981' },
    { name: 'Active', value: userStats.activeListings, color: '#3b82f6' },
    { name: 'Pending', value: userStats.pendingListings, color: '#f59e0b' },
  ] : [];

  const earningsData = mySales.map((item, index) => ({
    name: `Sale ${index + 1}`,
    earnings: (item.soldPrice || item.price) * 0.75,
    date: item.soldAt?.toLocaleDateString() || 'N/A'
  }));

  const handleTrackingClick = (trackingNumber: string, orderNumber: string, estimatedDelivery: string) => {
    setSelectedTracking({
      trackingNumber,
      orderNumber,
      estimatedDelivery
    });
    setShowTrackingModal(true);
  };

  const handleSoldItemClick = (item: ConsignmentItem) => {
    setSelectedSoldItem(item);
    setShowSoldItemModal(true);
  };

  const handleSoldItemModalClose = () => {
    setShowSoldItemModal(false);
    setSelectedSoldItem(null);
  };

  const SoldItemModal: React.FC<SoldItemModalProps> = ({ isOpen, onClose, item }) => {
    const [fulfillmentMethod, setFulfillmentMethod] = useState<'shipping' | 'pickup'>('shipping');
    const [shippingLabelGenerated, setShippingLabelGenerated] = useState(false);
    const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);

    const generateShippingLabel = async () => {
      setIsGeneratingLabel(true);
      
      // Simulate label generation delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create fake shipping label data
      const labelData = {
        trackingNumber: `TRK${Date.now().toString().slice(-8)}`,
        carrier: 'FedEx',
        service: 'Ground',
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        labelUrl: `https://example.com/label/${Date.now()}`,
        cost: (Math.random() * 10 + 5).toFixed(2) // Random cost between $5-15
      };

      // In a real app, this would update Firestore
      setShippingLabelGenerated(true);
      setIsGeneratingLabel(false);

      // Show success message
      alert(`Shipping label generated!\nTracking: ${labelData.trackingNumber}\nEstimated delivery: ${new Date(labelData.estimatedDelivery).toLocaleDateString()}`);
    };

    const printShippingLabel = () => {
      // Create a fake shipping label for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow || !item) return;

      const trackingNumber = `TRK${Date.now().toString().slice(-8)}`;
      
      const labelHtml = `
        <html>
          <head>
            <title>Shipping Label - ${item.title}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .label-container { border: 2px solid #000; padding: 20px; width: 600px; margin: 0 auto; }
              .header { text-align: center; border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
              .section { margin: 15px 0; }
              .tracking { font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; padding: 10px; border: 1px solid #000; }
              .barcode { text-align: center; font-family: 'Courier New', monospace; font-size: 12px; margin: 10px 0; }
            </style>
          </head>
          <body>
            <div class="label-container">
              <div class="header">
                <h2>Summit Gear Exchange</h2>
                <p>Shipping Label</p>
              </div>
              <div class="section">
                <strong>FROM:</strong><br>
                Summit Gear Exchange<br>
                123 Mountain View Drive<br>
                Denver, CO 80202<br>
                (555) 123-4567
              </div>
              <div class="section">
                <strong>TO:</strong><br>
                ${item.buyerInfo?.name || 'Customer'}<br>
                ${item.buyerInfo?.address || 'Address'}<br>
                ${item.buyerInfo?.city || 'City'}, ${item.buyerInfo?.zipCode || 'ZIP'}<br>
                ${item.buyerInfo?.phone || 'Phone'}
              </div>
              <div class="tracking">TRACKING: ${trackingNumber}</div>
              <div class="barcode">||||| |||| | |||| ||||| | |||| |||||<br>${trackingNumber}</div>
              <div class="section">
                <strong>Item:</strong> ${item.title}<br>
                <strong>Service:</strong> FedEx Ground<br>
                <strong>Date:</strong> ${new Date().toLocaleDateString()}
              </div>
            </div>
          </body>
        </html>
      `;
      
      printWindow.document.write(labelHtml);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    };

    if (!isOpen || !item) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
          <div className="sticky top-0 bg-white p-6 border-b border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Sold Item Management</h2>
                <p className="text-gray-600 mt-1">Manage fulfillment for your sold item</p>
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
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">{item.title}</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="font-medium">Sale Price:</span> ${item.soldPrice || item.price}</div>
                <div><span className="font-medium">Your Earnings:</span> ${((item.soldPrice || item.price) * 0.75).toFixed(2)}</div>
                <div><span className="font-medium">Sold Date:</span> {item.soldAt?.toLocaleDateString() || 'N/A'}</div>
                <div><span className="font-medium">Transaction ID:</span> {item.saleTransactionId || 'N/A'}</div>
              </div>
            </div>

            {item.buyerInfo && (
              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-3">Buyer Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div><span className="font-medium">Name:</span> {item.buyerInfo.name}</div>
                  <div><span className="font-medium">Email:</span> {item.buyerInfo.email}</div>
                  <div><span className="font-medium">Phone:</span> {item.buyerInfo.phone}</div>
                  <div className="md:col-span-2">
                    <span className="font-medium">Address:</span> {item.buyerInfo.address}, {item.buyerInfo.city}, {item.buyerInfo.zipCode}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
              <h4 className="text-lg font-semibold text-gray-800 mb-4">Fulfillment Method</h4>
              
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="fulfillment"
                    value="shipping"
                    checked={fulfillmentMethod === 'shipping'}
                    onChange={(e) => setFulfillmentMethod(e.target.value as 'shipping')}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium">Ship to Customer</div>
                    <div className="text-sm text-gray-600">Generate shipping label and send directly to buyer</div>
                  </div>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="fulfillment"
                    value="pickup"
                    checked={fulfillmentMethod === 'pickup'}
                    onChange={(e) => setFulfillmentMethod(e.target.value as 'pickup')}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium">In-Store Pickup</div>
                    <div className="text-sm text-gray-600">Customer will pick up item at store location</div>
                  </div>
                </label>
              </div>
            </div>

            {fulfillmentMethod === 'shipping' && (
              <div className="bg-orange-50 rounded-lg p-4">
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Shipping Actions</h4>
                
                {!shippingLabelGenerated ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">Generate a shipping label to send this item to the customer.</p>
                    <button
                      onClick={generateShippingLabel}
                      disabled={isGeneratingLabel}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 px-4 rounded-lg transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isGeneratingLabel ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Generating Label...
                        </>
                      ) : (
                        <>Generate Shipping Label</>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center text-green-600 mb-3">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="font-medium">Shipping label generated!</span>
                    </div>
                    
                    <button
                      onClick={printShippingLabel}
                      className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Print Shipping Label
                    </button>
                  </div>
                )}
              </div>
            )}

            {fulfillmentMethod === 'pickup' && (
              <div className="bg-green-50 rounded-lg p-4">
                <h4 className="text-lg font-semibold text-gray-800 mb-4">In-Store Pickup</h4>
                <div className="space-y-3 text-sm">
                  <p className="text-gray-700">
                    <strong>Customer Instructions:</strong> Please bring a valid ID and your order confirmation to pick up your item.
                  </p>
                  <div className="bg-white rounded p-3 border">
                    <p><strong>Store Location:</strong></p>
                    <p>Summit Gear Exchange</p>
                    <p>123 Mountain View Drive</p>
                    <p>Denver, CO 80202</p>
                    <p><strong>Hours:</strong> Mon-Sat 9AM-7PM, Sun 10AM-6PM</p>
                    <p><strong>Phone:</strong> (555) 123-4567</p>
                  </div>
                  <button className="w-full bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg transition-colors font-medium">
                    Mark as Ready for Pickup
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My User History</h1>
            <p className="text-gray-600 mt-1">Track your listings, sales, purchases, and store credit</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                fetchUserData();
                refreshPurchaseHistory();
              }}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium flex items-center gap-2"
              title="Refresh data"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                ${userStats?.storeCredit.toFixed(2) || '0.00'}
              </div>
              <div className="text-sm text-gray-500">Available Credit</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-4 md:space-x-8 px-4 md:px-6 overflow-x-auto scrollbar-hide">
            {[
              { key: 'overview', label: 'Overview', icon: '📈' },
              { key: 'listings', label: 'My Listings', icon: '📋' },
              { key: 'sales', label: 'Sales History', icon: '💵' },
              { key: 'purchases', label: 'Purchases', icon: '🛍️' },
              { key: 'orders', label: 'My Orders', icon: '📦' },
              { key: 'credit', label: 'Store Credit', icon: '💰' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex-shrink-0 ${
                  activeTab === tab.key
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                        <span className="text-white text-sm font-bold">📦</span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-2xl font-bold text-blue-600">{userStats?.totalItemsListed || 0}</div>
                      <div className="text-sm text-blue-600">Items Listed</div>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                        <span className="text-white text-sm font-bold">✅</span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-2xl font-bold text-green-600">{userStats?.totalItemsSold || 0}</div>
                      <div className="text-sm text-green-600">Items Sold</div>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                        <span className="text-white text-sm font-bold">💰</span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-2xl font-bold text-purple-600">${userStats?.totalEarnings.toFixed(2) || '0.00'}</div>
                      <div className="text-sm text-purple-600">Total Earnings</div>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                        <span className="text-white text-sm font-bold">🛒</span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-2xl font-bold text-indigo-600">{userStats?.totalPurchases || 0}</div>
                      <div className="text-sm text-indigo-600">Purchases</div>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                        <span className="text-white text-sm font-bold">💳</span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-2xl font-bold text-orange-600">${userStats?.storeCredit.toFixed(2) || '0.00'}</div>
                      <div className="text-sm text-orange-600">Store Credit</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Listings Distribution */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Listings Status</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Earnings Over Time */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Earnings from Sales</h3>
                  <div className="h-64">
                    {earningsData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={earningsData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Line type="monotone" dataKey="earnings" stroke="#10b981" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                          <div className="text-4xl mb-2">📈</div>
                          <p>No sales data yet</p>
                          <p className="text-sm">Start listing items to see your earnings here</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Listings Tab */}
          {activeTab === 'listings' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">My Listings ({myListings.length})</h3>
                <div className="flex gap-2">
                  <span className="text-sm text-gray-500">
                    Active: {userStats?.activeListings || 0} | 
                    Pending: {userStats?.pendingListings || 0} | 
                    Sold: {userStats?.totalItemsSold || 0}
                  </span>
                </div>
              </div>
              
              {myListings.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <div className="text-4xl mb-4">📦</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No listings yet</h3>
                  <p className="text-gray-500">Start by listing your first item for consignment</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myListings.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-gray-900 truncate">{item.title}</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                          {getStatusText(item.status)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">{item.description}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-bold text-green-600">${item.price}</span>
                        <span className="text-xs text-gray-500">
                          {item.createdAt.toLocaleDateString()}
                        </span>
                      </div>
                      {item.status === 'sold' && (
                        <div className="mt-2 text-xs text-green-600">
                          Earned: ${((item.soldPrice || item.price) * 0.75).toFixed(2)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sales Tab */}
          {activeTab === 'sales' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Sales History ({mySales.length})</h3>
                <div className="text-sm text-gray-500">
                  Total Earned: ${userStats?.totalEarnings.toFixed(2) || '0.00'}
                </div>
              </div>
              
              {mySales.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <div className="text-4xl mb-4">💰</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No sales yet</h3>
                  <p className="text-gray-500">Your earnings will appear here when items sell</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mySales.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSoldItemClick(item)}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{item.title}</h4>
                          <p className="text-sm text-gray-600">Sold on {item.soldAt?.toLocaleDateString()}</p>
                          <p className="text-xs text-gray-500">Sale price: ${(item.soldPrice || item.price).toFixed(2)}</p>
                          {item.buyerInfo && (
                            <p className="text-xs text-blue-600 mt-1">
                              Buyer: {item.buyerInfo.name} • {item.buyerInfo.city}, {item.buyerInfo.zipCode}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-600">
                            +${((item.soldPrice || item.price) * 0.75).toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">your earnings</div>
                          <div className="text-xs text-orange-600 mt-1">
                            📦 Click to manage fulfillment
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Purchases Tab */}
          {activeTab === 'purchases' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Purchase History ({purchaseHistory.length})</h3>
                <div className="text-sm text-gray-500">
                  Total Spent: ${userStats?.totalSpent.toFixed(2) || '0.00'}
                </div>
              </div>
              
              {purchaseHistory.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <div className="text-4xl mb-4">🛒</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No purchases yet</h3>
                  <p className="text-gray-500">Your purchase history will appear here after you make your first purchase</p>
                  <button className="mt-4 bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg transition-colors">
                    Start Shopping
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {purchaseHistory.map((purchase) => (
                    <div key={purchase.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-medium text-gray-900">Order #{purchase.id.slice(-8)}</h4>
                          <p className="text-sm text-gray-600">{purchase.purchaseDate.toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-blue-600">${purchase.total.toFixed(2)}</div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            purchase.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {purchase.status}
                          </span>
                        </div>
                      </div>
                      <div className="border-t pt-3">
                        <div className="text-sm text-gray-600 mb-2">Items purchased:</div>
                        <div className="space-y-1">
                          {purchase.items.map((item, index) => (
                            <div key={index} className="flex justify-between items-center text-sm">
                              <span className="text-gray-900">{item.title}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">Qty: {item.quantity}</span>
                                <span className="font-medium">${(item.price * item.quantity).toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* My Orders Tab */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">My Orders ({purchaseHistory.length})</h3>
                <div className="text-sm text-gray-500">
                  Total Spent: ${userStats?.totalSpent.toFixed(2) || '0.00'}
                </div>
              </div>
              
              {purchaseHistory.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <div className="text-4xl mb-4">📋</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No orders yet</h3>
                  <p className="text-gray-500">Your order history will appear here after you make your first purchase</p>
                  <button className="mt-4 bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg transition-colors">
                    Start Shopping
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {purchaseHistory.map((order) => (
                    <div key={order.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      {/* Order Header */}
                      <div className="bg-gray-50 px-6 py-4 border-b">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-900">Order {order.orderNumber || `#${order.id.slice(-8)}`}</h4>
                            <p className="text-sm text-gray-600">
                              Placed on {order.purchaseDate.toLocaleDateString()} at {order.purchaseDate.toLocaleTimeString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-gray-900">${order.total.toFixed(2)}</div>
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                              order.orderStatus === 'delivered' ? 'bg-green-100 text-green-800' :
                              order.orderStatus === 'shipped' ? 'bg-blue-100 text-blue-800' :
                              order.orderStatus === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {order.orderStatus?.charAt(0).toUpperCase() + order.orderStatus?.slice(1) || 'Completed'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Order Details */}
                      <div className="p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {/* Items Ordered */}
                          <div className="lg:col-span-2">
                            <h5 className="font-medium text-gray-900 mb-3">Items Ordered</h5>
                            <div className="space-y-3">
                              {order.items.map((item, index) => (
                                <div key={index} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                                  <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                                    {item.images && item.images.length > 0 ? (
                                      <img 
                                        src={item.images[0]} 
                                        alt={item.title}
                                        className="w-full h-full object-cover rounded-lg"
                                      />
                                    ) : (
                                      <span className="text-gray-400 text-2xl">📦</span>
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <h6 className="font-medium text-gray-900">{item.title}</h6>
                                    <p className="text-sm text-gray-600">
                                      {item.brand} • {item.category} • Size: {item.size}
                                    </p>
                                    <div className="flex items-center justify-between mt-1">
                                      <span className="text-sm text-gray-500">Qty: {item.quantity}</span>
                                      <span className="font-medium">${(item.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Order Information */}
                          <div className="space-y-4">
                            {/* Shipping Information */}
                            {order.customerInfo && (
                              <div className="bg-gray-50 rounded-lg p-4">
                                <h5 className="font-medium text-gray-900 mb-2">Shipping Address</h5>
                                <div className="text-sm text-gray-600 space-y-1">
                                  <p className="font-medium">{order.customerInfo.name}</p>
                                  <p>{order.customerInfo.address}</p>
                                  <p>{order.customerInfo.city}, {order.customerInfo.zipCode}</p>
                                  <p>{order.customerInfo.phone}</p>
                                  <p>{order.customerInfo.email}</p>
                                </div>
                              </div>
                            )}

                            {/* Payment Information */}
                            {order.paymentInfo && (
                              <div className="bg-gray-50 rounded-lg p-4">
                                <h5 className="font-medium text-gray-900 mb-2">Payment Method</h5>
                                <div className="text-sm text-gray-600 space-y-1">
                                  <p>{order.paymentInfo.method} ending in {order.paymentInfo.last4}</p>
                                  <p className="text-xs">Transaction ID: {order.paymentInfo.transactionId}</p>
                                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                    order.paymentInfo.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {order.paymentInfo.status}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Delivery Information */}
                            {order.trackingNumber && (
                              <div className="bg-gray-50 rounded-lg p-4">
                                <h5 className="font-medium text-gray-900 mb-2">Delivery</h5>
                                <div className="text-sm text-gray-600 space-y-1">
                                  <p>Tracking: {order.trackingNumber}</p>
                                  {order.estimatedDelivery && (
                                    <p>Estimated: {new Date(order.estimatedDelivery).toLocaleDateString()}</p>
                                  )}
                                </div>
                                <button 
                                  onClick={() => handleTrackingClick(
                                    order.trackingNumber, 
                                    order.orderNumber || `#${order.id.slice(-8)}`,
                                    order.estimatedDelivery
                                  )}
                                  className="mt-2 text-orange-600 hover:text-orange-700 text-sm font-medium"
                                >
                                  Track Package
                                </button>
                              </div>
                            )}

                            {/* Order Actions */}
                            <div className="space-y-2">
                              <button className="w-full border border-gray-300 text-gray-700 hover:bg-gray-50 py-2 px-4 rounded-lg transition-colors text-sm font-medium">
                                View Invoice
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Store Credit Tab */}
          {activeTab === 'credit' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-lg p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Store Credit Balance</h3>
                    <div className="text-3xl font-bold mt-1">${userStats?.storeCredit.toFixed(2) || '0.00'}</div>
                    <p className="text-orange-100 text-sm mt-1">Available for purchases</p>
                  </div>
                  <div className="text-6xl opacity-20">💳</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">How Store Credit Works</h4>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2">•</span>
                      <span>Earn 75% of your item's final sale price</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2">•</span>
                      <span>Credit is added automatically when items sell</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2">•</span>
                      <span>Use credit for purchases in our store</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2">•</span>
                      <span>Credit never expires</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2">•</span>
                      <span>Redeem credit during checkout</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Credit Summary</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Earned:</span>
                      <span className="font-medium text-green-600">+${userStats?.totalEarnings.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Used:</span>
                      <span className="font-medium text-red-600">-${((userStats?.totalEarnings || 0) - (userStats?.storeCredit || 0)).toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-3 flex justify-between items-center">
                      <span className="text-gray-900 font-semibold">Current Balance:</span>
                      <span className="font-bold text-orange-600 text-lg">${userStats?.storeCredit.toFixed(2) || '0.00'}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t">
                    <button className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 px-4 rounded-lg transition-colors font-medium">
                      Start Shopping
                    </button>
                  </div>
                </div>
              </div>

              {/* Recent Credit Activity */}
              {mySales.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Recent Credit Activity</h4>
                  <div className="space-y-2">
                    {mySales.slice(0, 5).map((item) => (
                      <div key={item.id} className="flex justify-between items-center text-sm">
                        <div>
                          <span className="text-gray-900">{item.title}</span>
                          <span className="text-gray-500 ml-2">sold {item.soldAt?.toLocaleDateString()}</span>
                        </div>
                        <span className="text-green-600 font-medium">
                          +${((item.soldPrice || item.price) * 0.75).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Item Detail Modal */}
      <ItemDetailModal 
        isOpen={isItemDetailModalOpen}
        onClose={handleItemDetailModalClose}
        item={selectedItem}
        onItemUpdated={() => {
          fetchUserData();
          fetchMyListings();
        }}
      />

      {/* Tracking Modal */}
      {showTrackingModal && selectedTracking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Package Tracking</h3>
                  <p className="text-sm text-gray-600 mt-1">{selectedTracking.orderNumber}</p>
                </div>
                <button
                  onClick={() => setShowTrackingModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-gray-900">Package In Transit</h4>
                <p className="text-sm text-gray-600">Your order is on its way!</p>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Tracking Number</span>
                    <span className="text-sm text-gray-900 font-mono">{selectedTracking.trackingNumber}</span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Estimated Delivery</span>
                    <span className="text-sm text-gray-900">
                      {new Date(selectedTracking.estimatedDelivery).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Fake tracking timeline */}
                <div className="space-y-3">
                  <h5 className="font-medium text-gray-900">Tracking History</h5>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">Package shipped</p>
                        <p className="text-xs text-gray-500">Denver, CO - 2 days ago</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">In transit</p>
                        <p className="text-xs text-gray-500">Salt Lake City, UT - 1 day ago</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">Out for delivery</p>
                        <p className="text-xs text-gray-500">Your city - Today</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-gray-300 rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-500">Delivered</p>
                        <p className="text-xs text-gray-400">Expected by end of day</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t">
                <button
                  onClick={() => setShowTrackingModal(false)}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 px-4 rounded-lg transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sold Item Modal */}
      <SoldItemModal 
        isOpen={showSoldItemModal}
        onClose={handleSoldItemModalClose}
        item={selectedSoldItem}
      />
    </div>
  );
};

export default UserAnalytics; 