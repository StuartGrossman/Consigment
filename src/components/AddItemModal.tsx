import React, { useState, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { AuthUser } from '../types';
import { logUserActionSafe, saveUserItem } from '../services/userService';
import { useRateLimiter } from '../hooks/useRateLimiter';
import { useAuth } from '../hooks/useAuth';
import { apiService } from '../services/apiService';
import NotificationModal from './NotificationModal';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
}

interface UserOption {
  id: string;
  displayName: string;
  email: string;
}

const AddItemModal: React.FC<AddItemModalProps> = ({ isOpen, onClose, user }) => {
  const { isAdmin } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationData, setNotificationData] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  // User selection state for admins
  const [selectedUserId, setSelectedUserId] = useState<'store' | 'search' | string>('store'); // Default to store
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserOption[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Helper function to show notifications
  const showNotificationModal = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    setNotificationData({ title, message, type });
    setShowNotification(true);
  };
  
  // Rate limiting hook
  const { executeWithRateLimit } = useRateLimiter();
  
  // New fields for filtering
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState('');
  const [size, setSize] = useState('');
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState('');
  const [material, setMaterial] = useState('');
  const [color, setColor] = useState('');

  // User search functionality
  const searchUsers = async (query: string) => {
    if (!query.trim() || query.length < 3) {
      setUserSearchResults([]);
      return;
    }

    setIsSearchingUsers(true);
    try {
      const result = await apiService.searchUsers(query);
      if (result.success && result.customers) {
        const userOptions: UserOption[] = result.customers.map((customer: any) => ({
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
      id: user?.uid || '',
      displayName: user?.displayName || 'Anonymous',
      email: user?.email || ''
    };
  };

  if (!isOpen) return null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setImages(prev => [...prev, ...selectedFiles].slice(0, 5)); // Limit to 5 images
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
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

  const handlePreview = () => {
    if (!title.trim() || !description.trim() || !price.trim()) {
      showNotificationModal('Missing Information', 'Please fill in all required fields before previewing', 'warning');
      return;
    }

    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue <= 0) {
      showNotificationModal('Invalid Price', 'Please enter a valid price greater than 0', 'warning');
      return;
    }

    setShowPreview(true);
  };

  const handleSubmit = async () => {
    if (!user) return;

    // Use rate limiter for item creation
    const result = await executeWithRateLimit('item_create', async () => {
      setUploading(true);

      try {
        // Upload images to Firebase Storage
        const imageUrls = await uploadImages(images);

        // Get selected user info
        const selectedUserInfo = getSelectedUserInfo();

        // Prepare item data, only including fields that have values
        const itemData: any = {
          title: title.trim(),
          description: description.trim(),
          price: parseFloat(price),
          images: imageUrls,
          sellerId: selectedUserInfo.id,
          sellerName: selectedUserInfo.displayName,
          sellerEmail: selectedUserInfo.email,
        };

        // Add admin-created flag if admin is creating for a user
        if (isAdmin && selectedUserId !== 'store') {
          itemData.adminCreated = true;
          itemData.adminCreatedBy = user?.uid;
          itemData.adminCreatedAt = new Date().toISOString();
        }

        // Only add optional fields if they have values
        if (category && category.trim()) {
          itemData.category = category.trim();
        }
        if (gender && gender.trim()) {
          itemData.gender = gender;
        }
        if (size && size.trim()) {
          itemData.size = size.trim();
        }
        if (brand && brand.trim()) {
          itemData.brand = brand.trim();
        }
        if (condition && condition.trim()) {
          itemData.condition = condition;
        }
        if (material && material.trim()) {
          itemData.material = material.trim();
        }
        if (color && color.trim()) {
          itemData.color = color.trim();
        }

        let itemId: string | null;

        // Both users and admins use the same server API to create items
        // Items go directly to pending queue for review
        const result = await apiService.createItem(itemData);
        itemId = result.itemId;
        
        console.log('✅ Item created and added to pending queue:', itemId);

        if (itemId) {
          await logUserActionSafe(user, 'item_created', `Created new item: ${title}`, itemId, title);
          setShowSuccess(true);
        } else {
          throw new Error('Failed to save item');
        }
      } catch (error) {
        console.error('Error creating item:', error);
        showNotificationModal('Creation Failed', 'Failed to create item. Please try again.', 'error');
      } finally {
        setUploading(false);
      }
    });

    if (!result.success) {
      showNotificationModal('Error Adding Item', result.error || 'Error adding item. Please try again.', 'error');
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPrice('');
    setImages([]);
    setShowPreview(false);
    setShowSuccess(false);
    setUploading(false);
    // Reset new fields
    setCategory('');
    setGender('');
    setSize('');
    setBrand('');
    setCondition('');
    setMaterial('');
    setColor('');
    // Reset user selection
    setSelectedUserId('store');
    setUserSearchQuery('');
    setUserSearchResults([]);
    setShowUserDropdown(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Success Modal
  if (showSuccess) {
    return (
      <>
        <div className="modal-backdrop flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Item Submitted for Review!
            </h3>
            <p className="text-gray-600 mb-6">
              Your item has been submitted and added to the pending review queue. It will be reviewed by our team before going live.
            </p>
            {!isAdmin && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  <strong>Next Steps:</strong><br />
                  1. Your item is in the pending review queue<br />
                  2. Bring the physical item to the front desk<br />
                  3. Our team will review and approve it<br />
                  4. Once approved, it goes live for all customers
                </p>
              </div>
            )}
            <button
              onClick={handleClose}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
            >
              {isAdmin ? "Done" : "Got it, thanks!"}
            </button>
          </div>
                  </div>
        </div>

        {/* Notification Modal */}
        <NotificationModal
          isOpen={showNotification}
          onClose={() => setShowNotification(false)}
          title={notificationData.title}
          message={notificationData.message}
          type={notificationData.type}
        />
      </>
    );
  }

  // Preview Modal
  if (showPreview) {
    return (
      <div className="modal-backdrop flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white p-6 border-b border-gray-200 rounded-t-xl">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">Preview Item</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Preview Content */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Image Preview */}
              <div className="relative h-64 bg-gray-200">
                {images.length > 0 ? (
                  <>
                    <img
                      src={URL.createObjectURL(images[0])}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    {images.length > 1 && (
                      <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                        +{images.length - 1} more
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <div className="text-center">
                      <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm">No photos added</p>
                      <p className="text-xs">Photos can be added later</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Content Preview */}
              <div className="p-6">
                <h3 className="font-semibold text-xl text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-600 text-sm mb-4">{description}</p>
                
                <div className="flex justify-between items-center mb-4">
                  <div className="text-2xl font-bold text-green-600">
                    ${parseFloat(price).toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-500">
                    by {isAdmin ? getSelectedUserInfo().displayName : user?.displayName}
                  </div>
                </div>

                {/* Item Details Preview */}
                {(category || gender || size || brand || condition || material || color) && (
                  <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Item Details</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {category && (
                        <div><span className="text-gray-500">Category:</span> <span className="font-medium">{category}</span></div>
                      )}
                      {gender && (
                        <div><span className="text-gray-500">Gender:</span> <span className="font-medium">{gender}</span></div>
                      )}
                      {size && (
                        <div><span className="text-gray-500">Size:</span> <span className="font-medium">{size}</span></div>
                      )}
                      {brand && (
                        <div><span className="text-gray-500">Brand:</span> <span className="font-medium">{brand}</span></div>
                      )}
                      {condition && (
                        <div><span className="text-gray-500">Condition:</span> <span className="font-medium">{condition}</span></div>
                      )}
                      {material && (
                        <div><span className="text-gray-500">Material:</span> <span className="font-medium">{material}</span></div>
                      )}
                      {color && (
                        <div><span className="text-gray-500">Color:</span> <span className="font-medium">{color}</span></div>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-100">
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    pending review
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-6">
              <button
                onClick={() => setShowPreview(false)}
                disabled={uploading}
                className="flex-1 px-6 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleSubmit}
                disabled={uploading}
                className="flex-1 px-6 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Submitting...
                  </div>
                ) : (
                  'Confirm & Submit'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Form Modal
  return (
    <div className="modal-backdrop flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200 rounded-t-xl">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Add Item for Consignment</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Item Title *
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter item title"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Describe your item in detail..."
              required
            />
          </div>

          {/* Price */}
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-2">
              Asking Price *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
              <input
                type="text"
                id="price"
                value={price}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow only numbers and decimal point
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setPrice(value);
                  }
                }}
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* User Selection (Admin Only) */}
          {isAdmin && (
            <div>
              <label htmlFor="user-selection" className="block text-sm font-medium text-gray-700 mb-2">
                Item Owner *
              </label>
              <div className="relative">
                {(selectedUserId === 'store' || selectedUserId === 'search') ? (
                  <select
                    id="user-selection"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="store">🏪 Store (Default)</option>
                    <option value="search">🔍 Search for User...</option>
                  </select>
                ) : (
                  <div className="w-full px-4 py-3 border border-green-300 bg-green-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-green-700 font-medium">
                          👤 {getSelectedUserInfo().displayName}
                        </span>
                        <span className="text-green-600 text-sm">
                          ({getSelectedUserInfo().email})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedUserId('store')}
                        className="text-xs text-green-600 hover:text-green-800 underline"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )}
                
                {/* User Search Input */}
                {selectedUserId === 'search' && (
                  <div className="mt-3 space-y-2">
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="Search by name or email (min 3 characters)..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    
                    {/* Search Results */}
                    {userSearchQuery.length >= 3 && (
                      <div className="relative">
                        <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {isSearchingUsers ? (
                            <div className="p-4 text-center text-gray-500">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mx-auto mb-2"></div>
                              Searching users...
                            </div>
                          ) : userSearchResults.length > 0 ? (
                            <div className="py-2">
                              {userSearchResults.map((userOption) => (
                                <button
                                  key={userOption.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedUserId(userOption.id);
                                    setUserSearchQuery('');
                                    setUserSearchResults([]);
                                  }}
                                  className="w-full px-4 py-3 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none border-b border-gray-100 last:border-b-0"
                                >
                                  <div className="font-medium text-gray-900">{userOption.displayName}</div>
                                  <div className="text-sm text-gray-500">{userOption.email}</div>
                                </button>
                              ))}
                            </div>
                          ) : userSearchQuery.length >= 3 ? (
                            <div className="p-4 text-center text-gray-500">
                              No users found matching "{userSearchQuery}"
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                    
                    {/* Info about admin-created items */}
                    {selectedUserId !== 'store' && selectedUserId !== 'search' && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="text-xs text-blue-700">
                          This user will see this item in their listings but cannot edit it
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Select who owns this item. Choose "Store" for store inventory or search for a specific user.
              </p>
            </div>
          )}

          {/* Additional Item Details */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Item Details (Optional but Recommended)</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category */}
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

              {/* Gender */}
              <div>
                <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-2">
                  Gender
                </label>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Gender</option>
                  <option value="Men">Men</option>
                  <option value="Women">Women</option>
                  <option value="Unisex">Unisex</option>
                </select>
              </div>

              {/* Size */}
              <div>
                <label htmlFor="size" className="block text-sm font-medium text-gray-700 mb-2">
                  Size
                </label>
                <select
                  id="size"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

              {/* Brand */}
              <div>
                <label htmlFor="brand" className="block text-sm font-medium text-gray-700 mb-2">
                  Brand
                </label>
                <input
                  type="text"
                  id="brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Patagonia, REI, North Face"
                />
              </div>

              {/* Condition */}
              <div>
                <label htmlFor="condition" className="block text-sm font-medium text-gray-700 mb-2">
                  Condition
                </label>
                <select
                  id="condition"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Condition</option>
                  <option value="New">New - Never used</option>
                  <option value="Like New">Like New - Minimal wear</option>
                  <option value="Good">Good - Some wear but functional</option>
                  <option value="Fair">Fair - Well used but still works</option>
                </select>
              </div>

              {/* Material */}
              <div>
                <label htmlFor="material" className="block text-sm font-medium text-gray-700 mb-2">
                  Material/Fabric
                </label>
                <input
                  type="text"
                  id="material"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Gore-Tex, Merino Wool, Cotton"
                />
              </div>

              {/* Color */}
              <div>
                <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <select
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Color</option>
                  <option value="Black">Black</option>
                  <option value="White">White</option>
                  <option value="Gray">Gray</option>
                  <option value="Red">Red</option>
                  <option value="Blue">Blue</option>
                  <option value="Green">Green</option>
                  <option value="Yellow">Yellow</option>
                  <option value="Orange">Orange</option>
                  <option value="Purple">Purple</option>
                  <option value="Pink">Pink</option>
                  <option value="Brown">Brown</option>
                  <option value="Navy">Navy</option>
                  <option value="Burgundy">Burgundy</option>
                  <option value="Olive">Olive</option>
                  <option value="Tan">Tan</option>
                  <option value="Multicolor">Multicolor</option>
                </select>
              </div>
            </div>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Photos (Optional - Max 5)
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
                id="image-upload"
                disabled={images.length >= 5}
              />
              <label
                htmlFor="image-upload"
                className={`cursor-pointer flex flex-col items-center ${
                  images.length >= 5 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <svg className="w-12 h-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-gray-600">
                  {images.length >= 5 ? 'Maximum 5 images reached' : 'Click to add photos (optional)'}
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  Photos help buyers see your item but aren't required
                </span>
              </label>
            </div>

            {/* Image Preview */}
            {images.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                {images.map((image, index) => (
                  <div key={index} className="relative">
                    <img
                      src={URL.createObjectURL(image)}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-6 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePreview}
              disabled={!title.trim() || !description.trim() || !price.trim()}
              className="flex-1 px-6 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Preview Item
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Your item will be reviewed by our team before appearing in the store.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AddItemModal; 