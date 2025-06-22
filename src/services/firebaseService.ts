import { db } from '../config/firebase';
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
        const actionLog: Omit<ActionLog, 'id'> = {
            userId: user.uid,
            userName: user.displayName || 'Anonymous',
            userEmail: user.email || '',
            action,
            details,
            timestamp: serverTimestamp(),
            itemId,
            itemTitle,
            userAgent: navigator.userAgent,
            isAdmin: user.email === 'stuartjamessmith@gmail.com'
        };

        await addDoc(collection(db, 'actionLogs'), actionLog);
    } catch (error) {
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
    } catch (error) {
        console.error('Error getting action logs:', error);
        throw new Error('Failed to get action logs');
    }
};

export const subscribeToActionLogs = (callback: (logs: ActionLog[]) => void): (() => void) => {
    try {
        console.log('Setting up action logs subscription...');
        
        // First try without orderBy in case there's an index issue
        let logsQuery;
        try {
            logsQuery = query(
                collection(db, 'actionLogs'), 
                orderBy('timestamp', 'desc')
            );
        } catch (indexError) {
            console.warn('Could not create ordered query, falling back to unordered:', indexError);
            logsQuery = query(collection(db, 'actionLogs'));
        }
        
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
            console.error('Error subscribing to action logs:', error);
            // Try a simple query without orderBy as fallback
            console.log('Attempting fallback query...');
            const fallbackQuery = query(collection(db, 'actionLogs'));
            return onSnapshot(fallbackQuery, (snapshot) => {
                try {
                    const logs = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    })) as ActionLog[];
                    callback(logs);
                } catch (fallbackError) {
                    console.error('Fallback query also failed:', fallbackError);
                    callback([]);
                }
            });
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