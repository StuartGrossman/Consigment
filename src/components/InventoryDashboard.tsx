import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, where, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem } from '../types';
import { AuthUser } from '../types';
import { logUserAction } from '../services/firebaseService';
import { useAuth } from '../hooks/useAuth';

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
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('newest');
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [viewMode, setViewMode] = useState<'individual' | 'grouped'>('individual');
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [selectedItemForDiscount, setSelectedItemForDiscount] = useState<ConsignmentItem | null>(null);
  const [showBulkDiscountModal, setShowBulkDiscountModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const { user } = useAuth();

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
  }, [items, searchQuery, statusFilter, categoryFilter, brandFilter, conditionFilter, genderFilter, sortBy]);

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
    const uniqueConditions = [...new Set(items.map(item => item.condition).filter(Boolean).filter((cond): cond is Exclude<typeof cond, ''> => cond !== ''))].sort();
    const uniqueGenders = [...new Set(items.map(item => item.gender).filter(Boolean).filter((gender): gender is Exclude<typeof gender, ''> => gender !== ''))].sort();
    
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
        item.color?.toLowerCase().includes(searchLower) ||
        item.id.toLowerCase().includes(searchLower)
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
      const updates = selectedItems.map(async (itemId) => {
        const itemRef = doc(db, 'items', itemId);
        const updateData: any = { status: newStatus };
        
        if (newStatus === 'live') {
          updateData.liveAt = new Date();
        } else if (newStatus === 'approved') {
          updateData.approvedAt = new Date();
        }
        
        return updateDoc(itemRef, updateData);
      });

      await Promise.all(updates);
      
      // Log the bulk action
      await logUserAction(user, 'bulk_action', `Bulk updated ${selectedItems.length} items to ${newStatus}`);
      
      await fetchAllItems();
      setSelectedItems([]);
      setShowBulkActions(false);
    } catch (error) {
      console.error('Error updating items:', error);
    }
  };

  const handleSingleItemAction = async (itemId: string, action: string) => {
    try {
      const itemRef = doc(db, 'items', itemId);
      const updateData: any = { status: action };
      
      if (action === 'live') {
        updateData.liveAt = new Date();
      } else if (action === 'approved') {
        updateData.approvedAt = new Date();
      } else if (action === 'archived') {
        updateData.archivedAt = new Date();
      }
      
      await updateDoc(itemRef, updateData);
      
      // Find the item for logging
      const item = items.find(i => i.id === itemId);
      if (item) {
        await logUserAction(user, `item_${action}`, `Updated item status to ${action}`, itemId, item.title);
      }
      
      await fetchAllItems();
    } catch (error) {
      console.error('Error updating item:', error);
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
            onClick={() => setShowImportModal(true)}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Import Data
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

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border p-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items, brands, sellers..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          {/* Brand Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Brand</label>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Brands</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>

          {/* Condition Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Condition</label>
            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Conditions</option>
              {conditions.map((condition) => (
                <option key={condition} value={condition}>{condition}</option>
              ))}
            </select>
          </div>

          {/* Gender Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Genders</option>
              {genders.map((gender) => (
                <option key={gender} value={gender}>{gender}</option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bulk Actions</label>
            <button
              onClick={() => setShowBulkActions(!showBulkActions)}
              disabled={selectedItems.length === 0}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
            >
              Actions ({selectedItems.length})
            </button>
          </div>
        </div>

        {/* Bulk Actions Panel */}
        {showBulkActions && selectedItems.length > 0 && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleBulkStatusChange('approved')}
                className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
              >
                Move to Approved
              </button>
              <button
                onClick={() => handleBulkStatusChange('live')}
                className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
              >
                Make Live
              </button>
              <button
                onClick={() => handleBulkStatusChange('archived')}
                className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
              >
                Archive Items
              </button>
              <button
                onClick={() => setShowBulkActions(false)}
                className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
              >
                Cancel
              </button>
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
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
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
                        <div>
                          <div className="text-sm font-medium text-gray-900">{item.title}</div>
                          <div className="text-sm text-gray-500">
                            {item.category && `${item.category} • `}
                            {item.brand && `${item.brand} • `}
                            {item.condition && `${item.condition}`}
                            {item.gender && ` • ${item.gender}`}
                            {item.size && ` • Size ${item.size}`}
                          </div>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {item.status === 'live' && (
                          <button
                            onClick={() => handleDiscountClick(item)}
                            className="text-orange-600 hover:text-orange-900"
                          >
                            Discount
                          </button>
                        )}
                        {item.status !== 'archived' && (
                          <button
                            onClick={() => handleSingleItemAction(item.id, 'archived')}
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
                  <tr key={group.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
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
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
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
      
      // Show preview for supported formats
      if (extension === 'csv' || extension === 'json') {
        handlePreview(file, extension as 'csv' | 'json');
      }
    }
  };

  const handlePreview = async (file: File, type: 'csv' | 'json') => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      
      if (type === 'csv') {
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const rows = lines.slice(1, 6).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = values[index] || '';
          });
          return obj;
        });
        setPreviewData(rows);
      } else if (type === 'json') {
        try {
          const data = JSON.parse(text);
          setPreviewData(Array.isArray(data) ? data.slice(0, 5) : [data]);
        } catch (error) {
          console.error('Invalid JSON format');
        }
      }
      
      setShowPreview(true);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
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

          // Log the import action
          await logUserAction(
            user,
            'data_import',
            `Imported ${importedData.length} items from ${importType.toUpperCase()} file`,
            selectedFile.name,
            `${importedData.length} items`
          );

          clearInterval(progressInterval);
          setUploadProgress(100);

          // Show success message
          setTimeout(() => {
            onImportComplete();
          }, 1000);

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

              {/* Data Preview */}
              {showPreview && previewData.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Data Preview</h3>
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
                          {previewData.map((row, index) => (
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
                  <div className="text-sm text-gray-500 mt-2">
                    Showing first {previewData.length} rows
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
                <svg className="mx-auto h-16 w-16 text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Importing Data...</h3>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
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
                onClick={handleImport}
                disabled={!selectedFile}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                Import Data
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryDashboard; 