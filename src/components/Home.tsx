import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem } from '../types';
import ItemCard from './ItemCard';
import AddItemModal from './AddItemModal';
import AdminModal from './AdminModal';
import ApprovedItemsModal from './ApprovedItemsModal';

const Home: React.FC = () => {
    const { user, loading, signInWithGoogle, logout, isAuthenticated } = useAuth();
    const [items, setItems] = useState<ConsignmentItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [isApprovedModalOpen, setIsApprovedModalOpen] = useState(false);
    const [loadingItems, setLoadingItems] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            fetchItems();
            checkAdminStatus();
        } else {
            setLoadingItems(false);
            setIsAdmin(false);
        }
    }, [isAuthenticated]);

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

    const fetchItems = async () => {
        try {
            const itemsRef = collection(db, 'items');
            
            // Try with index first, fallback to simple query if index doesn't exist yet
            let q;
            try {
                q = query(
                    itemsRef, 
                    where('status', '==', 'live'),
                    orderBy('liveAt', 'desc')
                );
            } catch (indexError) {
                // Fallback to simple query without ordering if index doesn't exist
                q = query(
                    itemsRef, 
                    where('status', '==', 'live')
                );
            }
            
            const querySnapshot = await getDocs(q);
            const fetchedItems: ConsignmentItem[] = [];
            
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // Convert Firestore timestamps to Date objects
                fetchedItems.push({ 
                    id: doc.id, 
                    ...data,
                    createdAt: data.createdAt?.toDate() || new Date(),
                    approvedAt: data.approvedAt?.toDate(),
                    liveAt: data.liveAt?.toDate()
                } as ConsignmentItem);
            });
            
            // Sort manually if we couldn't use orderBy
            fetchedItems.sort((a, b) => {
                const aTime = a.liveAt || a.createdAt;
                const bTime = b.liveAt || b.createdAt;
                return bTime.getTime() - aTime.getTime();
            });
            
            setItems(fetchedItems);
        } catch (error) {
            console.error('Error fetching items:', error);
            // Set empty array on error so UI doesn't break
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
        // Refresh items after adding
        fetchItems();
    };

    const handleAdminModal = () => {
        setIsAdminModalOpen(true);
    };

    const handleAdminModalClose = () => {
        setIsAdminModalOpen(false);
        // Refresh items after admin actions
        fetchItems();
    };

    const handleApprovedModal = () => {
        setIsApprovedModalOpen(true);
    };

    const handleApprovedModalClose = () => {
        setIsApprovedModalOpen(false);
        // Refresh items after approved actions
        fetchItems();
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
                    <h1 className="text-3xl font-bold text-gray-800 mb-6">Welcome to the Consignment Store</h1>
                    <p className="text-gray-600 mb-8">
                        Please sign in to browse and list items for consignment.
                    </p>
                    <button
                        onClick={signInWithGoogle}
                        className="w-full bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Sign in with Google
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header */}
            <div className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center">
                        <h1 className="text-2xl font-bold text-gray-900">Consignment Store</h1>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleAddItem}
                                className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                            >
                                Add Item
                            </button>
                            {/* Admin-only buttons */}
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={handleAdminModal}
                                        className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors text-sm"
                                    >
                                        Manage Items
                                    </button>
                                    <button
                                        onClick={handleApprovedModal}
                                        className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors text-sm"
                                    >
                                        Approved Items
                                    </button>
                                </>
                            )}
                            <div className="flex items-center gap-2">
                                <img 
                                    src={user?.photoURL || ''} 
                                    alt={user?.displayName || 'User'} 
                                    className="w-8 h-8 rounded-full"
                                />
                                <span className="text-sm text-gray-700">{user?.displayName}</span>
                                {isAdmin && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Admin</span>}
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

            {/* Items Grid */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {loadingItems ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500 text-lg">No items available yet.</p>
                        <p className="text-gray-400 text-sm mt-2">Be the first to add an item!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {items.map((item) => (
                            <ItemCard key={item.id} item={item} />
                        ))}
                    </div>
                )}
            </div>

            {/* Add Item Modal */}
            <AddItemModal 
                isOpen={isModalOpen} 
                onClose={handleModalClose}
                user={user}
            />

            {/* Admin Modal */}
            {isAdmin && (
                <AdminModal 
                    isOpen={isAdminModalOpen} 
                    onClose={handleAdminModalClose}
                    user={user}
                />
            )}

            {/* Approved Items Modal */}
            {isAdmin && (
                <ApprovedItemsModal 
                    isOpen={isApprovedModalOpen} 
                    onClose={handleApprovedModalClose}
                    user={user}
                />
            )}
        </div>
    );
};

export default Home; 