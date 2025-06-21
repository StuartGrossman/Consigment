import React, { useState, useEffect } from 'react';
import { useButtonThrottle } from '../hooks/useButtonThrottle';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { db } from '../config/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

interface ApplicationTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TestResult {
  success: boolean;
  message: string;
  duration: number;
  details?: any;
}

interface TestSuite {
  name: string;
  tests: TestCase[];
  results?: TestResult[];
  status: 'idle' | 'running' | 'completed' | 'failed';
}

interface TestCase {
  id: string;
  name: string;
  description: string;
  testFunction: () => Promise<TestResult>;
}

interface Feature {
  id: string;
  name: string;
  description: string;
  status: 'untested' | 'testing' | 'passed' | 'failed';
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  lastTested?: Date;
  notes?: string;
}

const ApplicationTestModal: React.FC<ApplicationTestModalProps> = ({ isOpen, onClose }) => {
  const { throttledAction, isActionDisabled } = useButtonThrottle();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { addToCart, removeFromCart, getCartItemCount } = useCart();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'features' | 'tests' | 'firebase'>('features');
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [runningTests, setRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map());
  const [testProgress, setTestProgress] = useState({ completed: 0, total: 0 });

  // Comprehensive feature list organized by categories
  const features: Feature[] = [
    // Authentication & User Management
    {
      id: 'auth-google',
      name: 'Google Authentication',
      description: 'Sign in with Google account using Firebase Auth',
      status: 'untested',
      category: 'Authentication',
      priority: 'critical'
    },
    {
      id: 'auth-phone',
      name: 'Phone Number Authentication',
      description: 'Sign in with phone number using SMS verification',
      status: 'untested',
      category: 'Authentication',
      priority: 'critical'
    },
    {
      id: 'auth-admin-toggle',
      name: 'Admin Mode Toggle',
      description: 'Switch between admin and regular user modes',
      status: 'untested',
      category: 'Authentication',
      priority: 'high'
    },
    {
      id: 'auth-logout',
      name: 'User Logout',
      description: 'Sign out functionality with proper session cleanup',
      status: 'untested',
      category: 'Authentication',
      priority: 'high'
    },

    // Item Management
    {
      id: 'item-add',
      name: 'Add New Item',
      description: 'Create new consignment items with images, details, and pricing',
      status: 'untested',
      category: 'Item Management',
      priority: 'critical'
    },
    {
      id: 'item-edit',
      name: 'Edit Item Details',
      description: 'Modify existing item information, pricing, and status',
      status: 'untested',
      category: 'Item Management',
      priority: 'high'
    },
    {
      id: 'item-image-upload',
      name: 'Image Upload & Management',
      description: 'Upload, crop, and manage multiple item images',
      status: 'untested',
      category: 'Item Management',
      priority: 'high'
    },
    {
      id: 'item-status-workflow',
      name: 'Item Status Workflow',
      description: 'Pending → Approved → Live → Sold status transitions',
      status: 'untested',
      category: 'Item Management',
      priority: 'critical'
    },
    {
      id: 'item-archive',
      name: 'Item Archival',
      description: 'Archive items with reasons and restore functionality',
      status: 'untested',
      category: 'Item Management',
      priority: 'medium'
    },
    {
      id: 'item-discount',
      name: 'Discount Management',
      description: 'Apply discounts to items with percentage and reason tracking',
      status: 'untested',
      category: 'Item Management',
      priority: 'medium'
    },

    // Inventory & Catalog
    {
      id: 'inventory-filtering',
      name: 'Advanced Filtering System',
      description: 'Filter by category, gender, size, brand, color, price range',
      status: 'untested',
      category: 'Inventory',
      priority: 'high'
    },
    {
      id: 'inventory-search',
      name: 'Search Functionality',
      description: 'Text search across titles, descriptions, brands, and metadata',
      status: 'untested',
      category: 'Inventory',
      priority: 'high'
    },
    {
      id: 'inventory-sorting',
      name: 'Sorting Options',
      description: 'Sort by newest, oldest, price (low to high), price (high to low)',
      status: 'untested',
      category: 'Inventory',
      priority: 'medium'
    },
    {
      id: 'inventory-grid',
      name: 'Responsive Item Grid',
      description: 'Mobile-responsive grid layout with item cards',
      status: 'untested',
      category: 'Inventory',
      priority: 'high'
    },
    {
      id: 'inventory-pagination',
      name: 'Infinite Scroll/Pagination',
      description: 'Efficient loading of large item catalogs',
      status: 'untested',
      category: 'Inventory',
      priority: 'medium'
    },

    // Shopping Cart & Checkout
    {
      id: 'cart-add-items',
      name: 'Add Items to Cart',
      description: 'Add items to shopping cart with quantity management',
      status: 'untested',
      category: 'Shopping Cart',
      priority: 'critical'
    },
    {
      id: 'cart-management',
      name: 'Cart Management',
      description: 'View, modify, and remove items from cart',
      status: 'untested',
      category: 'Shopping Cart',
      priority: 'critical'
    },
    {
      id: 'cart-persistence',
      name: 'Cart Persistence',
      description: 'User-specific cart storage and retrieval',
      status: 'untested',
      category: 'Shopping Cart',
      priority: 'high'
    },
    {
      id: 'checkout-process',
      name: 'Checkout Process',
      description: 'Complete purchase flow with payment processing',
      status: 'untested',
      category: 'Shopping Cart',
      priority: 'critical'
    },
    {
      id: 'checkout-stripe',
      name: 'Stripe Payment Integration',
      description: 'Secure payment processing with Stripe',
      status: 'untested',
      category: 'Shopping Cart',
      priority: 'critical'
    },
    {
      id: 'checkout-fulfillment',
      name: 'Fulfillment Options',
      description: 'Pickup vs shipping options for orders',
      status: 'untested',
      category: 'Shopping Cart',
      priority: 'high'
    },

    // Bookmarks & Favorites
    {
      id: 'bookmarks-add',
      name: 'Add to Bookmarks',
      description: 'Save items to personal bookmarks list',
      status: 'untested',
      category: 'Bookmarks',
      priority: 'medium'
    },
    {
      id: 'bookmarks-management',
      name: 'Bookmark Management',
      description: 'View and manage bookmarked items',
      status: 'untested',
      category: 'Bookmarks',
      priority: 'medium'
    },
    {
      id: 'bookmarks-persistence',
      name: 'Bookmark Persistence',
      description: 'User-specific bookmark storage and retrieval',
      status: 'untested',
      category: 'Bookmarks',
      priority: 'medium'
    },

    // Admin Dashboard
    {
      id: 'admin-pending-approval',
      name: 'Pending Items Approval',
      description: 'Review and approve/reject pending items',
      status: 'untested',
      category: 'Admin Dashboard',
      priority: 'critical'
    },
    {
      id: 'admin-inventory-management',
      name: 'Inventory Dashboard',
      description: 'Comprehensive inventory management interface',
      status: 'untested',
      category: 'Admin Dashboard',
      priority: 'critical'
    },
    {
      id: 'admin-actions-dashboard',
      name: 'Actions Dashboard',
      description: 'Track and manage all administrative actions',
      status: 'untested',
      category: 'Admin Dashboard',
      priority: 'high'
    },
    {
      id: 'admin-user-analytics',
      name: 'User Analytics',
      description: 'Comprehensive user performance and analytics',
      status: 'untested',
      category: 'Admin Dashboard',
      priority: 'high'
    },
    {
      id: 'admin-bulk-operations',
      name: 'Bulk Operations',
      description: 'Bulk approve, archive, or modify multiple items',
      status: 'untested',
      category: 'Admin Dashboard',
      priority: 'medium'
    },

    // Sales & Order Management
    {
      id: 'sales-in-store',
      name: 'In-Store Sales',
      description: 'Process in-store sales with cash/card payments',
      status: 'untested',
      category: 'Sales Management',
      priority: 'critical'
    },
    {
      id: 'sales-online',
      name: 'Online Sales',
      description: 'Process online orders with shipping/pickup',
      status: 'untested',
      category: 'Sales Management',
      priority: 'critical'
    },
    {
      id: 'sales-tracking',
      name: 'Sales Tracking',
      description: 'Track sales history and transaction details',
      status: 'untested',
      category: 'Sales Management',
      priority: 'high'
    },
    {
      id: 'sales-refunds',
      name: 'Refund Processing',
      description: 'Process refunds with reason tracking',
      status: 'untested',
      category: 'Sales Management',
      priority: 'high'
    },

    // Shipping & Fulfillment
    {
      id: 'shipping-labels',
      name: 'Shipping Label Generation',
      description: 'Generate shipping labels for online orders',
      status: 'untested',
      category: 'Shipping',
      priority: 'high'
    },
    {
      id: 'shipping-tracking',
      name: 'Shipping Tracking',
      description: 'Track shipment status and delivery updates',
      status: 'untested',
      category: 'Shipping',
      priority: 'high'
    },
    {
      id: 'shipping-notifications',
      name: 'Shipping Notifications',
      description: 'Automated notifications for shipping updates',
      status: 'untested',
      category: 'Shipping',
      priority: 'medium'
    },

    // Barcode System
    {
      id: 'barcode-generation',
      name: 'Barcode Generation',
      description: 'Generate unique barcodes for inventory items',
      status: 'untested',
      category: 'Barcode System',
      priority: 'medium'
    },
    {
      id: 'barcode-printing',
      name: 'Barcode Printing',
      description: 'Print barcode labels for physical inventory',
      status: 'untested',
      category: 'Barcode System',
      priority: 'medium'
    },
    {
      id: 'barcode-scanning',
      name: 'Barcode Scanning',
      description: 'Scan barcodes for quick item lookup',
      status: 'untested',
      category: 'Barcode System',
      priority: 'low'
    },

    // Financial Management
    {
      id: 'financial-earnings-split',
      name: 'Earnings Split Calculation',
      description: 'Automatic 75/25 split between seller and store',
      status: 'untested',
      category: 'Financial',
      priority: 'critical'
    },
    {
      id: 'financial-store-credit',
      name: 'Store Credit System',
      description: 'Manage store credit balances and transactions',
      status: 'untested',
      category: 'Financial',
      priority: 'high'
    },
    {
      id: 'financial-payment-tracking',
      name: 'Payment Tracking',
      description: 'Track payments made to consigners',
      status: 'untested',
      category: 'Financial',
      priority: 'high'
    },
    {
      id: 'financial-outstanding-balance',
      name: 'Outstanding Balance Management',
      description: 'Track and manage outstanding payments to users',
      status: 'untested',
      category: 'Financial',
      priority: 'high'
    },

    // Analytics & Reporting
    {
      id: 'analytics-sales-metrics',
      name: 'Sales Analytics',
      description: 'Comprehensive sales metrics and performance tracking',
      status: 'untested',
      category: 'Analytics',
      priority: 'high'
    },
    {
      id: 'analytics-user-performance',
      name: 'User Performance Analytics',
      description: 'Individual user sales and performance metrics',
      status: 'untested',
      category: 'Analytics',
      priority: 'medium'
    },
    {
      id: 'analytics-inventory-metrics',
      name: 'Inventory Analytics',
      description: 'Inventory turnover and performance metrics',
      status: 'untested',
      category: 'Analytics',
      priority: 'medium'
    },
    {
      id: 'analytics-financial-reports',
      name: 'Financial Reporting',
      description: 'Revenue, profit, and financial performance reports',
      status: 'untested',
      category: 'Analytics',
      priority: 'high'
    },

    // Notifications & Alerts
    {
      id: 'notifications-activity',
      name: 'Activity Notifications',
      description: 'Real-time notifications for item status changes',
      status: 'untested',
      category: 'Notifications',
      priority: 'medium'
    },
    {
      id: 'notifications-alerts',
      name: 'System Alerts',
      description: 'Important system alerts and notifications',
      status: 'untested',
      category: 'Notifications',
      priority: 'medium'
    },
    {
      id: 'notifications-email',
      name: 'Email Notifications',
      description: 'Automated email notifications for key events',
      status: 'untested',
      category: 'Notifications',
      priority: 'low'
    },

    // Mobile Responsiveness
    {
      id: 'mobile-responsive-design',
      name: 'Mobile Responsive Design',
      description: 'Fully responsive design for mobile devices',
      status: 'untested',
      category: 'Mobile',
      priority: 'critical'
    },
    {
      id: 'mobile-touch-interface',
      name: 'Touch-Friendly Interface',
      description: 'Optimized touch interactions for mobile',
      status: 'untested',
      category: 'Mobile',
      priority: 'high'
    },
    {
      id: 'mobile-navigation',
      name: 'Mobile Navigation',
      description: 'Collapsible navigation and mobile-optimized menus',
      status: 'untested',
      category: 'Mobile',
      priority: 'high'
    },

    // Security & Performance
    {
      id: 'security-firebase-rules',
      name: 'Firebase Security Rules',
      description: 'Proper security rules for database access',
      status: 'untested',
      category: 'Security',
      priority: 'critical'
    },
    {
      id: 'security-user-permissions',
      name: 'User Permission System',
      description: 'Role-based access control for admin functions',
      status: 'untested',
      category: 'Security',
      priority: 'critical'
    },
    {
      id: 'performance-image-optimization',
      name: 'Image Optimization',
      description: 'Optimized image loading and caching',
      status: 'untested',
      category: 'Performance',
      priority: 'medium'
    },
    {
      id: 'performance-lazy-loading',
      name: 'Lazy Loading',
      description: 'Efficient loading of images and components',
      status: 'untested',
      category: 'Performance',
      priority: 'medium'
    },
    {
      id: 'performance-button-throttling',
      name: 'Button Throttling',
      description: 'Prevent double-clicks and rapid API calls',
      status: 'untested',
      category: 'Performance',
      priority: 'medium'
    },

    // Error Handling
    {
      id: 'error-handling-api',
      name: 'API Error Handling',
      description: 'Proper error handling for API calls',
      status: 'untested',
      category: 'Error Handling',
      priority: 'high'
    },
    {
      id: 'error-handling-ui',
      name: 'UI Error States',
      description: 'User-friendly error messages and states',
      status: 'untested',
      category: 'Error Handling',
      priority: 'medium'
    },
    {
      id: 'error-handling-offline',
      name: 'Offline Handling',
      description: 'Graceful handling of offline states',
      status: 'untested',
      category: 'Error Handling',
      priority: 'low'
    }
  ];

  // Test implementations
  const createTestSuites = (): TestSuite[] => [
    {
      name: 'Authentication Tests',
      status: 'idle',
      tests: [
        {
          id: 'auth-status-check',
          name: 'Authentication Status Check',
          description: 'Verify user authentication state',
          testFunction: async () => {
            const start = Date.now();
            try {
              const authStatus = isAuthenticated;
              const hasUser = !!user;
              const adminStatus = isAdmin;
              
              return {
                success: true,
                message: `Auth: ${authStatus}, User: ${hasUser}, Admin: ${adminStatus}`,
                duration: Date.now() - start,
                details: { isAuthenticated, user: user?.displayName || 'None', isAdmin }
              };
            } catch (error) {
              return {
                success: false,
                message: `Authentication check failed: ${error}`,
                duration: Date.now() - start
              };
            }
          }
        }
      ]
    },
    {
      name: 'Firebase Database Tests',
      status: 'idle',
      tests: [
        {
          id: 'firebase-connection',
          name: 'Firebase Connection Test',
          description: 'Test connection to Firestore database',
          testFunction: async () => {
            const start = Date.now();
            try {
              const testQuery = query(collection(db, 'items'), where('status', '==', 'live'));
              const snapshot = await getDocs(testQuery);
              
              return {
                success: true,
                message: `Connected successfully. Found ${snapshot.size} live items`,
                duration: Date.now() - start,
                details: { itemCount: snapshot.size }
              };
            } catch (error) {
              return {
                success: false,
                message: `Firebase connection failed: ${error}`,
                duration: Date.now() - start
              };
            }
          }
        },
        {
          id: 'firebase-read-write',
          name: 'Firebase Read/Write Test',
          description: 'Test read and write operations to Firestore',
          testFunction: async () => {
            const start = Date.now();
            try {
              // Create a test document
              const testData = {
                testId: `test-${Date.now()}`,
                timestamp: new Date(),
                message: 'Test document for application testing'
              };
              
              const docRef = await addDoc(collection(db, 'test'), testData);
              
              // Try to delete it immediately
              await deleteDoc(doc(db, 'test', docRef.id));
              
              return {
                success: true,
                message: 'Read/Write operations successful',
                duration: Date.now() - start,
                details: { testDocId: docRef.id }
              };
            } catch (error) {
              return {
                success: false,
                message: `Read/Write test failed: ${error}`,
                duration: Date.now() - start
              };
            }
          }
        }
      ]
    },
    {
      name: 'Cart Functionality Tests',
      status: 'idle',
      tests: [
        {
          id: 'cart-count',
          name: 'Cart Item Count',
          description: 'Test cart item counting functionality',
          testFunction: async () => {
            const start = Date.now();
            try {
              const itemCount = getCartItemCount();
              
              return {
                success: true,
                message: `Cart contains ${itemCount} items`,
                duration: Date.now() - start,
                details: { itemCount }
              };
            } catch (error) {
              return {
                success: false,
                message: `Cart count test failed: ${error}`,
                duration: Date.now() - start
              };
            }
          }
        }
      ]
    },
    {
      name: 'Performance Tests',
      status: 'idle',
      tests: [
        {
          id: 'page-load-time',
          name: 'Page Load Performance',
          description: 'Measure page load and render times',
          testFunction: async () => {
            const start = Date.now();
            try {
              // Simulate performance measurement
              const loadTime = performance.now();
              const memoryUsage = (performance as any).memory ? 
                (performance as any).memory.usedJSHeapSize : 'N/A';
              
              return {
                success: true,
                message: `Load time: ${loadTime.toFixed(2)}ms`,
                duration: Date.now() - start,
                details: { loadTime, memoryUsage }
              };
            } catch (error) {
              return {
                success: false,
                message: `Performance test failed: ${error}`,
                duration: Date.now() - start
              };
            }
          }
        }
      ]
    }
  ];

  // Firebase Rules Schema
  const firebaseRules = {
    rules: {
      items: {
        read: "auth != null",
        write: "auth != null && (resource == null || resource.data.sellerId == auth.uid || request.auth.token.email == 'stuartjamessmith@gmail.com')",
        validate: {
          title: "newData.isString() && newData.val().length > 0",
          price: "newData.isNumber() && newData.val() > 0",
          status: "newData.val().matches(/^(pending|approved|live|sold|archived)$/)",
          sellerId: "newData.val() == auth.uid"
        }
      },
      actionLogs: {
        read: "auth != null && auth.token.email == 'stuartjamessmith@gmail.com'",
        write: "auth != null",
        validate: {
          userId: "newData.val() == auth.uid",
          timestamp: "newData.val() == now"
        }
      },
      payments: {
        read: "auth != null && (resource.data.userId == auth.uid || auth.token.email == 'stuartjamessmith@gmail.com')",
        write: "auth != null && auth.token.email == 'stuartjamessmith@gmail.com'"
      },
      refunds: {
        read: "auth != null && auth.token.email == 'stuartjamessmith@gmail.com'",
        write: "auth != null && auth.token.email == 'stuartjamessmith@gmail.com'"
      },
      storeCreditTransactions: {
        read: "auth != null && (resource.data.userId == auth.uid || auth.token.email == 'stuartjamessmith@gmail.com')",
        write: "auth != null && auth.token.email == 'stuartjamessmith@gmail.com'"
      }
    }
  };

  // Initialize test suites
  useEffect(() => {
    if (isOpen) {
      setTestSuites(createTestSuites());
    }
  }, [isOpen, isAuthenticated, user, isAdmin]);

  // Run individual test
  const runTest = async (suiteIndex: number, testIndex: number) => {
    const testSuite = testSuites[suiteIndex];
    const test = testSuite.tests[testIndex];
    
    setTestSuites(prev => {
      const updated = [...prev];
      updated[suiteIndex] = { ...updated[suiteIndex], status: 'running' };
      return updated;
    });

    try {
      const result = await test.testFunction();
      const resultKey = `${testSuite.name}-${test.id}`;
      
      setTestResults(prev => new Map(prev.set(resultKey, result)));
      
      setTestSuites(prev => {
        const updated = [...prev];
        updated[suiteIndex] = { 
          ...updated[suiteIndex], 
          status: result.success ? 'completed' : 'failed'
        };
        return updated;
      });
    } catch (error) {
      const resultKey = `${testSuite.name}-${test.id}`;
      const errorResult: TestResult = {
        success: false,
        message: `Test execution failed: ${error}`,
        duration: 0
      };
      
      setTestResults(prev => new Map(prev.set(resultKey, errorResult)));
      
      setTestSuites(prev => {
        const updated = [...prev];
        updated[suiteIndex] = { ...updated[suiteIndex], status: 'failed' };
        return updated;
      });
    }
  };

  // Run all tests
  const runAllTests = async () => {
    setRunningTests(true);
    setTestResults(new Map());
    
    // Calculate total tests
    const totalTests = testSuites.reduce((total, suite) => total + suite.tests.length, 0);
    setTestProgress({ completed: 0, total: totalTests });
    
    let completedTests = 0;
    
    for (let suiteIndex = 0; suiteIndex < testSuites.length; suiteIndex++) {
      const testSuite = testSuites[suiteIndex];
      for (let testIndex = 0; testIndex < testSuite.tests.length; testIndex++) {
        await runTest(suiteIndex, testIndex);
        completedTests++;
        setTestProgress({ completed: completedTests, total: totalTests });
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setRunningTests(false);
    // Reset progress after completion
    setTimeout(() => {
      setTestProgress({ completed: 0, total: 0 });
    }, 2000);
  };

  const categories = [
    'all',
    ...Array.from(new Set(features.map(f => f.category))).sort()
  ];

  const filteredFeatures = features.filter(feature => {
    const matchesCategory = selectedCategory === 'all' || feature.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      feature.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feature.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feature.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesCategory && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'testing': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusStats = () => {
    const stats = {
      total: features.length,
      untested: features.filter(f => f.status === 'untested').length,
      testing: features.filter(f => f.status === 'testing').length,
      passed: features.filter(f => f.status === 'passed').length,
      failed: features.filter(f => f.status === 'failed').length
    };
    
    return stats;
  };

  const stats = getStatusStats();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-2">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] max-h-[95vh] overflow-hidden">
        <div className="sticky top-0 bg-white border-b border-gray-200">
          <div className="flex justify-between items-center p-6 pb-0">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Application Test & Performance</h2>
              <p className="text-gray-600 mt-1">Comprehensive feature testing and performance monitoring</p>
            </div>
            <button
              onClick={() => throttledAction('close_modal', () => onClose())}
              disabled={isActionDisabled('close_modal')}
              className="text-gray-400 hover:text-gray-600 focus:outline-none disabled:opacity-50"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200 px-6">
            <button
              onClick={() => setActiveTab('features')}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'features'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📋 Features ({features.length})
            </button>
            <button
              onClick={() => setActiveTab('tests')}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'tests'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              🧪 Live Tests ({testSuites.length} suites)
            </button>
            <button
              onClick={() => setActiveTab('firebase')}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'firebase'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              🔥 Firebase Rules
            </button>
          </div>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(95vh - 200px)' }}>
          {/* Features Tab */}
          {activeTab === 'features' && (
            <div className="p-6">
              {/* Summary Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Features</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Untested</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.untested}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Testing</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.testing}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Passed</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.passed}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="p-2 bg-red-100 rounded-lg">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Failed</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.failed}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
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
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(feature.status)}`}>
                          {feature.status.charAt(0).toUpperCase() + feature.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button className="text-orange-600 hover:text-orange-900 mr-3">
                          Test
                        </button>
                        <button className="text-blue-600 hover:text-blue-900">
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {filteredFeatures.length === 0 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Features Found</h3>
              <p className="text-gray-500">Try adjusting your search or category filter.</p>
            </div>
          )}
            </div>
          )}

          {/* Tests Tab */}
          {activeTab === 'tests' && (
            <div className="p-6">
              {/* Test Controls */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Live Application Tests</h3>
                  <p className="text-gray-600">Run automated tests to verify application functionality</p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <button
                    onClick={runAllTests}
                    disabled={runningTests}
                    className={`
                      relative overflow-hidden px-6 py-3 rounded-xl font-semibold text-sm
                      transition-all duration-300 transform hover:scale-105 active:scale-95
                      shadow-lg hover:shadow-xl
                      ${runningTests
                        ? 'bg-gradient-to-r from-gray-400 to-gray-500 text-white cursor-not-allowed'
                        : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      {runningTests ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Running Tests...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6-8h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2z" />
                          </svg>
                          <span>Run All Tests</span>
                        </>
                      )}
                    </div>
                  </button>
                  
                  {/* Progress Bar */}
                  {runningTests && testProgress.total > 0 && (
                    <div className="w-full max-w-xs">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Progress</span>
                        <span>{testProgress.completed}/{testProgress.total} ({Math.round((testProgress.completed / testProgress.total) * 100)}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full transition-all duration-500 ease-out"
                          style={{ 
                            width: `${(testProgress.completed / testProgress.total) * 100}%`,
                            boxShadow: '0 0 10px rgba(249, 115, 22, 0.5)'
                          }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Test Suites */}
              <div className="space-y-6">
                {testSuites.map((suite, suiteIndex) => (
                  <div key={suite.name} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className={`p-4 ${
                      suite.status === 'running' ? 'bg-yellow-50' :
                      suite.status === 'completed' ? 'bg-green-50' :
                      suite.status === 'failed' ? 'bg-red-50' : 'bg-gray-50'
                    }`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="text-lg font-medium text-gray-900">{suite.name}</h4>
                          <p className="text-sm text-gray-600">{suite.tests.length} tests</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            suite.status === 'running' ? 'bg-yellow-100 text-yellow-800' :
                            suite.status === 'completed' ? 'bg-green-100 text-green-800' :
                            suite.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {suite.status.charAt(0).toUpperCase() + suite.status.slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="divide-y divide-gray-200">
                      {suite.tests.map((test, testIndex) => {
                        const resultKey = `${suite.name}-${test.id}`;
                        const result = testResults.get(resultKey);
                        
                        return (
                          <div key={test.id} className="p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h5 className="font-medium text-gray-900">{test.name}</h5>
                                <p className="text-sm text-gray-600 mt-1">{test.description}</p>
                                {result && (
                                  <div className="mt-2">
                                    <div className={`text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                                      {result.success ? '✅' : '❌'} {result.message}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                      Duration: {result.duration}ms
                                      {result.details && (
                                        <div className="mt-1 p-2 bg-gray-50 rounded text-xs">
                                          <pre>{JSON.stringify(result.details, null, 2)}</pre>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => runTest(suiteIndex, testIndex)}
                                disabled={runningTests}
                                className="ml-4 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
                              >
                                Run Test
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Firebase Rules Tab */}
          {activeTab === 'firebase' && (
            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Firebase Security Rules</h3>
                <p className="text-gray-600">Current security rules configuration for Firestore database</p>
              </div>

              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-green-400 text-sm">
                  <code>{JSON.stringify(firebaseRules, null, 2)}</code>
                </pre>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">🔒 Security Features</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Authentication required for all operations</li>
                    <li>• User-specific data access controls</li>
                    <li>• Admin-only access for sensitive operations</li>
                    <li>• Data validation rules</li>
                    <li>• Timestamp verification</li>
                  </ul>
                </div>
                
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">📊 Collections Protected</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• <code>items</code> - Consignment items</li>
                    <li>• <code>actionLogs</code> - User activity logs</li>
                    <li>• <code>payments</code> - Payment records</li>
                    <li>• <code>refunds</code> - Refund transactions</li>
                    <li>• <code>storeCreditTransactions</code> - Store credit</li>
                  </ul>
                </div>
              </div>

              <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-medium text-yellow-900 mb-2">⚠️ Important Notes</h4>
                <ul className="text-sm text-yellow-800 space-y-1">
                  <li>• Admin access is granted to: stuartjamessmith@gmail.com</li>
                  <li>• Users can only modify their own items</li>
                  <li>• All writes are logged with timestamps</li>
                  <li>• Read access requires authentication</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApplicationTestModal;
