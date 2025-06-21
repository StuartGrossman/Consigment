import { renderHook, act } from '@testing-library/react';
import { useButtonThrottle } from '../useButtonThrottle';

// Mock timers
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useButtonThrottle', () => {
  it('should allow initial action execution', async () => {
    const { result } = renderHook(() => useButtonThrottle());
    const mockAction = vi.fn().mockResolvedValue('success');

    await act(async () => {
      const response = await result.current.throttledAction('test-action', mockAction);
      expect(response).toBe('success');
      expect(mockAction).toHaveBeenCalledTimes(1);
    });
  });

  it('should throttle subsequent actions', async () => {
    const { result } = renderHook(() => useButtonThrottle({ delay: 1000 }));
    const mockAction = vi.fn().mockResolvedValue('success');

    await act(async () => {
      // First action should work
      const response1 = await result.current.throttledAction('test-action', mockAction);
      expect(response1).toBe('success');

      // Second action should be throttled
      const response2 = await result.current.throttledAction('test-action', mockAction);
      expect(response2).toBeNull();
      
      expect(mockAction).toHaveBeenCalledTimes(1);
    });
  });

  it('should prevent duplicate actions when preventDoubleClick is true', async () => {
    const { result } = renderHook(() => useButtonThrottle({ preventDoubleClick: true }));
    const mockAction = vi.fn().mockResolvedValue('success');

    await act(async () => {
      await result.current.throttledAction('test-action', mockAction);
      
      // Fast forward to clear throttle
      vi.advanceTimersByTime(2000);
      
      // Same action should be prevented
      const response = await result.current.throttledAction('test-action', mockAction);
      expect(response).toBeNull();
      
      expect(mockAction).toHaveBeenCalledTimes(1);
    });
  });

  it('should allow different actions simultaneously', async () => {
    const { result } = renderHook(() => useButtonThrottle());
    const mockAction1 = vi.fn().mockResolvedValue('action1');
    const mockAction2 = vi.fn().mockResolvedValue('action2');

    await act(async () => {
      const response1 = await result.current.throttledAction('action-1', mockAction1);
      const response2 = await result.current.throttledAction('action-2', mockAction2);
      
      expect(response1).toBe('action1');
      expect(response2).toBe('action2');
      expect(mockAction1).toHaveBeenCalledTimes(1);
      expect(mockAction2).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle action errors correctly', async () => {
    const { result } = renderHook(() => useButtonThrottle());
    const mockAction = vi.fn().mockRejectedValue(new Error('Action failed'));

    await act(async () => {
      try {
        await result.current.throttledAction('test-action', mockAction);
      } catch (error) {
        expect(error).toEqual(new Error('Action failed'));
      }
      
      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(result.current.isThrottled).toBe(true);
    });
  });

  it('should reset throttle after delay', async () => {
    const { result } = renderHook(() => useButtonThrottle({ delay: 1000 }));
    const mockAction = vi.fn().mockResolvedValue('success');

    await act(async () => {
      await result.current.throttledAction('test-action', mockAction);
      expect(result.current.isThrottled).toBe(true);
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.isThrottled).toBe(false);

    await act(async () => {
      const response = await result.current.throttledAction('test-action-2', mockAction);
      expect(response).toBe('success');
      expect(mockAction).toHaveBeenCalledTimes(2);
    });
  });

  it('should check if action is disabled correctly', async () => {
    const { result } = renderHook(() => useButtonThrottle());
    const mockAction = vi.fn().mockResolvedValue('success');

    expect(result.current.isActionDisabled('test-action')).toBe(false);

    await act(async () => {
      await result.current.throttledAction('test-action', mockAction);
    });

    expect(result.current.isActionDisabled('test-action')).toBe(true);
  });

  it('should check if action is processing correctly', async () => {
    const { result } = renderHook(() => useButtonThrottle());
    const mockAction = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));

    expect(result.current.isActionProcessing('test-action')).toBe(false);

    act(() => {
      result.current.throttledAction('test-action', mockAction);
    });

    expect(result.current.isActionProcessing('test-action')).toBe(true);
  });

  it('should reset all state correctly', async () => {
    const { result } = renderHook(() => useButtonThrottle());
    const mockAction = vi.fn().mockResolvedValue('success');

    await act(async () => {
      await result.current.throttledAction('test-action', mockAction);
    });

    expect(result.current.isThrottled).toBe(true);
    expect(result.current.lastAction).toBe('test-action');

    act(() => {
      result.current.reset();
    });

    expect(result.current.isThrottled).toBe(false);
    expect(result.current.lastAction).toBeNull();
    expect(result.current.isProcessing).toBe(false);
  });

  it('should force enable actions correctly', async () => {
    const { result } = renderHook(() => useButtonThrottle());
    const mockAction = vi.fn().mockResolvedValue('success');

    await act(async () => {
      await result.current.throttledAction('test-action', mockAction);
    });

    expect(result.current.isThrottled).toBe(true);

    act(() => {
      result.current.forceEnable('test-action');
    });

    expect(result.current.isThrottled).toBe(false);
    expect(result.current.lastAction).toBeNull();
  });

  it('should handle custom delay options', async () => {
    const { result } = renderHook(() => useButtonThrottle({ delay: 1000 }));
    const mockAction = vi.fn().mockResolvedValue('success');

    await act(async () => {
      await result.current.throttledAction('test-action', mockAction, { customDelay: 500 });
      expect(result.current.isThrottled).toBe(true);
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.isThrottled).toBe(false);
  });

  it('should allow same action when allowSameAction is true', async () => {
    const { result } = renderHook(() => useButtonThrottle({ preventDoubleClick: true }));
    const mockAction = vi.fn().mockResolvedValue('success');

    await act(async () => {
      await result.current.throttledAction('test-action', mockAction);
      
      vi.advanceTimersByTime(2000);
      
      // Should allow same action with allowSameAction flag
      const response = await result.current.throttledAction('test-action', mockAction, { allowSameAction: true });
      expect(response).toBe('success');
      
      expect(mockAction).toHaveBeenCalledTimes(2);
    });
  });
});

describe('useCriticalActionThrottle', () => {
  it('should use 3 second delay by default', async () => {
    const { useCriticalActionThrottle } = await import('../useButtonThrottle');
    const { result } = renderHook(() => useCriticalActionThrottle());
    const mockAction = vi.fn().mockResolvedValue('success');

    await act(async () => {
      await result.current.throttledAction('critical-action', mockAction);
      expect(result.current.isThrottled).toBe(true);
    });

    act(() => {
      vi.advanceTimersByTime(2999);
    });

    expect(result.current.isThrottled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.isThrottled).toBe(false);
  });
}); 