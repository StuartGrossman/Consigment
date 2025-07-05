import React, { useState, useEffect } from 'react';
import { AuthUser } from '../types';
import { subscribeToActionLogs, ActionLog, logUserAction, getActionLogs } from '../services/firebaseService';
import UserAnalyticsModal from './UserAnalyticsModal';
import AdminBanModal from './AdminBanModal';
import AdminManageModal from './AdminManageModal';

interface ActionsDashboardProps {
  user: AuthUser | null;
  isAdmin: boolean;
}

const ActionsDashboard: React.FC<ActionsDashboardProps> = ({ user, isAdmin }) => {
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [filteredActions, setFilteredActions] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [userTypeFilter, setUserTypeFilter] = useState('all'); // New filter for admin/user
  const [timeFilter, setTimeFilter] = useState('24h');
  const [showUserAnalytics, setShowUserAnalytics] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [showAdminManageModal, setShowAdminManageModal] = useState(false);



  useEffect(() => {
    console.log('ActionsDashboard useEffect triggered, timeFilter:', timeFilter);
    setLoading(true);
    
    // Log that the dashboard was accessed - but handle permission errors gracefully
    if (user) {
      console.log('Logging dashboard access for user:', user.displayName);
      logUserAction(user, 'dashboard_viewed', 'Accessed Actions Dashboard').catch(error => {
        // Silent handling of permission errors for action logging
        if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
          console.log('📍 Action logging not available due to permissions');
          return;
        }
        console.warn('Failed to log dashboard access:', error);
      });
    }
    
    // Subscribe to real-time action logs with proper error handling
    console.log('Setting up subscription to action logs...');
    let hasReceivedData = false;
    
    const unsubscribe = subscribeToActionLogs((logs) => {
      try {
        hasReceivedData = true;
        console.log('ActionsDashboard received action logs from Firebase:', logs.length);
        
        // If no logs from Firebase, just show empty state
        if (logs.length === 0) {
          console.log('No action logs found in Firebase database');
          setActions([]);
          setLoading(false);
          return;
        }
        
        // Convert Firebase timestamps to Date objects
        const processedLogs = logs.map(log => {
          const timestamp = log.timestamp?.toDate ? log.timestamp.toDate() : new Date();
          console.log('Processing log:', log.id, log.action, 'timestamp:', timestamp);
          return {
            ...log,
            timestamp
          };
        });
        
        // Filter by time
        const timeThreshold = getTimeThreshold();
        console.log('Time threshold for filtering:', new Date(timeThreshold));
        const filteredByTime = processedLogs.filter(action => 
          action.timestamp.getTime() >= timeThreshold
        );
        
        console.log('Filtered actions by time:', filteredByTime.length, 'out of', processedLogs.length);
        setActions(filteredByTime);
        setLoading(false);
      } catch (error) {
        console.error('Error processing action logs:', error);
        setActions([]);
        setLoading(false);
      }
    });

    // Handle potential connection errors with timeout
    const timeoutId = setTimeout(() => {
      if (loading && !hasReceivedData) {
        console.log('📍 Action logs subscription timeout - likely permission issue');
        setActions([]);
        setLoading(false);
      }
    }, 5000); // Reduced to 5 seconds for faster fallback

    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
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
      case '1d':
        return now.getTime() - (1000 * 60 * 60 * 24);
      case '3d':
        return now.getTime() - (1000 * 60 * 60 * 24 * 3);
      case '1w':
        return now.getTime() - (1000 * 60 * 60 * 24 * 7);
      case '1m':
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
        (action.userName && action.userName.toLowerCase().includes(searchLower)) ||
        (action.userEmail && action.userEmail.toLowerCase().includes(searchLower)) ||
        (action.action && action.action.toLowerCase().includes(searchLower)) ||
        (action.details && action.details.toLowerCase().includes(searchLower)) ||
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
      case 'shipping_label_generated': return '📦';
      case 'item_shipped': return '🚚';
      case 'admin_action': return '🚫';
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
      case 'shipping_label_generated': return 'bg-blue-100 text-blue-800';
      case 'item_shipped': return 'bg-green-100 text-green-800';
      case 'admin_action': return 'bg-red-100 text-red-800';
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

  // Function to generate engagement chart data
  const generateEngagementData = () => {
    const timeSlots: { [key: string]: { admin: number; user: number; time: string } } = {};
    let interval = 1; // hours
    let formatPattern = 'hour';
    let numSlots = 12;
    
    switch (timeFilter) {
      case '1h':
        interval = 0.1; // 6 minutes
        formatPattern = 'minute';
        numSlots = 10;
        break;
      case '24h':
      case '1d':
        interval = 2; // 2 hours
        formatPattern = 'hour';
        numSlots = 12;
        break;
      case '3d':
        interval = 6; // 6 hours
        formatPattern = 'hour';
        numSlots = 12;
        break;
      case '1w':
        interval = 24; // 1 day
        formatPattern = 'day';
        numSlots = 7;
        break;
      case '1m':
        interval = 24 * 2.5; // ~2.5 days
        formatPattern = 'day';
        numSlots = 12;
        break;
    }

    const now = new Date();
    const timeThreshold = getTimeThreshold();
    
    // Create time slots
    const intervalMs = interval * 60 * 60 * 1000;
    for (let i = 0; i < numSlots; i++) {
      const slotTime = new Date(timeThreshold + (i * intervalMs));
      let timeKey: string;
      
      if (formatPattern === 'minute') {
        timeKey = slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (formatPattern === 'hour') {
        timeKey = slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        timeKey = slotTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
      
      timeSlots[slotTime.getTime()] = { admin: 0, user: 0, time: timeKey };
    }

    // Count actions in each time slot with better admin detection
    actions.forEach(action => {
      const actionTime = action.timestamp.getTime();
      if (actionTime >= timeThreshold && actionTime <= now.getTime()) {
        const slotIndex = Math.floor((actionTime - timeThreshold) / intervalMs);
        const slotKey = timeThreshold + (slotIndex * intervalMs);
        
        if (timeSlots[slotKey]) {
          // Enhanced admin action detection
          const isAdminAction = action.isAdmin === true || 
                              action.action?.includes('admin') ||
                              action.action?.includes('approve') ||
                              action.action?.includes('reject') ||
                              action.action?.includes('bulk') ||
                              action.action?.includes('edit') ||
                              action.action?.includes('status_update') ||
                              action.action?.includes('ban') ||
                              action.action?.includes('manage');
          
          if (isAdminAction) {
            timeSlots[slotKey].admin++;
          } else {
            timeSlots[slotKey].user++;
          }
        }
      }
    });

    return Object.values(timeSlots);
  };

  const engagementData = generateEngagementData();

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
        <div className="flex items-center gap-4">
          {isAdmin && (
            <>
              <button
                onClick={() => setShowBanModal(true)}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                </svg>
                🚫 Ban Management
              </button>
              <button
                onClick={() => setShowAdminManageModal(true)}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                👑 Make Admin or Remove
              </button>

              <button
                onClick={() => setShowUserAnalytics(true)}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                                User Analytics
              </button>
              <button
                onClick={async () => {
                  console.log('Manual fetch of action logs...');
                  setLoading(true);
                  try {
                    const logs = await getActionLogs();
                    console.log('Manual fetch successful:', logs.length, 'logs');
                    // Process the logs the same way as the subscription
                    const processedLogs = logs.map(log => ({
                      ...log,
                      timestamp: log.timestamp?.toDate ? log.timestamp.toDate() : new Date()
                    }));
                    const timeThreshold = getTimeThreshold();
                    const filteredByTime = processedLogs.filter(action => 
                      action.timestamp.getTime() >= timeThreshold
                    );
                    setActions(filteredByTime);
                    setLoading(false);
                  } catch (error: any) {
                    // Handle permission errors silently
                    if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
                      console.log('📍 Manual fetch not available due to permissions');
                      setActions([]);
                      setLoading(false);
                      return;
                    }
                    console.error('Manual fetch failed:', error);
                    setActions([]);
                    setLoading(false);
                  }
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Data
              </button>
              </>
            )}
          <div className="text-sm text-gray-500">
            Total: {actions.length} actions | Filtered: {filteredActions.length} actions
            {userTypeFilter === 'admin' && ` | Admin Actions Only`}
            {userTypeFilter === 'user' && ` | User Actions Only`}
          </div>
        </div>
      </div>

      {/* Prominent Search Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-xl shadow-lg border p-6 sm:p-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-4">
              Search Actions & Users
            </h2>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users, actions, items, emails..."
                className="w-full pl-12 pr-12 py-4 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center hover:bg-gray-50 rounded-r-lg transition-colors"
                >
                  <svg className="h-6 w-6 text-gray-400 hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {searchQuery && (
              <div className="mt-3 text-center">
                <p className="text-sm text-gray-600">
                  Searching through user names, emails, actions, and item details
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Filter Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

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
              <option value="shipping_label_generated">Shipping Label Generated</option>
              <option value="item_shipped">Item Shipped</option>
              <option value="user_login">User Login</option>
              <option value="bulk_action">Bulk Actions</option>
              <option value="item_bookmarked">Item Bookmarked</option>
              <option value="cart_updated">Cart Updated</option>
              <option value="admin_action">Admin Actions</option>
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
              <option value="1d">Last Day</option>
              <option value="3d">Last 3 Days</option>
              <option value="1w">Last Week</option>
              <option value="1m">Last Month</option>
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
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

      {/* User Engagement Chart */}
      <div className="bg-white rounded-lg border p-6">
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">User Engagement Over Time</h3>
          <p className="text-sm text-gray-600">Activity levels for admin and regular users</p>
        </div>
        
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded"></div>
              <span className="text-sm text-gray-700">Admin Actions</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-sm text-gray-700">User Actions</span>
            </div>
          </div>

          {/* Enhanced User Engagement Chart */}
          <div className="relative h-80 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-6 shadow-sm">
            {engagementData.length > 0 ? (
              <div className="h-full flex items-end justify-between gap-2">
                {engagementData.map((dataPoint, index) => {
                  const maxValue = Math.max(...engagementData.map(d => Math.max(d.admin, d.user))) || 1;
                  const adminHeight = Math.max((dataPoint.admin / maxValue) * 100, 2);
                  const userHeight = Math.max((dataPoint.user / maxValue) * 100, 2);
                  
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center gap-2 group">
                      {/* Bars Container */}
                      <div className="relative w-full flex justify-center items-end h-52 gap-1">
                        {/* Admin bar */}
                        <div 
                          className="bg-gradient-to-t from-red-600 to-red-400 rounded-t-md w-4 transition-all duration-500 hover:from-red-700 hover:to-red-500 transform hover:scale-105 shadow-sm border border-red-200 group-hover:shadow-md"
                          style={{ 
                            height: `${adminHeight}%`,
                            minHeight: dataPoint.admin > 0 ? '8px' : '0px'
                          }}
                          title={`Admin: ${dataPoint.admin} actions at ${dataPoint.time}`}
                        >
                          {/* Value label on hover */}
                          {dataPoint.admin > 0 && (
                            <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-red-700 text-white text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                              {dataPoint.admin}
                            </div>
                          )}
                        </div>
                        
                        {/* User bar */}
                        <div 
                          className="bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md w-4 transition-all duration-500 hover:from-blue-700 hover:to-blue-500 transform hover:scale-105 shadow-sm border border-blue-200 group-hover:shadow-md"
                          style={{ 
                            height: `${userHeight}%`,
                            minHeight: dataPoint.user > 0 ? '8px' : '0px'
                          }}
                          title={`Users: ${dataPoint.user} actions at ${dataPoint.time}`}
                        >
                          {/* Value label on hover */}
                          {dataPoint.user > 0 && (
                            <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-blue-700 text-white text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                              {dataPoint.user}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Time label with better styling */}
                      <div className="text-xs text-gray-600 font-medium transform -rotate-45 whitespace-nowrap group-hover:text-gray-800 transition-colors duration-200 bg-white/80 px-1 py-0.5 rounded">
                        {dataPoint.time}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center p-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <div className="text-5xl mb-4 opacity-60">📊</div>
                  <div className="text-lg font-medium text-gray-700 mb-2">No engagement data available</div>
                  <div className="text-sm text-gray-500">Actions will appear here as users interact with the system</div>
                  <div className="text-xs text-gray-400 mt-2">Try adjusting the time range or check if there's recent activity</div>
                </div>
              </div>
            )}
            
            {/* Enhanced Y-axis labels */}
            {engagementData.length > 0 && (
              <div className="absolute left-2 top-6 bottom-16 flex flex-col justify-between text-xs text-gray-500 font-medium">
                <div className="flex items-center">
                  <span className="bg-white px-1 py-0.5 rounded border border-gray-200 shadow-sm">
                    {Math.max(...engagementData.map(d => Math.max(d.admin, d.user)))}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="bg-white px-1 py-0.5 rounded border border-gray-200 shadow-sm">
                    {Math.floor(Math.max(...engagementData.map(d => Math.max(d.admin, d.user))) / 2)}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="bg-white px-1 py-0.5 rounded border border-gray-200 shadow-sm">0</span>
                </div>
              </div>
            )}
            
            {/* Grid lines for better readability */}
            {engagementData.length > 0 && (
              <div className="absolute inset-6 pointer-events-none">
                <div className="h-full w-full">
                  {/* Horizontal grid lines */}
                  <div className="absolute inset-0 flex flex-col justify-between">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="border-t border-gray-200 border-dashed opacity-50"></div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Summary Stats for Chart */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">
                {engagementData.reduce((sum, d) => sum + d.admin, 0)}
              </div>
              <div className="text-xs text-gray-600">Total Admin Actions</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">
                {engagementData.reduce((sum, d) => sum + d.user, 0)}
              </div>
              <div className="text-xs text-gray-600">Total User Actions</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">
                {engagementData.length > 0 ? Math.round(engagementData.reduce((sum, d) => sum + d.admin + d.user, 0) / engagementData.length) : 0}
              </div>
              <div className="text-xs text-gray-600">Avg Actions/Period</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-purple-600">
                {Math.max(...engagementData.map(d => d.admin + d.user), 0)}
              </div>
              <div className="text-xs text-gray-600">Peak Activity</div>
            </div>
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
              {actions.length === 0 ? (
                <div className="space-y-2">
                  <div>No actions found for this time period</div>
                  <div className="text-sm text-gray-400">
                    📍 Action logging may require additional permissions
                  </div>
                </div>
              ) : (
                'No actions match your filters'
              )}
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

      {/* User Analytics Modal */}
      <UserAnalyticsModal
        isOpen={showUserAnalytics}
        onClose={() => setShowUserAnalytics(false)}
        user={user}
        isAdmin={isAdmin}
      />

      {/* Ban Management Modal */}
      {showBanModal && (
        <AdminBanModal
          onClose={() => setShowBanModal(false)}
        />
      )}

      {/* Admin Management Modal */}
      {showAdminManageModal && (
        <AdminManageModal
          onClose={() => setShowAdminManageModal(false)}
        />
      )}


    </div>
  );
};

export default ActionsDashboard; 