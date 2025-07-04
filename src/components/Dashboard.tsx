import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem, PaymentRecord, AuthUser } from '../types';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface DashboardProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
}

interface DashboardData {
  totalRevenue: number;
  totalItems: number;
  activeUsers: number;
  avgItemPrice: number;
  monthlyRevenue: Array<{month: string, revenue: number, items: number}>;
  categoryBreakdown: Array<{category: string, count: number, revenue: number}>;
  statusBreakdown: Array<{status: string, count: number, value: number}>;
  topSellers: Array<{name: string, revenue: number, items: number}>;
  recentActivity: Array<{date: string, items: number, revenue: number}>;
  userGrowth: Array<{month: string, users: number}>;
}

const Dashboard: React.FC<DashboardProps> = ({ isOpen, onClose, user }) => {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchDashboardData();
    }
  }, [isOpen]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch all items
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

      // Fetch all users
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const users: any[] = [];
      
      usersSnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });

      // Calculate dashboard data
      const data = calculateDashboardData(items, users);
      setDashboardData(data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateDashboardData = (items: ConsignmentItem[], users: any[]): DashboardData => {
    const now = new Date();
    const soldItems = items.filter(item => item.status === 'sold');
    
    // Calculate total revenue
    const totalRevenue = soldItems.reduce((sum, item) => sum + (item.soldPrice || item.price), 0);
    
    // Get unique sellers who have actually sold items (not just submitted)
    const activeSellers = new Set(soldItems.map(item => item.sellerId));
    
    // Calculate average item price
    const avgItemPrice = soldItems.length > 0 ? totalRevenue / soldItems.length : 0;
    
    // Monthly revenue data (last 12 months)
    const monthlyRevenue = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const monthItems = soldItems.filter(item => {
        if (!item.soldAt) return false;
        const soldDate = item.soldAt instanceof Date ? item.soldAt : new Date(item.soldAt);
        return soldDate >= monthStart && soldDate <= monthEnd;
      });
      
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

    // Top sellers
    const sellerMap = new Map<string, {name: string, revenue: number, items: number}>();
    items.forEach(item => {
      if (!sellerMap.has(item.sellerId)) {
        sellerMap.set(item.sellerId, {
          name: item.sellerName,
          revenue: 0,
          items: 0
        });
      }
      const seller = sellerMap.get(item.sellerId)!;
      seller.items++;
      if (item.status === 'sold') {
        seller.revenue += (item.soldPrice || item.price) * 0.75; // User gets 75%
      }
    });
    
    const topSellers = Array.from(sellerMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Recent activity (last 30 days)
    const recentActivity = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      
      const dayItems = soldItems.filter(item => 
        item.soldAt && item.soldAt >= dayStart && item.soldAt < dayEnd
      );
      
      const dayRevenue = dayItems.reduce((sum, item) => sum + (item.soldPrice || item.price), 0);
      
      recentActivity.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        items: dayItems.length,
        revenue: dayRevenue
      });
    }

    // User growth (last 12 months)
    const userGrowth = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const usersCount = users.filter(user => 
        user.createdAt && new Date(user.createdAt.toDate ? user.createdAt.toDate() : user.createdAt) <= monthEnd
      ).length;
      
      userGrowth.push({
        month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        users: usersCount
      });
    }

    return {
      totalRevenue,
      totalItems: items.length,
      activeUsers: activeSellers.size,
      avgItemPrice,
      monthlyRevenue,
      categoryBreakdown,
      statusBreakdown,
      topSellers,
      recentActivity,
      userGrowth
    };
  };

  const exportData = (format: 'csv' | 'json') => {
    if (!dashboardData) return;

    const data = {
      summary: {
        totalRevenue: dashboardData.totalRevenue,
        totalItems: dashboardData.totalItems,
        activeUsers: dashboardData.activeUsers,
        avgItemPrice: dashboardData.avgItemPrice,
        exportDate: new Date().toISOString()
      },
      monthlyRevenue: dashboardData.monthlyRevenue,
      categoryBreakdown: dashboardData.categoryBreakdown,
      statusBreakdown: dashboardData.statusBreakdown,
      topSellers: dashboardData.topSellers,
      recentActivity: dashboardData.recentActivity,
      userGrowth: dashboardData.userGrowth
    };

    if (format === 'json') {
      const dataStr = JSON.stringify(data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dashboard-analytics-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } else if (format === 'csv') {
      let csvContent = 'Metric,Value\n';
      csvContent += `Total Revenue,$${data.summary.totalRevenue.toFixed(2)}\n`;
      csvContent += `Total Items,${data.summary.totalItems}\n`;
      csvContent += `Active Users,${data.summary.activeUsers}\n`;
      csvContent += `Average Item Price,$${data.summary.avgItemPrice.toFixed(2)}\n`;
      csvContent += '\n\nMonthly Revenue\nMonth,Revenue,Items Sold\n';
      data.monthlyRevenue.forEach(item => {
        csvContent += `${item.month},$${item.revenue.toFixed(2)},${item.items}\n`;
      });
      
      const dataBlob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dashboard-analytics-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    }
  };

  const COLORS = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden">
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200 rounded-t-xl">
          <div className="flex justify-between items-center">
            <div>
                                  <h2 className="text-3xl font-bold text-gray-800">Sales Dashboard</h2>
              <p className="text-gray-600">Comprehensive business insights and metrics</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                <button
                  onClick={() => exportData('csv')}
                  className="bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600 text-sm"
                >
                  📊 CSV
                </button>
                <button
                  onClick={() => exportData('json')}
                  className="bg-gray-500 text-white px-3 py-2 rounded-lg hover:bg-gray-600 text-sm"
                >
                  📋 JSON
                </button>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(95vh-120px)]">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
            </div>
          ) : dashboardData ? (
            <div className="space-y-8">
              {/* Key Metrics - Now Clickable */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div 
                  onClick={() => setActiveModal('revenue')}
                  className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 text-white cursor-pointer hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-100">Total Revenue</p>
                      <p className="text-3xl font-bold">${dashboardData.totalRevenue.toFixed(2)}</p>
                      <p className="text-xs text-orange-200 mt-1">Click for details</p>
                    </div>
                    <div className="text-4xl opacity-80">💰</div>
                  </div>
                </div>
                <div 
                  onClick={() => setActiveModal('items')}
                  className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white cursor-pointer hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100">Total Items</p>
                      <p className="text-3xl font-bold">{dashboardData.totalItems}</p>
                      <p className="text-xs text-blue-200 mt-1">Click for breakdown</p>
                    </div>
                    <div className="text-4xl opacity-80">📦</div>
                  </div>
                </div>
                <div 
                  onClick={() => setActiveModal('sellers')}
                  className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white cursor-pointer hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100">Active Sellers</p>
                      <p className="text-3xl font-bold">{dashboardData.activeUsers}</p>
                      <p className="text-xs text-green-200 mt-1">Click for seller stats</p>
                    </div>
                    <div className="text-4xl opacity-80">👥</div>
                  </div>
                </div>
                <div 
                  onClick={() => setActiveModal('pricing')}
                  className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white cursor-pointer hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-100">Avg Item Price</p>
                      <p className="text-3xl font-bold">${dashboardData.avgItemPrice.toFixed(2)}</p>
                      <p className="text-xs text-purple-200 mt-1">Click for price analysis</p>
                    </div>
                    <div className="text-4xl opacity-80">💲</div>
                  </div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Monthly Revenue Chart */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">Monthly Revenue Trend</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={dashboardData.monthlyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']} />
                      <Area type="monotone" dataKey="revenue" stroke="#f97316" fill="#fed7aa" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Items Sold Chart */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">Items Sold by Month</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dashboardData.monthlyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="items" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Category Breakdown Pie Chart */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">Items by Category</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={dashboardData.categoryBreakdown.slice(0, 8)}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="count"
                        label={({ category, count }) => `${category}: ${count}`}
                      >
                        {dashboardData.categoryBreakdown.slice(0, 8).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Status Breakdown */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">Item Status Distribution</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={dashboardData.statusBreakdown}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ status, count }) => `${status}: ${count}`}
                      >
                        {dashboardData.statusBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Recent Activity */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">Daily Activity (Last 30 Days)</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dashboardData.recentActivity}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="items" stroke="#10b981" strokeWidth={2} name="Items Sold" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* User Growth */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">User Growth</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={dashboardData.userGrowth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="users" stroke="#8b5cf6" fill="#ddd6fe" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Sellers Table */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Top Sellers</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seller</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items Sold</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {dashboardData.topSellers.map((seller, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            #{index + 1}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {seller.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                            ${seller.revenue.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {seller.items}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modals */}
      {activeModal && dashboardData && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-bold text-gray-800">
                  {activeModal === 'revenue' && '💰 Revenue Details'}
                  {activeModal === 'items' && '📦 Items Breakdown'}
                  {activeModal === 'sellers' && '👥 Active Sellers Analysis'}
                  {activeModal === 'pricing' && '💲 Pricing Analytics'}
                </h3>
                <button
                  onClick={() => setActiveModal(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {activeModal === 'revenue' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <p className="text-orange-800 font-medium">Total Revenue</p>
                      <p className="text-2xl font-bold text-orange-600">${dashboardData.totalRevenue.toFixed(2)}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-green-800 font-medium">Items Sold</p>
                      <p className="text-2xl font-bold text-green-600">{dashboardData.monthlyRevenue.reduce((sum, m) => sum + m.items, 0)}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-blue-800 font-medium">Avg Monthly Revenue</p>
                      <p className="text-2xl font-bold text-blue-600">${(dashboardData.totalRevenue / 12).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-6">
                    <h4 className="text-lg font-semibold mb-4">Monthly Revenue Trend</h4>
                    <ResponsiveContainer width="100%" height={400}>
                      <AreaChart data={dashboardData.monthlyRevenue}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']} />
                        <Area type="monotone" dataKey="revenue" stroke="#f97316" fill="#fed7aa" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {activeModal === 'items' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-blue-800 font-medium">Total Items</p>
                      <p className="text-2xl font-bold text-blue-600">{dashboardData.totalItems}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-green-800 font-medium">Sold Items</p>
                      <p className="text-2xl font-bold text-green-600">{dashboardData.monthlyRevenue.reduce((sum, m) => sum + m.items, 0)}</p>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <p className="text-yellow-800 font-medium">Pending Items</p>
                      <p className="text-2xl font-bold text-yellow-600">{dashboardData.statusBreakdown.find(s => s.status === 'Pending')?.count || 0}</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <p className="text-purple-800 font-medium">Live Items</p>
                      <p className="text-2xl font-bold text-purple-600">{dashboardData.statusBreakdown.find(s => s.status === 'Live')?.count || 0}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                      <h4 className="text-lg font-semibold mb-4">Items Sold by Month</h4>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={dashboardData.monthlyRevenue}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="items" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                      <h4 className="text-lg font-semibold mb-4">Items by Status</h4>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={dashboardData.statusBreakdown}
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ status, count }) => `${status}: ${count}`}
                          >
                            {dashboardData.statusBreakdown.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {activeModal === 'sellers' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-green-800 font-medium">Active Sellers</p>
                      <p className="text-2xl font-bold text-green-600">{dashboardData.activeUsers}</p>
                      <p className="text-sm text-green-600">Sellers who have sold items</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-blue-800 font-medium">Top Seller Revenue</p>
                      <p className="text-2xl font-bold text-blue-600">${dashboardData.topSellers[0]?.revenue.toFixed(2) || '0.00'}</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <p className="text-purple-800 font-medium">Avg Revenue per Seller</p>
                      <p className="text-2xl font-bold text-purple-600">${dashboardData.activeUsers > 0 ? (dashboardData.totalRevenue * 0.75 / dashboardData.activeUsers).toFixed(2) : '0.00'}</p>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-6">
                    <h4 className="text-lg font-semibold mb-4">Top 10 Sellers by Revenue</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seller</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue (75%)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items Sold</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg per Item</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {dashboardData.topSellers.map((seller, index) => (
                            <tr key={index} className={index < 3 ? 'bg-yellow-50' : ''}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {index === 0 && '🥇'} {index === 1 && '🥈'} {index === 2 && '🥉'} #{index + 1}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                {seller.name}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                                ${seller.revenue.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {seller.items}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                ${seller.items > 0 ? (seller.revenue / seller.items).toFixed(2) : '0.00'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeModal === 'pricing' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <p className="text-purple-800 font-medium">Average Item Price</p>
                      <p className="text-2xl font-bold text-purple-600">${dashboardData.avgItemPrice.toFixed(2)}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-green-800 font-medium">Highest Category Avg</p>
                      <p className="text-2xl font-bold text-green-600">
                        ${Math.max(...dashboardData.categoryBreakdown.map(c => c.count > 0 ? c.revenue / c.count : 0)).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-blue-800 font-medium">Total Categories</p>
                      <p className="text-2xl font-bold text-blue-600">{dashboardData.categoryBreakdown.length}</p>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-6">
                    <h4 className="text-lg font-semibold mb-4">Revenue by Category</h4>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={dashboardData.categoryBreakdown.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="category" angle={-45} textAnchor="end" height={80} />
                        <YAxis />
                        <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']} />
                        <Bar dataKey="revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard; 