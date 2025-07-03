import React, { useState } from 'react';
import OptimizedHome from './OptimizedHome';
import VirtualizedItemGrid from './VirtualizedItemGrid';
import OptimizedItemCard from './OptimizedItemCard';
import { ConsignmentItem } from '../types';

interface PerformanceDemoProps {
  items: ConsignmentItem[];
}

const PerformanceDemo: React.FC<PerformanceDemoProps> = ({ items }) => {
  const [demoMode, setDemoMode] = useState<'optimized' | 'virtualized' | 'cards'>('optimized');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleItemClick = (item: ConsignmentItem) => {
    console.log('Item clicked:', item.title);
  };

  return (
    <div className="p-6">
      {/* Demo Controls */}
      <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Performance Demo</h2>
        
        <div className="flex flex-wrap gap-4 mb-4">
          <button
            onClick={() => setDemoMode('optimized')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              demoMode === 'optimized'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Optimized Home
          </button>
          <button
            onClick={() => setDemoMode('virtualized')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              demoMode === 'virtualized'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Virtualized Grid
          </button>
          <button
            onClick={() => setDemoMode('cards')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              demoMode === 'cards'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Optimized Cards
          </button>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
          <select
            value={activeCategory || ''}
            onChange={(e) => setActiveCategory(e.target.value || null)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="">All Categories</option>
            <option value="Clothing">Clothing</option>
            <option value="Footwear">Footwear</option>
            <option value="Gear">Gear</option>
            <option value="Accessories">Accessories</option>
          </select>
        </div>

        {/* Performance Info */}
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">Performance Features:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Virtual Scrolling:</strong> Only renders visible items</li>
            <li>• <strong>Lazy Loading:</strong> Images load progressively</li>
            <li>• <strong>Memoization:</strong> Prevents unnecessary re-renders</li>
            <li>• <strong>Infinite Scroll:</strong> Loads more content on demand</li>
            <li>• <strong>Caching:</strong> Stores frequently accessed data</li>
            <li>• <strong>Optimized CSS:</strong> Hardware acceleration and containment</li>
          </ul>
        </div>
      </div>

      {/* Demo Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {demoMode === 'optimized' && (
          <OptimizedHome
            onItemClick={handleItemClick}
            activeCategory={activeCategory}
            searchQuery={searchQuery}
          />
        )}

        {demoMode === 'virtualized' && (
          <div className="h-[600px]">
            <VirtualizedItemGrid
              items={items}
              onItemClick={handleItemClick}
              itemHeight={400}
              itemWidth={300}
              gap={24}
            />
          </div>
        )}

        {demoMode === 'cards' && (
          <div className="auto-grid">
            {items.slice(0, 12).map((item, index) => (
              <OptimizedItemCard
                key={item.id}
                item={item}
                onClick={handleItemClick}
                priority={index < 4}
              />
            ))}
          </div>
        )}
      </div>

      {/* Performance Tips */}
      <div className="mt-8 bg-green-50 rounded-lg p-6">
        <h3 className="font-bold text-green-900 mb-4">Implementation Tips:</h3>
        <div className="grid md:grid-cols-2 gap-6 text-sm text-green-800">
          <div>
            <h4 className="font-medium mb-2">Component Usage:</h4>
            <ul className="space-y-1">
              <li>• Use OptimizedItemCard for individual cards</li>
              <li>• Use VirtualizedItemGrid for large lists</li>
              <li>• Use OptimizedHome for complete page layouts</li>
              <li>• Apply lazy loading for images</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Performance Best Practices:</h4>
            <ul className="space-y-1">
              <li>• Implement pagination (20-50 items per page)</li>
              <li>• Use React.memo for expensive components</li>
              <li>• Debounce search inputs</li>
              <li>• Cache API responses when possible</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceDemo; 