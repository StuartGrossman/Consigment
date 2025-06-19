import React, { useState, useEffect } from 'react';
import { AuthUser } from '../types';
import { subscribeToActionLogs, ActionLog } from '../services/firebaseService';

interface ActionsDashboardProps {
  user: AuthUser | null;
  isAdmin: boolean;
}

const ActionsDashboard: React.FC<ActionsDashboardProps> = () => {
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [filteredActions, setFilteredActions] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [userTypeFilter, setUserTypeFilter] = useState('all'); // New filter for admin/user
  const [timeFilter, setTimeFilter] = useState('24h');

  useEffect(() => {
    // Subscribe to real-time action logs
    const unsubscribe = subscribeToActionLogs((logs) => {
      // Convert Firebase timestamps to Date objects
      const processedLogs = logs.map(log => ({
        ...log,
        timestamp: log.timestamp?.toDate ? log.timestamp.toDate() : new Date()
      }));
      
      // Filter by time
      const timeThreshold = getTimeThreshold();
      const filteredByTime = processedLogs.filter(action => 
        action.timestamp.getTime() >= timeThreshold
      );
      
      setActions(filteredByTime);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [timeFilter]);

  useEffect(() => {
    filterActions();
  }, [actions, searchQuery, actionFilter, userTypeFilter]);



  const getTimeThreshold = () => {
    const now = new Date();
    switch (timeFilter) {
      case '1h':
        return now.getTime() - (1000 * 60 * 60);
      case '24h':
        return now.getTime() - (1000 * 60 * 60 * 24);
      case '7d':
        return now.getTime() - (1000 * 60 * 60 * 24 * 7);
      case '30d':
        return now.getTime() - (1000 * 60 * 60 * 24 * 30);
      default:
        return 0;
    }
  };

  const filterActions = () => {
    let filtered = [...actions];

    // Apply action type filter
    if (actionFilter !== 'all') {
      filtered = filtered.filter(action => action.action === actionFilter);
    }

    // Apply user type filter
    if (userTypeFilter !== 'all') {
      if (userTypeFilter === 'admin') {
        filtered = filtered.filter(action => action.isAdmin === true);
      } else if (userTypeFilter === 'user') {
        filtered = filtered.filter(action => action.isAdmin !== true);
      }
    }

    // Apply search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter(action => 
        action.userName.toLowerCase().includes(searchLower) ||
        action.userEmail.toLowerCase().includes(searchLower) ||
        action.action.toLowerCase().includes(searchLower) ||
        action.details.toLowerCase().includes(searchLower) ||
        (action.itemTitle && action.itemTitle.toLowerCase().includes(searchLower))
      );
    }

    setFilteredActions(filtered);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'item_listed': return '📝';
      case 'item_approved': return '✅';
      case 'item_purchased': return '🛒';
      case 'item_sold': return '💰';
      case 'item_archived': return '📦';
      case 'item_discounted': return '🏷️';
      case 'bulk_discount': return '💸';
      case 'user_login': return '🔐';
      case 'user_logout': return '🚪';
      case 'bulk_action': return '⚡';
      case 'item_bookmarked': return '❤️';
      case 'cart_updated': return '🛍️';
      case 'status_changed': return '🔄';
      case 'barcode_generated': return '📊';
      default: return '📊';
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'item_listed': return 'bg-blue-100 text-blue-800';
      case 'item_approved': return 'bg-green-100 text-green-800';
      case 'item_purchased': return 'bg-purple-100 text-purple-800';
      case 'item_sold': return 'bg-yellow-100 text-yellow-800';
      case 'item_archived': return 'bg-gray-100 text-gray-800';
      case 'item_discounted': return 'bg-orange-100 text-orange-800';
      case 'bulk_discount': return 'bg-red-100 text-red-800';
      case 'user_login': return 'bg-indigo-100 text-indigo-800';
      case 'user_logout': return 'bg-red-100 text-red-800';
      case 'bulk_action': return 'bg-orange-100 text-orange-800';
      case 'item_bookmarked': return 'bg-pink-100 text-pink-800';
      case 'cart_updated': return 'bg-teal-100 text-teal-800';
      case 'status_changed': return 'bg-cyan-100 text-cyan-800';
      case 'barcode_generated': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffTime = now.getTime() - timestamp.getTime();
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Actions Dashboard</h1>
          <p className="text-gray-600">Track all user and admin activities</p>
        </div>
        <div className="text-sm text-gray-500">
          Total: {actions.length} actions | Filtered: {filteredActions.length} actions
          {userTypeFilter === 'admin' && ` | Admin Actions Only`}
          {userTypeFilter === 'user' && ` | User Actions Only`}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users, actions, items..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Action Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Action Type</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Actions</option>
              <option value="item_listed">Item Listed</option>
              <option value="item_approved">Item Approved</option>
              <option value="item_purchased">Item Purchased</option>
              <option value="item_sold">Item Sold</option>
              <option value="item_archived">Item Archived</option>
              <option value="item_discounted">Item Discounted</option>
              <option value="bulk_discount">Bulk Discount</option>
              <option value="status_changed">Status Changed</option>
              <option value="barcode_generated">Barcode Generated</option>
              <option value="user_login">User Login</option>
              <option value="bulk_action">Bulk Actions</option>
              <option value="item_bookmarked">Item Bookmarked</option>
              <option value="cart_updated">Cart Updated</option>
            </select>
          </div>

          {/* User Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">User Type</label>
            <select
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Users</option>
              <option value="admin">Admin Only</option>
              <option value="user">Users Only</option>
            </select>
          </div>

          {/* Time Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          {/* Export Button */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Export</label>
            <button
              onClick={() => {
                // TODO: Implement CSV export
                console.log('Export actions to CSV');
              }}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors text-sm"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Actions List */}
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {filteredActions.map((action) => (
            <div key={action.id} className="p-6 hover:bg-gray-50">
              <div className="flex items-start space-x-4">
                {/* Action Icon */}
                <div className="flex-shrink-0">
                  <div className="text-2xl">
                    {getActionIcon(action.action)}
                  </div>
                </div>

                {/* Action Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(action.action)}`}>
                      {action.action.replace('_', ' ')}
                    </span>
                    {action.isAdmin && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        👑 Admin
                      </span>
                    )}
                    <span className="text-sm text-gray-500">
                      {formatTimeAgo(action.timestamp)}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-900 mb-1">
                    <span className="font-medium">
                      {action.isAdmin && <span className="text-red-600">👑 </span>}
                      {action.userName}
                    </span>
                    <span className="text-gray-500"> ({action.userEmail})</span>
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    {action.details}
                    {action.itemTitle && (
                      <span className="font-medium text-gray-900"> • {action.itemTitle}</span>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="flex-shrink-0 text-sm text-gray-500">
                  {action.timestamp.toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredActions.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-500">
              {actions.length === 0 ? 'No actions found for this time period' : 'No actions match your filters'}
            </div>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <div className="text-2xl font-bold text-gray-900">
            {actions.filter(a => a.action.includes('item_')).length}
          </div>
          <div className="text-sm text-gray-600">Item Actions</div>
        </div>
        
        <div className="bg-white rounded-lg border p-6">
          <div className="text-2xl font-bold text-red-600">
            {actions.filter(a => a.isAdmin === true).length}
          </div>
          <div className="text-sm text-gray-600">Admin Actions</div>
        </div>
        
        <div className="bg-white rounded-lg border p-6">
          <div className="text-2xl font-bold text-blue-600">
            {actions.filter(a => a.isAdmin !== true).length}
          </div>
          <div className="text-sm text-gray-600">User Actions</div>
        </div>
        
        <div className="bg-white rounded-lg border p-6">
          <div className="text-2xl font-bold text-gray-900">
            {new Set(actions.map(a => a.userId)).size}
          </div>
          <div className="text-sm text-gray-600">Active Users</div>
        </div>
      </div>
    </div>
  );
};

export default ActionsDashboard; 