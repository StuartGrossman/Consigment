import { useState, useCallback } from 'react';

export type PageType = 'store' | 'analytics' | 'inventory' | 'actions';

interface PageNavigationState {
    currentPage: PageType;
    showAnalyticsPage: boolean;
    showInventoryPage: boolean;
    showActionsPage: boolean;
}

interface PageNavigationActions {
    setCurrentPage: (page: PageType) => void;
    navigateToStore: () => void;
    navigateToAnalytics: () => void;
    navigateToInventory: () => void;
    navigateToActions: () => void;
    handleExitAdmin: () => void;
}

export const usePageNavigation = (initialPage: PageType = 'store'): PageNavigationState & PageNavigationActions => {
    const [currentPage, setCurrentPageState] = useState<PageType>(initialPage);
    
    // Derived state based on current page
    const showAnalyticsPage = currentPage === 'analytics';
    const showInventoryPage = currentPage === 'inventory';
    const showActionsPage = currentPage === 'actions';

    const setCurrentPage = useCallback((page: PageType) => {
        console.log(`🔄 Navigating to ${page} page`);
        setCurrentPageState(page);
    }, []);

    const navigateToStore = useCallback(() => {
        setCurrentPage('store');
    }, [setCurrentPage]);

    const navigateToAnalytics = useCallback(() => {
        setCurrentPage('analytics');
    }, [setCurrentPage]);

    const navigateToInventory = useCallback(() => {
        setCurrentPage('inventory');
    }, [setCurrentPage]);

    const navigateToActions = useCallback(() => {
        setCurrentPage('actions');
    }, [setCurrentPage]);

    const handleExitAdmin = useCallback(() => {
        // If user is on admin-only pages, redirect them back to the store
        if (currentPage === 'actions' || currentPage === 'inventory' || currentPage === 'analytics') {
            console.log('🔄 Redirected from admin-only page back to store');
            setCurrentPage('store');
        }
    }, [currentPage, setCurrentPage]);

    return {
        currentPage,
        showAnalyticsPage,
        showInventoryPage,
        showActionsPage,
        setCurrentPage,
        navigateToStore,
        navigateToAnalytics,
        navigateToInventory,
        navigateToActions,
        handleExitAdmin
    };
}; 