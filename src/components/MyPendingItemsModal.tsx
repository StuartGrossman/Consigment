import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { ConsignmentItem, AuthUser } from '../types';
import { apiService } from '../services/apiService';

interface MyPendingItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
}

const MyPendingItemsModal: React.FC<MyPendingItemsModalProps> = ({ isOpen, onClose, user }) => {
  const [myItems, setMyItems] = useState<ConsignmentItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ConsignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<ConsignmentItem | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      fetchMyItems();
    }
  }, [isOpen, user]);

  useEffect(() => {
    // Filter to show only pending and rejected items (no refunded items)
    const statusFiltered = myItems.filter(item => 
      item.status === 'pending' || item.status === 'rejected'
    );
    
    setFilteredItems(statusFiltered);
  }, [myItems]);

  const fetchMyItems = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const itemsRef = collection(db, 'items');
      const q = query(
        itemsRef, 
        where('sellerId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      
      const items: ConsignmentItem[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          approvedAt: data.approvedAt?.toDate(),
          liveAt: data.liveAt?.toDate(),
          rejectedAt: data.rejectedAt?.toDate(),
          soldAt: data.soldAt?.toDate()
        } as ConsignmentItem);
      });

      setMyItems(items);
    } catch (error: any) {
      console.error('Error fetching my items:', error);
      // Try fallback query without ordering if index not ready
      try {
        const itemsRef = collection(db, 'items');
        const q = query(itemsRef, where('sellerId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        
        const items: ConsignmentItem[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            approvedAt: data.approvedAt?.toDate(),
            liveAt: data.liveAt?.toDate(),
            rejectedAt: data.rejectedAt?.toDate(),
            soldAt: data.soldAt?.toDate()
          } as ConsignmentItem);
        });

        // Sort manually
        items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setMyItems(items);
      } catch (fallbackError) {
        console.error('Error fetching my items (fallback):', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (item: ConsignmentItem) => {
    // Prevent editing admin-created items
    if (item.adminCreated) {
      alert('This item was added by an admin on your behalf. You cannot edit admin-created items.');
      return;
    }
    
    if (item.status === 'pending' || item.status === 'rejected') {
      setEditingItem(item);
    }
  };

  const handleSaveEdit = async (updatedItem: ConsignmentItem, newImages?: string[]) => {
    setProcessingAction(`edit-${updatedItem.id}`);
    try {
      const updateData: any = {
        title: updatedItem.title,
        description: updatedItem.description,
        price: updatedItem.price,
        category: updatedItem.category,
        gender: updatedItem.gender,
        size: updatedItem.size,
        brand: updatedItem.brand,
        condition: updatedItem.condition,
        material: updatedItem.material
      };

      // If new images were provided, include them
      if (newImages) {
        updateData.images = newImages;
      }

      await apiService.updateUserItem(updatedItem.id, updateData);

      // Update local state
      setMyItems(prev => prev.map(item => 
        item.id === updatedItem.id ? { ...updatedItem, images: newImages || updatedItem.images } : item
      ));
      
      setEditingItem(null);
      console.log('✅ Item updated successfully');
    } catch (error) {
      console.error('❌ Failed to update item:', error);
    } finally {
      setProcessingAction(null);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    // Find the item to check if it's admin-created
    const item = myItems.find(i => i.id === itemId);
    if (item?.adminCreated) {
      alert('This item was added by an admin on your behalf. You cannot delete admin-created items. Please contact an admin if you need to remove this item.');
      return;
    }
    
    setProcessingAction(`delete-${itemId}`);
    try {
      await apiService.removeUserItem(itemId);
      
      // Remove from local state
      setMyItems(prev => prev.filter(i => i.id !== itemId));
      setEditingItem(null);
      console.log('✅ Item deleted successfully');
    } catch (error) {
      console.error('❌ Failed to delete item:', error);
    } finally {
      setProcessingAction(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-blue-100 text-blue-800';
      case 'live':
        return 'bg-green-100 text-green-800';
      case 'sold':
        return 'bg-purple-100 text-purple-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusDescription = (item: ConsignmentItem) => {
    switch (item.status) {
      case 'pending':
        return 'Your item is waiting for admin review. Please bring the physical item to the front desk.';
      case 'rejected':
        return 'Your item was rejected during review. You can edit and resubmit it.';
      default:
        return 'Status unknown.';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="mobile-admin-modal">
      <div className="mobile-admin-modal-content">
        <div className="mobile-admin-modal-header">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800">My Pending Items</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Manage your pending and rejected items • Click to edit or delete
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 -m-2 mobile-touch-target"
            >
              <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mobile-admin-modal-body">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-6m-10 0h6m0 0L12 18l-4-5" />
                </svg>
              </div>
              <p className="text-gray-500 text-lg">
                No pending or rejected items
              </p>
              <p className="text-gray-400 text-sm mt-2">
                Items that are approved, live, or sold are not shown here
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4 sm:space-y-6">
              {filteredItems.map((item) => (
                <div 
                  key={item.id} 
                  className="border border-gray-200 rounded-lg p-4 sm:p-6 bg-white transition-colors hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleEditItem(item)}
                >
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Item Image */}
                    <div className="flex-shrink-0 self-center sm:self-start">
                      {item.images && item.images.length > 0 ? (
                        <div className="relative">
                          <img
                            src={item.images[0]}
                            alt={item.title}
                            className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg"
                          />
                          {item.images.length > 1 && (
                            <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                              +{item.images.length - 1}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">
                            {item.title}
                          </h3>
                          {item.adminCreated && (
                            <div className="flex items-center gap-1 mt-1">
                              <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-xs text-purple-600 font-medium">Added by Admin</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold text-green-600">
                            ${item.price.toFixed(2)}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(item.status)}`}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                        {item.description}
                      </p>

                      {/* Status Information */}
                      <div className="bg-gray-50 rounded-lg p-3 mb-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Status Update</h4>
                        <p className="text-sm text-gray-700 mb-2">
                          {getStatusDescription(item)}
                        </p>
                        
                        {/* Rejection Reason */}
                        {item.status === 'rejected' && item.rejectionReason && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                            <h5 className="text-sm font-medium text-red-900 mb-1">Rejection Reason:</h5>
                            <p className="text-sm text-red-800">{item.rejectionReason}</p>
                            <p className="text-xs text-red-600 mt-2">
                              You can edit and resubmit this item, or contact us if you have questions.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Instructions */}
                      <div className={`border rounded-lg p-3 mb-4 ${
                        item.adminCreated 
                          ? 'bg-purple-50 border-purple-200' 
                          : 'bg-blue-50 border-blue-200'
                      }`}>
                        <p className={`text-sm ${
                          item.adminCreated ? 'text-purple-800' : 'text-blue-800'
                        }`}>
                          {item.adminCreated ? (
                            <>
                              🔒 <strong>Admin-created item</strong> - You can view and edit this item, but cannot delete it. Contact an admin if you need it removed.
                            </>
                          ) : (
                            <>
                              💡 <strong>Click anywhere on this item</strong> to edit details, change photos, or delete it.
                            </>
                          )}
                        </p>
                      </div>

                      {/* Timeline */}
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>
                          <span className="font-medium">Submitted:</span> {item.createdAt.toLocaleDateString()} at {item.createdAt.toLocaleTimeString()}
                        </div>
                        {item.rejectedAt && (
                          <div>
                            <span className="font-medium">Rejected:</span> {item.rejectedAt.toLocaleDateString()} at {item.rejectedAt.toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <EditUserItemModal
          item={editingItem}
          user={user}
          onSave={handleSaveEdit}
          onDelete={handleDeleteItem}
          onCancel={() => setEditingItem(null)}
          isProcessing={processingAction === `edit-${editingItem.id}` || processingAction === `delete-${editingItem.id}`}
        />
      )}
    </div>
  );
};

// Edit Item Modal Component for User's Own Items
interface EditUserItemModalProps {
  item: ConsignmentItem;
  user: AuthUser | null;
  onSave: (item: ConsignmentItem, newImages?: string[]) => void;
  onDelete: (itemId: string) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

const EditUserItemModal: React.FC<EditUserItemModalProps> = ({ item, user, onSave, onDelete, onCancel, isProcessing }) => {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [price, setPrice] = useState(item.price.toString());
  const [category, setCategory] = useState(item.category || '');
  const [gender, setGender] = useState(item.gender || '');
  const [size, setSize] = useState(item.size || '');
  const [brand, setBrand] = useState(item.brand || '');
  const [condition, setCondition] = useState(item.condition || '');
  const [material, setMaterial] = useState(item.material || '');
  const [showValidationError, setShowValidationError] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Photo management
  const [currentImages, setCurrentImages] = useState<string[]>(item.images || []);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  // User selection for admin
  const [selectedUserId, setSelectedUserId] = useState(item.sellerId || 'store');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [showUserSelection, setShowUserSelection] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const totalImages = currentImages.length + newImages.length + selectedFiles.length;
      
      if (totalImages > 5) {
        setValidationMessage('Maximum 5 images allowed');
        setShowValidationError(true);
        return;
      }
      
      setNewImages(prev => [...prev, ...selectedFiles]);
    }
  };

  const removeCurrentImage = (index: number) => {
    setCurrentImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeNewImage = (index: number) => {
    setNewImages(prev => prev.filter((_, i) => i !== index));
  };

  // User search functionality for admin
  const searchUsers = async (query: string) => {
    if (!query.trim() || query.length < 3) {
      setUserSearchResults([]);
      return;
    }

    setIsSearchingUsers(true);
    try {
      const result = await apiService.searchUsers(query);
      if (result.success && result.customers) {
        const userOptions = result.customers.map((customer: any) => ({
          id: customer.uid || customer.id,
          displayName: customer.displayName || customer.name || customer.email?.split('@')[0] || 'Unknown User',
          email: customer.email || ''
        }));
        setUserSearchResults(userOptions);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      setUserSearchResults([]);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  // Debounced user search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (userSearchQuery) {
        searchUsers(userSearchQuery);
      } else {
        setUserSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [userSearchQuery]);

  // Get selected user info
  const getSelectedUserInfo = () => {
    if (selectedUserId === 'store') {
      return {
        id: 'store',
        displayName: 'Store',
        email: 'store@summitgear.com'
      };
    }
    
    const selectedUser = userSearchResults.find(u => u.id === selectedUserId);
    return selectedUser || {
      id: item.sellerId || 'store',
      displayName: item.sellerName || 'Store',
      email: item.sellerEmail || 'store@summitgear.com'
    };
  };

  const uploadImages = async (files: File[]): Promise<string[]> => {
    const uploadPromises = files.map(async (file, index) => {
      const fileName = `items/${user?.uid}/${Date.now()}_${index}_${file.name}`;
      const storageRef = ref(storage, fileName);
      
      try {
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
      } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
      }
    });

    return Promise.all(uploadPromises);
  };

  const handleSave = async () => {
    if (!title.trim() || !description.trim() || !price.trim()) {
      setValidationMessage('Please fill in all required fields');
      setShowValidationError(true);
      return;
    }

    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue <= 0) {
      setValidationMessage('Please enter a valid price greater than 0');
      setShowValidationError(true);
      return;
    }

    try {
      setUploading(true);
      
      // Upload new images if any
      let uploadedImageUrls: string[] = [];
      if (newImages.length > 0) {
        uploadedImageUrls = await uploadImages(newImages);
      }

      // Combine current images with newly uploaded ones
      const allImages = [...currentImages, ...uploadedImageUrls];

      const updatedItem = {
        ...item,
        title: title.trim(),
        description: description.trim(),
        price: priceValue,
        category: category || undefined,
        gender: (gender as 'Men' | 'Women' | 'Unisex' | '') || undefined,
        size: size || undefined,
        brand: brand.trim() || undefined,
        condition: (condition as 'New' | 'Like New' | 'Good' | 'Fair' | '') || undefined,
        material: material.trim() || undefined,
        images: allImages
      };

      // If user is admin and user association has changed, update it
      if ((user as any)?.isAdmin && selectedUserId !== item.sellerId) {
        try {
          await apiService.updateItemUser(item.id, selectedUserId);
          console.log('✅ Item user association updated successfully');
        } catch (error) {
          console.error('❌ Failed to update item user association:', error);
          setValidationMessage('Failed to update item user association. Please try again.');
          setShowValidationError(true);
          setUploading(false);
          return;
        }
      }

      onSave(updatedItem, allImages);
    } catch (error) {
      console.error('Error saving item:', error);
      setValidationMessage('Failed to save item. Please try again.');
      setShowValidationError(true);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    onDelete(item.id);
    setShowDeleteConfirm(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1000] backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-800">Edit Item</h3>
          <p className="text-sm text-gray-600 mt-1">Update details, photos, or delete this item</p>
        </div>
        
        <div className="p-6 space-y-6 max-h-[calc(95vh-200px)] overflow-y-auto">
          {/* Main Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter item title..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      setPrice(value);
                    }
                  }}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Describe your item in detail..."
            />
          </div>

          {/* User Association (Admin Only) */}
          {(user as any)?.isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Item Owner
              </label>
              
              {/* Current Selection Display */}
              <div className="mb-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {getSelectedUserInfo().displayName}
                      </div>
                      <div className="text-sm text-gray-600">
                        {getSelectedUserInfo().email}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowUserSelection(!showUserSelection)}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* User Selection Dropdown */}
              {showUserSelection && (
                <div className="space-y-3">
                  {/* Store Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserId('store');
                      setShowUserSelection(false);
                    }}
                    className={`w-full p-3 text-left rounded-lg border transition-colors ${
                      selectedUserId === 'store'
                        ? 'bg-blue-50 border-blue-300 text-blue-900'
                        : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium">Store</div>
                        <div className="text-sm text-gray-600">store@summitgear.com</div>
                      </div>
                    </div>
                  </button>

                  {/* User Search */}
                  <div>
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="Search for a user..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Search Results */}
                  {isSearchingUsers && (
                    <div className="text-center py-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                    </div>
                  )}

                  {userSearchResults.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {userSearchResults.map((userOption) => (
                        <button
                          key={userOption.id}
                          type="button"
                          onClick={() => {
                            setSelectedUserId(userOption.id);
                            setShowUserSelection(false);
                            setUserSearchQuery('');
                            setUserSearchResults([]);
                          }}
                          className={`w-full p-3 text-left rounded-lg border transition-colors ${
                            selectedUserId === userOption.id
                              ? 'bg-blue-50 border-blue-300 text-blue-900'
                              : 'bg-white border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium">{userOption.displayName}</div>
                              <div className="text-sm text-gray-600">{userOption.email}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {userSearchQuery && userSearchResults.length === 0 && !isSearchingUsers && (
                    <div className="text-center py-2 text-gray-500">
                      No users found
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Photos Section */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <label className="text-lg font-medium text-gray-900">
                📸 Photos ({currentImages.length + newImages.length}/5)
              </label>
              {(currentImages.length + newImages.length) < 5 && (
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    id="image-upload"
                  />
                  <label htmlFor="image-upload" className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Photos
                  </label>
                </div>
              )}
            </div>
            
            {/* Photo Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {/* Current Images */}
              {currentImages.map((imageUrl, index) => (
                <div key={`current-${index}`} className="relative group">
                  <div className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-300 transition-colors">
                    <img
                      src={imageUrl}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCurrentImage(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove photo"
                  >
                    ×
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Current Photo {index + 1}
                  </div>
                </div>
              ))}

              {/* New Images */}
              {newImages.map((image, index) => (
                <div key={`new-${index}`} className="relative group">
                  <div className="aspect-square rounded-lg overflow-hidden border-2 border-green-300 hover:border-green-400 transition-colors">
                    <img
                      src={URL.createObjectURL(image)}
                      alt={`New Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeNewImage(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove photo"
                  >
                    ×
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-green-600 bg-opacity-90 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    New Photo {index + 1}
                  </div>
                </div>
              ))}

              {/* Add Photo Placeholder */}
              {(currentImages.length + newImages.length) < 5 && (
                <div className="relative">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    id="image-upload-placeholder"
                  />
                  <label htmlFor="image-upload-placeholder" className="cursor-pointer block">
                    <div className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 flex flex-col items-center justify-center">
                      <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span className="text-sm text-gray-600 text-center">Add Photo</span>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Photo Instructions */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Photo Tips:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Upload clear, well-lit photos of your item</li>
                    <li>• Show any damage or wear clearly</li>
                    <li>• Include photos from multiple angles</li>
                    <li>• Maximum 5 photos allowed</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div className="border-t border-gray-200 pt-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4">Additional Details</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Category</option>
                  <option value="Climbing">Climbing 🧗</option>
                  <option value="Skiing">Skiing ⛷️</option>
                  <option value="Hiking">Hiking 🥾</option>
                  <option value="Camping">Camping ⛺</option>
                  <option value="Mountaineering">Mountaineering 🏔️</option>
                  <option value="Snowboarding">Snowboarding 🏂</option>
                  <option value="Cycling">Cycling 🚵</option>
                  <option value="Water Sports">Water Sports 🚣</option>
                  <option value="Apparel">Apparel 👕</option>
                  <option value="Footwear">Footwear 👟</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Gender</option>
                  <option value="Men">Men</option>
                  <option value="Women">Women</option>
                  <option value="Unisex">Unisex</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Size</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
                  <option value="8">8</option>
                  <option value="9">9</option>
                  <option value="10">10</option>
                  <option value="11">11</option>
                  <option value="12">12</option>
                  <option value="13">13</option>
                  <option value="One Size">One Size</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Condition</option>
                  <option value="New">New - Never used</option>
                  <option value="Like New">Like New - Minimal wear</option>
                  <option value="Good">Good - Some wear but functional</option>
                  <option value="Fair">Fair - Well used but still works</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Patagonia, REI"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
                <input
                  type="text"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Gore-Tex, Cotton"
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isProcessing || uploading}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isProcessing || uploading || item.adminCreated}
            className={`px-4 py-2 text-white rounded-lg transition-colors ${
              item.adminCreated 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-red-600 hover:bg-red-700'
            } disabled:opacity-50`}
            title={item.adminCreated ? 'Admin-created items cannot be deleted by users' : 'Delete this item'}
          >
            {item.adminCreated ? 'Cannot Delete' : 'Delete Item'}
          </button>
          <button
            onClick={handleSave}
            disabled={isProcessing || uploading}
            className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {uploading ? 'Uploading...' : isProcessing ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-70">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-red-600 text-xl">⚠️</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Item</h3>
              </div>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete "{item.title}"? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Validation Error Modal */}
        {showValidationError && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-70">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-red-600 text-xl">⚠️</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Validation Error</h3>
              </div>
              <p className="text-gray-600 mb-6">{validationMessage}</p>
              <div className="flex justify-end">
                <button
                  onClick={() => setShowValidationError(false)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyPendingItemsModal; 