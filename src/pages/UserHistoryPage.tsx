import React from 'react';
import { User } from 'firebase/auth';
import UserAnalytics from '../components/UserAnalytics';
import UserPurchases from '../components/UserPurchases';

interface UserHistoryPageProps {
    user: User | null;
    onNavigateBack: () => void;
}

const UserHistoryPage: React.FC<UserHistoryPageProps> = ({ user, onNavigateBack }) => {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Simple Navigation Header */}
            <div className="w-full bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <span className="text-xl font-bold text-gray-900">Consignment Store</span>
                        </div>

                        {/* Page Title */}
                        <div className="flex-1 text-center">
                            <h1 className="text-lg font-semibold text-gray-900">My User History</h1>
                        </div>

                        {/* Back Button */}
                        <button
                            onClick={onNavigateBack}
                            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm flex-shrink-0"
                        >
                            Back to Store
                        </button>
                    </div>
                </div>
            </div>

            {/* User Analytics Content */}
            <div className="max-w-7xl mx-auto">
                <UserAnalytics user={user} />
            </div>
        </div>
    );
};

export default UserHistoryPage; 