import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, where, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem } from '../types';
import { AuthUser } from '../types';
import { logUserAction } from '../services/firebaseService';
import { useAuth } from '../hooks/useAuth';
import { apiService } from '../services/apiService';
import NotificationModal from './NotificationModal';
import BulkActionsModal from './BulkActionsModal';
import POSModal from './POSModal';
import InventoryScanningModal from './InventoryScanningModal';
import { testDataFiles } from '../assets/test-data';

interface InventoryDashboardProps {
  user: AuthUser | null;
  isAdmin: boolean;
}

interface ItemGroup {
  id: string;
  title: string;
  category: string;
  brand: string;
  condition: string;
  price: number;
  quantity: number;
  items: ConsignmentItem[];
  representativeItem: ConsignmentItem;
}

const InventoryDashboard: React.FC<InventoryDashboardProps> = () => {
  const [items, setItems] = useState<ConsignmentItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ConsignmentItem[]>([]);
  const [groupedItems, setGroupedItems] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [conditionFilter, setConditionFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [shippingFilter, setShippingFilter] = useState('all'); // New filter for shipping status
  const [refundFilter, setRefundFilter] = useState('all'); // New filter for refunded items
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('newest');
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [viewMode, setViewMode] = useState<'individual' | 'grouped'>('individual');
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [selectedItemForDiscount, setSelectedItemForDiscount] = useState<ConsignmentItem | null>(null);
  const [showBulkDiscountModal, setShowBulkDiscountModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationData, setNotificationData] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });
  const [showBulkActionsModal, setShowBulkActionsModal] = useState(false);
  const [isPOSModalOpen, setIsPOSModalOpen] = useState(false);
  const [isScanningModalOpen, setIsScanningModalOpen] = useState(false);
  const { user } = useAuth();

  // Define available bulk actions
  const availableBulkActions = [
    {
      id: 'approve',
      name: 'Approve Items',
      description: 'Mark selected items as approved',
      icon: '✅',
      color: 'green'
    },
    {
      id: 'make-live',
      name: 'Make Live',
      description: 'Publish selected items for sale',
      icon: '🚀',
      color: 'blue'
    },
    {
      id: 'reject',
      name: 'Reject Items',
      description: 'Mark selected items as rejected',
      icon: '❌',
      color: 'red'
    },
    {
      id: 'archive',
      name: 'Archive Items',
      description: 'Move selected items to archive',
      icon: '📦',
      color: 'gray'
    }
  ];

  // Helper function to show notifications
  const showNotificationModal = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    setNotificationData({ title, message, type });
    setShowNotification(true);
  };

  // Get unique values for filters
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [genders, setGenders] = useState<string[]>([]);

  useEffect(() => {
    fetchAllItems();
  }, []);

  useEffect(() => {
    filterAndSortItems();
    updateFilterOptions();
  }, [items, searchQuery, statusFilter, categoryFilter, brandFilter, conditionFilter, genderFilter, shippingFilter, refundFilter, sortBy]);

  useEffect(() => {
    if (viewMode === 'grouped') {
      groupSimilarItems();
    }
  }, [filteredItems, viewMode]);

  const fetchAllItems = async () => {
    try {
      const itemsRef = collection(db, 'items');
      const q = query(itemsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedItems: ConsignmentItem[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedItems.push({ 
          id: doc.id, 
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          approvedAt: data.approvedAt?.toDate(),
          liveAt: data.liveAt?.toDate(),
          soldAt: data.soldAt?.toDate()
        } as ConsignmentItem);
      });
      
      setItems(fetchedItems);
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateFilterOptions = () => {
    const uniqueCategories = [...new Set(items.map(item => item.category).filter((cat): cat is string => Boolean(cat) && cat !== ''))].sort();
    const uniqueBrands = [...new Set(items.map(item => item.brand).filter((brand): brand is string => Boolean(brand) && brand !== ''))].sort();
    const uniqueConditions = [...new Set(items.map(item => item.condition).filter(Boolean))].sort();
    const uniqueGenders = [...new Set(items.map(item => item.gender).filter(Boolean))].sort();
    
    setCategories(uniqueCategories);
    setBrands(uniqueBrands);
    setConditions(uniqueConditions as string[]);
    setGenders(uniqueGenders as string[]);
  };

  const filterAndSortItems = () => {
    let filtered = [...items];

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => item.status === statusFilter);
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(item => item.category === categoryFilter);
    }

    // Apply brand filter
    if (brandFilter !== 'all') {
      filtered = filtered.filter(item => item.brand === brandFilter);
    }

    // Apply condition filter
    if (conditionFilter !== 'all') {
      filtered = filtered.filter(item => item.condition === conditionFilter);
    }

    // Apply gender filter
    if (genderFilter !== 'all') {
      filtered = filtered.filter(item => item.gender === genderFilter);
    }

    // Apply shipping filter
    if (shippingFilter !== 'all') {
      if (shippingFilter === 'shipped') {
        filtered = filtered.filter(item => 
          item.status === 'sold' && 
          item.fulfillmentMethod === 'shipping' && 
          item.trackingNumber && 
          item.shippingLabelGenerated
        );
      } else if (shippingFilter === 'unshipped') {
        filtered = filtered.filter(item => 
          item.status === 'sold' && 
          item.fulfillmentMethod === 'shipping' && 
          (!item.trackingNumber || !item.shippingLabelGenerated)
        );
      } else if (shippingFilter === 'pickup') {
        filtered = filtered.filter(item => 
          item.status === 'sold' && 
          item.fulfillmentMethod === 'pickup'
        );
      }
    }

    // Apply refund filter - TODO: Implement with RefundRecord lookup
    if (refundFilter !== 'all') {
      // This would require looking up refund records in a separate collection
      // For now, we'll skip this filter until we implement proper refund tracking
      console.log('Refund filter not yet implemented - requires RefundRecord lookup');
    }

    // Apply search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.title?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.brand?.toLowerCase().includes(searchLower) ||
        item.category?.toLowerCase().includes(searchLower) ||
        item.sellerName?.toLowerCase().includes(searchLower) ||
        item.material?.toLowerCase().includes(searchLower) ||
        item.id.toLowerCase().includes(searchLower) ||
        item.saleTransactionId?.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'oldest':
        filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        break;
      case 'price-high':
        filtered.sort((a, b) => b.price - a.price);
        break;
      case 'price-low':
        filtered.sort((a, b) => a.price - b.price);
        break;
      case 'shelf-time':
        // Items that have been live the longest
        filtered.sort((a, b) => {
          const aTime = a.liveAt || a.createdAt;
          const bTime = b.liveAt || b.createdAt;
          return aTime.getTime() - bTime.getTime();
        });
        break;
      case 'shelf-time-newest':
        // Items that have been live the shortest
        filtered.sort((a, b) => {
          const aTime = a.liveAt || a.createdAt;
          const bTime = b.liveAt || b.createdAt;
          return bTime.getTime() - aTime.getTime();
        });
        break;
      case 'newest':
      default:
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
    }

    setFilteredItems(filtered);
  };

  const groupSimilarItems = () => {
    const groups: { [key: string]: ConsignmentItem[] } = {};
    
    filteredItems.forEach(item => {
      // Group by title, category, brand, and condition
      const groupKey = `${item.title?.toLowerCase()}-${item.category?.toLowerCase()}-${item.brand?.toLowerCase()}-${item.condition?.toLowerCase()}`;
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    });

    const itemGroups: ItemGroup[] = Object.values(groups).map(groupItems => {
      const representative = groupItems[0];
      return {
        id: `group-${representative.id}`,
        title: representative.title,
        category: representative.category || '',
        brand: representative.brand || '',
        condition: representative.condition || '',
        price: representative.price,
        quantity: groupItems.length,
        items: groupItems,
        representativeItem: representative
      };
    });

    setGroupedItems(itemGroups);
  };

  const handleItemSelect = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleSelectAll = () => {
    if (selectedItems.length === filteredItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredItems.map(item => item.id));
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    try {
      await apiService.bulkUpdateItemStatus(selectedItems, newStatus);
      
      // Show success message
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg';
      toast.textContent = `Successfully updated ${selectedItems.length} items to ${newStatus}`;
      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 3000);
      
      await fetchAllItems();
      setSelectedItems([]);
      setShowBulkActions(false);
    } catch (error) {
      console.error('Error updating items:', error);
      
      // Show error message
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg';
      toast.textContent = `Error: ${error instanceof Error ? error.message : 'Failed to update items'}`;
      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 5000);
    }
  };

  const handleSingleItemAction = async (itemId: string, action: string) => {
    try {
      // Get user token for authentication
      const idToken = await (user as any)?.getIdToken();
      if (!idToken) {
        throw new Error('Authentication required');
      }

             // Use the same API detection logic as apiService
       const getApiBaseUrl = () => {
         if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
         if (import.meta.env.DEV) return 'http://localhost:8002';
         return ''; // Use relative URLs for production
       };
       const API_BASE_URL = getApiBaseUrl();
       
       const response = await fetch(`${API_BASE_URL}/api/admin/update-item-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          itemId: itemId,
          status: action
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update item');
      }

      const result = await response.json();
      console.log('Single item update success:', result.message);
      
      // Show success message
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg';
      toast.textContent = result.message;
      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 3000);
      
      await fetchAllItems();
    } catch (error) {
      console.error('Error updating item:', error);
      
      // Show error message
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg';
      toast.textContent = `Error: ${error instanceof Error ? error.message : 'Failed to update item'}`;
      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 5000);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'live': return 'bg-green-100 text-green-800';
      case 'sold': return 'bg-purple-100 text-purple-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getShelfTime = (item: ConsignmentItem) => {
    const liveDate = item.liveAt || item.createdAt;
    const now = new Date();
    const diffTime = now.getTime() - liveDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day';
    return `${diffDays} days`;
  };

  const getShelfDays = (item: ConsignmentItem) => {
    const liveDate = item.liveAt || item.createdAt;
    const now = new Date();
    const diffTime = now.getTime() - liveDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const handleDiscountClick = (item: ConsignmentItem) => {
    setSelectedItemForDiscount(item);
    setShowDiscountModal(true);
  };

  const handleApplyDiscount = async (discountPercentage: number, reason: string) => {
    if (!selectedItemForDiscount) return;

    try {
      const itemRef = doc(db, 'items', selectedItemForDiscount.id);
      const originalPrice = selectedItemForDiscount.originalPrice || selectedItemForDiscount.price;
      const newPrice = originalPrice * (1 - discountPercentage / 100);
      
      await updateDoc(itemRef, {
        originalPrice: originalPrice,
        price: Math.round(newPrice * 100) / 100, // Round to 2 decimal places
        discountPercentage: discountPercentage,
        discountAppliedAt: new Date(),
        discountReason: reason
      });

      // Log the action
      await logUserAction(user, 'item_discounted', `Applied ${discountPercentage}% discount: ${reason}`, selectedItemForDiscount.id, selectedItemForDiscount.title);
      
      await fetchAllItems();
      setShowDiscountModal(false);
      setSelectedItemForDiscount(null);
    } catch (error) {
      console.error('Error applying discount:', error);
    }
  };

  const handleBulkDiscount = async (days: number, discountPercentage: number) => {
    try {
      const eligibleItems = filteredItems.filter(item => {
        if (item.status !== 'live') return false;
        const shelfDays = getShelfDays(item);
        return shelfDays >= days;
      });

      const updates = eligibleItems.map(async (item) => {
        const itemRef = doc(db, 'items', item.id);
        const originalPrice = item.originalPrice || item.price;
        const newPrice = originalPrice * (1 - discountPercentage / 100);
        
        return updateDoc(itemRef, {
          originalPrice: originalPrice,
          price: Math.round(newPrice * 100) / 100,
          discountPercentage: discountPercentage,
          discountAppliedAt: new Date(),
          discountReason: `Auto-discount: ${days}+ days on shelf`
        });
      });

      await Promise.all(updates);
      
      // Log the bulk action
      await logUserAction(user, 'bulk_discount', `Applied ${discountPercentage}% discount to ${eligibleItems.length} items with ${days}+ days on shelf`);
      
      await fetchAllItems();
      setShowBulkDiscountModal(false);
    } catch (error) {
      console.error('Error applying bulk discount:', error);
    }
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
          <h1 className="text-3xl font-bold text-gray-900">Inventory Dashboard</h1>
          <p className="text-gray-600">Manage all items across all statuses</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsScanningModalOpen(true)}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Scan Item
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Import Data
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Export Data
          </button>
          <button
            onClick={() => setShowBulkDiscountModal(true)}
            className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
            Auto-Discount
          </button>
          <div className="text-sm text-gray-500">
            Total: {items.length} items | Filtered: {filteredItems.length} items
          </div>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">View Mode:</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setViewMode('individual')}
                className={`px-4 py-2 text-sm font-medium ${
                  viewMode === 'individual'
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Individual Items
              </button>
              <button
                onClick={() => setViewMode('grouped')}
                className={`px-4 py-2 text-sm font-medium ${
                  viewMode === 'grouped'
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Grouped by Similarity
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            {viewMode === 'individual' 
              ? `Showing ${filteredItems.length} individual items`
              : `Showing ${groupedItems.length} item groups`
            }
          </div>
        </div>
      </div>

      {/* Enhanced Search Bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900">Search Inventory</h3>
        </div>
        <div className="relative max-w-2xl">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, brand, seller, description, ID, or transaction..."
            className="block w-full pl-12 pr-12 py-4 border border-gray-300 rounded-xl text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 shadow-sm"
          />
          {searchQuery && (
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
              <button
                onClick={() => setSearchQuery('')}
                className="text-gray-400 hover:text-gray-600 focus:outline-none transition-colors duration-200 p-1 rounded-full hover:bg-gray-100"
                title="Clear search"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {searchQuery && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Found {filteredItems.length} items</span> matching "<span className="font-semibold text-orange-700">"{searchQuery}"</span>"
              {filteredItems.length !== items.length && (
                <span className="ml-2 text-orange-600 font-medium">
                  ({items.length - filteredItems.length} filtered out)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
            </svg>
          </div>
          <h4 className="text-xl font-semibold text-gray-900">Filter Results</h4>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          
          {/* Status Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 bg-white shadow-sm"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="live">Live</option>
              <option value="sold">Sold</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 bg-white shadow-sm"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          {/* Brand Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Brand</label>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 bg-white shadow-sm"
            >
              <option value="all">All Brands</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>

          {/* Condition Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Condition</label>
            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 bg-white shadow-sm"
            >
              <option value="all">All Conditions</option>
              {conditions.map((condition) => (
                <option key={condition} value={condition}>{condition}</option>
              ))}
            </select>
          </div>

          {/* Gender Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Gender</label>
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 bg-white shadow-sm"
            >
              <option value="all">All Genders</option>
              {genders.map((gender) => (
                <option key={gender} value={gender}>{gender}</option>
              ))}
            </select>
          </div>

          {/* Shipping Status Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Shipping Status</label>
            <select
              value={shippingFilter}
              onChange={(e) => setShippingFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 bg-white shadow-sm"
            >
              <option value="all">All Orders</option>
              <option value="shipped">Shipped</option>
              <option value="unshipped">Unshipped</option>
              <option value="pickup">Store Pickup</option>
            </select>
          </div>

          {/* Refund Status Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Refund Status</label>
            <select
              value={refundFilter}
              onChange={(e) => setRefundFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 bg-white shadow-sm"
            >
              <option value="all">All Items</option>
              <option value="refunded">Refunded</option>
              <option value="not_refunded">Not Refunded</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 bg-white shadow-sm"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="shelf-time">Longest on Shelf</option>
              <option value="shelf-time-newest">Shortest on Shelf</option>
              <option value="price-high">Price: High to Low</option>
              <option value="price-low">Price: Low to High</option>
            </select>
          </div>

          {/* Bulk Actions */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Bulk Actions</label>
            <button
              onClick={() => setShowBulkActionsModal(true)}
              disabled={selectedItems.length === 0}
              className="w-full bg-gradient-to-r from-gray-600 to-gray-700 text-white px-4 py-2.5 rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all duration-200 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Bulk Actions ({selectedItems.length})
            </button>
          </div>
        </div>

        {/* Active Filters Summary */}
        {(statusFilter !== 'all' || categoryFilter !== 'all' || brandFilter !== 'all' || 
          conditionFilter !== 'all' || genderFilter !== 'all' || shippingFilter !== 'all' || 
          refundFilter !== 'all') && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
              </svg>
              <span className="text-sm font-semibold text-blue-900">Active Filters</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {statusFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                  Status: {statusFilter}
                  <button onClick={() => setStatusFilter('all')} className="ml-1 hover:text-blue-600">×</button>
                </span>
              )}
              {categoryFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                  Category: {categoryFilter}
                  <button onClick={() => setCategoryFilter('all')} className="ml-1 hover:text-blue-600">×</button>
                </span>
              )}
              {brandFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                  Brand: {brandFilter}
                  <button onClick={() => setBrandFilter('all')} className="ml-1 hover:text-blue-600">×</button>
                </span>
              )}
              {conditionFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                  Condition: {conditionFilter}
                  <button onClick={() => setConditionFilter('all')} className="ml-1 hover:text-blue-600">×</button>
                </span>
              )}
              {genderFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                  Gender: {genderFilter}
                  <button onClick={() => setGenderFilter('all')} className="ml-1 hover:text-blue-600">×</button>
                </span>
              )}
              {shippingFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                  Shipping: {shippingFilter}
                  <button onClick={() => setShippingFilter('all')} className="ml-1 hover:text-blue-600">×</button>
                </span>
              )}
              {refundFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                  Refund: {refundFilter}
                  <button onClick={() => setRefundFilter('all')} className="ml-1 hover:text-blue-600">×</button>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedItems.length === filteredItems.length && filteredItems.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shelf Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seller</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
              {viewMode === 'individual' ? (
                // Individual Items View
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleItemSelect(item.id)}>
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => handleItemSelect(item.id)}
                        className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {item.images && item.images.length > 0 && (
                          <img
                            src={item.images[0]}
                            alt={item.title}
                            className="h-10 w-10 rounded-lg object-cover mr-3"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 truncate">{item.title}</div>
                          <div className="text-sm text-gray-500 truncate">
                            {item.category && `${item.category} • `}
                            {item.brand && `${item.brand} • `}
                            {item.condition && `${item.condition}`}
                            {item.gender && ` • ${item.gender}`}
                            {item.size && ` • Size ${item.size}`}
                          </div>
                          {/* Description with proper truncation */}
                          {item.description && (
                            <div className="text-xs text-gray-600 mt-1">
                              <p className="line-clamp-2 break-words">{item.description}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex flex-col">
                        <span className={item.discountPercentage ? 'text-red-600 font-medium' : ''}>
                          ${item.price}
                        </span>
                        {item.discountPercentage && (
                          <div className="text-xs text-gray-500">
                            <span className="line-through">${item.originalPrice}</span>
                            <span className="ml-1 text-red-600">-{item.discountPercentage}%</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      1
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {item.status === 'live' ? (
                        <div className="flex flex-col">
                          <span className={`${
                            getShelfDays(item) >= 30 ? 'text-red-600 font-medium' :
                            getShelfDays(item) >= 14 ? 'text-orange-600 font-medium' :
                            getShelfDays(item) >= 7 ? 'text-yellow-600 font-medium' :
                            'text-gray-500'
                          }`}>
                            {getShelfTime(item)}
                          </span>
                          <span className="text-xs text-gray-400">
                            ({getShelfDays(item)} days)
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.sellerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                      <div className="flex space-x-2">
                        {item.status === 'live' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDiscountClick(item);
                            }}
                            className="text-orange-600 hover:text-orange-900"
                          >
                            Discount
                          </button>
                        )}
                        {item.status !== 'archived' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSingleItemAction(item.id, 'archived');
                            }}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                // Grouped Items View
                groupedItems.map((group) => (
                  <tr key={group.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => {
                    const allSelected = group.items.every(item => selectedItems.includes(item.id));
                    if (allSelected) {
                      setSelectedItems(prev => prev.filter(id => !group.items.some(item => item.id === id)));
                    } else {
                      setSelectedItems(prev => [...prev, ...group.items.map(item => item.id)]);
                    }
                  }}>
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={group.items.every(item => selectedItems.includes(item.id))}
                        onChange={() => {
                          const allSelected = group.items.every(item => selectedItems.includes(item.id));
                          if (allSelected) {
                            setSelectedItems(prev => prev.filter(id => !group.items.some(item => item.id === id)));
                          } else {
                            setSelectedItems(prev => [...prev, ...group.items.map(item => item.id)]);
                          }
                        }}
                        className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {group.representativeItem.images && group.representativeItem.images.length > 0 && (
                          <img
                            src={group.representativeItem.images[0]}
                            alt={group.title}
                            className="h-10 w-10 rounded-lg object-cover mr-3"
                          />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">{group.title}</div>
                          <div className="text-sm text-gray-500">
                            {group.category && `${group.category} • `}
                            {group.brand && `${group.brand} • `}
                            {group.condition}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {[...new Set(group.items.map(item => item.status))].map(status => (
                          <span key={status} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                            {status}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${Math.min(...group.items.map(item => item.price))}
                      {group.items.length > 1 && ` - $${Math.max(...group.items.map(item => item.price))}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {group.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {group.items.some(item => item.status === 'live') ? 
                        getShelfTime(group.items.find(item => item.status === 'live')!) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {[...new Set(group.items.map(item => item.sellerName))].join(', ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                      <div className="flex space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Archive all items in the group that aren't already archived
                            group.items.forEach(item => {
                              if (item.status !== 'archived') {
                                handleSingleItemAction(item.id, 'archived');
                              }
                            });
                          }}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Archive All
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {(viewMode === 'individual' ? filteredItems.length === 0 : groupedItems.length === 0) && (
          <div className="text-center py-12">
            <div className="text-gray-500">
              {items.length === 0 ? 'No items found' : 'No items match your filters'}
            </div>
          </div>
        )}
      </div>

      {/* Individual Discount Modal */}
      {showDiscountModal && selectedItemForDiscount && (
        <DiscountModal
          item={selectedItemForDiscount}
          onApply={handleApplyDiscount}
          onClose={() => {
            setShowDiscountModal(false);
            setSelectedItemForDiscount(null);
          }}
        />
      )}

      {/* Bulk Discount Modal */}
      {showBulkDiscountModal && (
        <BulkDiscountModal
          items={filteredItems}
          onApply={handleBulkDiscount}
          onClose={() => setShowBulkDiscountModal(false)}
          getShelfDays={getShelfDays}
        />
      )}

      {/* Import Data Modal */}
      {showImportModal && (
        <ImportDataModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            setShowImportModal(false);
            fetchAllItems(); // Refresh the items list
          }}
        />
      )}

      {/* Export Data Modal */}
      {showExportModal && (
        <ExportDataModal
          items={items}
          filteredItems={filteredItems}
          onClose={() => setShowExportModal(false)}
          user={user}
          showNotification={showNotificationModal}
        />
      )}

      {/* Bulk Actions Modal */}
      <BulkActionsModal
        isOpen={showBulkActionsModal}
        onClose={() => setShowBulkActionsModal(false)}
        selectedItems={selectedItems}
        availableActions={availableBulkActions}
        onComplete={() => {
          setSelectedItems([]);
          fetchAllItems();
        }}
      />

      {/* Notification Modal */}
      <NotificationModal
        isOpen={showNotification}
        onClose={() => setShowNotification(false)}
        title={notificationData.title}
        message={notificationData.message}
        type={notificationData.type}
      />

      {/* POS Modal */}
      <POSModal
        isOpen={isPOSModalOpen}
        onClose={() => setIsPOSModalOpen(false)}
      />

      {/* Inventory Scanning Modal */}
      <InventoryScanningModal 
        isOpen={isScanningModalOpen} 
        onClose={() => setIsScanningModalOpen(false)}
        onItemAdded={(item) => {
          showNotificationModal('Success', `Item ${item.id ? 'updated' : 'created'} successfully!`, 'success');
          fetchAllItems(); // Refresh the inventory list
        }}
      />
    </div>
  );
};

// Individual Discount Modal Component
interface DiscountModalProps {
  item: ConsignmentItem;
  onApply: (discountPercentage: number, reason: string) => void;
  onClose: () => void;
}

const DiscountModal: React.FC<DiscountModalProps> = ({ item, onApply, onClose }) => {
  const [discountPercentage, setDiscountPercentage] = useState(10);
  const [reason, setReason] = useState('');

  const originalPrice = item.originalPrice || item.price;
  const newPrice = originalPrice * (1 - discountPercentage / 100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(discountPercentage, reason || `Manual discount applied`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Apply Discount</h2>
              <p className="text-gray-600 mt-1">{item.title}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Discount Percentage
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={discountPercentage}
              onChange={(e) => setDiscountPercentage(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Shelf time over 30 days"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Original Price:</span>
              <span className="font-medium">${originalPrice}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Discount:</span>
              <span className="text-red-600">-{discountPercentage}%</span>
            </div>
            <div className="flex justify-between items-center border-t pt-2">
              <span className="font-medium">New Price:</span>
              <span className="font-bold text-lg text-green-600">${newPrice.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors font-medium"
            >
              Apply Discount
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Bulk Discount Modal Component
interface BulkDiscountModalProps {
  items: ConsignmentItem[];
  onApply: (days: number, discountPercentage: number) => void;
  onClose: () => void;
  getShelfDays: (item: ConsignmentItem) => number;
}

const BulkDiscountModal: React.FC<BulkDiscountModalProps> = ({ items, onApply, onClose, getShelfDays }) => {
  const discountOptions = [
    { days: 7, discount: 10, label: '7+ days - 10% off' },
    { days: 14, discount: 15, label: '14+ days - 15% off' },
    { days: 21, discount: 20, label: '21+ days - 20% off' },
    { days: 30, discount: 25, label: '30+ days - 25% off' },
    { days: 45, discount: 30, label: '45+ days - 30% off' },
    { days: 60, discount: 35, label: '60+ days - 35% off' },
  ];

  const getEligibleItemsCount = (days: number) => {
    return items.filter(item => {
      if (item.status !== 'live') return false;
      return getShelfDays(item) >= days;
    }).length;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Auto-Discount by Shelf Time</h2>
              <p className="text-gray-600 mt-1">Apply discounts to items based on how long they've been on the shelf</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="grid gap-3">
            {discountOptions.map((option) => {
              const eligibleCount = getEligibleItemsCount(option.days);
              return (
                <div
                  key={option.days}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-orange-300 transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{option.label}</div>
                    <div className="text-sm text-gray-500">
                      {eligibleCount} eligible items
                    </div>
                  </div>
                  <button
                    onClick={() => onApply(option.days, option.discount)}
                    disabled={eligibleCount === 0}
                    className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Apply to {eligibleCount}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-500 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-700">
                <strong>Note:</strong> Discounts will only be applied to items with "live" status. Items that already have discounts will have their discount updated based on the original price.
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Import Data Modal Component
interface ImportDataModalProps {
  onClose: () => void;
  onImportComplete: () => void;
}

const ImportDataModal: React.FC<ImportDataModalProps> = ({ onClose, onImportComplete }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<'csv' | 'json' | 'sql'>('csv');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [aiResults, setAiResults] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedItemsForImport, setSelectedItemsForImport] = useState<string[]>([]);
  const { user } = useAuth();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-detect file type based on extension
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'csv') setImportType('csv');
      else if (extension === 'json') setImportType('json');
      else if (extension === 'sql') setImportType('sql');
      
      // Reset preview state when new file is selected
      setShowPreview(false);
      setPreviewData([]);
      setAiResults(null);
      setSelectedItemsForImport([]);
    }
  };



  const handleAnalyze = async () => {
    if (!selectedFile || !user) return;

    // Read and analyze the file
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      
      // Always use AI analysis for intelligent data processing
      if (importType === 'csv' || importType === 'json') {
        await handleAIAnalysis(text, importType as 'csv' | 'json');
      } else {
        // Use traditional preview method for SQL files
        console.log('SQL import not yet implemented');
        setShowPreview(false);
      }
    };
    reader.readAsText(selectedFile);
  };

  const startImportProcess = async () => {
    if (!selectedFile || !user) return;
    
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Read file content
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        let importedData: any[] = [];

        try {
          // Check if we have AI-processed data with selections
          if (aiResults?.success && selectedItemsForImport.length > 0) {
            // Use only selected AI-processed items
            importedData = previewData.filter((item: any) => 
              selectedItemsForImport.includes(item.id)
            );
          } else if (showPreview && selectedItemsForImport.length > 0) {
            // Use selected fallback-parsed items
            importedData = previewData.filter((item: any) => 
              selectedItemsForImport.includes(item.id || `item-${previewData.indexOf(item)}`)
            );
          } else {
            // Traditional parsing for non-AI or fallback
            if (importType === 'csv') {
              const lines = text.split('\n').filter(line => line.trim());
              const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
              importedData = lines.slice(1).map(line => {
                const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                const obj: any = {};
                headers.forEach((header, index) => {
                  obj[header] = values[index] || '';
                });
                return obj;
              });
            } else if (importType === 'json') {
              const data = JSON.parse(text);
              importedData = Array.isArray(data) ? data : [data];
            }
          }

          // Now actually import the items to the database with barcode generation
          setUploadProgress(50);
          
          try {
            const importResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8002'}/api/admin/import-processed-items`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                items: importedData,
                import_source: aiResults?.success ? 'deepseek_ai' : (showPreview ? 'fallback_parser' : 'manual_import')
              })
            });

            if (!importResponse.ok) {
              throw new Error(`Failed to import items: ${importResponse.status}`);
            }

            const importResult = await importResponse.json();
            
            if (importResult.success) {
              // Log the import action
              await logUserAction(
                user,
                'data_import',
                `Successfully imported ${importResult.imported_count} items to database with barcode generation from ${importType.toUpperCase()} file${aiResults?.success ? ' (AI-processed)' : ''}`,
                selectedFile.name,
                `${importResult.imported_count} items with barcodes`
              );

              clearInterval(progressInterval);
              setUploadProgress(100);

              // Show success message with barcode info
              setTimeout(() => {
                onImportComplete();
              }, 1000);
            } else {
              throw new Error(importResult.message || 'Import failed');
            }
          } catch (importError) {
            console.error('Database import failed:', importError);
            
            // Log the failed import
            await logUserAction(
              user,
              'data_import_failed',
              `Failed to import ${importedData.length} items to database: ${importError instanceof Error ? importError.message : 'Unknown error'}`,
              selectedFile.name,
              `Failed import`
            );
            
            throw importError;
          }

        } catch (error) {
          console.error('Import error:', error);
          clearInterval(progressInterval);
          setIsUploading(false);
        }
      };

      reader.readAsText(selectedFile);

    } catch (error) {
      console.error('Import failed:', error);
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownloadTestData = (type: 'csv' | 'json' | 'sql') => {
    const testData = testDataFiles[type];
    const blob = new Blob([testData.content], { type: testData.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = testData.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAIAnalysis = async (fileContent: string, fileType: 'csv' | 'json' | 'sql') => {
    if (!user) return;

    setIsAnalyzing(true);
    setAiResults(null);
    
    try {
      // Create a manual fetch request to the analyze-data endpoint
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8002'}/api/admin/analyze-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw_data: fileContent,
          data_type: fileType
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setAiResults(result);
      
      if (result.success) {
        setPreviewData(result.items);
        // Select all items by default
        setSelectedItemsForImport(result.items.map((item: any) => item.id));
        setShowPreview(true);
      }
    } catch (error) {
      console.error('AI Analysis failed, falling back to basic preview:', error);
      
      // Fall back to basic CSV/JSON parsing when AI analysis fails
      try {
        const fallbackData = await handleBasicParsing(fileContent, fileType);
        setPreviewData(fallbackData);
        setShowPreview(true);
        // Select all items by default for fallback data too
        setSelectedItemsForImport(fallbackData.map(item => item.id));
        setAiResults({
          success: false,
          message: 'AI analysis timed out. Showing basic data preview instead.',
          error: 'Server timeout - using fallback parsing'
        });
      } catch (fallbackError) {
        setAiResults({
          success: false,
          message: 'Both AI analysis and basic parsing failed. Please check your file format.',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBasicParsing = async (fileContent: string, fileType: 'csv' | 'json' | 'sql'): Promise<any[]> => {
    if (fileType === 'csv') {
      const lines = fileContent.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const obj: any = { id: `csv-item-${index}` };
        headers.forEach((header, idx) => {
          obj[header] = values[idx] || '';
        });
        return obj;
      }).filter(row => Object.keys(row).length > 1); // Filter out empty rows
      return rows;
    } else if (fileType === 'json') {
      const data = JSON.parse(fileContent);
      const items = Array.isArray(data) ? data : [data];
      return items.map((item, index) => ({
        id: item.id || `json-item-${index}`,
        ...item
      }));
    } else if (fileType === 'sql') {
      // Basic SQL parsing for fallback - extract values from INSERT statements
      const insertPattern = /INSERT\s+INTO\s+\w+\s*\([^)]+\)\s*VALUES\s*\(([^)]+)\)/gi;
      const items: any[] = [];
      let match;
      let index = 0;
      
      while ((match = insertPattern.exec(fileContent)) !== null) {
        const valuesStr = match[1];
        const values = valuesStr.split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
        
        // Create a basic item structure for SQL data
        const obj: any = {
          id: `sql-item-${index}`,
          title: values[0] || 'SQL Import Item',
          brand: values[1] || 'Unknown',
          category: values[2] || 'Accessories',
          price: parseFloat(values[3]) || 0,
          condition: values[4] || 'Good'
        };
        
        items.push(obj);
        index++;
      }
      
      return items;
    }
    return [];
  };

  const handleItemSelection = (itemId: string) => {
    setSelectedItemsForImport(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleSelectAllItems = () => {
    if (selectedItemsForImport.length === previewData.length) {
      setSelectedItemsForImport([]);
    } else {
      setSelectedItemsForImport(previewData.map((item: any, index) => item.id || `item-${index}`));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Import Data</h2>
              <p className="text-gray-600 mt-1">Upload CSV, JSON, or SQL data sheets to import inventory items</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {!isUploading ? (
            <>
              {/* Download Test Data Section */}
              <div className="mb-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download Test Data
                </h3>
                <p className="text-gray-600 mb-4">Download sample data files to test the import functionality</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleDownloadTestData('csv')}
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Sample CSV
                  </button>
                  <button
                    onClick={() => handleDownloadTestData('json')}
                    className="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Sample JSON
                  </button>
                  <button
                    onClick={() => handleDownloadTestData('sql')}
                    className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Sample SQL
                  </button>
                </div>
              </div>

              {/* File Upload Section */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Import Format
                </label>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <button
                    onClick={() => setImportType('csv')}
                    className={`p-4 border-2 rounded-lg text-center transition-colors ${
                      importType === 'csv'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-lg font-semibold">CSV</div>
                    <div className="text-sm text-gray-500">Comma Separated Values</div>
                  </button>
                  <button
                    onClick={() => setImportType('json')}
                    className={`p-4 border-2 rounded-lg text-center transition-colors ${
                      importType === 'json'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-lg font-semibold">JSON</div>
                    <div className="text-sm text-gray-500">JavaScript Object Notation</div>
                  </button>
                  <button
                    onClick={() => setImportType('sql')}
                    className={`p-4 border-2 rounded-lg text-center transition-colors ${
                      importType === 'sql'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-lg font-semibold">SQL</div>
                    <div className="text-sm text-gray-500">SQL Insert Statements</div>
                  </button>
                </div>
                


                {/* File Drop Zone */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
                  <input
                    type="file"
                    accept={importType === 'csv' ? '.csv' : importType === 'json' ? '.json' : '.sql'}
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="text-lg font-medium text-gray-900 mb-2">
                      Click to upload or drag and drop
                    </div>
                    <div className="text-sm text-gray-500">
                      {importType.toUpperCase()} files only
                    </div>
                  </label>
                </div>

                {selectedFile && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{selectedFile.name}</div>
                        <div className="text-sm text-gray-500">
                          {formatFileSize(selectedFile.size)} • {importType.toUpperCase()}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedFile(null);
                          setShowPreview(false);
                          setPreviewData([]);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Analysis Loading State */}
              {isAnalyzing && (
                <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <svg className="w-8 h-8 text-blue-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">Analyzing Data</h3>
                      <p className="text-sm text-gray-600">Processing and formatting your data structure...</p>
                    </div>
                  </div>
                </div>
              )}

              {aiResults && !isAnalyzing && (
                <div className="mb-6">
                  <div className={`p-4 rounded-lg border ${
                    aiResults.success 
                      ? 'bg-green-50 border-green-200' 
                      : showPreview && previewData.length > 0
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-start">
                      <svg className={`w-5 h-5 mt-0.5 mr-2 ${
                        aiResults.success 
                          ? 'text-green-500' 
                          : showPreview && previewData.length > 0
                            ? 'text-yellow-500'
                            : 'text-red-500'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d={aiResults.success 
                            ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            : showPreview && previewData.length > 0
                              ? "M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              : "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          } 
                        />
                      </svg>
                      <div>
                        <h4 className={`font-semibold ${
                          aiResults.success 
                            ? 'text-green-800' 
                            : showPreview && previewData.length > 0
                              ? 'text-yellow-800'
                              : 'text-red-800'
                        }`}>
                          {aiResults.success 
                            ? 'AI Analysis Complete' 
                            : showPreview && previewData.length > 0
                              ? 'Using Fallback Parsing'
                              : 'Analysis Failed'
                          }
                        </h4>
                        <p className={`text-sm ${
                          aiResults.success 
                            ? 'text-green-700' 
                            : showPreview && previewData.length > 0
                              ? 'text-yellow-700'
                              : 'text-red-700'
                        }`}>
                          {aiResults.message}
                        </p>
                        {!aiResults.success && aiResults.error && !(showPreview && previewData.length > 0) && (
                          <p className="text-xs text-red-600 mt-1">
                            Error: {aiResults.error}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Preview with Selection */}
              {showPreview && previewData.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">
                      {aiResults?.success 
                        ? 'Review and Select Items' 
                        : showPreview && previewData.length > 0
                          ? 'Review and Select Items (Basic Parsing)'
                          : 'Data Preview'
                      }
                    </h3>
                                          {(aiResults?.success || (showPreview && previewData.length > 0)) && (
                        <div className="flex items-center space-x-4">
                          <span className="text-sm text-gray-600">
                            {selectedItemsForImport.length} of {previewData.length} items selected
                          </span>
                          <button
                            onClick={handleSelectAllItems}
                            className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-200 transition-colors"
                          >
                            {selectedItemsForImport.length === previewData.length ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                      )}
                  </div>

                  {(aiResults?.success || (showPreview && previewData.length > 0)) ? (
                    /* Processed Item Cards - Works for both AI and fallback data */
                    <div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        {previewData.map((item: any, index) => (
                          <div 
                            key={item.id || index}
                            className={`border rounded-lg p-4 transition-all duration-200 ${
                              selectedItemsForImport.includes(item.id || `item-${index}`)
                                ? 'border-purple-300 bg-purple-50 shadow-md'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h4 className="font-semibold text-gray-900 text-sm mb-1">
                                  {item.title || item['Product Name'] || item.name || item['item_title'] || 'Untitled Item'}
                                </h4>
                                <p className="text-xs text-gray-500 mb-2">
                                  {item.brand || item.Brand || item.manufacturer || 'Unknown'} • {item.category || item.Category || item.type || 'Unknown'}
                                </p>
                              </div>
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedItemsForImport.includes(item.id || `item-${index}`)}
                                  onChange={() => handleItemSelection(item.id || `item-${index}`)}
                                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                />
                              </label>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Price:</span>
                                <span className="font-medium text-green-600">
                                  ${item.price || item['Listing Price'] || item.originalPrice || item['Original Price'] || 'N/A'}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Condition:</span>
                                <span className="font-medium">{item.condition || item.Condition || 'Not specified'}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Size:</span>
                                <span className="font-medium">{item.size || item.Size || 'Not specified'}</span>
                              </div>
                              {(item.description || item.Description) && (
                                <div className="mt-2">
                                  <p className="text-xs text-gray-600 line-clamp-2">
                                    {(item.description || item.Description).substring(0, 100)}
                                    {(item.description || item.Description).length > 100 ? '...' : ''}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Import to Database Button */}
                      {selectedItemsForImport.length > 0 && (
                        <div className="flex justify-center">
                          <button
                            onClick={startImportProcess}
                            disabled={isUploading}
                            className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 text-lg"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            {isUploading ? 'Importing...' : `Import ${selectedItemsForImport.length} Items to Database`}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Traditional Table View */
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              {Object.keys(previewData[0] || {}).map((key) => (
                                <th key={key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {previewData.slice(0, 5).map((row, index) => (
                              <tr key={index}>
                                {Object.values(row).map((value: any, cellIndex) => (
                                  <td key={cellIndex} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                                    {String(value).substring(0, 50)}{String(value).length > 50 ? '...' : ''}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                                  <div className="text-sm text-gray-500 mt-3">
                  {aiResults?.success 
                    ? `Showing ${previewData.length} AI-processed items ready for review`
                    : showPreview && previewData.length > 0
                      ? `Showing ${previewData.length} items parsed with basic formatting`
                      : `Showing first ${Math.min(5, previewData.length)} of ${previewData.length} rows`
                  }
                </div>
                </div>
              )}

              {/* Import Instructions */}
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-blue-700">
                    <strong>Import Guidelines:</strong>
                    <ul className="mt-2 list-disc list-inside space-y-1">
                      <li>CSV files should have headers in the first row</li>
                      <li>JSON files should contain an array of objects or a single object</li>
                      <li>SQL files should contain INSERT statements</li>
                      <li>Required fields: title, price, category, condition</li>
                      <li>Optional fields: brand, size, color, material, description</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Upload Progress */
            <div className="text-center py-12">
              <div className="mb-4">
                <svg className="mx-auto h-16 w-16 text-orange-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Importing Data...</h3>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                <div 
                  className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <div className="text-sm text-gray-600">{uploadProgress}% complete</div>
              {uploadProgress === 100 && (
                <div className="mt-4 text-green-600 font-medium">
                  Import completed successfully!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isUploading && (
          <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAnalyze}
                disabled={!selectedFile || isAnalyzing}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {isAnalyzing ? 'Analyzing Data...' : 'Analyze Data'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Export Data Modal Component
interface ExportDataModalProps {
  items: ConsignmentItem[];
  filteredItems: ConsignmentItem[];
  onClose: () => void;
  user: AuthUser | null;
  showNotification: (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const ExportDataModal: React.FC<ExportDataModalProps> = ({ items, filteredItems, onClose, user, showNotification }) => {
  const [exportType, setExportType] = useState<'csv' | 'json' | 'excel'>('csv');
  const [dataScope, setDataScope] = useState<'all' | 'filtered' | 'custom'>('filtered');
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'title', 'price', 'category', 'brand', 'condition', 'status', 'createdAt'
  ]);
  const [customFilters, setCustomFilters] = useState({
    status: [] as string[],
    category: [] as string[],
    brand: [] as string[],
    dateRange: { start: '', end: '' }
  });
  const [includeImages, setIncludeImages] = useState(false);
  const [includeSalesData, setIncludeSalesData] = useState(false);
  const [includeAnalytics, setIncludeAnalytics] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Available fields for export
  const availableFields = [
    { key: 'id', label: 'Item ID', category: 'Basic' },
    { key: 'title', label: 'Title', category: 'Basic' },
    { key: 'description', label: 'Description', category: 'Basic' },
    { key: 'price', label: 'Price', category: 'Basic' },
    { key: 'originalPrice', label: 'Original Price', category: 'Basic' },
    { key: 'soldPrice', label: 'Sold Price', category: 'Sales' },
    { key: 'category', label: 'Category', category: 'Details' },
    { key: 'brand', label: 'Brand', category: 'Details' },
    { key: 'condition', label: 'Condition', category: 'Details' },
    { key: 'size', label: 'Size', category: 'Details' },
    { key: 'color', label: 'Color', category: 'Details' },
    { key: 'material', label: 'Material', category: 'Details' },
    { key: 'gender', label: 'Gender', category: 'Details' },
    { key: 'status', label: 'Status', category: 'Status' },
    { key: 'sellerName', label: 'Seller Name', category: 'Seller' },
    { key: 'sellerEmail', label: 'Seller Email', category: 'Seller' },
    { key: 'sellerId', label: 'Seller ID', category: 'Seller' },
    { key: 'createdAt', label: 'Date Listed', category: 'Dates' },
    { key: 'approvedAt', label: 'Date Approved', category: 'Dates' },
    { key: 'liveAt', label: 'Date Live', category: 'Dates' },
    { key: 'soldAt', label: 'Date Sold', category: 'Dates' },
    { key: 'discountPercentage', label: 'Discount %', category: 'Pricing' },
    { key: 'discountReason', label: 'Discount Reason', category: 'Pricing' },
    { key: 'barcodeData', label: 'Barcode', category: 'Inventory' },
    { key: 'trackingNumber', label: 'Tracking Number', category: 'Shipping' },
    { key: 'buyerInfo', label: 'Buyer Information', category: 'Sales' }
  ];

  const fieldCategories = [...new Set(availableFields.map(f => f.category))];

  const getDataToExport = () => {
    let data = items;
    
    if (dataScope === 'filtered') {
      data = filteredItems;
    } else if (dataScope === 'custom') {
      data = items.filter(item => {
        // Apply custom filters
        if (customFilters.status.length > 0 && !customFilters.status.includes(item.status)) {
          return false;
        }
        if (customFilters.category.length > 0 && !customFilters.category.includes(item.category || '')) {
          return false;
        }
        if (customFilters.brand.length > 0 && !customFilters.brand.includes(item.brand || '')) {
          return false;
        }
        if (customFilters.dateRange.start && new Date(item.createdAt) < new Date(customFilters.dateRange.start)) {
          return false;
        }
        if (customFilters.dateRange.end && new Date(item.createdAt) > new Date(customFilters.dateRange.end)) {
          return false;
        }
        return true;
      });
    }

    // Process the data based on selected fields
    return data.map(item => {
      const exportItem: any = {};
      
      selectedFields.forEach(field => {
        if (field === 'createdAt' || field === 'approvedAt' || field === 'liveAt' || field === 'soldAt') {
          exportItem[field] = item[field as keyof ConsignmentItem] ? 
            (item[field as keyof ConsignmentItem] as Date).toISOString() : '';
        } else if (field === 'buyerInfo') {
          exportItem[field] = item.buyerInfo ? JSON.stringify(item.buyerInfo) : '';
        } else if (field === 'images' && includeImages) {
          exportItem[field] = item.images ? item.images.join('; ') : '';
        } else {
          exportItem[field] = item[field as keyof ConsignmentItem] || '';
        }
      });

      // Add sales analytics if requested
      if (includeSalesData && item.status === 'sold') {
        exportItem.adminEarnings = (item.soldPrice || item.price) * 0.25;
        exportItem.userEarnings = (item.soldPrice || item.price) * 0.75;
        exportItem.saleType = item.saleType || 'unknown';
      }

      // Add analytics data if requested
      if (includeAnalytics) {
        const shelfDays = Math.floor((new Date().getTime() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        exportItem.daysOnShelf = shelfDays;
        exportItem.hasDiscount = !!item.discountPercentage;
        exportItem.priceChange = item.originalPrice ? item.originalPrice - item.price : 0;
      }

      return exportItem;
    });
  };

  const exportToCSV = (data: any[]) => {
    if (data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = (data: any[]) => {
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_export_${new Date().toISOString().split('T')[0]}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = (data: any[]) => {
    // For Excel export, we'll create a more detailed CSV that Excel can open
    if (data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join('\t'), // Use tabs for better Excel compatibility
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          return value || '';
        }).join('\t')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const data = getDataToExport();
      
      if (data.length === 0) {
        showNotification('No Data', 'No data to export with current filters', 'warning');
        setIsExporting(false);
        return;
      }

      // Add delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 1000));

      switch (exportType) {
        case 'csv':
          exportToCSV(data);
          break;
        case 'json':
          exportToJSON(data);
          break;
        case 'excel':
          exportToExcel(data);
          break;
      }

      // Log the export action
      if (user) {
        await logUserAction(
          user,
          'data_export',
          `Exported ${data.length} items as ${exportType.toUpperCase()}`,
          undefined,
          `${data.length} items`
        );
      }

      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      showNotification('Export Failed', 'Export failed. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFieldToggle = (fieldKey: string) => {
    setSelectedFields(prev => 
      prev.includes(fieldKey)
        ? prev.filter(f => f !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const handleSelectAllFields = () => {
    if (selectedFields.length === availableFields.length) {
      setSelectedFields(['title', 'price', 'category', 'status']);
    } else {
      setSelectedFields(availableFields.map(f => f.key));
    }
  };

  const handleCategoryToggle = (category: string) => {
    const categoryFields = availableFields.filter(f => f.category === category).map(f => f.key);
    const allCategorySelected = categoryFields.every(field => selectedFields.includes(field));
    
    if (allCategorySelected) {
      setSelectedFields(prev => prev.filter(f => !categoryFields.includes(f)));
    } else {
      setSelectedFields(prev => [...new Set([...prev, ...categoryFields])]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Export Inventory Data</h2>
              <p className="text-gray-600 mt-1">Download comprehensive inventory data in your preferred format</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Export Options */}
            <div className="space-y-6">
              {/* Export Format */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Export Format</h3>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setExportType('csv')}
                    className={`p-4 border-2 rounded-lg text-center transition-colors ${
                      exportType === 'csv'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold">CSV</div>
                    <div className="text-xs text-gray-500">Comma Separated</div>
                  </button>
                  <button
                    onClick={() => setExportType('json')}
                    className={`p-4 border-2 rounded-lg text-center transition-colors ${
                      exportType === 'json'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold">JSON</div>
                    <div className="text-xs text-gray-500">Structured Data</div>
                  </button>
                  <button
                    onClick={() => setExportType('excel')}
                    className={`p-4 border-2 rounded-lg text-center transition-colors ${
                      exportType === 'excel'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold">Excel</div>
                    <div className="text-xs text-gray-500">Spreadsheet</div>
                  </button>
                </div>
              </div>

              {/* Data Scope */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Data Scope</h3>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="dataScope"
                      value="all"
                      checked={dataScope === 'all'}
                      onChange={(e) => setDataScope(e.target.value as any)}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-medium">All Items ({items.length})</div>
                      <div className="text-sm text-gray-500">Export entire inventory database</div>
                    </div>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="dataScope"
                      value="filtered"
                      checked={dataScope === 'filtered'}
                      onChange={(e) => setDataScope(e.target.value as any)}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-medium">Current Filtered Items ({filteredItems.length})</div>
                      <div className="text-sm text-gray-500">Export items matching current dashboard filters</div>
                    </div>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="dataScope"
                      value="custom"
                      checked={dataScope === 'custom'}
                      onChange={(e) => setDataScope(e.target.value as any)}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-medium">Custom Selection</div>
                      <div className="text-sm text-gray-500">Define custom filters below</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Custom Filters */}
              {dataScope === 'custom' && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-800 mb-3">Custom Filters</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                      <div className="flex flex-wrap gap-2">
                        {['pending', 'approved', 'live', 'sold', 'archived'].map(status => (
                          <label key={status} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={customFilters.status.includes(status)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCustomFilters(prev => ({
                                    ...prev,
                                    status: [...prev.status, status]
                                  }));
                                } else {
                                  setCustomFilters(prev => ({
                                    ...prev,
                                    status: prev.status.filter(s => s !== status)
                                  }));
                                }
                              }}
                              className="mr-1"
                            />
                            <span className="text-sm capitalize">{status}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                        <input
                          type="date"
                          value={customFilters.dateRange.start}
                          onChange={(e) => setCustomFilters(prev => ({
                            ...prev,
                            dateRange: { ...prev.dateRange, start: e.target.value }
                          }))}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                        <input
                          type="date"
                          value={customFilters.dateRange.end}
                          onChange={(e) => setCustomFilters(prev => ({
                            ...prev,
                            dateRange: { ...prev.dateRange, end: e.target.value }
                          }))}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Options */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Additional Data</h3>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={includeImages}
                      onChange={(e) => setIncludeImages(e.target.checked)}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-medium">Include Image URLs</div>
                      <div className="text-sm text-gray-500">Export image URLs for each item</div>
                    </div>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={includeSalesData}
                      onChange={(e) => setIncludeSalesData(e.target.checked)}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-medium">Include Sales Analytics</div>
                      <div className="text-sm text-gray-500">Add earnings breakdown for sold items</div>
                    </div>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={includeAnalytics}
                      onChange={(e) => setIncludeAnalytics(e.target.checked)}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-medium">Include Performance Metrics</div>
                      <div className="text-sm text-gray-500">Add shelf time, discounts, and price changes</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column - Field Selection */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-gray-800">Select Fields to Export</h3>
                <button
                  onClick={handleSelectAllFields}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  {selectedFields.length === availableFields.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {fieldCategories.map(category => (
                  <div key={category} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium text-gray-700">{category}</h4>
                      <button
                        onClick={() => handleCategoryToggle(category)}
                        className="text-xs text-green-600 hover:text-green-700"
                      >
                        Toggle All
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {availableFields
                        .filter(field => field.category === category)
                        .map(field => (
                          <label key={field.key} className="flex items-center text-sm">
                            <input
                              type="checkbox"
                              checked={selectedFields.includes(field.key)}
                              onChange={() => handleFieldToggle(field.key)}
                              className="mr-2"
                            />
                            <span className={selectedFields.includes(field.key) ? 'text-gray-900' : 'text-gray-500'}>
                              {field.label}
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-700">
                  <strong>Selected:</strong> {selectedFields.length} fields
                  <br />
                  <strong>Estimated rows:</strong> {getDataToExport().length} items
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Ready to export {getDataToExport().length} items with {selectedFields.length} fields
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={selectedFields.length === 0 || isExporting}
                className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isExporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Exporting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    Export {exportType.toUpperCase()}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryDashboard; 