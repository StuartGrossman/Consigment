import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, deleteDoc, getDoc, addDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, UserAnalytics, PaymentRecord, User, StoreCreditTransaction, AuthUser } from '../types';

interface UserAnalyticsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AuthUser | null;
    isAdmin?: boolean;
    refreshTrigger?: number;
}

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
                            storeCredit: 0,
                            activeItems: [],
                            soldItems: [],
                            pendingItems: [],
                            approvedItems: []
                        });
                    } else {
                        // Update existing user info with more complete data
                        const analytics = userMap.get(userId)!;
                        analytics.userName = userData.displayName || userData.name || analytics.userName;
                        analytics.userEmail = userData.email || userData.phoneNumber || analytics.userEmail;
                    }
                });
            } catch (usersError) {
                console.log('Users collection not found or error:', usersError);
            }

            // Get payment records
            try {
                const paymentsRef = collection(db, 'payments');
                const paymentsSnapshot = await getDocs(paymentsRef);
                const payments: PaymentRecord[] = [];
                
                paymentsSnapshot.forEach((doc) => {
                    const payment = { id: doc.id, ...doc.data() } as PaymentRecord;
                    payments.push(payment);
                    
                    if (userMap.has(payment.userId)) {
                        userMap.get(payment.userId)!.totalPaid += payment.amount;
                    }
                });
                setPaymentRecords(payments);
            } catch (paymentsError) {
                console.log('Payments collection not found or error:', paymentsError);
                setPaymentRecords([]);
            }

            // Get store credit information
            try {
                const usersRef = collection(db, 'users');
                const usersSnapshot = await getDocs(usersRef);
                
                usersSnapshot.forEach((doc) => {
                    const userData = doc.data();
                    const userId = doc.id;
                    
                    if (userMap.has(userId)) {
                        userMap.get(userId)!.storeCredit = userData.storeCredit || 0;
                    }
                });
            } catch (storeCreditError) {
                console.log('Error fetching store credit:', storeCreditError);
            }

            // Calculate outstanding balances
            userMap.forEach((analytics) => {
                analytics.outstandingBalance = analytics.totalEarnings - analytics.totalPaid;
            });

            // Sort users by total earnings (highest first), then by items listed
            const sortedAnalytics = Array.from(userMap.values()).sort((a, b) => {
                if (b.totalEarnings !== a.totalEarnings) {
                    return b.totalEarnings - a.totalEarnings;
                }
                return b.totalItemsListed - a.totalItemsListed;
            });

            console.log('Final user analytics:', sortedAnalytics.length, 'users');
            setUserAnalytics(sortedAnalytics);
            setAllUsers(allUsers);
        } catch (error) {
            console.error('Error fetching analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchUserAnalytics = async (userId: string) => {
        setLoading(true);
        try {
            console.log('Fetching user analytics for userId:', userId);
            
            const itemsRef = collection(db, 'items');
            const userItemsQuery = query(itemsRef, where('sellerId', '==', userId));
            const itemsSnapshot = await getDocs(userItemsQuery);
            
            console.log('Found', itemsSnapshot.size, 'items for user');
            
            const analytics: UserAnalytics = {
                userId,
                userName: user?.displayName || '',
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

            itemsSnapshot.forEach((doc) => {
                const item = { 
                    id: doc.id, 
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate() || new Date(),
                    approvedAt: doc.data().approvedAt?.toDate(),
                    liveAt: doc.data().liveAt?.toDate(),
                    soldAt: doc.data().soldAt?.toDate()
                } as ConsignmentItem;
                
                console.log('Processing item:', item.title, 'status:', item.status, 'price:', item.price, 'soldPrice:', item.soldPrice);
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

            // Get payment records for this user
            try {
                const paymentsRef = collection(db, 'payments');
                const userPaymentsQuery = query(paymentsRef, where('userId', '==', userId));
                const paymentsSnapshot = await getDocs(userPaymentsQuery);
                
                console.log('Found', paymentsSnapshot.size, 'payments for user');
                
                paymentsSnapshot.forEach((doc) => {
                    const payment = doc.data() as PaymentRecord;
                    analytics.totalPaid += payment.amount;
                });
            } catch (paymentsError) {
                console.log('Payments collection not found or error:', paymentsError);
            }

            analytics.outstandingBalance = analytics.totalEarnings - analytics.totalPaid;
            
            console.log('Final user analytics:', {
                totalItemsListed: analytics.totalItemsListed,
                totalItemsSold: analytics.totalItemsSold,
                totalEarnings: analytics.totalEarnings,
                totalPaid: analytics.totalPaid,
                outstandingBalance: analytics.outstandingBalance
            });
            
            setCurrentUserAnalytics(analytics);
        } catch (error) {
            console.error('Error fetching user analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPaymentHistory = async (userId: string) => {
        try {
            const paymentsRef = collection(db, 'payments');
            const paymentsQuery = query(paymentsRef, where('userId', '==', userId), orderBy('paidAt', 'desc'));
            const paymentsSnapshot = await getDocs(paymentsQuery);
            
            const payments: PaymentRecord[] = [];
            paymentsSnapshot.forEach((doc) => {
                const data = doc.data();
                payments.push({
                    id: doc.id,
                    ...data,
                    paidAt: data.paidAt?.toDate() || new Date()
                } as PaymentRecord);
            });
            
            setPaymentHistory(payments);
        } catch (error) {
            console.log('Error fetching payment history:', error);
            setPaymentHistory([]);
        }
    };

    const handleEditItem = (item: ConsignmentItem) => {
        setEditingItem(item);
    };

    const handleSaveItem = async () => {
        if (!editingItem) return;
        
        try {
            const itemRef = doc(db, 'items', editingItem.id);
            await updateDoc(itemRef, {
                title: editingItem.title,
                description: editingItem.description,
                price: editingItem.price
            });
            
            setEditingItem(null);
            if (isAdmin) {
                fetchAllUserAnalytics();
            } else if (user) {
                fetchUserAnalytics(user.uid);
            }
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
            // Instead of deleting, archive the item
            const itemRef = doc(db, 'items', itemToDelete);
            await updateDoc(itemRef, {
                status: 'archived',
                archivedAt: new Date(),
                archiveReason: 'Manually archived by admin'
            });
            
            if (isAdmin) {
                fetchAllUserAnalytics();
            } else if (user) {
                fetchUserAnalytics(user.uid);
            }
        } catch (error) {
            console.error('Error archiving item:', error);
        } finally {
            setShowDeleteModal(false);
            setItemToDelete(null);
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
        if (!itemToMarkSold || !soldPrice) return;
        
        const price = parseFloat(soldPrice);
        if (isNaN(price) || price <= 0) return;
        
        try {
            const itemRef = doc(db, 'items', itemToMarkSold.id);
            
            // Calculate earnings split: User gets 75%, Admin gets 25%
            const userEarnings = price * 0.75;
            const adminEarnings = price * 0.25;
            
            await updateDoc(itemRef, {
                status: 'sold',
                soldAt: new Date(),
                soldPrice: price,
                userEarnings: userEarnings,
                adminEarnings: adminEarnings
            });
            
            if (isAdmin) {
                fetchAllUserAnalytics();
            } else if (user) {
                fetchUserAnalytics(user.uid);
            }
        } catch (error) {
            console.error('Error marking item as sold:', error);
        } finally {
            setShowSoldModal(false);
            setItemToMarkSold(null);
            setSoldPrice('');
        }
    };

    const cancelMarkAsSold = () => {
        setShowSoldModal(false);
        setItemToMarkSold(null);
        setSoldPrice('');
    };

    const handleCashPayment = async () => {
        if (!selectedUser || !paymentAmount) {
            alert('Please enter a payment amount');
            return;
        }
        
        const userData = userAnalytics.find(u => u.userId === selectedUser);
        if (!userData) {
            alert('User data not found');
            return;
        }
        
        const amount = parseFloat(paymentAmount);
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid amount greater than 0');
            return;
        }
        
        if (amount > userData.outstandingBalance) {
            alert('Payment amount cannot exceed outstanding balance');
            return;
        }
        
        try {
            setLoading(true);
            
            // Add payment record
            const paymentsRef = collection(db, 'payments');
            const paymentData: Omit<PaymentRecord, 'id'> = {
                userId: selectedUser,
                userName: userData.userName,
                userEmail: userData.userEmail,
                amount: amount,
                type: 'cash',
                itemsSold: userData.soldItems.map(item => item.id),
                paidAt: new Date(),
                notes: paymentNotes || `Cash payment of $${amount.toFixed(2)}`
            };
            
            await addDoc(paymentsRef, paymentData);
            
            // Close modal and reset
            setShowCashPaymentModal(false);
            setPaymentAmount('');
            setPaymentNotes('');
            
            // Refresh data
            await fetchAllUserAnalytics();
            if (selectedUser) {
                await fetchPaymentHistory(selectedUser);
            }
            
            alert(`Successfully recorded cash payment of $${amount.toFixed(2)} to ${userData.userName}!`);
        } catch (error) {
            console.error('Error processing cash payment:', error);
            alert('Failed to record cash payment. Please try again.');
        } finally {
            setLoading(false);
        }
    };



    const handleUserRedeemStoreCredit = async () => {
        if (!user || !currentUserAnalytics) return;
        
        const amount = parseFloat(redeemAmount);
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid amount');
            return;
        }
        
        const outstandingBalance = currentUserAnalytics.totalEarnings - currentUserAnalytics.totalPaid;
        if (amount > outstandingBalance) {
            alert('Cannot redeem more than your outstanding balance');
            return;
        }
        
        try {
            setLoading(true);
            
            // Create payment record for the redemption
            const paymentRecord: Omit<PaymentRecord, 'id'> = {
                userId: user.uid,
                userName: user.displayName || 'Unknown User',
                userEmail: user.email || '',
                amount: amount,
                type: 'store_credit',
                itemsSold: [],
                paidAt: new Date(),
                notes: `Store credit redeemed by user`
            };
            
            await addDoc(collection(db, 'payments'), paymentRecord);
            
            // Create store credit transaction
            const storeCreditTransaction = {
                userId: user.uid,
                userName: user.displayName || 'Unknown User',
                userEmail: user.email || '',
                amount: amount,
                type: 'earned',
                description: 'Redeemed earnings as store credit',
                createdAt: new Date()
            };
            
            await addDoc(collection(db, 'store_credit_transactions'), storeCreditTransaction);
            
            // Update user's store credit balance
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            const currentStoreCredit = userDoc.exists() ? (userDoc.data().storeCredit || 0) : 0;
            
            if (userDoc.exists()) {
                await updateDoc(userRef, {
                    storeCredit: currentStoreCredit + amount
                });
            } else {
                await setDoc(userRef, {
                    storeCredit: amount,
                    email: user.email || ('phoneNumber' in user ? (user as any).phoneNumber : ''),
                    displayName: user.displayName
                });
            }
            
            // Refresh data
            await fetchUserAnalytics(user.uid);
            
            // Close modal and reset
            setShowUserRedeemModal(false);
            setRedeemAmount('');
            
            alert(`Successfully redeemed $${amount.toFixed(2)} as store credit!`);
        } catch (error) {
            console.error('Error redeeming store credit:', error);
            alert('Failed to redeem store credit. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-gray-900">
                            {isAdmin ? 'User Analytics Dashboard' : 'My Statistics'}
                        </h2>
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
                    ) : isAdmin ? (
                        <div>
                            {/* Admin Dashboard */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* User List */}
                                <div className="lg:col-span-1">
                                    <h3 className="text-lg font-semibold mb-4">
                                        Users ({userAnalytics.length})
                                    </h3>
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                        {userAnalytics.length === 0 ? (
                                            <div className="text-center py-8 text-gray-500">
                                                <div className="text-4xl mb-2">👥</div>
                                                <p>No users found</p>
                                                <p className="text-sm">Users will appear here after they list items</p>
                                            </div>
                                        ) : (
                                            userAnalytics.map((analytics) => (
                                                <div
                                                    key={analytics.userId}
                                                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                                        selectedUser === analytics.userId 
                                                            ? 'border-blue-500 bg-blue-50' 
                                                            : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                                    onClick={() => setSelectedUser(analytics.userId)}
                                                >
                                                    <div className="font-medium">{analytics.userName}</div>
                                                    <div className="text-sm text-gray-500">{analytics.userEmail}</div>
                                                    <div className="text-sm mt-1 flex justify-between">
                                                        <span className="text-blue-600">{analytics.totalItemsListed} items</span>
                                                        <span className="text-green-600">{formatCurrency(analytics.totalEarnings)}</span>
                                                    </div>
                                                    {analytics.outstandingBalance > 0 && (
                                                        <div className="text-xs text-orange-600 mt-1">
                                                            Owed: {formatCurrency(analytics.outstandingBalance)}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* User Details */}
                                <div className="lg:col-span-2">
                                    {!selectedUser ? (
                                        <div className="text-center py-16 text-gray-500">
                                            <div className="text-6xl mb-4">📊</div>
                                            <h3 className="text-lg font-medium mb-2">Select a User</h3>
                                            <p>Click on a user from the list to view their detailed analytics</p>
                                        </div>
                                    ) : (() => {
                                        const analytics = userAnalytics.find(u => u.userId === selectedUser);
                                        if (!analytics) return null;

                                        return (
                                            <div>
                                                <div className="flex justify-between items-center mb-4">
                                                    <h3 className="text-lg font-semibold">{analytics.userName}</h3>
                                                                                        {analytics.outstandingBalance > 0 && (
                                        <button
                                            onClick={() => setShowCashPaymentModal(true)}
                                            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 flex items-center gap-2"
                                        >
                                            💵 Pay With Cash
                                        </button>
                                    )}
                                                </div>

                                                {/* Stats Grid */}
                                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                                                    <div className="bg-blue-50 p-4 rounded-lg">
                                                        <div className="text-blue-600 text-sm font-medium">Items Listed</div>
                                                        <div className="text-2xl font-bold text-blue-900">{analytics.totalItemsListed}</div>
                                                    </div>
                                                    <div className="bg-green-50 p-4 rounded-lg">
                                                        <div className="text-green-600 text-sm font-medium">Items Sold</div>
                                                        <div className="text-2xl font-bold text-green-900">{analytics.totalItemsSold}</div>
                                                    </div>
                                                    <div className="bg-purple-50 p-4 rounded-lg">
                                                        <div className="text-purple-600 text-sm font-medium">Total Earnings</div>
                                                        <div className="text-2xl font-bold text-purple-900">{formatCurrency(analytics.totalEarnings)}</div>
                                                    </div>
                                                    <div className="bg-orange-50 p-4 rounded-lg">
                                                        <div className="text-orange-600 text-sm font-medium">Outstanding</div>
                                                        <div className="text-2xl font-bold text-orange-900">{formatCurrency(analytics.outstandingBalance)}</div>
                                                    </div>
                                                    <div className="bg-indigo-50 p-4 rounded-lg">
                                                        <div className="text-indigo-600 text-sm font-medium">Store Credit</div>
                                                        <div className="text-2xl font-bold text-indigo-900">{formatCurrency(analytics.storeCredit)}</div>
                                                    </div>
                                                </div>

                                                {/* Payment History Section */}
                                                {paymentHistory.length > 0 && (
                                                    <div className="mb-6">
                                                        <h4 className="font-medium mb-3 text-gray-900">
                                                            Payment History ({paymentHistory.length})
                                                        </h4>
                                                        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                                            <div className="max-h-64 overflow-y-auto">
                                                                <table className="min-w-full divide-y divide-gray-200">
                                                                    <thead className="bg-gray-50">
                                                                        <tr>
                                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                                        {paymentHistory.map((payment) => (
                                                                            <tr key={payment.id} className="hover:bg-gray-50">
                                                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                                                    {payment.paidAt.toLocaleDateString()}
                                                                                </td>
                                                                                <td className="px-4 py-3 whitespace-nowrap">
                                                                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                                                        payment.type === 'cash' 
                                                                                            ? 'bg-green-100 text-green-800' 
                                                                                            : 'bg-purple-100 text-purple-800'
                                                                                    }`}>
                                                                                        {payment.type === 'cash' ? '💵 Cash' : '🎁 Store Credit'}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                                                                                    {formatCurrency(payment.amount)}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                                                                                    {payment.notes || '-'}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Items Sections */}
                                                {['activeItems', 'soldItems', 'approvedItems', 'pendingItems'].map((section) => {
                                                    const items = analytics[section as keyof UserAnalytics] as ConsignmentItem[];
                                                    if (items.length === 0) return null;

                                                    return (
                                                        <div key={section} className="mb-6">
                                                            <h4 className="font-medium mb-3 capitalize">
                                                                {section.replace('Items', ' Items')} ({items.length})
                                                            </h4>
                                                            <div className="space-y-2">
                                                                {items.map((item) => (
                                                                    <div key={item.id} className="flex justify-between items-center p-3 border rounded-lg">
                                                                        <div className="flex-1">
                                                                            <div className="font-medium">{item.title}</div>
                                                                            <div className="text-sm text-gray-500">
                                                                                {formatCurrency(item.price)}
                                                                                {item.soldPrice && ` → ${formatCurrency(item.soldPrice)}`}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex gap-2">
                                                                            <button
                                                                                onClick={() => handleEditItem(item)}
                                                                                className="text-blue-600 hover:text-blue-800 text-sm"
                                                                            >
                                                                                Edit
                                                                            </button>
                                                                            {item.status === 'live' && (
                                                                                <button
                                                                                    onClick={() => handleMarkAsSold(item)}
                                                                                    className="text-green-600 hover:text-green-800 text-sm"
                                                                                >
                                                                                    Mark Sold
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                onClick={() => handleDeleteItem(item.id)}
                                                                                className="text-orange-600 hover:text-orange-800 text-sm"
                                                                            >
                                                                                Archive
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div>
                            {!currentUserAnalytics ? (
                                <div className="text-center py-16 text-gray-500">
                                    <div className="text-6xl mb-4">📊</div>
                                    <h3 className="text-lg font-medium mb-2">Loading Your Statistics...</h3>
                                    <p>Gathering your item data and earnings information</p>
                                </div>
                            ) : (
                                <div>
                                    {/* User's Personal Statistics */}
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                                    <div className="bg-blue-50 p-4 rounded-lg">
                                        <div className="text-blue-600 text-sm font-medium">Items Listed</div>
                                        <div className="text-2xl font-bold text-blue-900">{currentUserAnalytics.totalItemsListed}</div>
                                    </div>
                                    <div className="bg-green-50 p-4 rounded-lg">
                                        <div className="text-green-600 text-sm font-medium">Items Sold</div>
                                        <div className="text-2xl font-bold text-green-900">{currentUserAnalytics.totalItemsSold}</div>
                                    </div>
                                    <div className="bg-purple-50 p-4 rounded-lg">
                                        <div className="text-purple-600 text-sm font-medium">Total Earnings</div>
                                        <div className="text-2xl font-bold text-purple-900">{formatCurrency(currentUserAnalytics.totalEarnings)}</div>
                                    </div>
                                    <div className="bg-orange-50 p-4 rounded-lg">
                                        <div className="text-orange-600 text-sm font-medium">Outstanding</div>
                                        <div className="text-2xl font-bold text-orange-900">{formatCurrency(currentUserAnalytics.outstandingBalance)}</div>
                                    </div>
                                    <div className="bg-indigo-50 p-4 rounded-lg">
                                        <div className="text-indigo-600 text-sm font-medium">Store Credit</div>
                                        <div className="text-2xl font-bold text-indigo-900">{formatCurrency(currentUserAnalytics.storeCredit)}</div>
                                    </div>
                                </div>

                                {/* Redeem Store Credit Button */}
                                {currentUserAnalytics.outstandingBalance > 0 && (
                                    <div className="mb-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-medium text-purple-900 mb-1">💰 Redeem Your Earnings</h3>
                                                <p className="text-purple-700 text-sm">
                                                    You have {formatCurrency(currentUserAnalytics.outstandingBalance)} available to redeem as store credit
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setShowUserRedeemModal(true)}
                                                className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2"
                                            >
                                                🎁 Redeem Store Credit
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* User's Items */}
                                {['activeItems', 'soldItems', 'approvedItems', 'pendingItems'].map((section) => {
                                    const items = currentUserAnalytics[section as keyof UserAnalytics] as ConsignmentItem[];
                                    if (items.length === 0) return null;

                                    return (
                                        <div key={section} className="mb-6">
                                            <h4 className="font-medium mb-3 capitalize">
                                                {section.replace('Items', ' Items')} ({items.length})
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {items.map((item) => (
                                                    <div key={item.id} className="border rounded-lg p-4">
                                                        <div className="font-medium">{item.title}</div>
                                                        <div className="text-sm text-gray-600 mt-1">{item.description}</div>
                                                        <div className="text-sm mt-2">
                                                            Price: {formatCurrency(item.price)}
                                                            {item.soldPrice && ` → Sold for: ${formatCurrency(item.soldPrice)}`}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            Listed: {item.createdAt.toLocaleDateString()}
                                                            {item.soldAt && ` • Sold: ${item.soldAt.toLocaleDateString()}`}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Edit Item Modal */}
                {editingItem && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                            <h3 className="text-lg font-semibold mb-4">Edit Item</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                                    <input
                                        type="text"
                                        value={editingItem.title}
                                        onChange={(e) => setEditingItem({...editingItem, title: e.target.value})}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                    <textarea
                                        value={editingItem.description}
                                        onChange={(e) => setEditingItem({...editingItem, description: e.target.value})}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                        rows={3}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                                    <input
                                        type="number"
                                        value={editingItem.price}
                                        onChange={(e) => setEditingItem({...editingItem, price: parseFloat(e.target.value)})}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                    />
                                </div>
                                <div className="flex gap-2 pt-4">
                                    <button
                                        onClick={handleSaveItem}
                                        className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
                                    >
                                        Save Changes
                                    </button>
                                    <button
                                        onClick={() => setEditingItem(null)}
                                        className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}





                {/* Cash Payment Modal */}
                {showCashPaymentModal && selectedUser && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                            <div className="flex items-center mb-4">
                                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                                    <span className="text-green-600 text-xl">💵</span>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Cash Payment</h3>
                            </div>
                            {(() => {
                                const userData = userAnalytics.find(u => u.userId === selectedUser);
                                if (!userData) return null;
                                
                                return (
                                    <>
                                        <p className="text-gray-600 mb-4">
                                            Record cash payment to <span className="font-medium">{userData.userName}</span>
                                        </p>
                                        <div className="bg-gray-50 p-3 rounded-lg mb-4">
                                            <div className="text-sm text-gray-600">Outstanding Balance</div>
                                            <div className="text-xl font-bold text-gray-900">{formatCurrency(userData.outstandingBalance)}</div>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Cash Amount</label>
                                                <input
                                                    type="number"
                                                    value={paymentAmount}
                                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                                    placeholder="0.00"
                                                    max={userData.outstandingBalance}
                                                    min="0"
                                                    step="0.01"
                                                />
                                                {paymentAmount && parseFloat(paymentAmount) > userData.outstandingBalance && (
                                                    <p className="text-red-500 text-sm mt-1">Amount cannot exceed outstanding balance</p>
                                                )}
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                                <textarea
                                                    value={paymentNotes}
                                                    onChange={(e) => setPaymentNotes(e.target.value)}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                                    rows={2}
                                                    placeholder="Payment method, check number, etc."
                                                />
                                            </div>
                                            <div className="flex gap-2 pt-4">
                                                <button
                                                    onClick={handleCashPayment}
                                                    disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || parseFloat(paymentAmount) > userData.outstandingBalance || loading}
                                                    className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                                >
                                                    {loading ? 'Processing...' : 'Record Cash Payment'}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setShowCashPaymentModal(false);
                                                        setPaymentAmount('');
                                                        setPaymentNotes('');
                                                    }}
                                                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* Payment Modal */}
                {showPaymentModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                            <h3 className="text-lg font-semibold mb-4">Record Payment</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                                    <input
                                        type="number"
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                    <textarea
                                        value={paymentNotes}
                                        onChange={(e) => setPaymentNotes(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                        rows={3}
                                        placeholder="Payment method, check number, etc."
                                    />
                                </div>
                                <div className="flex gap-2 pt-4">
                                    <button
                                        onClick={handleCashPayment}
                                        className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600"
                                    >
                                        Record Payment
                                    </button>
                                    <button
                                        onClick={() => setShowPaymentModal(false)}
                                        className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Archive Item Modal */}
                {showDeleteModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
                            <div className="flex items-center mb-4">
                                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mr-3">
                                    <span className="text-orange-600 text-xl">📦</span>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Archive Item</h3>
                            </div>
                            <p className="text-gray-600 mb-6">
                                Are you sure you want to archive this item? The item will be moved to archived status and hidden from active listings, but can be restored later.
                            </p>
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={cancelDeleteItem}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDeleteItem}
                                    className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                                >
                                    Archive Item
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mark as Sold Modal */}
                {showSoldModal && itemToMarkSold && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
                            <div className="flex items-center mb-4">
                                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                                    <span className="text-green-600 text-xl">✅</span>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Mark as Sold</h3>
                            </div>
                            <p className="text-gray-600 mb-4">
                                Mark "<span className="font-medium">{itemToMarkSold.title}</span>" as sold
                            </p>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Final Sale Price
                                </label>
                                <input
                                    type="number"
                                    value={soldPrice}
                                    onChange={(e) => setSoldPrice(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                    placeholder="Enter sale price"
                                    min="0"
                                    step="0.01"
                                />
                                {soldPrice && parseFloat(soldPrice) <= 0 && (
                                    <p className="text-red-500 text-sm mt-1">Please enter a valid price greater than 0</p>
                                )}
                            </div>
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={cancelMarkAsSold}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmMarkAsSold}
                                    disabled={!soldPrice || parseFloat(soldPrice) <= 0}
                                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    Confirm Sale
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* User Redeem Store Credit Modal */}
                {showUserRedeemModal && currentUserAnalytics && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                            <div className="flex items-center mb-4">
                                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                                    <span className="text-purple-600 text-xl">🎁</span>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Redeem Store Credit</h3>
                            </div>
                            <p className="text-gray-600 mb-4">
                                Convert your earnings into store credit that you can use for future purchases
                            </p>
                            <div className="bg-gray-50 p-3 rounded-lg mb-4">
                                <div className="text-sm text-gray-600">Available to Redeem</div>
                                <div className="text-xl font-bold text-gray-900">{formatCurrency(currentUserAnalytics.outstandingBalance)}</div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount to Redeem</label>
                                    <input
                                        type="number"
                                        value={redeemAmount}
                                        onChange={(e) => setRedeemAmount(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                        placeholder="0.00"
                                        max={currentUserAnalytics.outstandingBalance}
                                        min="0"
                                        step="0.01"
                                    />
                                    {redeemAmount && parseFloat(redeemAmount) > currentUserAnalytics.outstandingBalance && (
                                        <p className="text-red-500 text-sm mt-1">Amount cannot exceed available balance</p>
                                    )}
                                </div>
                                <div className="bg-purple-50 p-3 rounded-lg">
                                    <div className="text-sm text-purple-700">
                                        💡 Store credit can be used for future purchases in the app
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-4">
                                    <button
                                        onClick={handleUserRedeemStoreCredit}
                                        disabled={!redeemAmount || parseFloat(redeemAmount) <= 0 || parseFloat(redeemAmount) > currentUserAnalytics.outstandingBalance || loading}
                                        className="flex-1 bg-purple-500 text-white py-2 rounded-lg hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                    >
                                        {loading ? 'Processing...' : 'Redeem Store Credit'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowUserRedeemModal(false);
                                            setRedeemAmount('');
                                        }}
                                        className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserAnalyticsModal; 