import { db, auth } from '../config/firebase';
import { collection, addDoc, getDocs, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { AuthUser } from '../types';

export interface Message {
    id?: string;
    text: string;
    timestamp: Date;
}

export interface ActionLog {
    id?: string;
    userId: string;
    userName: string;
    userEmail: string;
    action: string;
    details: string;
    timestamp: any; // serverTimestamp
    itemId?: string;
    itemTitle?: string;
    ipAddress?: string;
    userAgent?: string;
    isAdmin?: boolean;
}

export const logUserAction = async (
    user: AuthUser | null,
    action: string,
    details: string,
    itemId?: string,
    itemTitle?: string
): Promise<void> => {
    if (!user) return;

    try {
        // Enhanced user identification for phone users
        let userName = 'Anonymous';
        let userEmail = '';
        
        if (user.displayName) {
            userName = user.displayName;
        } else if (user.phoneNumber) {
            // For phone users, use their phone number as display name
            userName = user.phoneNumber;
        } else if (user.email) {
            // For email users without display name, use email prefix
            userName = user.email.split('@')[0];
        }
        
        if (user.email) {
            userEmail = user.email;
        } else if (user.phoneNumber) {
            // For phone-only users, use phone number as identifier
            userEmail = user.phoneNumber;
        }

        const actionLog: Omit<ActionLog, 'id'> = {
            userId: user.uid,
            userName: userName,
            userEmail: userEmail,
            action,
            details,
            timestamp: serverTimestamp(),
            userAgent: navigator.userAgent,
            isAdmin: user.email === 'stuartjamessmith@gmail.com'
        };

        // Only add itemId and itemTitle if they are provided and not undefined
        if (itemId !== undefined && itemId !== null) {
            actionLog.itemId = itemId;
        }
        
        if (itemTitle !== undefined && itemTitle !== null) {
            actionLog.itemTitle = itemTitle;
        }

        await addDoc(collection(db, 'actionLogs'), actionLog);
    } catch (error: any) {
        // Silent fallback for permission errors - don't log to console
        if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
            return; // Fail silently for permission issues
        }
        console.error('Error logging user action:', error);
        // Don't throw error to avoid disrupting user experience
    }
};

export const getActionLogs = async (): Promise<ActionLog[]> => {
    try {
        console.log('Attempting to fetch action logs...');
        let logsQuery;
        
        try {
            // Try with orderBy first
            logsQuery = query(
                collection(db, 'actionLogs'), 
                orderBy('timestamp', 'desc')
            );
        } catch (indexError) {
            console.warn('Could not create ordered query, using simple query:', indexError);
            logsQuery = query(collection(db, 'actionLogs'));
        }
        
        const querySnapshot = await getDocs(logsQuery);
        console.log('Retrieved', querySnapshot.docs.length, 'action log documents');
        
        const logs = querySnapshot.docs.map(doc => {
            const data = doc.data();
            console.log('Retrieved log:', doc.id, data.action, data.timestamp);
            return {
                id: doc.id,
                ...data
            };
        }) as ActionLog[];
        
        // Sort manually if we couldn't use orderBy
        logs.sort((a, b) => {
            const aTime = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
            const bTime = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
            return bTime - aTime;
        });
        
        return logs;
    } catch (error: any) {
        // Handle permission errors silently
        if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
            console.log('📍 Action logs fetch not available due to permissions');
            return []; // Return empty array for permission issues
        }
        console.error('Error getting action logs:', error);
        throw new Error('Failed to get action logs');
    }
};

export const subscribeToActionLogs = (callback: (logs: ActionLog[]) => void): (() => void) => {
    try {
        console.log('Setting up action logs subscription...');
        console.log('Current user:', auth.currentUser?.uid, auth.currentUser?.email);
        
        // Use a simple query without orderBy to avoid index issues
        const logsQuery = query(collection(db, 'actionLogs'));
        
        return onSnapshot(logsQuery, (snapshot) => {
            try {
                console.log('Received snapshot with', snapshot.docs.length, 'documents');
                const logs = snapshot.docs.map(doc => {
                    const data = doc.data();
                    console.log('Processing log:', doc.id, data.action, data.timestamp);
                    return {
                        id: doc.id,
                        ...data
                    };
                }) as ActionLog[];
                
                // Sort manually if we couldn't use orderBy
                logs.sort((a, b) => {
                    const aTime = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
                    const bTime = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
                    return bTime - aTime;
                });
                
                console.log('Calling callback with', logs.length, 'processed logs');
                callback(logs);
            } catch (error) {
                console.error('Error processing action logs snapshot:', error);
                callback([]); // Return empty array on error
            }
        }, (error) => {
            // Silent handling of permission errors to prevent console spam
            if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
                console.log('📍 Action logs subscription not available due to permissions');
                callback([]); // Return empty array for permission issues
                return;
            }
            console.error('Error subscribing to action logs:', error);
            console.error('Error details:', error.code, error.message);
            console.log('User auth state:', auth.currentUser ? 'authenticated' : 'not authenticated');
            
            // Return empty array on error
            callback([]);
        });
    } catch (error) {
        console.error('Error setting up action logs subscription:', error);
        // Return a no-op unsubscribe function
        return () => {};
    }
};

export const saveMessage = async (message: Message): Promise<void> => {
    try {
        await addDoc(collection(db, 'test'), {
            text: message.text,
            timestamp: message.timestamp
        });
    } catch (error) {
        console.error('Error saving message:', error);
        throw new Error('Failed to save message');
    }
};

export const getMessages = async (): Promise<Message[]> => {
    try {
        const messagesQuery = query(collection(db, 'test'), orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(messagesQuery);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Message[];
    } catch (error) {
        console.error('Error getting messages:', error);
        throw new Error('Failed to get messages');
    }
};

export const subscribeToMessages = (callback: (messages: Message[]) => void): (() => void) => {
    const messagesQuery = query(collection(db, 'test'), orderBy('timestamp', 'desc'));
    
    return onSnapshot(messagesQuery, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Message[];
        callback(messages);
    }, (error) => {
        console.error('Error subscribing to messages:', error);
    });
}; 