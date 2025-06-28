import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, AuthUser } from '../types';
import { logUserAction } from '../services/firebaseService';
import { apiService } from '../services/apiService';
import NotificationModal from './NotificationModal';

interface SoldItemsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AuthUser | null;
    refreshTrigger?: number;
}

const SoldItemsModal: React.FC<SoldItemsModalProps> = ({ isOpen, onClose, user, refreshTrigger = 0 }) => {
    const [loading, setLoading] = useState(false);
    const [soldItems, setSoldItems] = useState<ConsignmentItem[]>([]);
    const [selectedTimeframe, setSelectedTimeframe] = useState<'week' | 'month' | 'year' | 'all'>('month');
    const [selectedItem, setSelectedItem] = useState<ConsignmentItem | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
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
            fetchSoldItems();
        }
    }, [isOpen, selectedTimeframe, refreshTrigger]);

    const fetchSoldItems = async () => {
        setLoading(true);
        try {
            const itemsRef = collection(db, 'items');
            let q = query(itemsRef, where('status', '==', 'sold'));

            let querySnapshot;
            try {
                // Try with orderBy first
                const orderedQuery = query(q, orderBy('soldAt', 'desc'));
                querySnapshot = await getDocs(orderedQuery);
            } catch (orderError) {
                console.warn('Could not order by soldAt, using unordered query:', orderError);
                // Fall back to unordered query
                querySnapshot = await getDocs(q);
            }

            const items: ConsignmentItem[] = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
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
            });

            // Sort manually if we couldn't use orderBy
            items.sort((a, b) => {
                const aTime = a.soldAt || a.createdAt;
                const bTime = b.soldAt || b.createdAt;
                return bTime.getTime() - aTime.getTime();
            });

            setSoldItems(items);
        } catch (error) {
            console.error('Error fetching sold items:', error);
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

            // Log the shipping action
            await logUserAction(user, 'item_shipped', `Item marked as shipped with tracking ${result.trackingNumber}`, item.id, item.title);

            // Update the local state with shipping information
            const shippingData = {
                shippedAt: new Date(result.shippedAt),
                trackingNumber: result.trackingNumber,
                shippingLabelGenerated: true
            };

            setSoldItems(prev => prev.map(soldItem => 
                soldItem.id === item.id 
                    ? { ...soldItem, ...shippingData }
                    : soldItem
            ));

            // Update the selected item if it's the one being shipped
            if (selectedItem?.id === item.id) {
                setSelectedItem({ ...selectedItem, ...shippingData });
            }

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
        setSelectedItem(item);
        setShowDetailModal(true);
    };

    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
    const formatDate = (date: Date) => date.toLocaleDateString();

    const totalRevenue = soldItems.reduce((sum, item) => sum + (item.soldPrice || item.price), 0);
    const totalOriginalPrice = soldItems.reduce((sum, item) => sum + item.price, 0);
    const averageMarkdown = totalOriginalPrice > 0 ? ((totalOriginalPrice - totalRevenue) / totalOriginalPrice) * 100 : 0;
    
    // Calculate admin earnings (25% of sold items)
    const totalAdminEarnings = soldItems.reduce((sum, item) => {
        const soldPrice = item.soldPrice || item.price;
        const adminEarnings = item.adminEarnings || (soldPrice * 0.25);
        return sum + adminEarnings;
    }, 0);
    
    // Calculate user earnings (75% of sold items)
    const totalUserEarnings = soldItems.reduce((sum, item) => {
        const soldPrice = item.soldPrice || item.price;
        const userEarnings = item.userEarnings || (soldPrice * 0.75);
        return sum + userEarnings;
    }, 0);

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
                    <div className="p-6 border-b border-gray-200">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Sold Items Analytics</h2>
                                <p className="text-gray-600">Track sales performance and revenue</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                        {loading ? (
                            <div className="flex justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                                    <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
                                        <h3 className="text-lg font-semibold mb-2">Total Revenue</h3>
                                        <p className="text-3xl font-bold">{formatCurrency(totalRevenue)}</p>
                                    </div>
                                    <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 text-white">
                                        <h3 className="text-lg font-semibold mb-2">Admin Earnings (25%)</h3>
                                        <p className="text-3xl font-bold">{formatCurrency(totalAdminEarnings)}</p>
                                    </div>
                                    <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white">
                                        <h3 className="text-lg font-semibold mb-2">User Earnings (75%)</h3>
                                        <p className="text-3xl font-bold">{formatCurrency(totalUserEarnings)}</p>
                                    </div>
                                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                                        <h3 className="text-lg font-semibold mb-2">Items Sold</h3>
                                        <p className="text-3xl font-bold">{soldItems.length}</p>
                                    </div>
                                    <div className="bg-gradient-to-r from-slate-500 to-slate-600 rounded-xl p-6 text-white">
                                        <h3 className="text-lg font-semibold mb-2">Sale Types</h3>
                                        <div className="text-sm space-y-1">
                                            <div>In-Store: {soldItems.filter(item => item.saleType === 'in-store').length}</div>
                                            <div>Online: {soldItems.filter(item => item.saleType === 'online').length}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white border border-gray-200 rounded-lg p-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                        All Sold Items ({soldItems.length})
                                    </h3>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seller</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original Price</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sold Price</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale Type</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admin (25%)</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User (75%)</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Sold</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {soldItems.map((item) => {
                                                    const soldPrice = item.soldPrice || item.price;
                                                    const adminEarnings = item.adminEarnings || (soldPrice * 0.25);
                                                    const userEarnings = item.userEarnings || (soldPrice * 0.75);
                                                    
                                                    return (
                                                        <tr key={item.id} className="hover:bg-gray-50">
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center">
                                                                    {item.images && item.images[0] && (
                                                                        <img className="h-10 w-10 rounded-lg object-cover mr-3" src={item.images[0]} alt={item.title} />
                                                                    )}
                                                                    <div>
                                                                        <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{item.title}</div>
                                                                        {item.shippedAt && (
                                                                            <div className="flex items-center gap-1 mt-1">
                                                                                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                                                                                <span className="text-xs text-yellow-600 font-medium">Shipped</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.sellerName}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(item.price)}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">{formatCurrency(soldPrice)}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                                    item.saleType === 'online' 
                                                                        ? 'bg-blue-100 text-blue-800' 
                                                                        : 'bg-green-100 text-green-800'
                                                                }`}>
                                                                    {item.saleType === 'online' ? '🌐 Online' : '🏪 In-Store'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-orange-600">{formatCurrency(adminEarnings)}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-purple-600">{formatCurrency(userEarnings)}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(item.soldAt || new Date())}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                                <button
                                                                    onClick={() => handleViewDetails(item)}
                                                                    className="text-blue-600 hover:text-blue-900 font-medium px-3 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors min-w-[100px]"
                                                                >
                                                                    View Details
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Item Detail Modal */}
            {showDetailModal && selectedItem && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <h2 className="text-2xl font-bold text-gray-800">{selectedItem.title}</h2>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="text-2xl font-bold text-green-600">${selectedItem.soldPrice || selectedItem.price}</span>
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            selectedItem.saleType === 'online' 
                                                ? 'bg-blue-100 text-blue-800' 
                                                : 'bg-green-100 text-green-800'
                                        }`}>
                                            {selectedItem.saleType === 'online' ? '🌐 Online Sale' : '🏪 In-Store Sale'}
                                        </span>
                                        {selectedItem.shippedAt && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                <div className="w-2 h-2 bg-yellow-400 rounded-full mr-1"></div>
                                                Shipped
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowDetailModal(false)}
                                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                                >
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6 pb-24">
                            {/* Item Images */}
                            {selectedItem.images && selectedItem.images.length > 0 && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {selectedItem.images.map((image, index) => (
                                        <img
                                            key={index}
                                            src={image}
                                            alt={`${selectedItem.title} ${index + 1}`}
                                            className="w-full h-32 object-cover rounded-lg border border-gray-200"
                                        />
                                    ))}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Item Details */}
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-2">Item Details</h3>
                                        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div><span className="font-medium">Category:</span> {selectedItem.category}</div>
                                                <div><span className="font-medium">Brand:</span> {selectedItem.brand || 'N/A'}</div>
                                                <div><span className="font-medium">Size:</span> {selectedItem.size || 'N/A'}</div>
                                                <div><span className="font-medium">Condition:</span> {selectedItem.condition || 'N/A'}</div>
                                                <div><span className="font-medium">Original Price:</span> ${selectedItem.price}</div>
                                                <div><span className="font-medium">Sold Price:</span> ${selectedItem.soldPrice || selectedItem.price}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Seller Information */}
                                    <div>
                                        <h4 className="font-medium text-gray-800 mb-2">Seller Information</h4>
                                        <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                                            <div><span className="font-medium">Name:</span> {selectedItem.sellerName}</div>
                                            <div><span className="font-medium">Email:</span> {selectedItem.sellerEmail}</div>
                                            <div><span className="font-medium">Listed:</span> {selectedItem.createdAt?.toLocaleDateString()}</div>
                                            <div><span className="font-medium">Sold:</span> {selectedItem.soldAt?.toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Sale & Shipping Information */}
                                <div className="space-y-4">
                                    {/* Sale Information */}
                                    <div>
                                        <h4 className="font-medium text-gray-800 mb-2">Sale Information</h4>
                                        <div className="bg-green-50 rounded-lg p-4 space-y-2 text-sm">
                                            <div><span className="font-medium">Sale Type:</span> {selectedItem.saleType === 'online' ? 'Online' : 'In-Store'}</div>
                                            <div><span className="font-medium">Transaction ID:</span> {selectedItem.saleTransactionId || 'N/A'}</div>
                                            <div><span className="font-medium">Admin Earnings (25%):</span> ${((selectedItem.soldPrice || selectedItem.price) * 0.25).toFixed(2)}</div>
                                            <div><span className="font-medium">User Earnings (75%):</span> ${((selectedItem.soldPrice || selectedItem.price) * 0.75).toFixed(2)}</div>
                                        </div>
                                    </div>

                                    {/* Buyer Information for Online Sales */}
                                    {selectedItem.saleType === 'online' && selectedItem.buyerInfo && (
                                        <div>
                                            <h4 className="font-medium text-gray-800 mb-2">Buyer Information</h4>
                                            <div className="bg-blue-50 rounded-lg p-4 space-y-2 text-sm">
                                                <div><span className="font-medium">Name:</span> {selectedItem.buyerInfo.name}</div>
                                                <div><span className="font-medium">Email:</span> {selectedItem.buyerInfo.email}</div>
                                                <div><span className="font-medium">Phone:</span> {selectedItem.buyerInfo.phone}</div>
                                                <div><span className="font-medium">Address:</span> {selectedItem.buyerInfo.address}</div>
                                                <div><span className="font-medium">City:</span> {selectedItem.buyerInfo.city}</div>
                                                <div><span className="font-medium">Zip Code:</span> {selectedItem.buyerInfo.zipCode}</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Shipping Information for Online Sales */}
                                    {selectedItem.saleType === 'online' && (
                                        <div>
                                            <h4 className="font-medium text-gray-800 mb-2">Shipping Information</h4>
                                            <div className="bg-yellow-50 rounded-lg p-4 space-y-2 text-sm">
                                                <div><span className="font-medium">Fulfillment:</span> {selectedItem.fulfillmentMethod === 'shipping' ? 'Home Delivery' : 'Store Pickup'}</div>
                                                {selectedItem.fulfillmentMethod === 'shipping' && (
                                                    <>
                                                        <div><span className="font-medium">Tracking Number:</span> {selectedItem.trackingNumber || 'Not assigned'}</div>
                                                        <div><span className="font-medium">Shipped Date:</span> {selectedItem.shippedAt ? selectedItem.shippedAt.toLocaleDateString() : 'Not shipped'}</div>
                                                        <div><span className="font-medium">Delivery Date:</span> {selectedItem.deliveredAt ? selectedItem.deliveredAt.toLocaleDateString() : 'Not delivered'}</div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            {selectedItem.saleType === 'online' && selectedItem.fulfillmentMethod === 'shipping' && !selectedItem.shippedAt && (
                                <div className="border-t pt-4">
                                    <button
                                        onClick={() => handleMarkAsShipped(selectedItem)}
                                        disabled={isMarkingShipped}
                                        className="bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isMarkingShipped ? (
                                            <>
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                Marking as Shipped...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                                </svg>
                                                Mark as Shipped
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* Tracking Information */}
                            {selectedItem.shippedAt && selectedItem.trackingNumber && (
                                <div className="border-t pt-4">
                                    <div className="bg-green-50 rounded-lg p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="font-medium text-green-800">Item Shipped Successfully</span>
                                        </div>
                                        <div className="text-sm text-green-700">
                                            <p><strong>Tracking Number:</strong> {selectedItem.trackingNumber}</p>
                                            <p><strong>Shipped Date:</strong> {selectedItem.shippedAt.toLocaleDateString()}</p>
                                            <p className="mt-2 text-xs text-green-600">
                                                Click "View Tracking" to see delivery status (feature coming soon)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 mt-6">
                            <div className="flex justify-end">
                                <button
                                    onClick={() => setShowDetailModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification Modal */}
            <NotificationModal
                isOpen={showNotification}
                onClose={() => setShowNotification(false)}
                title={notificationData.title}
                message={notificationData.message}
                type={notificationData.type}
            />
        </>
    );
};

export default SoldItemsModal; 