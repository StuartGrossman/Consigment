import { useState, useRef, useCallback, useEffect } from 'react';
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
}

interface RateLimitState {
  isBlocked: boolean;
  remainingAttempts: number;
  resetTime: number;
  blockedUntil?: number;
}

// User-safe rate limit configurations (more lenient for regular users)
const USER_RATE_CONFIGS: Record<string, RateLimitConfig> = {
  // Authentication actions
  login: { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 30 * 60 * 1000, action: 'login' },
  
  // Purchase actions (more lenient for users)
  purchase: { maxAttempts: 5, windowMs: 10 * 60 * 1000, blockDurationMs: 5 * 60 * 1000, action: 'purchase' },
  checkout: { maxAttempts: 10, windowMs: 15 * 60 * 1000, blockDurationMs: 5 * 60 * 1000, action: 'checkout' },
  
  // Item actions
  item_create: { maxAttempts: 15, windowMs: 60 * 60 * 1000, blockDurationMs: 10 * 60 * 1000, action: 'item_create' },
  
  // Cart actions (very lenient)
  cart_action: { maxAttempts: 100, windowMs: 60 * 60 * 1000, blockDurationMs: 5 * 60 * 1000, action: 'cart_action' },
  bookmark_action: { maxAttempts: 100, windowMs: 60 * 60 * 1000, blockDurationMs: 5 * 60 * 1000, action: 'bookmark_action' },
  
  // Search and browse actions (very lenient)
  search: { maxAttempts: 200, windowMs: 60 * 60 * 1000, blockDurationMs: 2 * 60 * 1000, action: 'search' },
  browse: { maxAttempts: 500, windowMs: 60 * 60 * 1000, blockDurationMs: 1 * 60 * 1000, action: 'browse' },
  
  // Default for unknown actions
  default: { maxAttempts: 50, windowMs: 60 * 60 * 1000, blockDurationMs: 5 * 60 * 1000, action: 'default' }
};

export const useUserRateLimiter = () => {
  const { user } = useAuth();
  const [rateLimitStates, setRateLimitStates] = useState<Record<string, RateLimitState>>({});
  const attemptHistory = useRef<Record<string, RateLimitEntry[]>>({});

  // User-safe rate limit check (no ban checking)
  const checkRateLimit = useCallback(async (action: string, customConfig?: Partial<RateLimitConfig>): Promise<RateLimitState> => {
    const config = { ...USER_RATE_CONFIGS[action] || USER_RATE_CONFIGS.default, ...customConfig };
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Create unique key for this action/user combination
    const key = `${action}_${user?.uid || 'anonymous'}`;
    
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
  }, [user?.uid, rateLimitStates]);

  // Record an attempt
  const recordAttempt = useCallback(async (action: string): Promise<RateLimitState> => {
    const now = Date.now();
    
    // Create unique key for this action/user combination
    const key = `${action}_${user?.uid || 'anonymous'}`;
    
    // Add new attempt
    const newEntry: RateLimitEntry = {
      timestamp: now,
      action,
      userId: user?.uid
    };

    if (!attemptHistory.current[key]) {
      attemptHistory.current[key] = [];
    }
    
    attemptHistory.current[key].push(newEntry);

    // Check rate limit after recording
    return await checkRateLimit(action);
  }, [user?.uid, checkRateLimit]);

  // Execute action with user-safe rate limiting
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
          error: `Please wait ${minutes} minutes before trying again.`,
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
    const key = `${action}_${user?.uid || 'anonymous'}`;
    return rateLimitStates[key] || null;
  }, [user?.uid, rateLimitStates]);

  // Reset rate limit for an action
  const resetRateLimit = useCallback((action: string) => {
    const key = `${action}_${user?.uid || 'anonymous'}`;
    
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

  return {
    executeWithRateLimit,
    checkRateLimit,
    getRateLimitStatus,
    resetRateLimit
  };
};

export default useUserRateLimiter; 