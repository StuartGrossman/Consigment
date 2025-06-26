import { db } from '../config/firebase';
import { collection, query, where, getDocs, addDoc, setDoc, doc, serverTimestamp, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { AuthUser } from '../types';

export interface UserActionLog {
    id?: string;
    userId: string;
    userName: string;
    userEmail: string;
    action: string;
    details: string;
    timestamp: any;
    itemId?: string;
    itemTitle?: string;
}

/**
 * User-safe logging function using user-specific collections
 */
export const logUserActionSafe = async (
    user: AuthUser | null,
    action: string,
    details: string,
    itemId?: string,
    itemTitle?: string
): Promise<void> => {
    if (!user) return;

    try {
        const actionLog: Omit<UserActionLog, 'id'> = {
            userId: user.uid,
            userName: user.displayName || 'Anonymous',
            userEmail: user.email || '',
            action,
            details,
            timestamp: serverTimestamp()
        };

        // Only add itemId and itemTitle if they are provided
        if (itemId) actionLog.itemId = itemId;
        if (itemTitle) actionLog.itemTitle = itemTitle;

        // Use user-specific subcollection for actions
        const userActionsRef = collection(db, 'userActions', user.uid, 'actions');
        await addDoc(userActionsRef, actionLog);
    } catch (error: any) {
        // Silently handle all errors for user actions to prevent disruption
        console.debug('User action logging skipped:', error?.code || 'unknown error');
    }
};

/**
 * Get user's own action history using user-specific collection
 */
export const getUserActionHistory = async (userId: string): Promise<UserActionLog[]> => {
    try {
        const userActionsQuery = query(
            collection(db, 'userActions', userId, 'actions'),
            orderBy('timestamp', 'desc'),
            limit(50)
        );
        
        const querySnapshot = await getDocs(userActionsQuery);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as UserActionLog[];
    } catch (error: any) {
        console.debug('Could not fetch user action history:', error?.code || 'unknown error');
        return [];
    }
};

/**
 * Subscribe to user's own actions using user-specific collection
 */
export const subscribeToUserActions = (userId: string, callback: (actions: UserActionLog[]) => void): (() => void) => {
    try {
        const userActionsQuery = query(
            collection(db, 'userActions', userId, 'actions'),
            orderBy('timestamp', 'desc'),
            limit(20)
        );
        
        return onSnapshot(userActionsQuery, (snapshot) => {
            try {
                const actions = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as UserActionLog[];
                callback(actions);
            } catch (error) {
                console.debug('Error processing user actions:', error);
                callback([]);
            }
        }, (error) => {
            console.debug('User actions subscription error:', error?.code || 'unknown error');
            callback([]);
        });
    } catch (error) {
        console.debug('Could not set up user actions subscription:', error);
        return () => {}; // Return no-op unsubscribe function
    }
};

/**
 * Save user cart to user-specific collection
 */
export const saveUserCart = async (userId: string, cartData: any): Promise<void> => {
    try {
        // Store cart in user-specific collection
        const userCartRef = doc(db, 'userCarts', userId);
        await setDoc(userCartRef, {
            cartData,
            updatedAt: serverTimestamp()
        });
        
        // Also store locally as backup
        localStorage.setItem(`cart_${userId}`, JSON.stringify(cartData));
    } catch (error) {
        console.debug('Cart save to Firestore failed, using localStorage:', error);
        // Fallback to localStorage only
        localStorage.setItem(`cart_${userId}`, JSON.stringify(cartData));
    }
};

/**
 * Load user cart from user-specific collection
 */
export const loadUserCart = async (userId: string): Promise<any> => {
    try {
        // Try Firestore first
        const userCartRef = doc(db, 'userCarts', userId);
        const cartDoc = await getDocs(query(collection(db, 'userCarts'), where('__name__', '==', userId)));
        
        if (!cartDoc.empty) {
            const cartData = cartDoc.docs[0].data().cartData;
            // Sync to localStorage
            localStorage.setItem(`cart_${userId}`, JSON.stringify(cartData));
            return cartData;
        }
    } catch (error) {
        console.debug('Could not load cart from Firestore:', error);
    }
    
    // Fallback to localStorage
    try {
        const localCart = localStorage.getItem(`cart_${userId}`);
        return localCart ? JSON.parse(localCart) : null;
    } catch (error) {
        console.debug('Could not load cart from localStorage:', error);
        return null;
    }
};

/**
 * Save user bookmarks to user-specific collection
 */
export const saveUserBookmarks = async (userId: string, bookmarks: string[]): Promise<void> => {
    try {
        const userBookmarksRef = doc(db, 'userBookmarks', userId);
        await setDoc(userBookmarksRef, {
            bookmarks,
            updatedAt: serverTimestamp()
        });
        
        // Also store locally
        localStorage.setItem(`bookmarks_${userId}`, JSON.stringify(bookmarks));
        
        // Log the action
        await logUserActionSafe(
            { uid: userId } as AuthUser,
            'bookmarks_updated',
            `Updated bookmarks (${bookmarks.length} items)`
        );
    } catch (error) {
        console.debug('Bookmark save to Firestore failed, using localStorage:', error);
        localStorage.setItem(`bookmarks_${userId}`, JSON.stringify(bookmarks));
    }
};

/**
 * Load user bookmarks from user-specific collection
 */
export const loadUserBookmarks = async (userId: string): Promise<string[]> => {
    try {
        // Try Firestore first
        const userBookmarksRef = doc(db, 'userBookmarks', userId);
        const bookmarksDoc = await getDocs(query(collection(db, 'userBookmarks'), where('__name__', '==', userId)));
        
        if (!bookmarksDoc.empty) {
            const bookmarks = bookmarksDoc.docs[0].data().bookmarks || [];
            // Sync to localStorage
            localStorage.setItem(`bookmarks_${userId}`, JSON.stringify(bookmarks));
            return bookmarks;
        }
    } catch (error) {
        console.debug('Could not load bookmarks from Firestore:', error);
    }
    
    // Fallback to localStorage
    try {
        const localBookmarks = localStorage.getItem(`bookmarks_${userId}`);
        return localBookmarks ? JSON.parse(localBookmarks) : [];
    } catch (error) {
        console.debug('Could not load bookmarks from localStorage:', error);
        return [];
    }
};

/**
 * Save user's personal item (draft/pending) to user-specific collection
 */
export const saveUserItem = async (userId: string, itemData: any): Promise<string | null> => {
    try {
        // Validate userId
        if (!userId || userId.trim() === '') {
            console.error('❌ Invalid userId provided to saveUserItem');
            return null;
        }

        const userItemsRef = collection(db, 'userItems', userId, 'items');
        const docRef = await addDoc(userItemsRef, {
            ...itemData,
            createdAt: serverTimestamp(),
            status: 'draft' // User items start as drafts
        });
        
        console.log('✅ User item saved to user-specific collection:', docRef.id);
        return docRef.id;
    } catch (error: any) {
        console.error('❌ Failed to save user item:', error);
        
        // Log more detailed error information
        if (error?.code === 'permission-denied') {
            console.error('Permission denied - user may not be properly authenticated');
            console.error('User ID:', userId);
            console.error('Error details:', error);
        } else if (error?.code === 'unauthenticated') {
            console.error('User is not authenticated');
        } else {
            console.error('Unknown error saving user item:', error?.message || error);
        }
        
        return null;
    }
};

/**
 * Get user's personal items from user-specific collection
 */
export const getUserItems = async (userId: string): Promise<any[]> => {
    try {
        const userItemsQuery = query(
            collection(db, 'userItems', userId, 'items'),
            orderBy('createdAt', 'desc')
        );
        
        const querySnapshot = await getDocs(userItemsQuery);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.debug('Could not fetch user items:', error);
        return [];
    }
};

/**
 * Save user purchase to user-specific collection (local copy for user access)
 */
export const saveUserPurchase = async (userId: string, purchaseData: any): Promise<void> => {
    try {
        const userPurchasesRef = collection(db, 'userPurchases', userId, 'orders');
        await addDoc(userPurchasesRef, {
            ...purchaseData,
            createdAt: serverTimestamp()
        });
        
        // Also save to localStorage as backup
        const existingHistory = localStorage.getItem(`purchase_history_${userId}`);
        const history = existingHistory ? JSON.parse(existingHistory) : [];
        history.unshift(purchaseData);
        localStorage.setItem(`purchase_history_${userId}`, JSON.stringify(history));
        
        console.log('✅ User purchase saved to user-specific collection');
    } catch (error) {
        console.debug('Purchase save to Firestore failed, using localStorage:', error);
        // Fallback to localStorage only
        const existingHistory = localStorage.getItem(`purchase_history_${userId}`);
        const history = existingHistory ? JSON.parse(existingHistory) : [];
        history.unshift(purchaseData);
        localStorage.setItem(`purchase_history_${userId}`, JSON.stringify(history));
    }
};

/**
 * Get user's purchase history from user-specific collection
 */
export const getUserPurchaseHistory = async (userId: string): Promise<any[]> => {
    try {
        // Try Firestore first
        const userPurchasesQuery = query(
            collection(db, 'userPurchases', userId, 'orders'),
            orderBy('createdAt', 'desc')
        );
        
        const querySnapshot = await getDocs(userPurchasesQuery);
        const firestorePurchases = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        if (firestorePurchases.length > 0) {
            // Sync to localStorage
            localStorage.setItem(`purchase_history_${userId}`, JSON.stringify(firestorePurchases));
            return firestorePurchases;
        }
    } catch (error) {
        console.debug('Could not fetch purchases from Firestore:', error);
    }
    
    // Fallback to localStorage
    try {
        const localHistory = localStorage.getItem(`purchase_history_${userId}`);
        return localHistory ? JSON.parse(localHistory) : [];
    } catch (error) {
        console.debug('Could not fetch purchases from localStorage:', error);
        return [];
    }
}; 