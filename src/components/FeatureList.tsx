import React, { useState, useMemo } from 'react';
import { useButtonThrottle } from '../hooks/useButtonThrottle';

export interface Feature {
  id: string;
  name: string;
  description: string;
  status: 'untested' | 'passed' | 'failed' | 'testing';
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

interface FeatureListProps {
  features: Feature[];
  featureTestResults: Map<string, TestResult>;
  runningFeatureTests: Set<string>;
  onRunTest: (feature: Feature) => void;
  onShowDetail: (feature: Feature) => void;
}

const FeatureList: React.FC<FeatureListProps> = ({
  features,
  featureTestResults,
  runningFeatureTests,
  onRunTest,
  onShowDetail
}) => {
  const { throttledAction, isActionDisabled } = useButtonThrottle();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Get unique categories
  const categories = useMemo(() => {
    const cats = ['all', ...new Set(features.map(f => f.category))].sort();
    return cats;
  }, [features]);

  // Filter features based on search and category
  const filteredFeatures = useMemo(() => {
    return features.filter(feature => {
      const matchesCategory = selectedCategory === 'all' || feature.category === selectedCategory;
      const matchesSearch = !searchQuery || 
        feature.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        feature.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        feature.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesCategory && matchesSearch;
    });
  }, [features, selectedCategory, searchQuery]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (feature: Feature) => {
    if (runningFeatureTests.has(feature.id)) {
      return 'bg-yellow-100 text-yellow-800';
    }
    
    const result = featureTestResults.get(feature.id);
    if (!result) {
      return 'bg-gray-100 text-gray-800';
    }
    
    return result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getStatusText = (feature: Feature) => {
    if (runningFeatureTests.has(feature.id)) {
      return 'Testing...';
    }
    
    const result = featureTestResults.get(feature.id);
    if (!result) {
      return 'Untested';
    }
    
    return result.success ? 'Passed' : 'Failed';
  };

  return (
    <div className="space-y-6">
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">Search Features</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search features..."
              className="w-full pl-10 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
        </div>
        
        <div className="sm:w-64">
          <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {categories.map(category => (
              <option key={category} value={category}>
                {category === 'all' ? 'All Categories' : category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Features List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Feature
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredFeatures.map((feature) => (
                <tr key={feature.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{feature.name}</div>
                      <div className="text-sm text-gray-500 max-w-md">{feature.description}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {feature.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(feature.priority)}`}>
                      {feature.priority.charAt(0).toUpperCase() + feature.priority.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(feature)}`}>
                      {getStatusText(feature)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => throttledAction(`test_${feature.id}`, () => onRunTest(feature))}
                        disabled={isActionDisabled(`test_${feature.id}`) || runningFeatureTests.has(feature.id)}
                        className="text-orange-600 hover:text-orange-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        {runningFeatureTests.has(feature.id) ? 'Testing...' : 'Test'}
                      </button>
                      <button
                        onClick={() => onShowDetail(feature)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Details
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredFeatures.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No features found matching your search criteria.
          </div>
        )}
      </div>
    </div>
  );
};

export default FeatureList; 