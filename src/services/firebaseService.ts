import { db } from '../config/firebase';
import { collection, addDoc, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';

export interface Message {
    id?: string;
    text: string;
    timestamp: Date;
}

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