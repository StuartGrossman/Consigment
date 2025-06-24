import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { AuthUser } from '../types';
import { logUserAction } from '../services/firebaseService';
import { useRateLimiter } from '../hooks/useRateLimiter';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
}

const AddItemModal: React.FC<AddItemModalProps> = ({ isOpen, onClose, user }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
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
    if (!title.trim() || !description.trim() || !price.trim() || images.length === 0) {
      alert('Please fill in all required fields before previewing');
      return;
    }

    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue <= 0) {
      alert('Please enter a valid price greater than 0');
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

        // Prepare item data, only including fields that have values
        const itemData: any = {
          title: title.trim(),
          description: description.trim(),
          price: parseFloat(price),
          images: imageUrls,
          sellerId: user.uid,
          sellerName: user.displayName || 'Anonymous',
          sellerEmail: user.email || ('phoneNumber' in user ? user.phoneNumber : ''),
          status: 'pending',
          createdAt: serverTimestamp(),
        };

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

        // Add item to Firestore
        const docRef = await addDoc(collection(db, 'items'), itemData);

        // Log the action
        await logUserAction(user, 'item_listed', 'Listed new item for consignment', docRef.id, title.trim());

        return docRef;
      } catch (error) {
        console.error('Error adding item:', error);
        throw error;
      }
    });

    if (result.success) {
      // Show success message
      setShowSuccess(true);
      setShowPreview(false);
    } else {
      // Show rate limit or error message
      alert(result.error || 'Error adding item. Please try again.');
    }
    
    setUploading(false);
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
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Success Modal
  if (showSuccess) {
    return (
      <div className="modal-backdrop flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Item Submitted Successfully!</h3>
            <p className="text-gray-600 mb-6">
              Your item has been submitted for review. Please bring the physical item to the front desk so our team can inspect and approve it.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Next Steps:</strong><br />
                1. Bring your item to the front desk<br />
                2. Our team will inspect and approve it<br />
                3. Then it goes live for all customers
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
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
                {images.length > 0 && (
                  <img
                    src={URL.createObjectURL(images[0])}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                )}
                {images.length > 1 && (
                  <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                    +{images.length - 1} more
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
                    by {user?.displayName}
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
              Photos * (Max 5)
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
                  {images.length >= 5 ? 'Maximum 5 images reached' : 'Click to add photos'}
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
              disabled={!title.trim() || !description.trim() || !price.trim() || images.length === 0}
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