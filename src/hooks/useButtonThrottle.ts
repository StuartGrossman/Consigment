import { useState, useCallback, useRef } from 'react';

interface ThrottleOptions {
  delay?: number; // Default delay in milliseconds
  preventDoubleClick?: boolean; // Prevent same action twice in a row
  resetOnSuccess?: boolean; // Reset state when action completes successfully
}

interface ThrottleState {
  isThrottled: boolean;
  lastAction: string | null;
  isProcessing: boolean;
}

export const useButtonThrottle = (options: ThrottleOptions = {}) => {
  const {
    delay = 2000, // Default 2 seconds
    preventDoubleClick = true,
    resetOnSuccess = true
  } = options;

  const [state, setState] = useState<ThrottleState>({
    isThrottled: false,
    lastAction: null,
    isProcessing: false
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processingActionsRef = useRef<Set<string>>(new Set());

  const throttledAction = useCallback(
    async <T>(
      actionId: string,
      action: () => Promise<T> | T,
      options?: { 
        customDelay?: number;
        allowSameAction?: boolean;
      }
    ): Promise<T | null> => {
      const actionDelay = options?.customDelay ?? delay;
      const allowSameAction = options?.allowSameAction ?? false;

      // Check if this specific action is already processing
      if (processingActionsRef.current.has(actionId)) {
        console.log(`Action "${actionId}" is already processing, ignoring duplicate`);
        return null;
      }

      // Check if we should prevent the same action twice in a row
      if (preventDoubleClick && !allowSameAction && state.lastAction === actionId) {
        console.log(`Preventing duplicate action: "${actionId}"`);
        return null;
      }

      // Check if we're in a throttled state
      if (state.isThrottled) {
        console.log(`Actions are throttled, ignoring: "${actionId}"`);
        return null;
      }

      try {
        // Mark this action as processing
        processingActionsRef.current.add(actionId);
        
        // Update state to show processing and throttled
        setState(prev => ({
          ...prev,
          isThrottled: true,
          lastAction: actionId,
          isProcessing: true
        }));

        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Execute the action
        const result = await action();

        // If successful and resetOnSuccess is true, reset the last action
        if (resetOnSuccess) {
          setState(prev => ({
            ...prev,
            lastAction: null,
            isProcessing: false
          }));
        } else {
          setState(prev => ({
            ...prev,
            isProcessing: false
          }));
        }

        // Set throttle timeout
        timeoutRef.current = setTimeout(() => {
          setState(prev => ({
            ...prev,
            isThrottled: false
          }));
        }, actionDelay);

        return result;
      } catch (error) {
        // On error, reset processing state but keep throttle
        setState(prev => ({
          ...prev,
          isProcessing: false
        }));

        // Still apply throttle delay even on error
        timeoutRef.current = setTimeout(() => {
          setState(prev => ({
            ...prev,
            isThrottled: false
          }));
        }, actionDelay);

        throw error;
      } finally {
        // Remove from processing set
        processingActionsRef.current.delete(actionId);
      }
    },
    [delay, preventDoubleClick, resetOnSuccess, state.isThrottled, state.lastAction]
  );

  const isActionDisabled = useCallback((actionId: string) => {
    return (
      state.isThrottled || 
      processingActionsRef.current.has(actionId) ||
      (preventDoubleClick && state.lastAction === actionId)
    );
  }, [state.isThrottled, state.lastAction, preventDoubleClick]);

  const isActionProcessing = useCallback((actionId: string) => {
    return processingActionsRef.current.has(actionId);
  }, []);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    processingActionsRef.current.clear();
    setState({
      isThrottled: false,
      lastAction: null,
      isProcessing: false
    });
  }, []);

  const forceEnable = useCallback((actionId?: string) => {
    if (actionId) {
      processingActionsRef.current.delete(actionId);
    }
    setState(prev => ({
      ...prev,
      isThrottled: false,
      isProcessing: false,
      lastAction: actionId ? null : prev.lastAction
    }));
  }, []);

  return {
    throttledAction,
    isActionDisabled,
    isActionProcessing,
    isThrottled: state.isThrottled,
    isProcessing: state.isProcessing,
    lastAction: state.lastAction,
    reset,
    forceEnable
  };
};

// Specialized hooks for different use cases
export const useCriticalActionThrottle = () => {
  return useButtonThrottle({
    delay: 3000, // 3 seconds for critical actions
    preventDoubleClick: true,
    resetOnSuccess: true
  });
};

export const useAPIThrottle = () => {
  return useButtonThrottle({
    delay: 1000, // 1 second for API calls
    preventDoubleClick: false, // Allow same API call again
    resetOnSuccess: false
  });
};

export const useFormSubmitThrottle = () => {
  return useButtonThrottle({
    delay: 2000, // 2 seconds for form submissions
    preventDoubleClick: true,
    resetOnSuccess: true
  });
}; 