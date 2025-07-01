import React from 'react';
import { User } from 'firebase/auth';
import Analytics from '../components/Analytics';
import UserAnalytics from '../components/UserAnalytics';

interface AnalyticsPageProps {
    user: User | null;
    isAdmin: boolean;
    onNavigateBack: () => void;
}

const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ user, isAdmin, onNavigateBack }) => {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Simple Navigation Header */}
            <div className="w-full bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg">
                                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-9 7-6-2 1-14z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold text-gray-900">Summit Gear Exchange</h1>
                                <p className="text-xs text-gray-500">
                                    {isAdmin ? 'Sales Dashboard' : 'My User History'}
                                </p>
                            </div>
                        </div>
                        
                        {/* Back Button */}
                        <button
                            onClick={onNavigateBack}
                            className="bg-gray-500 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm sm:text-base flex-shrink-0"
                        >
                            <span className="hidden sm:inline">Back to Store</span>
                            <span className="sm:hidden">Back</span>
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Dashboard Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {isAdmin ? (
                    <Analytics user={user} isAdmin={isAdmin} />
                ) : (
                    <UserAnalytics user={user} />
                )}
            </div>
        </div>
    );
};

export default AnalyticsPage; 