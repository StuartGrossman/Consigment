import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { AuthUser } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useCategories } from '../hooks/useCategories';
import { apiService } from '../services/apiService';
import { VirtualizedList, useVirtualizedList } from './VirtualizedList';
import { usePaginatedData } from '../hooks/usePaginatedData';

// Lazy load heavy components
const OptimizedActionsDashboard = lazy(() => import('./OptimizedActionsDashboard'));
const OptimizedAdminModal = lazy(() => import('./OptimizedAdminModal'));
const CategoryDashboard = lazy(() => import('./CategoryDashboard'));
const Analytics = lazy(() => import('./Analytics'));

interface PerformanceOptimizedHomeProps {
  user: AuthUser | null;
  isAdmin: boolean;
}

// Memoized category card component
const CategoryCard = React.memo(({ 
  category, 
  itemCount, 
  onClick 
}: {
  category: any;
  itemCount: number;
  onClick: () => void;
}) => {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-3">
        {category.icon && (
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <span className="text-xl">{category.icon}</span>
          </div>
        )}
        
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{category.name}</h3>
          <p className="text-sm text-gray-600">{itemCount} items</p>
        </div>
        
        <div className="text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
});

CategoryCard.displayName = 'CategoryCard';

// Memoized item card component
const ItemCard = React.memo(({ 
  item, 
  onItemClick 
}: {
  item: any;
  onItemClick: (item: any) => void;
}) => {
  const formatPrice = useCallback((price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  }, []);

  return (
    <div
      onClick={() => onItemClick(item)}
      className="bg-white rounded-lg border border-gray-200 overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
    >
      {item.imageUrl && (
        <div className="aspect-square overflow-hidden">
          <img
            src={item.imageUrl}
            alt={item.title || item.name}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        </div>
      )}
      
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 truncate mb-2">
          {item.title || item.name}
        </h3>
        
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-bold text-orange-600">
            {formatPrice(item.price)}
          </span>
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
            item.status === 'live' ? 'bg-green-100 text-green-800' :
            item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {item.status}
          </span>
        </div>
        
        {item.description && (
          <p className="text-sm text-gray-600 line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
});

ItemCard.displayName = 'ItemCard';

// Loading component
const LoadingSpinner = () => (
  <div className="flex justify-center items-center py-12">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
  </div>
);

const PerformanceOptimizedHome: React.FC<PerformanceOptimizedHomeProps> = ({ user, isAdmin }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'actions' | 'categories' | 'analytics'>('home');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Get categories
  const { categories: realCategories, refetch: refetchCategories } = useCategories();

  // Use paginated data for items
  const {
    data: items,
    loading: itemsLoading,
    hasMore: hasMoreItems,
    loadNextPage: loadMoreItems,
    isLoadingMore: isLoadingMoreItems
  } = usePaginatedData(
    useCallback(async (page: number, pageSize: number) => {
      const result = await apiService.getItems({
        page,
        pageSize,
        category: selectedCategory || undefined,
        search: searchQuery || undefined,
        status: 'live'
      });
      
      return {
        data: result.items || [],
        total: result.total || 0,
        hasMore: result.hasMore || false
      };
    }, [selectedCategory, searchQuery]),
    { pageSize: 24 }
  );

  // Use virtualized list for filtering
  const { filteredItems, isFiltering } = useVirtualizedList(
    items,
    searchQuery,
    useCallback((item: any, query: string) => {
      if (!query) return true;
      
      return (
        item.title?.toLowerCase().includes(query.toLowerCase()) ||
        item.name?.toLowerCase().includes(query.toLowerCase()) ||
        item.description?.toLowerCase().includes(query.toLowerCase()) ||
        item.category?.toLowerCase().includes(query.toLowerCase())
      );
    }, [])
  );

  // Memoized categories with item counts
  const categoriesWithCounts = useMemo(() => {
    if (!realCategories || !items) return [];
    
    return realCategories.map(category => ({
      ...category,
      itemCount: items.filter(item => item.category === category.name).length
    }));
  }, [realCategories, items]);

  // Handle category selection
  const handleCategoryClick = useCallback((categoryName: string) => {
    setSelectedCategory(categoryName === selectedCategory ? null : categoryName);
  }, [selectedCategory]);

  // Handle item click
  const handleItemClick = useCallback((item: any) => {
    // TODO: Open item detail modal
    console.log('Item clicked:', item);
  }, []);

  // Debounced search
  const debouncedSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  // Listen for category updates
  useEffect(() => {
    const handleCategoriesUpdated = (event: CustomEvent) => {
      console.log('Categories updated event received:', event.detail);
      if (event.detail?.action === 'categories_reordered') {
        refetchCategories();
      }
    };

    window.addEventListener('categoriesUpdated', handleCategoriesUpdated as EventListener);
    
    return () => {
      window.removeEventListener('categoriesUpdated', handleCategoriesUpdated as EventListener);
    };
  }, [refetchCategories]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-semibold text-gray-900">Consignment Store</h1>
              
              {/* Navigation Tabs */}
              <nav className="flex space-x-8">
                <button
                  onClick={() => setActiveTab('home')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'home'
                      ? 'bg-orange-100 text-orange-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Home
                </button>
                
                {isAdmin && (
                  <>
                    <button
                      onClick={() => setActiveTab('actions')}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'actions'
                          ? 'bg-orange-100 text-orange-700'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Actions
                    </button>
                    
                    <button
                      onClick={() => setActiveTab('categories')}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'categories'
                          ? 'bg-orange-100 text-orange-700'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Categories
                    </button>
                    
                    <button
                      onClick={() => setActiveTab('analytics')}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'analytics'
                          ? 'bg-orange-100 text-orange-700'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Analytics
                    </button>
                  </>
                )}
              </nav>
            </div>
            
            {/* Search Bar */}
            <div className="flex-1 max-w-md mx-8">
              <input
                type="text"
                placeholder="Search items..."
                onChange={(e) => debouncedSearch(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            
            {/* Admin Actions */}
            {isAdmin && (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowAdminModal(true)}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                  Manage Items
                </button>
                
                <button
                  onClick={() => setShowCategoryModal(true)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Manage Categories
                </button>
                
                <button
                  onClick={() => setShowAnalytics(true)}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  Analytics
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<LoadingSpinner />}>
          {activeTab === 'home' && (
            <div className="space-y-8">
              {/* Categories */}
              {categoriesWithCounts.length > 0 && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Categories</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categoriesWithCounts.map((category) => (
                      <CategoryCard
                        key={category.id}
                        category={category}
                        itemCount={category.itemCount}
                        onClick={() => handleCategoryClick(category.name)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedCategory ? `${selectedCategory} Items` : 'All Items'}
                  </h2>
                  
                  <div className="flex items-center gap-4">
                    {isFiltering && (
                      <span className="text-sm text-gray-500">Filtering...</span>
                    )}
                    <span className="text-sm text-gray-600">
                      {filteredItems.length} items
                    </span>
                  </div>
                </div>

                {itemsLoading ? (
                  <LoadingSpinner />
                ) : (
                  <div className="space-y-6">
                    {/* Virtualized Items Grid */}
                    <div className="h-96">
                      <VirtualizedList
                        items={filteredItems}
                        height={384}
                        itemHeight={300}
                        renderItem={(item, index) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            onItemClick={handleItemClick}
                          />
                        )}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                      />
                    </div>

                    {/* Load More */}
                    {hasMoreItems && (
                      <div className="text-center">
                        <button
                          onClick={loadMoreItems}
                          disabled={isLoadingMoreItems}
                          className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-400 transition-colors"
                        >
                          {isLoadingMoreItems ? (
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Loading...
                            </div>
                          ) : (
                            'Load More Items'
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'actions' && isAdmin && (
            <OptimizedActionsDashboard user={user} isAdmin={isAdmin} />
          )}

          {activeTab === 'categories' && isAdmin && (
            <CategoryDashboard user={user} isAdmin={isAdmin} />
          )}

          {activeTab === 'analytics' && isAdmin && (
            <Analytics user={user} isAdmin={isAdmin} />
          )}
        </Suspense>
      </div>

      {/* Modals */}
      <Suspense fallback={null}>
        {showAdminModal && (
          <OptimizedAdminModal
            isOpen={showAdminModal}
            onClose={() => setShowAdminModal(false)}
            user={user}
          />
        )}

        {showCategoryModal && (
          <CategoryDashboard
            user={user}
            isAdmin={isAdmin}
          />
        )}

        {showAnalytics && (
          <Analytics
            user={user}
            isAdmin={isAdmin}
          />
        )}
      </Suspense>
    </div>
  );
};

export default PerformanceOptimizedHome; 