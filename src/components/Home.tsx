import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem } from '../types';
import ItemCard from './ItemCard';
import AddItemModal from './AddItemModal';
import AdminModal from './AdminModal';
import ApprovedItemsModal from './ApprovedItemsModal';
import UserAnalyticsModal from './UserAnalyticsModal';
import SoldItemsModal from './SoldItemsModal';

const Home: React.FC = () => {
    const { user, loading, signInWithGoogle, logout, isAuthenticated } = useAuth();
    const [items, setItems] = useState<ConsignmentItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [isApprovedModalOpen, setIsApprovedModalOpen] = useState(false);
    const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
    const [isSoldItemsModalOpen, setIsSoldItemsModalOpen] = useState(false);
    const [loadingItems, setLoadingItems] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [filters, setFilters] = useState({
        category: '',
        gender: '',
        size: '',
        brand: '',
        priceRange: '',
        sortBy: 'newest'
    });
    const [notificationCounts, setNotificationCounts] = useState({
        pending: 0,
        approved: 0,
        sold: 0
    });

    useEffect(() => {
        if (isAuthenticated) {
            fetchItems();
            checkAdminStatus();
        } else {
            setLoadingItems(false);
            setIsAdmin(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (isAdmin) {
            fetchNotificationCounts();
            // Set up interval to refresh counts every 30 seconds
            const interval = setInterval(fetchNotificationCounts, 30000);
            return () => clearInterval(interval);
        }
    }, [isAdmin]);

    const checkAdminStatus = async () => {
        if (!user) return;
        
        try {
            const adminDoc = await getDoc(doc(db, 'admins', user.uid));
            setIsAdmin(adminDoc.exists());
        } catch (error) {
            console.error('Error checking admin status:', error);
            setIsAdmin(false);
        }
    };

    const fetchNotificationCounts = async () => {
        if (!user) return;
        
        try {
            const itemsRef = collection(db, 'items');
            
            // Get pending items count
            const pendingQuery = query(itemsRef, where('status', '==', 'pending'));
            const pendingSnapshot = await getDocs(pendingQuery);
            
            // Get approved items count
            const approvedQuery = query(itemsRef, where('status', '==', 'approved'));
            const approvedSnapshot = await getDocs(approvedQuery);
            
            // Get recently sold items count (sold in last 24 hours)
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const soldQuery = query(
                itemsRef, 
                where('status', '==', 'sold'),
                where('soldAt', '>=', oneDayAgo)
            );
            const soldSnapshot = await getDocs(soldQuery);
            
            setNotificationCounts({
                pending: pendingSnapshot.size,
                approved: approvedSnapshot.size,
                sold: soldSnapshot.size
            });
        } catch (error) {
            console.error('Error fetching notification counts:', error);
        }
    };

    const fetchItems = async () => {
        try {
            const itemsRef = collection(db, 'items');
            
            let q;
            try {
                q = query(
                    itemsRef, 
                    where('status', '==', 'live'),
                    orderBy('liveAt', 'desc')
                );
            } catch (indexError) {
                q = query(
                    itemsRef, 
                    where('status', '==', 'live')
                );
            }
            
            const querySnapshot = await getDocs(q);
            const fetchedItems: ConsignmentItem[] = [];
            
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                fetchedItems.push({ 
                    id: doc.id, 
                    ...data,
                    createdAt: data.createdAt?.toDate() || new Date(),
                    approvedAt: data.approvedAt?.toDate(),
                    liveAt: data.liveAt?.toDate()
                } as ConsignmentItem);
            });
            
            fetchedItems.sort((a, b) => {
                const aTime = a.liveAt || a.createdAt;
                const bTime = b.liveAt || b.createdAt;
                return bTime.getTime() - aTime.getTime();
            });
            
            setItems(fetchedItems);
        } catch (error) {
            console.error('Error fetching items:', error);
            setItems([]);
        } finally {
            setLoadingItems(false);
        }
    };

    const handleAddItem = () => {
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        fetchItems();
    };

    const handleAdminModal = () => {
        setIsAdminModalOpen(true);
    };

    const handleAdminModalClose = () => {
        setIsAdminModalOpen(false);
        fetchItems();
        if (isAdmin) fetchNotificationCounts();
    };

    const handleApprovedModal = () => {
        setIsApprovedModalOpen(true);
    };

    const handleApprovedModalClose = () => {
        setIsApprovedModalOpen(false);
        fetchItems();
        if (isAdmin) fetchNotificationCounts();
    };

    const handleAnalyticsModal = () => {
        setIsAnalyticsModalOpen(true);
    };

    const handleAnalyticsModalClose = () => {
        setIsAnalyticsModalOpen(false);
        fetchItems();
    };

    const handleSoldItemsModal = () => {
        setIsSoldItemsModalOpen(true);
    };

    const handleSoldItemsModalClose = () => {
        setIsSoldItemsModalOpen(false);
        fetchItems();
    };

    const handleMarkAsSold = async (item: ConsignmentItem, soldPrice: number) => {
        try {
            const itemRef = doc(db, 'items', item.id);
            await updateDoc(itemRef, {
                status: 'sold',
                soldAt: new Date(),
                soldPrice: soldPrice
            });
            
            // Refresh the items list to remove the sold item
            await fetchItems();
            // Trigger refresh for any open modals
            setRefreshTrigger(prev => {
                console.log('Incrementing refresh trigger from', prev, 'to', prev + 1);
                return prev + 1;
            });
        } catch (error) {
            console.error('Error marking item as sold:', error);
            throw error;
        }
    };

    const handleFilterChange = (filterType: string, value: string) => {
        setFilters(prev => ({
            ...prev,
            [filterType]: value
        }));
    };

    const clearFilters = () => {
        setFilters({
            category: '',
            gender: '',
            size: '',
            brand: '',
            priceRange: '',
            sortBy: 'newest'
        });
    };

    const getFilteredAndSortedItems = () => {
        let filtered = [...items];

        // Apply filters
        if (filters.category) {
            filtered = filtered.filter(item => item.category === filters.category);
        }
        if (filters.gender) {
            filtered = filtered.filter(item => item.gender === filters.gender);
        }
        if (filters.size) {
            filtered = filtered.filter(item => item.size === filters.size);
        }
        if (filters.brand) {
            filtered = filtered.filter(item => item.brand?.toLowerCase().includes(filters.brand.toLowerCase()));
        }
        if (filters.priceRange) {
            const [min, max] = filters.priceRange.split('-').map(Number);
            filtered = filtered.filter(item => {
                if (max) {
                    return item.price >= min && item.price <= max;
                } else {
                    return item.price >= min;
                }
            });
        }

        // Apply sorting
        switch (filters.sortBy) {
            case 'price-low':
                filtered.sort((a, b) => a.price - b.price);
                break;
            case 'price-high':
                filtered.sort((a, b) => b.price - a.price);
                break;
            case 'oldest':
                filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                break;
            case 'newest':
            default:
                filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                break;
        }

        return filtered;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-400 mx-auto"></div>
                    <p className="mt-4 text-white">Loading Summit Gear...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
                {/* Navigation */}
                <nav className="bg-black/20 backdrop-blur-md border-b border-white/10">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between items-center py-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-9 7-6-2 1-14z" />
                                    </svg>
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-white">Summit Gear Exchange</h1>
                                    <p className="text-xs text-gray-300">Mountain Consignment Store</p>
                                </div>
                            </div>
                            <button
                                onClick={signInWithGoogle}
                                className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                </svg>
                                Sign In
                            </button>
                        </div>
                    </div>
                </nav>

                {/* Hero Section */}
                <div className="relative overflow-hidden">
                    <div className="absolute inset-0">
                        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 to-blue-900/70 z-10"></div>
                        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-blue-900"></div>
                        {/* Mountain silhouette */}
                        <svg className="absolute bottom-0 w-full h-64 text-slate-700" fill="currentColor" viewBox="0 0 1200 300">
                            <path d="M0,300 L0,200 L100,150 L200,100 L300,120 L400,80 L500,90 L600,50 L700,70 L800,40 L900,60 L1000,30 L1100,50 L1200,20 L1200,300 Z"/>
                        </svg>
                    </div>
                    
                    <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
                        <div className="text-center">
                            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
                                Premium Mountain
                                <span className="block text-orange-400">Gear Exchange</span>
                            </h1>
                            <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
                                Buy and sell quality outdoor equipment. From climbing gear to skiing essentials, 
                                find everything you need for your next mountain adventure.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <button
                                    onClick={signInWithGoogle}
                                    className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-lg text-lg font-semibold transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg className="w-6 h-6" viewBox="0 0 24 24">
                                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                    </svg>
                                    Enter Store
                                </button>
                                <button
                                    onClick={signInWithGoogle}
                                    className="border-2 border-orange-400 text-orange-400 hover:bg-orange-400 hover:text-white px-8 py-4 rounded-lg text-lg font-semibold transition-colors"
                                >
                                    Start Selling
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Features Section */}
                <div className="py-24 bg-slate-800">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl font-bold text-white mb-4">Why Choose Summit Gear Exchange?</h2>
                            <p className="text-gray-400 text-lg">The trusted marketplace for mountain enthusiasts</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="bg-slate-700/50 backdrop-blur-sm rounded-xl p-8 text-center">
                                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-4">Quality Guaranteed</h3>
                                <p className="text-gray-400">Every item is inspected by our mountain gear experts before listing</p>
                            </div>
                            
                            <div className="bg-slate-700/50 backdrop-blur-sm rounded-xl p-8 text-center">
                                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-4">Fair Pricing</h3>
                                <p className="text-gray-400">Competitive prices for both buyers and sellers in the outdoor community</p>
                            </div>
                            
                            <div className="bg-slate-700/50 backdrop-blur-sm rounded-xl p-8 text-center">
                                <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-4">Community Focused</h3>
                                <p className="text-gray-400">Built by climbers, for climbers. Join our community of mountain enthusiasts</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Categories Preview */}
                <div className="py-24 bg-slate-900">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl font-bold text-white mb-4">Popular Categories</h2>
                            <p className="text-gray-400 text-lg">Find gear for every mountain adventure</p>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            {[
                                { name: 'Climbing', icon: '🧗', color: 'from-red-500 to-orange-500' },
                                { name: 'Skiing', icon: '⛷️', color: 'from-blue-500 to-cyan-500' },
                                { name: 'Hiking', icon: '🥾', color: 'from-green-500 to-emerald-500' },
                                { name: 'Camping', icon: '⛺', color: 'from-purple-500 to-pink-500' },
                                { name: 'Mountaineering', icon: '🏔️', color: 'from-gray-500 to-slate-500' },
                                { name: 'Snowboarding', icon: '🏂', color: 'from-indigo-500 to-blue-500' },
                                { name: 'Cycling', icon: '🚵', color: 'from-yellow-500 to-orange-500' },
                                { name: 'Water Sports', icon: '🚣', color: 'from-teal-500 to-cyan-500' }
                            ].map((category, index) => (
                                <div key={index} className={`bg-gradient-to-br ${category.color} rounded-xl p-6 text-center cursor-pointer hover:scale-105 transition-transform`}>
                                    <div className="text-4xl mb-3">{category.icon}</div>
                                    <h3 className="text-white font-semibold">{category.name}</h3>
                                </div>
                            ))}
                        </div>
                        
                        <div className="text-center mt-12">
                            <button
                                onClick={signInWithGoogle}
                                className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
                            >
                                Sign In to Browse All Items
                            </button>
                        </div>
                    </div>
                </div>

                {/* CTA Section */}
                <div className="py-24 bg-gradient-to-r from-orange-600 to-orange-500">
                    <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                            Ready to Gear Up?
                        </h2>
                        <p className="text-xl text-orange-100 mb-8">
                            Join thousands of mountain enthusiasts buying and selling quality gear
                        </p>
                        <button
                            onClick={signInWithGoogle}
                            className="bg-white text-orange-600 hover:bg-gray-100 px-8 py-4 rounded-lg text-lg font-semibold transition-colors flex items-center justify-center gap-2 mx-auto"
                        >
                            <svg className="w-6 h-6" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Get Started Now
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-9 7-6-2 1-14z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">Summit Gear Exchange</h1>
                                <p className="text-xs text-gray-500">Mountain Consignment Store</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleAddItem}
                                className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition-colors font-medium"
                            >
                                List Item
                            </button>
                            
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={handleAdminModal}
                                        className="relative bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors text-sm"
                                    >
                                        Manage Items
                                        {notificationCounts.pending > 0 && (
                                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                                {notificationCounts.pending > 9 ? '9+' : notificationCounts.pending}
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        onClick={handleApprovedModal}
                                        className="relative bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm"
                                    >
                                        Approved Items
                                        {notificationCounts.approved > 0 && (
                                            <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                                {notificationCounts.approved > 9 ? '9+' : notificationCounts.approved}
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        onClick={handleSoldItemsModal}
                                        className="relative bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors text-sm"
                                    >
                                        Sold Items
                                        {notificationCounts.sold > 0 && (
                                            <span className="absolute -top-2 -right-2 bg-yellow-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                                {notificationCounts.sold > 9 ? '9+' : notificationCounts.sold}
                                            </span>
                                        )}
                                    </button>
                                </>
                            )}
                            
                            <button
                                onClick={handleAnalyticsModal}
                                className={`px-4 py-2 rounded-lg transition-colors text-sm ${
                                    isAdmin 
                                        ? 'bg-teal-500 text-white hover:bg-teal-600' 
                                        : 'bg-gray-500 text-white hover:bg-gray-600'
                                }`}
                            >
                                {isAdmin ? 'User Analytics' : 'My Statistics'}
                            </button>
                            
                            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                                <img 
                                    src={user?.photoURL || ''} 
                                    alt={user?.displayName || 'User'} 
                                    className="w-8 h-8 rounded-full"
                                />
                                <div className="text-sm">
                                    <div className="font-medium text-gray-700">{user?.displayName}</div>
                                    {isAdmin && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Admin</span>}
                                </div>
                                <button
                                    onClick={logout}
                                    className="text-sm text-gray-500 hover:text-red-500 ml-2"
                                >
                                    Logout
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content with Sidebar */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex gap-8">
                    {/* Left Sidebar - Filters */}
                    <div className="w-64 flex-shrink-0">
                        <div className="bg-white rounded-lg shadow-sm border p-6 sticky top-8">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
                                <button
                                    onClick={clearFilters}
                                    className="text-sm text-orange-600 hover:text-orange-700"
                                >
                                    Clear All
                                </button>
                            </div>

                            {/* Sort By */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                                <select
                                    value={filters.sortBy}
                                    onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value="newest">Newest First</option>
                                    <option value="oldest">Oldest First</option>
                                    <option value="price-low">Price: Low to High</option>
                                    <option value="price-high">Price: High to Low</option>
                                </select>
                            </div>

                            {/* Category */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                                <select
                                    value={filters.category}
                                    onChange={(e) => handleFilterChange('category', e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value="">All Categories</option>
                                    <option value="Climbing">Climbing 🧗</option>
                                    <option value="Skiing">Skiing ⛷️</option>
                                    <option value="Hiking">Hiking 🥾</option>
                                    <option value="Camping">Camping ⛺</option>
                                    <option value="Mountaineering">Mountaineering 🏔️</option>
                                    <option value="Snowboarding">Snowboarding 🏂</option>
                                    <option value="Cycling">Cycling 🚵</option>
                                    <option value="Water Sports">Water Sports 🚣</option>
                                    <option value="Apparel">Apparel 👕</option>
                                    <option value="Footwear">Footwear 👟</option>
                                </select>
                            </div>

                            {/* Gender */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                                <select
                                    value={filters.gender}
                                    onChange={(e) => handleFilterChange('gender', e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value="">All</option>
                                    <option value="Men">Men</option>
                                    <option value="Women">Women</option>
                                    <option value="Unisex">Unisex</option>
                                </select>
                            </div>

                            {/* Size */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Size</label>
                                <select
                                    value={filters.size}
                                    onChange={(e) => handleFilterChange('size', e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value="">All Sizes</option>
                                    <option value="XS">XS</option>
                                    <option value="S">S</option>
                                    <option value="M">M</option>
                                    <option value="L">L</option>
                                    <option value="XL">XL</option>
                                    <option value="XXL">XXL</option>
                                    <option value="6">6</option>
                                    <option value="7">7</option>
                                    <option value="8">8</option>
                                    <option value="9">9</option>
                                    <option value="10">10</option>
                                    <option value="11">11</option>
                                    <option value="12">12</option>
                                    <option value="13">13</option>
                                    <option value="One Size">One Size</option>
                                </select>
                            </div>

                            {/* Brand */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Brand</label>
                                <input
                                    type="text"
                                    value={filters.brand}
                                    onChange={(e) => handleFilterChange('brand', e.target.value)}
                                    placeholder="Search brands..."
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                            </div>

                            {/* Price Range */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Price Range</label>
                                <select
                                    value={filters.priceRange}
                                    onChange={(e) => handleFilterChange('priceRange', e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value="">Any Price</option>
                                    <option value="0-25">Under $25</option>
                                    <option value="25-50">$25 - $50</option>
                                    <option value="50-100">$50 - $100</option>
                                    <option value="100-200">$100 - $200</option>
                                    <option value="200-500">$200 - $500</option>
                                    <option value="500">$500+</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1">
                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Available Gear</h2>
                            <p className="text-gray-600">Quality mountain equipment from fellow outdoor enthusiasts</p>
                        </div>
                        
                        {loadingItems ? (
                            <div className="flex justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                            </div>
                        ) : (() => {
                            const filteredItems = getFilteredAndSortedItems();
                            return filteredItems.length === 0 ? (
                                <div className="text-center py-16 bg-white rounded-lg border-2 border-dashed border-gray-300">
                                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                                        {items.length === 0 ? 'No items available yet' : 'No items match your filters'}
                                    </h3>
                                    <p className="text-gray-500 mb-6">
                                        {items.length === 0 ? 'Be the first to list your mountain gear!' : 'Try adjusting your search criteria'}
                                    </p>
                                    {items.length === 0 ? (
                                        <button
                                            onClick={handleAddItem}
                                            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg transition-colors"
                                        >
                                            List Your First Item
                                        </button>
                                    ) : (
                                        <button
                                            onClick={clearFilters}
                                            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg transition-colors"
                                        >
                                            Clear Filters
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <div className="mb-4 text-sm text-gray-600">
                                        Showing {filteredItems.length} of {items.length} items
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {filteredItems.map((item) => (
                                            <ItemCard 
                                                key={item.id} 
                                                item={item} 
                                                isAdmin={isAdmin}
                                                onMarkAsSold={handleMarkAsSold}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <AddItemModal 
                isOpen={isModalOpen} 
                onClose={handleModalClose}
                user={user}
            />

            {isAdmin && (
                <>
                    <AdminModal 
                        isOpen={isAdminModalOpen} 
                        onClose={handleAdminModalClose}
                        user={user}
                    />
                    <ApprovedItemsModal 
                        isOpen={isApprovedModalOpen} 
                        onClose={handleApprovedModalClose}
                        user={user}
                    />
                </>
            )}

            <UserAnalyticsModal 
                isOpen={isAnalyticsModalOpen} 
                onClose={handleAnalyticsModalClose}
                user={user}
                isAdmin={isAdmin}
                refreshTrigger={refreshTrigger}
            />

            {isAdmin && (
                <SoldItemsModal 
                    isOpen={isSoldItemsModalOpen} 
                    onClose={handleSoldItemsModalClose}
                    user={user}
                    refreshTrigger={refreshTrigger}
                />
            )}
        </div>
    );
};

export default Home; 