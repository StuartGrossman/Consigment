import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiService, Category, CreateCategoryData, UpdateCategoryData } from '../services/apiService';

interface CategoryDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const CategoryDashboard: React.FC<CategoryDashboardProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '',
    attributes: [] as string[],
    isActive: true
  });
  const [newAttribute, setNewAttribute] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
    }
  }, [isOpen]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const categoriesData = await apiService.getCategories();
      setCategories(categoriesData);
      
      // Auto-initialize default categories if none exist
      if (categoriesData.length === 0) {
        console.log('No categories found, auto-initializing defaults...');
        try {
          await apiService.initializeDefaultCategories();
          const newCategoriesData = await apiService.getCategories();
          setCategories(newCategoriesData);
          console.log('✅ Default categories initialized successfully');
        } catch (initError) {
          console.error('Failed to auto-initialize categories:', initError);
        }
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = () => {
    setIsCreating(true);
    setIsEditing(false);
    setSelectedCategory(null);
    setFormData({
      name: '',
      description: '',
      icon: '',
      attributes: [],
      isActive: true
    });
    setImageFile(null);
    setImagePreview('');
  };

  const handleEditCategory = (category: Category) => {
    setSelectedCategory(category);
    setIsEditing(true);
    setIsCreating(false);
    setFormData({
      name: category.name,
      description: category.description,
      icon: category.icon,
      attributes: [...category.attributes],
      isActive: category.isActive
    });
    setImagePreview(category.bannerImage);
    setImageFile(null);
  };

  const handleSaveCategory = async () => {
    try {
      setLoading(true);
      
      // Auto-generate icon if not provided
      if (!formData.icon.trim()) {
        setFormData(prev => ({ ...prev, icon: '📦' })); // Default category icon
      }
      
      const categoryData: CreateCategoryData | UpdateCategoryData = {
        name: formData.name.trim() || 'New Category',
        description: formData.description.trim(),
        icon: formData.icon.trim() || '📦',
        bannerImage: imagePreview || '',
        attributes: formData.attributes,
        isActive: formData.isActive
      };
      
      if (isCreating) {
        await apiService.createCategory(categoryData as CreateCategoryData);
      } else if (isEditing && selectedCategory) {
        await apiService.updateCategory(selectedCategory.id, categoryData);
      }
      
      // Refresh categories and reset form
      await fetchCategories();
      handleCancel();
      
    } catch (error) {
      console.error('Error saving category:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    const categoryName = category?.name || 'Unknown';
    
    if (!confirm(`Delete "${categoryName}" category?`)) {
      return;
    }
    
    try {
      setLoading(true);
      await apiService.deleteCategory(categoryId);
      await fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
    } finally {
      setLoading(false);
    }
  };



  const handleCancel = () => {
    setIsCreating(false);
    setIsEditing(false);
    setSelectedCategory(null);
    setFormData({
      name: '',
      description: '',
      icon: '',
      attributes: [],
      isActive: true
    });
    setImageFile(null);
    setImagePreview('');
    setNewAttribute('');
  };

  const handleAddAttribute = () => {
    if (newAttribute.trim() && !formData.attributes.includes(newAttribute.trim())) {
      setFormData(prev => ({
        ...prev,
        attributes: [...prev.attributes, newAttribute.trim()]
      }));
      setNewAttribute('');
    }
  };

  const handleRemoveAttribute = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attributes: prev.attributes.filter((_, i) => i !== index)
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    category.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div>
            <h2 className="text-2xl font-bold">Category Management Dashboard</h2>
            <p className="text-blue-100 mt-1">Manage categories, attributes, and banner images</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Category List */}
          <div className="w-1/3 border-r border-gray-200 flex flex-col">
            {/* Search and Create */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex gap-2 mb-3">
                <button
                  onClick={handleCreateCategory}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Category
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Category List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {filteredCategories.map((category) => (
                    <div
                      key={category.id}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedCategory?.id === category.id
                          ? 'bg-blue-50 border-2 border-blue-200'
                          : 'hover:bg-gray-50 border-2 border-transparent'
                      }`}
                      onClick={() => handleEditCategory(category)}
                    >
                      <div className="flex items-start justify-between min-h-0">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <span className="text-2xl flex-shrink-0">{category.icon}</span>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">{category.name}</h3>
                            <p className="text-sm text-gray-600 truncate leading-tight">{category.description}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {category.attributes.slice(0, 2).map((attr, index) => (
                                <span key={index} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded truncate">
                                  {attr}
                                </span>
                              ))}
                              {category.attributes.length > 2 && (
                                <span className="text-xs text-gray-500">+{category.attributes.length - 2}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`w-2 h-2 rounded-full ${category.isActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCategory(category.id);
                            }}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            title={`Delete ${category.name}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 7-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Content - Form */}
          <div className="flex-1 flex flex-col">
            {(isCreating || isEditing) ? (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">
                    {isCreating ? 'Create New Category' : `Edit ${selectedCategory?.name}`}
                  </h3>

                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Category Name</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="e.g., Climbing"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Icon (Emoji)</label>
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={formData.icon}
                            onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="🧗"
                            maxLength={2}
                          />
                          <div className="flex flex-wrap gap-1">
                            {['🧗', '⛷️', '🥾', '⛺', '🏔️', '🏂', '🌊', '🚵', '👕', '🎯', '⚽', '🏃', '🤸', '🏋️', '🏐', '🏈'].map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, icon: emoji }))}
                                className={`p-2 text-lg rounded border hover:bg-gray-50 ${formData.icon === emoji ? 'bg-blue-50 border-blue-300' : 'border-gray-200'}`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Brief description of this category..."
                      />
                    </div>

                    {/* Banner Image */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Banner Image</label>
                      <div className="space-y-3">
                        {imagePreview && (
                          <div className="relative">
                            <img
                              src={imagePreview}
                              alt="Banner preview"
                              className="w-full h-36 object-cover rounded-lg border border-gray-300"
                            />
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        <p className="text-xs text-gray-500">
                          Recommended: 1200x400px, JPG/PNG format, max 2MB
                        </p>
                      </div>
                    </div>

                    {/* Attributes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Category Attributes</label>
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newAttribute}
                            onChange={(e) => setNewAttribute(e.target.value)}
                            placeholder="Add attribute (e.g., size, material, brand)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            onKeyPress={(e) => e.key === 'Enter' && handleAddAttribute()}
                          />
                          <button
                            onClick={handleAddAttribute}
                            disabled={!newAttribute.trim() || formData.attributes.includes(newAttribute.trim())}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Add
                          </button>
                        </div>
                        
                        {formData.attributes.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {formData.attributes.map((attribute, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
                              >
                                {attribute}
                                <button
                                  onClick={() => handleRemoveAttribute(index)}
                                  className="ml-1 hover:text-blue-900"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-gray-500">
                          These attributes will be available for items in this category
                        </p>
                      </div>
                    </div>

                    {/* Status */}
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Active Category</span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1">
                        Inactive categories won't appear in item creation forms
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="text-6xl mb-4">🏷️</div>
                  <p className="text-xl font-medium text-gray-700">Select a category to edit</p>
                  <p className="text-sm text-gray-500 mt-2">or create a new category to get started</p>
                  <div className="mt-4 text-sm text-gray-400">
                    <p>Current categories: {categories.length}</p>
                    <p>Active categories: {categories.filter(c => c.isActive).length}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {(isCreating || isEditing) && (
              <div className="border-t border-gray-200 p-4 bg-gray-50">
                <div className="flex justify-between items-center">
                  {isEditing && selectedCategory ? (
                    <button
                      onClick={() => handleDeleteCategory(selectedCategory.id)}
                      disabled={loading}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 7-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Category
                    </button>
                  ) : (
                    <div></div>
                  )}
                  
                  <div className="flex gap-3">
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveCategory}
                      disabled={loading}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                      {isCreating ? 'Create Category' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <div className="flex gap-6">
              <span>Total Categories: {categories.length}</span>
              <span>Active: {categories.filter(c => c.isActive).length}</span>
              <span>Inactive: {categories.filter(c => !c.isActive).length}</span>
            </div>
            <div className="text-xs text-gray-500">
              Last updated: {new Date().toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryDashboard;
