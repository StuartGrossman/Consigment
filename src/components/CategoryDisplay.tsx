import React from 'react';
import { ConsignmentItem } from '../types';
import ItemCard from './ItemCard';

interface CategoryDisplayProps {
  categories: { [key: string]: ConsignmentItem[] };
  activeCategoryFilter: string | null;
  onCategoryFilter: (category: string) => void;
  onClearCategoryFilter: () => void;
  onItemClick: (item: ConsignmentItem) => void;
  isAdmin: boolean;
}

const CategoryDisplay: React.FC<CategoryDisplayProps> = ({
  categories,
  activeCategoryFilter,
  onCategoryFilter,
  onClearCategoryFilter,
  onItemClick,
  isAdmin,
}) => {
  return (
    <>
      {/* Category Filter Status */}
      {activeCategoryFilter && (
        <div className="mb-6 flex items-center justify-between bg-orange-50 p-4 rounded-lg border border-orange-200">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z" />
            </svg>
            <div>
              <h3 className="font-medium text-orange-900">Filtering by Category</h3>
              <p className="text-sm text-orange-700">Showing only items from "{activeCategoryFilter}"</p>
            </div>
          </div>
          <button
            onClick={onClearCategoryFilter}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
          >
            Clear Filter
          </button>
        </div>
      )}

      {/* Category-Based Two-Row Horizontal Scrolling Layout */}
      <div className="space-y-8">
        {Object.entries(categories).map(([category, items]) => {
          // Only show even number of items for proper 2-row display
          const itemsToShow = items.slice(0, Math.min(16, items.length)); // Max 16 items (8 pairs)
          const evenItemsToShow = itemsToShow.length % 2 === 0 ? itemsToShow : itemsToShow.slice(0, -1);
          
          return (
            <div key={category} className="category-section">
              {/* Category Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-gray-900">{category}</h2>
                  <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-medium">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                  <button
                    onClick={() => onCategoryFilter(category)}
                    className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs font-medium transition-colors"
                    title={`View all ${category} items`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View All
                  </button>
                </div>
              </div>

              {/* Horizontal Scrolling Container */}
              <div className="category-scroll-container overflow-x-auto scroll-smooth">
                <div className="flex gap-4 pb-4">
                  {/* Two-Row Grid */}
                  <div className="grid grid-rows-2 grid-flow-col gap-4 w-max">
                    {evenItemsToShow.map((item, index) => (
                      <div key={item.id} className="w-72">
                        <ItemCard 
                          item={item} 
                          isAdmin={isAdmin}
                          onClick={onItemClick}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Show More Card - Only if there are more items than displayed */}
                  {items.length > evenItemsToShow.length && (
                    <div className="flex items-center justify-center w-72 h-full">
                      <button
                        onClick={() => onCategoryFilter(category)}
                        className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-3 text-gray-500 hover:border-orange-400 hover:text-orange-600 transition-colors group"
                      >
                        <svg className="w-8 h-8 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <div className="text-center">
                          <p className="font-medium">View All {category}</p>
                          <p className="text-sm">
                            {items.length - evenItemsToShow.length} more {items.length - evenItemsToShow.length === 1 ? 'item' : 'items'}
                          </p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* No Items Message */}
      {Object.keys(categories).length === 0 && (
        <div className="text-center py-12">
          <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No items available</h3>
          <p className="text-gray-500">
            {activeCategoryFilter 
              ? `No items found in the "${activeCategoryFilter}" category.`
              : 'Check back later for new arrivals!'
            }
          </p>
        </div>
      )}
    </>
  );
};

export default CategoryDisplay; 