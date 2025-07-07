import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { ConsignmentItem } from '../types';
import { apiService } from '../services/apiService';
import { VirtualizedList, useVirtualizedList } from './VirtualizedList';
import { usePaginatedData } from '../hooks/usePaginatedData';

interface OptimizedAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

// Memoized item card component
const AdminItemCard = memo(({ 
  item, 
  index, 
  isSelected, 
  onSelect, 
  onApprove, 
  onReject, 
  onEdit,
  processingItemId 
}: {
  item: ConsignmentItem;
  index: number;
  isSelected: boolean;
  onSelect: (itemId: string) => void;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string) => void;
  onEdit: (item: ConsignmentItem) => void;
  processingItemId: string | null;
}) => {
  const isProcessing = processingItemId === item.id;
  const isProcessingBulk = processingItemId === 'bulk';

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'live':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'sold':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }, []);

  const formatPrice = useCallback((price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  }, []);

  const formatDate = useCallback((date: Date | string) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString();
  }, []);

  return (
    <div className={`bg-white rounded-lg border-2 transition-all duration-200 ${
      isSelected 
        ? 'border-orange-500 shadow-lg' 
        : 'border-gray-200 hover:border-gray-300'
    } ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onSelect(item.id)}
              disabled={isProcessingBulk}
              className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
            />
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 truncate">
                {item.title || item.name || 'Untitled Item'}
              </h3>
              <p className="text-sm text-gray-500">
                ID: {item.id}
              </p>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(item.status)}`}>
              {item.status}
            </span>
            <span className="text-lg font-bold text-gray-900">
              {formatPrice(item.price)}
            </span>
          </div>
        </div>

        {/* Image */}
        {item.imageUrl && (
          <div className="mb-3">
            <img
              src={item.imageUrl}
              alt={item.title || item.name}
              className="w-full h-32 object-cover rounded-lg"
              loading="lazy"
            />
          </div>
        )}

        {/* Details */}
        <div className="space-y-2 mb-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Category:</span>
              <p className="font-medium">{item.category || 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-500">Condition:</span>
              <p className="font-medium">{item.condition || 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-500">Created:</span>
              <p className="font-medium">{formatDate(item.createdAt)}</p>
            </div>
            <div>
              <span className="text-gray-500">Owner:</span>
              <p className="font-medium truncate">{item.ownerName || item.ownerId || 'N/A'}</p>
            </div>
          </div>
          
          {item.description && (
            <div>
              <span className="text-gray-500 text-sm">Description:</span>
              <p className="text-sm text-gray-700 line-clamp-2">{item.description}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {item.status === 'pending' && (
            <>
              <button
                onClick={() => onApprove(item.id)}
                disabled={isProcessing}
                className="flex-1 px-3 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:bg-gray-400 transition-colors"
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Approving...
                  </div>
                ) : (
                  'Approve'
                )}
              </button>
              
              <button
                onClick={() => onReject(item.id)}
                disabled={isProcessing}
                className="flex-1 px-3 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 disabled:bg-gray-400 transition-colors"
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Rejecting...
                  </div>
                ) : (
                  'Reject'
                )}
              </button>
            </>
          )}
          
          <button
            onClick={() => onEdit(item)}
            disabled={isProcessing}
            className="px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
});

AdminItemCard.displayName = 'AdminItemCard';

// Memoized filter component
const FilterBar = memo(({ 
  searchQuery, 
  onSearchChange, 
  statusFilter, 
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  categories 
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  categories: string[];
}) => {
  const debouncedSearch = useCallback((value: string) => {
    onSearchChange(value);
  }, [onSearchChange]);

  return (
    <div className="bg-white rounded-lg border p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search Items
          </label>
          <input
            type="text"
            placeholder="Search by title, description, or owner..."
            value={searchQuery}
            onChange={(e) => debouncedSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="live">Live</option>
            <option value="sold">Sold</option>
          </select>
        </div>

        {/* Category Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="all">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {/* Clear Filters */}
        <div className="flex items-end">
          <button
            onClick={() => {
              onSearchChange('');
              onStatusFilterChange('all');
              onCategoryFilterChange('all');
            }}
            className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>
    </div>
  );
});

FilterBar.displayName = 'FilterBar';

const OptimizedAdminModal: React.FC<OptimizedAdminModalProps> = ({ isOpen, onClose, user }) => {
  const [items, setItems] = useState<ConsignmentItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [loading, setLoading] = useState(false);

  // Use virtualized list for filtering
  const { filteredItems, isFiltering } = useVirtualizedList(
    items,
    searchQuery,
    useCallback((item: ConsignmentItem, query: string) => {
      const matchesSearch = !query || 
        item.title?.toLowerCase().includes(query.toLowerCase()) ||
        item.name?.toLowerCase().includes(query.toLowerCase()) ||
        item.description?.toLowerCase().includes(query.toLowerCase()) ||
        item.ownerName?.toLowerCase().includes(query.toLowerCase()) ||
        item.ownerId?.toLowerCase().includes(query.toLowerCase());

      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    }, [statusFilter, categoryFilter])
  );

  // Memoized categories
  const categories = useMemo(() => {
    const uniqueCategories = new Set(items.map(item => item.category).filter(Boolean));
    return Array.from(uniqueCategories).sort();
  }, [items]);

  // Fetch items with pagination
  const {
    data: paginatedItems,
    loading: paginationLoading,
    hasMore,
    loadNextPage,
    isLoadingMore
  } = usePaginatedData(
    useCallback(async (page: number, pageSize: number) => {
      const result = await apiService.getItems({
        page,
        pageSize,
        status: statusFilter === 'all' ? undefined : statusFilter,
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        search: searchQuery || undefined
      });
      
      return {
        data: result.items || [],
        total: result.total || 0,
        hasMore: result.hasMore || false
      };
    }, [statusFilter, categoryFilter, searchQuery]),
    { pageSize: 20 }
  );

  // Update items when paginated data changes
  useEffect(() => {
    if (page === 1) {
      setItems(paginatedItems);
    } else {
      setItems(prev => [...prev, ...paginatedItems]);
    }
  }, [paginatedItems, page]);

  // Load initial data
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      // Initial load will be handled by usePaginatedData
    }
  }, [isOpen]);

  // Handle item selection
  const handleItemSelect = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  // Handle bulk selection
  const handleSelectAll = useCallback(() => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map(item => item.id)));
    }
  }, [selectedItems.size, filteredItems]);

  // Handle approve
  const handleApprove = useCallback(async (itemId: string) => {
    setProcessingItemId(itemId);
    try {
      await apiService.approveItem(itemId);
      setItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, status: 'approved' } : item
      ));
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    } catch (error) {
      console.error('Error approving item:', error);
    } finally {
      setProcessingItemId(null);
    }
  }, []);

  // Handle reject
  const handleReject = useCallback(async (itemId: string) => {
    setProcessingItemId(itemId);
    try {
      await apiService.rejectItem(itemId);
      setItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, status: 'rejected' } : item
      ));
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    } catch (error) {
      console.error('Error rejecting item:', error);
    } finally {
      setProcessingItemId(null);
    }
  }, []);

  // Handle edit
  const handleEdit = useCallback((item: ConsignmentItem) => {
    // TODO: Implement edit modal
    console.log('Edit item:', item);
  }, []);

  // Handle bulk actions
  const handleBulkApprove = useCallback(async () => {
    if (selectedItems.size === 0) return;
    
    setProcessingItemId('bulk');
    try {
      await Promise.all(
        Array.from(selectedItems).map(itemId => apiService.approveItem(itemId))
      );
      
      setItems(prev => prev.map(item => 
        selectedItems.has(item.id) ? { ...item, status: 'approved' } : item
      ));
      setSelectedItems(new Set());
    } catch (error) {
      console.error('Error bulk approving items:', error);
    } finally {
      setProcessingItemId(null);
    }
  }, [selectedItems]);

  const handleBulkReject = useCallback(async () => {
    if (selectedItems.size === 0) return;
    
    setProcessingItemId('bulk');
    try {
      await Promise.all(
        Array.from(selectedItems).map(itemId => apiService.rejectItem(itemId))
      );
      
      setItems(prev => prev.map(item => 
        selectedItems.has(item.id) ? { ...item, status: 'rejected' } : item
      ));
      setSelectedItems(new Set());
    } catch (error) {
      console.error('Error bulk rejecting items:', error);
    } finally {
      setProcessingItemId(null);
    }
  }, [selectedItems]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-100 rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-white rounded-t-lg border-b p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Admin Item Management</h2>
              <p className="text-gray-600">Review and manage consignment items</p>
            </div>
            
            <div className="flex items-center gap-4">
              {selectedItems.size > 0 && (
                <div className="text-sm text-gray-600">
                  {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                </div>
              )}
              
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-6 pb-0">
          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            categories={categories}
          />
        </div>

        {/* Bulk Actions */}
        {selectedItems.size > 0 && (
          <div className="px-6 pb-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-medium text-orange-800">
                    {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                  </span>
                  
                  <button
                    onClick={handleBulkApprove}
                    disabled={processingItemId === 'bulk'}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 transition-colors"
                  >
                    {processingItemId === 'bulk' ? 'Processing...' : 'Approve All'}
                  </button>
                  
                  <button
                    onClick={handleBulkReject}
                    disabled={processingItemId === 'bulk'}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-400 transition-colors"
                  >
                    {processingItemId === 'bulk' ? 'Processing...' : 'Reject All'}
                  </button>
                </div>
                
                <button
                  onClick={() => setSelectedItems(new Set())}
                  className="text-orange-600 hover:text-orange-800"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6 pt-0">
          {loading || paginationLoading ? (
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {/* Header with select all */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Select All</span>
                  </label>
                  
                  {isFiltering && (
                    <span className="text-sm text-gray-500">Filtering...</span>
                  )}
                </div>
                
                <div className="text-sm text-gray-600">
                  {filteredItems.length} of {items.length} items
                </div>
              </div>

              {/* Virtualized Items List */}
              <div className="flex-1">
                <VirtualizedList
                  items={filteredItems}
                  height={400}
                  itemHeight={200}
                  renderItem={(item, index) => (
                    <AdminItemCard
                      item={item}
                      index={index}
                      isSelected={selectedItems.has(item.id)}
                      onSelect={handleItemSelect}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onEdit={handleEdit}
                      processingItemId={processingItemId}
                    />
                  )}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                />
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    onClick={loadNextPage}
                    disabled={isLoadingMore}
                    className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-400 transition-colors"
                  >
                    {isLoadingMore ? (
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
    </div>
  );
};

export default OptimizedAdminModal; 