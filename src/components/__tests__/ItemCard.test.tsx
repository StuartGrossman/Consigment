import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemCard from '../ItemCard';
import { ConsignmentItem } from '../../types';

// Mock the useCart hook
vi.mock('../../hooks/useCart', () => ({
  useCart: () => ({
    addItem: vi.fn(),
    bookmarks: [],
    toggleBookmark: vi.fn(),
  }),
}));

// Mock the useAuth hook
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user' },
    isAuthenticated: true,
  }),
}));

describe('ItemCard', () => {
  const mockItem: ConsignmentItem = {
    id: 'test-item-1',
    title: 'Test Item',
    description: 'A test item description',
    price: 29.99,
    images: ['https://example.com/image1.jpg'],
    sellerId: 'seller-1',
    sellerName: 'Test Seller',
    sellerEmail: 'seller@test.com',
    status: 'live',
    createdAt: new Date('2024-01-01'),
    category: 'Clothing',
    gender: 'Unisex',
    size: 'M',
    brand: 'Test Brand',
    condition: 'Like New',
    color: 'Blue',
  };

  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders item information correctly', () => {
    render(<ItemCard item={mockItem} onClick={mockOnClick} />);
    
    expect(screen.getByText('Test Item')).toBeInTheDocument();
    expect(screen.getByText('$29.99')).toBeInTheDocument();
    expect(screen.getByText('Test Brand')).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('Like New')).toBeInTheDocument();
  });

  it('displays the first image', () => {
    render(<ItemCard item={mockItem} onClick={mockOnClick} />);
    
    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', 'https://example.com/image1.jpg');
    expect(image).toHaveAttribute('alt', 'Test Item');
  });

  it('calls onClick when card is clicked', () => {
    render(<ItemCard item={mockItem} onClick={mockOnClick} />);
    
    const card = screen.getByTestId('item-card') || screen.getByText('Test Item').closest('div');
    fireEvent.click(card!);
    
    expect(mockOnClick).toHaveBeenCalledWith(mockItem);
  });

  it('shows sold status when item is sold', () => {
    const soldItem = { ...mockItem, status: 'sold' as const };
    render(<ItemCard item={soldItem} onClick={mockOnClick} />);
    
    expect(screen.getByText(/sold/i)).toBeInTheDocument();
  });

  it('shows pending status when item is pending', () => {
    const pendingItem = { ...mockItem, status: 'pending' as const };
    render(<ItemCard item={pendingItem} onClick={mockOnClick} />);
    
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it('handles missing optional fields gracefully', () => {
    const minimalItem: ConsignmentItem = {
      id: 'minimal-item',
      title: 'Minimal Item',
      description: 'Minimal description',
      price: 10.00,
      images: [],
      sellerId: 'seller-1',
      sellerName: 'Test Seller',
      sellerEmail: 'seller@test.com',
      status: 'live',
      createdAt: new Date(),
    };

    expect(() => render(<ItemCard item={minimalItem} onClick={mockOnClick} />)).not.toThrow();
    expect(screen.getByText('Minimal Item')).toBeInTheDocument();
  });
}); 