import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { AuthUser } from '../types';
import { subscribeToActionLogs, ActionLog, logUserAction, getActionLogs } from '../services/firebaseService';
import UserAnalyticsModal from './UserAnalyticsModal';
import AdminBanModal from './AdminBanModal';
import AdminManageModal from './AdminManageModal';
import { VirtualizedList, useVirtualizedList } from './VirtualizedList';

interface OptimizedActionsDashboardProps {
  user: AuthUser | null;
  isAdmin: boolean;
}

// Memoized action item component
const ActionItem = memo(({ action, index }: { action: ActionLog; index: number }) => {
  const formatTime = useCallback((date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

  const formatDate = useCallback((date: Date) => {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }, []);

  const getActionColor = useCallback((actionType: string) => {
    if (actionType.includes('admin') || actionType.includes('approve') || actionType.includes('reject')) {
      return 'text-red-600 bg-red-50 border-red-200';
    }
    if (actionType.includes('purchase') || actionType.includes('buy')) {
      return 'text-green-600 bg-green-50 border-green-200';
    }
    if (actionType.includes('view') || actionType.includes('browse')) {
      return 'text-blue-600 bg-blue-50 border-blue-200';
    }
    return 'text-gray-600 bg-gray-50 border-gray-200';
  }, []);

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-shadow">
      <div className="flex-shrink-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${getActionColor(action.action)}`}>
          {action.isAdmin ? 'A' : 'U'}
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900 truncate">
            {action.userName || action.userId}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{formatTime(action.timestamp)}</span>
            <span>•</span>
            <span>{formatDate(action.timestamp)}</span>
          </div>
        </div>
        
        <p className="text-sm text-gray-600 mt-1">
          {action.description || action.action}
        </p>
        
        {action.details && (
          <p className="text-xs text-gray-500 mt-1 truncate">
            {action.details}
          </p>
        )}
      </div>
    </div>
  );
});

ActionItem.displayName = 'ActionItem';

// Memoized chart component
const EngagementChart = memo(({ data }: { data: any[] }) => {
  const maxValue = useMemo(() => 
    Math.max(...data.map(d => Math.max(d.admin, d.user))) || 1, 
    [data]
  );

  return (
    <div className="relative h-80 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-6 shadow-sm">
      {data.length > 0 ? (
        <div className="h-full flex items-end justify-between gap-2">
          {data.map((dataPoint, index) => {
            const adminHeight = Math.max((dataPoint.admin / maxValue) * 100, 2);
            const userHeight = Math.max((dataPoint.user / maxValue) * 100, 2);
            
            return (
              <div key={index} className="flex-1 flex flex-col items-center gap-2 group">
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
                    title={`User: ${dataPoint.user} actions at ${dataPoint.time}`}
                  >
                    {dataPoint.user > 0 && (
                      <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-blue-700 text-white text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                        {dataPoint.user}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-xs text-gray-600 font-medium">
                  {dataPoint.time}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-gray-500">
          No data available
        </div>
      )}
      
      {/* Grid lines */}
      {data.length > 0 && (
        <div className="absolute inset-6 pointer-events-none">
          <div className="h-full w-full">
            <div className="absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2].map(i => (
                <div key={i} className="border-t border-gray-200 border-dashed opacity-50"></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

EngagementChart.displayName = 'EngagementChart';

// Memoized stats cards
const StatsCards = memo(({ actions }: { actions: ActionLog[] }) => {
  const stats = useMemo(() => ({
    itemActions: actions.filter(a => a.action.includes('item_')).length,
    adminActions: actions.filter(a => a.isAdmin === true).length,
    userActions: actions.filter(a => a.isAdmin !== true).length,
    activeUsers: new Set(actions.map(a => a.userId)).size
  }), [actions]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div className="bg-white rounded-lg border p-6">
        <div className="text-2xl font-bold text-gray-900">
          {stats.itemActions}
        </div>
        <div className="text-sm text-gray-600">Item Actions</div>
      </div>
      
      <div className="bg-white rounded-lg border p-6">
        <div className="text-2xl font-bold text-red-600">
          {stats.adminActions}
        </div>
        <div className="text-sm text-gray-600">Admin Actions</div>
      </div>
      
      <div className="bg-white rounded-lg border p-6">
        <div className="text-2xl font-bold text-blue-600">
          {stats.userActions}
        </div>
        <div className="text-sm text-gray-600">User Actions</div>
      </div>
      
      <div className="bg-white rounded-lg border p-6">
        <div className="text-2xl font-bold text-gray-900">
          {stats.activeUsers}
        </div>
        <div className="text-sm text-gray-600">Active Users</div>
      </div>
    </div>
  );
});

StatsCards.displayName = 'StatsCards';

const OptimizedActionsDashboard: React.FC<OptimizedActionsDashboardProps> = ({ user, isAdmin }) => {
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [userTypeFilter, setUserTypeFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('24h');
  const [showUserAnalytics, setShowUserAnalytics] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [showAdminManageModal, setShowAdminManageModal] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Use virtualized list hook for filtering
  const { filteredItems: filteredActions, isFiltering } = useVirtualizedList(
    actions,
    searchQuery,
    useCallback((action: ActionLog, query: string) => {
      const matchesSearch = !query || 
        action.userName?.toLowerCase().includes(query.toLowerCase()) ||
        action.action.toLowerCase().includes(query.toLowerCase()) ||
        action.description?.toLowerCase().includes(query.toLowerCase());

      const matchesActionFilter = actionFilter === 'all' || action.action.includes(actionFilter);
      
      const matchesUserType = userTypeFilter === 'all' || 
        (userTypeFilter === 'admin' && action.isAdmin === true) ||
        (userTypeFilter === 'user' && action.isAdmin !== true);

      return matchesSearch && matchesActionFilter && matchesUserType;
    }, [actionFilter, userTypeFilter])
  );

  // Memoized engagement data calculation
  const engagementData = useMemo(() => {
    const timeSlots: { [key: string]: { admin: number; user: number; time: string } } = {};
    let interval = 1;
    let formatPattern = 'hour';
    let numSlots = 12;
    
    switch (timeFilter) {
      case '1h':
        interval = 0.1;
        formatPattern = 'minute';
        numSlots = 10;
        break;
      case '24h':
      case '1d':
        interval = 2;
        formatPattern = 'hour';
        numSlots = 12;
        break;
      case '3d':
        interval = 6;
        formatPattern = 'hour';
        numSlots = 12;
        break;
      case '1w':
        interval = 24;
        formatPattern = 'day';
        numSlots = 7;
        break;
      case '1m':
        interval = 24 * 2.5;
        formatPattern = 'day';
        numSlots = 12;
        break;
    }

    const now = new Date();
    const timeThreshold = getTimeThreshold();
    
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

    actions.forEach(action => {
      const actionTime = action.timestamp.getTime();
      if (actionTime >= timeThreshold && actionTime <= now.getTime()) {
        const slotIndex = Math.floor((actionTime - timeThreshold) / intervalMs);
        const slotKey = timeThreshold + (slotIndex * intervalMs);
        
        if (timeSlots[slotKey]) {
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
  }, [actions, timeFilter]);

  // Debounced search
  const debouncedSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  useEffect(() => {
    console.log('OptimizedActionsDashboard useEffect triggered, timeFilter:', timeFilter);
    setLoading(true);
    
    if (user) {
      console.log('Logging dashboard access for user:', user.displayName);
      logUserAction(user, 'dashboard_viewed', 'Accessed Optimized Actions Dashboard').catch(error => {
        if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
          console.log('📍 Action logging not available due to permissions');
          return;
        }
        console.warn('Failed to log dashboard access:', error);
      });
    }
    
    console.log('Setting up subscription to action logs...');
    let hasReceivedData = false;
    
    const unsubscribe = subscribeToActionLogs(
      (newActions) => {
        console.log('📊 Received action logs:', newActions.length);
        setActions(newActions);
        if (!hasReceivedData) {
          hasReceivedData = true;
          setLoading(false);
        }
      },
      (error) => {
        console.error('Error subscribing to action logs:', error);
        if (!hasReceivedData) {
          setLoading(false);
        }
      },
      timeFilter
    );

    return () => {
      console.log('Cleaning up action logs subscription');
      unsubscribe();
    };
  }, [user, timeFilter]);

  function getTimeThreshold(): number {
    const now = new Date();
    switch (timeFilter) {
      case '1h':
        return now.getTime() - (60 * 60 * 1000);
      case '24h':
      case '1d':
        return now.getTime() - (24 * 60 * 60 * 1000);
      case '3d':
        return now.getTime() - (3 * 24 * 60 * 60 * 1000);
      case '1w':
        return now.getTime() - (7 * 24 * 60 * 60 * 1000);
      case '1m':
        return now.getTime() - (30 * 24 * 60 * 60 * 1000);
      default:
        return now.getTime() - (24 * 60 * 60 * 1000);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Actions Dashboard</h1>
          <p className="text-gray-600">Monitor user and admin activity in real-time</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowUserAnalytics(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            User Analytics
          </button>
          
          {isAdmin && (
            <>
              <button
                onClick={() => setShowBanModal(true)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Ban Management
              </button>
              
              <button
                onClick={() => setShowAdminManageModal(true)}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
              >
                Admin Management
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search actions, users, or descriptions..."
              value={searchQuery}
              onChange={(e) => debouncedSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
          
          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="all">All Actions</option>
            <option value="item_">Item Actions</option>
            <option value="purchase">Purchases</option>
            <option value="view">Views</option>
            <option value="admin">Admin Actions</option>
          </select>
          
          {/* User Type Filter */}
          <select
            value={userTypeFilter}
            onChange={(e) => setUserTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="all">All Users</option>
            <option value="admin">Admins Only</option>
            <option value="user">Users Only</option>
          </select>
          
          {/* Time Filter */}
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="3d">Last 3 Days</option>
            <option value="1w">Last Week</option>
            <option value="1m">Last Month</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <StatsCards actions={actions} />

      {/* Engagement Chart */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Activity Over Time</h2>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span>Admin Actions</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span>User Actions</span>
            </div>
          </div>
        </div>
        
        <EngagementChart data={engagementData} />

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

      {/* Actions List */}
      <div className="bg-white rounded-lg border">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Actions {isFiltering && <span className="text-sm text-gray-500">(Filtering...)</span>}
            </h2>
            <span className="text-sm text-gray-500">
              {filteredActions.length} of {actions.length} actions
            </span>
          </div>
        </div>
        
        <div className="h-96">
          <VirtualizedList
            items={filteredActions}
            height={384}
            itemHeight={80}
            renderItem={(action, index) => (
              <ActionItem action={action} index={index} />
            )}
            className="p-4"
          />
        </div>
      </div>

      {/* Modals */}
      <UserAnalyticsModal
        isOpen={showUserAnalytics}
        onClose={() => setShowUserAnalytics(false)}
        user={user}
        isAdmin={isAdmin}
      />

      {showBanModal && (
        <AdminBanModal
          onClose={() => setShowBanModal(false)}
        />
      )}

      {showAdminManageModal && (
        <AdminManageModal
          onClose={() => setShowAdminManageModal(false)}
        />
      )}
    </div>
  );
};

export default OptimizedActionsDashboard; 