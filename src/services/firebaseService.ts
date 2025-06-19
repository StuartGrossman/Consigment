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
        const logsQuery = query(
            collection(db, 'actionLogs'), 
            orderBy('timestamp', 'desc')
        );
        const querySnapshot = await getDocs(logsQuery);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as ActionLog[];
    } catch (error) {
        console.error('Error getting action logs:', error);
        throw new Error('Failed to get action logs');
    }
};

export const subscribeToActionLogs = (callback: (logs: ActionLog[]) => void): (() => void) => {
    const logsQuery = query(
        collection(db, 'actionLogs'), 
        orderBy('timestamp', 'desc')
    );
    
    return onSnapshot(logsQuery, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as ActionLog[];
        callback(logs);
    }, (error) => {
        console.error('Error subscribing to action logs:', error);
    });
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