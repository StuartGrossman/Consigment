import React, { useState, useEffect } from 'react';
import { saveMessage, getMessages, subscribeToMessages, Message } from '../services/firebaseService';

const MessageBoard: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        // Check online status
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        setIsOffline(!navigator.onLine);

        // Load initial messages
        const loadMessages = async () => {
            try {
                const initialMessages = await getMessages();
                setMessages(initialMessages);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load messages');
            } finally {
                setLoading(false);
            }
        };

        loadMessages();

        // Subscribe to real-time updates
        const unsubscribe = subscribeToMessages((updatedMessages) => {
            setMessages(updatedMessages);
            setError(null);
        });

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            unsubscribe();
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        try {
            setLoading(true);
            await saveMessage({
                content: newMessage,
                timestamp: new Date().toISOString()
            });
            setNewMessage('');
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save message');
        } finally {
            setLoading(false);
        }
    };

    if (loading && messages.length === 0) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto p-4">
            {isOffline && (
                <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4" role="alert">
                    <p>You are offline. Messages will be synced when you reconnect.</p>
                </div>
            )}
            
            {error && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">
                    <p>{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="mb-6">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={loading || isOffline}
                    />
                    <button
                        type="submit"
                        disabled={loading || isOffline || !newMessage.trim()}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Sending...' : 'Send'}
                    </button>
                </div>
            </form>

            <div className="space-y-4">
                {messages.map((message) => (
                    <div
                        key={message.id}
                        className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
                    >
                        <p className="text-gray-800">{message.content}</p>
                        <p className="text-sm text-gray-500 mt-2">
                            {new Date(message.timestamp).toLocaleString()}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MessageBoard; 