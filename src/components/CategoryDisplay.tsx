import React from 'react';
import { ConsignmentItem } from '../types';
import ItemCard from './ItemCard';
import {
  alpineClimbing,
  mountainTrail,
  campsiteEvening,
  skiingPowder,
  snowboardJump,
  whitewaterRafting,
  mountainBiking,
  outdoorClothing,
  hikingBoots
} from '../assets/category-images';

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
  // Category image mapping
  const getCategoryImage = (category: string) => {
    const categoryImages: { [key: string]: string } = {
      'Mountaineering': alpineClimbing,
      'Hiking': mountainTrail,
      'Camping': campsiteEvening,
      'Skiing': skiingPowder,
      'Snowboarding': snowboardJump,
      'Water Sports': whitewaterRafting,
      'Cycling': mountainBiking,
      'Apparel': outdoorClothing,
      'Footwear': hikingBoots,
    };
    return categoryImages[category] || mountainTrail;
  };

  // Category icon mapping
  const getCategoryIcon = (category: string) => {
    const categoryIcons: { [key: string]: string } = {
      'Skiing': '⛷️',
      'Hiking': '🥾',
      'Camping': '⛺',
      'Mountaineering': '🏔️',
      'Snowboarding': '🏂',
      'Cycling': '🚵',
      'Water Sports': '🚣',
      'Apparel': '👕',
      'Footwear': '👟',
    };
    return categoryIcons[category] || '📦';
  };
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
          // Show only 5 items per category
          const itemsToShow = items.slice(0, 5);
          
          return (
            <div key={category} className="category-section">
              {/* Removed category header - banner shows category info */}

              {/* Category Banner */}
              <div 
                className="relative h-36 w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] overflow-hidden shadow-lg cursor-pointer group hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02]"
                style={{
                  backgroundImage: `url(${getCategoryImage(category)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
                onClick={() => onCategoryFilter(category)}
              >
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent group-hover:from-black/70 group-hover:via-black/40 transition-all duration-300"></div>
                
                {/* Content */}
                <div className="relative h-full flex items-center px-6">
                  <div className="flex items-center gap-4">
                    <div className="text-4xl group-hover:scale-110 transition-transform duration-300">{getCategoryIcon(category)}</div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1 group-hover:text-orange-200 transition-colors duration-300">Explore {category}</h3>
                      <p className="text-white/80 text-sm group-hover:text-white/90 transition-colors duration-300">Discover quality gear for your adventures</p>
                    </div>
                  </div>
                </div>
                
                {/* View All Button - Appears on Hover */}
                <div className="absolute top-4 right-6 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-4 group-hover:translate-x-0">
                  <div className="bg-white/20 backdrop-blur-sm border border-white/30 rounded-full px-4 py-2 text-white font-medium text-sm flex items-center gap-2">
                    <span>View All</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
                
                {/* Item Count Badge - Appears on Hover */}
                <div className="absolute bottom-4 right-6 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                  <div className="bg-orange-500/90 backdrop-blur-sm rounded-full px-3 py-1 text-white font-medium text-sm">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </div>
                </div>
              </div>

              {/* Horizontal Scrolling Container */}
              <div className="category-scroll-container overflow-x-auto scroll-smooth">
                <div className="flex gap-4 pb-4">
                  {/* Single Row of Items */}
                  <div className="flex gap-4 w-max">
                    {itemsToShow.map((item) => (
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
                  {items.length > itemsToShow.length && (
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
                            {items.length - itemsToShow.length} more {items.length - itemsToShow.length === 1 ? 'item' : 'items'}
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