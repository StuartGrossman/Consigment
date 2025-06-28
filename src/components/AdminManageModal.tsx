import React, { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { logUserAction } from '../services/firebaseService';
import { apiService } from '../services/apiService';
import NotificationModal from './NotificationModal';

interface AdminManageModalProps {
  onClose: () => void;
}

interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isAdmin: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
  ipAddress?: string;
}

const AdminManageModal: React.FC<AdminManageModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<UserRecord[]>([]);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationData, setNotificationData] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  // Helper function to show notifications
  const showNotificationModal = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    setNotificationData({ title, message, type });
    setShowNotification(true);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchQuery]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Get users from Firestore
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const userList: UserRecord[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          email: data.email,
          displayName: data.displayName || data.email?.split('@')[0] || 'Unknown User',
          photoURL: data.photoURL,
          isAdmin: data.isAdmin === true,
          createdAt: data.createdAt?.toDate() || new Date(),
          lastLoginAt: data.lastLoginAt?.toDate(),
          ipAddress: data.lastKnownIP || 'Unknown'
        };
      });

      setUsers(userList);
    } catch (error) {
      console.error('Error loading users:', error);
      showNotificationModal('Loading Error', 'Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
      return;
    }

    const searchLower = searchQuery.toLowerCase();
    const filtered = users.filter(user => 
      user.email.toLowerCase().includes(searchLower) ||
      user.displayName.toLowerCase().includes(searchLower)
    );
    setFilteredUsers(filtered);
  };

  const handleToggleAdmin = async (targetUser: UserRecord) => {
    if (targetUser.id === user?.uid) {
      showNotificationModal('Action Denied', 'You cannot modify your own admin status', 'warning');
      return;
    }

    const confirmMessage = targetUser.isAdmin 
      ? `Remove admin privileges from ${targetUser.displayName} (${targetUser.email})?`
      : `Grant admin privileges to ${targetUser.displayName} (${targetUser.email})?`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    setProcessingUserId(targetUser.id);
    try {
      // Update user in Firestore
      const userDoc = doc(db, 'users', targetUser.id);
      const newAdminStatus = !targetUser.isAdmin;
      
      await updateDoc(userDoc, {
        isAdmin: newAdminStatus,
        adminStatusChangedAt: new Date(),
        adminStatusChangedBy: user?.uid
      });

      // Log the action
      const actionDetails = newAdminStatus 
        ? `Granted admin privileges to ${targetUser.displayName} (${targetUser.email})`
        : `Removed admin privileges from ${targetUser.displayName} (${targetUser.email})`;
      
      await logUserAction(user, 'admin_action', actionDetails);

      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === targetUser.id 
          ? { ...u, isAdmin: newAdminStatus }
          : u
      ));

      showNotificationModal('Success', `Admin status updated successfully for ${targetUser.displayName}`, 'success');
    } catch (error) {
      console.error('Error updating admin status:', error);
      showNotificationModal('Update Error', 'Failed to update admin status', 'error');
    } finally {
      setProcessingUserId(null);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-center mt-4">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-blue-600">👑 Admin Management</h2>
              <p className="text-gray-600 mt-1">Manage user admin privileges</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users by email or name..."
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="text-sm text-gray-500 flex items-center">
              {filteredUsers.length} users found ({users.filter(u => u.isAdmin).length} admins)
            </div>
          </div>
        </div>

        {/* Users List */}
        <div className="overflow-y-auto max-h-[calc(90vh-250px)]">
          <div className="divide-y divide-gray-200">
            {filteredUsers.map((userRecord) => (
              <div key={userRecord.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {userRecord.photoURL ? (
                        <img
                          src={userRecord.photoURL}
                          alt={userRecord.displayName}
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-gray-600 text-sm font-medium">
                            {userRecord.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {userRecord.displayName}
                        </p>
                        {userRecord.isAdmin && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            👑 Admin
                          </span>
                        )}
                        {userRecord.id === user?.uid && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{userRecord.email}</p>
                      <div className="flex items-center space-x-4 mt-1 text-xs text-gray-400">
                        <span>Joined: {formatDate(userRecord.createdAt)}</span>
                        {userRecord.lastLoginAt && (
                          <span>Last login: {formatDate(userRecord.lastLoginAt)}</span>
                        )}
                        <span>IP: {userRecord.ipAddress}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center space-x-3">
                    {userRecord.id !== user?.uid && (
                      <button
                        onClick={() => handleToggleAdmin(userRecord)}
                        disabled={processingUserId === userRecord.id}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          userRecord.isAdmin
                            ? 'bg-red-500 hover:bg-red-600 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        {processingUserId === userRecord.id ? (
                          <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            <span>Processing...</span>
                          </div>
                        ) : userRecord.isAdmin ? (
                          'Remove Admin'
                        ) : (
                          'Make Admin'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-500">
                {searchQuery ? 'No users found matching your search' : 'No users found'}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <div>
              Total Users: {users.length} | 
              Admins: {users.filter(u => u.isAdmin).length} | 
              Regular Users: {users.filter(u => !u.isAdmin).length}
            </div>
            <button
              onClick={() => loadUsers()}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Notification Modal */}
        <NotificationModal
          isOpen={showNotification}
          onClose={() => setShowNotification(false)}
          title={notificationData.title}
          message={notificationData.message}
          type={notificationData.type}
        />
      </div>
    </div>
  );
};

export default AdminManageModal; 