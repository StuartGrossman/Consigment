import { useState, useCallback, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem } from '../types';
import { User } from 'firebase/auth';

export interface NotificationCounts {
  pending: number;
  approved: number;
  sold: number;
}

export interface NotificationManagement {
  notificationCounts: NotificationCounts;
  recentItems: ConsignmentItem[];
  notificationsClearedAt: Date | null;
  
  // Actions
  fetchNotificationCounts: () => Promise<void>;
  fetchRecentItems: () => Promise<void>;
  setNotificationsClearedAt: (date: Date) => void;
  getRecentActivity: (item: ConsignmentItem) => any;
}

export const useNotifications = (
  user: User | null,
  isAdmin: boolean,
  isAuthenticated: boolean
): NotificationManagement => {
  const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>({
    pending: 0,
    approved: 0,
    sold: 0
  });
  const [recentItems, setRecentItems] = useState<ConsignmentItem[]>([]);
  const [notificationsClearedAt, setNotificationsClearedAt] = useState<Date | null>(null);

  const fetchNotificationCounts = useCallback(async () => {
    if (!user) return;
    
    try {
      const itemsRef = collection(db, 'items');
      
      // Get pending items count
      const pendingQuery = query(itemsRef, where('status', '==', 'pending'));
      const pendingSnapshot = await getDocs(pendingQuery);
      
      // Get approved items count
      const approvedQuery = query(itemsRef, where('status', '==', 'approved'));
      const approvedSnapshot = await getDocs(approvedQuery);
      
      // Get all sold items and filter client-side for recent ones
      const soldQuery = query(itemsRef, where('status', '==', 'sold'));
      const soldSnapshot = await getDocs(soldQuery);
      
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let recentSoldCount = 0;
      
      soldSnapshot.forEach((doc) => {
        const data = doc.data();
        const soldAt = data.soldAt?.toDate();
        if (soldAt && soldAt >= oneDayAgo) {
          recentSoldCount++;
        }
      });
      
      const newCounts = {
        pending: pendingSnapshot.size,
        approved: approvedSnapshot.size,
        sold: recentSoldCount
      };
      
      setNotificationCounts(newCounts);
    } catch (error: any) {
      // Silent fallback for permission errors - don't log to console
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        return; // Fail silently for permission issues
      }
      console.error('Error fetching notification counts:', error);
    }
  }, [user]);

  const fetchRecentItems = useCallback(async () => {
    if (!user) return;
    
    try {
      const itemsRef = collection(db, 'items');
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      let fetchedItems: ConsignmentItem[] = [];
      
      if (isAdmin) {
        // For admins: Get all items that have had activity in the last 24 hours
        const q = query(itemsRef);
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const item = { 
            id: doc.id, 
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            approvedAt: data.approvedAt?.toDate(),
            liveAt: data.liveAt?.toDate(),
            soldAt: data.soldAt?.toDate()
          } as ConsignmentItem;
          
          // Check if item has any activity in the last 24 hours
          const hasRecentActivity = 
            (item.createdAt && item.createdAt >= twentyFourHoursAgo) ||
            (item.approvedAt && item.approvedAt >= twentyFourHoursAgo) ||
            (item.liveAt && item.liveAt >= twentyFourHoursAgo) ||
            (item.soldAt && item.soldAt >= twentyFourHoursAgo);
          
          if (hasRecentActivity) {
            fetchedItems.push(item);
          }
        });
        
        // Sort by most recent activity
        fetchedItems.sort((a, b) => {
          const aTime = Math.max(
            a.createdAt?.getTime() || 0,
            a.approvedAt?.getTime() || 0,
            a.liveAt?.getTime() || 0,
            a.soldAt?.getTime() || 0
          );
          const bTime = Math.max(
            b.createdAt?.getTime() || 0,
            b.approvedAt?.getTime() || 0,
            b.liveAt?.getTime() || 0,
            b.soldAt?.getTime() || 0
          );
          return bTime - aTime;
        });
        
      } else {
        // For regular users: Only get their own items that have had activity in the last 24 hours
        const q = query(itemsRef, where('sellerUid', '==', user.uid));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const item = { 
            id: doc.id, 
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            approvedAt: data.approvedAt?.toDate(),
            liveAt: data.liveAt?.toDate(),
            soldAt: data.soldAt?.toDate()
          } as ConsignmentItem;
          
          // Check if the user's item has any activity in the last 24 hours
          const hasRecentActivity = 
            (item.createdAt && item.createdAt >= twentyFourHoursAgo) ||
            (item.approvedAt && item.approvedAt >= twentyFourHoursAgo) ||
            (item.liveAt && item.liveAt >= twentyFourHoursAgo) ||
            (item.soldAt && item.soldAt >= twentyFourHoursAgo);
          
          if (hasRecentActivity) {
            fetchedItems.push(item);
          }
        });
        
        // Sort by most recent activity
        fetchedItems.sort((a, b) => {
          const aTime = Math.max(
            a.createdAt?.getTime() || 0,
            a.approvedAt?.getTime() || 0,
            a.liveAt?.getTime() || 0,
            a.soldAt?.getTime() || 0
          );
          const bTime = Math.max(
            b.createdAt?.getTime() || 0,
            b.approvedAt?.getTime() || 0,
            b.liveAt?.getTime() || 0,
            b.soldAt?.getTime() || 0
          );
          return bTime - aTime;
        });
      }
      
      // Limit to 15 most recent items for better coverage
      const limitedItems = fetchedItems.slice(0, 15);
      setRecentItems(limitedItems);
    } catch (error: any) {
      // Silent fallback for permission errors - don't log to console
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        return; // Fail silently for permission issues
      }
      console.error('Error fetching recent items:', error);
    }
  }, [user, isAdmin]);

  const getRecentActivity = (item: ConsignmentItem) => {
    const activities = [];
    
    if (item.createdAt) activities.push({ type: 'created', time: item.createdAt, icon: '📝', message: 'Item created', color: 'text-blue-600' });
    if (item.approvedAt) activities.push({ type: 'approved', time: item.approvedAt, icon: '✅', message: 'Item approved', color: 'text-green-600' });
    if (item.liveAt) activities.push({ type: 'live', time: item.liveAt, icon: '🔴', message: 'Went live', color: 'text-orange-600' });
    if (item.soldAt) activities.push({ type: 'sold', time: item.soldAt, icon: '💰', message: 'Item sold', color: 'text-purple-600' });
    
    // Sort by time, most recent first
    activities.sort((a, b) => b.time.getTime() - a.time.getTime());
    
    // Return the most recent activity
    return activities[0] || null;
  };

  // Fetch recent items every 30 seconds
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchRecentItems();
      const interval = setInterval(fetchRecentItems, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user, fetchRecentItems]);

  // Fetch notification counts for admins
  useEffect(() => {
    if (isAdmin && user) {
      fetchNotificationCounts();
      // Set up interval to refresh counts every 30 seconds
      const interval = setInterval(fetchNotificationCounts, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, user, fetchNotificationCounts]);

  return {
    notificationCounts,
    recentItems,
    notificationsClearedAt,
    fetchNotificationCounts,
    fetchRecentItems,
    setNotificationsClearedAt,
    getRecentActivity,
  };
}; 