import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, deleteDoc, getDoc, addDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, UserAnalytics, PaymentRecord, User, StoreCreditTransaction, AuthUser } from '../types';
import { subscribeToActionLogs, ActionLog } from '../services/firebaseService';

interface UserAnalyticsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AuthUser | null;
    isAdmin?: boolean;
    refreshTrigger?: number;
}

type SortField = 'totalItemsSold' | 'totalEarnings' | 'outstandingBalance' | 'storeCredit';

const UserAnalyticsModal: React.FC<UserAnalyticsModalProps> = ({ isOpen, onClose, user, isAdmin = false, refreshTrigger = 0 }) => {
    const [loading, setLoading] = useState(false);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [userAnalytics, setUserAnalytics] = useState<UserAnalytics[]>([]);
    const [currentUserAnalytics, setCurrentUserAnalytics] = useState<UserAnalytics | null>(null);
    const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [editingItem, setEditingItem] = useState<ConsignmentItem | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showCashPaymentModal, setShowCashPaymentModal] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentNotes, setPaymentNotes] = useState('');
    const [showUserRedeemModal, setShowUserRedeemModal] = useState(false);
    const [redeemAmount, setRedeemAmount] = useState('');
    const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [showSoldModal, setShowSoldModal] = useState(false);
    const [itemToMarkSold, setItemToMarkSold] = useState<ConsignmentItem | null>(null);
    const [soldPrice, setSoldPrice] = useState('');
    const [sortField, setSortField] = useState<SortField>('totalEarnings');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [userActions, setUserActions] = useState<ActionLog[]>([]);
    const [showUserDetail, setShowUserDetail] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUserAnalytics, setSelectedUserAnalytics] = useState<UserAnalytics | null>(null);

    useEffect(() => {
        console.log('UserAnalyticsModal useEffect triggered:', { 
            isOpen, 
            isAdmin, 
            refreshTrigger, 
            userId: user?.uid 
        });
        if (isOpen) {
            if (isAdmin) {
                console.log('Fetching ALL user analytics (admin mode)');
                fetchAllUserAnalytics();
            } else if (user) {
                console.log('Fetching single user analytics (user mode):', user.uid);
                fetchUserAnalytics(user.uid);
            }
        }
    }, [isOpen, isAdmin, user, refreshTrigger]);

    // Fetch payment history when a user is selected
    useEffect(() => {
        if (selectedUser && isAdmin) {
            fetchPaymentHistory(selectedUser);
        }
    }, [selectedUser, isAdmin]);

    const fetchAllUserAnalytics = async () => {
        setLoading(true);
        try {
            console.log('Fetching all user analytics...');
            
            const allUsers: User[] = [];
            const userMap = new Map<string, UserAnalytics>();

            // First, get all items to find users who have listed items
            const itemsRef = collection(db, 'items');
            const itemsSnapshot = await getDocs(itemsRef);
            console.log('Found', itemsSnapshot.size, 'items');

            itemsSnapshot.forEach((doc) => {
                const item = { 
                    id: doc.id, 
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate() || new Date(),
                    approvedAt: doc.data().approvedAt?.toDate(),
                    liveAt: doc.data().liveAt?.toDate(),
                    soldAt: doc.data().soldAt?.toDate()
                } as ConsignmentItem;
                const userId = item.sellerId;
                
                // Create user analytics if not exists
                if (!userMap.has(userId)) {
                    const user: User = {
                        uid: userId,
                        email: item.sellerEmail,
                        displayName: item.sellerName,
                        photoURL: ''
                    };
                    allUsers.push(user);

                    userMap.set(userId, {
                        userId,
                        userName: item.sellerName,
                        userEmail: item.sellerEmail,
                        totalItemsListed: 0,
                        totalItemsSold: 0,
                        totalEarnings: 0,
                        totalPaid: 0,
                        outstandingBalance: 0,
                        storeCredit: 0,
                        activeItems: [],
                        soldItems: [],
                        pendingItems: [],
                        approvedItems: []
                    });
                }

                const analytics = userMap.get(userId)!;
                analytics.totalItemsListed++;

                switch (item.status) {
                    case 'pending':
                        analytics.pendingItems.push(item);
                        break;
                    case 'approved':
                        analytics.approvedItems.push(item);
                        break;
                    case 'live':
                        analytics.activeItems.push(item);
                        break;
                    case 'sold':
                        analytics.soldItems.push(item);
                        analytics.totalItemsSold++;
                        // User gets 75% of the sold price
                        const soldPrice = item.soldPrice || item.price;
                        const userEarnings = item.userEarnings || (soldPrice * 0.75);
                        analytics.totalEarnings += userEarnings;
                        break;
                    case 'archived':
                        // Initialize archivedItems array if it doesn't exist
                        if (!analytics.archivedItems) {
                            analytics.archivedItems = [];
                        }
                        analytics.archivedItems.push(item);
                        break;
                }
            });

            // Try to get additional users from the users collection (if it exists)
            try {
                const usersRef = collection(db, 'users');
                const usersSnapshot = await getDocs(usersRef);
                console.log('Found', usersSnapshot.size, 'users in users collection');
                
                usersSnapshot.forEach((doc) => {
                    const userData = doc.data();
                    const userId = doc.id;
                    
                    // If we don't already have this user, add them
                    if (!userMap.has(userId)) {
                        const user: User = {
                            uid: userId,
                            email: userData.email || '',
                            displayName: userData.displayName || userData.name || 'Unknown User',
                            photoURL: userData.photoURL || ''
                        };
                        allUsers.push(user);

                        userMap.set(userId, {
                            userId,
                            userName: user.displayName,
                            userEmail: user.email || userData.phoneNumber || '',
                            totalItemsListed: 0,
                            totalItemsSold: 0,
                            totalEarnings: 0,
                            totalPaid: 0,
                            outstandingBalance: 0,
                            storeCredit: Math.random() * 100, // Simulate store credit for demo
                            activeItems: [],
                            soldItems: [],
                            pendingItems: [],
                            approvedItems: []
                        });
                    }
                });
            } catch (error) {
                console.warn('Users collection not found, using only item sellers');
            }

            // Get payment records to calculate outstanding balances
            try {
                const paymentsRef = collection(db, 'payments');
                const paymentsSnapshot = await getDocs(paymentsRef);
                
                paymentsSnapshot.forEach((doc) => {
                    const payment = doc.data() as PaymentRecord;
                    const analytics = userMap.get(payment.userId);
                    if (analytics) {
                        analytics.totalPaid += payment.amount;
                    }
                });
            } catch (error) {
                console.warn('Error fetching payments:', error);
            }

            // Calculate outstanding balances
            userMap.forEach((analytics) => {
                analytics.outstandingBalance = Math.max(0, analytics.totalEarnings - analytics.totalPaid);
            });

            const analyticsArray = Array.from(userMap.values());
            console.log('Final user analytics:', analyticsArray);
            
            setUserAnalytics(analyticsArray);
            setAllUsers(allUsers);
        } catch (error) {
            console.error('Error fetching user analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchUserAnalytics = async (userId: string) => {
        setLoading(true);
        try {
            console.log('Fetching analytics for user:', userId);
            
            // Get all items for this user
            const itemsRef = collection(db, 'items');
            const q = query(itemsRef, where('sellerId', '==', userId));
            const querySnapshot = await getDocs(q);
            
            const userAnalytics: UserAnalytics = {
                userId,
                userName: user?.displayName || 'User',
                userEmail: user?.email || '',
                totalItemsListed: 0,
                totalItemsSold: 0,
                totalEarnings: 0,
                totalPaid: 0,
                outstandingBalance: 0,
                storeCredit: 0,
                activeItems: [],
                soldItems: [],
                pendingItems: [],
                approvedItems: []
            };

            querySnapshot.forEach((doc) => {
                const item = {
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate() || new Date(),
                    approvedAt: doc.data().approvedAt?.toDate(),
                    liveAt: doc.data().liveAt?.toDate(),
                    soldAt: doc.data().soldAt?.toDate()
                } as ConsignmentItem;

                userAnalytics.totalItemsListed++;

                switch (item.status) {
                    case 'pending':
                        userAnalytics.pendingItems.push(item);
                        break;
                    case 'approved':
                        userAnalytics.approvedItems.push(item);
                        break;
                    case 'live':
                        userAnalytics.activeItems.push(item);
                        break;
                    case 'sold':
                        userAnalytics.soldItems.push(item);
                        userAnalytics.totalItemsSold++;
                        const soldPrice = item.soldPrice || item.price;
                        const userEarnings = item.userEarnings || (soldPrice * 0.75);
                        userAnalytics.totalEarnings += userEarnings;
                        break;
                }
            });

            // Get payment records for this user
            try {
                const paymentsRef = collection(db, 'payments');
                const paymentsQuery = query(paymentsRef, where('userId', '==', userId));
                const paymentsSnapshot = await getDocs(paymentsQuery);
                
                paymentsSnapshot.forEach((doc) => {
                    const payment = doc.data() as PaymentRecord;
                    userAnalytics.totalPaid += payment.amount;
                });
            } catch (error) {
                console.warn('Error fetching user payments:', error);
            }

            userAnalytics.outstandingBalance = Math.max(0, userAnalytics.totalEarnings - userAnalytics.totalPaid);
            
            console.log('User analytics calculated:', userAnalytics);
            setCurrentUserAnalytics(userAnalytics);
        } catch (error) {
            console.error('Error fetching user analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPaymentHistory = async (userId: string) => {
        try {
            const paymentsRef = collection(db, 'payments');
            const q = query(paymentsRef, where('userId', '==', userId), orderBy('paidAt', 'desc'));
            const querySnapshot = await getDocs(q);
            
            const payments: PaymentRecord[] = [];
            querySnapshot.forEach((doc) => {
                payments.push({
                    id: doc.id,
                    ...doc.data(),
                    paidAt: doc.data().paidAt?.toDate() || new Date()
                } as PaymentRecord);
            });
            
            setPaymentHistory(payments);
        } catch (error) {
            console.error('Error fetching payment history:', error);
            setPaymentHistory([]);
        }
    };

    const handleEditItem = (item: ConsignmentItem) => {
        setEditingItem(item);
    };

    const handleSaveItem = async () => {
        if (!editingItem || !editingItem.id) return;
        
        try {
            const itemRef = doc(db, 'items', editingItem.id);
            await updateDoc(itemRef, {
                title: editingItem.title,
                description: editingItem.description,
                price: editingItem.price
            });
            
            // Refresh the analytics
            if (isAdmin) {
                fetchAllUserAnalytics();
            } else if (user) {
                fetchUserAnalytics(user.uid);
            }
            
            setEditingItem(null);
        } catch (error) {
            console.error('Error updating item:', error);
        }
    };

    const handleDeleteItem = (itemId: string) => {
        setItemToDelete(itemId);
        setShowDeleteModal(true);
    };

    const confirmDeleteItem = async () => {
        if (!itemToDelete) return;
        
        try {
            const itemRef = doc(db, 'items', itemToDelete);
            await updateDoc(itemRef, {
                status: 'archived',
                archivedAt: new Date()
            });
            
            // Refresh the analytics
            if (isAdmin) {
                fetchAllUserAnalytics();
            } else if (user) {
                fetchUserAnalytics(user.uid);
            }
            
            setShowDeleteModal(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Error archiving item:', error);
        }
    };

    const cancelDeleteItem = () => {
        setShowDeleteModal(false);
        setItemToDelete(null);
    };

    const handleMarkAsSold = (item: ConsignmentItem) => {
        setItemToMarkSold(item);
        setSoldPrice(item.price.toString());
        setShowSoldModal(true);
    };

    const confirmMarkAsSold = async () => {
        if (!itemToMarkSold || !soldPrice || parseFloat(soldPrice) <= 0) return;
        
        try {
            const finalPrice = parseFloat(soldPrice);
            const adminEarnings = finalPrice * 0.25;
            const userEarnings = finalPrice * 0.75;
            
            const itemRef = doc(db, 'items', itemToMarkSold.id);
            await updateDoc(itemRef, {
                status: 'sold',
                soldPrice: finalPrice,
                soldAt: new Date(),
                adminEarnings,
                userEarnings,
                saleType: 'in-store'
            });
            
            // Refresh the analytics
            if (isAdmin) {
                fetchAllUserAnalytics();
            } else if (user) {
                fetchUserAnalytics(user.uid);
            }
            
            setShowSoldModal(false);
            setItemToMarkSold(null);
            setSoldPrice('');
        } catch (error) {
            console.error('Error marking item as sold:', error);
        }
    };

    const cancelMarkAsSold = () => {
        setShowSoldModal(false);
        setItemToMarkSold(null);
        setSoldPrice('');
    };

    const handleCashPayment = async () => {
        if (!selectedUser || !paymentAmount || parseFloat(paymentAmount) <= 0) return;
        
        setLoading(true);
        try {
            const amount = parseFloat(paymentAmount);
            
            // Create payment record
            const userData = userAnalytics.find(u => u.userId === selectedUser);
            const paymentData: Omit<PaymentRecord, 'id'> = {
                userId: selectedUser,
                userName: userData?.userName || 'Unknown User',
                userEmail: userData?.userEmail || '',
                amount,
                type: 'cash',
                itemsSold: [],
                paidAt: new Date(),
                notes: paymentNotes || `Cash payment of $${amount.toFixed(2)}`
            };
            
            await addDoc(collection(db, 'payments'), paymentData);
            
            // Refresh analytics and payment history
            await fetchAllUserAnalytics();
            await fetchPaymentHistory(selectedUser);
            
            // Reset form
            setPaymentAmount('');
            setPaymentNotes('');
            setShowCashPaymentModal(false);
        } catch (error) {
            console.error('Error recording cash payment:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUserRedeemStoreCredit = async () => {
        if (!user || !redeemAmount || parseFloat(redeemAmount) <= 0) return;
        
        setLoading(true);
        try {
            const amount = parseFloat(redeemAmount);
            
            // Create store credit transaction
            const creditTransaction: Omit<StoreCreditTransaction, 'id'> = {
                userId: user.uid,
                userName: user.displayName || 'User',
                userEmail: user.email || '',
                amount,
                type: 'earned',
                description: 'Redeemed from earnings',
                createdAt: new Date()
            };
            
            await addDoc(collection(db, 'store_credit_transactions'), creditTransaction);
            
            // Update user's store credit balance
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                const currentCredit = userDoc.data().storeCredit || 0;
                await updateDoc(userRef, {
                    storeCredit: currentCredit + amount
                });
            } else {
                await setDoc(userRef, {
                    storeCredit: amount,
                    email: user.email,
                    displayName: user.displayName
                });
            }
            
            // Create payment record to reduce outstanding balance
            const paymentData: Omit<PaymentRecord, 'id'> = {
                userId: user.uid,
                userName: user.displayName || 'User',
                userEmail: user.email || '',
                amount,
                type: 'store_credit',
                itemsSold: [],
                paidAt: new Date(),
                notes: 'Converted to store credit'
            };
            
            await addDoc(collection(db, 'payments'), paymentData);
            
            // Refresh analytics
            await fetchUserAnalytics(user.uid);
            
            // Reset form
            setRedeemAmount('');
            setShowUserRedeemModal(false);
        } catch (error) {
            console.error('Error redeeming store credit:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const handleUserClick = async (userAnalytic: UserAnalytics) => {
        setSelectedUserAnalytics(userAnalytic);
        setShowUserDetail(true);
        
        // Fetch user's action history
        try {
            const unsubscribe = subscribeToActionLogs((logs) => {
                const userLogs = logs
                    .filter(log => log.userId === userAnalytic.userId)
                    .map(log => ({
                        ...log,
                        timestamp: log.timestamp?.toDate ? log.timestamp.toDate() : new Date()
                    }))
                    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                
                setUserActions(userLogs);
            });
            
            // Store unsubscribe function for cleanup
            (window as any).userActionsUnsubscribe = unsubscribe;
        } catch (error) {
            console.error('Error fetching user actions:', error);
        }
    };

    const filteredAndSortedUsers = userAnalytics
        .filter(user => 
            user.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.userEmail.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => {
            const aValue = a[sortField];
            const bValue = b[sortField];
            const multiplier = sortDirection === 'asc' ? 1 : -1;
            return (aValue - bValue) * multiplier;
        });

    const getSortIcon = (field: SortField) => {
        if (sortField !== field) return '↕️';
        return sortDirection === 'asc' ? '↑' : '↓';
    };

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'item_listed': return '📝';
            case 'item_approved': return '✅';
            case 'item_purchased': return '🛒';
            case 'item_sold': return '💰';
            case 'item_archived': return '📦';
            case 'user_login': return '🔐';
            case 'user_logout': return '🚪';
            case 'item_bookmarked': return '❤️';
            case 'cart_updated': return '🛍️';
            default: return '📊';
        }
    };

    const formatTimeAgo = (timestamp: Date) => {
        const now = new Date();
        const diffTime = now.getTime() - timestamp.getTime();
        const diffMinutes = Math.floor(diffTime / (1000 * 60));
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffMinutes < 1) return 'Just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

    const calculateSuccessRate = (analytics: UserAnalytics) => {
        if (analytics.totalItemsListed === 0) return 0;
        return (analytics.totalItemsSold / analytics.totalItemsListed) * 100;
    };

    const getLastActivity = (analytics: UserAnalytics) => {
        const allItems = [
            ...analytics.activeItems,
            ...analytics.soldItems,
            ...analytics.approvedItems,
            ...analytics.pendingItems
        ];
        
        if (allItems.length === 0) return new Date(0);
        
        return allItems.reduce((latest, item) => {
            const itemDate = item.createdAt || new Date(0);
            return itemDate > latest ? itemDate : latest;
        }, new Date(0));
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden">
                    <div className="sticky top-0 bg-white p-6 border-b border-gray-200">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-800">User Analytics Dashboard</h2>
                                <p className="text-gray-600 mt-1">Comprehensive user performance and statistics</p>
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

                    <div className="p-6 overflow-y-auto max-h-[calc(95vh-200px)]">
                        {/* Search and Summary */}
                        <div className="mb-6 space-y-4">
                            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                                <div className="flex-1 max-w-md">
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search users by name or email..."
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                                <div className="text-sm text-gray-600">
                                    Showing {filteredAndSortedUsers.length} of {userAnalytics.length} users
                                </div>
                            </div>

                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="text-2xl font-bold text-gray-900">
                                        {userAnalytics.reduce((sum, user) => sum + user.totalItemsListed, 0)}
                                    </div>
                                    <div className="text-sm text-gray-600">Total Items Listed</div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="text-2xl font-bold text-gray-900">
                                        {userAnalytics.reduce((sum, user) => sum + user.totalItemsSold, 0)}
                                    </div>
                                    <div className="text-sm text-gray-600">Total Items Sold</div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="text-2xl font-bold text-gray-900">
                                        ${userAnalytics.reduce((sum, user) => sum + user.totalEarnings, 0).toFixed(2)}
                                    </div>
                                    <div className="text-sm text-gray-600">Total User Earnings</div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="text-2xl font-bold text-gray-900">
                                        ${userAnalytics.reduce((sum, user) => sum + user.storeCredit, 0).toFixed(2)}
                                    </div>
                                    <div className="text-sm text-gray-600">Total Store Credit</div>
                                </div>
                            </div>
                        </div>

                        {/* Users Table */}
                        {loading ? (
                            <div className="flex justify-center items-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                                <span className="ml-3 text-gray-600">Loading user statistics...</span>
                            </div>
                        ) : (
                            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    User
                                                </th>
                                                <th 
                                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                    onClick={() => handleSort('totalItemsSold')}
                                                >
                                                    Items Sold {getSortIcon('totalItemsSold')}
                                                </th>
                                                <th 
                                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                    onClick={() => handleSort('totalEarnings')}
                                                >
                                                    Total Earned {getSortIcon('totalEarnings')}
                                                </th>
                                                <th 
                                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                    onClick={() => handleSort('outstandingBalance')}
                                                >
                                                    Outstanding Balance {getSortIcon('outstandingBalance')}
                                                </th>
                                                <th 
                                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                    onClick={() => handleSort('storeCredit')}
                                                >
                                                    Store Credit {getSortIcon('storeCredit')}
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Success Rate
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Last Activity
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {filteredAndSortedUsers.map((userAnalytic) => {
                                                const successRate = calculateSuccessRate(userAnalytic);
                                                const lastActivity = getLastActivity(userAnalytic);
                                                
                                                return (
                                                    <tr 
                                                        key={userAnalytic.userId} 
                                                        className="hover:bg-gray-50 cursor-pointer"
                                                        onClick={() => handleUserClick(userAnalytic)}
                                                    >
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div>
                                                                <div className="text-sm font-medium text-gray-900">{userAnalytic.userName}</div>
                                                                <div className="text-sm text-gray-500">{userAnalytic.userEmail}</div>
                                                                <div className="text-xs text-gray-400">
                                                                    {userAnalytic.totalItemsListed} listed • {userAnalytic.activeItems.length} active • {userAnalytic.pendingItems.length} pending
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm font-semibold text-green-600">{userAnalytic.totalItemsSold}</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm font-semibold text-purple-600">${userAnalytic.totalEarnings.toFixed(2)}</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className={`text-sm font-semibold ${userAnalytic.outstandingBalance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                                                ${userAnalytic.outstandingBalance.toFixed(2)}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm font-semibold text-orange-600">${userAnalytic.storeCredit.toFixed(2)}</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className={`text-sm font-semibold ${
                                                                successRate >= 70 ? 'text-green-600' :
                                                                successRate >= 40 ? 'text-yellow-600' : 'text-red-600'
                                                            }`}>
                                                                {successRate.toFixed(1)}%
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            {formatTimeAgo(lastActivity)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {filteredAndSortedUsers.length === 0 && !loading && (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No Users Found</h3>
                                <p className="text-gray-500">No users match your search criteria.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* User Detail Modal */}
            {showUserDetail && selectedUserAnalytics && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden">
                        <div className="sticky top-0 bg-white p-6 border-b border-gray-200">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-800">{selectedUserAnalytics.userName}</h2>
                                    <p className="text-gray-600 mt-1">User Activity & Action History</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowUserDetail(false);
                                        setSelectedUserAnalytics(null);
                                        // Clean up subscription
                                        if ((window as any).userActionsUnsubscribe) {
                                            (window as any).userActionsUnsubscribe();
                                        }
                                    }}
                                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                                >
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[calc(95vh-200px)]">
                            {/* User Stats Summary */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="text-xl font-bold text-gray-900">{selectedUserAnalytics.totalItemsListed}</div>
                                    <div className="text-sm text-gray-600">Total Items Listed</div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="text-xl font-bold text-gray-900">{selectedUserAnalytics.totalItemsSold}</div>
                                    <div className="text-sm text-gray-600">Items Sold</div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="text-xl font-bold text-gray-900">${selectedUserAnalytics.totalEarnings.toFixed(2)}</div>
                                    <div className="text-sm text-gray-600">Total Earnings</div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="text-xl font-bold text-gray-900">{calculateSuccessRate(selectedUserAnalytics).toFixed(1)}%</div>
                                    <div className="text-sm text-gray-600">Success Rate</div>
                                </div>
                            </div>

                            {/* Action History */}
                            <div className="bg-white border border-gray-200 rounded-lg">
                                <div className="p-4 border-b border-gray-200">
                                    <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
                                    <p className="text-sm text-gray-600">All actions performed by this user</p>
                                </div>
                                <div className="max-h-96 overflow-y-auto">
                                    {userActions.length === 0 ? (
                                        <div className="p-8 text-center text-gray-500">
                                            <div className="text-4xl mb-2">📊</div>
                                            <p>No activity found for this user</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-200">
                                            {userActions.map((action, index) => (
                                                <div key={index} className="p-4 hover:bg-gray-50">
                                                    <div className="flex items-start space-x-3">
                                                        <div className="text-2xl">{getActionIcon(action.action)}</div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-sm font-medium text-gray-900 capitalize">
                                                                    {action.action.replace('_', ' ')}
                                                                </p>
                                                                <p className="text-sm text-gray-500">{formatTimeAgo(action.timestamp)}</p>
                                                            </div>
                                                            <p className="text-sm text-gray-600 mt-1">{action.details}</p>
                                                            {action.itemTitle && (
                                                                <p className="text-xs text-gray-500 mt-1">Item: {action.itemTitle}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default UserAnalyticsModal; 