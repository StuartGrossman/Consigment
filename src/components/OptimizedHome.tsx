import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ConsignmentItem } from '../types';
import { usePaginatedItems } from '../hooks/usePaginatedItems';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import VirtualizedItemGrid from './VirtualizedItemGrid';
import OptimizedItemCard from './OptimizedItemCard';
import ItemDetailModal from './ItemDetailModal';

interface OptimizedHomeProps {
  onItemClick?: (item: ConsignmentItem) => void;
  activeCategory?: string | null;
  searchQuery?: string;
}

const OptimizedHome: React.FC<OptimizedHomeProps> = ({
  onItemClick,
  activeCategory,
  searchQuery = ''
}) => {
  const { user, isAdmin } = useAuth();
  const [selectedItem, setSelectedItem] = useState<ConsignmentItem | null>(null);
  const [showItemDetail, setShowItemDetail] = useState(false);

  // Use paginated loading for better performance
  const {
    items,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    totalCount
  } = usePaginatedItems({
    pageSize: 20,
    status: 'live',
    category: activeCategory || undefined,
    sortBy: 'liveAt',
    sortOrder: 'desc',
    enableCache: true
  });

  // Filter items by search query (client-side for now)
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    
    const query = searchQuery.toLowerCase();
    return items.filter(item => 
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category?.toLowerCase().includes(query) ||
      item.brand?.toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  // Group items by category for better organization
  const itemsByCategory = useMemo(() => {
    const groups: { [key: string]: ConsignmentItem[] } = {};
    
    filteredItems.forEach(item => {
      const category = item.category || 'Other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(item);
    });

    return groups;
  }, [filteredItems]);

  // Infinite scroll hook
  const { loadMoreRef, isLoadingMore } = useInfiniteScroll(loadMore, {
    hasMore,
    loading,
    threshold: 0.1,
    rootMargin: '200px'
  });

  // Handle item click
  const handleItemClick = useCallback((item: ConsignmentItem) => {
    setSelectedItem(item);
    setShowItemDetail(true);
    onItemClick?.(item);
  }, [onItemClick]);

  // Handle item detail close
  const handleItemDetailClose = useCallback(() => {
    setShowItemDetail(false);
    setSelectedItem(null);
  }, []);

  // Handle item updated
  const handleItemUpdated = useCallback(() => {
    refresh();
  }, [refresh]);

  // Show loading skeleton for initial load
  if (loading && items.length === 0) {
    return (
      <div className="space-y-8">
        {[...Array(3)].map((_, categoryIndex) => (
          <div key={categoryIndex} className="space-y-4">
            {/* Category header skeleton */}
            <div className="flex items-center justify-between">
              <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
              <div className="h-5 bg-gray-200 rounded w-16 animate-pulse"></div>
            </div>
            
            {/* Items grid skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, itemIndex) => (
                <div key={itemIndex} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
                  <div className="aspect-[4/3] bg-gray-200"></div>
                  <div className="p-4 space-y-3">
                    <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                    <div className="flex gap-2">
                      <div className="h-6 bg-gray-200 rounded w-16"></div>
                      <div className="h-6 bg-gray-200 rounded w-12"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Items</h3>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Show empty state
  if (!loading && filteredItems.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Items Found</h3>
        <p className="text-gray-600">
          {searchQuery ? `No items match "${searchQuery}"` : 
           activeCategory ? `No items in ${activeCategory}` : 
           'No items are currently available'}
        </p>
      </div>
    );
  }

  // Render items by category or as a single grid
  if (activeCategory || searchQuery) {
    // Single category or search results - use virtualized grid
    return (
      <>
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              {activeCategory || `Search Results for "${searchQuery}"`}
            </h2>
            <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
              {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>
        </div>

        <div className="h-[600px]">
          <VirtualizedItemGrid
            items={filteredItems}
            isAdmin={isAdmin}
            onItemClick={handleItemClick}
            itemHeight={400}
            itemWidth={300}
            gap={24}
          />
        </div>

        {/* Load more trigger */}
        {hasMore && (
          <div ref={loadMoreRef} className="py-8 text-center">
            {isLoadingMore ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-gray-600">Loading more items...</span>
              </div>
            ) : (
              <button
                onClick={loadMore}
                className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                Load More Items
              </button>
            )}
          </div>
        )}

        {/* Item detail modal */}
        {selectedItem && (
          <ItemDetailModal
            isOpen={showItemDetail}
            onClose={handleItemDetailClose}
            item={selectedItem}
            onItemUpdated={handleItemUpdated}
          />
        )}
      </>
    );
  }

  // Multiple categories - render by category with horizontal scrolling
  return (
    <>
      <div className="space-y-8">
        {Object.entries(itemsByCategory).map(([category, categoryItems]) => (
          <div key={category} className="category-section">
            {/* Category Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-900">{category}</h2>
                <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
                  {categoryItems.length} {categoryItems.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              
              {categoryItems.length > 8 && (
                <button
                  onClick={() => onItemClick?.(categoryItems[0])} // Trigger category filter
                  className="text-orange-600 hover:text-orange-700 font-medium text-sm"
                >
                  View All →
                </button>
              )}
            </div>

            {/* Category Items - Horizontal scroll for performance */}
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-6 pb-4" style={{ width: 'max-content' }}>
                {categoryItems.slice(0, 12).map((item, index) => (
                  <div key={item.id} className="w-80 flex-shrink-0">
                    <OptimizedItemCard
                      item={item}
                      isAdmin={isAdmin}
                      onClick={handleItemClick}
                      priority={index < 4} // Prioritize first 4 items
                    />
                  </div>
                ))}
                
                {/* Show more card if there are more items */}
                {categoryItems.length > 12 && (
                  <div className="w-80 flex-shrink-0 flex items-center justify-center">
                    <button
                      onClick={() => onItemClick?.(categoryItems[0])} // Trigger category filter
                      className="w-full h-80 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-3 text-gray-500 hover:border-orange-400 hover:text-orange-600 transition-colors group"
                    >
                      <svg className="w-8 h-8 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <div className="text-center">
                        <p className="font-medium">View All {category}</p>
                        <p className="text-sm">
                          {categoryItems.length - 12} more {categoryItems.length - 12 === 1 ? 'item' : 'items'}
                        </p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Load more trigger for additional categories */}
      {hasMore && (
        <div ref={loadMoreRef} className="py-8 text-center">
          {isLoadingMore ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-gray-600">Loading more items...</span>
            </div>
          ) : (
            <button
              onClick={loadMore}
              className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              Load More Items
            </button>
          )}
        </div>
      )}

      {/* Performance stats (dev only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white p-2 rounded text-xs">
          <div>Total: {totalCount} items</div>
          <div>Filtered: {filteredItems.length} items</div>
          <div>Categories: {Object.keys(itemsByCategory).length}</div>
        </div>
      )}

      {/* Item detail modal */}
      {selectedItem && (
        <ItemDetailModal
          isOpen={showItemDetail}
          onClose={handleItemDetailClose}
          item={selectedItem}
          onItemUpdated={handleItemUpdated}
        />
      )}
    </>
  );
};

export default OptimizedHome; 