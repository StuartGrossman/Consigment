import React, { useRef, useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { ConsignmentItem } from '../types';

interface NavigationProps {
    isAdmin: boolean;
    showAnalyticsPage: boolean;
    showInventoryPage: boolean;
    showActionsPage: boolean;
    recentItems: ConsignmentItem[];
    notificationsClearedAt: Date | null;
    onNavigateToAnalytics: () => void;
    onNavigateToInventory: () => void;
    onNavigateToActions: () => void;
    onNavigateToStore: () => void;
    onOpenBookmarks: () => void;
    onOpenCart: () => void;
    onOpenApplicationTest: () => void;
    onItemClick: (item: ConsignmentItem) => void;
    onClearNotifications: () => void;
    getCartItemCount: () => number;
    getBookmarkCount: (items: ConsignmentItem[]) => number;
    items: ConsignmentItem[];
}

export const Navigation: React.FC<NavigationProps> = ({
    isAdmin,
    showAnalyticsPage,
    showInventoryPage,
    showActionsPage,
    recentItems,
    notificationsClearedAt,
    onNavigateToAnalytics,
    onNavigateToInventory,
    onNavigateToActions,
    onNavigateToStore,
    onOpenBookmarks,
    onOpenCart,
    onOpenApplicationTest,
    onItemClick,
    onClearNotifications,
    getCartItemCount,
    getBookmarkCount,
    items
}) => {
    const { user, logout, toggleAdmin, switchingAdminMode } = useAuth();
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [alertsMenuOpen, setAlertsMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);
    const alertsMenuRef = useRef<HTMLDivElement>(null);

    // Handle clicking outside menus
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setUserMenuOpen(false);
            }
            if (alertsMenuRef.current && !alertsMenuRef.current.contains(event.target as Node)) {
                setAlertsMenuOpen(false);
            }
        };

        if (userMenuOpen || alertsMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [userMenuOpen, alertsMenuOpen]);

    const getRecentActivity = (item: ConsignmentItem) => {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Check what happened most recently
        if (item.soldAt && item.soldAt >= oneDayAgo) {
            return {
                message: 'Sold!',
                time: item.soldAt,
                icon: '💰',
                color: 'text-green-600'
            };
        } else if (item.liveAt && item.liveAt >= oneDayAgo) {
            return {
                message: 'Went Live',
                time: item.liveAt,
                icon: '🚀',
                color: 'text-blue-600'
            };
        } else if (item.approvedAt && item.approvedAt >= oneDayAgo) {
            return {
                message: 'Approved',
                time: item.approvedAt,
                icon: '✅',
                color: 'text-green-600'
            };
        } else if (item.createdAt && item.createdAt >= oneDayAgo) {
            return {
                message: 'Submitted',
                time: item.createdAt,
                icon: '📝',
                color: 'text-blue-600'
            };
        }
        
        return null;
    };

    return (
        <div className="desktop-navigation">
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
                                <p className="text-xs text-gray-500">Mountain Consignment Store</p>
                            </div>
                        </div>
                        
                        <div className="desktop-nav-actions">
                            <div className="desktop-nav-buttons">
                                {(showAnalyticsPage || showInventoryPage || showActionsPage) && (
                                    <button
                                        onClick={onNavigateToStore}
                                        className="bg-gray-500 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm sm:text-base flex-shrink-0"
                                    >
                                        <span className="hidden sm:inline">Back to Store</span>
                                        <span className="sm:hidden">Back</span>
                                    </button>
                                )}
                            </div>
                            
                            <div className="desktop-nav-icons">
                                {/* Bookmarks Icon - Only for non-admin users */}
                                {!isAdmin && (
                                    <button
                                        onClick={onOpenBookmarks}
                                        className="desktop-icon-button"
                                        title="Bookmarked Items"
                                    >
                                        <svg className="w-5 h-5 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                        </svg>
                                        {getBookmarkCount(items) > 0 && (
                                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full desktop-badge flex items-center justify-center">
                                                {getBookmarkCount(items) > 9 ? '9+' : getBookmarkCount(items)}
                                            </span>
                                        )}
                                    </button>
                                )}

                                {/* Cart Icon - Only for non-admin users */}
                                {!isAdmin && (
                                    <button
                                        onClick={onOpenCart}
                                        className="desktop-icon-button"
                                        title="Shopping Cart"
                                    >
                                        <svg className="w-5 h-5 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l-1 7H6l-1-7z" />
                                        </svg>
                                        {getCartItemCount() > 0 && (
                                            <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full desktop-badge flex items-center justify-center">
                                                {getCartItemCount() > 9 ? '9+' : getCartItemCount()}
                                            </span>
                                        )}
                                    </button>
                                )}

                                {/* Alerts/Notifications Icon */}
                                <div ref={alertsMenuRef} className="relative">
                                    <button
                                        onClick={() => {
                                            setAlertsMenuOpen(!alertsMenuOpen);
                                            if (!alertsMenuOpen) {
                                                onClearNotifications();
                                            }
                                        }}
                                        className="desktop-icon-button"
                                    >
                                        <svg className="w-5 h-5 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5-5V9a6 6 0 10-12 0v3l-5 5h5m7 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                        </svg>
                                        {(() => {
                                            const hasUnseenNotifications = recentItems.length > 0 && (
                                                !notificationsClearedAt || 
                                                recentItems.some(item => {
                                                    const latestActivity = Math.max(
                                                        item.createdAt?.getTime() || 0,
                                                        item.approvedAt?.getTime() || 0,
                                                        item.liveAt?.getTime() || 0,
                                                        item.soldAt?.getTime() || 0
                                                    );
                                                    return latestActivity > notificationsClearedAt.getTime();
                                                })
                                            );
                                            
                                            return hasUnseenNotifications ? (
                                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full desktop-badge flex items-center justify-center">
                                                    {recentItems.length > 9 ? '9+' : recentItems.length}
                                                </span>
                                            ) : null;
                                        })()}
                                    </button>

                                    {/* Alerts Dropdown */}
                                    {alertsMenuOpen && (
                                        <div className="absolute right-0 top-full mt-2 w-80 sm:w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-[80vh] overflow-hidden">
                                            <div className="p-4 border-b border-gray-100">
                                                <h3 className="font-semibold text-gray-900">
                                                    {isAdmin ? 'Platform Activity' : 'My Item Updates'}
                                                </h3>
                                                <p className="text-xs text-gray-500">
                                                    {isAdmin 
                                                        ? 'All item activity in the last 24 hours' 
                                                        : 'Your items with recent activity'
                                                    }
                                                </p>
                                            </div>
                                            
                                            <div className="max-h-72 overflow-y-auto">
                                                {recentItems.length === 0 ? (
                                                    <div className="p-4 text-center text-gray-500">
                                                        <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5-5V9a6 6 0 10-12 0v3l-5 5h5m7 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                        </svg>
                                                        <p className="text-sm">
                                                            {isAdmin 
                                                                ? 'No platform activity in the last 24 hours' 
                                                                : 'No updates on your items recently'
                                                            }
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="divide-y divide-gray-100">
                                                        {recentItems.map((item) => {
                                                            const recentActivity = getRecentActivity(item);
                                                            return (
                                                                <button
                                                                    key={item.id}
                                                                    onClick={() => onItemClick(item)}
                                                                    className="w-full p-4 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:bg-gray-50"
                                                                >
                                                                    <div className="flex items-start gap-3">
                                                                        {item.images && item.images.length > 0 ? (
                                                                            <img 
                                                                                src={item.images[0]} 
                                                                                alt={item.title}
                                                                                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                                                                            />
                                                                        ) : (
                                                                            <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                                                                                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                                </svg>
                                                                            </div>
                                                                        )}
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-start justify-between">
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                                                                                    <p className="text-sm text-orange-600 font-semibold">${item.price}</p>
                                                                                </div>
                                                                                <span className={`ml-2 px-2 py-1 text-xs rounded-full flex-shrink-0 ${
                                                                                    item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                                                    item.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                                                                    item.status === 'live' ? 'bg-green-100 text-green-800' :
                                                                                    'bg-gray-100 text-gray-800'
                                                                                }`}>
                                                                                    {item.status === 'pending' ? 'Pending' :
                                                                                     item.status === 'approved' ? 'Approved' :
                                                                                     item.status === 'live' ? 'Live' :
                                                                                     item.status}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center justify-end mt-1">
                                                                                {recentActivity && (
                                                                                    <div className={`flex items-center gap-1 text-xs ${recentActivity.color} font-medium`}>
                                                                                        <span>{recentActivity.icon}</span>
                                                                                        <span>{recentActivity.message}</span>
                                                                                        <span className="text-gray-400">
                                                                                            {recentActivity.time.toLocaleTimeString([], { 
                                                                                                hour: '2-digit', 
                                                                                                minute: '2-digit' 
                                                                                            })}
                                                                                        </span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {recentItems.length > 0 && (
                                                <div className="p-3 border-t border-gray-100 bg-gray-50">
                                                    <p className="text-xs text-gray-500 text-center">
                                                        {isAdmin 
                                                            ? 'Click on any item to view details and manage' 
                                                            : 'Click on your items to view status updates'
                                                        }
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* User Menu */}
                                <div ref={userMenuRef} className="relative flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4 border-l border-gray-200 flex-shrink-0">
                                    <button
                                        onClick={() => setUserMenuOpen(!userMenuOpen)}
                                        className="flex items-center gap-2 sm:gap-3 hover:bg-gray-50 active:bg-gray-100 rounded-lg p-2 sm:p-2 transition-colors touch-manipulation min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0"
                                    >
                                        {user?.photoURL && user.photoURL.startsWith('http') ? (
                                            <img 
                                                src={user.photoURL} 
                                                alt={user?.displayName || 'User'} 
                                                className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-orange-500 flex items-center justify-center">
                                                <svg className="w-3 h-3 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                            </div>
                                        )}
                                        <div className="text-xs sm:text-sm hidden sm:block">
                                            <div className="font-medium text-gray-700">{user?.displayName}</div>
                                            {isAdmin && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Admin</span>}
                                        </div>
                                        <svg className={`w-3 h-3 sm:w-4 sm:h-4 text-gray-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    {/* Mobile Backdrop */}
                                    {userMenuOpen && (
                                        <div className="fixed inset-0 z-40 bg-black bg-opacity-25 sm:hidden" 
                                             onClick={() => setUserMenuOpen(false)}
                                             aria-hidden="true" />
                                    )}

                                    {/* User Dropdown Menu */}
                                    {userMenuOpen && (
                                        <div className="absolute right-0 top-full mt-2 w-80 sm:w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-[80vh] overflow-y-auto max-w-[calc(100vw-2rem)] overflow-x-hidden shadow-xl sm:shadow-lg transform transition-all duration-200 ease-out opacity-100 scale-100 translate-y-0">
                                            <div className="p-4 sm:p-4 border-b border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    {user?.photoURL && user.photoURL.startsWith('http') ? (
                                                        <img 
                                                            src={user.photoURL} 
                                                            alt={user?.displayName || 'User'} 
                                                            className="w-10 h-10 sm:w-8 sm:h-8 rounded-full object-cover flex-shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                                                            <svg className="w-5 h-5 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium text-gray-900 truncate">{user?.displayName}</div>
                                                        <div className="text-xs text-gray-500 truncate">
                                                            {user?.email || (user && 'phoneNumber' in user ? (user as any).phoneNumber : 'No contact info')}
                                                        </div>
                                                        {isAdmin && (
                                                            <span className="inline-block mt-1 text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">Admin</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-2 space-y-1">
                                                {/* Dashboard Navigation */}
                                                <div className="text-xs font-medium text-gray-700 mb-2 px-3">Dashboards</div>
                                                
                                                <button
                                                    onClick={() => {
                                                        onNavigateToAnalytics();
                                                        setUserMenuOpen(false);
                                                    }}
                                                    className={`w-full text-left px-3 py-3 sm:py-2 text-sm rounded-lg transition-colors touch-manipulation ${showAnalyticsPage ? 'bg-orange-50 text-orange-700' : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'}`}
                                                >
                                                    📈 {isAdmin ? 'Sales Dashboard' : 'My User History'}
                                                </button>

                                                {isAdmin && (
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                onNavigateToInventory();
                                                                setUserMenuOpen(false);
                                                            }}
                                                            className={`w-full text-left px-3 py-3 sm:py-2 text-sm rounded-lg transition-colors touch-manipulation ${showInventoryPage ? 'bg-orange-50 text-orange-700' : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'}`}
                                                        >
                                                            📋 Inventory Dashboard
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                onNavigateToActions();
                                                                setUserMenuOpen(false);
                                                            }}
                                                            className={`w-full text-left px-3 py-3 sm:py-2 text-sm rounded-lg transition-colors touch-manipulation ${showActionsPage ? 'bg-orange-50 text-orange-700' : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'}`}
                                                        >
                                                            ⚡ Actions Dashboard
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                onOpenApplicationTest();
                                                                setUserMenuOpen(false);
                                                            }}
                                                            className="w-full text-left px-3 py-3 sm:py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                                                        >
                                                            🔬 Application Test & Performance
                                                        </button>
                                                    </>
                                                )}
                                                
                                                <div className="border-t border-gray-200 my-3 sm:my-2"></div>
                                                
                                                {/* Swap Admin Button */}
                                                <button
                                                    onClick={() => {
                                                        if (!switchingAdminMode) {
                                                            toggleAdmin();
                                                            setUserMenuOpen(false);
                                                        }
                                                    }}
                                                    disabled={switchingAdminMode}
                                                    className={`w-full text-left px-3 py-3 sm:py-2 text-sm rounded-lg transition-colors touch-manipulation ${
                                                        switchingAdminMode 
                                                            ? 'text-gray-600 cursor-not-allowed bg-orange-50 border border-orange-100' 
                                                            : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                                                    }`}
                                                >
                                                    {switchingAdminMode ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin"></div>
                                                            Switching...
                                                        </div>
                                                    ) : (
                                                        <>🔄 {isAdmin ? 'Exit Admin Mode' : 'Enter Admin Mode'}</>
                                                    )}
                                                </button>
                                                
                                                <button
                                                    onClick={() => {
                                                        logout();
                                                        setUserMenuOpen(false);
                                                    }}
                                                    className="w-full text-left px-3 py-3 sm:py-2 text-sm text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors touch-manipulation"
                                                >
                                                    Sign Out
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}; 