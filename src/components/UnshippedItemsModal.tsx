import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, AuthUser } from '../types';
import { logUserAction } from '../services/firebaseService';
import { apiService } from '../services/apiService';
import NotificationModal from './NotificationModal';

interface UnshippedItemsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AuthUser | null;
    refreshTrigger?: number;
    onItemClick?: (item: ConsignmentItem) => void;
}

const UnshippedItemsModal: React.FC<UnshippedItemsModalProps> = ({ isOpen, onClose, user, refreshTrigger = 0, onItemClick }) => {
    const [loading, setLoading] = useState(false);
    const [unshippedItems, setUnshippedItems] = useState<ConsignmentItem[]>([]);
    const [isMarkingShipped, setIsMarkingShipped] = useState(false);
    const [showNotification, setShowNotification] = useState(false);
    const [notificationData, setNotificationData] = useState({
        title: '',
        message: '',
        type: 'info' as 'success' | 'error' | 'info' | 'warning'
    });

    // Helper function to show notifications
    const showNotificationModal = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => {
        setNotificationData({ title, message, type });
        setShowNotification(true);
    };

    useEffect(() => {
        if (isOpen) {
            fetchUnshippedItems();
        }
    }, [isOpen, refreshTrigger]);

    // Listen for unshipped items refresh events
    useEffect(() => {
        const handleUnshippedItemsRefresh = (event: CustomEvent) => {
            console.log('📦 Unshipped items refresh event received:', event.detail);
            if (isOpen && event.detail?.action === 'new_shipping_order') {
                console.log('🚚 New shipping order detected - refreshing unshipped items...');
                fetchUnshippedItems();
            }
        };

        const handleItemsUpdated = (event: CustomEvent) => {
            console.log('📦 Items updated event received:', event.detail);
            if (isOpen && event.detail?.action === 'purchase_completed') {
                console.log('🛒 Purchase completed - checking for new shipping orders...');
                // Delay refresh to ensure Firebase write is complete
                setTimeout(() => {
                    fetchUnshippedItems();
                }, 2000);
            }
        };

        // Add event listeners
        window.addEventListener('unshippedItemsRefresh', handleUnshippedItemsRefresh as EventListener);
        window.addEventListener('itemsUpdated', handleItemsUpdated as EventListener);
        
        return () => {
            window.removeEventListener('unshippedItemsRefresh', handleUnshippedItemsRefresh as EventListener);
            window.removeEventListener('itemsUpdated', handleItemsUpdated as EventListener);
        };
    }, [isOpen]);

    const fetchUnshippedItems = async () => {
        setLoading(true);
        try {
            console.log('🔍 Fetching unshipped items...');
            
            const itemsRef = collection(db, 'items');
            let q = query(
                itemsRef, 
                where('status', '==', 'sold'),
                where('saleType', '==', 'online'),
                where('fulfillmentMethod', '==', 'shipping')
            );

            console.log('📋 Query parameters:');
            console.log('  - status: "sold"');
            console.log('  - saleType: "online"');
            console.log('  - fulfillmentMethod: "shipping"');

            const querySnapshot = await getDocs(q);
            const items: ConsignmentItem[] = [];
            const allSoldItems: any[] = [];

            console.log(`📊 Found ${querySnapshot.size} items matching query`);

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                allSoldItems.push({ id: doc.id, ...data });
                
                console.log(`📦 Checking item ${doc.id}:`, {
                    title: data.title,
                    status: data.status,
                    saleType: data.saleType,
                    fulfillmentMethod: data.fulfillmentMethod,
                    shippedAt: data.shippedAt,
                    soldAt: data.soldAt
                });
                
                // Only include items that haven't been shipped yet
                if (!data.shippedAt) {
                    items.push({
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate() || new Date(),
                        approvedAt: data.approvedAt?.toDate(),
                        liveAt: data.liveAt?.toDate(),
                        soldAt: data.soldAt?.toDate() || new Date(),
                        shippedAt: data.shippedAt?.toDate(),
                        deliveredAt: data.deliveredAt?.toDate()
                    } as ConsignmentItem);
                    console.log(`✅ Added item ${doc.id} to unshipped list`);
                } else {
                    console.log(`⏭️ Skipped item ${doc.id} - already shipped at ${data.shippedAt}`);
                }
            });

            console.log(`📈 Total unshipped items found: ${items.length}`);
            console.log('📋 All sold items for debugging:', allSoldItems);

            items.sort((a, b) => {
                const aTime = a.soldAt || a.createdAt;
                const bTime = b.soldAt || b.createdAt;
                return bTime.getTime() - aTime.getTime();
            });

            setUnshippedItems(items);
            console.log('✅ Unshipped items state updated');
        } catch (error) {
            console.error('❌ Error fetching unshipped items:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsShipped = async (item: ConsignmentItem) => {
        if (!item.id) return;
        
        setIsMarkingShipped(true);
        try {
            // Check if user is authenticated and not a phone user
            if (!user || ('isPhoneUser' in user && user.isPhoneUser)) {
                throw new Error('Admin access required - please sign in with Google');
            }

            // Use apiService to mark item as shipped
            const result = await apiService.markItemShipped(item.id);
            
            // Log the shipping action for user tracking
            await logUserAction(user, 'item_shipped', `Item marked as shipped with tracking ${result.trackingNumber}`, item.id, item.title);

            // Remove item from unshipped list
            setUnshippedItems(prev => prev.filter(unshippedItem => unshippedItem.id !== item.id));

            console.log(`✅ Item ${item.id} marked as shipped successfully`);

        } catch (error) {
            console.error('Error marking item as shipped:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            showNotificationModal('Shipping Error', `Failed to mark item as shipped: ${errorMessage}`, 'error');
        } finally {
            setIsMarkingShipped(false);
        }
    };

    const handleViewDetails = (item: ConsignmentItem) => {
        if (onItemClick) {
            onItemClick(item);
        }
    };

    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
    const formatDate = (date: Date) => date.toLocaleDateString();

    const totalRevenue = unshippedItems.reduce((sum, item) => sum + (item.soldPrice || item.price), 0);
    const totalAdminEarnings = unshippedItems.reduce((sum, item) => {
        const soldPrice = item.soldPrice || item.price;
        return sum + (soldPrice * 0.25);
    }, 0);
    const totalUserEarnings = unshippedItems.reduce((sum, item) => {
        const soldPrice = item.soldPrice || item.price;
        return sum + (soldPrice * 0.75);
    }, 0);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Unshipped Items</h2>
                            <p className="text-gray-600">Online orders awaiting shipment</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <div className="bg-white border border-gray-200 rounded-lg p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    Items Awaiting Shipment ({unshippedItems.length})
                                </h3>
                                
                                {unshippedItems.length === 0 ? (
                                    <div className="text-center py-8">
                                        <div className="text-gray-400 mb-4">
                                            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                            </svg>
                                        </div>
                                        <p className="text-gray-500 text-lg">No items awaiting shipment</p>
                                        <p className="text-gray-400 text-sm mt-2">All online orders have been shipped or are store pickups</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seller</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Buyer</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sold Price</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Sold</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days Pending</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {unshippedItems.map((item) => {
                                                    const soldPrice = item.soldPrice || item.price;
                                                    const daysPending = Math.floor((new Date().getTime() - (item.soldAt || new Date()).getTime()) / (1000 * 60 * 60 * 24));
                                                    
                                                    return (
                                                        <tr key={item.id} className="hover:bg-gray-50">
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center">
                                                                    {item.images && item.images[0] && (
                                                                        <img className="h-10 w-10 rounded-lg object-cover mr-3" src={item.images[0]} alt={item.title} />
                                                                    )}
                                                                    <div>
                                                                        <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{item.title}</div>
                                                                        <div className="flex items-center gap-1 mt-1">
                                                                            <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                                                                            <span className="text-xs text-orange-600 font-medium">Awaiting Shipment</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.sellerName}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {item.buyerInfo ? item.buyerInfo.name : 'N/A'}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">{formatCurrency(soldPrice)}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(item.soldAt || new Date())}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                                    daysPending > 3 
                                                                        ? 'bg-red-100 text-red-800' 
                                                                        : daysPending > 1 
                                                                            ? 'bg-yellow-100 text-yellow-800'
                                                                            : 'bg-green-100 text-green-800'
                                                                }`}>
                                                                    {daysPending} day{daysPending !== 1 ? 's' : ''}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                                                <button
                                                                    onClick={() => handleViewDetails(item)}
                                                                    className="text-blue-600 hover:text-blue-900 font-medium"
                                                                >
                                                                    View Details
                                                                </button>
                                                                <button
                                                                    onClick={() => handleMarkAsShipped(item)}
                                                                    disabled={isMarkingShipped}
                                                                    className="text-orange-600 hover:text-orange-900 font-medium disabled:text-gray-400"
                                                                >
                                                                    {isMarkingShipped ? 'Shipping...' : 'Mark Shipped'}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Notification Modal */}
                <NotificationModal
                    isOpen={showNotification}
                    onClose={() => setShowNotification(false)}
                    title={notificationData.title}
                    message={notificationData.message}
                    type={notificationData.type}
                />
            </div>
        </div>
    );
};

export default UnshippedItemsModal; 