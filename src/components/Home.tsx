import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem } from '../types';
import { logUserAction } from '../services/firebaseService';
import ItemCard from './ItemCard';
import AddItemModal from './AddItemModal';
import AdminModal from './AdminModal';
import ApprovedItemsModal from './ApprovedItemsModal';
import UserAnalyticsModal from './UserAnalyticsModal';
import ApplicationTestModal from './ApplicationTestModal';
import SoldItemsModal from './SoldItemsModal';
import LoginModal from './LoginModal';
import Dashboard from './Dashboard';
import ItemDetailModal from './ItemDetailModal';
import CartModal from './CartModal';
import BookmarksModal from './BookmarksModal';
import Checkout from './Checkout';
import Analytics from './Analytics';
import UserAnalytics from './UserAnalytics';
import InventoryDashboard from './InventoryDashboard';
import ActionsDashboard from './ActionsDashboard';
import TestResultsModal from './TestResultsModal';

const Home: React.FC = () => {
    const { user, loading, signInWithGoogle, signInWithPhone, logout, isAuthenticated, isAdmin: userIsAdmin, toggleAdmin } = useAuth();
    const { getCartItemCount, getBookmarkCount, switchUser } = useCart();
    const [items, setItems] = useState<ConsignmentItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [isApprovedModalOpen, setIsApprovedModalOpen] = useState(false);
    const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
    const [isApplicationTestModalOpen, setIsApplicationTestModalOpen] = useState(false);
    const [isSoldItemsModalOpen, setIsSoldItemsModalOpen] = useState(false);
    const [isDashboardOpen, setIsDashboardOpen] = useState(false);
    const [isTestResultsModalOpen, setIsTestResultsModalOpen] = useState(false);
    const [showAnalyticsPage, setShowAnalyticsPage] = useState(false);
    const [showInventoryPage, setShowInventoryPage] = useState(false);
    const [showActionsPage, setShowActionsPage] = useState(false);
    const [isCartModalOpen, setIsCartModalOpen] = useState(false);
    const [isBookmarksModalOpen, setIsBookmarksModalOpen] = useState(false);
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [showOrderSuccess, setShowOrderSuccess] = useState(false);
    const [loadingItems, setLoadingItems] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [alertsMenuOpen, setAlertsMenuOpen] = useState(false);
    const alertsMenuRef = useRef<HTMLDivElement>(null);
    const [recentItems, setRecentItems] = useState<ConsignmentItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<ConsignmentItem | null>(null);
    const [isItemDetailModalOpen, setIsItemDetailModalOpen] = useState(false);
    const [filters, setFilters] = useState({
        category: '',
        gender: '',
        size: '',
        brand: '',
        color: '',
        priceRange: '',
        sortBy: 'newest',
        searchQuery: ''
    });
    const [notificationCounts, setNotificationCounts] = useState({
        pending: 0,
        approved: 0,
        sold: 0
    });
    const [filtersOpen, setFiltersOpen] = useState(false); // For mobile filter collapse
    const filtersRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isAuthenticated) {
            fetchItems();
            checkAdminStatus();
        } else {
            setLoadingItems(false);
            setIsAdmin(false);
        }
    }, [isAuthenticated, userIsAdmin]);

    // Switch cart user when authentication state changes
    useEffect(() => {
        switchUser(user?.uid || null);
    }, [user, switchUser]);

    // Handle clicking outside menus
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setUserMenuOpen(false);
            }
            if (alertsMenuRef.current && !alertsMenuRef.current.contains(event.target as Node)) {
                setAlertsMenuOpen(false);
            }
            if (filtersRef.current && !filtersRef.current.contains(event.target as Node) && window.innerWidth < 1024) {
                setFiltersOpen(false);
            }
        };

        if (userMenuOpen || alertsMenuOpen || filtersOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [userMenuOpen, alertsMenuOpen, filtersOpen]);

    const checkAdminStatus = () => {
        if (!user) return;
        
        // Admin status is now purely controlled by the test admin toggle
        console.log('Admin status check:', { 
            userId: user.uid, 
            userIsAdmin,
            adminStatus: userIsAdmin 
        });
        setIsAdmin(userIsAdmin);
    };

    const fetchNotificationCounts = useCallback(async () => {
        if (!user) return;
        
        try {
            const itemsRef = collection(db, 'items');
            
            // Get pending items count
            const pendingQuery = query(itemsRef, where('status', '==', 'pending'));
            const pendingSnapshot = await getDocs(pendingQuery);
            
            // Get approved items count
            const approvedQuery = query(itemsRef, where('status', '==', 'approved'));
            const approvedSnapshot = await getDocs(approvedQuery);
            
            // Get all sold items and filter client-side for recent ones
            const soldQuery = query(itemsRef, where('status', '==', 'sold'));
            const soldSnapshot = await getDocs(soldQuery);
            
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            let recentSoldCount = 0;
            
            soldSnapshot.forEach((doc) => {
                const data = doc.data();
                const soldAt = data.soldAt?.toDate();
                if (soldAt && soldAt >= oneDayAgo) {
                    recentSoldCount++;
                }
            });
            
            const newCounts = {
                pending: pendingSnapshot.size,
                approved: approvedSnapshot.size,
                sold: recentSoldCount
            };
            
            console.log('Updating notification counts:', newCounts);
            setNotificationCounts(newCounts);
        } catch (error) {
            console.error('Error fetching notification counts:', error);
        }
    }, [user]);

    const fetchItems = async () => {
        try {
            const itemsRef = collection(db, 'items');
            const q = query(itemsRef, where('status', '==', 'live'));
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
            
            // Sort client-side by live date or creation date
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

    const fetchRecentItems = useCallback(async () => {
        if (!user) return;
        
        try {
            const itemsRef = collection(db, 'items');
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            let fetchedItems: ConsignmentItem[] = [];
            
            if (isAdmin) {
                // For admins: Get all items that have had activity in the last 24 hours
                // This includes newly created items, approved items, items that went live, and sold items
                
                // Get all items and filter for recent activity
                const q = query(itemsRef);
                const querySnapshot = await getDocs(q);
                
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    const item = { 
                        id: doc.id, 
                        ...data,
                        createdAt: data.createdAt?.toDate() || new Date(),
                        approvedAt: data.approvedAt?.toDate(),
                        liveAt: data.liveAt?.toDate(),
                        soldAt: data.soldAt?.toDate()
                    } as ConsignmentItem;
                    
                    // Check if item has any activity in the last 24 hours
                    const hasRecentActivity = 
                        (item.createdAt && item.createdAt >= twentyFourHoursAgo) ||
                        (item.approvedAt && item.approvedAt >= twentyFourHoursAgo) ||
                        (item.liveAt && item.liveAt >= twentyFourHoursAgo) ||
                        (item.soldAt && item.soldAt >= twentyFourHoursAgo);
                    
                    if (hasRecentActivity) {
                        fetchedItems.push(item);
                    }
                });
                
                // Sort by most recent activity
                fetchedItems.sort((a, b) => {
                    const aTime = Math.max(
                        a.createdAt?.getTime() || 0,
                        a.approvedAt?.getTime() || 0,
                        a.liveAt?.getTime() || 0,
                        a.soldAt?.getTime() || 0
                    );
                    const bTime = Math.max(
                        b.createdAt?.getTime() || 0,
                        b.approvedAt?.getTime() || 0,
                        b.liveAt?.getTime() || 0,
                        b.soldAt?.getTime() || 0
                    );
                    return bTime - aTime;
                });
                
            } else {
                // For regular users: Only get their own items that have had activity in the last 24 hours
                const q = query(itemsRef, where('sellerUid', '==', user.uid));
                const querySnapshot = await getDocs(q);
                
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    const item = { 
                        id: doc.id, 
                        ...data,
                        createdAt: data.createdAt?.toDate() || new Date(),
                        approvedAt: data.approvedAt?.toDate(),
                        liveAt: data.liveAt?.toDate(),
                        soldAt: data.soldAt?.toDate()
                    } as ConsignmentItem;
                    
                    // Check if the user's item has any activity in the last 24 hours
                    const hasRecentActivity = 
                        (item.createdAt && item.createdAt >= twentyFourHoursAgo) ||
                        (item.approvedAt && item.approvedAt >= twentyFourHoursAgo) ||
                        (item.liveAt && item.liveAt >= twentyFourHoursAgo) ||
                        (item.soldAt && item.soldAt >= twentyFourHoursAgo);
                    
                    if (hasRecentActivity) {
                        fetchedItems.push(item);
                    }
                });
                
                // Sort by most recent activity
                fetchedItems.sort((a, b) => {
                    const aTime = Math.max(
                        a.createdAt?.getTime() || 0,
                        a.approvedAt?.getTime() || 0,
                        a.liveAt?.getTime() || 0,
                        a.soldAt?.getTime() || 0
                    );
                    const bTime = Math.max(
                        b.createdAt?.getTime() || 0,
                        b.approvedAt?.getTime() || 0,
                        b.liveAt?.getTime() || 0,
                        b.soldAt?.getTime() || 0
                    );
                    return bTime - aTime;
                });
            }
            
            // Limit to 15 most recent items for better coverage
            const limitedItems = fetchedItems.slice(0, 15);
            console.log('Updating recent items:', limitedItems.length, 'items for', isAdmin ? 'admin' : 'user');
            setRecentItems(limitedItems);
        } catch (error) {
            console.error('Error fetching recent items:', error);
        }
    }, [user, isAdmin]);

    // Fetch recent items every 30 seconds
    useEffect(() => {
        if (isAuthenticated && user) {
            fetchRecentItems();
            const interval = setInterval(fetchRecentItems, 30000);
            return () => clearInterval(interval);
        }
    }, [isAuthenticated, user, fetchRecentItems]);

    useEffect(() => {
        if (isAdmin && user) {
            fetchNotificationCounts();
            // Set up interval to refresh counts every 30 seconds
            const interval = setInterval(fetchNotificationCounts, 30000);
            return () => clearInterval(interval);
        }
    }, [isAdmin, user, fetchNotificationCounts]);

    const handleAddItem = async () => {
        await logUserAction(user, 'modal_opened', 'Opened Add Item modal');
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        fetchItems();
        fetchRecentItems();
        if (isAdmin) fetchNotificationCounts();
    };

    const handleAdminModal = async () => {
        await logUserAction(user, 'modal_opened', 'Opened Admin modal');
        setIsAdminModalOpen(true);
    };

    const handleAdminModalClose = () => {
        setIsAdminModalOpen(false);
        fetchItems();
        fetchRecentItems();
        if (isAdmin) fetchNotificationCounts();
    };

    const handleApprovedModal = async () => {
        await logUserAction(user, 'modal_opened', 'Opened Approved Items modal');
        setIsApprovedModalOpen(true);
    };

    const handleApprovedModalClose = () => {
        setIsApprovedModalOpen(false);
        fetchItems();
        fetchRecentItems();
        if (isAdmin) fetchNotificationCounts();
    };

    const handleAnalyticsModal = () => {
        setIsAnalyticsModalOpen(true);
    };

    const handleAnalyticsModalClose = () => {
        setIsAnalyticsModalOpen(false);
        fetchItems();
    };

    const handleApplicationTestModal = () => {
        setIsApplicationTestModalOpen(true);
    };

    const handleApplicationTestModalClose = () => {
        setIsApplicationTestModalOpen(false);
    };

    const handleTestResultsModal = () => {
        setIsTestResultsModalOpen(true);
    };

    const handleTestResultsModalClose = () => {
        setIsTestResultsModalOpen(false);
    };

    const handleSoldItemsModal = () => {
        setIsSoldItemsModalOpen(true);
    };

    const handleSoldItemsModalClose = () => {
        setIsSoldItemsModalOpen(false);
        fetchItems();
    };

    const handleDashboard = () => {
        setIsDashboardOpen(true);
    };

    const handleDashboardClose = () => {
        setIsDashboardOpen(false);
    };

    const handleItemClick = async (item: ConsignmentItem) => {
        await logUserAction(user, 'item_viewed', 'Viewed item details', item.id, item.title);
        setSelectedItem(item);
        setIsItemDetailModalOpen(true);
        setAlertsMenuOpen(false);
    };

    const handleItemDetailModalClose = () => {
        setSelectedItem(null);
        setIsItemDetailModalOpen(false);
    };

    const handleCheckout = () => {
        setIsCheckoutOpen(true);
    };

    const handleCheckoutClose = () => {
        setIsCheckoutOpen(false);
    };

    const handleOrderSuccess = () => {
        setIsCheckoutOpen(false);
        setShowOrderSuccess(true);
        // Hide success message after 5 seconds
        setTimeout(() => {
            setShowOrderSuccess(false);
        }, 5000);
    };

    const getRecentActivity = (item: ConsignmentItem) => {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        // Check which activities happened in the last 24 hours, prioritizing most recent
        const activities = [];
        
        if (item.soldAt && item.soldAt >= twentyFourHoursAgo) {
            activities.push({ type: 'sold', time: item.soldAt, icon: '💰', message: 'Sold', color: 'text-green-600' });
        }
        if (item.liveAt && item.liveAt >= twentyFourHoursAgo) {
            activities.push({ type: 'live', time: item.liveAt, icon: '🟢', message: 'Went Live', color: 'text-green-600' });
        }
        if (item.approvedAt && item.approvedAt >= twentyFourHoursAgo) {
            activities.push({ type: 'approved', time: item.approvedAt, icon: '✅', message: 'Approved', color: 'text-blue-600' });
        }
        if (item.createdAt && item.createdAt >= twentyFourHoursAgo) {
            activities.push({ type: 'created', time: item.createdAt, icon: '📝', message: 'Listed', color: 'text-purple-600' });
        }
        
        // Return the most recent activity
        if (activities.length > 0) {
            activities.sort((a, b) => b.time.getTime() - a.time.getTime());
            return activities[0];
        }
        
        return null;
    };



    const handleFilterChange = (filterType: string, value: string) => {
        setFilters(prev => ({ ...prev, [filterType]: value }));
        // Auto-close mobile filters when a filter is selected (except for search as users might type continuously)
        if (filterType !== 'searchQuery' && window.innerWidth < 1024) {
            setFiltersOpen(false);
        }
    };

    const clearFilters = () => {
        setFilters({
            category: '',
            gender: '',
            size: '',
            brand: '',
            color: '',
            priceRange: '',
            sortBy: 'newest',
            searchQuery: ''
        });
    };

    const getFilteredAndSortedItems = () => {
        let filtered = [...items];

        // Apply search query filter
        if (filters.searchQuery) {
            const searchLower = filters.searchQuery.toLowerCase();
            filtered = filtered.filter(item => {
                return (
                    item.title?.toLowerCase().includes(searchLower) ||
                    item.description?.toLowerCase().includes(searchLower) ||
                    item.brand?.toLowerCase().includes(searchLower) ||
                    item.category?.toLowerCase().includes(searchLower) ||
                    item.color?.toLowerCase().includes(searchLower) ||
                    item.size?.toLowerCase().includes(searchLower) ||
                    item.condition?.toLowerCase().includes(searchLower) ||
                    item.gender?.toLowerCase().includes(searchLower) ||
                    item.sellerName?.toLowerCase().includes(searchLower)
                );
            });
        }

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
        if (filters.color) {
            filtered = filtered.filter(item => item.color?.toLowerCase().includes(filters.color.toLowerCase()));
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
            case 'popular':
                // For now, sort by a combination of recent activity and lower price (simulating popularity)
                // In the future, this could be based on views, likes, or actual sales data
                filtered.sort((a, b) => {
                    const aScore = (Date.now() - a.createdAt.getTime()) / (1000 * 60 * 60 * 24) + a.price / 100;
                    const bScore = (Date.now() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24) + b.price / 100;
                    return aScore - bScore;
                });
                break;
            case 'alphabetical':
                filtered.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'category':
                filtered.sort((a, b) => {
                    const aCat = a.category || '';
                    const bCat = b.category || '';
                    if (aCat === bCat) {
                        return a.title.localeCompare(b.title);
                    }
                    return aCat.localeCompare(bCat);
                });
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
                                onClick={() => setIsLoginModalOpen(true)}
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
                                    onClick={() => setIsLoginModalOpen(true)}
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
                                    onClick={() => setIsLoginModalOpen(true)}
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
                                onClick={() => setIsLoginModalOpen(true)}
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
                            onClick={() => setIsLoginModalOpen(true)}
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

                {/* LoginModal for unauthenticated users */}
                <LoginModal 
                    isOpen={isLoginModalOpen}
                    onClose={() => setIsLoginModalOpen(false)}
                    onGoogleLogin={async () => {
                        await signInWithGoogle();
                    }}
                    onPhoneLogin={async (phoneNumber: string) => {
                        await signInWithPhone(phoneNumber);
                    }}
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Main Store Content - Hidden when analytics page is shown */}
            {!showAnalyticsPage && !showInventoryPage && !showActionsPage && (
                <>
                    {/* Header */}
                    <div className="desktop-nav-header">
                        <div className="desktop-nav-container">
                            <div className="desktop-nav-content">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-9 7-6-2 1-14z" />
                                </svg>
                            </div>
                            <div>
                                        <h1 className="text-lg sm:text-xl font-bold text-gray-900">Summit Gear Exchange</h1>
                                <p className="text-xs text-gray-500">Mountain Consignment Store</p>
                            </div>
                        </div>
                        
                                <div className="desktop-nav-actions">
                                    <div className="desktop-nav-buttons">
                            <button
                                onClick={handleAddItem}
                                            className="desktop-button-primary"
                            >
                                            <span className="hidden sm:inline">List Item</span>
                                            <span className="sm:hidden">List</span>
                            </button>
                            
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={handleAdminModal}
                                                    className="desktop-button-secondary relative"
                                    >
                                                    <span className="hidden sm:inline">Pending Items</span>
                                                    <span className="sm:hidden">Pending</span>
                                        {notificationCounts.pending > 0 && (
                                                        <span className="absolute -top-2 -right-2 bg-yellow-500 text-white text-xs rounded-full desktop-badge flex items-center justify-center">
                                                {notificationCounts.pending > 9 ? '9+' : notificationCounts.pending}
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        onClick={handleApprovedModal}
                                                    className="desktop-button-secondary relative"
                                    >
                                                    <span className="hidden sm:inline">Approved Items</span>
                                                    <span className="sm:hidden">Approved</span>
                                        {notificationCounts.approved > 0 && (
                                                        <span className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs rounded-full desktop-badge flex items-center justify-center">
                                                {notificationCounts.approved > 9 ? '9+' : notificationCounts.approved}
                                            </span>
                                        )}
                                    </button>
                                </>
                            )}
                                    </div>
                            
                                    <div className="desktop-nav-icons">
                            {/* Bookmarks Icon - Only for non-admin users */}
                            {!isAdmin && (
                                <button
                                    onClick={() => setIsBookmarksModalOpen(true)}
                                                className="desktop-icon-button"
                                    title="Bookmarked Items"
                                >
                                                <svg className="w-5 h-5 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                    {getBookmarkCount() > 0 && (
                                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full desktop-badge flex items-center justify-center">
                                            {getBookmarkCount() > 9 ? '9+' : getBookmarkCount()}
                                        </span>
                                    )}
                                </button>
                            )}

                            {/* Cart Icon - Only for non-admin users */}
                            {!isAdmin && (
                                <button
                                    onClick={() => setIsCartModalOpen(true)}
                                                className="desktop-icon-button"
                                    title="Shopping Cart"
                                >
                                                <svg className="w-5 h-5 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l-1 7H6l-1-7z" />
                                    </svg>
                                    {getCartItemCount() > 0 && (
                                                    <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full desktop-badge flex items-center justify-center">
                                            {getCartItemCount() > 9 ? '9+' : getCartItemCount()}
                                        </span>
                                    )}
                                </button>
                            )}

                            {/* Alerts/Notifications Icon */}
                            <div ref={alertsMenuRef} className="relative">
                                <button
                                    onClick={() => setAlertsMenuOpen(!alertsMenuOpen)}
                                                className="desktop-icon-button"
                                >
                                                <svg className="w-5 h-5 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5-5V9a6 6 0 10-12 0v3l-5 5h5m7 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                    </svg>
                                    {recentItems.length > 0 && (
                                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full desktop-badge flex items-center justify-center">
                                            {recentItems.length > 9 ? '9+' : recentItems.length}
                                        </span>
                                    )}
                                </button>

                                {/* Alerts Dropdown */}
                                {alertsMenuOpen && (
                                                <div className="absolute right-0 top-full mt-2 w-80 sm:w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-[80vh] overflow-hidden">
                                        <div className="p-4 border-b border-gray-100">
                                            <h3 className="font-semibold text-gray-900">
                                                {isAdmin ? 'Platform Activity' : 'My Item Updates'}
                                            </h3>
                                            <p className="text-xs text-gray-500">
                                                {isAdmin 
                                                    ? 'All item activity in the last 24 hours' 
                                                    : 'Your items with recent activity'
                                                }
                                            </p>
                                        </div>
                                        
                                        <div className="max-h-72 overflow-y-auto">
                                            {recentItems.length === 0 ? (
                                                <div className="p-4 text-center text-gray-500">
                                                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5-5V9a6 6 0 10-12 0v3l-5 5h5m7 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                    </svg>
                                                    <p className="text-sm">
                                                        {isAdmin 
                                                            ? 'No platform activity in the last 24 hours' 
                                                            : 'No updates on your items recently'
                                                        }
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="divide-y divide-gray-100">
                                                    {recentItems.map((item) => {
                                                        const recentActivity = getRecentActivity(item);
                                                        return (
                                                            <button
                                                                key={item.id}
                                                                onClick={() => handleItemClick(item)}
                                                                className="w-full p-4 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:bg-gray-50"
                                                            >
                                                                <div className="flex items-start gap-3">
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
                                                                        <div className="flex items-start justify-between">
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                                                                                <p className="text-sm text-orange-600 font-semibold">${item.price}</p>
                                                                            </div>
                                                                            <span className={`ml-2 px-2 py-1 text-xs rounded-full flex-shrink-0 ${
                                                                                item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                                                item.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                                                                item.status === 'live' ? 'bg-green-100 text-green-800' :
                                                                                'bg-gray-100 text-gray-800'
                                                                            }`}>
                                                                                {item.status === 'pending' ? 'Pending' :
                                                                                 item.status === 'approved' ? 'Approved' :
                                                                                 item.status === 'live' ? 'Live' :
                                                                                 item.status}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center justify-between mt-1">
                                                                            <p className="text-xs text-gray-500">
                                                                                by {item.sellerName}
                                                                            </p>
                                                                            {recentActivity && (
                                                                                <div className={`flex items-center gap-1 text-xs ${recentActivity.color} font-medium`}>
                                                                                    <span>{recentActivity.icon}</span>
                                                                                    <span>{recentActivity.message}</span>
                                                                                    <span className="text-gray-400">
                                                                                        {recentActivity.time.toLocaleTimeString([], { 
                                                                                            hour: '2-digit', 
                                                                                            minute: '2-digit' 
                                                                                        })}
                                                                                    </span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        
                                        {recentItems.length > 0 && (
                                            <div className="p-3 border-t border-gray-100 bg-gray-50">
                                                <p className="text-xs text-gray-500 text-center">
                                                    {isAdmin 
                                                        ? 'Click on any item to view details and manage' 
                                                        : 'Click on your items to view status updates'
                                                    }
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                                        {/* User Menu */}
                                        <div ref={userMenuRef} className="desktop-nav-user-section">
                                <button
                                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                                                className="desktop-nav-user-button mobile-touch-target"
                                >
                                    {user?.photoURL && user.photoURL.startsWith('http') ? (
                                        <img 
                                            src={user.photoURL} 
                                            alt={user?.displayName || 'User'} 
                                                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover"
                                        />
                                    ) : (
                                                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-orange-500 flex items-center justify-center">
                                                        <svg className="w-3 h-3 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                        </div>
                                    )}
                                                <div className="text-xs sm:text-sm hidden sm:block">
                                        <div className="font-medium text-gray-700">{user?.displayName}</div>
                                        {isAdmin && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Admin</span>}
                                    </div>
                                                <svg className={`w-3 h-3 sm:w-4 sm:h-4 text-gray-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                            {/* Mobile Backdrop */}
                                {userMenuOpen && (
                                                <div className="mobile-backdrop" 
                                                     onClick={() => setUserMenuOpen(false)}
                                                     aria-hidden="true" />
                                            )}

                                            {/* User Dropdown Menu */}
                                            {userMenuOpen && (
                                                <div className="absolute right-0 top-full mt-2 mobile-user-menu">
                                                    <div className="p-4 sm:p-4 border-b border-gray-100">
                                                        <div className="flex items-center gap-3">
                                                            {user?.photoURL && user.photoURL.startsWith('http') ? (
                                                                <img 
                                                                    src={user.photoURL} 
                                                                    alt={user?.displayName || 'User'} 
                                                                    className="w-10 h-10 sm:w-8 sm:h-8 rounded-full object-cover flex-shrink-0"
                                                                />
                                                            ) : (
                                                                <div className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                                                                    <svg className="w-5 h-5 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                    </svg>
                                            </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-sm font-medium text-gray-900 truncate">{user?.displayName}</div>
                                                                <div className="text-xs text-gray-500 truncate">
                                                                    {user?.email || (user && 'phoneNumber' in user ? (user as any).phoneNumber : 'No contact info')}
                                                </div>
                                                                {isAdmin && (
                                                                    <span className="inline-block mt-1 text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">Admin</span>
                                                                )}
                                            </div>
                                                </div>
                                                    </div>
                                                    <div className="p-2 space-y-1">
                                                        {/* Dashboard Navigation */}
                                                        <div className="text-xs font-medium text-gray-700 mb-2 px-3">Dashboards</div>
                                                
                                                <button
                                                            onClick={() => {
                                                        setShowAnalyticsPage(true);
                                                        setShowInventoryPage(false);
                                                        setShowActionsPage(false);
                                                        setUserMenuOpen(false);
                                                    }}
                                                            className={`mobile-user-menu-item ${showAnalyticsPage ? 'mobile-user-menu-item-active' : 'mobile-user-menu-item-default'}`}
                                                >
                                                            📊 {isAdmin ? 'Analytics Dashboard' : 'My User History'}
                                                </button>

                                                {isAdmin && (
                                                    <>
                                                        <button
                                                                    onClick={() => {
                                                                setShowInventoryPage(true);
                                                                setShowAnalyticsPage(false);
                                                                setShowActionsPage(false);
                                                                setUserMenuOpen(false);
                                                            }}
                                                                    className={`mobile-user-menu-item ${showInventoryPage ? 'mobile-user-menu-item-active' : 'mobile-user-menu-item-default'}`}
                                                        >
                                                            📦 Inventory Dashboard
                                                        </button>
                                                        <button
                                                                    onClick={() => {
                                                                setShowActionsPage(true);
                                                                setShowAnalyticsPage(false);
                                                                setShowInventoryPage(false);
                                                                setUserMenuOpen(false);
                                                            }}
                                                                    className={`mobile-user-menu-item ${showActionsPage ? 'mobile-user-menu-item-active' : 'mobile-user-menu-item-default'}`}
                                                        >
                                                            🎯 Actions Dashboard
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                handleApplicationTestModal();
                                                                setUserMenuOpen(false);
                                                            }}
                                                            className="mobile-user-menu-item mobile-user-menu-item-default"
                                                        >
                                                            🧪 Application Test & Performance
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                handleTestResultsModal();
                                                                setUserMenuOpen(false);
                                                            }}
                                                            className="mobile-user-menu-item mobile-user-menu-item-default"
                                                        >
                                                            📊 Test Results Dashboard
                                                        </button>
                                                    </>
                                                )}
                                            
                                                        <div className="border-t border-gray-200 my-3 sm:my-2"></div>
                                                        
                                                        {/* Swap Admin Button */}
                                                        <button
                                                            onClick={() => {
                                                                toggleAdmin();
                                                                setUserMenuOpen(false);
                                                            }}
                                                            className="mobile-user-menu-item mobile-user-menu-item-default"
                                                        >
                                                            🔄 {isAdmin ? 'Exit Admin Mode' : 'Enter Admin Mode'}
                                                        </button>
                                                        
                                                <button
                                                    onClick={() => {
                                                        logout();
                                                        setUserMenuOpen(false);
                                                    }}
                                                            className="mobile-user-menu-item mobile-user-menu-item-danger"
                                                >
                                                    Sign Out
                                                </button>
                                        </div>
                                    </div>
                                )}
                                        </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content with Sidebar */}
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
                        <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
                    {/* Left Sidebar - Filters */}
                            <div ref={filtersRef} className="w-full lg:w-64 lg:flex-shrink-0">
                                {/* Mobile Filter Toggle Button */}
                                <button
                                    onClick={() => setFiltersOpen(!filtersOpen)}
                                    className="w-full lg:hidden mb-4 bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between text-left"
                                >
                                    <div className="flex items-center gap-2">
                                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707v4.586a1 1 0 01-1.414.924l-2-1A1 1 0 0110 17.414V13.414a1 1 0 00-.293-.707L3.293 6.293A1 1 0 013 5.586V4z" />
                                        </svg>
                                        <span className="font-medium text-gray-900">Filters & Search</span>
                                        {(filters.category || filters.gender || filters.size || filters.brand || filters.color || filters.priceRange || filters.searchQuery) && (
                                            <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">Active</span>
                                        )}
                                    </div>
                                    <svg className={`w-5 h-5 text-gray-400 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {/* Filter Panel */}
                                <div className={`bg-white rounded-lg shadow-sm border p-4 sm:p-6 lg:sticky lg:top-8 ${
                                    filtersOpen ? 'block' : 'hidden lg:block'
                                }`}>
                                    <div className="flex justify-between items-center mb-4 sm:mb-6">
                                        <h3 className="text-base sm:text-lg font-semibold text-gray-900">Filters</h3>
                                <button
                                    onClick={clearFilters}
                                    className="text-sm text-orange-600 hover:text-orange-700"
                                >
                                    Clear All
                                </button>
                            </div>

                            {/* Search */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                    <input
                                        type="text"
                                        value={filters.searchQuery}
                                        onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
                                        placeholder="Search items..."
                                        className="w-full pl-10 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    />
                                    {filters.searchQuery && (
                                        <button
                                            onClick={() => handleFilterChange('searchQuery', '')}
                                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                        >
                                            <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                {filters.searchQuery && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Searching in titles, descriptions, brands, and more
                                    </p>
                                )}
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

                            {/* Color */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                                <select
                                    value={filters.color}
                                    onChange={(e) => handleFilterChange('color', e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value="">All Colors</option>
                                    <option value="Black">Black</option>
                                    <option value="White">White</option>
                                    <option value="Gray">Gray</option>
                                    <option value="Red">Red</option>
                                    <option value="Blue">Blue</option>
                                    <option value="Green">Green</option>
                                    <option value="Yellow">Yellow</option>
                                    <option value="Orange">Orange</option>
                                    <option value="Purple">Purple</option>
                                    <option value="Pink">Pink</option>
                                    <option value="Brown">Brown</option>
                                    <option value="Navy">Navy</option>
                                    <option value="Burgundy">Burgundy</option>
                                    <option value="Olive">Olive</option>
                                    <option value="Tan">Tan</option>
                                    <option value="Multicolor">Multicolor</option>
                                </select>
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
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Available Gear</h2>
                                    <p className="text-gray-600">Quality mountain equipment from fellow outdoor enthusiasts</p>
                                </div>
                                
                                {/* Quick Search Bar */}
                                <div className="relative w-full sm:w-80">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                    <input
                                        type="text"
                                        value={filters.searchQuery}
                                        onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
                                        placeholder="Search gear..."
                                        className="w-full pl-10 pr-10 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white shadow-sm"
                                    />
                                    {filters.searchQuery && (
                                        <button
                                            onClick={() => handleFilterChange('searchQuery', '')}
                                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                        >
                                            <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Sorting Navigation Bar */}
                            <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6 p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                                        </svg>
                                        <span className="font-medium">Sort by:</span>
                                    </div>
                                    
                                    <div className="flex flex-wrap items-center gap-2">
                                        {[
                                            { 
                                                key: 'newest', 
                                                label: 'Newest', 
                                                desc: 'Recently added',
                                                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            },
                                            { 
                                                key: 'popular', 
                                                label: 'Popular', 
                                                desc: 'Trending items',
                                                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            },
                                            { 
                                                key: 'price-low', 
                                                label: 'Price ↗', 
                                                desc: 'Low to high',
                                                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" /></svg>
                                            },
                                            { 
                                                key: 'price-high', 
                                                label: 'Price ↘', 
                                                desc: 'High to low',
                                                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" /></svg>
                                            },
                                            { 
                                                key: 'alphabetical', 
                                                label: 'A-Z', 
                                                desc: 'Alphabetical',
                                                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" /></svg>
                                            },
                                            { 
                                                key: 'category', 
                                                label: 'Category', 
                                                desc: 'By type',
                                                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                            }
                                        ].map((sort) => (
                                            <button
                                                key={sort.key}
                                                onClick={() => handleFilterChange('sortBy', sort.key)}
                                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                                                    filters.sortBy === sort.key
                                                        ? 'bg-orange-500 text-white shadow-md transform scale-105'
                                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-sm'
                                                }`}
                                                title={sort.desc}
                                            >
                                                {sort.icon}
                                                {sort.label}
                                            </button>
                                        ))}
                                    </div>
                                    
                                    {/* Quick Stats */}
                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                            <span>{items.length} items</span>
                                        </div>
                                        {getFilteredAndSortedItems().length !== items.length && (
                                            <div className="flex items-center gap-1">
                                                <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                                                <span>{getFilteredAndSortedItems().length} filtered</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
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
                                        {items.length === 0 
                                            ? 'No items available yet' 
                                            : filters.searchQuery 
                                                ? `No results found for "${filters.searchQuery}"` 
                                                : 'No items match your filters'
                                        }
                                    </h3>
                                    <p className="text-gray-500 mb-6">
                                        {items.length === 0 
                                            ? 'Be the first to list your mountain gear!' 
                                            : filters.searchQuery
                                                ? 'Try different keywords or check your spelling'
                                                : 'Try adjusting your search criteria'
                                        }
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
                                    <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div className="text-sm text-gray-600">
                                            {filters.searchQuery ? (
                                                <span>
                                                    Found <span className="font-semibold">{filteredItems.length}</span> results 
                                                    {filteredItems.length !== items.length && (
                                                        <span> of {items.length} total items</span>
                                                    )}
                                                    {filters.searchQuery && (
                                                        <span> for "<span className="font-medium text-gray-900">{filters.searchQuery}</span>"</span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span>Showing {filteredItems.length} of {items.length} items</span>
                                            )}
                                        </div>
                                        {filters.searchQuery && (
                                            <button
                                                onClick={() => handleFilterChange('searchQuery', '')}
                                                className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                                Clear search
                                            </button>
                                        )}
                                    </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                                        {filteredItems.map((item) => (
                                            <ItemCard 
                                                key={item.id} 
                                                item={item} 
                                                isAdmin={isAdmin}
                                                onClick={handleItemClick}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
                </>
            )}

            {/* Analytics/Dashboard Pages */}
            {(showAnalyticsPage || showInventoryPage || showActionsPage) && (
                <div className="fixed inset-0 bg-white z-[60] overflow-auto">
                    <div className="min-h-screen">
                        {/* Use the same header structure as the main page */}
                        <div className="desktop-nav-header">
                            <div className="desktop-nav-container">
                                <div className="desktop-nav-content">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-9 7-6-2 1-14z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Summit Gear Exchange</h1>
                                            <p className="text-xs text-gray-500">Mountain Consignment Store</p>
                                        </div>
                                    </div>
                                    
                                    <div className="desktop-nav-actions">
                                        <div className="desktop-nav-buttons">
                                        <button
                                            onClick={() => {
                                                setShowAnalyticsPage(false);
                                                setShowInventoryPage(false);
                                                setShowActionsPage(false);
                                            }}
                                                className="bg-gray-500 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm sm:text-base flex-shrink-0"
                                        >
                                                <span className="hidden sm:inline">Back to Store</span>
                                                <span className="sm:hidden">Back</span>
                                        </button>
                                        </div>
                                        
                                        <div className="desktop-nav-icons">
                                        {/* Bookmarks Icon - Only for non-admin users */}
                                        {!isAdmin && (
                                            <button
                                                onClick={() => setIsBookmarksModalOpen(true)}
                                                    className="desktop-icon-button"
                                                title="Bookmarked Items"
                                            >
                                                    <svg className="w-5 h-5 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                                </svg>
                                                {getBookmarkCount() > 0 && (
                                                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full desktop-badge flex items-center justify-center">
                                                        {getBookmarkCount() > 9 ? '9+' : getBookmarkCount()}
                                                    </span>
                                                )}
                                            </button>
                                        )}

                                            {/* Cart Icon - Only for non-admin users */}
                                            {!isAdmin && (
                                                <button
                                                    onClick={() => setIsCartModalOpen(true)}
                                                    className="desktop-icon-button"
                                                    title="Shopping Cart"
                                                >
                                                    <svg className="w-5 h-5 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l-1 7H6l-1-7z" />
                                                    </svg>
                                                    {getCartItemCount() > 0 && (
                                                        <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full desktop-badge flex items-center justify-center">
                                                            {getCartItemCount() > 9 ? '9+' : getCartItemCount()}
                                                        </span>
                                                    )}
                                                </button>
                                            )}

                                            {/* Alerts/Notifications Icon */}
                                            <div ref={alertsMenuRef} className="relative">
                                                <button
                                                    onClick={() => setAlertsMenuOpen(!alertsMenuOpen)}
                                                    className="desktop-icon-button"
                                                >
                                                    <svg className="w-5 h-5 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5-5V9a6 6 0 10-12 0v3l-5 5h5m7 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                    </svg>
                                                    {recentItems.length > 0 && (
                                                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full desktop-badge flex items-center justify-center">
                                                            {recentItems.length > 9 ? '9+' : recentItems.length}
                                                        </span>
                                                    )}
                                                </button>

                                                {/* Alerts Dropdown */}
                                                {alertsMenuOpen && (
                                                    <div className="absolute right-0 top-full mt-2 w-80 sm:w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-[80vh] overflow-hidden">
                                                        <div className="p-4 border-b border-gray-100">
                                                            <h3 className="font-semibold text-gray-900">
                                                                {isAdmin ? 'Platform Activity' : 'My Item Updates'}
                                                            </h3>
                                                            <p className="text-xs text-gray-500">
                                                                {isAdmin 
                                                                    ? 'All item activity in the last 24 hours' 
                                                                    : 'Your items with recent activity'
                                                                }
                                                            </p>
                                                        </div>
                                                        
                                                        <div className="max-h-72 overflow-y-auto">
                                                            {recentItems.length === 0 ? (
                                                                <div className="p-4 text-center text-gray-500">
                                                                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5-5V9a6 6 0 10-12 0v3l-5 5h5m7 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                                    </svg>
                                                                    <p className="text-sm">
                                                                        {isAdmin 
                                                                            ? 'No platform activity in the last 24 hours' 
                                                                            : 'No updates on your items recently'
                                                                        }
                                                                    </p>
                                                                </div>
                                                            ) : (
                                                                <div className="divide-y divide-gray-100">
                                                                    {recentItems.map((item) => {
                                                                        const recentActivity = getRecentActivity(item);
                                                                        return (
                                                                            <button
                                                                                key={item.id}
                                                                                onClick={() => handleItemClick(item)}
                                                                                className="w-full p-4 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:bg-gray-50"
                                                                            >
                                                                                <div className="flex items-start gap-3">
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
                                                                                        <div className="flex items-start justify-between">
                                                                                            <div className="flex-1 min-w-0">
                                                                                                <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                                                                                                <p className="text-sm text-orange-600 font-semibold">${item.price}</p>
                                                                                            </div>
                                                                                            <span className={`ml-2 px-2 py-1 text-xs rounded-full flex-shrink-0 ${
                                                                                                item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                                                                item.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                                                                                item.status === 'live' ? 'bg-green-100 text-green-800' :
                                                                                                'bg-gray-100 text-gray-800'
                                                                                            }`}>
                                                                                                {item.status === 'pending' ? 'Pending' :
                                                                                                 item.status === 'approved' ? 'Approved' :
                                                                                                 item.status === 'live' ? 'Live' :
                                                                                                 item.status}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="flex items-center justify-between mt-1">
                                                                                            <p className="text-xs text-gray-500">
                                                                                                by {item.sellerName}
                                                                                            </p>
                                                                                            {recentActivity && (
                                                                                                <div className={`flex items-center gap-1 text-xs ${recentActivity.color} font-medium`}>
                                                                                                    <span>{recentActivity.icon}</span>
                                                                                                    <span>{recentActivity.message}</span>
                                                                                                    <span className="text-gray-400">
                                                                                                        {recentActivity.time.toLocaleTimeString([], { 
                                                                                                            hour: '2-digit', 
                                                                                                            minute: '2-digit' 
                                                                                                        })}
                                                                                                    </span>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                        
                                                        {recentItems.length > 0 && (
                                                            <div className="p-3 border-t border-gray-100 bg-gray-50">
                                                                <p className="text-xs text-gray-500 text-center">
                                                                    {isAdmin 
                                                                        ? 'Click on any item to view details and manage' 
                                                                        : 'Click on your items to view status updates'
                                                                    }
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                        {/* User Menu */}
                                            <div ref={userMenuRef} className="relative flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4 border-l border-gray-200 flex-shrink-0">
                                            <button
                                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                                    className="flex items-center gap-2 sm:gap-3 hover:bg-gray-50 active:bg-gray-100 rounded-lg p-2 sm:p-2 transition-colors touch-manipulation
                                                    /* Ensure minimum touch target size on mobile */
                                                    min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0"
                                            >
                                                {user?.photoURL && user.photoURL.startsWith('http') ? (
                                                    <img 
                                                        src={user.photoURL} 
                                                        alt={user?.displayName || 'User'} 
                                                            className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover"
                                                    />
                                                ) : (
                                                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-orange-500 flex items-center justify-center">
                                                            <svg className="w-3 h-3 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                        </svg>
                                                    </div>
                                                )}
                                                    <div className="text-xs sm:text-sm hidden sm:block">
                                                    <div className="font-medium text-gray-700">{user?.displayName}</div>
                                                    {isAdmin && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Admin</span>}
                                                </div>
                                                    <svg className={`w-3 h-3 sm:w-4 sm:h-4 text-gray-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>

                                                {/* Mobile Backdrop */}
                                                {userMenuOpen && (
                                                    <div className="fixed inset-0 z-40 bg-black bg-opacity-25 sm:hidden" 
                                                         onClick={() => setUserMenuOpen(false)}
                                                         aria-hidden="true" />
                                                )}

                                            {/* User Dropdown Menu */}
                                            {userMenuOpen && (
                                                    <div className="absolute right-0 top-full mt-2 w-80 sm:w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-[80vh] overflow-y-auto max-w-[calc(100vw-2rem)] overflow-x-hidden shadow-xl sm:shadow-lg transform transition-all duration-200 ease-out opacity-100 scale-100 translate-y-0">
                                                        <div className="p-4 sm:p-4 border-b border-gray-100">
                                                            <div className="flex items-center gap-3">
                                                                {user?.photoURL && user.photoURL.startsWith('http') ? (
                                                                    <img 
                                                                        src={user.photoURL} 
                                                                        alt={user?.displayName || 'User'} 
                                                                        className="w-10 h-10 sm:w-8 sm:h-8 rounded-full object-cover flex-shrink-0"
                                                                    />
                                                                ) : (
                                                                    <div className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                                                                        <svg className="w-5 h-5 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                        </svg>
                                                                    </div>
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-sm font-medium text-gray-900 truncate">{user?.displayName}</div>
                                                                    <div className="text-xs text-gray-500 truncate">
                                                            {user?.email || (user && 'phoneNumber' in user ? (user as any).phoneNumber : 'No contact info')}
                                                                    </div>
                                                                    {isAdmin && (
                                                                        <span className="inline-block mt-1 text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">Admin</span>
                                                                    )}
                                                                </div>
                                                        </div>
                                                    </div>
                                                    <div className="p-2 space-y-1">
                                                        {/* Dashboard Navigation */}
                                                        <div className="text-xs font-medium text-gray-700 mb-2 px-3">Dashboards</div>
                                                        
                                                        <button
                                                            onClick={() => {
                                                                setShowAnalyticsPage(true);
                                                                setShowInventoryPage(false);
                                                                setShowActionsPage(false);
                                                                setUserMenuOpen(false);
                                                            }}
                                                                className={`w-full text-left px-3 py-3 sm:py-2 text-sm rounded-lg transition-colors touch-manipulation ${showAnalyticsPage ? 'bg-orange-50 text-orange-700' : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'}`}
                                                        >
                                                            📊 {isAdmin ? 'Analytics Dashboard' : 'My User History'}
                                                        </button>

                                                        {isAdmin && (
                                                            <>
                                                                <button
                                                                    onClick={() => {
                                                                        setShowInventoryPage(true);
                                                                        setShowAnalyticsPage(false);
                                                                        setShowActionsPage(false);
                                                                        setUserMenuOpen(false);
                                                                    }}
                                                                        className={`w-full text-left px-3 py-3 sm:py-2 text-sm rounded-lg transition-colors touch-manipulation ${showInventoryPage ? 'bg-orange-50 text-orange-700' : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'}`}
                                                                >
                                                                    📦 Inventory Dashboard
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setShowActionsPage(true);
                                                                        setShowAnalyticsPage(false);
                                                                        setShowInventoryPage(false);
                                                                        setUserMenuOpen(false);
                                                                    }}
                                                                        className={`w-full text-left px-3 py-3 sm:py-2 text-sm rounded-lg transition-colors touch-manipulation ${showActionsPage ? 'bg-orange-50 text-orange-700' : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'}`}
                                                                >
                                                                    🎯 Actions Dashboard
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        handleApplicationTestModal();
                                                                        setUserMenuOpen(false);
                                                                    }}
                                                                    className="w-full text-left px-3 py-3 sm:py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                                                                >
                                                                    🧪 Application Test & Performance
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        handleTestResultsModal();
                                                                        setUserMenuOpen(false);
                                                                    }}
                                                                    className="w-full text-left px-3 py-3 sm:py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                                                                >
                                                                    📊 Test Results Dashboard
                                                                </button>
                                                            </>
                                                        )}
                                                        
                                                            <div className="border-t border-gray-200 my-3 sm:my-2"></div>
                                                        
                                                        {/* Swap Admin Button */}
                                                        <button
                                                            onClick={() => {
                                                                toggleAdmin();
                                                                setUserMenuOpen(false);
                                                            }}
                                                            className="w-full text-left px-3 py-3 sm:py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                                                        >
                                                            🔄 {isAdmin ? 'Exit Admin Mode' : 'Enter Admin Mode'}
                                                        </button>
                                                        
                                                        <button
                                                            onClick={() => {
                                                                logout();
                                                                setUserMenuOpen(false);
                                                            }}
                                                                className="w-full text-left px-3 py-3 sm:py-2 text-sm text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors touch-manipulation"
                                                        >
                                                            Sign Out
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                            {showInventoryPage ? (
                                <InventoryDashboard user={user} isAdmin={isAdmin} />
                            ) : showActionsPage ? (
                                <ActionsDashboard user={user} isAdmin={isAdmin} />
                            ) : isAdmin ? (
                                <Analytics user={user} isAdmin={isAdmin} />
                            ) : (
                                <UserAnalytics user={user} />
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                    <ApplicationTestModal 
                        isOpen={isApplicationTestModalOpen} 
                        onClose={handleApplicationTestModalClose}
                    />
                    <TestResultsModal 
                        isOpen={isTestResultsModalOpen} 
                        onClose={handleTestResultsModalClose}
                    />
                </>
            )}

            <LoginModal 
                isOpen={isLoginModalOpen}
                onClose={() => setIsLoginModalOpen(false)}
                onGoogleLogin={async () => { await signInWithGoogle(); }}
                onPhoneLogin={async (phoneNumber: string) => { await signInWithPhone(phoneNumber); }}
            />

            <ItemDetailModal 
                isOpen={isItemDetailModalOpen}
                onClose={handleItemDetailModalClose}
                item={selectedItem}
                onItemUpdated={() => {
                    fetchItems();
                    fetchRecentItems();
                    fetchNotificationCounts();
                }}
            />

            <CartModal 
                isOpen={isCartModalOpen}
                onClose={() => setIsCartModalOpen(false)}
                onCheckout={handleCheckout}
            />

            <BookmarksModal 
                isOpen={isBookmarksModalOpen}
                onClose={() => setIsBookmarksModalOpen(false)}
                items={items}
                onItemClick={handleItemClick}
            />

            <Checkout 
                isOpen={isCheckoutOpen}
                onClose={handleCheckoutClose}
                onSuccess={handleOrderSuccess}
            />

            {/* Order Success Toast */}
            {showOrderSuccess && (
                <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                        <h3 className="font-semibold">Order Successful!</h3>
                        <p className="text-sm opacity-90">Thank you for your purchase. You'll receive a confirmation email soon.</p>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Home; 