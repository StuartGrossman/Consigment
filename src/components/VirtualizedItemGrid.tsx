import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ConsignmentItem } from '../types';
import ItemCard from './ItemCard';

interface VirtualizedItemGridProps {
  items: ConsignmentItem[];
  isAdmin?: boolean;
  onItemClick?: (item: ConsignmentItem) => void;
  itemHeight?: number;
  itemWidth?: number;
  gap?: number;
  overscan?: number;
}

const VirtualizedItemGrid: React.FC<VirtualizedItemGridProps> = ({
  items,
  isAdmin = false,
  onItemClick,
  itemHeight = 400,
  itemWidth = 300,
  gap = 16,
  overscan = 5
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  // Calculate grid dimensions
  const { columns, rows, visibleItems } = useMemo(() => {
    if (containerSize.width === 0) return { columns: 0, rows: 0, visibleItems: [] };

    const availableWidth = containerSize.width - gap;
    const cols = Math.floor(availableWidth / (itemWidth + gap));
    const totalRows = Math.ceil(items.length / cols);
    
    // Calculate visible range
    const visibleHeight = containerSize.height;
    const rowHeight = itemHeight + gap;
    
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endRow = Math.min(totalRows, Math.ceil((scrollTop + visibleHeight) / rowHeight) + overscan);
    
    const startIndex = startRow * cols;
    const endIndex = Math.min(items.length, endRow * cols);
    
    const visible = items.slice(startIndex, endIndex).map((item, index) => {
      const absoluteIndex = startIndex + index;
      const row = Math.floor(absoluteIndex / cols);
      const col = absoluteIndex % cols;
      
      return {
        item,
        index: absoluteIndex,
        x: col * (itemWidth + gap) + gap,
        y: row * (itemHeight + gap) + gap
      };
    });

    return {
      columns: cols,
      rows: totalRows,
      visibleItems: visible
    };
  }, [items, containerSize, scrollTop, itemWidth, itemHeight, gap, overscan]);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initial size calculation
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    }
  }, []);

  const totalHeight = rows * (itemHeight + gap) + gap;

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto"
      onScroll={handleScroll}
      style={{ contain: 'layout style paint' }}
    >
      <div
        className="relative"
        style={{ height: totalHeight }}
      >
        {visibleItems.map(({ item, index, x, y }) => (
          <div
            key={item.id}
            className="absolute"
            style={{
              left: x,
              top: y,
              width: itemWidth,
              height: itemHeight,
              contain: 'layout style paint'
            }}
          >
            <ItemCard
              item={item}
              isAdmin={isAdmin}
              onClick={onItemClick}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default VirtualizedItemGrid; 