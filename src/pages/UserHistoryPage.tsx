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
            {/* User Analytics Content */}
            <div className="max-w-7xl mx-auto">
                <UserAnalytics user={user} />
            </div>
        </div>
    );
};

export default UserHistoryPage; 