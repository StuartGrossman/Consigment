import React, { useRef, useEffect } from 'react';

interface FilterSidebarProps {
    filters: {
        category: string;
        gender: string;
        size: string;
        brand: string;
        color: string;
        priceRange: string;
        sortBy: string;
        searchQuery: string;
    };
    filtersOpen: boolean;
    onFilterChange: (filterType: string, value: string) => void;
    onClearFilters: () => void;
    onToggleFilters: () => void;
    onClose: () => void;
}

const FilterSidebar: React.FC<FilterSidebarProps> = ({
    filters,
    filtersOpen,
    onFilterChange,
    onClearFilters,
    onToggleFilters,
    onClose
}) => {
    const filtersRef = useRef<HTMLDivElement>(null);

    // Handle clicking outside to close filters
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (filtersOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [filtersOpen, onClose]);

    const hasActiveFilters = !!(
        filters.category || 
        filters.gender || 
        filters.size || 
        filters.brand || 
        filters.color || 
        filters.priceRange || 
        filters.searchQuery
    );

    return (
        <div ref={filtersRef} className="w-full lg:w-64 lg:flex-shrink-0">
            {/* Filter Toggle Button */}
            <button
                onClick={onToggleFilters}
                className="w-full mb-4 bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between text-left"
            >
                <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707v4.586a1 1 0 01-1.414.924l-2-1A1 1 0 0110 17.414V13.414a1 1 0 00-.293-.707L3.293 6.293A1 1 0 013 5.586V4z" />
                    </svg>
                    <span className="font-medium text-gray-900">Filters</span>
                    {hasActiveFilters && (
                        <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">Active</span>
                    )}
                </div>
                <svg className={`w-5 h-5 text-gray-400 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Filter Panel */}
            <div className={`bg-white rounded-lg shadow-sm border p-4 sm:p-6 lg:sticky lg:top-8 ${
                filtersOpen ? 'block' : 'hidden'
            }`}>
                <div className="flex justify-between items-center mb-4 sm:mb-6">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900">Filters</h3>
                    <button
                        onClick={onClearFilters}
                        className="text-sm text-orange-600 hover:text-orange-700"
                    >
                        Clear All
                    </button>
                </div>

                {/* Sort By */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                    <select
                        value={filters.sortBy}
                        onChange={(e) => onFilterChange('sortBy', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="price-low">Price: Low to High</option>
                        <option value="price-high">Price: High to Low</option>
                    </select>
                </div>

                {/* Category */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                    <select
                        value={filters.category}
                        onChange={(e) => onFilterChange('category', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="">All Categories</option>
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
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                    <select
                        value={filters.gender}
                        onChange={(e) => onFilterChange('gender', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="">All</option>
                        <option value="Men">Men</option>
                        <option value="Women">Women</option>
                        <option value="Unisex">Unisex</option>
                    </select>
                </div>

                {/* Size */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Size</label>
                    <select
                        value={filters.size}
                        onChange={(e) => onFilterChange('size', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="">All Sizes</option>
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
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Brand</label>
                    <input
                        type="text"
                        value={filters.brand}
                        onChange={(e) => onFilterChange('brand', e.target.value)}
                        placeholder="Search brands..."
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                </div>

                {/* Color */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                    <select
                        value={filters.color}
                        onChange={(e) => onFilterChange('color', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="">All Colors</option>
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

                {/* Price Range */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Price Range</label>
                    <select
                        value={filters.priceRange}
                        onChange={(e) => onFilterChange('priceRange', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="">Any Price</option>
                        <option value="0-25">Under $25</option>
                        <option value="25-50">$25 - $50</option>
                        <option value="50-100">$50 - $100</option>
                        <option value="100-200">$100 - $200</option>
                        <option value="200-500">$200 - $500</option>
                        <option value="500">$500+</option>
                    </select>
                </div>
            </div>
        </div>
    );
};

export default FilterSidebar; 