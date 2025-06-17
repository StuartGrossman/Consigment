import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { db } from '../config/firebase';
import { ConsignmentItem } from '../types';

interface SoldItemsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: FirebaseUser | null;
    refreshTrigger?: number;
}

const SoldItemsModal: React.FC<SoldItemsModalProps> = ({ isOpen, onClose, user, refreshTrigger = 0 }) => {
    const [loading, setLoading] = useState(false);
    const [soldItems, setSoldItems] = useState<ConsignmentItem[]>([]);
    const [selectedTimeframe, setSelectedTimeframe] = useState<'week' | 'month' | 'year' | 'all'>('month');

    useEffect(() => {
        console.log('SoldItemsModal useEffect triggered:', { isOpen, refreshTrigger });
        if (isOpen) {
            fetchSoldItems();
        }
    }, [isOpen, selectedTimeframe, refreshTrigger]);

    const fetchSoldItems = async () => {
        setLoading(true);
        try {
            const itemsRef = collection(db, 'items');
            let q = query(itemsRef, where('status', '==', 'sold'));

            try {
                q = query(q, orderBy('soldAt', 'desc'));
            } catch (error) {
                console.warn('Could not order by soldAt, using unordered query');
            }

            const querySnapshot = await getDocs(q);
            const items: ConsignmentItem[] = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                items.push({
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate() || new Date(),
                    approvedAt: data.approvedAt?.toDate(),
                    liveAt: data.liveAt?.toDate(),
                    soldAt: data.soldAt?.toDate() || new Date()
                } as ConsignmentItem);
            });

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

    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
    const formatDate = (date: Date) => date.toLocaleDateString();

    const totalRevenue = soldItems.reduce((sum, item) => sum + (item.soldPrice || item.price), 0);
    const totalOriginalPrice = soldItems.reduce((sum, item) => sum + item.price, 0);
    const averageMarkdown = totalOriginalPrice > 0 ? ((totalOriginalPrice - totalRevenue) / totalOriginalPrice) * 100 : 0;

    if (!isOpen) return null;

    return (
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
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
                                    <h3 className="text-lg font-semibold mb-2">Total Revenue</h3>
                                    <p className="text-3xl font-bold">{formatCurrency(totalRevenue)}</p>
                                </div>
                                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                                    <h3 className="text-lg font-semibold mb-2">Items Sold</h3>
                                    <p className="text-3xl font-bold">{soldItems.length}</p>
                                </div>
                                <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 text-white">
                                    <h3 className="text-lg font-semibold mb-2">Avg Markdown</h3>
                                    <p className="text-3xl font-bold">{averageMarkdown.toFixed(1)}%</p>
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
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Sold</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {soldItems.map((item) => {
                                                const soldPrice = item.soldPrice || item.price;
                                                
                                                return (
                                                    <tr key={item.id} className="hover:bg-gray-50">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center">
                                                                {item.images && item.images[0] && (
                                                                    <img className="h-10 w-10 rounded-lg object-cover mr-3" src={item.images[0]} alt={item.title} />
                                                                )}
                                                                <div>
                                                                    <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{item.title}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.sellerName}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(item.price)}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">{formatCurrency(soldPrice)}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(item.soldAt || new Date())}</td>
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
    );
};

export default SoldItemsModal; 