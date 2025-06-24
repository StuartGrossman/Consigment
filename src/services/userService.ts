import { db } from '../config/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, orderBy, limit } from 'firebase/firestore';
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
 * User-safe logging function that silently handles permission errors
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

        await addDoc(collection(db, 'userActions'), actionLog);
    } catch (error: any) {
        // Silently handle all errors for user actions to prevent disruption
        console.debug('User action logging skipped:', error?.code || 'unknown error');
    }
};

/**
 * Get user's own action history (user-safe)
 */
export const getUserActionHistory = async (userId: string): Promise<UserActionLog[]> => {
    try {
        const userActionsQuery = query(
            collection(db, 'userActions'),
            where('userId', '==', userId),
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
 * Subscribe to user's own actions (user-safe)
 */
export const subscribeToUserActions = (userId: string, callback: (actions: UserActionLog[]) => void): (() => void) => {
    try {
        const userActionsQuery = query(
            collection(db, 'userActions'),
            where('userId', '==', userId),
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
 * User-safe cart operations
 */
export const updateUserCart = async (userId: string, cartData: any): Promise<void> => {
    try {
        // Store cart in localStorage for user-side operations
        localStorage.setItem(`cart_${userId}`, JSON.stringify(cartData));
        
        // Also try to sync with Firestore if permissions allow
        try {
            await addDoc(collection(db, 'userCarts'), {
                userId,
                cartData,
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            // Silently fail if no permissions
            console.debug('Cart sync to Firestore skipped:', error);
        }
    } catch (error) {
        console.debug('Cart update failed:', error);
    }
};

/**
 * User-safe purchase history
 */
export const getUserPurchaseHistory = async (userId: string): Promise<any[]> => {
    try {
        // Try to get from localStorage first
        const localHistory = localStorage.getItem(`purchase_history_${userId}`);
        if (localHistory) {
            return JSON.parse(localHistory);
        }
        
        // Try Firestore if available (user-accessible collection)
        try {
            const purchasesQuery = query(
                collection(db, 'userPurchases'),
                where('userId', '==', userId),
                orderBy('purchaseDate', 'desc')
            );
            
            const querySnapshot = await getDocs(purchasesQuery);
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.debug('Firestore purchase history not accessible:', error);
            return [];
        }
    } catch (error) {
        console.debug('Could not fetch purchase history:', error);
        return [];
    }
};

/**
 * User-safe bookmark operations
 */
export const updateUserBookmarks = async (userId: string, bookmarks: string[]): Promise<void> => {
    try {
        // Store bookmarks locally
        localStorage.setItem(`bookmarks_${userId}`, JSON.stringify(bookmarks));
        
        // Log the action using user-safe logging
        await logUserActionSafe(
            { uid: userId } as AuthUser,
            'bookmarks_updated',
            `Updated bookmarks (${bookmarks.length} items)`
        );
    } catch (error) {
        console.debug('Bookmark update failed:', error);
    }
}; 