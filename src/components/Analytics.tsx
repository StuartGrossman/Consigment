import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, PaymentRecord, AuthUser, UserAnalytics, User } from '../types';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import ItemDetailModal from './ItemDetailModal';

interface AnalyticsProps {
  user: AuthUser | null;
  isAdmin: boolean;
}

const Analytics: React.FC<AnalyticsProps> = ({ user, isAdmin }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'sold'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [userAnalytics, setUserAnalytics] = useState<UserAnalytics[]>([]);
  const [soldItems, setSoldItems] = useState<ConsignmentItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ConsignmentItem | null>(null);
  const [isItemDetailModalOpen, setIsItemDetailModalOpen] = useState(false);

  // Muted color palette
  const COLORS = ['#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9'];

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboardData();
    } else if (activeTab === 'users' && isAdmin) {
      fetchUserAnalytics();
    } else if (activeTab === 'sold') {
      fetchSoldItems();
    }
  }, [activeTab, user, isAdmin]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const itemsRef = collection(db, 'items');
      const itemsSnapshot = await getDocs(itemsRef);
      const items: ConsignmentItem[] = [];
      
      itemsSnapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          approvedAt: data.approvedAt?.toDate(),
          liveAt: data.liveAt?.toDate(),
          soldAt: data.soldAt?.toDate()
        } as ConsignmentItem);
      });

      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const users: any[] = [];
      
      usersSnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });

      const data = calculateDashboardData(items, users);
      setDashboardData(data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserAnalytics = async () => {
    setLoading(true);
    try {
      const allUsers: User[] = [];
      const userMap = new Map<string, UserAnalytics>();

      const itemsRef = collection(db, 'items');
      const itemsSnapshot = await getDocs(itemsRef);

      itemsSnapshot.forEach((doc) => {
        const item = { 
          id: doc.id, 
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          approvedAt: doc.data().approvedAt?.toDate(),
          liveAt: doc.data().liveAt?.toDate(),
          soldAt: doc.data().soldAt?.toDate()
        } as ConsignmentItem;
        const userId = item.sellerId;
        
        if (!userMap.has(userId)) {
          const user: User = {
            uid: userId,
            email: item.sellerEmail,
            displayName: item.sellerName,
            photoURL: ''
          };
          allUsers.push(user);

          userMap.set(userId, {
            userId,
            userName: item.sellerName,
            userEmail: item.sellerEmail,
            totalItemsListed: 0,
            totalItemsSold: 0,
            totalEarnings: 0,
            totalPaid: 0,
            outstandingBalance: 0,
            storeCredit: 0,
            activeItems: [],
            soldItems: [],
            pendingItems: [],
            approvedItems: []
          });
        }

        const analytics = userMap.get(userId)!;
        analytics.totalItemsListed++;

        switch (item.status) {
          case 'pending':
            analytics.pendingItems.push(item);
            break;
          case 'approved':
            analytics.approvedItems.push(item);
            break;
          case 'live':
            analytics.activeItems.push(item);
            break;
          case 'sold':
            analytics.soldItems.push(item);
            analytics.totalItemsSold++;
            const soldPrice = item.soldPrice || item.price;
            const userEarnings = item.userEarnings || (soldPrice * 0.75);
            analytics.totalEarnings += userEarnings;
            break;
        }
      });

      // Calculate outstanding balances
      userMap.forEach((analytics) => {
        analytics.outstandingBalance = analytics.totalEarnings - analytics.totalPaid;
      });

      setUserAnalytics(Array.from(userMap.values()));
    } catch (error) {
      console.error('Error fetching user analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSoldItems = async () => {
    setLoading(true);
    try {
      const itemsRef = collection(db, 'items');
      const q = query(itemsRef, where('status', '==', 'sold'));
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
          soldAt: data.soldAt?.toDate() || new Date(),
          barcodeGeneratedAt: data.barcodeGeneratedAt?.toDate(),
          printConfirmedAt: data.printConfirmedAt?.toDate()
        } as ConsignmentItem);
      });

      items.sort((a, b) => {
        const aTime = a.soldAt || a.createdAt;
        const bTime = b.soldAt || b.createdAt;
        return bTime.getTime() - aTime.getTime();
      });

      setSoldItems(items);
    } catch (error) {
      console.error('Error fetching sold items:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateDashboardData = (items: ConsignmentItem[], users: any[]) => {
    const now = new Date();
    const soldItems = items.filter(item => item.status === 'sold');
    
    const totalRevenue = soldItems.reduce((sum, item) => sum + (item.soldPrice || item.price), 0);
    const uniqueSellers = new Set(items.map(item => item.sellerId));
    const avgItemPrice = soldItems.length > 0 ? totalRevenue / soldItems.length : 0;
    
    // Monthly revenue data (last 12 months)
    const monthlyRevenue = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const monthItems = soldItems.filter(item => 
        item.soldAt && item.soldAt >= monthStart && item.soldAt <= monthEnd
      );
      
      const monthRevenue = monthItems.reduce((sum, item) => sum + (item.soldPrice || item.price), 0);
      
      monthlyRevenue.push({
        month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        revenue: monthRevenue,
        items: monthItems.length
      });
    }

    // Category breakdown
    const categoryMap = new Map<string, {count: number, revenue: number}>();
    items.forEach(item => {
      const category = item.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { count: 0, revenue: 0 });
      }
      const cat = categoryMap.get(category)!;
      cat.count++;
      if (item.status === 'sold') {
        cat.revenue += item.soldPrice || item.price;
      }
    });
    
    const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      count: data.count,
      revenue: data.revenue
    })).sort((a, b) => b.count - a.count);

    // Status breakdown
    const statusMap = new Map<string, number>();
    items.forEach(item => {
      statusMap.set(item.status, (statusMap.get(item.status) || 0) + 1);
    });
    
    const statusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({
      status: status.charAt(0).toUpperCase() + status.slice(1),
      count,
      value: count
    }));

    return {
      totalRevenue,
      totalItems: items.length,
      activeUsers: uniqueSellers.size,
      avgItemPrice,
      monthlyRevenue,
      categoryBreakdown,
      statusBreakdown
    };
  };

  const exportData = (format: 'csv' | 'json') => {
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (format === 'csv') {
      let csvContent = '';
      if (activeTab === 'dashboard' && dashboardData) {
        csvContent = 'Month,Revenue,Items Sold\n';
        dashboardData.monthlyRevenue.forEach((row: any) => {
          csvContent += `${row.month},${row.revenue},${row.items}\n`;
        });
      } else if (activeTab === 'sold') {
        csvContent = 'Title,Seller,Original Price,Sold Price,Date Sold\n';
        soldItems.forEach((item) => {
          csvContent += `"${item.title}","${item.sellerName}",${item.price},${item.soldPrice || item.price},"${item.soldAt?.toLocaleDateString()}"\n`;
        });
      }
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${activeTab}-${timestamp}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } else {
      let data = {};
      if (activeTab === 'dashboard') {
        data = dashboardData;
      } else if (activeTab === 'sold') {
        data = { soldItems };
      } else if (activeTab === 'users') {
        data = { userAnalytics };
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${activeTab}-${timestamp}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  const handleItemClick = (item: ConsignmentItem) => {
    setSelectedItem(item);
    setIsItemDetailModalOpen(true);
  };

  const handleItemDetailModalClose = () => {
    setSelectedItem(null);
    setIsItemDetailModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600 mt-2">Comprehensive business insights and performance metrics</p>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'dashboard'
                  ? 'border-slate-500 text-slate-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Dashboard Overview
            </button>
            <button
              onClick={() => setActiveTab('sold')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'sold'
                  ? 'border-slate-500 text-slate-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Sold Items
            </button>
            {isAdmin && (
              <button
                onClick={() => setActiveTab('users')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'users'
                    ? 'border-slate-500 text-slate-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                User Analytics
              </button>
            )}
          </nav>
        </div>

        {/* Export Controls */}
        <div className="mb-6 flex justify-end space-x-3">
          <button
            onClick={() => exportData('csv')}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={() => exportData('json')}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Export JSON
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-500"></div>
          </div>
        ) : (
          <>
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && dashboardData && (
              <div className="space-y-8">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-gradient-to-r from-slate-500 to-slate-600 rounded-xl p-6 text-white">
                    <h3 className="text-lg font-semibold mb-2">Total Revenue</h3>
                    <p className="text-3xl font-bold">{formatCurrency(dashboardData.totalRevenue)}</p>
                  </div>
                  <div className="bg-gradient-to-r from-gray-500 to-gray-600 rounded-xl p-6 text-white">
                    <h3 className="text-lg font-semibold mb-2">Total Items</h3>
                    <p className="text-3xl font-bold">{dashboardData.totalItems}</p>
                  </div>
                  <div className="bg-gradient-to-r from-zinc-500 to-zinc-600 rounded-xl p-6 text-white">
                    <h3 className="text-lg font-semibold mb-2">Active Sellers</h3>
                    <p className="text-3xl font-bold">{dashboardData.activeUsers}</p>
                  </div>
                  <div className="bg-gradient-to-r from-stone-500 to-stone-600 rounded-xl p-6 text-white">
                    <h3 className="text-lg font-semibold mb-2">Avg Item Price</h3>
                    <p className="text-3xl font-bold">{formatCurrency(dashboardData.avgItemPrice)}</p>
                  </div>
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Monthly Revenue Trend */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Revenue Trend</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={dashboardData.monthlyRevenue}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" stroke="#64748b" />
                        <YAxis stroke="#64748b" />
                        <Tooltip 
                          formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                          labelStyle={{ color: '#1f2937' }}
                          contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#64748b" fill="#94a3b8" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Items Sold by Month */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Items Sold by Month</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dashboardData.monthlyRevenue}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" stroke="#64748b" />
                        <YAxis stroke="#64748b" />
                        <Tooltip 
                          formatter={(value: any) => [value, 'Items Sold']}
                          labelStyle={{ color: '#1f2937' }}
                          contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
                        />
                        <Bar dataKey="items" fill="#64748b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Items by Category */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Items by Category</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={dashboardData.categoryBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ category, count }) => `${category}: ${count}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {dashboardData.categoryBreakdown.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: any) => [value, 'Items']}
                          labelStyle={{ color: '#1f2937' }}
                          contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Item Status Distribution */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Item Status Distribution</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={dashboardData.statusBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ status, count }) => `${status}: ${count}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {dashboardData.statusBreakdown.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: any) => [value, 'Items']}
                          labelStyle={{ color: '#1f2937' }}
                          contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Sold Items Tab */}
            {activeTab === 'sold' && (
              <div className="space-y-8">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                  <div className="bg-gradient-to-r from-slate-500 to-slate-600 rounded-xl p-6 text-white">
                    <h3 className="text-lg font-semibold mb-2">Total Revenue</h3>
                    <p className="text-3xl font-bold">
                      {formatCurrency(soldItems.reduce((sum, item) => sum + (item.soldPrice || item.price), 0))}
                    </p>
                  </div>
                  <div className="bg-gradient-to-r from-gray-500 to-gray-600 rounded-xl p-6 text-white">
                    <h3 className="text-lg font-semibold mb-2">Admin Earnings (25%)</h3>
                    <p className="text-3xl font-bold">
                      {formatCurrency(soldItems.reduce((sum, item) => {
                        const soldPrice = item.soldPrice || item.price;
                        return sum + (item.adminEarnings || (soldPrice * 0.25));
                      }, 0))}
                    </p>
                  </div>
                  <div className="bg-gradient-to-r from-zinc-500 to-zinc-600 rounded-xl p-6 text-white">
                    <h3 className="text-lg font-semibold mb-2">User Earnings (75%)</h3>
                    <p className="text-3xl font-bold">
                      {formatCurrency(soldItems.reduce((sum, item) => {
                        const soldPrice = item.soldPrice || item.price;
                        return sum + (item.userEarnings || (soldPrice * 0.75));
                      }, 0))}
                    </p>
                  </div>
                  <div className="bg-gradient-to-r from-stone-500 to-stone-600 rounded-xl p-6 text-white">
                    <h3 className="text-lg font-semibold mb-2">Items Sold</h3>
                    <p className="text-3xl font-bold">{soldItems.length}</p>
                  </div>
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                    <h3 className="text-lg font-semibold mb-2">Sale Types</h3>
                    <div className="text-sm space-y-1">
                      <div>In-Store: {soldItems.filter(item => item.saleType === 'in-store').length}</div>
                      <div>Online: {soldItems.filter(item => item.saleType === 'online').length}</div>
                    </div>
                  </div>
                </div>

                {/* Sold Items Table */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    All Sold Items ({soldItems.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seller</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original Price</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sold Price</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Barcode</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Sold</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {soldItems.map((item) => {
                          const soldPrice = item.soldPrice || item.price;
                          
                          return (
                            <tr key={item.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  {item.images && item.images[0] && (
                                    <img className="h-10 w-10 rounded-lg object-cover mr-3" src={item.images[0]} alt={item.title} />
                                  )}
                                  <div>
                                    <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{item.title}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.sellerName}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(item.price)}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-600">{formatCurrency(soldPrice)}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  item.saleType === 'online' 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {item.saleType === 'online' ? '🌐 Online' : '🏪 In-Store'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {item.barcodeData ? (
                                  <span className="text-green-600">✓ Generated</span>
                                ) : (
                                  <span className="text-gray-400">No barcode</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {(item.soldAt || new Date()).toLocaleDateString()}
                              </td>
                                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                <button
                                                  onClick={() => handleItemClick(item)}
                                                  className="text-slate-600 hover:text-slate-900"
                                                >
                                                  View Details
                                                </button>
                                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* User Analytics Tab */}
            {activeTab === 'users' && isAdmin && (
              <div className="space-y-8">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    User Performance ({userAnalytics.length} users)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items Listed</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items Sold</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Earnings</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding Balance</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Success Rate</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {userAnalytics.map((analytics) => {
                          const successRate = analytics.totalItemsListed > 0 
                            ? (analytics.totalItemsSold / analytics.totalItemsListed) * 100 
                            : 0;
                          
                          return (
                            <tr key={analytics.userId} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{analytics.userName}</div>
                                <div className="text-sm text-gray-500">{analytics.userEmail}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{analytics.totalItemsListed}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{analytics.totalItemsSold}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-600">
                                {formatCurrency(analytics.totalEarnings)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-600">
                                {formatCurrency(analytics.outstandingBalance)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {successRate.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Item Detail Modal */}
        <ItemDetailModal 
          isOpen={isItemDetailModalOpen}
          onClose={handleItemDetailModalClose}
          item={selectedItem}
          onItemUpdated={() => {
            fetchDashboardData();
            fetchSoldItems();
          }}
        />
      </div>
    </div>
  );
};

export default Analytics; 