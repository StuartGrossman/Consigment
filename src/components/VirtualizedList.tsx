import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface VirtualizedListProps<T> {
  items: T[];
  height: number;
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
  onScroll?: (scrollTop: number) => void;
}

export function VirtualizedList<T>({
  items,
  height,
  itemHeight,
  renderItem,
  overscan = 5,
  className = '',
  onScroll
}: VirtualizedListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const start = Math.floor(scrollTop / itemHeight);
    const end = Math.min(
      start + Math.ceil(height / itemHeight) + overscan,
      items.length
    );
    const visibleStart = Math.max(0, start - overscan);
    
    return {
      start: visibleStart,
      end,
      offsetY: visibleStart * itemHeight
    };
  }, [scrollTop, itemHeight, height, overscan, items.length]);

  // Visible items
  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end);
  }, [items, visibleRange.start, visibleRange.end]);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
    onScroll?.(newScrollTop);
  }, [onScroll]);

  // Scroll to item
  const scrollToItem = useCallback((index: number) => {
    if (containerRef.current) {
      const targetScrollTop = index * itemHeight;
      containerRef.current.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });
    }
  }, [itemHeight]);

  // Scroll to top
  const scrollToTop = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height }}
      onScroll={handleScroll}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${visibleRange.offsetY}px)`
          }}
        >
          {visibleItems.map((item, index) => (
            <div
              key={visibleRange.start + index}
              style={{ height: itemHeight }}
            >
              {renderItem(item, visibleRange.start + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Hook for virtualized list with search and filtering
export function useVirtualizedList<T>(
  items: T[],
  searchQuery: string = '',
  filterFn?: (item: T, query: string) => boolean
) {
  const [filteredItems, setFilteredItems] = useState<T[]>(items);
  const [isFiltering, setIsFiltering] = useState(false);

  // Debounced filtering
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setIsFiltering(true);
      
      if (!searchQuery.trim() && !filterFn) {
        setFilteredItems(items);
      } else {
        const filtered = items.filter(item => 
          filterFn ? filterFn(item, searchQuery) : true
        );
        setFilteredItems(filtered);
      }
      
      setIsFiltering(false);
    }, 150); // 150ms debounce

    return () => clearTimeout(timeoutId);
  }, [items, searchQuery, filterFn]);

  return {
    filteredItems,
    isFiltering,
    totalItems: items.length,
    filteredCount: filteredItems.length
  };
} 