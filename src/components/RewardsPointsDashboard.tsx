import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { AuthUser } from '../types';
import { apiService } from '../services/apiService';
import NotificationModal from './NotificationModal';

interface RewardsConfig {
  pointsPerDollarSpent: number;
  refundPointsPercentage: number;
  pointValueInUSD: number;
  minimumRedemptionPoints: number;
  bonusPointsMultiplier: number;
  welcomeBonusPoints: number;
  lastUpdated: Date;
  updatedBy: string;
}

interface UserRewardsData {
  uid: string;
  email: string;
  displayName: string;
  totalPoints: number;
  totalSpent: number;
  totalEarned: number;
  totalRedeemed: number;
  lastActivity: Date;
  joinDate: Date;
}

interface RewardsPointsDashboardProps {
  user: AuthUser | null;
  isOpen: boolean;
  onClose: () => void;
}

const RewardsPointsDashboard: React.FC<RewardsPointsDashboardProps> = ({ user, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'config' | 'users' | 'analytics'>('config');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rewardsConfig, setRewardsConfig] = useState<RewardsConfig>({
    pointsPerDollarSpent: 1,
    refundPointsPercentage: 50,
    pointValueInUSD: 0.01,
    minimumRedemptionPoints: 100,
    bonusPointsMultiplier: 1.5,
    welcomeBonusPoints: 100,
    lastUpdated: new Date(),
    updatedBy: ''
  });
  const [usersRewardsData, setUsersRewardsData] = useState<UserRewardsData[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationData, setNotificationData] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  const showNotificationModal = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    setNotificationData({ title, message, type });
    setShowNotification(true);
  };

  useEffect(() => {
    if (isOpen) {
      fetchRewardsConfig();
      fetchUsersRewardsData();
    }
  }, [isOpen]);

  const fetchRewardsConfig = async () => {
    setLoading(true);
    try {
      const response = await apiService.getRewardsConfig();
      if (response.success) {
        setRewardsConfig(response.config);
      }
    } catch (error) {
      console.error('Error fetching rewards config:', error);
      showNotificationModal('Error', 'Failed to fetch rewards configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsersRewardsData = async () => {
    try {
      const response = await apiService.getRewardsAnalytics();
      setUsersRewardsData(response.users || []);
    } catch (error) {
      console.error('Error fetching user rewards data:', error);
      showNotificationModal('Error', 'Failed to fetch user rewards data', 'error');
    }
  };

  const saveRewardsConfig = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const configData = {
        ...rewardsConfig,
        lastUpdated: new Date(),
        updatedBy: user.email || user.uid
      };

      await apiService.updateRewardsConfig(configData);
      setRewardsConfig(configData);
      showNotificationModal('Success', 'Rewards configuration updated successfully', 'success');
    } catch (error) {
      console.error('Error saving rewards config:', error);
      showNotificationModal('Error', 'Failed to update rewards configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const adjustUserPoints = async (userId: string, pointsAdjustment: number, reason: string) => {
    try {
      await apiService.adjustUserRewardsPoints(userId, pointsAdjustment, reason);
      await fetchUsersRewardsData();
      showNotificationModal('Success', `User points adjusted successfully`, 'success');
    } catch (error) {
      console.error('Error adjusting user points:', error);
      showNotificationModal('Error', 'Failed to adjust user points', 'error');
    }
  };

  if (!isOpen) return null;

  const totalPointsIssued = usersRewardsData.reduce((sum, user) => sum + user.totalEarned, 0);
  const totalPointsRedeemed = usersRewardsData.reduce((sum, user) => sum + user.totalRedeemed, 0);
  const totalActivePoints = usersRewardsData.reduce((sum, user) => sum + user.totalPoints, 0);
  const totalValueInUSD = totalActivePoints * rewardsConfig.pointValueInUSD;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Rewards Points Dashboard</h2>
                <p className="text-gray-600">Manage rewards configuration and user points</p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('config')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'config'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Configuration
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'users'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                User Management
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'analytics'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Analytics
              </button>
            </nav>
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
              </div>
            ) : (
              <>
                {/* Configuration Tab */}
                {activeTab === 'config' && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Basic Configuration */}
                      <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-gray-900">Basic Rewards Settings</h3>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Points per Dollar Spent
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              min="0.1"
                              max="10"
                              step="0.1"
                              value={rewardsConfig.pointsPerDollarSpent}
                              onChange={(e) => setRewardsConfig(prev => ({
                                ...prev,
                                pointsPerDollarSpent: parseFloat(e.target.value) || 0
                              }))}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                            <span className="text-sm text-gray-600">points per $1</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">How many points users earn for each dollar spent</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Point Value in USD
                          </label>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-600">$</span>
                            <input
                              type="number"
                              min="0.001"
                              max="1"
                              step="0.001"
                              value={rewardsConfig.pointValueInUSD}
                              onChange={(e) => setRewardsConfig(prev => ({
                                ...prev,
                                pointValueInUSD: parseFloat(e.target.value) || 0
                              }))}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                            <span className="text-sm text-gray-600">per point</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">How much each point is worth when redeemed</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Minimum Redemption Points
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={rewardsConfig.minimumRedemptionPoints}
                            onChange={(e) => setRewardsConfig(prev => ({
                              ...prev,
                              minimumRedemptionPoints: parseInt(e.target.value) || 0
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                          <p className="text-xs text-gray-500 mt-1">Minimum points required for redemption</p>
                        </div>
                      </div>

                      {/* Advanced Configuration */}
                      <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-gray-900">Advanced Settings</h3>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Refund Points Percentage
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={rewardsConfig.refundPointsPercentage}
                              onChange={(e) => setRewardsConfig(prev => ({
                                ...prev,
                                refundPointsPercentage: parseInt(e.target.value) || 0
                              }))}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                            <span className="text-sm text-gray-600">%</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Percentage of points returned on refunds</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Bonus Points Multiplier
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              min="1"
                              max="5"
                              step="0.1"
                              value={rewardsConfig.bonusPointsMultiplier}
                              onChange={(e) => setRewardsConfig(prev => ({
                                ...prev,
                                bonusPointsMultiplier: parseFloat(e.target.value) || 1
                              }))}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                            <span className="text-sm text-gray-600">x</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Multiplier for special promotions and bonus events</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Welcome Bonus Points
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={rewardsConfig.welcomeBonusPoints}
                            onChange={(e) => setRewardsConfig(prev => ({
                              ...prev,
                              welcomeBonusPoints: parseInt(e.target.value) || 0
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                          <p className="text-xs text-gray-500 mt-1">Points given to new users when they sign up</p>
                        </div>
                      </div>
                    </div>

                    {/* Configuration Summary */}
                    <div className="bg-gray-50 rounded-lg p-6">
                      <h4 className="font-medium text-gray-900 mb-4">Configuration Summary</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Earning Rate:</span>
                          <p>{rewardsConfig.pointsPerDollarSpent} points per $1 spent</p>
                        </div>
                        <div>
                          <span className="font-medium">Point Value:</span>
                          <p>${rewardsConfig.pointValueInUSD} per point</p>
                        </div>
                        <div>
                          <span className="font-medium">Min Redemption:</span>
                          <p>{rewardsConfig.minimumRedemptionPoints} points (${(rewardsConfig.minimumRedemptionPoints * rewardsConfig.pointValueInUSD).toFixed(2)})</p>
                        </div>
                      </div>
                      
                      {rewardsConfig.lastUpdated && (
                        <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                          Last updated: {rewardsConfig.lastUpdated.toLocaleString()} by {rewardsConfig.updatedBy}
                        </div>
                      )}
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end">
                      <button
                        onClick={saveRewardsConfig}
                        disabled={saving}
                        className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
                      >
                        {saving ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span>Save Configuration</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* User Management Tab */}
                {activeTab === 'users' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-gray-900">User Rewards Management</h3>
                      <button
                        onClick={fetchUsersRewardsData}
                        className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        Refresh Data
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Points</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Earned</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Redeemed</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Spent</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {usersRewardsData.map((userData) => (
                            <tr key={userData.uid} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {userData.displayName || userData.email}
                                  </div>
                                  <div className="text-sm text-gray-500">{userData.email}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{userData.totalPoints}</div>
                                <div className="text-sm text-gray-500">
                                  ${(userData.totalPoints * rewardsConfig.pointValueInUSD).toFixed(2)} value
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {userData.totalEarned}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {userData.totalRedeemed}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                ${userData.totalSpent.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => {
                                      const adjustment = prompt('Enter point adjustment (positive to add, negative to subtract):');
                                      const reason = prompt('Enter reason for adjustment:');
                                      if (adjustment && reason) {
                                        adjustUserPoints(userData.uid, parseInt(adjustment), reason);
                                      }
                                    }}
                                    className="text-orange-600 hover:text-orange-900"
                                  >
                                    Adjust Points
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Analytics Tab */}
                {activeTab === 'analytics' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-gray-900">Rewards Analytics</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                        <h4 className="text-lg font-semibold mb-2">Total Points Issued</h4>
                        <p className="text-3xl font-bold">{totalPointsIssued.toLocaleString()}</p>
                        <p className="text-sm opacity-80">${(totalPointsIssued * rewardsConfig.pointValueInUSD).toFixed(2)} value</p>
                      </div>
                      
                      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
                        <h4 className="text-lg font-semibold mb-2">Active Points</h4>
                        <p className="text-3xl font-bold">{totalActivePoints.toLocaleString()}</p>
                        <p className="text-sm opacity-80">${totalValueInUSD.toFixed(2)} liability</p>
                      </div>
                      
                      <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white">
                        <h4 className="text-lg font-semibold mb-2">Points Redeemed</h4>
                        <p className="text-3xl font-bold">{totalPointsRedeemed.toLocaleString()}</p>
                        <p className="text-sm opacity-80">
                          {totalPointsIssued > 0 ? ((totalPointsRedeemed / totalPointsIssued) * 100).toFixed(1) : 0}% redemption rate
                        </p>
                      </div>
                      
                      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 text-white">
                        <h4 className="text-lg font-semibold mb-2">Active Users</h4>
                        <p className="text-3xl font-bold">{usersRewardsData.length}</p>
                        <p className="text-sm opacity-80">With rewards points</p>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-6">
                      <h4 className="font-medium text-gray-900 mb-4">System Health</h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span>Average points per user:</span>
                          <span className="font-medium">
                            {usersRewardsData.length > 0 ? (totalActivePoints / usersRewardsData.length).toFixed(0) : 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Current point value setting:</span>
                          <span className="font-medium">${rewardsConfig.pointValueInUSD}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Earning rate:</span>
                          <span className="font-medium">{rewardsConfig.pointsPerDollarSpent} points per $1</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Effective reward rate:</span>
                          <span className="font-medium">
                            {(rewardsConfig.pointsPerDollarSpent * rewardsConfig.pointValueInUSD * 100).toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <NotificationModal
        isOpen={showNotification}
        onClose={() => setShowNotification(false)}
        title={notificationData.title}
        message={notificationData.message}
        type={notificationData.type}
      />
    </>
  );
};

export default RewardsPointsDashboard; 