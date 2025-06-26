import { useState, useRef, useCallback, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './useAuth';

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
  action: string;
}

interface RateLimitEntry {
  timestamp: number;
  action: string;
  userId?: string;
  ip?: string;
}

interface RateLimitState {
  isBlocked: boolean;
  remainingAttempts: number;
  resetTime: number;
  blockedUntil?: number;
}

// Default rate limit configurations
const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  // Authentication actions
  login: { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 30 * 60 * 1000, action: 'login' },
  register: { maxAttempts: 3, windowMs: 60 * 60 * 1000, blockDurationMs: 60 * 60 * 1000, action: 'register' },
  
  // Item actions
  item_create: { maxAttempts: 10, windowMs: 60 * 60 * 1000, blockDurationMs: 15 * 60 * 1000, action: 'item_create' },
  item_update: { maxAttempts: 20, windowMs: 60 * 60 * 1000, blockDurationMs: 10 * 60 * 1000, action: 'item_update' },
  item_delete: { maxAttempts: 5, windowMs: 60 * 60 * 1000, blockDurationMs: 30 * 60 * 1000, action: 'item_delete' },
  
  // Purchase actions
  purchase: { maxAttempts: 3, windowMs: 5 * 60 * 1000, blockDurationMs: 10 * 60 * 1000, action: 'purchase' },
  checkout: { maxAttempts: 5, windowMs: 10 * 60 * 1000, blockDurationMs: 15 * 60 * 1000, action: 'checkout' },
  
  // Search and browse actions
  search: { maxAttempts: 100, windowMs: 60 * 60 * 1000, blockDurationMs: 5 * 60 * 1000, action: 'search' },
  browse: { maxAttempts: 200, windowMs: 60 * 60 * 1000, blockDurationMs: 2 * 60 * 1000, action: 'browse' },
  
  // Admin actions
  admin_action: { maxAttempts: 50, windowMs: 60 * 60 * 1000, blockDurationMs: 30 * 60 * 1000, action: 'admin_action' },
  bulk_action: { maxAttempts: 10, windowMs: 60 * 60 * 1000, blockDurationMs: 60 * 60 * 1000, action: 'bulk_action' },
  
  // Message actions
  message_send: { maxAttempts: 20, windowMs: 60 * 60 * 1000, blockDurationMs: 30 * 60 * 1000, action: 'message_send' },
  
  // API actions
  api_call: { maxAttempts: 1000, windowMs: 60 * 60 * 1000, blockDurationMs: 5 * 60 * 1000, action: 'api_call' },
  
  // Security-sensitive actions
  password_reset: { maxAttempts: 3, windowMs: 60 * 60 * 1000, blockDurationMs: 60 * 60 * 1000, action: 'password_reset' },
  export_data: { maxAttempts: 5, windowMs: 60 * 60 * 1000, blockDurationMs: 30 * 60 * 1000, action: 'export_data' },
  
  // Default for unknown actions
  default: { maxAttempts: 30, windowMs: 60 * 60 * 1000, blockDurationMs: 15 * 60 * 1000, action: 'default' }
};

export const useRateLimiter = () => {
  const { user } = useAuth();
  const [rateLimitStates, setRateLimitStates] = useState<Record<string, RateLimitState>>({});
  const attemptHistory = useRef<Record<string, RateLimitEntry[]>>({});
  const ipAddress = useRef<string>('');

  // Get user's IP address
  useEffect(() => {
    const getIPAddress = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        ipAddress.current = data.ip;
      } catch (error) {
        console.warn('Failed to get IP address:', error);
        ipAddress.current = 'unknown';
      }
    };

    getIPAddress();
  }, []);

  // Check if IP is banned (admin only - gracefully handle permission errors)
  const checkIPBan = useCallback(async (ip: string): Promise<boolean> => {
    try {
      const bannedIPsQuery = query(
        collection(db, 'banned_ips'),
        where('ip', '==', ip),
        where('active', '==', true),
        where('expiresAt', '>', new Date())
      );
      
      const snapshot = await getDocs(bannedIPsQuery);
      return !snapshot.empty;
    } catch (error: any) {
      // Silent handling for permission errors - regular users can't check bans
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        return false; // Assume not banned if can't check
      }
      console.error('Error checking IP ban:', error);
      return false;
    }
  }, []);

  // Check if user is banned (admin only - gracefully handle permission errors)
  const checkUserBan = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const bannedUsersQuery = query(
        collection(db, 'banned_users'),
        where('userId', '==', userId),
        where('active', '==', true),
        where('expiresAt', '>', new Date())
      );
      
      const snapshot = await getDocs(bannedUsersQuery);
      return !snapshot.empty;
    } catch (error: any) {
      // Silent handling for permission errors - regular users can't check bans
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        return false; // Assume not banned if can't check
      }
      console.error('Error checking user ban:', error);
      return false;
    }
  }, []);

  // Log rate limit violation
  const logViolation = useCallback(async (action: string, config: RateLimitConfig, attempts: number) => {
    try {
      await addDoc(collection(db, 'rate_limit_violations'), {
        action,
        userId: user?.uid || null,
        ip: ipAddress.current,
        attempts,
        maxAttempts: config.maxAttempts,
        timestamp: new Date(),
        userAgent: navigator.userAgent,
        url: window.location.href
      });
    } catch (error) {
      console.error('Error logging rate limit violation:', error);
    }
  }, [user?.uid]);

  // Auto-ban for severe violations
  const checkForAutoBan = useCallback(async (action: string, attempts: number) => {
    const severityThresholds = {
      login: 10, // 10 failed login attempts
      register: 5, // 5 registration attempts
      item_create: 50, // 50 item creation attempts
      purchase: 10, // 10 purchase attempts
      default: 100 // 100 attempts for other actions
    };

    const threshold = severityThresholds[action as keyof typeof severityThresholds] || severityThresholds.default;

    if (attempts >= threshold) {
      try {
        // Ban IP for 24 hours
        await addDoc(collection(db, 'banned_ips'), {
          ip: ipAddress.current,
          reason: `Automatic ban: ${attempts} ${action} attempts`,
          bannedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          active: true,
          autoGenerated: true
        });

        // Ban user if authenticated
        if (user?.uid) {
          await addDoc(collection(db, 'banned_users'), {
            userId: user.uid,
            email: user.email,
            reason: `Automatic ban: ${attempts} ${action} attempts`,
            bannedAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            active: true,
            autoGenerated: true
          });
        }

        console.warn(`Auto-banned IP ${ipAddress.current} and user ${user?.uid} for excessive ${action} attempts`);
      } catch (error) {
        console.error('Error creating auto-ban:', error);
      }
    }
  }, [user?.uid, user?.email]);

  // Check rate limit for an action
  const checkRateLimit = useCallback(async (action: string, customConfig?: Partial<RateLimitConfig>): Promise<RateLimitState> => {
    const config = { ...DEFAULT_CONFIGS[action] || DEFAULT_CONFIGS.default, ...customConfig };
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Check if IP is banned
    if (ipAddress.current && ipAddress.current !== 'unknown') {
      const isIPBanned = await checkIPBan(ipAddress.current);
      if (isIPBanned) {
        return {
          isBlocked: true,
          remainingAttempts: 0,
          resetTime: now + 24 * 60 * 60 * 1000, // 24 hours
          blockedUntil: now + 24 * 60 * 60 * 1000
        };
      }
    }

    // Check if user is banned
    if (user?.uid) {
      const isUserBanned = await checkUserBan(user.uid);
      if (isUserBanned) {
        return {
          isBlocked: true,
          remainingAttempts: 0,
          resetTime: now + 24 * 60 * 60 * 1000, // 24 hours
          blockedUntil: now + 24 * 60 * 60 * 1000
        };
      }
    }

    // Create unique key for this action/user/IP combination
    const key = `${action}_${user?.uid || 'anonymous'}_${ipAddress.current}`;
    
    // Initialize history for this key if it doesn't exist
    if (!attemptHistory.current[key]) {
      attemptHistory.current[key] = [];
    }

    // Remove old entries outside the time window
    attemptHistory.current[key] = attemptHistory.current[key].filter(
      entry => entry.timestamp > windowStart
    );

    // Check current state
    const currentAttempts = attemptHistory.current[key].length;
    const remainingAttempts = Math.max(0, config.maxAttempts - currentAttempts);
    
    // Check if currently blocked
    const currentState = rateLimitStates[key];
    if (currentState?.blockedUntil && now < currentState.blockedUntil) {
      return {
        isBlocked: true,
        remainingAttempts: 0,
        resetTime: currentState.blockedUntil,
        blockedUntil: currentState.blockedUntil
      };
    }

    // Check if limit exceeded
    if (currentAttempts >= config.maxAttempts) {
      const blockedUntil = now + config.blockDurationMs;
      
      // Log violation
      await logViolation(action, config, currentAttempts);
      
      // Check for auto-ban
      await checkForAutoBan(action, currentAttempts);
      
      const newState = {
        isBlocked: true,
        remainingAttempts: 0,
        resetTime: blockedUntil,
        blockedUntil
      };

      setRateLimitStates(prev => ({ ...prev, [key]: newState }));
      return newState;
    }

    // Not blocked
    const newState = {
      isBlocked: false,
      remainingAttempts,
      resetTime: now + config.windowMs
    };

    setRateLimitStates(prev => ({ ...prev, [key]: newState }));
    return newState;
  }, [user?.uid, checkIPBan, checkUserBan, logViolation, checkForAutoBan, rateLimitStates]);

  // Record an attempt
  const recordAttempt = useCallback(async (action: string): Promise<RateLimitState> => {
    const config = DEFAULT_CONFIGS[action] || DEFAULT_CONFIGS.default;
    const now = Date.now();
    
    // Create unique key for this action/user/IP combination
    const key = `${action}_${user?.uid || 'anonymous'}_${ipAddress.current}`;
    
    // Add new attempt
    const newEntry: RateLimitEntry = {
      timestamp: now,
      action,
      userId: user?.uid,
      ip: ipAddress.current
    };

    if (!attemptHistory.current[key]) {
      attemptHistory.current[key] = [];
    }
    
    attemptHistory.current[key].push(newEntry);

    // Check rate limit after recording
    return await checkRateLimit(action);
  }, [user?.uid, checkRateLimit]);

  // Execute action with rate limiting
  const executeWithRateLimit = useCallback(async <T>(
    action: string,
    fn: () => Promise<T>,
    customConfig?: Partial<RateLimitConfig>
  ): Promise<{ success: boolean; data?: T; error?: string; rateLimitState: RateLimitState }> => {
    try {
      // Check rate limit before executing
      const rateLimitState = await checkRateLimit(action, customConfig);
      
      if (rateLimitState.isBlocked) {
        const timeUntilReset = rateLimitState.resetTime - Date.now();
        const minutes = Math.ceil(timeUntilReset / (60 * 1000));
        
        return {
          success: false,
          error: `Action blocked. Too many ${action} attempts. Try again in ${minutes} minutes.`,
          rateLimitState
        };
      }

      // Execute the function
      const data = await fn();
      
      // Record the attempt
      const newRateLimitState = await recordAttempt(action);
      
      return {
        success: true,
        data,
        rateLimitState: newRateLimitState
      };
    } catch (error) {
      // Still record the attempt even if the action failed
      const rateLimitState = await recordAttempt(action);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        rateLimitState
      };
    }
  }, [checkRateLimit, recordAttempt]);

  // Get current rate limit status
  const getRateLimitStatus = useCallback((action: string): RateLimitState | null => {
    const key = `${action}_${user?.uid || 'anonymous'}_${ipAddress.current}`;
    return rateLimitStates[key] || null;
  }, [user?.uid, rateLimitStates]);

  // Reset rate limit for an action (admin function)
  const resetRateLimit = useCallback((action: string) => {
    const key = `${action}_${user?.uid || 'anonymous'}_${ipAddress.current}`;
    
    // Clear attempt history
    if (attemptHistory.current[key]) {
      attemptHistory.current[key] = [];
    }
    
    // Clear state
    setRateLimitStates(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
  }, [user?.uid]);

  // Get all rate limit configs
  const getConfigs = useCallback(() => DEFAULT_CONFIGS, []);

  return {
    checkRateLimit,
    recordAttempt,
    executeWithRateLimit,
    getRateLimitStatus,
    resetRateLimit,
    getConfigs,
    checkIPBan,
    checkUserBan
  };
};

export default useRateLimiter; 