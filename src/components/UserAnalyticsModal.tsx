import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, deleteDoc, getDoc, addDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, UserAnalytics, PaymentRecord, User, StoreCreditTransaction, AuthUser } from '../types';
import { subscribeToUserActions, UserActionLog } from '../services/userService';
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
    const [filteredUserActions, setFilteredUserActions] = useState<ActionLog[]>([]);
    const [showUserDetail, setShowUserDetail] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUserAnalytics, setSelectedUserAnalytics] = useState<UserAnalytics | null>(null);
    
    // New filtering states for user actions
    const [actionSearchQuery, setActionSearchQuery] = useState('');
    const [actionTypeFilter, setActionTypeFilter] = useState('all');
    const [actionTimeFilter, setActionTimeFilter] = useState('all');

    useEffect(() => {
        if (isOpen) {
            if (isAdmin) {
                // Ensure admin setup before fetching analytics
                ensureAdminSetup().then(() => {
                    fetchAllUserAnalytics();
                });
            } else if (user) {
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

    // Filter user actions when filters change
    useEffect(() => {
        filterUserActions();
    }, [userActions, actionSearchQuery, actionTypeFilter, actionTimeFilter]);

    const fetchAllUserAnalytics = async () => {
        setLoading(true);
        try {
            const allUsers: User[] = [];
            const userMap = new Map<string, UserAnalytics>();

            // First, get all items to find users who have listed items
            const itemsRef = collection(db, 'items');
            const itemsSnapshot = await getDocs(itemsRef);

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
                        email: item.sellerEmail || 'no-email@example.com',
                        displayName: item.sellerName || 'Unknown User',
                        photoURL: ''
                    };
                    allUsers.push(user);

                    userMap.set(userId, {
                        userId,
                        userName: item.sellerName || 'Unknown User',
                        userEmail: item.sellerEmail || 'no-email@example.com',
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

                // Categorize items by status
                switch (item.status) {
                    case 'live':
                        analytics.activeItems.push(item);
                        break;
                    case 'sold':
                        analytics.soldItems.push(item);
                        analytics.totalItemsSold++;
                        analytics.totalEarnings += item.userEarnings || 0;
                        break;
                    case 'pending':
                        analytics.pendingItems.push(item);
                        break;
                    case 'approved':
                        analytics.approvedItems.push(item);
                        break;
                }
            });

            // Get payment history for all users
            const paymentsRef = collection(db, 'payments');
            const paymentsSnapshot = await getDocs(paymentsRef);
            
            paymentsSnapshot.forEach((doc) => {
                const payment = doc.data() as PaymentRecord;
                const analytics = userMap.get(payment.userId);
                if (analytics) {
                    analytics.totalPaid += payment.amount;
                }
            });

            // Get store credit for all users
            const storeCreditRef = collection(db, 'storeCredit');
            const storeCreditSnapshot = await getDocs(storeCreditRef);
            
            storeCreditSnapshot.forEach((doc) => {
                const credit = doc.data() as StoreCreditTransaction;
                const analytics = userMap.get(credit.userId);
                if (analytics) {
                    analytics.storeCredit += credit.amount;
                }
            });

            // Calculate outstanding balances
            userMap.forEach((analytics) => {
                analytics.outstandingBalance = Math.max(0, analytics.totalEarnings - analytics.totalPaid);
            });

            setAllUsers(allUsers);
            setUserAnalytics(Array.from(userMap.values()));
        } catch (error: any) {
            console.error('Error fetching all user analytics:', error);
            
            // Handle specific Firebase permission errors
            if (error?.code === 'permission-denied') {
                console.warn('📍 User analytics access denied - insufficient permissions');
                // Set empty data for graceful degradation
                setAllUsers([]);
                setUserAnalytics([]);
            } else {
                // Other errors - still log but don't crash
                console.error('Unexpected error in user analytics:', error.message || error);
                setAllUsers([]);
                setUserAnalytics([]);
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchUserAnalytics = async (userId: string) => {
        setLoading(true);
        try {
            const userAnalytics: UserAnalytics = {
                userId,
                userName: user?.displayName || 'Unknown User',
                userEmail: user?.email || 'no-email@example.com',
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

            // Get user's items
            const itemsRef = collection(db, 'items');
            const q = query(itemsRef, where('sellerId', '==', userId));
            const querySnapshot = await getDocs(q);

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
                    case 'live':
                        userAnalytics.activeItems.push(item);
                        break;
                    case 'sold':
                        userAnalytics.soldItems.push(item);
                        userAnalytics.totalItemsSold++;
                        userAnalytics.totalEarnings += item.userEarnings || 0;
                        break;
                    case 'pending':
                        userAnalytics.pendingItems.push(item);
                        break;
                    case 'approved':
                        userAnalytics.approvedItems.push(item);
                        break;
                }
            });

            // Get user's payments
            const paymentsRef = collection(db, 'payments');
            const paymentsQuery = query(paymentsRef, where('userId', '==', userId));
            const paymentsSnapshot = await getDocs(paymentsQuery);
            
            paymentsSnapshot.forEach((doc) => {
                const payment = doc.data() as PaymentRecord;
                userAnalytics.totalPaid += payment.amount;
            });

            // Get user's store credit
            const storeCreditRef = collection(db, 'storeCredit');
            const storeCreditQuery = query(storeCreditRef, where('userId', '==', userId));
            const storeCreditSnapshot = await getDocs(storeCreditQuery);
            
            storeCreditSnapshot.forEach((doc) => {
                const credit = doc.data() as StoreCreditTransaction;
                userAnalytics.storeCredit += credit.amount;
            });

            userAnalytics.outstandingBalance = Math.max(0, userAnalytics.totalEarnings - userAnalytics.totalPaid);
            
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
            const selectedUserAnalytic = userAnalytics.find(u => u.userId === selectedUser);
            
            const payment: PaymentRecord = {
                id: '', // Will be set by Firestore
                userId: selectedUser,
                userName: selectedUserAnalytic?.userName || 'Unknown User',
                userEmail: selectedUserAnalytic?.userEmail || 'No email',
                amount,
                type: 'cash',
                itemsSold: [],
                paidAt: new Date(),
                paymentMethod: 'cash',
                notes: paymentNotes || `Cash payment of $${amount.toFixed(2)} by ${user?.displayName || 'Admin'}`
            };

            const paymentRef = await addDoc(collection(db, 'payments'), payment);
            console.log('Payment recorded:', paymentRef.id);

            setShowCashPaymentModal(false);
            setPaymentAmount('');
            setPaymentNotes('');
            
            // Refresh analytics
            if (isAdmin) {
                fetchAllUserAnalytics();
            }
            
            fetchPaymentHistory(selectedUser);
        } catch (error) {
            console.error('Error recording payment:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUserRedeemStoreCredit = async () => {
        if (!selectedUser || !redeemAmount || parseFloat(redeemAmount) <= 0) return;

        setLoading(true);
        try {
            const amount = -parseFloat(redeemAmount); // Negative amount for redemption
            const selectedUserAnalytic = userAnalytics.find(u => u.userId === selectedUser);
            
            const transaction: StoreCreditTransaction = {
                id: '', // Will be set by Firestore
                userId: selectedUser,
                userName: selectedUserAnalytic?.userName || 'Unknown User',
                userEmail: selectedUserAnalytic?.userEmail || 'No email',
                amount,
                type: 'used',
                description: `Store credit redeemed by admin: ${user?.displayName || 'Admin'}`,
                createdAt: new Date()
            };

            await addDoc(collection(db, 'storeCredit'), transaction);

            setShowUserRedeemModal(false);
            setRedeemAmount('');
            
            // Refresh analytics
            if (isAdmin) {
                fetchAllUserAnalytics();
            }
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
        
        // Reset action filters
        setActionSearchQuery('');
        setActionTypeFilter('all');
        setActionTimeFilter('all');
        
        // Check if this is a phone user - handle undefined userId
        const userId = userAnalytic.userId || '';
        const isPhoneUser = userId.startsWith('phone_');
        
        console.log('Loading actions for user:', userId, isPhoneUser ? '(phone user)' : '(regular user)');
        
        try {
            if (isPhoneUser) {
                // For phone users, show a placeholder message since they may not have user-specific action logs
                console.log('Phone user detected - limited action history available');
                setUserActions([
                    {
                        userId: userId,
                        userName: userAnalytic.userName || 'Unknown User',
                        userEmail: userAnalytic.userEmail || 'No email',
                        action: 'phone_user_activity',
                        details: `Phone user with ${userAnalytic.totalItemsListed} items listed and ${userAnalytic.totalItemsSold} items sold`,
                        timestamp: new Date(),
                        id: `phone-summary-${userId}`
                    }
                ]);
                
                // Return empty unsubscribe function for phone users
                (window as any).userActionsUnsubscribe = () => {};
            } else {
                // For regular users, get all action logs and filter by userId
                console.log('Setting up comprehensive action subscription for user:', userId);
                
                // Use the general action logs subscription and filter for this user
                const unsubscribe = subscribeToActionLogs((allActions) => {
                    console.log('Received all action logs:', allActions.length);
                    
                    // Filter actions for this specific user
                    const userSpecificActions = allActions
                        .filter(action => action.userId === userId)
                        .map(action => ({
                            ...action,
                            timestamp: action.timestamp?.toDate ? action.timestamp.toDate() : new Date()
                        }))
                        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                    
                    console.log('Filtered actions for user:', userSpecificActions.length);
                    setUserActions(userSpecificActions);
                });
                
                // Store unsubscribe function for cleanup
                (window as any).userActionsUnsubscribe = unsubscribe;
            }
        } catch (error) {
            console.error('Error fetching user actions:', error);
            setUserActions([]); // Set empty array on error
        }
    };

    const filterUserActions = () => {
        let filtered = [...userActions];

        // Apply search filter
        if (actionSearchQuery) {
            const searchLower = actionSearchQuery.toLowerCase();
            filtered = filtered.filter(action => 
                (action.action && action.action.toLowerCase().includes(searchLower)) ||
                (action.details && action.details.toLowerCase().includes(searchLower)) ||
                (action.itemTitle && action.itemTitle.toLowerCase().includes(searchLower))
            );
        }

        // Apply action type filter
        if (actionTypeFilter !== 'all') {
            filtered = filtered.filter(action => action.action === actionTypeFilter);
        }

        // Apply time filter
        if (actionTimeFilter !== 'all') {
            const now = new Date();
            let timeThreshold = 0;
            
            switch (actionTimeFilter) {
                case '1h':
                    timeThreshold = now.getTime() - (1000 * 60 * 60);
                    break;
                case '24h':
                    timeThreshold = now.getTime() - (1000 * 60 * 60 * 24);
                    break;
                case '7d':
                    timeThreshold = now.getTime() - (1000 * 60 * 60 * 24 * 7);
                    break;
                case '30d':
                    timeThreshold = now.getTime() - (1000 * 60 * 60 * 24 * 30);
                    break;
            }
            
            if (timeThreshold > 0) {
                filtered = filtered.filter(action => 
                    action.timestamp.getTime() >= timeThreshold
                );
            }
        }

        setFilteredUserActions(filtered);
    };

    const getUniqueActionTypes = () => {
        const types = new Set(userActions.map(action => action.action));
        return Array.from(types).sort();
    };

    const filteredAndSortedUsers = userAnalytics
        .filter(user => {
            const searchLower = searchQuery.toLowerCase();
            const userName = user.userName || '';
            const userEmail = user.userEmail || '';
            return userName.toLowerCase().includes(searchLower) ||
                   userEmail.toLowerCase().includes(searchLower);
        })
        .sort((a, b) => {
            const aValue = a[sortField];
            const bValue = b[sortField];
            const multiplier = sortDirection === 'asc' ? 1 : -1;
            return (aValue - bValue) * multiplier;
        });

    const getSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
            );
        }
        return sortDirection === 'asc' ? (
            <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
        ) : (
            <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        );
    };

    const getActionIcon = (action: string) => {
        switch (action) {
            // User Authentication
            case 'user_login': 
                return (
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                );
            case 'user_logout': 
                return (
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                );
            
            // Item Management
            case 'item_created':
            case 'item_listed': 
                return (
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                );
            case 'item_deleted': 
                return (
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                );
            case 'user_item_updated':
            case 'item_edited': 
                return (
                    <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                );
            
            // Admin Actions
            case 'item_approved': 
                return (
                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            case 'item_rejected': 
                return (
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            case 'bulk_approve': 
                return (
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                );
            case 'bulk_reject': 
                return (
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                );
            case 'item_made_live': 
                return (
                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
                    </svg>
                );
            case 'item_sent_to_pending': 
                return (
                    <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            case 'item_status_updated': 
                return (
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                );
            case 'bulk_status_update': 
                return (
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                );

            // Commerce Actions
            case 'purchase_completed':
            case 'item_purchased': 
                return (
                    <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l-1 7H6l-1-7z" />
                    </svg>
                );
            case 'purchase_failed': 
                return (
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                );
            case 'item_sold': 
                return (
                    <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                );
            case 'refund_issued': 
                return (
                    <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                );

            // Shipping & Logistics
            case 'item_shipped': 
                return (
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                );
            case 'barcode_generated': 
                return (
                    <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0-3h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V6a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1zm12 0h2a1 1 0 001-1V6a1 1 0 00-1-1h-2a1 1 0 00-1 1v1a1 1 0 001 1zM5 20h2a1 1 0 001-1v-1a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1z" />
                    </svg>
                );

            // User Interactions
            case 'item_bookmarked': 
                return (
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                );
            case 'cart_updated': 
                return (
                    <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17M17 13v4a2 2 0 01-2 2H9a2 2 0 01-2-2v-4m8 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
                    </svg>
                );

            // Admin Management
            case 'user_banned': 
                return (
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                    </svg>
                );
            case 'admin_status_toggled': 
                return (
                    <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                );

            // Testing & Data Management
            case 'test_data_generated': 
                return (
                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                );
            case 'test_data_removed': 
                return (
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                );
            case 'sample_data_created': 
                return (
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                );
            case 'database_cleared': 
                return (
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                );

            // Dashboard & Views
            case 'dashboard_viewed': 
                return (
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                );
            case 'phone_user_activity': 
                return (
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                );

            // Legacy/Other
            case 'item_archived': 
                return (
                    <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                );
            
            default: 
                return (
                    <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                );
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

    // Function to ensure admin status is properly set up
    const ensureAdminSetup = async (): Promise<boolean> => {
        if (!user || !isAdmin) return false;
        
        try {
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            
            if (!userDoc.exists()) {
                // Create admin user document
                await setDoc(userRef, {
                    isAdmin: true,
                    email: user.email || '',
                    displayName: user.displayName || '',
                    photoURL: user.photoURL || '',
                    phoneNumber: user.phoneNumber || '',
                    lastSignIn: new Date(),
                    createdAt: new Date(),
                });
                console.log('✅ Created admin user document');
                return true;
            } else if (!userDoc.data()?.isAdmin) {
                // Update existing document to add admin status
                await setDoc(userRef, {
                    isAdmin: true,
                    lastSignIn: new Date(),
                }, { merge: true });
                console.log('✅ Updated admin status in user document');
                return true;
            }
            
            // Admin status already properly set
            return true;
        } catch (error: any) {
            console.warn('⚠️ Could not verify/set admin status:', error?.code || 'unknown error');
            // Continue with analytics fetch even if admin setup fails
            return true;
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden">
                    <div className="sticky top-0 bg-white p-6 border-b border-gray-200">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-800">User Sales Dashboard</h2>
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
                        <div className="mb-6">
                            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-4">
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
                                                    <div className="flex items-center gap-1">
                                                        Items Sold {getSortIcon('totalItemsSold')}
                                                    </div>
                                                </th>
                                                <th 
                                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                    onClick={() => handleSort('totalEarnings')}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        Total Earned {getSortIcon('totalEarnings')}
                                                    </div>
                                                </th>
                                                <th 
                                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                    onClick={() => handleSort('outstandingBalance')}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        Outstanding Balance {getSortIcon('outstandingBalance')}
                                                    </div>
                                                </th>
                                                <th 
                                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                    onClick={() => handleSort('storeCredit')}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        Store Credit {getSortIcon('storeCredit')}
                                                    </div>
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
                                            {filteredAndSortedUsers.map((userAnalytic, index) => {
                                                const successRate = calculateSuccessRate(userAnalytic);
                                                const lastActivity = getLastActivity(userAnalytic);
                                                
                                                return (
                                                    <tr 
                                                        key={userAnalytic.userId || `user-${index}`} 
                                                        className="hover:bg-gray-50 cursor-pointer"
                                                        onClick={() => handleUserClick(userAnalytic)}
                                                    >
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div>
                                                                <div className="text-sm font-medium text-gray-900">{userAnalytic.userName || 'Unknown User'}</div>
                                                                <div className="text-sm text-gray-500">{userAnalytic.userEmail || 'No email'}</div>
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
                                    <h2 className="text-2xl font-bold text-gray-800">{selectedUserAnalytics.userName || 'Unknown User'}</h2>
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
                                    
                                    {/* Action Filters */}
                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Search Filter */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Search Actions</label>
                                            <input
                                                type="text"
                                                value={actionSearchQuery}
                                                onChange={(e) => setActionSearchQuery(e.target.value)}
                                                placeholder="Search actions, details, items..."
                                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            />
                                        </div>

                                        {/* Action Type Filter */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
                                            <select
                                                value={actionTypeFilter}
                                                onChange={(e) => setActionTypeFilter(e.target.value)}
                                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            >
                                                <option value="all">All Actions</option>
                                                {getUniqueActionTypes().map(type => (
                                                    <option key={type} value={type}>
                                                        {type.replace('_', ' ').charAt(0).toUpperCase() + type.replace('_', ' ').slice(1)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Time Filter */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
                                            <select
                                                value={actionTimeFilter}
                                                onChange={(e) => setActionTimeFilter(e.target.value)}
                                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            >
                                                <option value="all">All Time</option>
                                                <option value="1h">Last Hour</option>
                                                <option value="24h">Last 24 Hours</option>
                                                <option value="7d">Last 7 Days</option>
                                                <option value="30d">Last 30 Days</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    {/* Filter Results Summary */}
                                    <div className="mt-3 text-sm text-gray-600">
                                        Showing {filteredUserActions.length} of {userActions.length} actions
                                    </div>
                                </div>
                                <div className="max-h-96 overflow-y-auto">
                                    {filteredUserActions.length === 0 ? (
                                        <div className="p-8 text-center text-gray-500">
                                            <div className="mb-4">
                                                <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                </svg>
                                            </div>
                                            <p>{userActions.length === 0 ? 'No activity found for this user' : 'No actions match your filters'}</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-200">
                                            {filteredUserActions.map((action, index) => (
                                                <div key={action.id || `${action.userId}-${action.action}-${action.timestamp.getTime()}-${index}`} className="p-4 hover:bg-gray-50">
                                                    <div className="flex items-start space-x-3">
                                                        <div className="flex-shrink-0 mt-0.5">{getActionIcon(action.action)}</div>
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